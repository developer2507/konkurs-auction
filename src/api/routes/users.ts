import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { UserService } from '../../modules/users/user.service';
import { BalanceService } from '../../modules/balance/balance.service';
import { BidService } from '../../modules/bids/bid.service';

const router = Router();

/**
 * GET /api/users/me
 * Получить информацию о текущем пользователе (создаёт, если не существует)
 * Поддерживает как ObjectId, так и строковые идентификаторы
 */
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userObjectId!;
    const user = await UserService.getUserById(userId);
    const balance = await BalanceService.getBalance(userId);
    
    return res.json({
      user: {
        _id: user._id.toString(),
        username: user.username,
        tgId: user.tgId,
        balance: balance.balance,
        lockedBalance: balance.lockedBalance
      }
    });
  } catch (error: any) {
    console.error('Error in /api/users/me:', error);
    return res.status(500).json({ error: error.message || 'Failed to get user data' });
  }
});

/**
 * POST /api/users
 * Создать пользователя (опционально с привязкой к userId из заголовка)
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // В текущей демо-схеме пользователь создаётся/резолвится в authMiddleware.
    // Поэтому этот endpoint просто возвращает текущего пользователя.
    const userId = req.userObjectId!;
    const user = await UserService.getUserById(userId);

    return res.status(200).json({
      user: {
        _id: user._id.toString(),
        username: user.username,
        tgId: user.tgId,
        balance: user.balance,
        lockedBalance: user.lockedBalance
      }
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/deposit
 * Пополнить баланс
 */
router.post('/deposit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body;
    const parsedAmount = parseInt(amount, 10);
    
    if (!amount || isNaN(parsedAmount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Валидация разумных границ (от 1 до 1 миллиарда)
    if (parsedAmount < 1 || parsedAmount > 1_000_000_000) {
      return res.status(400).json({ error: 'Amount must be between 1 and 1,000,000,000' });
    }

    const userId = req.userObjectId!;
    await UserService.depositBalance(userId, parsedAmount);
    
    const balance = await BalanceService.getBalance(userId);
    return res.json({ balance });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/transactions
 * Получить историю транзакций
 */
router.get('/transactions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userObjectId!;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const transactions = await BalanceService.getTransactionHistory(userId, limit);
    return res.json({ transactions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/reconcile
 * Возвращает заблокированные средства из завершённых аукционов
 */
router.post('/reconcile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userObjectId!;
    const result = await BidService.refundFinishedAuctionBidsForUser(userId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

