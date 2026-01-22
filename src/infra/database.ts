import mongoose from 'mongoose';
import { config } from './config';

export const connectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('✅ MongoDB connected successfully');
    
    // Проверка, что replica set настроен
    const adminDb = mongoose.connection.db?.admin();
    if (adminDb) {
      const status = await adminDb.command({ replSetGetStatus: 1 }).catch(() => null);
      if (status) {
        console.log('✅ MongoDB Replica Set is active');
      } else {
        console.warn('⚠️  MongoDB Replica Set may not be configured. Transactions require replica set.');
      }
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
};

