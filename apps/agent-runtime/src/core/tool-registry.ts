import type OpenAI from 'openai';
import pino from 'pino';
import { logger as rootLogger } from '../config.js';

// ── Tool Tier: determines pricing and access level ────────────

export enum ToolTier {
  /** Near-zero cost tools (public APIs, cached data) */
  FREE = 'FREE',
  /** Standard-cost tools (rate-limited APIs, social data) */
  STANDARD = 'STANDARD',
  /** Premium tools (AI compute, proprietary data feeds) */
  PREMIUM = 'PREMIUM',
}

export enum ToolCategory {
  MARKET_DATA = 'market-data',
  SOCIAL = 'social',
  CHAIN = 'chain',
  COMPUTE = 'compute',
}

// ── OpenAI Function Calling compatible parameter schema ───────

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: { type: string };
  default?: unknown;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

// ── Core Tool Definition ──────────────────────────────────────

export interface ToolDefinition {
  /** Unique tool identifier, used as the OpenAI function name */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Description for the LLM to understand when to use this tool */
  description: string;
  /** Functional category — agents only get tools matching their skills */
  category: ToolCategory;
  /** Pricing tier */
  tier: ToolTier;
  /** Cost per invocation in micro-USDC (6 decimals). $0.001 = 1000n */
  costMicroUsdc: bigint;
  /** JSON Schema for tool parameters (OpenAI function calling format) */
  parameters: ToolParameters;
  /** The actual execution function — receives validated params, returns result */
  execute: (params: Record<string, unknown>) => Promise<unknown>;
  /** Per-call timeout in milliseconds (default: 30_000) */
  timeoutMs?: number;
}

// ── The Registry ──────────────────────────────────────────────

const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

export class ToolRegistry {
  private readonly tools: Map<string, ToolDefinition> = new Map();
  private readonly logger: pino.Logger;

  constructor() {
    this.logger = rootLogger.child({ module: 'ToolRegistry' });
  }

  // ── Registration ─────────────────────────────────────────

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      this.logger.warn({ toolId: tool.id }, 'Overwriting existing tool registration');
    }

    // Validate: tool ID must be a valid function name (alphanumeric + underscores)
    if (!/^[a-z][a-z0-9_]*$/.test(tool.id)) {
      throw new Error(
        `Invalid tool ID "${tool.id}": must be lowercase alphanumeric with underscores, starting with a letter`,
      );
    }

    this.tools.set(tool.id, tool);
    this.logger.info(
      {
        toolId: tool.id,
        category: tool.category,
        tier: tool.tier,
        costMicroUsdc: tool.costMicroUsdc.toString(),
      },
      'Tool registered',
    );
  }

  unregister(toolId: string): boolean {
    const removed = this.tools.delete(toolId);
    if (removed) {
      this.logger.info({ toolId }, 'Tool unregistered');
    }
    return removed;
  }

  // ── Lookup ───────────────────────────────────────────────

  getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Filter tools by the agent's allowed skill categories.
   * An agent with skills: ['market-data', 'social'] gets CoinGecko + Neynar tools
   * but NOT Fal.ai image generation (which requires 'compute').
   */
  getToolsForAgent(allowedCategories: string[]): ToolDefinition[] {
    const categorySet = new Set(allowedCategories);
    return this.getAllTools().filter((tool) => categorySet.has(tool.category));
  }

  /**
   * Convert ToolDefinitions into the OpenAI ChatCompletionTool[] format
   * required by the `tools` parameter in chat.completions.create().
   */
  toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    }));
  }

  /**
   * Execute a tool by ID with timeout protection.
   * Returns the raw result or throws on timeout/error.
   */
  async executeTool(
    toolId: string,
    params: Record<string, unknown>,
  ): Promise<{ result: unknown; durationMs: number }> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool "${toolId}" not found in registry`);
    }

    const timeoutMs = tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    const startTime = Date.now();

    this.logger.debug({ toolId, params, timeoutMs }, 'Executing tool');

    try {
      const result = await this.executeWithTimeout(
        () => tool.execute(params),
        timeoutMs,
        toolId,
      );

      const durationMs = Date.now() - startTime;

      this.logger.info(
        { toolId, durationMs },
        'Tool executed successfully',
      );

      return { result, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        {
          toolId,
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        },
        'Tool execution failed',
      );
      throw error;
    }
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    toolId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool "${toolId}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  // ── Introspection ────────────────────────────────────────

  getToolCount(): number {
    return this.tools.size;
  }

  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAllTools().filter((t) => t.category === category);
  }

  getToolsByTier(tier: ToolTier): ToolDefinition[] {
    return this.getAllTools().filter((t) => t.tier === tier);
  }
}
