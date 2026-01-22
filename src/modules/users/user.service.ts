import mongoose from 'mongoose';
import { User, IUser } from '../../models/User';
import { BalanceService } from '../balance/balance.service';

export interface CreateUserDto {
  tgId?: number;
  username?: string;
  initialBalance?: number;
}

export class UserService {
  /**
   * Создать пользователя
   */
  static async createUser(dto: CreateUserDto): Promise<IUser> {
    const user = await User.create({
      tgId: dto.tgId,
      username: dto.username,
      balance: dto.initialBalance || 0,
      lockedBalance: 0
    });

    return user;
  }

  /**
   * Получить или создать пользователя по Telegram ID
   */
  static async getOrCreateByTgId(tgId: number, username?: string): Promise<IUser> {
    let user = await User.findOne({ tgId });
    
    if (!user) {
      user = await User.create({
        tgId,
        username,
        balance: 0,
        lockedBalance: 0
      });
    } else if (username && user.username !== username) {
      user.username = username;
      await user.save();
    }

    return user;
  }

  /**
   * Получить пользователя по ID
   */
  static async getUserById(userId: mongoose.Types.ObjectId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  /**
   * Пополнить баланс пользователя
   */
  static async depositBalance(userId: mongoose.Types.ObjectId, amount: number): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await BalanceService.deposit(
        userId,
        amount,
        'Manual deposit',
        session
      );
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

