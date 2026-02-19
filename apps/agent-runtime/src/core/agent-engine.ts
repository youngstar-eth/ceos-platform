import { EventEmitter } from 'node:events';
import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import { ContentPipeline } from './content-pipeline.js';
import { AgentScheduler } from './scheduler.js';
import { ServiceClient, type ServiceJob } from '../integrations/service-client.js';
import type { ContentStrategy } from '../strategies/posting.js';

export enum AgentState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  PUBLISHING = 'PUBLISHING',
  SLEEPING = 'SLEEPING',
  ERROR = 'ERROR',
}

interface AgentConfig {
  id: string;
  name: string;
  persona: string;
  signerUuid: string;
  fid: number;
  walletAddress: string; // V2: required for ServiceClient binding
  strategy: ContentStrategy;
  maxRetries?: number;
}

interface AgentInstance {
  config: AgentConfig;
  state: AgentState;
  retryCount: number;
  lastError: string | null;
  lastActivityAt: Date | null;
  abortController: AbortController;
  serviceClient: ServiceClient; // V2: per-agent service client instance
}

interface AgentEngineEvents {
  'state-change': (agentId: string, from: AgentState, to: AgentState) => void;
  'agent-started': (agentId: string) => void;
  'agent-stopped': (agentId: string) => void;
  'agent-error': (agentId: string, error: Error) => void;
  'content-published': (agentId: string, castHash: string) => void;
}

const MAX_RETRIES_DEFAULT = 3;
const DEFAULT_MAX_PRICE_USDC = 50_000; // 50 USDC in micro-USDC (6 decimals = 50_000_000, but spec says 50000)

export class AgentEngine extends EventEmitter {
  private readonly agents: Map<string, AgentInstance> = new Map();
  private readonly pipeline: ContentPipeline;
  private readonly scheduler: AgentScheduler;
  private readonly apiBaseUrl: string;
  private readonly logger: pino.Logger;
  private isShuttingDown = false;

  constructor(pipeline: ContentPipeline, scheduler: AgentScheduler) {
    super();
    this.pipeline = pipeline;
    this.scheduler = scheduler;
    this.apiBaseUrl = process.env.CEOS_API_URL ?? 'http://localhost:3000';
    this.logger = rootLogger.child({ module: 'AgentEngine' });

    this.registerShutdownHandlers();
  }

  async startAgent(agentConfig: AgentConfig): Promise<void> {
    const { id } = agentConfig;

    if (this.agents.has(id)) {
      this.logger.warn({ agentId: id }, 'Agent already running, stopping first');
      await this.stopAgent(id);
    }

    // V2: Each agent gets its own identity-bound ServiceClient
    const serviceClient = new ServiceClient(
      this.apiBaseUrl,
      agentConfig.id,
      agentConfig.walletAddress,
    );

    const instance: AgentInstance = {
      config: agentConfig,
      state: AgentState.IDLE,
      retryCount: 0,
      lastError: null,
      lastActivityAt: null,
      abortController: new AbortController(),
      serviceClient,
    };

    this.agents.set(id, instance);
    this.transitionState(id, AgentState.IDLE);

    this.logger.info({ agentId: id, name: agentConfig.name }, 'Starting agent');

    await this.scheduler.scheduleAgent(id, agentConfig.strategy);

    this.emit('agent-started', id);
    this.logger.info({ agentId: id }, 'Agent started and scheduled');
  }

