import mongoose from 'mongoose';
import { User } from '../../models/User';
import { BalanceTransaction, IBalanceTransaction } from '../../models/BalanceTransaction';
import { logger } from '../../infra/logger';

export class BalanceService {
  /**
   * Блокирует средства пользователя (при размещении ставки)
   * @param session - MongoDB сессия для транзакции
   */
  static async lockBalance(
    userId: mongoose.Types.ObjectId,
    amount: number,
    refId: mongoose.Types.ObjectId,
    description: string,
    session: mongoose.ClientSession
  ): Promise<void> {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = user.balance;
    const lockedBalanceBefore = user.lockedBalance;

    if (user.balance < amount) {
      throw new Error('Insufficient balance');
    }

    user.balance -= amount;
    user.lockedBalance += amount;
    await user.save({ session });

    // Записываем транзакцию
    await BalanceTransaction.create([{
      userId,
      type: 'lock',
      amount,
      refId,
      description,
      balanceBefore,
      balanceAfter: user.balance,
      lockedBalanceBefore,
      lockedBalanceAfter: user.lockedBalance
    }], { session });

    logger.info(`Locked ${amount} for user ${userId}`, { userId, amount, refId });
  }

  /**
   * Разблокирует средства пользователя (при возврате ставки)
   */
  static async unlockBalance(
    userId: mongoose.Types.ObjectId,
    amount: number,
    refId: mongoose.Types.ObjectId,
    description: string,
    session: mongoose.ClientSession
  ): Promise<void> {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.lockedBalance < amount) {
      // Это не должно происходить, но на всякий случай
      logger.error(`Attempted to unlock more than locked: user=${userId}, locked=${user.lockedBalance}, amount=${amount}`);
      throw new Error('Insufficient locked balance');
    }

    const balanceBefore = user.balance;
    const lockedBalanceBefore = user.lockedBalance;

    user.lockedBalance -= amount;
    user.balance += amount;
    await user.save({ session });

    await BalanceTransaction.create([{
      userId,
      type: 'unlock',
      amount,
      refId,
      description,
      balanceBefore,
      balanceAfter: user.balance,
      lockedBalanceBefore,
      lockedBalanceAfter: user.lockedBalance
    }], { session });

    logger.info(`Unlocked ${amount} for user ${userId}`, { userId, amount, refId });
  }

  /**
   * Списывает заблокированные средства (при выигрыше)
   */
  static async withdraw(
    userId: mongoose.Types.ObjectId,
    amount: number,
    refId: mongoose.Types.ObjectId,
    description: string,
    session: mongoose.ClientSession
  ): Promise<void> {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.lockedBalance < amount) {
      throw new Error('Insufficient locked balance');
    }

    const balanceBefore = user.balance;
    const lockedBalanceBefore = user.lockedBalance;

    user.lockedBalance -= amount;
    await user.save({ session });

    await BalanceTransaction.create([{
      userId,
      type: 'withdraw',
      amount,
      refId,
      description,
      balanceBefore,
      balanceAfter: user.balance,
      lockedBalanceBefore,
      lockedBalanceAfter: user.lockedBalance
    }], { session });

    logger.info(`Withdrew ${amount} for user ${userId}`, { userId, amount, refId });
  }

  /**
   * Пополняет баланс
   */
  static async deposit(
    userId: mongoose.Types.ObjectId,
    amount: number,
    description: string,
    session: mongoose.ClientSession
  ): Promise<void> {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = user.balance;
    const lockedBalanceBefore = user.lockedBalance;

    user.balance += amount;
    await user.save({ session });

    await BalanceTransaction.create([{
      userId,
      type: 'deposit',
      amount,
      description,
      balanceBefore,
      balanceAfter: user.balance,
      lockedBalanceBefore,
      lockedBalanceAfter: user.lockedBalance
    }], { session });

    logger.info(`Deposited ${amount} for user ${userId}`, { userId, amount });
  }

  /**
   * Получить баланс пользователя
   */
  static async getBalance(userId: mongoose.Types.ObjectId): Promise<{ balance: number; lockedBalance: number }> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return {
      balance: user.balance,
      lockedBalance: user.lockedBalance
    };
  }

  /**
   * Получить историю транзакций
   */
  static async getTransactionHistory(
    userId: mongoose.Types.ObjectId,
    limit: number = 50
  ): Promise<IBalanceTransaction[]> {
    return BalanceTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean() as any; // lean() возвращает plain objects, не документы
  }
}

