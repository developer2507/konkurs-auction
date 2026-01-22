export interface User {
  _id: string;
  username?: string;
  tgId?: number;
  balance: number;
  lockedBalance: number;
}

export interface Auction {
  _id: string;
  itemId: string;
  itemName: string;
  sellerId: string | { _id: string; username?: string };
  startPrice: number;
  currentPrice: number;
  minStep: number;
  startAt: string;
  endAt: string;
  status: 'scheduled' | 'active' | 'finished' | 'cancelled';
  antiSnipingSeconds: number;
  highestBidId?: string;
  roundNumber: number;
  winnersPerRound: number;
  totalRounds: number;
  winners: Array<{
    userId: string | { _id: string; username?: string };
    bidId: string | { _id: string; amount?: number };
    amount: number;
    roundNumber: number;
  }>;
}

export interface Bid {
  _id: string;
  auctionId: string;
  userId: string;
  amount: number;
  roundNumber: number;
  isWinning: boolean;
  createdAt: string;
}

