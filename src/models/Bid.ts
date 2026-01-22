import mongoose, { Schema, Document } from 'mongoose';

export interface IBid extends Document {
  auctionId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  roundNumber: number; // в каком раунде была сделана ставка
  isWinning: boolean; // является ли ставка выигрышной (определяется при завершении раунда)
  createdAt: Date;
}

const BidSchema = new Schema<IBid>({
  auctionId: { type: Schema.Types.ObjectId, ref: 'Auction', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  roundNumber: { type: Number, required: true, min: 1 },
  isWinning: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  versionKey: false
});

// Составной индекс для быстрого поиска ставок по аукциону и сумме (для ранжирования)
BidSchema.index({ auctionId: 1, amount: -1, createdAt: 1 });
BidSchema.index({ auctionId: 1, userId: 1 });
BidSchema.index({ auctionId: 1, roundNumber: 1, amount: -1 });

export const Bid = mongoose.model<IBid>('Bid', BidSchema);

