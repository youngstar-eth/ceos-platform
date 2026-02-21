import OpenAI from 'openai';
import { z } from 'zod';
import pino from 'pino';
import { logger as rootLogger } from '../config.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';
const FALLBACK_MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash',
  'meta-llama/llama-3.3-70b-instruct',
];

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

interface GenerateTextOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

interface GenerateTextResult {
  text: string;
  model: string;
  tokensUsed: number;
}

/**
 * Result from generateWithTools() — returns the raw ChatCompletionMessage
 * which may contain tool_calls[] (when the LLM wants to invoke functions)
 * or plain text content (when the LLM is done reasoning).
 */
interface GenerateWithToolsResult {
  message: OpenAI.ChatCompletionMessage;
  finishReason: string;
  model: string;
  tokensUsed: number;
}

interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
}

export class OpenRouterClient {
  private readonly client: OpenAI;
  private readonly logger: pino.Logger;
  private tokenUsage: TokenUsage = {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
  };

  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://ceos.run',
        'X-Title': 'ceos.run Agent Runtime',
      },
    });
    this.logger = rootLogger.child({ module: 'OpenRouterClient' });
  }

  async generateText(prompt: string, options?: GenerateTextOptions): Promise<GenerateTextResult> {
    const model = options?.model ?? DEFAULT_MODEL;
    const modelsToTry = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];

    let lastError: Error | null = null;

    for (const currentModel of modelsToTry) {
      try {
        const result = await this.tryGenerateWithRetries(prompt, currentModel, options);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          { model: currentModel, error: lastError.message },
          'Model failed, trying fallback',
        );
      }
    }

    throw lastError ?? new Error('All models failed');
  }

  async generateJSON<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options?: GenerateTextOptions,
  ): Promise<T> {
    const jsonPrompt = `${prompt}\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code blocks, no explanations.`;

    const result = await this.generateText(jsonPrompt, {
      ...options,
      temperature: options?.temperature ?? 0.3,
    });

    try {
      const parsed: unknown = JSON.parse(result.text);
      return schema.parse(parsed);
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error), text: result.text },
        'Failed to parse JSON response',
      );
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate a chat completion with OpenAI-compatible function calling (tools).
   *
   * Unlike generateText(), this method:
   * - Accepts a full message history (for multi-turn ReAct loops)
   * - Passes `tools` to the API so the LLM can request function calls
   * - Returns the raw ChatCompletionMessage (which may contain tool_calls[])
   * - Includes model fallback + retry logic
   */
  async generateWithTools(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools: OpenAI.ChatCompletionTool[],
    options?: GenerateTextOptions,
  ): Promise<GenerateWithToolsResult> {
    const model = options?.model ?? DEFAULT_MODEL;
    const modelsToTry = [model, ...FALLBACK_MODELS.filter((m) => m !== model)];

    let lastError: Error | null = null;

    for (const currentModel of modelsToTry) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          return await this.callOpenRouterWithTools(messages, tools, currentModel, options);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const isRateLimit = this.isRateLimitError(error);
          const isRetryable = isRateLimit || this.isRetryableError(error);

          if (!isRetryable || attempt === MAX_RETRIES - 1) {
            this.logger.warn(
              { model: currentModel, attempt: attempt + 1, error: lastError.message },
              'Tool-calling model attempt failed',
            );
            break; // Try next model
          }

          const delay = isRateLimit
            ? this.getRateLimitDelay(error, attempt)
            : BASE_DELAY_MS * Math.pow(2, attempt);

          this.logger.warn(
            { model: currentModel, attempt: attempt + 1, delay, isRateLimit },
            'Retrying tool call after error',
          );

          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('All models failed for tool-calling generation');
  }

  private async callOpenRouterWithTools(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools: OpenAI.ChatCompletionTool[],
    model: string,
    options?: GenerateTextOptions,
  ): Promise<GenerateWithToolsResult> {
    this.logger.debug(
      { model, messageCount: messages.length, toolCount: tools.length },
      'Calling OpenRouter with tools',
    );

    const response = await this.client.chat.completions.create({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.3,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choices returned from OpenRouter');
    }

    const usage = response.usage;
    const tokensUsed = usage?.total_tokens ?? 0;

    // Track cumulative usage
    this.tokenUsage.totalTokens += tokensUsed;
    this.tokenUsage.promptTokens += usage?.prompt_tokens ?? 0;
    this.tokenUsage.completionTokens += usage?.completion_tokens ?? 0;

    this.logger.debug(
      {
        model,
        tokensUsed,
        finishReason: choice.finish_reason,
        hasToolCalls: !!choice.message.tool_calls?.length,
        toolCallCount: choice.message.tool_calls?.length ?? 0,
      },
      'OpenRouter tool response received',
    );

    return {
      message: choice.message,
      finishReason: choice.finish_reason ?? 'stop',
      model: response.model ?? model,
      tokensUsed,
    };
  }

  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  resetTokenUsage(): void {
    this.tokenUsage = { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
  }

  private async tryGenerateWithRetries(
    prompt: string,
    model: string,
    options?: GenerateTextOptions,
  ): Promise<GenerateTextResult> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.callOpenRouter(prompt, model, options);
      } catch (error) {
        const isRateLimit = this.isRateLimitError(error);
        const isRetryable = isRateLimit || this.isRetryableError(error);

        if (!isRetryable || attempt === MAX_RETRIES - 1) {
          throw error;
        }

        const delay = isRateLimit
          ? this.getRateLimitDelay(error, attempt)
          : BASE_DELAY_MS * Math.pow(2, attempt);

        this.logger.warn(
          { model, attempt: attempt + 1, delay, isRateLimit },
          'Retrying after error',
        );

        await this.sleep(delay);
      }
    }

    throw new Error(`Failed after ${MAX_RETRIES} retries`);
  }

  private async callOpenRouter(
    prompt: string,
    model: string,
    options?: GenerateTextOptions,
  ): Promise<GenerateTextResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    this.logger.debug({ model, messageCount: messages.length }, 'Calling OpenRouter');

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options?.maxTokens ?? 300,
      temperature: options?.temperature ?? 0.7,
    });

    const choice = response.choices[0];
    const text = choice?.message?.content?.trim() ?? '';

    if (text.length === 0) {
      throw new Error('Empty response from OpenRouter');
    }

    const usage = response.usage;
    const tokensUsed = usage?.total_tokens ?? 0;

    // Track cumulative usage
    this.tokenUsage.totalTokens += tokensUsed;
    this.tokenUsage.promptTokens += usage?.prompt_tokens ?? 0;
    this.tokenUsage.completionTokens += usage?.completion_tokens ?? 0;

    this.logger.debug({ model, tokensUsed, textLength: text.length }, 'OpenRouter response received');

    return {
      text,
      model: response.model ?? model,
      tokensUsed,
    };
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      return error.status === 429;
    }
    return false;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      return error.status >= 500 || error.status === 429;
    }
    return false;
  }

  private getRateLimitDelay(error: unknown, attempt: number): number {
    if (error instanceof OpenAI.APIError) {
      const retryAfterHeader = error.headers?.['retry-after'];
      if (retryAfterHeader) {
        const retryAfter = parseInt(String(retryAfterHeader), 10);
        if (!isNaN(retryAfter)) {
          return retryAfter * 1000;
        }
      }
    }
    // Default exponential backoff with higher base for rate limits
    return BASE_DELAY_MS * Math.pow(2, attempt + 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export type { GenerateTextOptions, GenerateTextResult, GenerateWithToolsResult, TokenUsage };
