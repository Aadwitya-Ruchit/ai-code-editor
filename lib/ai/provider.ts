import { getAIConfig, AIModelConfig } from "./config";
import { JUNIOR_SYSTEM_PROMPT } from "./prompt";

export interface ChatMessagePayload {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GenerateChatResponseOptions {
  messages: ChatMessagePayload[];
  systemPrompt?: string;
  configOverride?: Partial<AIModelConfig>;
  signal?: AbortSignal;
}

export interface ChatResponseResult {
  content: string;
  model: string;
  tokens?: number;
}

/**
 * Approximate token estimation helper: ~3.5 characters per token.
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Context Management:
 * Trims conversation messages from the oldest while preserving chronological order,
 * respecting maximum message count and token budget.
 */
export function buildContextAwareMessages(
  historyMessages: ChatMessagePayload[],
  systemPrompt: string = JUNIOR_SYSTEM_PROMPT,
  config: AIModelConfig = getAIConfig()
): ChatMessagePayload[] {
  const systemPromptTokens = estimateTokens(systemPrompt);
  // Reserve space for system prompt and expected response
  const reservedTokens = systemPromptTokens + config.maxTokens + 100;
  const availableBudget = Math.max(1000, config.maxContextTokens - reservedTokens);

  let currentTokens = 0;
  const selectedMessages: ChatMessagePayload[] = [];

  // Iterate backwards from the most recent messages
  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msg = historyMessages[i];
    if (!msg || !msg.content) continue;

    // Reject non-whitelisted roles for security
    if (!["user", "assistant"].includes(msg.role)) continue;

    const msgTokens = estimateTokens(msg.content);
    if (selectedMessages.length >= config.maxContextMessages) {
      break;
    }

    if (currentTokens + msgTokens > availableBudget && selectedMessages.length > 0) {
      break;
    }

    selectedMessages.unshift(msg);
    currentTokens += msgTokens;
  }

  // Prepend system prompt
  return [{ role: "system", content: systemPrompt }, ...selectedMessages];
}

/**
 * Clean AI Provider abstraction.
 * Executes chat generation against configured AI backend (AICredits / OpenAI / custom).
 */
export async function generateChatResponse(
  options: GenerateChatResponseOptions
): Promise<ChatResponseResult> {
  const baseConfig = getAIConfig();
  const config: AIModelConfig = { ...baseConfig, ...(options.configOverride || {}) };

  if (!config.apiKey) {
    throw new Error(
      "AI API key is not configured. Please set AI_API_KEY or AICREDITS_API_KEY in the server environment."
    );
  }

  const systemPrompt = options.systemPrompt ?? JUNIOR_SYSTEM_PROMPT;
  const messagesToSend = buildContextAwareMessages(
    options.messages,
    systemPrompt,
    config
  );

  // Setup timeout controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, config.timeoutMs);

  // Link caller signal if provided
  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      timeoutController.abort();
    });
  }

  try {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: messagesToSend,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        stream: false,
      }),
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const upstreamMessage =
        errorBody?.error?.message ||
        `Status ${response.status} ${response.statusText}`;

      if (response.status === 401) {
        throw new Error("AI provider authentication failed. Please check server credentials.");
      } else if (response.status === 429) {
        throw new Error("The AI service is currently rate limited. Please try again shortly.");
      } else if (response.status >= 500) {
        throw new Error("The upstream AI service is temporarily unavailable. Please try again later.");
      }

      throw new Error(`AI generation failed: ${upstreamMessage}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("AI provider returned an empty or invalid response format.");
    }

    return {
      content: content.trim(),
      model: data.model || config.model,
      tokens: data.usage?.total_tokens,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      throw new Error("AI request timed out after " + Math.round(config.timeoutMs / 1000) + "s.");
    }

    // Re-throw handled error messages
    throw error;
  }
}
