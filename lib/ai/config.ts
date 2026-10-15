/**
 * Centralized AI Backend Configuration
 * Defines default model parameters, endpoints, timeouts, and token limits.
 * All settings are configurable via environment variables without modifying code.
 */

export interface AIModelConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  maxContextMessages: number;
  maxContextTokens: number;
  timeoutMs: number;
}

export function getAIConfig(): AIModelConfig {
  const provider = (process.env.AI_PROVIDER || "aicredits").toLowerCase();
  
  // Model selection: defaults to GPT-4o mini through AICredits gateway (or direct OpenAI if configured)
  const defaultModel =
    provider === "openai" ? "gpt-4o-mini" : "openai/gpt-4o-mini";
  const model = process.env.AI_MODEL || defaultModel;

  // Base URL: supports AICredits gateway, standard OpenAI, or custom proxy
  let defaultBaseUrl = "https://api.aicredits.in/v1/chat/completions";
  if (provider === "openai") {
    defaultBaseUrl = "https://api.openai.com/v1/chat/completions";
  }
  const baseUrl = process.env.AI_BASE_URL || defaultBaseUrl;

  // API Key lookup: checks AI_API_KEY, then AICREDITS_API_KEY, then OPENAI_API_KEY
  const apiKey =
    process.env.AI_API_KEY ||
    process.env.AICREDITS_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";

  const temperature = Number.isFinite(parseFloat(process.env.AI_TEMPERATURE || ""))
    ? parseFloat(process.env.AI_TEMPERATURE!)
    : 0.7;

  const maxTokens = Number.isFinite(parseInt(process.env.AI_MAX_TOKENS || "", 10))
    ? parseInt(process.env.AI_MAX_TOKENS!, 10)
    : 1500;

  const topP = Number.isFinite(parseFloat(process.env.AI_TOP_P || ""))
    ? parseFloat(process.env.AI_TOP_P!)
    : 0.9;

  // Context management budgets
  const maxContextMessages = Number.isFinite(
    parseInt(process.env.AI_MAX_CONTEXT_MESSAGES || "", 10)
  )
    ? parseInt(process.env.AI_MAX_CONTEXT_MESSAGES!, 10)
    : 20;

  const maxContextTokens = Number.isFinite(
    parseInt(process.env.AI_MAX_CONTEXT_TOKENS || "", 10)
  )
    ? parseInt(process.env.AI_MAX_CONTEXT_TOKENS!, 10)
    : 8000;

  const timeoutMs = Number.isFinite(
    parseInt(process.env.AI_TIMEOUT_MS || "", 10)
  )
    ? parseInt(process.env.AI_TIMEOUT_MS!, 10)
    : 45000;

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    temperature,
    maxTokens,
    topP,
    maxContextMessages,
    maxContextTokens,
    timeoutMs,
  };
}
