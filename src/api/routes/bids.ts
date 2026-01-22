import { Router } from 'express';
import mongoose from 'mongoose';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { bidRateLimiter } from '../middleware/rateLimiter';
import { BidService } from '../../modules/bids/bid.service';
import { getIO } from '../../infra/socket';

const router = Router();

/**
 * POST /api/bids
 * Разместить ставку
 */
router.post('/', authMiddleware, bidRateLimiter, async (req: AuthRequest, res) => {
  try {
    const { auctionId, amount } = req.body;

    if (!auctionId || !amount) {
      return res.status(400).json({ error: 'Missing auctionId or amount' });
    }

    const userId = req.userObjectId!;
    const auctionObjectId = new mongoose.Types.ObjectId(auctionId);
    const bidAmount = parseInt(amount, 10);

    if (isNaN(bidAmount) || bidAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const result = await BidService.placeBid(auctionObjectId, userId, bidAmount);

    if (!result.success) {
      // Если это конфликт блокировки — отдаём 409, чтобы фронт мог корректно ретраить
      if (result.error === 'Auction is being processed. Please try again.') {
        return res.status(409).json({ error: result.error });
      }
      return res.status(400).json({ error: result.error });
    }

    // Отправляем обновление через WebSocket только в комнату конкретного аукциона
    getIO().to(`auction:${auctionId}`).emit('bid:new', {
      auction: result.auction,
      bid: result.bid,
      extended: result.extended
    });

    return res.json({
      success: true,
      bid: result.bid,
      auction: result.auction,
      extended: result.extended
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bids/user
 * Получить ставки текущего пользователя
 */
router.get('/user', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userObjectId!;
    const auctionId = req.query.auctionId
      ? new mongoose.Types.ObjectId(req.query.auctionId as string)
      : undefined;

    if (auctionId) {
      const bids = await BidService.getUserBids(auctionId, userId);
      return res.json({ bids });
    }

    return res.status(400).json({ error: 'auctionId is required' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

