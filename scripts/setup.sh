#!/bin/bash

echo "🚀 Setting up Telegram Gift Auctions..."

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Проверка Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"

# Запуск инфраструктуры
echo "📦 Starting MongoDB and Redis..."
docker-compose up -d mongodb redis mongo-setup

echo "⏳ Waiting for MongoDB replica set initialization..."
sleep 15

# Установка зависимостей
echo "📥 Installing dependencies..."
npm install

# Сборка проекта
echo "🔨 Building project..."
npm run build

# Создание тестовых данных
echo "📊 Creating test data..."
npm run create-test-data

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start the server: npm run dev"
echo "2. In another terminal, start the frontend: cd frontend && npm install && npm run dev"
echo "3. Open http://localhost:5173 in your browser"

