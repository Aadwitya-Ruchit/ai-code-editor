"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  Send,
  User,
  Copy,
  Check,
  X,
  Code,
  Sparkles,
  MessageSquare,
  RefreshCw,
  Zap,
  Brain,
  Search,
  Filter,
  Download,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  AlertCircle,
  FileText,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import "katex/dist/katex.min.css";
import Image from "next/image";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { findFilePath } from "@/modules/playground/lib";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";

function extractAllFilePaths(folder: TemplateFolder | null, currentPath = ""): string[] {
  if (!folder || !folder.items) return [];
  const paths: string[] = [];
  for (const item of folder.items) {
    if ("folderName" in item) {
      const subPath = currentPath ? `${currentPath}/${item.folderName}` : item.folderName;
      paths.push(...extractAllFilePaths(item as TemplateFolder, subPath));
    } else {
      const fileName = item.fileExtension ? `${item.filename}.${item.fileExtension}` : item.filename;
      const fullPath = currentPath ? `${currentPath}/${fileName}` : fileName;
      paths.push(fullPath);
    }
  }
  return paths;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string | Date;
  tokens?: number;
  model?: string;
  type?: "chat" | "code_review" | "suggestion" | "error_fix" | "optimization";
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
  };
}

interface AIChatSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatRelativeTime(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const MessageTypeIndicator: React.FC<{
  type?: string;
  model?: string;
  tokens?: number;
}> = ({ type, model, tokens }) => {
  const getTypeConfig = (t?: string) => {
    switch (t) {
      case "code_review":
        return { icon: Code, color: "text-blue-400", label: "Code Review" };
      case "suggestion":
        return { icon: Sparkles, color: "text-purple-400", label: "Suggestion" };
      case "error_fix":
        return { icon: RefreshCw, color: "text-red-400", label: "Error Fix" };
      case "optimization":
        return { icon: Zap, color: "text-yellow-400", label: "Optimization" };
      default:
        return { icon: MessageSquare, color: "text-zinc-400", label: "Junior" };
    }
  };

  const config = getTypeConfig(type);
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", config.color)} />
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {tokens ? <span>{tokens} tokens</span> : null}
      </div>
    </div>
  );
};

