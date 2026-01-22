import mongoose, { Schema, Document } from 'mongoose';

export type AuctionStatus = 'scheduled' | 'active' | 'finished' | 'cancelled';

export interface IAuction extends Document {
  itemId: string;
  itemName: string;
  sellerId: mongoose.Types.ObjectId;
  startPrice: number; // стартовая цена
  currentPrice: number; // текущая максимальная ставка
  minStep: number; // минимальный шаг ставки
  startAt: Date;
  endAt: Date;
  status: AuctionStatus;
  antiSnipingSeconds: number; // сколько секунд продлевать при поздних ставках
  highestBidId?: mongoose.Types.ObjectId;
  roundNumber: number; // номер текущего раунда
  winnersPerRound: number; // сколько победителей в каждом раунде
  totalRounds: number; // общее количество раундов
  /**
   * Конфигурация раундов: сколько призов/победителей и длительность каждого раунда.
   * roundNumber начинается с 1, поэтому roundsConfig[0] = 1-й раунд.
   */
  roundsConfig?: Array<{
    winners: number;
    duration: number; // seconds
  }>;
  winners: Array<{
    userId: mongoose.Types.ObjectId;
    bidId: mongoose.Types.ObjectId;
    amount: number;
    roundNumber: number;
  }>;
  extendedAt?: Date[]; // логи продлений для anti-sniping
  createdAt: Date;
}

const AuctionSchema = new Schema<IAuction>({
  itemId: { type: String, required: true, index: true },
  itemName: { type: String, required: true },
  sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startPrice: { type: Number, required: true, min: 1 },
  currentPrice: { type: Number, required: true, min: 0 },
  minStep: { type: Number, required: true, min: 1 },
  startAt: { type: Date, required: true, index: true },
  endAt: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'finished', 'cancelled'],
    default: 'scheduled',
    index: true
  },
  antiSnipingSeconds: { type: Number, default: 30, min: 0 },
  highestBidId: { type: Schema.Types.ObjectId, ref: 'Bid' },
  roundNumber: { type: Number, default: 1, min: 1 },
  winnersPerRound: { type: Number, required: true, min: 1 },
  totalRounds: { type: Number, required: true, min: 1 },
  roundsConfig: [{
    winners: { type: Number, required: true, min: 1 },
    duration: { type: Number, required: true, min: 30 } // seconds
  }],
  winners: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    bidId: { type: Schema.Types.ObjectId, ref: 'Bid' },
    amount: Number,
    roundNumber: Number
  }],
  extendedAt: [Date],
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false
});

// Индексы для быстрых запросов
AuctionSchema.index({ status: 1, endAt: 1 });
AuctionSchema.index({ status: 1, startAt: 1 });
AuctionSchema.index({ itemId: 1, status: 1 });

export const Auction = mongoose.model<IAuction>('Auction', AuctionSchema);

