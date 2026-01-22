import express, { Express } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { connectDatabase } from './infra/database';
import { redis } from './infra/redis';
import { config } from './infra/config';
import { logger } from './infra/logger';
import { setupRoutes } from './api';
import { scheduler } from './workers/scheduler';
import { auctionWorker } from './workers/auction.worker';
import { initializeSocket, getIO } from './infra/socket';

const app: Express = express();
const httpServer = createServer(app);

// WebSocket сервер
const io = initializeSocket(httpServer);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query
  });
  next();
});

// Настройка роутов
setupRoutes(app);

// WebSocket обработка
getIO().on('connection', (socket) => {
  logger.info('WebSocket client connected', { socketId: socket.id });

  // Подписка на обновления конкретного аукциона
  socket.on('subscribe:auction', (auctionId: string) => {
    socket.join(`auction:${auctionId}`);
    logger.info('Client subscribed to auction', { socketId: socket.id, auctionId });
  });

  socket.on('disconnect', () => {
    logger.info('WebSocket client disconnected', { socketId: socket.id });
  });
});

// Обработка ошибок
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Запуск сервера
async function start() {
  try {
    // Подключение к БД
    await connectDatabase();

    // Проверка Redis
    await redis.ping();
    logger.info('✅ Redis is ready');

    // Запуск планировщика
    scheduler.start();

    // Запуск HTTP сервера
    httpServer.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

async function gracefulShutdown() {
  logger.info('Shutting down gracefully...');
  
  scheduler.stop();
  await auctionWorker.close();
  await redis.quit();
  await httpServer.close();
  
  logger.info('Server shutdown complete');
  process.exit(0);
}

// Экспортируем для удобства
export { getIO as io };

start();

