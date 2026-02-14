import type { Worker } from 'bullmq';
import type pino from 'pino';

/**
 * Register graceful shutdown handlers for all BullMQ workers.
 *
 * On SIGTERM/SIGINT, each worker stops accepting new jobs, waits for
 * in-progress jobs to finish (up to `graceMs`), then exits cleanly.
 */
export function registerShutdownHandlers(
  workers: Worker[],
  logger: pino.Logger,
  graceMs = 30_000,
): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal, workerCount: workers.length }, 'Graceful shutdown initiated');

    const shutdownTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, graceMs);

    try {
      await Promise.allSettled(
        workers.map(async (worker) => {
          logger.info({ name: worker.name }, 'Closing worker...');
          await worker.close();
          logger.info({ name: worker.name }, 'Worker closed');
        }),
      );

      clearTimeout(shutdownTimer);
      logger.info('All workers closed, exiting');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      clearTimeout(shutdownTimer);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection');
  });
}
