import React, { useEffect, useRef, useState } from 'react';
import { api, getUserId } from '../api/client';
import { User } from '../types';

export const Balance: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reconciledOnce = useRef(false);

  useEffect(() => {
    loadBalance();
    const interval = setInterval(loadBalance, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadBalance = async () => {
    try {
      setError('');
      // GET /api/users/me автоматически создаст пользователя, если его нет
      const response = await api.get('/api/users/me');
      const userData = response.data.user;
      
      // НЕ сохраняем ObjectId в localStorage - используем случайный идентификатор
      // Это позволяет создавать нового пользователя при каждом запуске (для тестирования)
      // В production можно сохранять ObjectId для постоянной идентификации
      
      setUser(userData);
      try {
        localStorage.setItem('user_cache', JSON.stringify(userData));
      } catch {
        // Ignore cache write failures
      }

      if (!reconciledOnce.current && userData.lockedBalance > 0) {
        reconciledOnce.current = true;
        try {
          const reconcileResponse = await api.post('/api/users/reconcile');
          if (reconcileResponse.data?.refunded > 0) {
            const refreshed = await api.get('/api/users/me');
            setUser(refreshed.data.user);
          }
        } catch (reconcileError) {
          console.warn('Failed to reconcile locked balance', reconcileError);
        }
      }
    } catch (error: any) {
      console.error('Failed to load balance', error);
      // Не показываем ошибку, если уже есть данные (из кеша или предыдущей загрузки)
      if (!user) {
        try {
          const cached = localStorage.getItem('user_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === 'object') {
              setUser(parsed as User);
              // Данные из кеша - не показываем ошибку
            }
          }
        } catch {
          // Ignore cache read/parse errors
        }
      }
      // Показываем ошибку только если нет данных вообще
      if (!user) {
        setError('Failed to load user data. Retrying...');
      }
      // Если ошибка 500 или 404, пробуем создать пользователя явно
      if (error.response?.status === 500 || error.response?.status === 404) {
        try {
          const userId = getUserId();
          const createResponse = await api.post('/api/users', {
            username: `User_${userId.substring(0, 8)}`,
            initialBalance: 10000
          });
          
          // НЕ сохраняем ObjectId - используем случайный идентификатор
          if (createResponse.data.user) {
            setUser(createResponse.data.user);
            setError('');
          }
        } catch (createError) {
          console.error('Failed to create user', createError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAmount) return;

    const amount = parseInt(depositAmount, 10);
    if (isNaN(amount) || amount < 1 || amount > 1_000_000_000) {
      alert('Amount must be a number between 1 and 1,000,000,000');
      return;
    }

    try {
      await api.post('/api/users/deposit', {
        amount
      });
      setDepositAmount('');
      loadBalance();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to deposit');
    }
  };

  if (loading && !user) {
    return <div className="card">Loading balance...</div>;
  }

  if (!user) {
    return <div className="card">{error || 'Failed to load user data'}</div>;
  }

  return (
    <div className="card">
      <h3>Balance</h3>
      <p>Available: {user.balance}</p>
      <p>Locked: {user.lockedBalance}</p>
      <p>Total: {user.balance + user.lockedBalance}</p>
      
      <form onSubmit={handleDeposit} style={{ marginTop: '20px' }}>
        <input
          type="number"
          className="input"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="Amount to deposit"
          min="1"
        />
        <button type="submit" className="button">
          Deposit
        </button>
      </form>
    </div>
  );
};

