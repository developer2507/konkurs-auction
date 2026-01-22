import axios from 'axios';
import { config } from '../src/infra/config';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface BotConfig {
  userId: string;
  auctionId: string;
  minBid: number;
  maxBid: number;
  bidInterval: number; // интервал между ставками в мс
  probability: number; // вероятность сделать ставку (0-1)
}

class AuctionBot {
  private config: BotConfig;
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`Bot ${this.config.userId} started`);

    // Пополняем баланс
    await this.depositBalance(100000);

    this.intervalId = setInterval(async () => {
      await this.makeBid();
    }, this.config.bidInterval);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    console.log(`Bot ${this.config.userId} stopped`);
  }

  private async depositBalance(amount: number) {
    try {
      await axios.post(
        `${API_URL}/api/users/deposit`,
        { amount },
        { headers: { 'X-User-Id': this.config.userId } }
      );
    } catch (error) {
      console.error(`Bot ${this.config.userId} failed to deposit:`, error);
    }
  }

  private async makeBid() {
    try {
      // Получаем текущий аукцион
      const auctionResponse = await axios.get(
        `${API_URL}/api/auctions/${this.config.auctionId}`,
        { headers: { 'X-User-Id': this.config.userId } }
      );

      const auction = auctionResponse.data.auction;
      if (auction.status !== 'active') {
        return;
      }

      const minRequiredBid = auction.currentPrice + auction.minStep;
      if (minRequiredBid > this.config.maxBid) {
        return;
      }

      const timeLeftSec = (new Date(auction.endAt).getTime() - Date.now()) / 1000;
      const snipeWindow = auction.antiSnipingSeconds + 2;
      const bidProbability = timeLeftSec <= snipeWindow ? 1.0 : this.config.probability;
      if (Math.random() > bidProbability) {
        return;
      }

      // Генерируем случайную ставку между minRequiredBid и maxBid
      const bidAmount = Math.max(
        minRequiredBid,
        Math.floor(Math.random() * (this.config.maxBid - minRequiredBid) + minRequiredBid)
      );

      const response = await axios.post(
        `${API_URL}/api/bids`,
        {
          auctionId: this.config.auctionId,
          amount: bidAmount
        },
        { headers: { 'X-User-Id': this.config.userId } }
      );

      if (response.data.success) {
        console.log(`Bot ${this.config.userId} placed bid: ${bidAmount}`);
      }
    } catch (error: any) {
      if (error.response?.status !== 400) {
        console.error(`Bot ${this.config.userId} failed to bid:`, error.response?.data?.error || error.message);
      }
    }
  }
}

// Запуск нескольких ботов для тестирования
async function main() {
  const auctionId = process.argv[2];
  if (!auctionId) {
    console.error('Usage: ts-node scripts/bot.ts <auctionId>');
    process.exit(1);
  }

  const botCount = parseInt(process.argv[3] || '5', 10);
  const bots: AuctionBot[] = [];

  console.log(`Starting ${botCount} bots for auction ${auctionId}`);

  for (let i = 0; i < botCount; i++) {
    const bot = new AuctionBot({
      userId: `bot_${i}_${Date.now()}`,
      auctionId,
      minBid: 100,
      maxBid: 5000,
      bidInterval: 2000 + Math.random() * 3000, // 2-5 секунд
      probability: 0.3 // 30% вероятность ставки на каждом интервале
    });

    bots.push(bot);
    await bot.start();

    // Небольшая задержка между запуском ботов
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping bots...');
    bots.forEach(bot => bot.stop());
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch(console.error);
}

