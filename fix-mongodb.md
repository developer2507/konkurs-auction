# Исправление проблемы с MongoDB

## Проблема
MongoDB требует `keyFile` для Replica Set, когда включена авторизация. Для разработки проще отключить авторизацию.

## Что было исправлено

1. **docker-compose.yml** - убрана авторизация из MongoDB
2. **src/infra/config.ts** - обновлён URI по умолчанию
3. **mongo-setup** - убрана авторизация из команды инициализации

## Что нужно сделать

1. Остановите контейнеры:
   ```bash
   docker-compose down -v
   ```
   (`-v` удалит старые данные, чтобы начать с чистого листа)

2. Обновите файл `.env`:
   Измените строку:
   ```
   MONGODB_URI=mongodb://admin:password123@localhost:27017/auctions?authSource=admin&replicaSet=rs0
   ```
   
   На:
   ```
   MONGODB_URI=mongodb://localhost:27017/auctions?replicaSet=rs0
   ```

3. Запустите заново:
   ```bash
   docker-compose up -d mongodb redis mongo-setup
   ```

4. Подождите 20 секунд для инициализации

5. Проверьте статус:
   ```bash
   docker-compose ps
   docker-compose logs mongodb | tail -20
   ```

Теперь MongoDB должна запуститься без ошибок!



