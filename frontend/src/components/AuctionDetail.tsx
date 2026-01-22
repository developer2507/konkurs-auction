import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Auction, Bid } from '../types';
import { io, Socket } from 'socket.io-client';

export const AuctionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [bidStatus, setBidStatus] = useState<string>(''); // статус для авто-retry/ошибок
  const [usingCached, setUsingCached] = useState(false);
  const redirected = useRef(false);
  const navigate = useNavigate();
  
  // Используем ref для хранения актуального значения auction в интервале
  const auctionRef = useRef<Auction | null>(null);
  
  // Обновляем ref при изменении auction
  useEffect(() => {
    auctionRef.current = auction;
  }, [auction]);

  useEffect(() => {
    if (!id) return;

    loadAuction();
    connectWebSocket();

    // Обновляем таймер каждую секунду с актуальным значением auction из ref
    const interval = setInterval(() => {
      updateTimer();
    }, 1000);
    
    return () => {
      clearInterval(interval);
      socket?.disconnect();
    };
  }, [id]);

  // Обновляем таймер когда аукцион меняется
  useEffect(() => {
    updateTimer();
  }, [auction]);

  useEffect(() => {
    if (socket && id) {
      socket.on('bid:new', (data: { auction: Auction; bid: Bid; extended?: boolean }) => {
        if (data.auction._id === id) {
          setAuction(data.auction);
          loadBids();
          if (data.extended) {
            alert('Auction extended due to anti-sniping!');
          }
        }
      });
    }

    return () => {
      socket?.off('bid:new');
    };
  }, [socket, id]);

  const connectWebSocket = () => {
    const rawBaseUrl = import.meta.env.VITE_API_URL;
    const baseUrl = (rawBaseUrl || (import.meta.env.DEV ? 'http://localhost:3000' : '')).replace(/\/+$/, '');
    const newSocket = io(baseUrl);
    newSocket.on('connect', () => {
      if (id) {
        newSocket.emit('subscribe:auction', id);
      }
    });
    setSocket(newSocket);
  };

  const loadAuction = async () => {
    if (!id) return;
    try {
      setError('');
      setUsingCached(false);
      const response = await api.get(`/api/auctions/${id}`);
      setAuction(response.data.auction);
      // Используем ставки текущего раунда, если доступны, иначе все ставки
      setBids(response.data.currentRoundBids || response.data.recentBids || []);
      try {
        localStorage.setItem(`auction_cache_${id}`, JSON.stringify(response.data));
        const cacheMapRaw = localStorage.getItem('auctions_cache_map');
        const cacheMap = cacheMapRaw ? JSON.parse(cacheMapRaw) : {};
        if (response.data?.auction?._id) {
          cacheMap[response.data.auction._id] = response.data.auction;
          localStorage.setItem('auctions_cache_map', JSON.stringify(cacheMap));
        }
      } catch {
        // Ignore cache write failures
      }
      // Обновляем таймер сразу после загрузки
      updateTimer();
    } catch (error: any) {
      console.error('Failed to load auction', error);
      const status = error?.response?.status;
      let hydratedFromCache = false;
      try {
        const cacheMapRaw = localStorage.getItem('auctions_cache_map');
        const cacheMap = cacheMapRaw ? JSON.parse(cacheMapRaw) : {};
        if (cacheMap && id && cacheMap[id]) {
          setAuction(cacheMap[id] as Auction);
          setUsingCached(true);
          hydratedFromCache = true;
        }
      } catch {
        // Ignore cache read/parse errors
      }
      // Пытаемся загрузить из дополнительного кеша
      if (!auction) {
        try {
          const cached = localStorage.getItem(`auction_cache_${id}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.auction) {
              setAuction(parsed.auction as Auction);
              setBids(parsed.currentRoundBids || parsed.recentBids || []);
              setUsingCached(true);
              hydratedFromCache = true;
            }
          }
        } catch {
          // Ignore cache read/parse errors
        }
      }
      // Показываем ошибку только если не удалось загрузить из кеша
      if (!hydratedFromCache) {
        if (status === 404) {
          setError('Auction not found. It may have finished or been removed.');
          if (!redirected.current) {
            redirected.current = true;
            try {
              const list = await api.get('/api/auctions');
              const nextId = list.data?.auctions?.[0]?._id;
              if (nextId) {
                navigate(`/auction/${nextId}`);
              } else {
                navigate('/');
              }
            } catch {
              navigate('/');
            }
          }
        } else if (status === 400) {
          setError('Invalid auction ID.');
        } else {
          // Не показываем ошибку, только логируем
          console.warn('Failed to load auction, will retry automatically');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loadBids = async () => {
    if (!id) return;
    try {
      // Используем основной endpoint, который возвращает currentRoundBids
      const response = await api.get(`/api/auctions/${id}`);
      if (response.data.auction) {
        setAuction(response.data.auction);
      }
      setBids(response.data.currentRoundBids || response.data.recentBids || []);
    } catch (error) {
      console.error('Failed to load bids', error);
    }
  };

  const updateTimer = () => {
    // Используем актуальное значение из ref
    const currentAuction = auctionRef.current;
    
    if (!currentAuction || currentAuction.status !== 'active') {
      setTimeLeft(currentAuction?.status === 'finished' ? 'Finished' : currentAuction?.status || '');
      return;
    }
    
    const now = new Date();
    const end = new Date(currentAuction.endAt);
    
    // Проверяем, что endAt валидная дата
    if (isNaN(end.getTime())) {
      setTimeLeft('Invalid date');
      return;
    }
    
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeLeft('Finished');
      return;
    }

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      setTimeLeft(`${hours}h ${minutes % 60}m ${seconds % 60}s`);
    } else if (minutes > 0) {
      setTimeLeft(`${minutes}m ${seconds % 60}s`);
    } else {
      setTimeLeft(`${seconds}s`);
    }
  };

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !bidAmount) return;

    const amount = parseInt(bidAmount, 10);
    if (isNaN(amount) || amount < 1) {
      setBidStatus('Invalid bid amount');
      return;
    }

    try {
      setBidStatus('Placing bid...');

      const maxRetries = 5;
      let attempt = 0;
      let response: any = null;

      while (attempt < maxRetries) {
        try {
          response = await api.post('/api/bids', {
            auctionId: id,
            amount
          });
          break;
        } catch (err: any) {
          const status = err?.response?.status;
          const msg = String(err?.response?.data?.error || err?.message || '');
          const isLockConflict =
            status === 409 || msg.includes('Auction is being processed');

          if (!isLockConflict) {
            throw err;
          }

          attempt += 1;
          setBidStatus(`Auction is busy… retry ${attempt}/${maxRetries}`);
          // небольшой backoff
          await new Promise((r) => setTimeout(r, 250 + attempt * 150));
        }
      }

      if (!response) {
        throw new Error('Auction is busy. Please try again.');
      }

      if (response.data.success) {
        setAuction(response.data.auction);
        setBidAmount('');
        loadBids();
        setBidStatus('');
      }
    } catch (error: any) {
      setBidStatus('');
      alert(error.response?.data?.error || error.message || 'Failed to place bid');
    }
  };

  if (loading) {
    return <div className="card">Loading...</div>;
  }

  if (!auction) {
    return <div className="card">{error || 'Auction not found'}</div>;
  }

  const minBid = auction.currentPrice + auction.minStep;

  return (
    <div>
      {usingCached && (
        <div className="card" style={{ color: '#666', marginBottom: '12px' }}>
          Showing cached data due to a temporary connection issue.
        </div>
      )}
      <div className="card">
        <h2>{auction.itemName}</h2>
        <p>Round {auction.roundNumber} / {auction.totalRounds}</p>
        <p>Winners per round: {auction.winnersPerRound}</p>
        <p className="timer">Time left: {timeLeft}</p>
        <p>Current Price: {auction.currentPrice}</p>
        <p>Min Step: {auction.minStep}</p>
        <p>Minimum bid: {minBid}</p>
        <span className={`badge badge-${auction.status}`}>{auction.status}</span>
      </div>

      <div className="card">
        <h3>Place Bid</h3>
        <form onSubmit={handleBid}>
          <input
            type="number"
            className="input"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder={`Minimum: ${minBid}`}
            min={minBid}
          />
          <button
            type="submit"
            className="button"
            disabled={!bidAmount || parseInt(bidAmount, 10) < minBid || auction.status !== 'active'}
          >
            Place Bid
          </button>
        </form>
        {bidStatus && <p style={{ marginTop: '10px', color: '#666' }}>{bidStatus}</p>}
      </div>

      <div className="card">
        <h3>Recent Bids</h3>
        {bids.length === 0 ? (
          <p>No bids yet</p>
        ) : (
          <div>
            {bids.map((bid) => (
              <div key={bid._id} className="bid-item">
                <div>
                  <strong>{bid.amount}</strong>
                  {bid.isWinning && <span className="badge badge-active">Winning (Round {bid.roundNumber})</span>}
                  {!bid.isWinning && bid.roundNumber !== auction?.roundNumber && (
                    <span className="badge" style={{ background: '#ccc', color: '#666', fontSize: '0.8em' }}>
                      Round {bid.roundNumber}
                    </span>
                  )}
                </div>
                <div>
                  {new Date(bid.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Results</h3>
        {auction.winners && auction.winners.length > 0 ? (
          <div>
            {auction.winners.map((winner) => (
              <div key={typeof winner.bidId === 'string' ? winner.bidId : winner.bidId._id} className="bid-item">
                <div>
                  <strong>{winner.amount}</strong>
                  <span className="badge badge-active" style={{ marginLeft: '8px' }}>
                    Round {winner.roundNumber}
                  </span>
                </div>
                <div style={{ color: '#666' }}>
                  User: {typeof winner.userId === 'string' ? winner.userId : winner.userId.username || winner.userId._id}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No winners yet</p>
        )}
      </div>
    </div>
  );
};

