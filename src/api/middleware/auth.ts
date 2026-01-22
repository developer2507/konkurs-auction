import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { User } from '../../models/User';

// Упрощённая авторизация для демо
// В реальном приложении здесь была бы JWT или session-аутентификация
export interface AuthRequest extends Request {
  /**
   * Исходное значение из заголовка X-User-Id (или query userId)
   * Может быть как ObjectId-строка, так и произвольная строка (externalId).
   */
  userId?: string;

  /**
   * Реальный MongoDB ObjectId пользователя, вычисленный из userId.
   */
  userObjectId?: mongoose.Types.ObjectId;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Для демо берём userId из заголовка или query параметра
  // В реальности это должно быть из JWT токена
  const userId = req.headers['x-user-id'] || req.query.userId;
  
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: 'Unauthorized. Please provide userId in X-User-Id header' });
  }

  req.userId = userId;

  try {
    // 1) Если это валидный ObjectId — используем напрямую
    if (mongoose.Types.ObjectId.isValid(userId)) {
      req.userObjectId = new mongoose.Types.ObjectId(userId);
      return next();
    }

    // 2) Иначе считаем это externalId и находим/создаём пользователя
    let user = await User.findOne({ externalId: userId });
    if (!user) {
      user = await User.create({
        externalId: userId,
        username: `User_${userId.substring(0, Math.min(8, userId.length))}`,
        balance: 10000,
        lockedBalance: 0
      });
    }

    req.userObjectId = user._id;
    return next();
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Auth error' });
  }
};

