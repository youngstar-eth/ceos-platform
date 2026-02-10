import { EventEmitter } from 'node:events';
import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import { ContentPipeline } from './content-pipeline.js';
import { AgentScheduler } from './scheduler.js';
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
}

interface AgentEngineEvents {
  'state-change': (agentId: string, from: AgentState, to: AgentState) => void;
  'agent-started': (agentId: string) => void;
  'agent-stopped': (agentId: string) => void;
  'agent-error': (agentId: string, error: Error) => void;
  'content-published': (agentId: string, castHash: string) => void;
}

const MAX_RETRIES_DEFAULT = 3;

export class AgentEngine extends EventEmitter {
  private readonly agents: Map<string, AgentInstance> = new Map();
  private readonly pipeline: ContentPipeline;
  private readonly scheduler: AgentScheduler;
  private readonly logger: pino.Logger;
  private isShuttingDown = false;

  constructor(pipeline: ContentPipeline, scheduler: AgentScheduler) {
    super();
    this.pipeline = pipeline;
    this.scheduler = scheduler;
    this.logger = rootLogger.child({ module: 'AgentEngine' });

    this.registerShutdownHandlers();
  }

  async startAgent(agentConfig: AgentConfig): Promise<void> {
    const { id } = agentConfig;

    if (this.agents.has(id)) {
      this.logger.warn({ agentId: id }, 'Agent already running, stopping first');
      await this.stopAgent(id);
    }

    const instance: AgentInstance = {
      config: agentConfig,
      state: AgentState.IDLE,
      retryCount: 0,
      lastError: null,
      lastActivityAt: null,
      abortController: new AbortController(),
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

export type { AgentConfig, AgentInstance, AgentEngineEvents };
