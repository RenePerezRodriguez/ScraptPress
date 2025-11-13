import Queue, { Job } from 'bull';
import { Logger } from '../config/logger';

const logger = Logger.getInstance();

// Redis URL for queue
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Job types
export type JobType = 'SCRAPE_COPART' | 'REFRESH_VEHICLE_DATA' | 'SEND_EMAIL' | 'CLEANUP_CACHE';

interface JobData {
  [key: string]: any;
}

class JobQueueManager {
  private static instance: JobQueueManager;
  private queues: Map<JobType, Queue.Queue> = new Map();

  private constructor() {}

  static getInstance(): JobQueueManager {
    if (!JobQueueManager.instance) {
      JobQueueManager.instance = new JobQueueManager();
    }
    return JobQueueManager.instance;
  }

  /**
   * Initialize a queue
   */
  initQueue(jobType: JobType): Queue.Queue {
    if (this.queues.has(jobType)) {
      return this.queues.get(jobType)!;
    }

    const queue = new Queue(jobType, redisUrl);

    // Queue event handlers
    queue.on('completed', (job: Job) => {
      logger.info(`✅ Job completed: ${jobType}`, { jobId: job.id, data: job.data });
    });

    queue.on('failed', (job: Job, err: Error) => {
      logger.error(`❌ Job failed: ${jobType}`, { 
        jobId: job.id, 
        error: err.message,
        attemptsMade: job.attemptsMade,
      });
    });

    queue.on('error', (err: Error) => {
      logger.error(`Queue error: ${jobType}`, err);
    });

    this.queues.set(jobType, queue);

    logger.info(`📋 Queue initialized: ${jobType}`);
    return queue;
  }

  /**
   * Add a job to queue
   */
  async addJob(
    jobType: JobType,
    data: JobData,
    options?: {
      delay?: number;
      attempts?: number;
      backoff?: { type: 'fixed' | 'exponential'; delay: number };
      removeOnComplete?: boolean;
    }
  ): Promise<Job<JobData>> {
    const queue = this.queues.get(jobType) || this.initQueue(jobType);
    
    const job = await queue.add(data, {
      attempts: options?.attempts || 3,
      backoff: options?.backoff || { type: 'exponential', delay: 2000 },
      removeOnComplete: options?.removeOnComplete !== false,
      delay: options?.delay || 0,
    });

    logger.info(`📝 Job added: ${jobType}`, { jobId: job.id });
    return job;
  }

  /**
   * Schedule a recurring job
   */
  async scheduleJob(
    jobType: JobType,
    data: JobData,
    cronExpression: string
  ): Promise<void> {
    const queue = this.queues.get(jobType) || this.initQueue(jobType);
    
    await queue.add(data, {
      repeat: {
        cron: cronExpression,
      },
      removeOnComplete: true,
    });

    logger.info(`⏰ Recurring job scheduled: ${jobType}`, { cron: cronExpression });
  }

  /**
   * Process jobs from queue
   */
  async processQueue(
    jobType: JobType,
    processor: (job: Job<JobData>) => Promise<any>,
    concurrency: number = 1
  ): Promise<void> {
    const queue = this.queues.get(jobType) || this.initQueue(jobType);
    
    await queue.process(concurrency, async (job: Job<JobData>) => {
      try {
        logger.debug(`🔄 Processing job: ${jobType}`, { jobId: job.id });
        return await processor(job);
      } catch (error) {
        logger.error(`Error processing job: ${jobType}`, error);
        throw error;
      }
    });

    logger.info(`🚀 Queue processor started: ${jobType} (concurrency: ${concurrency})`);
  }

  /**
   * Get queue stats
   */
  async getQueueStats(jobType: JobType): Promise<any> {
    const queue = this.queues.get(jobType);
    if (!queue) return null;

    const [active, waiting, completed, failed, delayed] = await Promise.all([
      queue.getActiveCount(),
      queue.getWaitingCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { active, waiting, completed, failed, delayed };
  }

  /**
   * Clear all queues
   */
  async closeAll(): Promise<void> {
    for (const [jobType, queue] of this.queues) {
      await queue.close();
    }
    this.queues.clear();
    logger.info('📊 All job queues closed');
  }
}

export default JobQueueManager;