  async stopAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      this.logger.warn({ agentId }, 'Attempted to stop non-existent agent');
      return;
    }

    this.logger.info({ agentId }, 'Stopping agent');

    instance.abortController.abort();

    await this.scheduler.unscheduleAgent(agentId);

    this.transitionState(agentId, AgentState.IDLE);
    this.agents.delete(agentId);

    this.emit('agent-stopped', agentId);
    this.logger.info({ agentId }, 'Agent stopped');
  }

  getState(agentId: string): AgentState | null {
    const instance = this.agents.get(agentId);
    return instance?.state ?? null;
  }

  getAgentInfo(agentId: string): { state: AgentState; lastError: string | null; lastActivityAt: Date | null } | null {
    const instance = this.agents.get(agentId);
    if (!instance) return null;

    return {
      state: instance.state,
      lastError: instance.lastError,
      lastActivityAt: instance.lastActivityAt,
    };
  }

  getRunningAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  async executeAgentCycle(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      this.logger.warn({ agentId }, 'Agent not found for cycle execution');
      return;
    }

    if (this.isShuttingDown) {
      this.logger.info({ agentId }, 'Skipping cycle — shutting down');
      return;
    }

    const maxRetries = instance.config.maxRetries ?? MAX_RETRIES_DEFAULT;

    try {
      this.transitionState(agentId, AgentState.GENERATING);
      this.logger.info({ agentId }, 'Generating content');

      const content = await this.pipeline.generateContent(
        {
          persona: instance.config.persona,
          name: instance.config.name,
          agentId: instance.config.id,
        },
        instance.config.strategy,
      );

      if (instance.abortController.signal.aborted) {
        this.logger.info({ agentId }, 'Cycle aborted during generation');
        return;
      }

      this.transitionState(agentId, AgentState.PUBLISHING);
      this.logger.info({ agentId, contentType: content.type }, 'Publishing content');

      // Publishing is handled by the posting worker via BullMQ
      // Here we just mark the content as ready
      instance.lastActivityAt = new Date();
      instance.retryCount = 0;
      instance.lastError = null;

      this.transitionState(agentId, AgentState.SLEEPING);
      this.logger.info({ agentId }, 'Cycle complete, agent sleeping');
    } catch (error) {
      instance.retryCount += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      instance.lastError = errorMessage;

      this.logger.error(
        { agentId, retryCount: instance.retryCount, maxRetries, error: errorMessage },
        'Agent cycle failed',
      );

      if (instance.retryCount >= maxRetries) {
        this.transitionState(agentId, AgentState.ERROR);
        this.emit('agent-error', agentId, error instanceof Error ? error : new Error(errorMessage));
        this.logger.error({ agentId }, 'Agent entered ERROR state after max retries');
      } else {
        this.transitionState(agentId, AgentState.SLEEPING);
        this.logger.warn(
          { agentId, retryCount: instance.retryCount },
          'Retrying on next scheduled cycle',
        );
      }
    }
  }

  private transitionState(agentId: string, newState: AgentState): void {
    const instance = this.agents.get(agentId);
    if (!instance) return;

    const previousState = instance.state;
    instance.state = newState;

    this.logger.debug({ agentId, from: previousState, to: newState }, 'State transition');
    this.emit('state-change', agentId, previousState, newState);
  }

  /**
   * Purchase a service from another agent using capability-based discovery.
   *
   * V2 Signature: (agentId, capability, requirements, maxPriceUsdc?)
   *
   * Flow:
   * 1. Discover offerings matching the capability
   * 2. Filter by maxPriceUsdc budget
   * 3. Pick the best match (highest rated, then most jobs completed)
   * 4. Create a service job with the given requirements
   * 5. Wait for completion and return the result
   *
   * This is the "sovereign action" — the agent autonomously decides to buy
   * a service from the marketplace. The x402 payment is handled by the API.
   */
  async purchaseService(
    agentId: string,
    capability: string,
    requirements: Record<string, unknown>,
    maxPriceUsdc: number = DEFAULT_MAX_PRICE_USDC,
  ): Promise<ServiceJob> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} is not running — cannot purchase service`);
    }

    const { serviceClient } = instance;

    this.logger.info(
      { agentId, capability, maxPriceUsdc },
      'Agent purchasing service by capability',
    );

    // 1. Discover services matching the capability
    const offerings = await serviceClient.discover({
      capability,
      maxPrice: maxPriceUsdc,
      sort: 'rating',
      limit: 10,
    });

    if (offerings.length === 0) {
      throw new Error(
        `No service offerings found for capability "${capability}" within budget ${maxPriceUsdc} micro-USDC`,
      );
    }

    // 2. Pick the best match: highest avgRating, tiebreak by completedJobs
    const best = offerings.reduce((a, b) => {
      const ratingA = a.avgRating ?? 0;
      const ratingB = b.avgRating ?? 0;
      if (ratingA !== ratingB) return ratingB > ratingA ? b : a;
      return b.completedJobs > a.completedJobs ? b : a;
    });

    this.logger.info(
      {
        agentId,
        selectedSlug: best.slug,
        selectedName: best.name,
        priceUsdc: best.priceUsdc,
        avgRating: best.avgRating,
      },
      'Best service offering selected',
    );

    // 3. Create the service job
    const job = await serviceClient.createJob({
      offeringSlug: best.slug,
      requirements,
    });

    this.logger.info(
      {
        agentId,
        jobId: job.id,
        offeringSlug: best.slug,
        priceUsdc: job.priceUsdc,
      },
      'Service purchased — job created',
    );

    // TODO: RLAIF — log purchase decision context for training data
    // (capability query, offerings considered, selection rationale, price)

    // 4. Wait for job completion
    const completed = await serviceClient.waitForCompletion(job.id);

    return completed;
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info('Shutting down AgentEngine');

    const agentIds = Array.from(this.agents.keys());
    await Promise.allSettled(agentIds.map((id) => this.stopAgent(id)));

    this.logger.info('AgentEngine shutdown complete');
  }

  private registerShutdownHandlers(): void {
    const handler = async (signal: string) => {
      this.logger.info({ signal }, 'Received shutdown signal');
      await this.shutdown();
    };

    process.once('SIGTERM', () => void handler('SIGTERM'));
    process.once('SIGINT', () => void handler('SIGINT'));
  }
}

export type { AgentConfig, AgentInstance, AgentEngineEvents, ServiceJob };
