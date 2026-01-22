import mongoose from 'mongoose';
import { Auction, IAuction } from '../../models/Auction';
import { Bid } from '../../models/Bid';
import { BalanceService } from '../balance/balance.service';
import { BalanceTransaction } from '../../models/BalanceTransaction';
import { logger } from '../../infra/logger';
import { getIO } from '../../infra/socket';

export interface CreateAuctionDto {
  itemId: string;
  itemName: string;
  sellerId: mongoose.Types.ObjectId;
  startPrice: number;
  minStep: number;
  startAt: Date;
  duration: number; // в секундах для первого раунда
  antiSnipingSeconds?: number;
  winnersPerRound: number;
  totalRounds: number;
  roundsConfig?: Array<{
    winners: number;
    duration: number; // seconds
  }>;
}

export class AuctionService {
  private static async isBidStillLocked(
    userId: mongoose.Types.ObjectId,
    bidId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ): Promise<boolean> {
    const lockTx = await BalanceTransaction.findOne({
      userId,
      refId: bidId,
      type: 'lock'
    }).session(session);

    if (!lockTx) return false;

    const endTx = await BalanceTransaction.findOne({
      userId,
      refId: bidId,
      type: { $in: ['unlock', 'withdraw'] }
    }).session(session);

    return !endTx;
  }

  private static async refundRemainingBids(
    auctionId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ): Promise<void> {
    const remainingBids = await Bid.find({
      auctionId,
      isWinning: false
    }).session(session);

    for (const bid of remainingBids) {
      const stillLocked = await this.isBidStillLocked(bid.userId, bid._id, session);
      if (!stillLocked) continue;

      try {
        await BalanceService.unlockBalance(
          bid.userId,
          bid.amount,
          bid._id,
          `Auction ${auctionId} finished - refund`,
          session
        );
      } catch (error: any) {
        if (error?.message === 'Insufficient locked balance') {
          logger.warn(`Skipping refund for bid ${bid._id} - insufficient locked balance`, {
            bidId: bid._id,
            auctionId,
            userId: bid.userId,
            bidAmount: bid.amount
          });
        } else {
          throw error;
        }
      }
    }
  }
  /**
   * Создать новый аукцион
   */
  static async createAuction(dto: CreateAuctionDto): Promise<IAuction> {
    const endAt = new Date(dto.startAt.getTime() + dto.duration * 1000);

    const auction = await Auction.create({
      itemId: dto.itemId,
      itemName: dto.itemName,
      sellerId: dto.sellerId,
      startPrice: dto.startPrice,
      currentPrice: dto.startPrice,
      minStep: dto.minStep,
      startAt: dto.startAt,
      endAt,
      status: dto.startAt <= new Date() ? 'active' : 'scheduled',
      antiSnipingSeconds: dto.antiSnipingSeconds || 30,
      winnersPerRound: dto.winnersPerRound,
      totalRounds: dto.totalRounds,
      roundsConfig: dto.roundsConfig,
      roundNumber: 1
    });

    logger.info(`Auction created`, { auctionId: auction._id, itemId: dto.itemId });
    return auction;
  }

  /**
   * Получить активные и завершённые аукционы
   */
  static async getActiveAuctions(): Promise<IAuction[]> {
    return Auction.find({ status: { $in: ['active', 'finished'] } })
      .sort({ status: 1, endAt: -1 }) // active сначала, потом по дате (новые первыми)
      .populate('sellerId', 'username')
      .lean() as any; // lean() возвращает plain objects, не документы
  }

  /**
   * Получить аукцион по ID
   */
  static async getAuctionById(auctionId: mongoose.Types.ObjectId): Promise<IAuction | null> {
    return Auction.findById(auctionId)
      .populate('sellerId', 'username')
      .populate('highestBidId')
      .populate('winners.userId', 'username')
      .populate('winners.bidId')
      .lean() as any; // lean() возвращает plain objects, не документы
  }

  /**
   * Получить топ ставок аукциона (для определения победителей)
   */
  static async getTopBids(
    auctionId: mongoose.Types.ObjectId,
    roundNumber: number,
    limit: number
  ) {
    return Bid.find({
      auctionId,
      roundNumber,
      isWinning: false
    })
      .sort({ amount: -1, createdAt: 1 })
      .limit(limit)
      .lean() as any; // lean() возвращает plain objects
  }

  /**
   * Завершить раунд аукциона
   * Определяет победителей, списывает средства, начисляет продавцу
   */
  static async finishRound(auctionId: mongoose.Types.ObjectId): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const auction = await Auction.findById(auctionId).session(session);
      if (!auction || auction.status !== 'active') {
        await session.abortTransaction();
        return;
      }

