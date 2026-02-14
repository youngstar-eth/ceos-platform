import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import type { SkillExecutor, SkillContext } from '../core/skill-executor.js';

/**
 * A2A (Agent-to-Agent) message format: JSON-RPC 2.0
 */
interface A2AMessage {
  jsonrpc: '2.0';
  method: 'query' | 'collaborate' | 'delegate' | 'reputation-check';
  params: {
    fromAgentId: string;
    fromFid?: number;
    payload: Record<string, unknown>;
  };
  id: string | number;
}

interface A2AResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id: string | number;
}

interface AgentRegistration {
  agentId: string;
  fid: number;
  endpoint: string;
  skills: string[];
  registeredAt: Date;
}

export class A2AGateway {
  private readonly logger: pino.Logger;
  private readonly skillExecutor: SkillExecutor;
  private readonly registeredAgents: Map<string, AgentRegistration> = new Map();

  constructor(skillExecutor: SkillExecutor) {
    this.skillExecutor = skillExecutor;
    this.logger = rootLogger.child({ module: 'A2AGateway' });
  }

  /**
   * Register a local agent's A2A endpoint.
   */
  registerAgent(registration: AgentRegistration): void {
    this.registeredAgents.set(registration.agentId, registration);
    this.logger.info(
      { agentId: registration.agentId, fid: registration.fid },
      'Agent registered for A2A',
    );
  }

  unregisterAgent(agentId: string): void {
    this.registeredAgents.delete(agentId);
    this.logger.info({ agentId }, 'Agent unregistered from A2A');
  }

  getRegisteredAgents(): AgentRegistration[] {
    return Array.from(this.registeredAgents.values());
  }

  /**
   * Handle an incoming A2A message for a specific agent.
   */
  async handleMessage(targetAgentId: string, message: A2AMessage): Promise<A2AResponse> {
    const agent = this.registeredAgents.get(targetAgentId);
    if (!agent) {
      return {
        jsonrpc: '2.0',
        error: { code: -32001, message: `Agent "${targetAgentId}" not found` },
        id: message.id,
      };
    }

    this.logger.info(
      {
        targetAgentId,
        method: message.method,
        fromAgentId: message.params.fromAgentId,
      },
      'Processing A2A message',
    );

    try {
      switch (message.method) {
        case 'query':
          return await this.handleQuery(agent, message);

        case 'collaborate':
          return await this.handleCollaborate(agent, message);

        case 'delegate':
          return await this.handleDelegate(agent, message);

        case 'reputation-check':
          return this.handleReputationCheck(agent, message);

        default:
          return {
            jsonrpc: '2.0',
            error: { code: -32601, message: `Method "${message.method}" not found` },
            id: message.id,
          };
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'A2A message handling failed',
      );
      return {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Internal agent error' },
        id: message.id,
      };
    }
  }

  private async handleQuery(
    agent: AgentRegistration,
    message: A2AMessage,
  ): Promise<A2AResponse> {
    const skillId = (message.params.payload['skillId'] as string) ?? 'content-generation';

    const context: SkillContext = {
      agentId: agent.agentId,
      agentPersona: '',
      parameters: message.params.payload,
    };

    const result = await this.skillExecutor.executeSkill(skillId, context);

    return {
      jsonrpc: '2.0',
      result: { output: result.output, executionTimeMs: result.executionTimeMs },
      id: message.id,
    };
  }

  private async handleCollaborate(
    agent: AgentRegistration,
    message: A2AMessage,
  ): Promise<A2AResponse> {
    return {
      jsonrpc: '2.0',
      result: {
        agentId: agent.agentId,
        accepted: true,
        capabilities: agent.skills,
        message: 'Collaboration request accepted',
      },
      id: message.id,
    };
  }

  private async handleDelegate(
    agent: AgentRegistration,
    message: A2AMessage,
  ): Promise<A2AResponse> {
    const taskId = (message.params.payload['taskId'] as string) ?? `task-${Date.now()}`;
    const skillId = (message.params.payload['skillId'] as string) ?? '';

    if (!skillId || !agent.skills.includes(skillId)) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: `Agent does not support skill "${skillId}"`,
        },
        id: message.id,
      };
    }

    const context: SkillContext = {
      agentId: agent.agentId,
      agentPersona: '',
      parameters: message.params.payload,
    };

    const result = await this.skillExecutor.executeSkill(skillId, context);

    return {
      jsonrpc: '2.0',
      result: { taskId, ...result },
      id: message.id,
    };
  }

  private handleReputationCheck(
    agent: AgentRegistration,
    message: A2AMessage,
  ): A2AResponse {
    return {
      jsonrpc: '2.0',
      result: {
        agentId: agent.agentId,
        fid: agent.fid,
        skills: agent.skills,
        registeredAt: agent.registeredAt.toISOString(),
      },
      id: message.id,
    };
  }
}

export type { A2AMessage, A2AResponse, AgentRegistration };
