# Скрипт для автоматического создания .env файла
# Запустите: powershell -ExecutionPolicy Bypass -File create-env.ps1

$envContent = @"
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password123@localhost:27017/auctions?authSource=admin&replicaSet=rs0
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-change-in-production-change-this-in-real-app
"@

$envPath = Join-Path $PSScriptRoot ".env"

if (Test-Path $envPath) {
    Write-Host "Файл .env уже существует!" -ForegroundColor Yellow
    $overwrite = Read-Host "Перезаписать? (y/n)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "Отменено." -ForegroundColor Red
        exit
    }
}

try {
    $envContent | Out-File -FilePath $envPath -Encoding utf8 -NoNewline
    Write-Host "✅ Файл .env успешно создан!" -ForegroundColor Green
    Write-Host "Путь: $envPath" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Ошибка при создании файла: $_" -ForegroundColor Red
    exit 1
}

