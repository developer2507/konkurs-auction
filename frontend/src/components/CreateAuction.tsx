import React, { useState } from 'react';
import { api } from '../api/client';
import { useNavigate } from 'react-router-dom';

export const CreateAuction: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    itemId: '',
    itemName: '',
    startPrice: '100',
    minStep: '10',
    totalRounds: '3',
    antiSnipingSeconds: '30',
    startAt: ''
  });
  
  // Конфигурация каждого раунда
  const [rounds, setRounds] = useState([
    { winners: '3', duration: '5', durationUnit: 'minutes' as 'seconds' | 'minutes' | 'hours' },
    { winners: '3', duration: '5', durationUnit: 'minutes' as 'seconds' | 'minutes' | 'hours' },
    { winners: '3', duration: '5', durationUnit: 'minutes' as 'seconds' | 'minutes' | 'hours' }
  ]);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    
    // При изменении количества раундов обновляем массив конфигураций
    if (key === 'totalRounds') {
      const numRounds = parseInt(value, 10);
      if (!isNaN(numRounds) && numRounds > 0 && numRounds <= 10) {
        const newRounds = [];
        for (let i = 0; i < numRounds; i++) {
          // Сохраняем существующую конфигурацию или создаём новую
          newRounds.push(rounds[i] || { 
            winners: '3', 
            duration: '5', 
            durationUnit: 'minutes' as 'seconds' | 'minutes' | 'hours' 
          });
        }
        setRounds(newRounds);
      }
    }
  };
  
  const updateRound = (index: number, field: 'winners' | 'duration' | 'durationUnit', value: string) => {
    setRounds(prev => {
      const updated = [...prev];
      if (field === 'durationUnit') {
        updated[index] = { ...updated[index], [field]: value as 'seconds' | 'minutes' | 'hours' };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.itemId || !form.itemName) {
      setError('itemId and itemName are required');
      return;
    }

    // Валидация числовых полей
    const startPrice = parseInt(form.startPrice, 10);
    const minStep = parseInt(form.minStep, 10);
    const totalRounds = parseInt(form.totalRounds, 10);
    const antiSnipingSeconds = form.antiSnipingSeconds ? parseInt(form.antiSnipingSeconds, 10) : 30;

    if (isNaN(startPrice) || startPrice < 1 || startPrice > 1_000_000_000) {
      setError('Start price must be between 1 and 1,000,000,000');
      return;
    }
    if (isNaN(minStep) || minStep < 1 || minStep > startPrice) {
      setError('Min step must be between 1 and start price');
      return;
    }
    if (isNaN(totalRounds) || totalRounds < 1 || totalRounds > 10) {
      setError('Total rounds must be between 1 and 10');
      return;
    }
    if (isNaN(antiSnipingSeconds) || antiSnipingSeconds < 0 || antiSnipingSeconds > 300) {
      setError('Anti-sniping seconds must be between 0 and 300');
      return;
    }
    
    // Валидация каждого раунда
    const roundsConfig = [];
    for (let i = 0; i < totalRounds; i++) {
      const round = rounds[i];
      if (!round) {
        setError(`Round ${i + 1} configuration is missing`);
        return;
      }
      
      const winners = parseInt(round.winners, 10);
      if (isNaN(winners) || winners < 1 || winners > 100) {
        setError(`Round ${i + 1}: Winners must be between 1 and 100`);
        return;
      }
      
      const durationValue = parseInt(round.duration, 10);
      let durationInSeconds = durationValue;
      if (round.durationUnit === 'minutes') {
        durationInSeconds = durationValue * 60;
      } else if (round.durationUnit === 'hours') {
        durationInSeconds = durationValue * 3600;
      }
      
      if (isNaN(durationInSeconds) || durationInSeconds < 30) {
        setError(`Round ${i + 1}: Duration must be at least 30 seconds`);
        return;
      }
      if (durationInSeconds > 86400) {
        setError(`Round ${i + 1}: Duration must not exceed 24 hours`);
        return;
      }
      
      roundsConfig.push({
        winners,
        duration: durationInSeconds
      });
    }

    try {
      setSubmitting(true);
      const payload = {
        itemId: form.itemId.trim(),
        itemName: form.itemName.trim(),
        startPrice,
        minStep,
        duration: roundsConfig[0].duration, // Длительность первого раунда (для обратной совместимости)
        winnersPerRound: roundsConfig[0].winners, // Победители первого раунда (для обратной совместимости)
        totalRounds,
        antiSnipingSeconds,
        roundsConfig, // Конфигурация каждого раунда
        startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined
      };

      const response = await api.post('/api/auctions', payload);
      const auctionId = response.data?.auction?._id;
      if (auctionId) {
        navigate(`/auction/${auctionId}`);
        return;
      }
      setError('Auction created, but ID was not returned');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to create auction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h3>Create Auction</h3>
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginTop: '10px' }}>Item ID</label>
        <input
          className="input"
          placeholder="Item ID"
          value={form.itemId}
          onChange={(e) => updateField('itemId', e.target.value)}
          required
        />
        <label style={{ display: 'block', marginTop: '10px' }}>Item Name</label>
        <input
          className="input"
          placeholder="Item Name"
          value={form.itemName}
          onChange={(e) => updateField('itemName', e.target.value)}
          required
        />
        <label style={{ display: 'block', marginTop: '10px' }}>Start Price</label>
        <input
          className="input"
          type="number"
          min="1"
          max="1000000000"
          placeholder="Start Price"
          value={form.startPrice}
          onChange={(e) => updateField('startPrice', e.target.value)}
          required
        />
        <label style={{ display: 'block', marginTop: '10px' }}>Min Step</label>
        <input
          className="input"
          type="number"
          min="1"
          placeholder="Min Step"
          value={form.minStep}
          onChange={(e) => updateField('minStep', e.target.value)}
          required
        />
        <label style={{ display: 'block', marginTop: '10px' }}>Total rounds</label>
        <input
          className="input"
          type="number"
          min="1"
          max="10"
          placeholder="Total rounds"
          value={form.totalRounds}
          onChange={(e) => updateField('totalRounds', e.target.value)}
          required
        />
        
        {/* Конфигурация каждого раунда */}
        <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
          <h4 style={{ marginTop: 0, marginBottom: '15px' }}>Rounds Configuration</h4>
          {rounds.map((round, index) => (
            <div key={index} style={{ 
              marginBottom: '15px', 
              padding: '12px', 
              background: 'white', 
              borderRadius: '6px',
              border: '1px solid #ddd'
            }}>
              <strong style={{ display: 'block', marginBottom: '8px' }}>Round {index + 1}</strong>
              
              <label style={{ display: 'block', marginTop: '8px', fontSize: '0.9em' }}>Winners</label>
              <input
                className="input"
                type="number"
                min="1"
                max="100"
                placeholder="Winners"
                value={round.winners}
                onChange={(e) => updateRound(index, 'winners', e.target.value)}
                required
                style={{ marginTop: '4px' }}
              />
              
              <label style={{ display: 'block', marginTop: '10px', fontSize: '0.9em' }}>Duration</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="Duration"
                  value={round.duration}
                  onChange={(e) => updateRound(index, 'duration', e.target.value)}
                  required
                  style={{ flex: '2' }}
                />
                <select
                  className="input"
                  value={round.durationUnit}
                  onChange={(e) => updateRound(index, 'durationUnit', e.target.value)}
                  style={{ flex: '1' }}
                >
                  <option value="seconds">sec</option>
                  <option value="minutes">min</option>
                  <option value="hours">hrs</option>
                </select>
              </div>
            </div>
          ))}
          <small style={{ color: '#666', fontSize: '0.85em', display: 'block', marginTop: '8px' }}>
            ℹ️ Each round can have different duration and number of winners
          </small>
        </div>
        
        <label style={{ display: 'block', marginTop: '10px' }}>Anti-sniping seconds</label>
        <input
          className="input"
          type="number"
          min="0"
          max="300"
          placeholder="Anti-sniping seconds"
          value={form.antiSnipingSeconds}
          onChange={(e) => updateField('antiSnipingSeconds', e.target.value)}
          required
        />
        <label style={{ display: 'block', marginTop: '10px' }}>Start time (optional)</label>
        <input
          className="input"
          type="datetime-local"
          placeholder="Start time (optional)"
          value={form.startAt}
          onChange={(e) => updateField('startAt', e.target.value)}
        />
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </form>
    </div>
  );
};

