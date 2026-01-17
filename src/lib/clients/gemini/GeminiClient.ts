import crypto from 'crypto';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../../../config';
import { AnalysisError } from '../../utils/errors';
import logger from '../../utils/logger';
import { llmTokens, externalApiCalls, externalApiDuration } from '../../utils/metrics';
import { CircuitBreaker } from '../../utils/circuit-breaker';
import { RedisClient } from '../redis';
import type { GeminiResponse, TokenUsage } from './types';

export class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;
  private readonly redis: RedisClient;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(redis: RedisClient) {
    const apiKey = config.gemini.apiKey;
    if (!apiKey) {
      throw new AnalysisError('Missing Gemini API key');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = config.gemini.model;
    this.redis = redis;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      timeout: 60000,
      name: 'gemini',
    });
  }

  /**
   * Generate analysis with structured output
   */
  async generateAnalysis(prompt: string): Promise<GeminiResponse> {
    // Check cache
    const cacheKey = this.getCacheKey(prompt);
    try {
      const cached = await this.redis.get(cacheKey, 'llm');
      if (cached) {
        logger.debug('LLM response cache hit');
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Failed to check LLM cache, proceeding without cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const timer = externalApiDuration.startTimer({ service: 'gemini', endpoint: 'generate' });
    const startTime = Date.now();

    try {
      const text = await this.circuitBreaker.execute(async () => {
        const model: GenerativeModel = this.genAI.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: config.gemini.temperature,
            maxOutputTokens: config.gemini.maxTokens,
          },
        });

        logger.debug('Calling Gemini API', { model: this.modelName });

        // Add JSON instruction to prompt for structured output
        const jsonPrompt = prompt + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code blocks, just raw JSON.';

        const result = await model.generateContent(jsonPrompt);
        const response = result.response;

        return response.text();
      });

      timer();
      const duration = Date.now() - startTime;

      // Clean the response text (remove potential markdown code blocks)
      const cleanedText = this.cleanJsonResponse(text);

      // Parse response
      const parsed = JSON.parse(cleanedText);

      // Track token usage (estimated based on character count / 4)
      const tokenUsage: TokenUsage = {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(text.length / 4),
        totalTokens: 0,
      };
      tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;

      llmTokens.inc({ type: 'input' }, tokenUsage.inputTokens);
      llmTokens.inc({ type: 'output' }, tokenUsage.outputTokens);
      externalApiCalls.inc({ service: 'gemini', status: 'success' });

      const result: GeminiResponse = {
        content: parsed,
        tokenUsage,
        durationMs: duration,
        modelUsed: this.modelName,
      };

      // Cache for 1 hour
      try {
        await this.redis.setex(cacheKey, config.redis.ttl.llmResponses, JSON.stringify(result));
      } catch (error) {
        logger.warn('Failed to cache LLM response', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.info('Gemini analysis completed', {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      timer();
      externalApiCalls.inc({ service: 'gemini', status: 'error' });
      logger.error('Gemini API call failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AnalysisError('Failed to generate analysis', error);
    }
  }

  /**
   * Generate content without JSON mode (for general queries)
   */
  async generateContent(prompt: string): Promise<string> {
    const timer = externalApiDuration.startTimer({ service: 'gemini', endpoint: 'generate' });

    try {
      const text = await this.circuitBreaker.execute(async () => {
        const model: GenerativeModel = this.genAI.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: config.gemini.temperature,
            maxOutputTokens: config.gemini.maxTokens,
          },
        });

        logger.debug('Calling Gemini API (text mode)', { model: this.modelName });

        const result = await model.generateContent(prompt);
        return result.response.text();
      });

      timer();
      externalApiCalls.inc({ service: 'gemini', status: 'success' });

      // Track token usage
      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(text.length / 4);
      llmTokens.inc({ type: 'input' }, inputTokens);
      llmTokens.inc({ type: 'output' }, outputTokens);

      return text;
    } catch (error) {
      timer();
      externalApiCalls.inc({ service: 'gemini', status: 'error' });
      logger.error('Gemini API call failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AnalysisError('Failed to generate content', error);
    }
  }

  /**
   * Calculate estimated cost based on token usage
   */
  calculateCost(tokenUsage: TokenUsage): number {
    // Gemini 1.5 Pro pricing (example rates - verify current pricing)
    const inputCostPer1K = 0.00035;
    const outputCostPer1K = 0.00105;

    const inputCost = (tokenUsage.inputTokens / 1000) * inputCostPer1K;
    const outputCost = (tokenUsage.outputTokens / 1000) * outputCostPer1K;

    return inputCost + outputCost;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): 'closed' | 'open' | 'half-open' {
    return this.circuitBreaker.getState();
  }

  /**
   * Clean JSON response from potential markdown formatting
   */
  private cleanJsonResponse(text: string): string {
    let cleaned = text.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }

    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }

  /**
   * Generate cache key from prompt
   */
  private getCacheKey(prompt: string): string {
    const hash = crypto.createHash('sha256').update(prompt).digest('hex');
    return `llm:response:${hash}`;
  }
}
