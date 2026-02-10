import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import type { ContentStrategy } from '../strategies/posting.js';

interface ScheduleConfig {
  intervalMs: number;
  postsPerDay: number;
  jitterMs: number;
}

const STRATEGY_SCHEDULES: Record<string, ScheduleConfig> = {
  Balanced: {
    intervalMs: 6 * 60 * 60 * 1000, // 6 hours
    postsPerDay: 4,
    jitterMs: 30 * 60 * 1000, // +-30 min
  },
  TextHeavy: {
    intervalMs: 4 * 60 * 60 * 1000, // 4 hours
    postsPerDay: 6,
    jitterMs: 20 * 60 * 1000, // +-20 min
  },
  MediaHeavy: {
    intervalMs: 8 * 60 * 60 * 1000, // 8 hours
    postsPerDay: 3,
    jitterMs: 40 * 60 * 1000, // +-40 min
  },
};

const MAX_JITTER_MS = 60 * 1000; // 60 seconds random delay

export class AgentScheduler {
  private readonly postingQueue: Queue;
  private readonly metricsQueue: Queue;
  private readonly logger: pino.Logger;
  private readonly activeSchedules: Map<string, string[]> = new Map();

  constructor(connection: Redis) {
    this.postingQueue = new Queue('scheduled-posting', {
      connection: connection.duplicate(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });

    this.metricsQueue = new Queue('metrics-collection', {
      connection: connection.duplicate(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
      },
    });

    this.logger = rootLogger.child({ module: 'AgentScheduler' });
  }

  async scheduleAgent(agentId: string, strategy: ContentStrategy): Promise<void> {
    const scheduleConfig = STRATEGY_SCHEDULES[strategy.name] ?? STRATEGY_SCHEDULES['Balanced'];
    if (!scheduleConfig) {
      throw new Error(`Unknown strategy: ${strategy.name}`);
    }

    this.logger.info(
      {
        agentId,
        strategy: strategy.name,
        intervalMs: scheduleConfig.intervalMs,
        postsPerDay: scheduleConfig.postsPerDay,
      },
      'Scheduling agent',
    );

    // Remove existing schedules for this agent
    await this.unscheduleAgent(agentId);

    const jobIds: string[] = [];

    // Schedule content posting as repeatable job
    const postingJobId = `posting-${agentId}`;
    await this.postingQueue.add(
      'generate-and-post',
      {
        agentId,
        strategy: strategy.name,
        scheduledAt: new Date().toISOString(),
      },
      {
        jobId: postingJobId,
        repeat: {
          every: scheduleConfig.intervalMs,
        },
        delay: this.calculateJitter(scheduleConfig.jitterMs),
      } as JobsOptions,
    );
    jobIds.push(postingJobId);

    // Schedule metrics collection (hourly)
    const metricsJobId = `metrics-${agentId}`;
    await this.metricsQueue.add(
      'collect-metrics',
      {
        agentId,
        scheduledAt: new Date().toISOString(),
      },
      {
        jobId: metricsJobId,
        repeat: {
          every: 60 * 60 * 1000, // 1 hour
        },
      } as JobsOptions,
    );
    jobIds.push(metricsJobId);

    this.activeSchedules.set(agentId, jobIds);

    this.logger.info({ agentId, jobCount: jobIds.length }, 'Agent scheduled successfully');
  }

  async unscheduleAgent(agentId: string): Promise<void> {
    this.logger.info({ agentId }, 'Unscheduling agent');

    // Remove repeatable jobs from posting queue
    const postingRepeatables = await this.postingQueue.getRepeatableJobs();
    for (const job of postingRepeatables) {
      if (job.id === `posting-${agentId}` || job.name === `posting-${agentId}`) {
        await this.postingQueue.removeRepeatableByKey(job.key);
        this.logger.debug({ agentId, jobKey: job.key }, 'Removed posting repeatable');
      }
    }

    // Remove repeatable jobs from metrics queue
    const metricsRepeatables = await this.metricsQueue.getRepeatableJobs();
    for (const job of metricsRepeatables) {
      if (job.id === `metrics-${agentId}` || job.name === `metrics-${agentId}`) {
        await this.metricsQueue.removeRepeatableByKey(job.key);
        this.logger.debug({ agentId, jobKey: job.key }, 'Removed metrics repeatable');
      }
    }

    this.activeSchedules.delete(agentId);
    this.logger.info({ agentId }, 'Agent unscheduled');
  }

  getActiveSchedules(): Map<string, string[]> {
    return new Map(this.activeSchedules);
  }

  async getQueueStats(): Promise<{
    posting: { waiting: number; active: number; completed: number; failed: number };
    metrics: { waiting: number; active: number; completed: number; failed: number };
  }> {
    const [postingWaiting, postingActive, postingCompleted, postingFailed] = await Promise.all([
      this.postingQueue.getWaitingCount(),
      this.postingQueue.getActiveCount(),
      this.postingQueue.getCompletedCount(),
      this.postingQueue.getFailedCount(),
    ]);

    const [metricsWaiting, metricsActive, metricsCompleted, metricsFailed] = await Promise.all([
      this.metricsQueue.getWaitingCount(),
      this.metricsQueue.getActiveCount(),
      this.metricsQueue.getCompletedCount(),
      this.metricsQueue.getFailedCount(),
    ]);

    return {
      posting: {
        waiting: postingWaiting,
        active: postingActive,
        completed: postingCompleted,
        failed: postingFailed,
      },
      metrics: {
        waiting: metricsWaiting,
        active: metricsActive,
        completed: metricsCompleted,
        failed: metricsFailed,
      },
    };
  }

  private calculateJitter(maxJitterMs: number): number {
    const jitter = Math.floor(Math.random() * Math.min(maxJitterMs, MAX_JITTER_MS));
    return jitter;
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down scheduler queues');
    await Promise.allSettled([this.postingQueue.close(), this.metricsQueue.close()]);
    this.logger.info('Scheduler queues closed');
  }
}
