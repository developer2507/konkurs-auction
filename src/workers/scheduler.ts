import { processExpiredRounds, activateScheduledAuctions } from './auction.worker';
import { logger } from '../infra/logger';

/**
 * Планировщик задач
 * Запускает периодические проверки каждые 5 секунд
 */
export class Scheduler {
  private intervals: NodeJS.Timeout[] = [];

  start() {
    logger.info('Starting scheduler...');

    // Проверяем истёкшие раунды каждые 5 секунд
    const expiredRoundsInterval = setInterval(async () => {
      try {
        await processExpiredRounds();
      } catch (error: any) {
        logger.error('Error in expired rounds check', { error: error.message });
      }
    }, 5000);

    // Активируем запланированные аукционы каждые 10 секунд
    const scheduledAuctionsInterval = setInterval(async () => {
      try {
        await activateScheduledAuctions();
      } catch (error: any) {
        logger.error('Error activating scheduled auctions', { error: error.message });
      }
    }, 10000);

    this.intervals.push(expiredRoundsInterval, scheduledAuctionsInterval);

    logger.info('Scheduler started');
  }

  stop() {
    logger.info('Stopping scheduler...');
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    logger.info('Scheduler stopped');
  }
}

export const scheduler = new Scheduler();

