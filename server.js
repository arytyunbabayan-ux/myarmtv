require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');
const sanitizeHtml = require('sanitize-html');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - required for Render and other reverse proxies
app.set('trust proxy', 1);
// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null;

app.use(cors({
  origin: (origin, callback) => {
    // Если ALLOWED_ORIGINS не задан, разрешаем все (для production и development)
    if (!allowedOrigins || allowedOrigins.length === 0) {
      return callback(null, true);
    }
    
    // Если origin не указан (например, запрос с того же домена), разрешаем
    if (!origin) {
      return callback(null, true);
    }
    
    // Проверяем, есть ли origin в списке разрешенных
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Если origin не в списке, блокируем
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Logging (morgan) - exclude only login endpoints
app.use(morgan('combined', {
  skip: (req) => {
    // Пропускать только эндпоинты логина
    return req.path === '/api/admin/login' || req.path === '/api/user/login';
  }
}));

// Request logging middleware (safe - no passwords)
app.use((req, res, next) => {
  if (!req.path.includes('/login') && !req.path.includes('/api/admin/login')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// ============================================
// RATE LIMITING
// ============================================

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Слишком много запросов, попробуйте позже'
});

// Login rate limiter (stricter)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Слишком много попыток входа, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

// ============================================
// HTTPS REDIRECT (Production) - MUST BE BEFORE ROUTES
// ============================================

if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    // Skip HTTPS redirect for health checks and localhost
    if (req.header('host')?.includes('localhost') || req.path === '/health') {
      return next();
    }
    
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ============================================
// JWT AUTHENTICATION
// ============================================

// Check JWT secret - CRITICAL for production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌ CRITICAL ERROR: JWT_SECRET должен быть минимум 32 символа в production!');
    console.error('❌ Установите JWT_SECRET в .env файле');
    process.exit(1);
  }
} else {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET должен быть минимум 32 символа!');
    console.warn('⚠️  Установите JWT_SECRET в .env файле');
    console.warn('⚠️  Генерирую временный ключ для development...');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Hash admin password on startup (store in memory)
let ADMIN_PASSWORD_HASH = null;

async function initializeAdminPassword() {
  if (process.env.ADMIN_PASSWORD) {
    ADMIN_PASSWORD_HASH = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    console.log('✅ Admin password hashed');
  } else {
    console.warn('⚠️  WARNING: ADMIN_PASSWORD not set in .env');
  }
}

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Токен не предоставлен' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Недействительный токен' });
    }
    req.user = user;
    next();
  });
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Требуются права администратора' });
  }
};

// ============================================
// DATA SANITIZATION
// ============================================

function sanitizeInput(data) {
  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeInput(item));
  }
  
  // Handle numbers - don't sanitize, just return
  if (typeof data === 'number') {
    return data;
  }
  
  // Handle booleans
  if (typeof data === 'boolean') {
    return data;
  }
  
  // Handle strings
  if (typeof data === 'string') {
    return sanitizeHtml(data, {
      allowedTags: [],
      allowedAttributes: {}
    }).trim();
  }
  
  // Handle objects
  if (typeof data === 'object' && data !== null) {
    const sanitized = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        sanitized[key] = sanitizeInput(data[key]);
      }
    }
    return sanitized;
  }
  
  return data;
}

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Admin login
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  // Validate input
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Логин и пароль обязательны' });
  }
  
  // Check if admin credentials are configured
  if (!ADMIN_PASSWORD_HASH) {
    return res.status(500).json({ success: false, message: 'Admin password not configured' });
  }
  
  try {
    // Compare password
    const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    
    if (username === process.env.ADMIN_USERNAME && match) {
      // Generate JWT token
      const token = jwt.sign(
        { 
          username, 
          role: 'admin',
          id: 'admin'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, message: 'Неверные учетные данные' });
    }
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
});

