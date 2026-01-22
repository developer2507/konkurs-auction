import rateLimit from 'express-rate-limit';
import { redis } from '../../infra/redis';

// Rate limiter для ставок: 50 запросов в секунду на пользователя (для интенсивных торгов и тестирования)
export const bidRateLimiter = rateLimit({
  windowMs: 1000, // 1 секунда
  max: 50,
  message: 'Too many bid requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.headers['x-user-id'];
    if (typeof userId === 'string' && userId.length > 0) {
      return userId;
    }
    return String(req.ip || 'unknown');
  },
  // Используем Redis store для распределённой системы
  store: undefined, // Можно использовать redis-store, но для простоты используем in-memory
});

// Rate limiter для общих API
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 500,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

