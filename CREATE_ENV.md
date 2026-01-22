# Как создать файл .env

## Способ 1: Через командную строку

Откройте терминал в папке `C:\Konkurs` и выполните:

**Windows PowerShell:**
```powershell
@"
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password123@localhost:27017/auctions?authSource=admin&replicaSet=rs0
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-change-in-production-change-this-in-real-app
"@ | Out-File -FilePath .env -Encoding utf8
```

**Windows CMD:**
```cmd
echo NODE_ENV=development > .env
echo PORT=3000 >> .env
echo MONGODB_URI=mongodb://admin:password123@localhost:27017/auctions?authSource=admin^&replicaSet=rs0 >> .env
echo REDIS_URL=redis://localhost:6379 >> .env
echo JWT_SECRET=your-secret-key-change-in-production-change-this-in-real-app >> .env
```

## Способ 2: Вручную

1. Откройте папку `C:\Konkurs` в проводнике Windows
2. Создайте новый текстовый файл
3. Назовите его `.env` (обязательно с точкой в начале!)
4. Откройте его в любом текстовом редакторе
5. Вставьте следующее содержимое:

```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password123@localhost:27017/auctions?authSource=admin&replicaSet=rs0
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-change-in-production-change-this-in-real-app
```

6. Сохраните файл

**⚠️ ВАЖНО:** 
- Файл должен называться именно `.env` (с точкой в начале)
- Если Windows не позволяет сохранить файл с точкой в начале, сохраните как `env.txt`, затем переименуйте через командную строку: `ren env.txt .env`
- В файле не должно быть пробелов вокруг знака `=`

## Проверка

После создания файла выполните:

```bash
type .env
```

(Windows) или 

```bash
cat .env
```

(Linux/Mac)

Должно вывести содержимое файла.

