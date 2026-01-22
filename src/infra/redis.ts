import Redis from 'ioredis';
import { config } from './config';

// Основное подключение Redis для обычного использования
export const redis = new Redis(config.redisUrl, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3 // Для обычного использования
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (error) => {
  console.error('❌ Redis error:', error);
});

// Конфигурация подключения для BullMQ
// BullMQ требует maxRetriesPerRequest: null для блокирующих операций (BLPOP, BRPOP и т.д.)
// Возвращаем объект конфигурации, который BullMQ использует для создания своего экземпляра Redis
export const getBullMQConnectionConfig = () => {
  const nullValue: null = null;
  
  // Парсим redisUrl (простой вариант для localhost)
  if (config.redisUrl === 'redis://localhost:6379' || config.redisUrl === 'redis://127.0.0.1:6379') {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: nullValue,
      enableReadyCheck: false,
      lazyConnect: false
    };
  }

  // Для более сложных URL (если нужна поддержка авторизации и т.д.)
  try {
    const url = new URL(config.redisUrl);
    return {
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port, 10) : 6379,
      maxRetriesPerRequest: nullValue,
      enableReadyCheck: false,
      lazyConnect: false
    };
  } catch {
    // Fallback на localhost
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: nullValue,
      enableReadyCheck: false,
      lazyConnect: false
    };
  }
};

// Устаревшая функция - оставляем для обратной совместимости, но лучше использовать getBullMQConnectionConfig
export const createRedisConnection = () => {
  const connection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false
  });
  
  connection.on('error', (error) => {
    console.error('❌ BullMQ Redis connection error:', error);
  });
  
  return connection;
};

export default redis;

