import { Express, Request, Response } from 'express';
import { apiRateLimiter } from './middleware/rateLimiter';
import auctionsRouter from './routes/auctions';
import bidsRouter from './routes/bids';
import usersRouter from './routes/users';

export function setupRoutes(app: Express) {
  // Общий rate limiter для всех API
  app.use('/api', apiRateLimiter);

  // Роуты
  app.use('/api/auctions', auctionsRouter);
  app.use('/api/bids', bidsRouter);
  app.use('/api/users', usersRouter);

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