      const now = new Date();
      if (auction.endAt > now) {
        // Раунд ещё не закончился
        await session.abortTransaction();
        return;
      }

      // Получаем все активные ставки текущего раунда для проверки заблокированных средств
      const winnerUserIds = (auction.winners || []).map((winner) => winner.userId);
      const allBids = await Bid.find({
        auctionId,
        roundNumber: auction.roundNumber,
        isWinning: false,
        ...(winnerUserIds.length > 0 ? { userId: { $nin: winnerUserIds } } : {})
      })
        .sort({ amount: -1, createdAt: 1 })
        .session(session);

      // Фильтруем ставки: проверяем, что у пользователя достаточно заблокированных средств
      // И что каждый пользователь выигрывает только один раз в раунде
      const validBids: typeof allBids = [];
      const priorWinners = new Set(
        (auction.winners || []).map((winner) => winner.userId.toString())
      );
      const currentRoundWinners = new Set<string>(); // Победители текущего раунда
      
      for (const bid of allBids) {
        const userIdStr = bid.userId.toString();

        if (priorWinners.has(userIdStr)) {
          // Победители прошлых раундов не могут выигрывать снова
          continue;
        }

        if (currentRoundWinners.has(userIdStr)) {
          // Пользователь уже выбран победителем в этом раунде
          continue;
        }

        // IMPORTANT: Проверяем, что конкретная ставка реально ещё "залочена" (а не общий lockedBalance пользователя).
        // lockedBalance может включать средства из других аукционов/ставок и не гарантирует, что эта ставка действительна.
        const stillLocked = await this.isBidStillLocked(bid.userId, bid._id, session);
        if (!stillLocked) {
          logger.warn(`Skipping bid ${bid._id} - bid is not locked (already unlocked/withdrawn)`, {
            bidId: bid._id,
            userId: bid.userId,
            bidAmount: bid.amount
          });
          continue;
        }

        validBids.push(bid);
        currentRoundWinners.add(userIdStr); // Отмечаем пользователя как победителя
        if (validBids.length >= auction.winnersPerRound) {
          break;
        }
      }

      const topBids = validBids.slice(0, auction.winnersPerRound);

      logger.info(`Finishing round ${auction.roundNumber} of auction ${auctionId}`, {
        auctionId,
        roundNumber: auction.roundNumber,
        totalBidsInRound: allBids.length,
        validBidsFound: validBids.length,
        actualWinnersSelected: topBids.length,
        winnersPerRound: auction.winnersPerRound
      });

      // Отмечаем победителей и списываем средства
      // Все ставки в topBids уже проверены на наличие заблокированных средств
      let totalRevenue = 0;
      for (const bid of topBids) {
        bid.isWinning = true;
        await bid.save({ session });

        // Списываем заблокированные средства
        // Дополнительная проверка перед списанием (race condition protection)
        try {
          await BalanceService.withdraw(
            bid.userId,
            bid.amount,
            bid._id,
            `Won auction ${auctionId}, round ${auction.roundNumber}`,
            session
          );
        } catch (error: any) {
          if (error.message === 'Insufficient locked balance') {
            logger.error(`Failed to withdraw for bid ${bid._id} - locked balance changed`, {
              bidId: bid._id,
              userId: bid.userId,
              bidAmount: bid.amount
            });
            // Помечаем ставку как не выигрышную и пропускаем
            bid.isWinning = false;
            await bid.save({ session });
            continue;
          }
          throw error;
        }

        // Начисляем продавцу (90% от ставки, 10% комиссия платформы)
        // Используем целочисленную арифметику для избежания потери точности
        const sellerAmount = Math.floor(bid.amount * 9 / 10);
        // NOTE: В production комиссия должна начисляться системному аккаунту
        // Для демо начисляем продавцу (это технический долг)

        await BalanceService.deposit(
          auction.sellerId,
          sellerAmount,
          `Revenue from auction ${auctionId}, round ${auction.roundNumber} (90% of ${bid.amount})`,
          session
        );

        // В production здесь должна быть запись комиссии платформы в системный аккаунт
        // const platformFee = bid.amount - sellerAmount;
        // await BalanceService.deposit(systemAccountId, platformFee, ...);

        totalRevenue += bid.amount;

        // Добавляем в список победителей
        auction.winners.push({
          userId: bid.userId,
          bidId: bid._id as mongoose.Types.ObjectId,
          amount: bid.amount,
          roundNumber: auction.roundNumber
        });
      }

