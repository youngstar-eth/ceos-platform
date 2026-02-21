/**
 * SkillExecutor — The ReAct (Reason + Act) execution engine.
 *
 * This is the brain of every autonomous agent. Given a goal and persona,
 * it orchestrates an LLM-driven loop where the model decides which tools
 * to call, in what sequence, to achieve the agent's objective.
 *
 * Architecture:
 *   System Prompt (persona + tools) → LLM Decides → Execute Tool
 *   → Deduct x402 Cost → Log Decision → Feed Result Back → Repeat
 *
 * Safety rails:
 *   - MAX_ITERATIONS: prevents infinite loops (default 10)
 *   - MIN_BALANCE: circuit breaker when treasury runs low (1 USDC)
 *   - Per-tool timeouts (30s default)
 *   - Full decision logging for RLAIF "Glass Box"
 *
 * Backward compatibility:
 *   The legacy registerSkill() / executeSkill() API is preserved for
 *   A2AGateway and existing workers. New code should use execute().
 */

import type OpenAI from 'openai';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { logger as rootLogger } from '../config.js';
import { OpenRouterClient } from '../integrations/openrouter.js';
import { ToolRegistry, type ToolDefinition } from './tool-registry.js';
import {
  TreasuryLedger,
  MIN_BALANCE_CIRCUIT_BREAKER,
} from './treasury-ledger.js';

// ── Constants ─────────────────────────────────────────────────

const MAX_ITERATIONS_DEFAULT = 10;

/** LLM cost per ReAct iteration (our markup on OpenRouter compute) */
const LLM_COST_PER_ITERATION_MICRO_USDC = 5_000n; // $0.005 per LLM call

// ── Legacy Types (backward compat for A2AGateway) ─────────────

export enum SkillType {
  CONTENT_GENERATION = 'content-generation',
  ANALYTICS = 'analytics',
  ENGAGEMENT = 'engagement',
}

interface LegacySkillContext {
  agentId: string;
  agentPersona: string;
  parameters: Record<string, unknown>;
}

interface LegacySkillResult {
  success: boolean;
  output: unknown;
  executionTimeMs: number;
  skillId: string;
}

interface LegacySkillDefinition {
  id: string;
  name: string;
  type: SkillType;
  timeoutMs: number;
  execute: (context: LegacySkillContext) => Promise<unknown>;
}

// ── New ReAct Types ───────────────────────────────────────────

export interface ExecutionContext {
  /** Agent's database ID */
  agentId: string;
  /** Agent's personality/persona description from the DB */
  agentPersona: string;
  /** The agent's name (for system prompt identity) */
  agentName: string;
  /** What the agent wants to achieve in this execution cycle */
  goal: string;
  /** Tool categories the agent is allowed to use (from agent.skills[]) */
  allowedCategories: string[];
  /** Maximum ReAct iterations before forced termination */
  maxIterations?: number;
}

export interface ToolCallLog {
  /** Which tool was called */
  toolId: string;
  /** Parameters the LLM chose to pass */
  params: Record<string, unknown>;
  /** Raw result returned by the tool */
  result: unknown;
  /** x402 cost deducted for this call (micro-USDC) */
  costMicroUsdc: bigint;
  /** Execution time in milliseconds */
  durationMs: number;
  /** ISO timestamp */
  timestamp: string;
  /** Whether deduction succeeded */
  deducted: boolean;
}

export interface ExecutionResult {
  /** Unique execution ID for RLAIF logging */
  executionId: string;
  /** Whether the execution completed successfully */
  success: boolean;
  /** Final LLM text response (the agent's "answer") */
  output: string;
  /** Ordered log of every tool invocation — the RLAIF Glass Box */
  toolCalls: ToolCallLog[];
  /** Total x402 cost of this entire execution (micro-USDC) */
  totalCostMicroUsdc: bigint;
  /** How many ReAct iterations were used */
  iterationsUsed: number;
  /** Which LLM model serviced this execution */
  model: string;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Why the execution ended */
  terminationReason: 'completed' | 'max_iterations' | 'insufficient_balance' | 'error';
}

