/**
 * Scraping Queue Service
 * Manages a queue of scraping tasks to prevent overload and ensure orderly processing
 * Simple implementation without external dependencies
 */

import { Logger } from '../config/logger';

const logger = Logger.getInstance();

interface QueueTask<T = any> {
  id: string;
  query: string;
  priority: number;
  createdAt: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  queueSize: number;
  isPaused: boolean;
}

export class ScrapingQueueService {
  private static instance: ScrapingQueueService;
  private tasks: QueueTask[] = [];
  private activeTasks: Set<string> = new Set();
  private completedCount = 0;
  private failedCount = 0;
  private isPaused = false;

  private readonly maxConcurrency = 3;      // Máximo 3 scrapes simultáneos
  private readonly maxPerInterval = 5;      // Máximo 5 tareas por intervalo
  private readonly intervalMs = 10000;      // Intervalo de 10 segundos
  private requestTimestamps: number[] = [];

  private constructor() {
    logger.info('🎯 Scraping Queue initialized (concurrency: 3, rate: 5 per 10s)');
    
    // Procesar cola cada segundo
    setInterval(() => this.processQueue(), 1000);
    
    // Limpiar timestamps antiguos cada 30 segundos
    setInterval(() => this.cleanTimestamps(), 30000);
  }

  static getInstance(): ScrapingQueueService {
    if (!ScrapingQueueService.instance) {
      ScrapingQueueService.instance = new ScrapingQueueService();
    }
    return ScrapingQueueService.instance;
  }

  /**
   * Procesa la cola de tareas
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused || this.tasks.length === 0) {
      return;
    }

    // Verificar límite de concurrencia
    if (this.activeTasks.size >= this.maxConcurrency) {
      return;
    }

    // Verificar rate limiting por intervalo
    const recentRequests = this.getRequestsInInterval();
    if (recentRequests >= this.maxPerInterval) {
      return;
    }

    // Ordenar por prioridad (mayor primero)
    this.tasks.sort((a, b) => b.priority - a.priority);

    // Tomar siguiente tarea
    const task = this.tasks.shift();
    if (!task) return;

    this.activeTasks.add(task.id);
    this.requestTimestamps.push(Date.now());

    logger.debug(`🚀 Executing task: ${task.id} (active: ${this.activeTasks.size})`);

    try {
      const result = await task.execute();
      this.completedCount++;
      task.resolve(result);
      logger.info(`✅ Task completed: ${task.id}`);
    } catch (error) {
      this.failedCount++;
      task.reject(error);
      logger.error(`❌ Task failed: ${task.id}`, error);
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Obtiene número de requests en el intervalo actual
   */
  private getRequestsInInterval(): number {
    const cutoff = Date.now() - this.intervalMs;
    return this.requestTimestamps.filter(t => t > cutoff).length;
  }

  /**
   * Limpia timestamps antiguos
   */
  private cleanTimestamps(): void {
    const cutoff = Date.now() - this.intervalMs * 2;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > cutoff);
  }

  /**
   * Agrega una tarea de scraping al queue
   * @param taskId - ID único de la tarea
   * @param scrapeFn - Función async que ejecuta el scraping
   * @param priority - Prioridad (mayor = más prioritario)
   */
  async addTask<T>(
    taskId: string,
    query: string,
    scrapeFn: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    // Verificar si la tarea ya existe
    if (this.tasks.some(t => t.id === taskId) || this.activeTasks.has(taskId)) {
      logger.warn(`⚠️  Task ${taskId} already in queue, skipping`);
      throw new Error(`Task ${taskId} already queued`);
    }

    logger.info(`➕ Added task to queue: ${taskId} (priority: ${priority}, queue size: ${this.tasks.length + 1})`);

    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        id: taskId,
        query,
        priority,
        createdAt: Date.now(),
        execute: scrapeFn,
        resolve,
        reject
      };

      this.tasks.push(task);
    });
  }

  /**
   * Verifica si una tarea está en el queue
   */
  hasTask(taskId: string): boolean {
    return this.tasks.some(t => t.id === taskId) || this.activeTasks.has(taskId);
  }

  /**
   * Obtiene la posición de una tarea en el queue
   */
  getTaskPosition(taskId: string): number {
    const index = this.tasks.findIndex(t => t.id === taskId);
    return index >= 0 ? index + 1 : -1;
  }

  /**
   * Pausa el queue (útil para mantenimiento o rate limiting severo)
   */
  pause(): void {
    this.isPaused = true;
    logger.warn('⏸️  Queue PAUSED - no new tasks will be executed');
  }

  /**
   * Resume el queue
   */
  resume(): void {
    this.isPaused = false;
    logger.info('▶️  Queue RESUMED - processing tasks');
  }

  /**
   * Limpia todas las tareas pendientes
   */
  clear(): void {
    this.tasks = [];
    logger.warn('🗑️  Queue CLEARED - all pending tasks removed');
  }

  /**
   * Espera hasta que el queue esté idle (todas las tareas completadas)
   */
  async waitUntilIdle(): Promise<void> {
    while (this.tasks.length > 0 || this.activeTasks.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    logger.info('✅ Queue idle - all tasks completed');
  }

  /**
   * Obtiene estadísticas del queue
   */
  getStats(): QueueStats {
    return {
      pending: this.tasks.length,
      active: this.activeTasks.size,
      completed: this.completedCount,
      failed: this.failedCount,
      queueSize: this.tasks.length,
      isPaused: this.isPaused
    };
  }

  /**
   * Obtiene información detallada de las tareas en cola
   */
  getQueuedTasks(): Array<{ id: string; query: string; priority: number; createdAt: number }> {
    return this.tasks
      .map(t => ({
        id: t.id,
        query: t.query,
        priority: t.priority,
        createdAt: t.createdAt
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Configura los límites del queue (útil para ajustes dinámicos)
   */
  configure(options: {
    maxConcurrency?: number;
  }): void {
    if (options.maxConcurrency !== undefined) {
      (this as any).maxConcurrency = options.maxConcurrency;
      logger.info(`⚙️  Queue concurrency set to: ${options.maxConcurrency}`);
    }
  }

  /**
   * Agrega una tarea con delay (útil para scheduling)
   */
  async addDelayedTask<T>(
    taskId: string,
    query: string,
    scrapeFn: () => Promise<T>,
    delayMs: number,
    priority: number = 0
  ): Promise<T> {
    logger.info(`⏰ Scheduling task ${taskId} with ${delayMs}ms delay`);
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    return this.addTask(taskId, query, scrapeFn, priority);
  }
}