// User login
app.post('/api/user/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email и пароль обязательны' });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, message: 'Неверный формат email' });
  }
  
  try {
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }
    
    const match = await bcrypt.compare(password, user.password);
    
    if (match) {
      delete user.password;
      
      // Generate JWT token for user
      const token = jwt.sign(
        { 
          id: user.id,
          email: user.email,
          role: 'user'
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      res.json({ success: true, user, token });
    } else {
      res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }
  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// PROTECTED USER ROUTES
// ============================================

// Get current user (protected)
app.get('/api/user/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Доступ запрещен' });
    }
    
    const user = await db.getUserById(req.user.id);
    if (user) {
      delete user.password;
      res.json({ success: true, user });
    } else {
      res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN PROTECTED ROUTES - USERS
// ============================================

app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (user) {
      delete user.password;
      res.json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    // Validate required fields
    const { name, email, password, phone, country, countryId, period, price } = sanitized;
    
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Имя, email, пароль и телефон обязательны' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' });
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }
    
    // Validate period
    if (!period || period < 1 || period > 12) {
      return res.status(400).json({ error: 'Срок подписки должен быть от 1 до 12 месяцев' });
    }
    
    // Check if email already exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userData = {
      ...sanitized,
      password: hashedPassword
    };
    
    const userId = await db.createUser(userData);
    
    // Send Telegram notification
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      await sendTelegramNotification(userData);
    }
    
    res.json({ success: true, userId });
  } catch (error) {
    // Check for SQLite unique constraint error
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    await db.updateUser(req.params.id, sanitized);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Validate ID
    const userId = parseInt(req.params.id);
    if (isNaN(userId) || userId < 1) {
      return res.status(400).json({ error: 'Неверный ID пользователя' });
    }
    
    // Check if user exists
    const user = await db.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    await db.deleteUser(userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUBLIC ROUTES - COUNTRIES
// ============================================

app.get('/api/countries', async (req, res) => {
  try {
    const countries = await db.getAllCountries();
    res.json(countries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN PROTECTED ROUTES - COUNTRIES
// ============================================

app.post('/api/countries', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    // Validate required fields
    const { name, nameEn, flag, channels, price } = sanitized;
    
    if (!name || !nameEn || !flag || !channels || !price) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    // Validate data types and ranges
    if (typeof channels !== 'number' || channels < 1 || channels > 10000) {
      return res.status(400).json({ error: 'Количество каналов должно быть от 1 до 10000' });
    }
    
    if (typeof price !== 'number' || price < 0 || price > 100000) {
      return res.status(400).json({ error: 'Цена должна быть от 0 до 100000' });
    }
    
    if (flag.length > 10) {
      return res.status(400).json({ error: 'Флаг должен быть эмодзи (максимум 10 символов)' });
    }
    
    const countryId = await db.createCountry(sanitized);
    res.json({ success: true, countryId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/countries/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    // Check if country exists
    const country = await db.getCountryById(req.params.id);
    if (!country) {
      return res.status(404).json({ error: 'Страна не найдена' });
    }
    
    // Validate required fields
    const { name, nameEn, flag, channels, price } = sanitized;
    
    if (!name || !nameEn || !flag || !channels || !price) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    // Validate data types and ranges
    if (typeof channels !== 'number' || channels < 1 || channels > 10000) {
      return res.status(400).json({ error: 'Количество каналов должно быть от 1 до 10000' });
    }
    
    if (typeof price !== 'number' || price < 0 || price > 100000) {
      return res.status(400).json({ error: 'Цена должна быть от 0 до 100000' });
    }
    
    if (flag.length > 10) {
      return res.status(400).json({ error: 'Флаг должен быть эмодзи (максимум 10 символов)' });
    }
    
    await db.updateCountry(req.params.id, sanitized);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/countries/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Check if country exists
    const country = await db.getCountryById(req.params.id);
    if (!country) {
      return res.status(404).json({ error: 'Страна не найдена' });
    }
    
    await db.deleteCountry(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUBLIC ROUTES - PACKAGES
// ============================================

app.get('/api/packages', async (req, res) => {
  try {
    const packages = await db.getAllPackages();
    res.json(packages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN PROTECTED ROUTES - PACKAGES
// ============================================

app.put('/api/packages/:key', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    // Validate package key
    if (!['sport', 'erotica'].includes(req.params.key)) {
      return res.status(400).json({ error: 'Неверный ключ пакета' });
    }
    
    // Validate required fields
    const { nameRu, nameEn, channels, price } = sanitized;
    
    if (!nameRu || !nameEn || !channels || !price) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    // Validate data types and ranges
    if (typeof channels !== 'number' || channels < 1 || channels > 10000) {
      return res.status(400).json({ error: 'Количество каналов должно быть от 1 до 10000' });
    }
    
    if (typeof price !== 'number' || price < 0 || price > 100000) {
      return res.status(400).json({ error: 'Цена должна быть от 0 до 100000' });
    }
    
    await db.updatePackage(req.params.key, sanitized);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN PROTECTED ROUTES - PROMOCODES
// ============================================

app.get('/api/promocodes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const promocodes = await db.getAllPromocodes();
    // Auto-deactivate expired promocodes
    const now = new Date();
    for (const promo of promocodes) {
      if (promo.expiry_date && new Date(promo.expiry_date) < now && promo.active) {
        await db.updatePromocode(promo.code, { active: false });
        promo.active = 0;
      }
    }
    res.json(promocodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/promocodes/:code', async (req, res) => {
  try {
    const promo = await db.getPromocodeByCode(req.params.code.toUpperCase());
    if (promo) {
      // Check if promo is expired
      if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) {
        // Auto-deactivate expired promocodes
        await db.updatePromocode(promo.code, { active: false });
        promo.active = 0;
      }
      res.json(promo);
    } else {
      res.status(404).json({ error: 'Promocode not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/promocodes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    // Validate required fields
    const { code, discount } = sanitized;
    
    if (!code || !discount) {
      return res.status(400).json({ error: 'Код и скидка обязательны' });
    }
    
    // Validate code format
    if (typeof code !== 'string' || code.length < 3 || code.length > 20) {
      return res.status(400).json({ error: 'Код промокода должен быть от 3 до 20 символов' });
    }
    
    // Validate discount
    if (typeof discount !== 'number' || discount < 1 || discount > 100) {
      return res.status(400).json({ error: 'Скидка должна быть от 1 до 100%' });
    }
    
    // Check if promocode already exists
    const existing = await db.getPromocodeByCode(code.toUpperCase());
    if (existing) {
      return res.status(400).json({ error: 'Промокод с таким кодом уже существует' });
    }
    
    // Validate expiry date if provided
    if (sanitized.expiryDate) {
      const expiryDate = new Date(sanitized.expiryDate);
      if (isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
        return res.status(400).json({ error: 'Неверная дата истечения' });
      }
    }
    
    // Validate max uses if provided
    if (sanitized.maxUses !== undefined && sanitized.maxUses !== null) {
      if (typeof sanitized.maxUses !== 'number' || sanitized.maxUses < 1) {
        return res.status(400).json({ error: 'Максимальное количество использований должно быть больше 0' });
      }
    }
    
    const promoData = {
      ...sanitized,
      code: code.toUpperCase()
    };
    
    const promoId = await db.createPromocode(promoData);
    res.json({ success: true, promoId });
  } catch (error) {
    // Check for unique constraint
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Промокод с таким кодом уже существует' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/promocodes/:code', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    await db.updatePromocode(req.params.code, sanitized);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/promocodes/:code', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.deletePromocode(req.params.code);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PUBLIC ROUTES - CUSTOMIZATION
// ============================================

app.get('/api/customization', async (req, res) => {
  try {
    const customization = await db.getCustomization();
    res.json(customization);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN PROTECTED ROUTES - CUSTOMIZATION
// ============================================

app.put('/api/customization', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Sanitize input
    const sanitized = sanitizeInput(req.body);
    
    await db.updateCustomization(sanitized);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN PROTECTED ROUTES - STATISTICS
// ============================================

app.get('/api/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await db.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TELEGRAM NOTIFICATION
// ============================================

async function sendTelegramNotification(userData) {
  const addons = [];
  if (userData.addons && Array.isArray(userData.addons)) {
    if (userData.addons.includes('sport')) addons.push('Спорт');
    if (userData.addons.includes('erotica')) addons.push('Эротика');
  }
  const addonsText = addons.length > 0 ? `\n📺 *Доп. каналы:* ${addons.join(', ')}` : '';
  
  const message = `🎬 *Новая регистрация на MyTVS*

👤 *Имя:* ${userData.name}
📧 *Email:* ${userData.email}
📱 *Телефон:* ${userData.phone || 'Не указан'}
🌍 *Страна:* ${userData.country}
⏰ *Срок:* ${userData.period} мес${addonsText}
${userData.promoCode ? `🎁 *Промокод:* ${userData.promoCode}\n` : ''}💰 *Сумма:* ${userData.price} ₽

📅 ${new Date().toLocaleString('ru-RU')}

⚠️ *Не забудьте добавить данные для IPTV!*`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Telegram notification sent successfully');
    } else {
      console.error('❌ Telegram API error:', result.description || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Telegram notification error:', error.message);
    // Не прерываем выполнение, если Telegram недоступен
  }
}

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================
// ROOT ROUTE - Serve index.html
// ============================================

// Helper function to serve index.html
function serveIndexHtml(req, res) {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  
  // Проверяем существование файла
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error(`❌ ERROR: index.html not found at ${indexPath}`);
    console.error(`Current directory: ${__dirname}`);
    console.error(`Public directory exists: ${fs.existsSync(path.join(__dirname, 'public'))}`);
    
    // Пробуем альтернативные пути
    const altPaths = [
      path.join(process.cwd(), 'public', 'index.html'),
      path.join(__dirname, '..', 'public', 'index.html'),
      path.join(process.cwd(), 'index.html')
    ];
    
    let found = false;
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        console.log(`✅ Found index.html at alternative path: ${altPath}`);
        res.sendFile(altPath);
        found = true;
        break;
      }
    }
    
    if (!found) {
      res.status(500).send(`
        <html>
          <head><title>Configuration Error</title></head>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Configuration Error</h1>
            <p>index.html file not found. Please ensure the 'public' folder is included in your deployment.</p>
            <p>Expected path: ${indexPath}</p>
            <p>Current directory: ${__dirname}</p>
          </body>
        </html>
      `);
    }
  }
}

app.get('/', serveIndexHtml);

// Admin panel route
app.get('/admin1973', serveIndexHtml);

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

// 404 handler - для API возвращает JSON, для остальных - index.html (SPA routing)
app.use((req, res) => {
  // Если это API запрос, возвращаем JSON ошибку
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Маршрут не найден' });
  }
  
  // Для всех остальных запросов отдаем index.html (поддержка SPA роутинга)
  const indexPath = path.join(__dirname, 'public', 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Пробуем альтернативные пути
    const altPaths = [
      path.join(process.cwd(), 'public', 'index.html'),
      path.join(__dirname, '..', 'public', 'index.html'),
      path.join(process.cwd(), 'index.html')
    ];
    
    let found = false;
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        res.sendFile(altPath);
        found = true;
        break;
      }
    }
    
    if (!found) {
      res.status(404).send('Page not found');
    }
  }
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  
  // Default error
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Внутренняя ошибка сервера'
      : err.message
  });
});

// ============================================
// START SERVER
// ============================================

initializeAdminPassword().then(() => {
  return db.initialize();
}).then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('🚀 MyTVS Server Started!');
    console.log('========================================');
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`💾 Database: ${db.dbPath}`);
    console.log(`🔐 Admin Panel: http://localhost:${PORT}/#/admin1973`);
    console.log(`🔒 Security: JWT, Rate Limiting, Helmet enabled`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
    console.log('');
  });
}).catch(error => {
  console.error('Failed to initialize:', error);
  process.exit(1);
});
