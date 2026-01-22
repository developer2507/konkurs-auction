@echo off
REM Скрипт для автоматического создания .env файла
REM Запустите: create-env.bat

echo Создание файла .env...

(
echo NODE_ENV=development
echo PORT=3000
echo MONGODB_URI=mongodb://admin:password123@localhost:27017/auctions?authSource=admin^&replicaSet=rs0
echo REDIS_URL=redis://localhost:6379
echo JWT_SECRET=your-secret-key-change-in-production-change-this-in-real-app
) > .env

if exist .env (
    echo ✅ Файл .env успешно создан!
) else (
    echo ❌ Ошибка при создании файла .env
    pause
    exit /b 1
)

pause

