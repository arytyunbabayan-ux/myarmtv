# 🔒 Руководство по безопасности MyTVS

## ✅ Реализованные меры безопасности

### 1. JWT Аутентификация
- ✅ Используются JWT токены вместо простых строк
- ✅ Токены имеют срок действия (24ч для админа, 30 дней для пользователей)
- ✅ Секретный ключ хранится в переменных окружения

### 2. Защита API Endpoints
- ✅ Все админские роуты защищены middleware `authenticateToken` и `requireAdmin`
- ✅ Публичные роуты: `/api/countries`, `/api/packages`, `/api/promocodes/:code`
- ✅ Защищенные роуты требуют JWT токен в заголовке `Authorization: Bearer <token>`

### 3. Rate Limiting
- ✅ Общий лимит: 100 запросов за 15 минут для всех API
- ✅ Лимит для логина: 5 попыток за 15 минут
- ✅ Защита от brute-force атак

### 4. Helmet.js
- ✅ Защита HTTP заголовков
- ✅ Content Security Policy настроена
- ✅ Защита от XSS атак

### 5. CORS
- ✅ Настраиваемые разрешенные источники через `ALLOWED_ORIGINS`
- ✅ В production только указанные домены
- ✅ В development разрешен localhost

### 6. Хеширование паролей
- ✅ Пароль админа хешируется при запуске
- ✅ Пароли пользователей хешируются с bcrypt (10 раундов)
- ✅ Пароли никогда не логируются

### 7. Санитизация данных
- ✅ Все входные данные очищаются от HTML/JS
- ✅ Защита от XSS инъекций
- ✅ Валидация всех полей

### 8. Централизованная обработка ошибок
- ✅ Единый обработчик ошибок
- ✅ В production скрыты детали ошибок
- ✅ Логирование ошибок на сервере

### 9. Логирование
- ✅ Используется Morgan для HTTP логирования
- ✅ Пароли и токены не логируются
- ✅ Логирование запросов без чувствительных данных

### 10. HTTPS (Production)
- ✅ Автоматическое перенаправление на HTTPS в production
- ✅ Проверка заголовка `x-forwarded-proto`

## 📋 Переменные окружения

Обязательные переменные в `.env`:

```env
# Безопасность
JWT_SECRET=your_super_secret_jwt_key_min_32_characters_long
ALLOWED_ORIGINS=https://yourdomain.com
NODE_ENV=production

# Админ
ADMIN_USERNAME=admin1973
ADMIN_PASSWORD=your_secure_password

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

## 🔐 Генерация JWT_SECRET

Для генерации безопасного JWT_SECRET выполните:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Скопируйте результат в `.env` файл.

## 🚀 Рекомендации для production

1. **Обязательно установите JWT_SECRET** - минимум 32 символа
2. **Настройте ALLOWED_ORIGINS** - укажите ваш домен
3. **Используйте HTTPS** - настройте SSL сертификат
4. **Измените ADMIN_PASSWORD** - используйте надежный пароль
5. **Установите NODE_ENV=production** - для оптимизации и безопасности

## 📊 Защищенные роуты

### Требуют JWT токен + роль admin:
- `GET /api/users` - список пользователей
- `GET /api/users/:id` - данные пользователя
- `PUT /api/users/:id` - обновление пользователя
- `DELETE /api/users/:id` - удаление пользователя
- `POST /api/countries` - создание страны
- `PUT /api/countries/:id` - обновление страны
- `DELETE /api/countries/:id` - удаление страны
- `PUT /api/packages/:key` - обновление пакета
- `GET /api/promocodes` - список промокодов
- `POST /api/promocodes` - создание промокода
- `PUT /api/promocodes/:code` - обновление промокода
- `DELETE /api/promocodes/:code` - удаление промокода
- `PUT /api/customization` - настройки сайта
- `GET /api/statistics` - статистика

### Публичные роуты:
- `GET /api/countries` - список стран
- `GET /api/packages` - список пакетов
- `GET /api/promocodes/:code` - проверка промокода
- `GET /api/customization` - настройки сайта
- `POST /api/users` - регистрация пользователя
- `POST /api/user/login` - вход пользователя
- `POST /api/admin/login` - вход админа

## 🔄 Использование JWT токенов

### Получение токена (логин):
```javascript
POST /api/admin/login
{
  "username": "admin1973",
  "password": "your_password"
}

// Ответ:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Использование токена:
```javascript
// В заголовке запроса:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## ⚠️ Важные замечания

1. **Никогда не коммитьте `.env` файл в Git**
2. **Используйте разные JWT_SECRET для development и production**
3. **Регулярно обновляйте зависимости**: `npm audit` и `npm update`
4. **Мониторьте логи** на подозрительную активность
5. **Делайте бэкапы базы данных** регулярно

## 📦 Установка зависимостей

После обновления `package.json` выполните:

```bash
npm install
```

Это установит все необходимые пакеты безопасности:
- `jsonwebtoken` - JWT токены
- `express-rate-limit` - Rate limiting
- `helmet` - Защита HTTP заголовков
- `sanitize-html` - Санитизация данных
- `morgan` - Логирование

## ✅ Чек-лист перед деплоем

- [ ] JWT_SECRET установлен (минимум 32 символа)
- [ ] ALLOWED_ORIGINS настроен для вашего домена
- [ ] ADMIN_PASSWORD изменен на надежный
- [ ] NODE_ENV=production установлен
- [ ] HTTPS настроен на хостинге
- [ ] Все зависимости установлены (`npm install`)
- [ ] База данных создана и протестирована
- [ ] Telegram уведомления настроены (опционально)

---

**Версия:** 1.0.0  
**Последнее обновление:** 2024

