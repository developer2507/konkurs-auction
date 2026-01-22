# Инструкции по развёртыванию

## Vercel (Frontend) + Render (Backend)

### 1) Backend (Render)

- Задеплойте backend на Render (Web Service)
- Убедитесь, что backend живой:
  - `GET /health` или `GET /healthz`

### 2) Frontend (Vercel)

На Vercel фронт собирается **на этапе build**, поэтому переменная должна быть задана **в Vercel → Project → Settings → Environment Variables** и после этого нужен **Redeploy**.

- **`VITE_API_URL`**: URL backend **origin** (без `/api`)
  - Пример: `https://konkurs-auction.onrender.com`

Важно:
- Не ставьте `.../api` в `VITE_API_URL`, иначе получится `.../api/api/...`
- В production не используйте `http://` — на Vercel (HTTPS) браузер заблокирует mixed-content

## Production Deployment

### Требования

- Node.js 20+
- Docker и Docker Compose
- (Опционально) MongoDB и Redis на отдельных серверах

### Шаги развёртывания

#### 1. Клонирование и подготовка

```bash
git clone <repository>
cd Konkurs
cp .env.example .env
# Отредактируйте .env с production настройками
```

#### 2. Настройка переменных окружения

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://user:password@mongodb-host:27017/auctions?authSource=admin&replicaSet=rs0
REDIS_URL=redis://redis-host:6379
JWT_SECRET=<strong-random-secret>
```

#### 3. Сборка

```bash
npm ci --production=false
npm run build
cd frontend
npm ci
npm run build
cd ..
```

#### 4. Запуск с Docker Compose

```bash
docker-compose up -d
```

#### 5. Проверка

```bash
curl http://localhost:3000/health
```

### Настройка MongoDB Replica Set

Для production требуется настроить MongoDB Replica Set:

```javascript
// В mongosh на primary ноде
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongodb1:27017" },
    { _id: 1, host: "mongodb2:27017" },
    { _id: 2, host: "mongodb3:27017" }
  ]
});
```

### Настройка Redis для production

- Включите persistence (AOF или RDB)
- Настройте пароль: `requirepass <password>`
- Используйте Redis Sentinel для высокой доступности

### Безопасность

1. **Аутентификация**
   - Замените упрощённую auth на JWT
   - Используйте HTTPS
   - Настройте CORS правильно

2. **База данных**
   - Используйте сильные пароли
   - Ограничьте доступ по IP
   - Включите TLS для MongoDB

3. **Rate Limiting**
   - Переключитесь на Redis-based rate limiter
   - Настройте лимиты для разных endpoints

4. **Логирование**
   - Настройте централизованное логирование
   - Ротация логов
   - Мониторинг ошибок

### Масштабирование

#### Горизонтальное масштабирование

1. **Backend**
   - Запустите несколько инстансов за load balancer
   - Используйте sticky sessions для WebSocket (если нужно)
   - Или используйте Redis adapter для Socket.IO

2. **MongoDB**
   - Используйте Replica Set с read replicas
   - Шардирование при большом объёме данных

3. **Redis**
   - Redis Cluster для горизонтального масштабирования
   - Или Redis Sentinel для высокой доступности

#### Вертикальное масштабирование

- Увеличьте количество воркеров BullMQ
- Настройте connection pooling для MongoDB
- Увеличьте память для Redis

### Мониторинг

#### Метрики для отслеживания

- Количество активных аукционов
- Количество ставок в секунду
- Время обработки ставок
- Размер очередей BullMQ
- Использование памяти/CPU
- Количество ошибок

#### Инструменты

- Prometheus + Grafana для метрик
- ELK Stack для логов
- Sentry для отслеживания ошибок

### Резервное копирование

1. **MongoDB**
   ```bash
   mongodump --uri="mongodb://..." --out=/backup
   ```

2. **Redis** (если используете persistence)
   - Копируйте RDB/AOF файлы

3. **Балансы**
   - Регулярно проверяйте ledger на корректность
   - Экспортируйте транзакции для аудита

### Обновление

1. Создайте backup
2. Остановите сервисы: `docker-compose down`
3. Обновите код: `git pull`
4. Пересоберите: `npm run build`
5. Запустите: `docker-compose up -d`
6. Проверьте здоровье: `curl /health`

### Troubleshooting

#### Проблемы с транзакциями

```bash
# Проверьте статус replica set
mongosh --eval "rs.status()"
```

#### Проблемы с блокировками

```bash
# Проверьте Redis
redis-cli ping
redis-cli keys "auction:*"
```

#### Проблемы с очередями

- Проверьте логи воркеров
- Используйте BullMQ dashboard для мониторинга

### Контрольный список перед запуском

- [ ] MongoDB Replica Set настроен
- [ ] Redis настроен и защищён паролем
- [ ] Переменные окружения настроены
- [ ] HTTPS настроен (если используется)
- [ ] Логирование настроено
- [ ] Мониторинг настроен
- [ ] Резервное копирование настроено
- [ ] Rate limiting настроен
- [ ] CORS настроен правильно
- [ ] Health checks работают

