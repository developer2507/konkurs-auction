import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { AuctionService } from '../../modules/auctions/auction.service';
import { BidService } from '../../modules/bids/bid.service';

const router = Router();

/**
 * GET /api/auctions
 * Получить список активных аукционов
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const auctions = await AuctionService.getActiveAuctions();
    return res.json({ auctions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/:id
 * Получить детали аукциона
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const auctionId = new mongoose.Types.ObjectId(req.params.id);
    const auction = await AuctionService.getAuctionById(auctionId);
    
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    // Получаем все ставки (для истории)
    const allBids = await BidService.getBids(auctionId, 50);
    
    // Ставки текущего раунда для активного аукциона
    // Фильтруем на бэкенде, чтобы гарантировать правильную фильтрацию
    const currentRoundBids = auction.status === 'active' && auction.roundNumber
      ? allBids.filter((bid: any) => bid.roundNumber === auction.roundNumber)
      : [];
    
    return res.json({
      auction,
      recentBids: allBids.slice(0, 20), // Все последние ставки для истории
      currentRoundBids: currentRoundBids.slice(0, 20) // Только текущего раунда
    });
  } catch (error: any) {
    if (error.message?.includes('ObjectId')) {
      return res.status(400).json({ error: 'Invalid auction ID' });
    }
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auctions
 * Создать новый аукцион
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      itemId,
      itemName,
      startPrice,
      minStep,
      startAt,
      duration,
      antiSnipingSeconds,
      winnersPerRound,
      totalRounds,
      roundsConfig
    } = req.body;

    if (!itemId || !itemName || !startPrice || !minStep || !duration || !winnersPerRound || !totalRounds) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Валидация параметров
    const parsedStartPrice = parseInt(startPrice, 10);
    const parsedMinStep = parseInt(minStep, 10);
    const parsedDuration = parseInt(duration, 10);
    const parsedWinnersPerRound = parseInt(winnersPerRound, 10);
    const parsedTotalRounds = parseInt(totalRounds, 10);
    const parsedAntiSnipingSeconds = antiSnipingSeconds ? parseInt(antiSnipingSeconds, 10) : 30;

    // Проверка разумных границ
    if (parsedStartPrice < 1 || parsedStartPrice > 1_000_000_000) {
      return res.status(400).json({ error: 'Start price must be between 1 and 1,000,000,000' });
    }
    if (parsedMinStep < 1 || parsedMinStep > parsedStartPrice) {
      return res.status(400).json({ error: 'Min step must be between 1 and start price' });
    }
    if (parsedDuration < 30 || parsedDuration > 86400) { // от 30 секунд до 24 часов
      return res.status(400).json({ error: 'Duration must be between 30 seconds and 24 hours' });
    }
    if (parsedWinnersPerRound < 1 || parsedWinnersPerRound > 100) {
      return res.status(400).json({ error: 'Winners per round must be between 1 and 100' });
    }
    if (parsedTotalRounds < 1 || parsedTotalRounds > 10) {
      return res.status(400).json({ error: 'Total rounds must be between 1 and 10' });
    }
    if (parsedAntiSnipingSeconds < 0 || parsedAntiSnipingSeconds > 300) {
      return res.status(400).json({ error: 'Anti-sniping seconds must be between 0 and 300' });
    }

    const sellerId = req.userObjectId!;
    const startDate = startAt ? new Date(startAt) : new Date();

    // roundsConfig (optional): allows different number of prizes/winners and duration per round.
    // If not provided, we create a sane default config: 1st round uses provided duration,
    // next rounds are 5 minutes each, winners are the same for every round.
    let parsedRoundsConfig: Array<{ winners: number; duration: number }> | undefined;
    if (Array.isArray(roundsConfig)) {
      if (roundsConfig.length !== parsedTotalRounds) {
        return res.status(400).json({ error: 'roundsConfig length must match totalRounds' });
      }
      parsedRoundsConfig = [];
      for (let i = 0; i < roundsConfig.length; i++) {
        const cfg = roundsConfig[i] || {};
        const winners = parseInt(cfg.winners, 10);
        const dur = parseInt(cfg.duration, 10);
        if (isNaN(winners) || winners < 1 || winners > 100) {
          return res.status(400).json({ error: `Round ${i + 1}: winners must be between 1 and 100` });
        }
        if (isNaN(dur) || dur < 30 || dur > 86400) {
          return res.status(400).json({ error: `Round ${i + 1}: duration must be between 30 and 86400 seconds` });
        }
        parsedRoundsConfig.push({ winners, duration: dur });
      }
    } else {
      parsedRoundsConfig = [];
      parsedRoundsConfig.push({ winners: parsedWinnersPerRound, duration: parsedDuration });
      for (let i = 1; i < parsedTotalRounds; i++) {
        parsedRoundsConfig.push({ winners: parsedWinnersPerRound, duration: 300 });
      }
    }

    // Ensure current round fields match round 1 config (so each round distributes prizes as configured).
    const round1 = parsedRoundsConfig[0];
    const round1Duration = round1?.duration ?? parsedDuration;
    const round1Winners = round1?.winners ?? parsedWinnersPerRound;

    const auction = await AuctionService.createAuction({
      itemId,
      itemName,
      sellerId,
      startPrice: parsedStartPrice,
      minStep: parsedMinStep,
      startAt: startDate,
      duration: round1Duration,
      antiSnipingSeconds: parsedAntiSnipingSeconds,
      winnersPerRound: round1Winners,
      totalRounds: parsedTotalRounds,
      roundsConfig: parsedRoundsConfig
    });

    return res.status(201).json({ auction });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/:id/bids
 * Получить ставки аукциона
 */
router.get('/:id/bids', async (req: Request, res: Response) => {
  try {
    const auctionId = new mongoose.Types.ObjectId(req.params.id);
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const bids = await BidService.getBids(auctionId, limit);
    return res.json({ bids });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