export const AIChatSidePanel: React.FC<AIChatSidePanelProps> = ({
  isOpen,
  onClose,
}) => {
  // Playground state from useFileExplorer store
  const {
    playgroundId,
    playgroundTitle,
    playgroundTemplate,
    templateData,
    openFiles,
    activeFileId,
    selectedCode,
    selectedRange,
  } = useFileExplorer();

  const activeFile = openFiles.find((f) => f.id === activeFileId);
  const [attachContext, setAttachContext] = useState<boolean>(true);

  // Conversations and Messages state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationTitle, setActiveConversationTitle] = useState<string>("New Chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Loading and error states
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI state
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<"chat" | "review" | "fix" | "optimize">("chat");
  const [searchTerm, setSearchTerm] = useState("");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showSidebar, setShowSidebar] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [messages, isSending]);

  // Load conversations list
  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      } else if (res.status === 401) {
        // User not authenticated
        setConversations([]);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  // Fetch conversations when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, fetchConversations]);

  // Load messages for a selected conversation
  const loadConversation = async (conversationId: string) => {
    if (activeConversationId === conversationId && messages.length > 0) return;

    setActiveConversationId(conversationId);
    setIsLoadingMessages(true);
    setErrorMessage(null);

    const conv = conversations.find((c) => c.id === conversationId);
    if (conv) {
      setActiveConversationTitle(conv.title);
    }

    try {
      const res = await fetch(`/api/conversations/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedMessages: ChatMessage[] = (data.conversation?.messages || []).map(
          (m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
            tokens: m.tokens,
            model: m.model,
          })
        );
        setMessages(loadedMessages);
        if (data.conversation?.title) {
          setActiveConversationTitle(data.conversation.title);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || "Failed to load conversation messages.");
      }
    } catch (err) {
      console.error("Error loading conversation:", err);
      setErrorMessage("Network error while loading conversation.");
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Start a new chat
  const handleNewChat = () => {
    setActiveConversationId(null);
    setActiveConversationTitle("New Chat");
    setMessages([]);
    setErrorMessage(null);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Delete a conversation
  const handleDeleteConversation = async (
    e: React.MouseEvent,
    conversationId: string
  ) => {
    e.stopPropagation();

    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        toast.success("Conversation deleted");

        if (activeConversationId === conversationId) {
          handleNewChat();
        }
      } else {
        toast.error("Failed to delete conversation");
      }
    } catch (err) {
      console.error("Delete conversation error:", err);
      toast.error("Network error while deleting conversation");
    }
  };

  const getChatModePrompt = (mode: string, content: string) => {
    switch (mode) {
      case "review":
        return `Please review this code and provide detailed suggestions for improvement, including performance, security, and best practices:\n\n**Request:** ${content}`;
      case "fix":
        return `Please help fix issues in this code, including bugs, errors, and potential problems:\n\n**Problem:** ${content}`;
      case "optimize":
        return `Please analyze this code for performance optimizations and suggest improvements:\n\n**Code to optimize:** ${content}`;
      default:
        return content;
    }
  };

  // Handle sending a message
  const handleSendMessage = async (
    e?: React.FormEvent,
    overridePrompt?: string,
    overrideMode?: "chat" | "review" | "fix" | "optimize"
  ) => {
    if (e) e.preventDefault();
    const effectiveInput = (overridePrompt ?? input).trim();
    if (!effectiveInput || isSending) return;

    const currentMode = overrideMode || chatMode;
    setErrorMessage(null);

    const messageType =
      currentMode === "chat"
        ? "chat"
        : currentMode === "review"
        ? "code_review"
        : currentMode === "fix"
        ? "error_fix"
        : "optimization";

    const optimisticUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: effectiveInput,
      createdAt: new Date(),
      type: messageType,
    };

    setMessages((prev) => [...prev, optimisticUserMessage]);
    if (!overridePrompt) {
      setInput("");
    }
    setIsSending(true);

    try {
      const contextualMessage = getChatModePrompt(currentMode, effectiveInput);

      // Assemble playground context if connected and enabled
      let playgroundContextPayload: any = undefined;
      if (attachContext && (playgroundId || activeFile || templateData)) {
        const fileTree = templateData ? extractAllFilePaths(templateData) : [];
        const activeFilePath =
          activeFile && templateData
            ? findFilePath(activeFile, templateData) || `${activeFile.filename}.${activeFile.fileExtension}`
            : activeFile
            ? `${activeFile.filename}.${activeFile.fileExtension}`
            : undefined;

        playgroundContextPayload = {
          playgroundId: playgroundId || undefined,
          playgroundTitle: playgroundTitle || undefined,
          template: playgroundTemplate || undefined,
          fileTree: fileTree.length > 0 ? fileTree : undefined,
          activeFile: activeFile
            ? {
                filename: activeFile.filename,
                fileExtension: activeFile.fileExtension || "",
                path: activeFilePath,
                content: activeFile.content,
                selectedCode: selectedCode || undefined,
                selectedRange: selectedRange || undefined,
              }
            : undefined,
        };
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: activeConversationId || undefined,
          message: contextualMessage,
          mode: currentMode,
          playgroundContext: playgroundContextPayload,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // Update active conversation ID and title if newly created
        if (data.isNewConversation && data.conversationId) {
          setActiveConversationId(data.conversationId);
          setActiveConversationTitle(data.conversationTitle || "New Conversation");

          // Prepend to conversations list
          setConversations((prev) => [
            {
              id: data.conversationId,
              title: data.conversationTitle || "New Conversation",
              createdAt: data.timestamp,
              updatedAt: data.timestamp,
              _count: { messages: 2 },
            },
            ...prev,
          ]);
        } else if (data.conversationId) {
          // Update timestamp of existing conversation
          setConversations((prev) =>
            prev.map((c) =>
              c.id === data.conversationId
                ? {
                    ...c,
                    updatedAt: data.timestamp,
                    _count: { messages: (c._count?.messages || 0) + 2 },
                  }
                : c
            )
          );
        }

        // Replace optimistic user message with confirmed DB message if available
        const confirmedUserMessage: ChatMessage = data.userMessage
          ? {
              id: data.userMessage.id,
              role: "user",
              content: data.userMessage.content,
              createdAt: data.userMessage.createdAt,
              type: messageType,
            }
          : optimisticUserMessage;

        const assistantMessage: ChatMessage = {
          id: data.assistantMessage?.id || `assistant-${Date.now()}`,
          role: "assistant",
          content: data.response,
          createdAt: data.assistantMessage?.createdAt || new Date(),
          tokens: data.tokens,
          model: data.model,
          type: messageType,
        };

        setMessages((prev) => [
          ...prev.slice(0, -1),
          confirmedUserMessage,
          assistantMessage,
        ]);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const userMsg =
          response.status === 401
            ? "Please sign in to chat and save your conversations."
            : errorData.error || "Failed to generate AI response. Please try again.";

        setErrorMessage(userMsg);
        toast.error(userMsg);

        // Append assistant error notification into chat
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ **Error:** ${userMsg}`,
            createdAt: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const networkMsg =
        "Network connection failed. Please check your internet connection and try again.";
      setErrorMessage(networkMsg);
      toast.error(networkMsg);

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Connection Error:** ${networkMsg}`,
          createdAt: new Date(),
        },
      ]);
    } finally {
      setIsSending(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const triggerQuickAction = (
    action: "explain_selection" | "fix_selection" | "explain_file" | "review_file" | "explain_project"
  ) => {
    if (!attachContext) setAttachContext(true);

    switch (action) {
      case "explain_selection":
        if (selectedCode) {
          const linesDesc = selectedRange
            ? ` (lines ${selectedRange.startLine}-${selectedRange.endLine})`
            : "";
          handleSendMessage(
            undefined,
            `Can you explain the selected code${linesDesc} in detail? What does it do, how does it work, and are there any edge cases?`,
            "chat"
          );
        }
        break;
      case "fix_selection":
        if (selectedCode) {
          handleSendMessage(
            undefined,
            `Please analyze this selected code for bugs, errors, potential crashes, or anti-patterns, and provide an optimized fix.`,
            "fix"
          );
        }
        break;
      case "explain_file":
        if (activeFile) {
          handleSendMessage(
            undefined,
            `Can you explain what the file '${activeFile.filename}.${activeFile.fileExtension}' does, how it fits into the project architecture, and its main components/functions?`,
            "chat"
          );
        }
        break;
      case "review_file":
        if (activeFile) {
          handleSendMessage(
            undefined,
            `Please review '${activeFile.filename}.${activeFile.fileExtension}' for code quality, performance optimizations, security, and best practices.`,
            "review"
          );
        }
        break;
      case "explain_project":
        handleSendMessage(
          undefined,
          `Based on the project structure and framework (${playgroundTemplate || "project"}), can you explain the overall architecture and how different files connect?`,
          "chat"
        );
        break;
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const exportChat = () => {
    if (messages.length === 0) {
      toast.info("No messages to export.");
      return;
    }
    const chatData = {
      title: activeConversationTitle,
      conversationId: activeConversationId,
      messages,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${activeConversationTitle.slice(0, 20).replace(/[^a-z0-9]/gi, "_")}-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Chat exported successfully");
  };

  const filteredConversations = conversations.filter((c) => {
    if (!historySearchTerm) return true;
    return c.title.toLowerCase().includes(historySearchTerm.toLowerCase());
  });

  const filteredMessages = messages
    .filter((msg) => {
      if (filterType === "all") return true;
      return msg.type === filterType;
    })
    .filter((msg) => {
      if (!searchTerm) return true;
      return msg.content.toLowerCase().includes(searchTerm.toLowerCase());
    });

  return (
    <TooltipProvider>
      <>
        {/* Backdrop */}
        <div
          className={cn(
            "fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
        />

        {/* Side Panel Drawer */}
        <div
          className={cn(
            "fixed right-0 top-0 h-full w-full max-w-6xl bg-zinc-950 border-l border-zinc-800 z-50 flex overflow-hidden transition-transform duration-300 ease-out shadow-2xl",
            isOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          {/* Conversation History Sidebar */}
          <div
            className={cn(
              "w-72 shrink-0 border-r border-zinc-800 bg-zinc-900/60 flex flex-col transition-all duration-200",
              showSidebar ? "flex" : "hidden sm:flex"
            )}
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-2">
              <Button
                onClick={handleNewChat}
                className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-9"
              >
                <Plus className="h-4 w-4" />
                <span className="font-medium text-sm">New Chat</span>
              </Button>
            </div>

            {/* Conversation Search Filter */}
            <div className="p-3 border-b border-zinc-800/80">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <Input
                  placeholder="Search history..."
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs bg-zinc-800/50 border-zinc-700/60 text-zinc-200 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoadingConversations ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                  <span className="text-xs">Loading history...</span>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-12 px-4 text-zinc-500">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-zinc-600 opacity-60" />
                  <p className="text-xs">
                    {historySearchTerm ? "No matching chats found." : "No previous chats."}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Your conversations will be stored here automatically.
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isActive = activeConversationId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={cn(
                        "group relative flex items-center justify-between p-2.5 rounded-lg text-left cursor-pointer transition-colors border",
                        isActive
                          ? "bg-zinc-800 border-zinc-700 text-zinc-100 shadow-sm"
                          : "border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                      )}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-medium truncate leading-tight">
                          {conv.title || "Untitled Chat"}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {formatRelativeTime(conv.updatedAt || conv.createdAt)}
                        </p>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400 hover:bg-zinc-700/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Delete conversation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between">
              <span>Junior Assistant</span>
              <span className="text-zinc-600">MongoDB Persistent</span>
            </div>
          </div>

          {/* Main Chat Workspace */}
          <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden">
            {/* Main Header */}
            <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
              <div className="flex items-center justify-between p-4 px-6">
                <div className="flex items-center gap-3 min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSidebar(!showSidebar)}
                    className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100 sm:hidden"
                    title={showSidebar ? "Hide history" : "Show history"}
                  >
                    {showSidebar ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </Button>

                  <div className="relative w-9 h-9 border border-zinc-700/80 rounded-full flex justify-center items-center bg-zinc-800/50 shrink-0">
                    <Image
                      src="/logo.svg"
                      alt="Logo"
                      width={24}
                      height={18}
                      className="h-5 w-auto object-contain"
                    />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-zinc-100 truncate">
                      {activeConversationTitle}
                    </h2>
                    <p className="text-xs text-zinc-400">
                      {messages.length} messages
                    </p>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Export</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={exportChat}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Chat JSON
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleNewChat}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Chat
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Mode Tabs and Message Search Filter */}
              <div className="px-6 pb-3 flex flex-wrap items-center justify-between gap-3">
                <Tabs
                  value={chatMode}
                  onValueChange={(value) => setChatMode(value as any)}
                  className="w-auto"
                >
                  <TabsList className="grid grid-cols-4 h-8 bg-zinc-800/80">
                    <TabsTrigger
                      value="chat"
                      className="text-xs px-2.5 py-1 data-[state=active]:bg-zinc-900"
                    >
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Chat
                    </TabsTrigger>
                    <TabsTrigger
                      value="review"
                      className="text-xs px-2.5 py-1 data-[state=active]:bg-zinc-900"
                    >
                      <Code className="h-3 w-3 mr-1" />
                      Review
                    </TabsTrigger>
                    <TabsTrigger
                      value="fix"
                      className="text-xs px-2.5 py-1 data-[state=active]:bg-zinc-900"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Fix
                    </TabsTrigger>
                    <TabsTrigger
                      value="optimize"
                      className="text-xs px-2.5 py-1 data-[state=active]:bg-zinc-900"
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Optimize
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3 w-3 text-zinc-500" />
                    <Input
                      placeholder="Search in chat..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-7 h-8 w-36 sm:w-44 text-xs bg-zinc-800/50 border-zinc-700/50"
                    />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100"
                      >
                        <Filter className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setFilterType("all")}>
                        All Messages
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterType("chat")}>
                        Chat Only
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterType("code_review")}>
                        Code Reviews
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterType("error_fix")}>
                        Error Fixes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilterType("optimization")}>
                        Optimizations
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Connected Playground Context Banner */}
              {playgroundId && (
                <div className="mx-6 mb-3 p-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-300">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-medium text-zinc-200 truncate max-w-[130px]" title={playgroundTitle || "Playground"}>
                      {playgroundTitle || "Playground"}
                    </span>
                    {playgroundTemplate && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 font-mono shrink-0">
                        {playgroundTemplate}
                      </span>
                    )}
                    {activeFile && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-zinc-400 truncate max-w-[140px]" title={`${activeFile.filename}.${activeFile.fileExtension}`}>
                        <FileText className="h-3 w-3 text-blue-400 shrink-0" />
                        <span className="truncate">{activeFile.filename}.{activeFile.fileExtension}</span>
                      </span>
                    )}
                    {selectedCode && selectedRange && (
                      <span className="hidden md:inline-flex items-center gap-1 text-amber-300 text-[11px] bg-amber-950/50 border border-amber-800/60 px-1.5 py-0.5 rounded shrink-0">
                        Lines {selectedRange.startLine}–{selectedRange.endLine}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-400 select-none hover:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={attachContext}
                        onChange={(e) => setAttachContext(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-blue-600 h-3.5 w-3.5 focus:ring-0 cursor-pointer"
                      />
                      <span>Sync code</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Error Notification Banner */}
            {errorMessage && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setErrorMessage(null)}
                  className="h-5 w-5 p-0 text-red-400 hover:text-red-200"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Messages Viewport */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingMessages ? (
                <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  <span className="text-sm">Loading messages...</span>
                </div>
              ) : filteredMessages.length === 0 && !isSending ? (
                <div className="text-center text-zinc-500 py-12">
                  <div className="relative w-14 h-14 border border-zinc-800 rounded-full flex flex-col justify-center items-center mx-auto mb-4 bg-zinc-900/60">
                    <Brain className="h-7 w-7 text-zinc-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-zinc-200">
                    Junior AI Coding Assistant
                  </h3>
                  <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed mb-6">
                    Ask questions, paste snippets for review, or explore optimizations.
                    Your conversation history is securely saved and remembered.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg mx-auto">
                    {[
                      "Review my React component for performance",
                      "Fix TypeScript compilation errors",
                      "Optimize database query performance",
                      "Add comprehensive error handling",
                      "Implement security best practices",
                      "Refactor code for better maintainability",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setInput(suggestion);
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                          }
                        }}
                        className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 rounded-lg text-xs text-zinc-300 transition-colors text-left"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                filteredMessages.map((msg) => (
                  <div key={msg.id} className="space-y-4">
                    <div
                      className={cn(
                        "flex items-start gap-3.5 group",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {msg.role === "assistant" && (
                        <div className="relative w-9 h-9 border border-zinc-800 rounded-full flex justify-center items-center bg-zinc-900 shrink-0 mt-0.5">
                          <Brain className="h-4 w-4 text-blue-400" />
                        </div>
                      )}

                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl shadow-sm",
                          msg.role === "user"
                            ? "bg-blue-600/90 text-white p-4 rounded-br-sm"
                            : "bg-zinc-900/90 backdrop-blur-sm text-zinc-100 p-5 rounded-bl-sm border border-zinc-800/70"
                        )}
                      >
                        {msg.role === "assistant" && (
                          <MessageTypeIndicator
                            type={msg.type}
                            model={msg.model}
                            tokens={msg.tokens}
                          />
                        )}

                        <div className="prose prose-invert prose-sm max-w-none text-zinc-200">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              code({ className, children }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const isInline =
                                  !match && !String(children).includes("\n");
                                if (isInline) {
                                  return (
                                    <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs font-mono text-zinc-200">
                                      {children}
                                    </code>
                                  );
                                }
                                return (
                                  <div className="bg-zinc-950 rounded-lg p-3.5 my-3 border border-zinc-800 text-xs overflow-x-auto font-mono">
                                    <code className={className}>{children}</code>
                                  </div>
                                );
                              },
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>

                        {/* Message actions footer */}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/50 text-[11px] text-zinc-500">
                          <span>
                            {msg.createdAt
                              ? new Date(msg.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
                              title="Copy message"
                            >
                              {copiedMessageId === msg.id ? (
                                <Check className="h-3 w-3 text-green-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setInput(msg.content);
                                if (textareaRef.current) textareaRef.current.focus();
                              }}
                              className="h-6 w-6 p-0 text-zinc-400 hover:text-zinc-200"
                              title="Reuse prompt"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {msg.role === "user" && (
                        <Avatar className="h-8 w-8 border border-zinc-700 bg-zinc-800 shrink-0 mt-0.5">
                          <AvatarFallback className="bg-zinc-700 text-zinc-200 text-xs font-medium">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Generating response indicator */}
              {isSending && (
                <div className="flex items-start gap-3.5 justify-start">
                  <div className="relative w-9 h-9 border border-zinc-800 rounded-full flex justify-center items-center bg-zinc-900 shrink-0 mt-0.5">
                    <Brain className="h-4 w-4 text-blue-400 animate-pulse" />
                  </div>
                  <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/60 p-4 rounded-xl rounded-bl-sm flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    <span className="text-xs text-zinc-300">
                      {chatMode === "review"
                        ? "Analyzing code structure and best practices..."
                        : chatMode === "fix"
                        ? "Diagnosing errors and formulating solutions..."
                        : chatMode === "optimize"
                        ? "Analyzing bottlenecks and performance optimizations..."
                        : "Junior is thinking..."}
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Input Form Footer */}
            <form
              onSubmit={handleSendMessage}
              className="shrink-0 p-4 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur-sm"
            >
              {/* Quick Action Suggestion Pills */}
              {playgroundId && attachContext && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-1.5 scrollbar-none text-[11px]">
                  {selectedCode ? (
                    <>
                      <button
                        type="button"
                        onClick={() => triggerQuickAction("explain_selection")}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-amber-500/40 text-amber-300 shrink-0 transition"
                      >
                        <Sparkles className="h-3 w-3 text-amber-400" />
                        Explain Selection (L{selectedRange?.startLine}–{selectedRange?.endLine})
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerQuickAction("fix_selection")}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-red-500/40 text-red-300 shrink-0 transition"
                      >
                        <RefreshCw className="h-3 w-3 text-red-400" />
                        Fix Selection
                      </button>
                    </>
                  ) : activeFile ? (
                    <>
                      <button
                        type="button"
                        onClick={() => triggerQuickAction("explain_file")}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-purple-500/40 text-purple-300 shrink-0 transition"
                      >
                        <Sparkles className="h-3 w-3 text-purple-400" />
                        Explain {activeFile.filename}.{activeFile.fileExtension}
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerQuickAction("review_file")}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-blue-500/40 text-blue-300 shrink-0 transition"
                      >
                        <Code className="h-3 w-3 text-blue-400" />
                        Review Code
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => triggerQuickAction("explain_project")}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 shrink-0 transition"
                  >
                    <FolderOpen className="h-3 w-3 text-emerald-400" />
                    Explain Project Architecture
                  </button>
                </div>
              )}

              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <Textarea
                    ref={textareaRef}
                    placeholder={
                      chatMode === "chat"
                        ? "Ask a question, request code improvements, or paste code..."
                        : chatMode === "review"
                        ? "Describe what to review in your code..."
                        : chatMode === "fix"
                        ? "Describe the issue or error you're encountering..."
                        : "Describe what you would like to optimize..."
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={isSending}
                    className="min-h-[46px] max-h-36 bg-zinc-800/60 border-zinc-700/60 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-blue-500 resize-none text-sm pr-14"
                    rows={1}
                  />
                  <div className="absolute right-3 bottom-3 flex items-center gap-1.5 pointer-events-none">
                    <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-zinc-400 bg-zinc-800 border border-zinc-700 rounded font-mono">
                      ↵ Send
                    </kbd>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isSending || !input.trim()}
                  className="h-[46px] px-4 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </>
    </TooltipProvider>
  );
};