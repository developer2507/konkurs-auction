# Быстрый старт

## Шаг 1: Запуск инфраструктуры

```bash
docker-compose up -d mongodb redis mongo-setup
```

Подождите 10-15 секунд для инициализации MongoDB replica set.

## Шаг 2: Установка зависимостей

```bash
npm install
```

## Шаг 3: Создание тестовых данных

```bash
npm run create-test-data
```

Это создаст:
- 10 тестовых пользователей с балансом 100000
- 2 аукциона (1 активный, 1 запланированный)

**Важно:** Запомните ID активного аукциона из вывода.

## Шаг 4: Запуск backend

```bash
npm run dev
```

Сервер запустится на http://localhost:3000

## Шаг 5: Запуск frontend

В новом терминале:

```bash
cd frontend
npm install
npm run dev
```

Frontend откроется на http://localhost:5173

## Шаг 6: Тестирование

### Вариант A: Через UI

1. Откройте http://localhost:5173
2. Увидите список активных аукционов
3. Кликните на аукцион
4. Пополните баланс (Balance → Deposit)
5. Делайте ставки!

### Вариант B: Через API

```bash
# Получить список аукционов
curl http://localhost:3000/api/auctions

# Создать пользователя
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"username": "test", "initialBalance": 10000}'

# Получить свой профиль (замените USER_ID)
curl -H "X-User-Id: USER_ID" http://localhost:3000/api/users/me

# Пополнить баланс
curl -X POST http://localhost:3000/api/users/deposit \
  -H "Content-Type: application/json" \
  -H "X-User-Id: USER_ID" \
  -d '{"amount": 50000}'

# Разместить ставку (замените AUCTION_ID)
curl -X POST http://localhost:3000/api/bids \
  -H "Content-Type: application/json" \
  -H "X-User-Id: USER_ID" \
  -d '{"auctionId": "AUCTION_ID", "amount": 150}'
```

### Вариант C: Боты

В новом терминале:

```bash
npm run bot <AUCTION_ID> 5
```

Это запустит 5 ботов, которые будут автоматически делать ставки.

## Проверка работы

1. **Live обновления**: Откройте несколько вкладок с одним аукционом - ставки обновляются в реальном времени
2. **Anti-sniping**: Делайте ставки в последние секунды - аукцион продлится
3. **Раунды**: После завершения раунда начнётся следующий (если не последний)
4. **Балансы**: Проверьте балансы - всё должно сходиться

## Нагрузочное тестирование

```bash
npm run load-test
```

Требуется установленный k6: https://k6.io/docs/getting-started/installation/

## Остановка

```bash
# Остановить Docker контейнеры
docker-compose down

# Остановить процессы (Ctrl+C в терминалах)
```

## Troubleshooting

### MongoDB replica set не инициализирован

```bash
# Запустите вручную
docker exec -it auction-mongodb mongosh -u admin -p password123 --authenticationDatabase admin
rs.initiate()
```

### Порт уже занят

Измените порты в `.env` или `docker-compose.yml`

### Ошибки подключения к Redis/MongoDB

Убедитесь, что контейнеры запущены:
```bash
docker-compose ps
```

