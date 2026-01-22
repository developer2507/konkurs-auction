import mongoose from 'mongoose';
import { Auction, IAuction } from '../../models/Auction';
import { Bid, IBid } from '../../models/Bid';
import { BalanceService } from '../balance/balance.service';
import { BalanceTransaction } from '../../models/BalanceTransaction';
import { logger } from '../../infra/logger';
import { redis } from '../../infra/redis';
import Redlock from 'redlock';

const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  // Боты/параллельные клиенты могут часто конкурировать за lock.
  // Увеличиваем количество ретраев, чтобы одиночный пользователь реже получал "processed".
  retryCount: 10,
  retryDelay: 150,
  retryJitter: 200
});

export interface BidResult {
  success: boolean;
  bid?: IBid;
  auction?: IAuction;
  error?: string;
  extended?: boolean; // было ли продлено время аукциона
}

export class BidService {
  private static async isBidStillLocked(
    userId: mongoose.Types.ObjectId,
    bidId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ): Promise<boolean> {
    // Consider a bid "locked" iff we have a lock tx and no unlock/withdraw tx for the same refId.
    // This avoids double-unlocking and, importantly, avoids unlocking unrelated locked funds
    // when user.lockedBalance contains funds from other auctions.
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

  /**
   * Разместить ставку на аукционе
   * Атомарная операция с блокировкой и транзакцией
   */
  static async placeBid(
    auctionId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    amount: number
  ): Promise<BidResult> {
    const lockKey = `auction:${auctionId}:bid`;
    let lock;

    try {
      // Получаем distributed lock через Redlock
      lock = await redlock.acquire([lockKey], 5000); // 5 секунд таймаут

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // 1. Проверяем аукцион
        const auction = await Auction.findById(auctionId).session(session);
        if (!auction) {
          await session.abortTransaction();
          return { success: false, error: 'Auction not found' };
        }

        // 2. Проверяем статус
        if (auction.status !== 'active') {
          await session.abortTransaction();
          return { success: false, error: `Auction is not active. Status: ${auction.status}` };
        }

        // 2.1 Победители прошлых раундов не участвуют дальше
        if (auction.winners?.some((winner) => winner.userId.toString() === userId.toString())) {
          await session.abortTransaction();
          return { success: false, error: 'You have already won in this auction' };
        }

        // 3. Проверяем время (не завершился ли аукцион)
        const now = new Date();
        if (auction.endAt < now) {
          await session.abortTransaction();
          return { success: false, error: 'Auction has already ended' };
        }

        // 4. Проверяем минимальный шаг
        const minRequiredBid = auction.currentPrice + auction.minStep;
        if (amount < minRequiredBid) {
          await session.abortTransaction();
          return {
            success: false,
            error: `Bid too low. Minimum required: ${minRequiredBid}, got: ${amount}`
          };
        }

        // 5. Проверяем баланс пользователя
        const user = await mongoose.models.User.findById(userId).session(session);
        if (!user) {
          await session.abortTransaction();
          return { success: false, error: 'User not found' };
        }

        // 5.1 Победители прошлых раундов не могут участвовать дальше
        const alreadyWinner = (auction.winners || []).some(
          (winner) => winner.userId.toString() === userId.toString()
        );
        if (alreadyWinner) {
          await session.abortTransaction();
          return { success: false, error: 'User already won in this auction' };
        }

        // 6. Получаем текущую максимальную ставку
        const currentHighestBid = auction.highestBidId
          ? await Bid.findById(auction.highestBidId).session(session)
          : null;

        // 7. Anti-sniping: продлеваем аукцион, если ставка в последние секунды
        let extended = false;
        const secondsUntilEnd = (auction.endAt.getTime() - now.getTime()) / 1000;
        if (secondsUntilEnd <= auction.antiSnipingSeconds) {
          auction.endAt = new Date(now.getTime() + auction.antiSnipingSeconds * 1000);
          auction.extendedAt = auction.extendedAt || [];
          auction.extendedAt.push(new Date());
          extended = true;
          logger.info(`Auction ${auctionId} extended due to anti-sniping`, {
            auctionId,
            extendedBy: auction.antiSnipingSeconds,
            newEndAt: auction.endAt
          });
        }

        // 8. Находим предыдущую ставку этого пользователя в текущем раунде.
        // Важно: без roundNumber здесь легко "зацепить" ставку из прошлого раунда,
        // которая уже могла быть разблокирована при finishRound.
        const previousBidFromUser = await Bid.findOne({
          auctionId,
          userId,
          roundNumber: auction.roundNumber,
          isWinning: false
        }).sort({ createdAt: -1 }).session(session);

        const previousBidIsLocked = previousBidFromUser
          ? await this.isBidStillLocked(userId, previousBidFromUser._id, session)
          : false;

        // Баланс-чек должен учитывать средства, которые уже заблокированы этой же ставкой в этом аукционе/раунде:
        // пользователь может повысить ставку, имея на руках только разницу.
        const availableForThisBid = user.balance + (previousBidIsLocked ? previousBidFromUser!.amount : 0);
        if (availableForThisBid < amount) {
          await session.abortTransaction();
          return { success: false, error: 'Insufficient balance' };
        }

        // 9. Если у пользователя есть ещё заблокированная предыдущая ставка в этом раунде — сначала разблокируем её,
        // чтобы затем заблокировать новую (иначе пришлось бы иметь на балансе полную сумму новой ставки).
        if (previousBidFromUser && previousBidIsLocked) {
          try {
            await BalanceService.unlockBalance(
              userId,
              previousBidFromUser.amount,
              previousBidFromUser._id,
              `Previous bid replaced on auction ${auctionId}`,
              session
            );
          } catch (error: any) {
            // Defensive: historical data might have missing tx records or older bugs could have desynced balances.
            // We don't want to fail placing a bid just because the previous bid was already refunded.
            if (error?.message === 'Insufficient locked balance') {
              logger.warn(`Skipping unlock for previousBid=${previousBidFromUser._id} - insufficient locked balance`, {
                bidId: previousBidFromUser._id,
                auctionId,
                userId,
                bidAmount: previousBidFromUser.amount
              });
            } else {
              throw error;
            }
          }
        }

        // 10. Создаём новую ставку
        const newBid = await Bid.create([{
          auctionId,
          userId,
          amount,
          roundNumber: auction.roundNumber
        }], { session });

        // 11. Блокируем средства новой ставки
        await BalanceService.lockBalance(
          userId,
          amount,
          newBid[0]._id,
          `Bid on auction ${auctionId}`,
          session
        );

        // 12. Возвращаем средства предыдущему лидеру (если он другой пользователь) — но только для single-winner аукционов.
        // Для multi-winner раундов нельзя автоматически разблокировать "перебитые" ставки:
        // перебитая ставка может всё ещё быть в топ-N и стать победителем при finishRound().
        if (
          auction.winnersPerRound === 1 &&
          currentHighestBid &&
          currentHighestBid.userId.toString() !== userId.toString()
        ) {
          const highestStillLocked = await this.isBidStillLocked(
            currentHighestBid.userId,
            currentHighestBid._id,
            session
          );
          if (highestStillLocked) {
            try {
              await BalanceService.unlockBalance(
                currentHighestBid.userId,
                currentHighestBid.amount,
                currentHighestBid._id,
                `Bid outbid on auction ${auctionId}`,
                session
              );
            } catch (error: any) {
              if (error?.message === 'Insufficient locked balance') {
                logger.warn(
                  `Skipping unlock for outbid highestBid=${currentHighestBid._id} - insufficient locked balance`,
                  {
                    bidId: currentHighestBid._id,
                    auctionId,
                    userId: currentHighestBid.userId,
                    bidAmount: currentHighestBid.amount
                  }
                );
              } else {
                throw error;
              }
            }
          } else {
            logger.warn(
              `Skipping unlock for outbid highestBid=${currentHighestBid._id} - funds already unlocked/withdrawn`,
              {
                bidId: currentHighestBid._id,
                auctionId,
                userId: currentHighestBid.userId
              }
            );
          }
        }

        // 13. Обновляем аукцион
        auction.currentPrice = amount;
        auction.highestBidId = newBid[0]._id;
        await auction.save({ session });

        await session.commitTransaction();

        logger.info(`Bid placed successfully`, {
          auctionId,
          userId,
          amount,
          extended
        });

        // Обновлённый аукцион для возврата
        const updatedAuction = await Auction.findById(auctionId);

        return {
          success: true,
          bid: newBid[0],
          auction: updatedAuction!,
          extended
        };
      } catch (error: any) {
        await session.abortTransaction();
        logger.error('Error in bid transaction', { error: error.message, stack: error.stack });
        throw error;
      } finally {
        await session.endSession();
      }
    } catch (error: any) {
      logger.error('Error placing bid', { error: error.message, name: error.name, auctionId, userId });
      
      // Проверяем, не связано ли это с блокировкой
      const msg = String(error.message || '').toLowerCase();
      if (
        error.name === 'LockError' ||
        msg.includes('lock') ||
        msg.includes('resource') && msg.includes('locked') ||
        msg.includes('quorum') ||
        msg.includes('executionerror')
      ) {
        return { success: false, error: 'Auction is being processed. Please try again.' };
      }
      
      return { success: false, error: error.message || 'Failed to place bid' };
    } finally {
      if (lock) {
        await lock.release().catch((err) => {
          logger.error('Error releasing lock', { error: err.message });
        });
      }
    }
  }

