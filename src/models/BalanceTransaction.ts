import mongoose, { Schema, Document } from 'mongoose';

export type TransactionType = 'lock' | 'unlock' | 'withdraw' | 'deposit' | 'fee';

export interface IBalanceTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: TransactionType;
  amount: number; // всегда положительное число
  refId?: mongoose.Types.ObjectId; // ссылка на связанную сущность (Bid, Auction и т.д.)
  description?: string;
  balanceBefore: number;
  balanceAfter: number;
  lockedBalanceBefore: number;
  lockedBalanceAfter: number;
  createdAt: Date;
}

const BalanceTransactionSchema = new Schema<IBalanceTransaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['lock', 'unlock', 'withdraw', 'deposit', 'fee'],
    required: true,
    index: true
  },
  amount: { type: Number, required: true, min: 1 },
  refId: { type: Schema.Types.ObjectId },
  description: { type: String },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  lockedBalanceBefore: { type: Number, required: true },
  lockedBalanceAfter: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, {
  versionKey: false
});

// Индекс для истории транзакций пользователя
BalanceTransactionSchema.index({ userId: 1, createdAt: -1 });

export const BalanceTransaction = mongoose.model<IBalanceTransaction>('BalanceTransaction', BalanceTransactionSchema);

