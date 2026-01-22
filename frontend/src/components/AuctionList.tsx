import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Auction } from '../types';
import { useNavigate } from 'react-router-dom';

export const AuctionList: React.FC = () => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(new Date()); // Состояние для принудительного обновления таймеров
  const navigate = useNavigate();

  useEffect(() => {
    loadAuctions();
    const dataInterval = setInterval(loadAuctions, 5000);
    
    // Обновляем таймеры каждую секунду
    const timerInterval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    
    return () => {
      clearInterval(dataInterval);
      clearInterval(timerInterval);
    };
  }, []);

  const loadAuctions = async () => {
    try {
      setError('');
      const response = await api.get('/api/auctions');
      setAuctions(response.data.auctions);
      try {
        localStorage.setItem('auctions_cache', JSON.stringify(response.data.auctions || []));
        const cacheMap: Record<string, Auction> = {};
        for (const auction of response.data.auctions || []) {
          if (auction && auction._id) {
            cacheMap[auction._id] = auction;
          }
        }
        localStorage.setItem('auctions_cache_map', JSON.stringify(cacheMap));
      } catch {
        // Ignore cache write failures (private mode, quota, etc.)
      }
    } catch (error) {
      console.error('Failed to load auctions', error);
      // Не показываем ошибку, если уже есть данные
      if (auctions.length === 0) {
        try {
          const cached = localStorage.getItem('auctions_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setAuctions(parsed as Auction[]);
              // Данные из кеша - не показываем ошибку
            }
          }
        } catch {
          // Ignore cache read/parse errors
        }
      }
      // Показываем ошибку только если нет данных вообще
      if (auctions.length === 0) {
        setError('Failed to load auctions. Retrying...');
      }
    } finally {
      setLoading(false);
    }
  };


  const formatTime = (endAt: string) => {
    const end = new Date(endAt);
    const diff = end.getTime() - now.getTime(); // Используем состояние now вместо создания нового Date
    
    if (diff <= 0) return 'Finished';
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (loading && auctions.length === 0) {
    return <div className="card">Loading auctions...</div>;
  }

  return (
    <div>
      {error && auctions.length === 0 && (
        <div className="card" style={{ color: '#b00020', marginBottom: '12px' }}>
          {error}
        </div>
      )}
      <div className="grid">
        {auctions.map((auction) => (
          <div
            key={auction._id}
            className="card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/auction/${auction._id}`)}
          >
            <h3>{auction.itemName}</h3>
            <p>Round {auction.roundNumber} / {auction.totalRounds}</p>
            <p>Current Price: {auction.currentPrice}</p>
            <p>Min Step: {auction.minStep}</p>
            <p className="timer">{formatTime(auction.endAt)}</p>
            <span className={`badge badge-${auction.status}`}>{auction.status}</span>
          </div>
        ))}
        {auctions.length === 0 && (
          <div className="card">No active auctions</div>
        )}
      </div>
    </div>
  );
};

