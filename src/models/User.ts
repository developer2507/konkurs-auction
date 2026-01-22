import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  tgId?: number;
  username?: string;
  externalId?: string; // идентификатор клиента из X-User-Id (для демо)
  balance: number; // в минимальной валюте (копейки/nanoTON)
  lockedBalance: number;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  tgId: { type: Number, unique: true, sparse: true }, // unique автоматически создаёт индекс
  username: { type: String, index: true },
  externalId: { type: String, unique: true, sparse: true, index: true },
  balance: { type: Number, required: true, default: 0, min: 0 },
  lockedBalance: { type: Number, required: true, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false
});

// Индекс для быстрого поиска по tgId уже создан через unique: true выше

export const User = mongoose.model<IUser>('User', UserSchema);

