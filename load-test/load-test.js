import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const API_URL = __ENV.API_URL || 'http://localhost:3000';

// Генерируем случайный userId для каждого VU
function getUserId(vuNum) {
  return `load_test_user_${vuNum}_${Date.now()}`;
}

// Получаем или создаём аукцион для тестирования
function getOrCreateAuction(userId) {
  // Сначала пытаемся получить активный аукцион
  let res = http.get(`${API_URL}/api/auctions`);
  
  if (res.status === 200 && res.json('auctions').length > 0) {
    return res.json('auctions')[0]._id;
  }

  // Если нет активных, создаём новый
  res = http.post(
    `${API_URL}/api/auctions`,
    JSON.stringify({
      itemId: `load_test_item_${Date.now()}`,
      itemName: 'Load Test Item',
      startPrice: 100,
      minStep: 10,
      startAt: new Date().toISOString(),
      duration: 300, // 5 минут
      winnersPerRound: 5,
      totalRounds: 3
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      }
    }
  );

  if (res.status === 201) {
    return res.json('auction._id');
  }

  return null;
}

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Наращиваем до 50 пользователей
    { duration: '1m', target: 50 },    // Держим 50 пользователей
    { duration: '30s', target: 100 },  // Наращиваем до 100
    { duration: '1m', target: 100 },   // Держим 100
    { duration: '30s', target: 200 },  // Наращиваем до 200
    { duration: '1m', target: 200 },   // Держим 200
    { duration: '30s', target: 0 },    // Снижаем нагрузку
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% запросов должны быть быстрее 500ms
    errors: ['rate<0.1'],              // Меньше 10% ошибок
  },
};

export default function () {
  const userId = getUserId(__VU);
  const headers = {
    'Content-Type': 'application/json',
    'X-User-Id': userId
  };

  // Получаем или создаём аукцион
  const auctionId = getOrCreateAuction(userId);
  if (!auctionId) {
    errorRate.add(1);
    return;
  }

  // Пополняем баланс (только раз в начале для каждого VU)
  if (__ITER === 0) {
    let res = http.post(
      `${API_URL}/api/users/deposit`,
      JSON.stringify({ amount: 50000 }),
      { headers }
    );
    check(res, {
      'deposit successful': (r) => r.status === 200,
    }) || errorRate.add(1);
  }

  // Получаем информацию об аукционе
  let res = http.get(`${API_URL}/api/auctions/${auctionId}`, { headers });
  check(res, {
    'get auction status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  const auction = res.json('auction');
  if (!auction || auction.status !== 'active') {
    sleep(1);
    return;
  }

  const timeLeftSec = (new Date(auction.endAt).getTime() - Date.now()) / 1000;
  const snipeWindow = auction.antiSnipingSeconds + 2;
  const bidProbability = timeLeftSec <= snipeWindow ? 1.0 : 0.3;

  // С вероятностью 30% делаем ставку, а в окне anti-sniping - всегда
  if (Math.random() < bidProbability) {
    const minBid = auction.currentPrice + auction.minStep;
    const bidAmount = minBid + Math.floor(Math.random() * 100);

    res = http.post(
      `${API_URL}/api/bids`,
      JSON.stringify({
        auctionId: auctionId,
        amount: bidAmount
      }),
      { headers }
    );

    check(res, {
      'bid status is 200': (r) => r.status === 200,
      'bid successful': (r) => {
        const body = r.json();
        return body.success === true || (r.status === 200 && !body.error);
      },
    }) || errorRate.add(1);
  }

  sleep(1 + Math.random() * 2); // Случайная задержка 1-3 секунды
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-results.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  // Простой текстовый вывод
  return `
Load Test Results:
==================
Duration: ${data.state.testRunDurationMs}ms
VUs: ${data.metrics.vus.values.max}
Requests: ${data.metrics.http_reqs.values.count}
Errors: ${data.metrics.errors.values.rate * 100}%
Avg Response Time: ${data.metrics.http_req_duration.values.avg}ms
P95 Response Time: ${data.metrics.http_req_duration.values['p(95)']}ms
  `;
}

