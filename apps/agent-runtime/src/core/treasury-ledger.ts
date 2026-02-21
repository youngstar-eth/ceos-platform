/**
 * TreasuryLedger — In-memory balance cache for agent USDC treasuries.
 *
 * Each agent deposits 50 USDC on-chain (via AgentPaymaster). This ledger
 * tracks the remaining balance locally to avoid RPC calls on every tool
 * invocation during the ReAct loop.
 *
 * Phase 1: Reads/writes Prisma `Agent.treasuryBalance` (BigInt column).
 * Phase 2: Periodic on-chain settlement via AgentPaymaster.payForCompute().
 *
 * All amounts are in micro-USDC (6 decimals): $1 = 1_000_000n
 */

import pino from 'pino';
import { logger as rootLogger } from '../config.js';

// ── Constants ─────────────────────────────────────────────────

/** Circuit breaker: halt execution if balance drops below 1 USDC */
export const MIN_BALANCE_CIRCUIT_BREAKER = 1_000_000n; // 1 USDC

/** Initial deposit amount: 50 USDC */
export const INITIAL_DEPOSIT_MICRO_USDC = 50_000_000n; // 50 USDC

// ── Deduction Record (for RLAIF audit trail) ──────────────────

export interface DeductionRecord {
  agentId: string;
  toolId: string;
  costMicroUsdc: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
  timestamp: string;
}

// ── DB Adapter Interface ──────────────────────────────────────
//
// Abstracted so the ledger doesn't directly depend on Prisma.
// In production, inject PrismaTreasuryAdapter; in tests, use a mock.

export interface TreasuryDbAdapter {
  /** Read the current treasury balance for an agent from the database */
  getBalance(agentId: string): Promise<bigint>;
  /** Write the updated balance back to the database */
  setBalance(agentId: string, balanceMicroUsdc: bigint): Promise<void>;
  /** Record a deduction event for auditing */
  recordDeduction(record: DeductionRecord): Promise<void>;
}

// ── The Ledger ────────────────────────────────────────────────

export class TreasuryLedger {
  private readonly balances: Map<string, bigint> = new Map();
  private readonly db: TreasuryDbAdapter;
  private readonly logger: pino.Logger;

  constructor(db: TreasuryDbAdapter) {
    this.db = db;
    this.logger = rootLogger.child({ module: 'TreasuryLedger' });
  }

  /**
   * Load an agent's balance from DB into the in-memory cache.
   * Must be called before any deductions during a ReAct execution.
   */
  async loadBalance(agentId: string): Promise<bigint> {
    try {
      const balance = await this.db.getBalance(agentId);
      this.balances.set(agentId, balance);

      this.logger.info(
        { agentId, balanceMicroUsdc: balance.toString() },
        'Treasury balance loaded',
      );

      return balance;
    } catch (error) {
      this.logger.error(
        { agentId, error: error instanceof Error ? error.message : String(error) },
        'Failed to load treasury balance',
      );
      throw error;
    }
  }

  /**
   * Get the cached balance (in-memory). Returns 0n if not loaded.
   */
  getBalance(agentId: string): bigint {
    return this.balances.get(agentId) ?? 0n;
  }

  /**
   * Check if an agent has enough balance for a specific cost.
   * Also enforces the circuit breaker minimum.
   */
  hasBalance(agentId: string, requiredMicroUsdc: bigint): boolean {
    const currentBalance = this.getBalance(agentId);
    // Must have enough for the cost AND stay above the circuit breaker
    return currentBalance >= requiredMicroUsdc + MIN_BALANCE_CIRCUIT_BREAKER;
  }

  /**
   * Deduct the cost of a tool call from the agent's treasury.
   *
   * Returns true if deduction succeeded, false if insufficient balance.
   * Writes through to DB immediately to prevent data loss on crash.
   */
  async deductCost(
    agentId: string,
    toolId: string,
    costMicroUsdc: bigint,
  ): Promise<boolean> {
    const currentBalance = this.getBalance(agentId);

    // Enforce circuit breaker: balance must stay above minimum after deduction
    if (currentBalance < costMicroUsdc + MIN_BALANCE_CIRCUIT_BREAKER) {
      this.logger.warn(
        {
          agentId,
          toolId,
          costMicroUsdc: costMicroUsdc.toString(),
          currentBalance: currentBalance.toString(),
          minRequired: (costMicroUsdc + MIN_BALANCE_CIRCUIT_BREAKER).toString(),
        },
        'Insufficient treasury balance — circuit breaker triggered',
      );
      return false;
    }

    const newBalance = currentBalance - costMicroUsdc;

    // Update in-memory cache immediately
    this.balances.set(agentId, newBalance);

    // Write-through to database
    try {
      const record: DeductionRecord = {
        agentId,
        toolId,
        costMicroUsdc,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        timestamp: new Date().toISOString(),
      };

      // Fire both writes concurrently — balance update + audit record
      await Promise.all([
        this.db.setBalance(agentId, newBalance),
        this.db.recordDeduction(record),
      ]);

      this.logger.debug(
        {
          agentId,
          toolId,
          costMicroUsdc: costMicroUsdc.toString(),
          balanceBefore: currentBalance.toString(),
          balanceAfter: newBalance.toString(),
        },
        'Treasury deduction recorded',
      );

      return true;
    } catch (error) {
      // Rollback in-memory on DB failure to maintain consistency
      this.balances.set(agentId, currentBalance);

      this.logger.error(
        {
          agentId,
          toolId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to persist treasury deduction — rolled back in-memory',
      );

      return false;
    }
  }

  /**
   * Get total accumulated cost for the current session (useful for logging).
   * Calculated as initial balance minus current balance.
   */
  getSessionCost(agentId: string, initialBalance: bigint): bigint {
    const currentBalance = this.getBalance(agentId);
    return initialBalance - currentBalance;
  }

  /**
   * Evict an agent's balance from the in-memory cache.
   * Call this after a ReAct execution completes to free memory.
   */
  evict(agentId: string): void {
    this.balances.delete(agentId);
  }
}
