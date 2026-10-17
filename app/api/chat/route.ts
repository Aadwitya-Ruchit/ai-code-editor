import { auth } from "@/auth";
import { db } from "@/lib/db";
import { generateChatResponse, ChatMessagePayload } from "@/lib/ai/provider";
import { JUNIOR_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export interface ActiveFileContext {
  filename: string;
  fileExtension: string;
  path?: string;
  content?: string;
  selectedCode?: string;
  selectedRange?: { startLine: number; endLine: number };
}

export interface PlaygroundContext {
  playgroundId?: string;
  playgroundTitle?: string;
  template?: string;
  fileTree?: string[];
  activeFile?: ActiveFileContext;
}

interface ChatRequestBody {
  conversationId?: string;
  message: string;
  history?: Array<{ role: string; content: string }>;
  mode?: "chat" | "review" | "fix" | "optimize";
  playgroundContext?: PlaygroundContext;
}

export function formatPlaygroundContext(ctx: PlaygroundContext): string {
  const parts: string[] = ["<playground_context>"];

  if (ctx.playgroundTitle || ctx.template) {
    parts.push(`Current Project: "${ctx.playgroundTitle || "Playground"}" (${ctx.template || "Standard"} environment)`);
  }

  if (Array.isArray(ctx.fileTree) && ctx.fileTree.length > 0) {
    const truncatedTree = ctx.fileTree.slice(0, 100);
    parts.push(`\nProject File Structure (${ctx.fileTree.length} total files):`);
    parts.push(truncatedTree.map((p) => `- ${p}`).join("\n"));
    if (ctx.fileTree.length > 100) {
      parts.push(`... and ${ctx.fileTree.length - 100} more files`);
    }
  }

  if (ctx.activeFile) {
    const { filename, fileExtension, path, content, selectedCode, selectedRange } = ctx.activeFile;
    const fileLabel = path || (fileExtension ? `${filename}.${fileExtension}` : filename);

    if (selectedCode && selectedCode.trim()) {
      const lineInfo = selectedRange ? ` (Lines ${selectedRange.startLine}-${selectedRange.endLine})` : "";
      const safeSnippet = selectedCode.length > 20000 ? selectedCode.slice(0, 20000) + "\n...[truncated]" : selectedCode;
      parts.push(`\nActive File in Editor: ${fileLabel}`);
      parts.push(`User Selected Code Snippet${lineInfo}:`);
      parts.push(`\`\`\`${fileExtension || ""}\n${safeSnippet}\n\`\`\``);
    } else if (content && content.trim()) {
      const safeContent = content.length > 35000 ? content.slice(0, 35000) + "\n...[truncated]" : content;
      parts.push(`\nActive File in Editor: ${fileLabel}`);
      parts.push(`Full File Content:`);
      parts.push(`\`\`\`${fileExtension || ""}\n${safeContent}\n\`\`\``);
    } else {
      parts.push(`\nActive File in Editor: ${fileLabel} (empty file)`);
    }
  }

  parts.push("</playground_context>");
  return parts.join("\n");
}

/**
 * Generate a clean, sensible conversation title from the first message
 * without unnecessary LLM calls.
 */
function generateSensibleTitle(message: string): string {
  const clean = message
    .replace(/[#*`_~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split("\n")[0]
    .trim();

  if (!clean) return "New Conversation";
  return clean.length > 50 ? `${clean.slice(0, 50).trim()}...` : clean;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the user on the server
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to use the AI assistant." },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Apply per-user rate limit: 25 requests per 60 seconds
    const rateLimit = await checkRateLimit({
      key: `chat:${userId}`,
      limit: 25,
      windowSeconds: 60,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Please wait ${rateLimit.reset}s before sending another message.`,
          retryAfter: rateLimit.reset,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.reset),
          },
        }
      );
    }

    // 2. Parse and validate incoming payload
    let body: ChatRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const { message, conversationId, playgroundContext } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    const trimmedMessage = message.trim();

    if (trimmedMessage.length > 12000) {
      return NextResponse.json(
        { error: "Message exceeds maximum allowed length of 12,000 characters." },
        { status: 400 }
      );
    }

    // 3. Resolve or create the conversation with ownership enforcement
    let conversation;
    let isNewConversation = false;

    if (conversationId && typeof conversationId === "string") {
      conversation = await db.conversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
      });

      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found or access denied." },
          { status: 404 }
        );
      }
    } else {
      // Create new conversation
      isNewConversation = true;
      const rawTitle = generateSensibleTitle(trimmedMessage);
      const title = playgroundContext?.playgroundTitle
        ? `[${playgroundContext.playgroundTitle.slice(0, 20)}] ${rawTitle}`.slice(0, 60)
        : rawTitle;

      conversation = await db.conversation.create({
        data: {
          userId,
          title,
        },
      });
    }

    // 4. Retrieve chronological message history for this conversation
    const storedHistory = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        content: true,
      },
    });

    // 5. Save the user's message to MongoDB
    const savedUserMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: trimmedMessage,
      },
    });

    // 6. Assemble context messages
    const messagesPayload: ChatMessagePayload[] = [
      ...storedHistory.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: trimmedMessage },
    ];

    // Build context-aware system prompt
    const systemPromptWithContext = playgroundContext
      ? `${JUNIOR_SYSTEM_PROMPT}\n\n${formatPlaygroundContext(playgroundContext)}`
      : JUNIOR_SYSTEM_PROMPT;

    // 7. Generate assistant response using centralized AI provider abstraction
    const aiResult = await generateChatResponse({
      messages: messagesPayload,
      systemPrompt: systemPromptWithContext,
      signal: req.signal,
    });

    // 8. Persist the assistant response to MongoDB before returning
    const savedAssistantMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: aiResult.content,
        tokens: aiResult.tokens,
        model: aiResult.model,
      },
    });

    // 9. Update conversation's updatedAt timestamp
    await db.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // 10. Return response
    return NextResponse.json({
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      isNewConversation,
      response: aiResult.content,
      model: aiResult.model,
      tokens: aiResult.tokens,
      userMessage: {
        id: savedUserMessage.id,
        role: savedUserMessage.role,
        content: savedUserMessage.content,
        createdAt: savedUserMessage.createdAt,
      },
      assistantMessage: {
        id: savedAssistantMessage.id,
        role: savedAssistantMessage.role,
        content: savedAssistantMessage.content,
        tokens: savedAssistantMessage.tokens,
        model: savedAssistantMessage.model,
        createdAt: savedAssistantMessage.createdAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Chat API route error:", error?.message || error);

    const errorMessage =
      error instanceof Error && !error.message.includes("AICREDITS_API_KEY")
        ? error.message
        : "Failed to generate AI response. Please try again.";

    return NextResponse.json(
      {
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}