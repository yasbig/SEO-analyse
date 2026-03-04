import Queue from 'bull';
import { prisma } from '../index';
import logger from '../config/logger';
import { AuditService } from './audit.service';
import { QueueStatus } from '@prisma/client';

export interface QueueJobData {
  auditId: string;
  priority?: number;
  retryCount?: number;
}

export class QueueService {
  private static auditQueue: Queue.Queue;
  private static readonly QUEUE_NAME = 'audit-queue';
  private static readonly REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

  /**
   * Initialize queue
   */
  static initialize(): void {
    this.auditQueue = new Queue(this.QUEUE_NAME, this.REDIS_URL, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 seconds
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    // Process jobs
    this.auditQueue.process(async (job) => {
      await this.processJob(job);
    });

    // Event listeners
    this.auditQueue.on('completed', (job) => {
      logger.info(`Job completed: ${job.id} - Audit: ${job.data.auditId}`);
    });

    this.auditQueue.on('failed', (job, error) => {
      logger.error(`Job failed: ${job?.id} - Audit: ${job?.data.auditId}`, error);
    });

    this.auditQueue.on('stalled', (job) => {
      logger.warn(`Job stalled: ${job.id} - Audit: ${job.data.auditId}`);
    });

    logger.info('Queue service initialized');
  }

  /**
   * Get queue instance
   */
  static getQueue(): Queue.Queue {
    if (!this.auditQueue) {
      this.initialize();
    }
    return this.auditQueue;
  }

  /**
   * Add audit to queue
   */
  static async addToQueue(auditId: string, priority: number = 0): Promise<void> {
    try {
      // Create queue record in database
      await prisma.auditQueue.create({
        data: {
          auditId,
          priority,
          status: QueueStatus.PENDING,
        },
      });

      // Add to Bull queue
      const job = await this.auditQueue.add(
        { auditId, priority },
        {
          priority,
          jobId: auditId,
        }
      );

      logger.info(`Audit added to queue: ${auditId} - Job: ${job.id}`);
    } catch (error) {
      logger.error('Add to queue error:', error);
      throw error;
    }
  }

  /**
   * Process job
   */
  private static async processJob(job: Queue.Job<QueueJobData>): Promise<void> {
    const { auditId } = job.data;
    
    try {
      // Update queue status
      await prisma.auditQueue.update({
        where: { auditId },
        data: {
          status: QueueStatus.PROCESSING,
          attempts: job.attemptsMade + 1,
          processedAt: new Date(),
        },
      });

      // Process audit
      await AuditService.processAudit(auditId);

      // Update queue status to completed
      await prisma.auditQueue.update({
        where: { auditId },
        data: {
          status: QueueStatus.COMPLETED,
        },
      });

      logger.info(`Audit processed successfully: ${auditId}`);
    } catch (error) {
      logger.error(`Audit processing failed: ${auditId}`, error);

      // Update queue status
      await prisma.auditQueue.update({
        where: { auditId },
        data: {
          status: QueueStatus.FAILED,
          error: error instanceof Error ? error.message : 'Unknown error',
          attempts: job.attemptsMade + 1,
        },
      });

      // Check if we should retry
      if (job.attemptsMade < (job.opts.attempts || 3)) {
        throw error; // Bull will retry
      }

      // Max attempts reached
      await prisma.auditQueue.update({
        where: { auditId },
        data: {
          status: QueueStatus.FAILED,
        },
      });
    }
  }

  /**
   * Get queue stats
   */
  static async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const queue = this.getQueue();
      
      const [
        waiting,
        active,
        completed,
        failed,
        delayed,
      ] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
      };
    } catch (error) {
      logger.error('Get queue stats error:', error);
      throw error;
    }
  }

  /**
   * Get pending audits from database
   */
  static async getPendingAudits(limit: number = 100): Promise<any[]> {
    try {
      const pendingAudits = await prisma.auditQueue.findMany({
        where: {
          status: QueueStatus.PENDING,
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' },
        ],
        take: limit,
        include: {
          audit: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return pendingAudits;
    } catch (error) {
      logger.error('Get pending audits error:', error);
      throw error;
    }
  }

  /**
   * Get failed audits
   */
  static async getFailedAudits(limit: number = 100): Promise<any[]> {
    try {
      const failedAudits = await prisma.auditQueue.findMany({
        where: {
          status: QueueStatus.FAILED,
        },
        orderBy: { processedAt: 'desc' },
        take: limit,
        include: {
          audit: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return failedAudits;
    } catch (error) {
      logger.error('Get failed audits error:', error);
      throw error;
    }
  }

  /**
   * Retry failed audit
   */
  static async retryFailedAudit(auditId: string): Promise<void> {
    try {
      const queueRecord = await prisma.auditQueue.findUnique({
        where: { auditId },
      });

      if (!queueRecord) {
        throw new Error('Queue record not found');
      }

      if (queueRecord.status !== QueueStatus.FAILED) {
        throw new Error('Only failed audits can be retried');
      }

      // Reset queue record
      await prisma.auditQueue.update({
        where: { auditId },
        data: {
          status: QueueStatus.PENDING,
          attempts: 0,
          error: null,
          processedAt: null,
        },
      });

      // Add back to queue
      await this.addToQueue(auditId, queueRecord.priority);

      logger.info(`Failed audit retried: ${auditId}`);
    } catch (error) {
      logger.error('Retry failed audit error:', error);
      throw error;
    }
  }

  /**
   * Clean old completed jobs
   */
  static async cleanOldJobs(days: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await prisma.auditQueue.deleteMany({
        where: {
          status: QueueStatus.COMPLETED,
          processedAt: {
            lt: cutoffDate,
          },
        },
      });

      logger.info(`Cleaned ${result.count} old queue records`);
      return result.count;
    } catch (error) {
      logger.error('Clean old jobs error:', error);
      throw error;
    }
  }

  /**
   * Get queue health status
   */
  static async getHealthStatus(): Promise<{
    healthy: boolean;
    message: string;
    stats: any;
    issues?: string[];
  }> {
    try {
      const issues: string[] = [];
      
      // Check Redis connection
      const queue = this.getQueue();
      const client = queue.client;
      
      try {
        await client.ping();
      } catch (error) {
        issues.push('Redis connection failed');
      }

      // Check queue stats
      const stats = await this.getQueueStats();
      
      // Check for stuck jobs
      if (stats.active > 10) {
        issues.push(`High number of active jobs: ${stats.active}`);
      }

      if (stats.failed > 50) {
        issues.push(`High number of failed jobs: ${stats.failed}`);
      }

      // Check database queue records
      const pendingCount = await prisma.auditQueue.count({
        where: { status: QueueStatus.PENDING },
      });

      if (pendingCount > 100) {
        issues.push(`High number of pending audits: ${pendingCount}`);
      }

      const healthy = issues.length === 0;

      return {
        healthy,
        message: healthy ? 'Queue is healthy' : 'Queue has issues',
        stats: {
          ...stats,
          pendingInDb: pendingCount,
        },
        issues: issues.length > 0 ? issues : undefined,
      };
    } catch (error) {
      logger.error('Get queue health error:', error);
      return {
        healthy: false,
        message: 'Error checking queue health',
        stats: {},
        issues: ['Health check failed'],
      };
    }
  }

  /**
   * Pause queue processing
   */
  static async pauseQueue(): Promise<void> {
    try {
      await this.auditQueue.pause();
      logger.info('Queue paused');
    } catch (error) {
      logger.error('Pause queue error:', error);
      throw error;
    }
  }

  /**
   * Resume queue processing
   */
  static async resumeQueue(): Promise<void> {
    try {
      await this.auditQueue.resume();
      logger.info('Queue resumed');
    } catch (error) {
      logger.error('Resume queue error:', error);
      throw error;
    }
  }

  /**
   * Empty queue (for testing/maintenance)
   */
  static async emptyQueue(): Promise<void> {
    try {
      await this.auditQueue.empty();
      logger.info('Queue emptied');
    } catch (error) {
      logger.error('Empty queue error:', error);
      throw error;
    }
  }
}