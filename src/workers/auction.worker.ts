import { Worker, Queue } from 'bullmq';
import { getBullMQConnectionConfig } from '../infra/redis';
import { AuctionService } from '../modules/auctions/auction.service';
import { logger } from '../infra/logger';
import { Auction } from '../models/Auction';

// Конфигурация подключения Redis для BullMQ
// BullMQ создаст свой экземпляр Redis на основе этой конфигурации
// Это решает проблему конфликта версий ioredis
const bullmqConnectionConfig = getBullMQConnectionConfig();

export const auctionQueue = new Queue('auction-processing', {
  connection: bullmqConnectionConfig
});

/**
 * Фоновая задача для завершения раундов аукционов
 */
export const auctionWorker = new Worker(
  'auction-processing',
  async (job) => {
    const { auctionId } = job.data;
    logger.info(`Processing auction ${auctionId}`, { jobId: job.id });

    try {
      await AuctionService.finishRound(auctionId);
      return { success: true, auctionId };
    } catch (error: any) {
      logger.error(`Error processing auction ${auctionId}`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  },
  {
    connection: bullmqConnectionConfig,
    concurrency: 5, // обрабатываем до 5 аукционов одновременно
    limiter: {
      max: 100,
      duration: 1000
    }
  }
);

auctionWorker.on('completed', (job) => {
  logger.info(`Auction processing job completed`, { jobId: job.id });
});

auctionWorker.on('failed', (job, err) => {
  logger.error(`Auction processing job failed`, {
    jobId: job?.id,
    error: err.message
  });
});

/**
 * Периодическая задача: активировать запланированные аукционы
 */
export async function activateScheduledAuctions() {
  try {
    await AuctionService.activateScheduledAuctions();
  } catch (error: any) {
    logger.error('Error activating scheduled auctions', { error: error.message });
  }
}

/**
 * Периодическая задача: проверять и завершать истёкшие раунды
 */
export async function processExpiredRounds() {
  try {
    const now = new Date();
    const expiredAuctions = await Auction.find({
      status: 'active',
      endAt: { $lte: now }
    }).lean() as any; // lean() возвращает plain objects

    logger.info(`Found ${expiredAuctions.length} expired auctions to process`);

    for (const auction of expiredAuctions) {
      // Добавляем задачу в очередь для обработки
      await auctionQueue.add(
        'finish-round',
        { auctionId: auction._id },
        {
          jobId: `finish-round-${auction._id}-${Date.now()}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      );
    }
  } catch (error: any) {
    logger.error('Error processing expired rounds', { error: error.message });
  }
}