      // Возвращаем средства проигравшим
      // Важно: некоторые ставки могли быть уже разблокированы при размещении новых ставок
      // (когда пользователь делал новую ставку, старая разблокировалась автоматически)
      const losingBids = await Bid.find({
        auctionId,
        roundNumber: auction.roundNumber,
        isWinning: false,
        _id: { $nin: topBids.map(b => b._id) }
      }).session(session);

      for (const bid of losingBids) {
        // Проверяем, действительно ли эта ставка ещё заблокирована
        // (используем транзакционную проверку, а не user.lockedBalance,
        // так как lockedBalance может содержать средства от других аукционов)
        const stillLocked = await this.isBidStillLocked(bid.userId, bid._id, session);
        if (!stillLocked) {
          logger.info(`Skipping unlock for bid ${bid._id} - already unlocked or withdrawn`, {
            bidId: bid._id,
            userId: bid.userId,
            bidAmount: bid.amount
          });
          continue;
        }

        // Разблокируем ставку
        try {
          await BalanceService.unlockBalance(
            bid.userId,
            bid.amount,
            bid._id,
            `Lost auction ${auctionId}, round ${auction.roundNumber}`,
            session
          );
        } catch (error: any) {
          // Если всё равно ошибка (например, из-за race condition),
          // логируем и продолжаем обработку остальных ставок
          if (error?.message === 'Insufficient locked balance') {
            logger.warn(`Skipping unlock for bid ${bid._id} - insufficient locked balance`, {
              bidId: bid._id,
              userId: bid.userId,
              bidAmount: bid.amount
            });
          } else {
            logger.error(`Failed to unlock bid ${bid._id}: ${error.message}`, {
              bidId: bid._id,
              userId: bid.userId,
              bidAmount: bid.amount,
              error: error.message
            });
          }
          // Не прерываем транзакцию - продолжаем обработку остальных ставок
        }
      }

      // Переходим к следующему раунду или завершаем аукцион
      if (auction.roundNumber < auction.totalRounds) {
        // Следующий раунд
        auction.roundNumber += 1;
        // Применяем конфигурацию следующего раунда (если задана), иначе используем дефолт 5 минут.
        const nextRoundIdx = auction.roundNumber - 1; // roundNumber is 1-based
        const nextCfg =
          Array.isArray((auction as any).roundsConfig) ? (auction as any).roundsConfig[nextRoundIdx] : undefined;
        const nextWinnersPerRound = nextCfg?.winners ?? auction.winnersPerRound;
        const nextDurationSeconds = nextCfg?.duration ?? 300;

        auction.winnersPerRound = nextWinnersPerRound;
        auction.endAt = new Date(now.getTime() + nextDurationSeconds * 1000);
        auction.currentPrice = auction.startPrice; // Сбрасываем цену для нового раунда
        auction.highestBidId = undefined;
        auction.extendedAt = []; // Сбрасываем логи продлений
        auction.status = 'active';

        logger.info(`Starting round ${auction.roundNumber} of auction ${auctionId}`, {
          auctionId,
          newRound: auction.roundNumber,
          newEndAt: auction.endAt,
          winnersPerRound: auction.winnersPerRound,
          durationSeconds: nextDurationSeconds
        });
      } else {
        // Все раунды завершены
        auction.status = 'finished';

        await this.refundRemainingBids(auctionId, session);

        logger.info(`Auction ${auctionId} finished all rounds`, {
          auctionId,
          totalRounds: auction.totalRounds,
          totalWinners: auction.winners.length
        });
      }

      await auction.save({ session });
      await session.commitTransaction();

      // Отправляем WebSocket уведомление о завершении раунда
      try {
        const updatedAuction = await Auction.findById(auctionId).lean() as any;
        getIO().to(`auction:${auctionId}`).emit('round:finished', {
          auction: updatedAuction,
          roundNumber: auction.roundNumber - 1,
          winners: topBids.length
        });
      } catch (wsError: any) {
        logger.error('Error sending WebSocket notification', { error: wsError.message });
      }

      logger.info(`Round ${auction.roundNumber - 1} finished successfully`, {
        auctionId,
        winners: topBids.length,
        totalRevenue
      });
    } catch (error: any) {
      await session.abortTransaction();
      logger.error('Error finishing round', { error: error.message, auctionId, stack: error.stack });
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Активировать запланированные аукционы
   */
  static async activateScheduledAuctions(): Promise<void> {
    const now = new Date();
    const result = await Auction.updateMany(
      {
        status: 'scheduled',
        startAt: { $lte: now }
      },
      {
        $set: { status: 'active' }
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Activated ${result.modifiedCount} scheduled auctions`);
    }
  }
}