  /**
   * Получить ставки аукциона
   */
  static async getBids(
    auctionId: mongoose.Types.ObjectId,
    limit: number = 50
  ): Promise<IBid[]> {
    return Bid.find({ auctionId })
      .sort({ amount: -1, createdAt: 1 })
      .limit(limit)
      .populate('userId', 'username')
      .lean() as any; // lean() возвращает plain objects
  }

  /**
   * Получить ставки пользователя на аукционе
   */
  static async getUserBids(
    auctionId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<IBid[]> {
    return Bid.find({ auctionId, userId })
      .sort({ createdAt: -1 })
      .lean() as any; // lean() возвращает plain objects
  }

  /**
   * Возвращает заблокированные средства за ставки пользователя
   * в завершённых/отменённых аукционах (безопасно для активных).
   */
  static async refundFinishedAuctionBidsForUser(
    userId: mongoose.Types.ObjectId
  ): Promise<{ refunded: number }> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const finishedAuctions = await Auction.find({
        status: { $in: ['finished', 'cancelled'] }
      }).select('_id').session(session);

      if (finishedAuctions.length === 0) {
        await session.commitTransaction();
        return { refunded: 0 };
      }

      const auctionIds = finishedAuctions.map((a) => a._id);
      const bids = await Bid.find({
        userId,
        auctionId: { $in: auctionIds },
        isWinning: false
      }).session(session);

      let refunded = 0;
      for (const bid of bids) {
        const stillLocked = await this.isBidStillLocked(userId, bid._id, session);
        if (!stillLocked) continue;

        try {
          await BalanceService.unlockBalance(
            userId,
            bid.amount,
            bid._id,
            `Auction ${bid.auctionId} finished - refund`,
            session
          );
          refunded += 1;
        } catch (error: any) {
          if (error?.message === 'Insufficient locked balance') {
            logger.warn(`Skipping refund for bid ${bid._id} - insufficient locked balance`, {
              bidId: bid._id,
              auctionId: bid.auctionId,
              userId,
              bidAmount: bid.amount
            });
          } else {
            throw error;
          }
        }
      }

      await session.commitTransaction();
      return { refunded };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