// ── System Prompt Builder ─────────────────────────────────────

function buildSystemPrompt(
  agentName: string,
  agentPersona: string,
  goal: string,
  tools: ToolDefinition[],
): string {
  const toolList = tools
    .map((t) => `  - ${t.id}: ${t.description} (cost: $${(Number(t.costMicroUsdc) / 1_000_000).toFixed(4)})`)
    .join('\n');

  return `You are ${agentName}, an autonomous AI agent on the ceos.run platform.

PERSONA:
${agentPersona}

YOUR OBJECTIVE:
${goal}

AVAILABLE TOOLS:
${toolList}

RULES:
1. Use the tools available to you to research, analyze, and accomplish your objective.
2. Each tool call costs real money from your treasury. Be efficient — don't call tools unnecessarily.
3. When you have enough information to accomplish your objective, respond with your final answer as plain text.
4. Be concise and actionable in your final response.
5. If a tool returns an error, adapt your strategy rather than retrying the same call.
6. Never fabricate data — only use information returned by your tools.`;
}

// ── The SkillExecutor ─────────────────────────────────────────

const LEGACY_TIMEOUT_MS = 30_000;

export class SkillExecutor {
  // Legacy skill registry (backward compat)
  private readonly legacySkills: Map<string, LegacySkillDefinition> = new Map();

  // New ReAct components
  private readonly openrouter: OpenRouterClient;
  private readonly toolRegistry: ToolRegistry;
  private readonly treasuryLedger: TreasuryLedger;
  private readonly logger: pino.Logger;

  constructor(
    openrouter: OpenRouterClient,
    toolRegistry: ToolRegistry,
    treasuryLedger: TreasuryLedger,
  ) {
    this.openrouter = openrouter;
    this.toolRegistry = toolRegistry;
    this.treasuryLedger = treasuryLedger;
    this.logger = rootLogger.child({ module: 'SkillExecutor' });
  }

  // ═══════════════════════════════════════════════════════════
  // NEW: ReAct Execution Loop
  // ═══════════════════════════════════════════════════════════

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const executionId = randomUUID();
    const startTime = Date.now();
    const maxIterations = context.maxIterations ?? MAX_ITERATIONS_DEFAULT;

    this.logger.info(
      {
        executionId,
        agentId: context.agentId,
        goal: context.goal.slice(0, 100),
        allowedCategories: context.allowedCategories,
        maxIterations,
      },
      'Starting ReAct execution',
    );

    // ── Step 1: Load agent's treasury balance ────────────
    let initialBalance: bigint;
    try {
      initialBalance = await this.treasuryLedger.loadBalance(context.agentId);
    } catch {
      return this.buildErrorResult(executionId, startTime, 'Failed to load treasury balance');
    }

    if (initialBalance < MIN_BALANCE_CIRCUIT_BREAKER) {
      this.logger.warn(
        { agentId: context.agentId, balance: initialBalance.toString() },
        'Agent treasury below minimum — aborting execution',
      );
      return this.buildErrorResult(executionId, startTime, 'Insufficient treasury balance', 'insufficient_balance');
    }

    // ── Step 2: Resolve allowed tools ────────────────────
    const tools = this.toolRegistry.getToolsForAgent(context.allowedCategories);
    const openaiTools = this.toolRegistry.toOpenAITools(tools);

    this.logger.debug(
      { agentId: context.agentId, toolCount: tools.length },
      'Resolved agent tool set',
    );

