import pino from 'pino';
import { logger as rootLogger } from '../config.js';

export enum SkillType {
  CONTENT_GENERATION = 'content-generation',
  ANALYTICS = 'analytics',
  ENGAGEMENT = 'engagement',
}

interface SkillContext {
  agentId: string;
  agentPersona: string;
  parameters: Record<string, unknown>;
}

interface SkillResult {
  success: boolean;
  output: unknown;
  executionTimeMs: number;
  skillId: string;
}

interface SkillDefinition {
  id: string;
  name: string;
  type: SkillType;
  timeoutMs: number;
  execute: (context: SkillContext) => Promise<unknown>;
}

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

export class SkillExecutor {
  private readonly skills: Map<string, SkillDefinition> = new Map();
  private readonly logger: pino.Logger;

  constructor() {
    this.logger = rootLogger.child({ module: 'SkillExecutor' });
  }

  registerSkill(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      this.logger.warn({ skillId: skill.id }, 'Overwriting existing skill registration');
    }

    this.skills.set(skill.id, skill);
    this.logger.info({ skillId: skill.id, name: skill.name, type: skill.type }, 'Skill registered');
  }

  unregisterSkill(skillId: string): boolean {
    const removed = this.skills.delete(skillId);
    if (removed) {
      this.logger.info({ skillId }, 'Skill unregistered');
    }
    return removed;
  }

  getRegisteredSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  async executeSkill(skillId: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      this.logger.error({ skillId }, 'Skill not found');
      return {
        success: false,
        output: { error: `Skill "${skillId}" not found` },
        executionTimeMs: 0,
        skillId,
      };
    }

    const timeoutMs = skill.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    this.logger.info(
      { skillId, agentId: context.agentId, timeoutMs },
      'Executing skill',
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
        'Skill executed successfully',
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
        'Skill execution failed',
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

export type { SkillContext, SkillResult, SkillDefinition };
