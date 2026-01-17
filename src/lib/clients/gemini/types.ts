export interface GeminiResponse {
  content: unknown;
  tokenUsage: TokenUsage;
  durationMs: number;
  modelUsed: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}
