import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/auctions?replicaSet=rs0',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Optional: some providers expose password separately from the URL.
  redisPassword: process.env.REDIS_PASSWORD,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'default-secret-key-change-in-production'
};

