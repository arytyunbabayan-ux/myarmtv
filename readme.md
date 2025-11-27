# 🚀 MyTVS - IPTV Service Platform

Полнофункциональная платформа для управления IPTV подписками с админ-панелью, системой промокодов и аналитикой.

## 📋 Возможности

### Для клиентов:
- ✅ Регистрация с выбором страны и пакетов
- ✅ Выбор срока подписки (1/6/12 месяцев) со скидками
- ✅ Применение промокодов
- ✅ Личный кабинет с данными для IPTV
- ✅ Просмотр статуса подписки

### Для админа:
- ✅ Управление пользователями
- ✅ Создание и управление промокодами
- ✅ Управление странами и пакетами
- ✅ Расширенная аналитика
- ✅ Заметки о клиентах с тегами
- ✅ Настройка интерфейса сайта
- ✅ Telegram уведомления о новых заказах

## 🛠️ Установка

### Требования:
- Node.js 14+ 
- npm

### Шаг 1: Скачать файлы

Загрузите все файлы на ваш хостинг:
```
mytvs/
├── server.js
├── database.js
├── package.json
├── index.html
└── .env
```

### Шаг 2: Установить зависимости

```bash
npm install
```

### Шаг 3: Настроить переменные окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Отредактируйте `.env` и укажите ваши данные:

```env
PORT=3000
TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
TELEGRAM_CHAT_ID=ваш_chat_id
ADMIN_USERNAME=admin1973
ADMIN_PASSWORD=ваш_пароль
```

#### Как получить Telegram Bot Token:
1. Найдите @BotFather в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен

#### Как получить Chat ID:
1. Найдите @userinfobot в Telegram
2. Нажмите Start
3. Скопируйте ваш ID

### Шаг 4: Запустить сервер

```bash
npm start
```

**ВСЁ!** 🎉 

При первом запуске автоматически:
- ✅ Создастся файл `database.sqlite`
- ✅ Создадутся все таблицы
- ✅ Добавятся начальные данные (страны, пакеты)

## 🌐 Доступ

- **Сайт**: http://localhost:3000
- **Админ-панель**: http://localhost:3000/#/admin1973
- **API**: http://localhost:3000/api/*

## 📂 Структура базы данных

База данных SQLite создаётся автоматически и содержит:

### Таблицы:
- `users` - пользователи и подписки
- `countries` - страны с каналами
- `packages` - дополнительные пакеты
- `promocodes` - промокоды
- `customization` - настройки интерфейса

## 🔧 API Endpoints

### Authentication
```
POST /api/admin/login
POST /api/user/login
```

### Users
```
GET    /api/users
GET    /api/users/:id
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
```

### Countries
```
GET    /api/countries
POST   /api/countries
PUT    /api/countries/:id
DELETE /api/countries/:id
```

### Packages
```
GET    /api/packages
PUT    /api/packages/:key
```

### Promocodes
```
GET    /api/promocodes
GET    /api/promocodes/:code
POST   /api/promocodes
PUT    /api/promocodes/:code
DELETE /api/promocodes/:code
```

### Statistics
```
GET    /api/statistics
```

### Customization
```
GET    /api/customization
PUT    /api/customization
```

## 💾 Backup базы данных

Просто скопируйте файл `database.sqlite`:

```bash
# Создать backup
cp database.sqlite database_backup_$(date +%Y%m%d).sqlite

# Восстановить
cp database_backup_20241201.sqlite database.sqlite
```

## 🔐 Безопасность

- ✅ Пароли хешируются с bcrypt
- ✅ CORS настроен
- ✅ Валидация данных
- ✅ SQL injection защита (prepared statements)

## 📊 Мониторинг

Логи сервера показывают:
- Запуск сервера
- Инициализация БД
- API запросы
- Ошибки

## 🚀 Деплой на хостинг

### Для Node.js хостингов (Heroku, Railway, Render):

1. Загрузите файлы
2. Хостинг автоматически выполнит `npm install` и `npm start`
3. Укажите переменные окружения в панели хостинга

### Для VPS (Ubuntu/Debian):

```bash
# Установить Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Клонировать проект
cd /var/www
git clone your-repo
cd mytvs

# Установить
npm install

# Создать .env файл
nano .env
# (вставьте ваши данные)

# Запустить с PM2 (для автозапуска)
npm install -g pm2
pm2 start server.js --name mytvs
pm2 startup
pm2 save
```

## 🐛 Решение проблем

### "Cannot find module"
```bash
npm install
```

### "Database locked"
Закройте все подключения к БД и перезапустите сервер

### "Port already in use"
Измените PORT в .env файле

### Telegram не отправляет сообщения
- Проверьте TELEGRAM_BOT_TOKEN
- Проверьте TELEGRAM_CHAT_ID
- Убедитесь что нажали /start у бота

## 📞 Поддержка

При возникновении проблем проверьте:
1. Установлены ли все зависимости (`npm install`)
2. Правильно ли заполнен `.env` файл
3. Запущен ли сервер (`npm start`)
4. Есть ли ошибки в консоли

## 📝 Лицензия

MIT License - используйте свободно!

---

**Готово к работе! 🎉**

Запустите `npm start` и откройте http://localhost:3000