    // ── Step 3: Build initial message history ────────────
    const systemPrompt = buildSystemPrompt(
      context.agentName,
      context.agentPersona,
      context.goal,
      tools,
    );

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: context.goal },
    ];

    // ── Step 4: ReAct Loop ───────────────────────────────
    const toolCallLogs: ToolCallLog[] = [];
    let totalCostMicroUsdc = 0n;
    let iterationsUsed = 0;
    let finalOutput = '';
    let finalModel = '';
    let terminationReason: ExecutionResult['terminationReason'] = 'completed';

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      iterationsUsed = iteration + 1;

      this.logger.debug(
        { executionId, iteration: iterationsUsed, messageCount: messages.length },
        'ReAct iteration start',
      );

      // ── 4a: Check treasury before LLM call ────────────
      if (!this.treasuryLedger.hasBalance(context.agentId, LLM_COST_PER_ITERATION_MICRO_USDC)) {
        this.logger.warn(
          { agentId: context.agentId, iteration: iterationsUsed },
          'Treasury circuit breaker triggered before LLM call',
        );
        terminationReason = 'insufficient_balance';
        finalOutput = '[Execution halted: insufficient treasury balance]';
        break;
      }

      // ── 4b: Call LLM with tools ────────────────────────
      let llmResult;
      try {
        llmResult = await this.openrouter.generateWithTools(messages, openaiTools, {
          maxTokens: 1024,
          temperature: 0.3,
        });
      } catch (error) {
        this.logger.error(
          {
            executionId,
            iteration: iterationsUsed,
            error: error instanceof Error ? error.message : String(error),
          },
          'LLM call failed during ReAct loop',
        );
        terminationReason = 'error';
        finalOutput = `[LLM error: ${error instanceof Error ? error.message : String(error)}]`;
        break;
      }

      finalModel = llmResult.model;

      // Deduct LLM compute cost
      const llmDeducted = await this.treasuryLedger.deductCost(
        context.agentId,
        '__llm_compute__',
        LLM_COST_PER_ITERATION_MICRO_USDC,
      );
      if (llmDeducted) {
        totalCostMicroUsdc += LLM_COST_PER_ITERATION_MICRO_USDC;
      }

      // ── 4c: Check if LLM wants to call tools ──────────
      const assistantMessage = llmResult.message;
      const toolCalls = assistantMessage.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        // LLM is done — returned a final text response
        finalOutput = assistantMessage.content?.trim() ?? '';
        terminationReason = 'completed';

        this.logger.info(
          { executionId, iteration: iterationsUsed, outputLength: finalOutput.length },
          'ReAct loop completed — LLM returned final response',
        );
        break;
      }

      // ── 4d: Execute each tool call ─────────────────────
      // Append the assistant message (with tool_calls) to history
      messages.push(assistantMessage);

      for (const toolCall of toolCalls) {
        const toolId = toolCall.function.name;
        const tool = this.toolRegistry.getTool(toolId);

        let params: Record<string, unknown>;
        try {
          params = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          params = {};
        }

        if (!tool) {
          // Tool not found — tell the LLM
          messages.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Tool "${toolId}" not found` }),
          });
          continue;
        }

        // Check treasury balance before executing
        if (!this.treasuryLedger.hasBalance(context.agentId, tool.costMicroUsdc)) {
          this.logger.warn(
            { agentId: context.agentId, toolId, cost: tool.costMicroUsdc.toString() },
            'Insufficient balance for tool call',
          );

          messages.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: 'Insufficient treasury balance for this tool call. Consider using your remaining budget wisely.',
            }),
          });

          toolCallLogs.push({
            toolId,
            params,
            result: { error: 'Insufficient balance' },
            costMicroUsdc: 0n,
            durationMs: 0,
            timestamp: new Date().toISOString(),
            deducted: false,
          });
          continue;
        }

        // Execute the tool
        let result: unknown;
        let durationMs = 0;

        try {
          const execution = await this.toolRegistry.executeTool(toolId, params);
          result = execution.result;
          durationMs = execution.durationMs;
        } catch (error) {
          result = { error: error instanceof Error ? error.message : String(error) };
          durationMs = 0;
        }

        // Deduct cost
        const deducted = await this.treasuryLedger.deductCost(
          context.agentId,
          toolId,
          tool.costMicroUsdc,
        );

        if (deducted) {
          totalCostMicroUsdc += tool.costMicroUsdc;
        }

        // Log the tool call (RLAIF Glass Box)
        toolCallLogs.push({
          toolId,
          params,
          result,
          costMicroUsdc: deducted ? tool.costMicroUsdc : 0n,
          durationMs,
          timestamp: new Date().toISOString(),
          deducted,
        });

        // Feed the result back to the LLM
        messages.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });

        this.logger.debug(
          { executionId, toolId, durationMs, deducted },
          'Tool call completed',
        );
      }
    }

    // ── Step 5: Handle max iterations exceeded ───────────
    if (iterationsUsed >= maxIterations && terminationReason === 'completed' && !finalOutput) {
      terminationReason = 'max_iterations';
      finalOutput = '[Execution halted: maximum iterations reached]';
      this.logger.warn(
        { executionId, maxIterations, agentId: context.agentId },
        'ReAct loop hit max iterations',
      );
    }

    // ── Step 6: Evict balance cache & build result ───────
    this.treasuryLedger.evict(context.agentId);

    const durationMs = Date.now() - startTime;

    this.logger.info(
      {
        executionId,
        agentId: context.agentId,
        iterationsUsed,
        toolCallCount: toolCallLogs.length,
        totalCostMicroUsdc: totalCostMicroUsdc.toString(),
        terminationReason,
        durationMs,
        model: finalModel,
      },
      'ReAct execution complete',
    );

    return {
      executionId,
      success: terminationReason === 'completed',
      output: finalOutput,
      toolCalls: toolCallLogs,
      totalCostMicroUsdc,
      iterationsUsed,
      model: finalModel,
      durationMs,
      terminationReason,
    };
  }

  private buildErrorResult(
    executionId: string,
    startTime: number,
    errorMessage: string,
    reason: ExecutionResult['terminationReason'] = 'error',
  ): ExecutionResult {
    return {
      executionId,
      success: false,
      output: `[Error: ${errorMessage}]`,
      toolCalls: [],
      totalCostMicroUsdc: 0n,
      iterationsUsed: 0,
      model: '',
      durationMs: Date.now() - startTime,
      terminationReason: reason,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // LEGACY API — Backward compatibility for A2AGateway
  // ═══════════════════════════════════════════════════════════

  registerSkill(skill: LegacySkillDefinition): void {
    if (this.legacySkills.has(skill.id)) {
      this.logger.warn({ skillId: skill.id }, 'Overwriting existing legacy skill registration');
    }

    this.legacySkills.set(skill.id, skill);
    this.logger.info({ skillId: skill.id, name: skill.name, type: skill.type }, 'Legacy skill registered');
  }

  unregisterSkill(skillId: string): boolean {
    const removed = this.legacySkills.delete(skillId);
    if (removed) {
      this.logger.info({ skillId }, 'Legacy skill unregistered');
    }
    return removed;
  }

  getRegisteredSkills(): LegacySkillDefinition[] {
    return Array.from(this.legacySkills.values());
  }

  async executeSkill(skillId: string, context: LegacySkillContext): Promise<LegacySkillResult> {
    const skill = this.legacySkills.get(skillId);
    if (!skill) {
      this.logger.error({ skillId }, 'Legacy skill not found');
      return {
        success: false,
        output: { error: `Skill "${skillId}" not found` },
        executionTimeMs: 0,
        skillId,
      };
    }

    const timeoutMs = skill.timeoutMs ?? LEGACY_TIMEOUT_MS;
    const startTime = Date.now();

    this.logger.info(
      { skillId, agentId: context.agentId, timeoutMs },
      'Executing legacy skill',
    );

    try {
      const output = await this.executeWithTimeout(
        () => skill.execute(context),
        timeoutMs,
        skillId,
      );

      const executionTimeMs = Date.now() - startTime;

      this.logger.info(
        { skillId, agentId: context.agentId, executionTimeMs },
        'Legacy skill executed successfully',
      );

      return {
        success: true,
        output,
        executionTimeMs,
        skillId,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        { skillId, agentId: context.agentId, executionTimeMs, error: errorMessage },
        'Legacy skill execution failed',
      );

      return {
        success: false,
        output: { error: errorMessage },
        executionTimeMs,
        skillId,
      };
    }
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    skillId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Skill "${skillId}" timed out after ${timeoutMs}ms`));
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
}

// Re-export legacy types for backward compat
export type { LegacySkillContext as SkillContext, LegacySkillResult as SkillResult, LegacySkillDefinition as SkillDefinition };
