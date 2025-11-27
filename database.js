const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Promisify database methods
const runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// ============================================
// INITIALIZATION
// ============================================

async function initialize() {
  console.log('📦 Initializing database...');
  
  try {
    // Create tables
    await createTables();
    
    // Check if initial data exists
    const countriesCount = await getAsync('SELECT COUNT(*) as count FROM countries');
    
    if (countriesCount.count === 0) {
      console.log('📝 Populating initial data...');
      await populateInitialData();
    }
    
    console.log('✅ Database initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function createTables() {
  // Users table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      country TEXT,
      country_id INTEGER,
      addons TEXT,
      period INTEGER DEFAULT 1,
      price INTEGER,
      promo_code TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'active',
      iptv_login TEXT,
      iptv_password TEXT,
      notes TEXT,
      tags TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Countries table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS countries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_en TEXT NOT NULL,
      flag TEXT NOT NULL,
      channels INTEGER NOT NULL,
      price INTEGER NOT NULL
    )
  `);

  // Packages table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS packages (
      key TEXT PRIMARY KEY,
      name_ru TEXT NOT NULL,
      name_en TEXT NOT NULL,
      channels INTEGER NOT NULL,
      price INTEGER NOT NULL
    )
  `);

  // Promocodes table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS promocodes (
      code TEXT PRIMARY KEY,
      discount INTEGER NOT NULL,
      max_uses INTEGER,
      expiry_date TEXT,
      used_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Customization table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS customization (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      site_name TEXT,
      hero_title TEXT,
      hero_subtitle TEXT,
      primary_color TEXT,
      accent_color TEXT
    )
  `);
}

async function populateInitialData() {
  // Initial countries
  const countries = [
    { name: 'Армения', nameEn: 'Armenia', flag: '🇦🇲', channels: 93, price: 250 },
    { name: 'Грузия', nameEn: 'Georgia', flag: '🇬🇪', channels: 136, price: 250 },
    { name: 'Израиль', nameEn: 'Israel', flag: '🇮🇱', channels: 146, price: 600 },
    { name: 'Казахстан', nameEn: 'Kazakhstan', flag: '🇰🇿', channels: 81, price: 350 },
    { name: 'Турция', nameEn: 'Turkey', flag: '🇹🇷', channels: 189, price: 500 },
    { name: 'Франция', nameEn: 'France', flag: '🇫🇷', channels: 109, price: 600 },
    { name: 'Великобритания', nameEn: 'UK', flag: '🇬🇧', channels: 107, price: 500 },
    { name: 'Испания', nameEn: 'Spain', flag: '🇪🇸', channels: 105, price: 500 }
  ];

  for (const country of countries) {
    await runAsync(
      'INSERT INTO countries (name, name_en, flag, channels, price) VALUES (?, ?, ?, ?, ?)',
      [country.name, country.nameEn, country.flag, country.channels, country.price]
    );
  }

  // Initial packages
  await runAsync(
    'INSERT INTO packages (key, name_ru, name_en, channels, price) VALUES (?, ?, ?, ?, ?)',
    ['sport', 'Спорт', 'Sports', 652, 400]
  );
  
  await runAsync(
    'INSERT INTO packages (key, name_ru, name_en, channels, price) VALUES (?, ?, ?, ?, ?)',
    ['erotica', 'Эротика', 'Erotica', 127, 500]
  );

  // Initial customization
  await runAsync(
    'INSERT INTO customization (id, site_name, hero_title, hero_subtitle, primary_color, accent_color) VALUES (?, ?, ?, ?, ?, ?)',
    [1, 'MyTVS', 'IPTV сервис без границ', 'Смотрите любимые телеканалы из любой страны мира в HD качестве', '#1e3a8a', '#3b82f6']
  );
}

// ============================================
// USERS CRUD
// ============================================

async function getAllUsers() {
  const users = await allAsync('SELECT * FROM users ORDER BY created_at DESC');
  return users.map(user => ({
    ...user,
    addons: user.addons ? JSON.parse(user.addons) : [],
    tags: user.tags ? JSON.parse(user.tags) : []
  }));
}

async function getUserById(id) {
  const user = await getAsync('SELECT * FROM users WHERE id = ?', [id]);
  if (user) {
    user.addons = user.addons ? JSON.parse(user.addons) : [];
    user.tags = user.tags ? JSON.parse(user.tags) : [];
  }
  return user;
}

async function getUserByEmail(email) {
  const user = await getAsync('SELECT * FROM users WHERE email = ?', [email]);
  if (user) {
    user.addons = user.addons ? JSON.parse(user.addons) : [];
    user.tags = user.tags ? JSON.parse(user.tags) : [];
  }
  return user;
}

async function createUser(userData) {
  const result = await runAsync(
    `INSERT INTO users (
      name, email, password, country, country_id, addons, period, price, 
      promo_code, start_date, end_date, status, iptv_login, iptv_password, notes, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userData.name,
      userData.email,
      userData.password,
      userData.country,
      userData.countryId,
      JSON.stringify(userData.addons || []),
      userData.period || 1,
      userData.price,
      userData.promoCode || null,
      userData.startDate,
      userData.endDate,
      userData.status || 'active',
      userData.iptvLogin || '',
      userData.iptvPassword || '',
      userData.notes || '',
      JSON.stringify(userData.tags || [])
    ]
  );
  return result.lastID;
}

async function updateUser(id, userData) {
  await runAsync(
    `UPDATE users SET 
      name = ?, country = ?, country_id = ?, addons = ?, period = ?, price = ?,
      start_date = ?, end_date = ?, iptv_login = ?, iptv_password = ?, notes = ?, tags = ?
    WHERE id = ?`,
    [
      userData.name,
      userData.country,
      userData.countryId,
      JSON.stringify(userData.addons || []),
      userData.period,
      userData.price,
      userData.startDate,
      userData.endDate,
      userData.iptvLogin || '',
      userData.iptvPassword || '',
      userData.notes || '',
      JSON.stringify(userData.tags || []),
      id
    ]
  );
}

async function deleteUser(id) {
  await runAsync('DELETE FROM users WHERE id = ?', [id]);
}

// ============================================
// COUNTRIES CRUD
// ============================================

async function getAllCountries() {
  return await allAsync('SELECT * FROM countries ORDER BY id');
}

async function getCountryById(id) {
  return await getAsync('SELECT * FROM countries WHERE id = ?', [id]);
}

async function createCountry(countryData) {
  const result = await runAsync(
    'INSERT INTO countries (name, name_en, flag, channels, price) VALUES (?, ?, ?, ?, ?)',
    [countryData.name, countryData.nameEn, countryData.flag, countryData.channels, countryData.price]
  );
  return result.lastID;
}

async function updateCountry(id, countryData) {
  await runAsync(
    'UPDATE countries SET name = ?, name_en = ?, flag = ?, channels = ?, price = ? WHERE id = ?',
    [countryData.name, countryData.nameEn, countryData.flag, countryData.channels, countryData.price, id]
  );
}

async function deleteCountry(id) {
  await runAsync('DELETE FROM countries WHERE id = ?', [id]);
}

// ============================================
// PACKAGES CRUD
// ============================================

async function getAllPackages() {
  const packages = await allAsync('SELECT * FROM packages');
  const result = {};
  packages.forEach(pkg => {
    result[pkg.key] = {
      nameRu: pkg.name_ru,
      nameEn: pkg.name_en,
      channels: pkg.channels,
      price: pkg.price
    };
  });
  return result;
}

async function updatePackage(key, packageData) {
  await runAsync(
    'UPDATE packages SET name_ru = ?, name_en = ?, channels = ?, price = ? WHERE key = ?',
    [packageData.nameRu, packageData.nameEn, packageData.channels, packageData.price, key]
  );
}

// ============================================
// PROMOCODES CRUD
// ============================================

async function getAllPromocodes() {
  return await allAsync('SELECT * FROM promocodes ORDER BY created_at DESC');
}

async function getPromocodeByCode(code) {
  return await getAsync('SELECT * FROM promocodes WHERE code = ?', [code]);
}

async function createPromocode(promoData) {
  const result = await runAsync(
    'INSERT INTO promocodes (code, discount, max_uses, expiry_date, active) VALUES (?, ?, ?, ?, ?)',
    [promoData.code, promoData.discount, promoData.maxUses, promoData.expiryDate, 1]
  );
  return result.lastID;
}

async function updatePromocode(code, promoData) {
  const fields = [];
  const values = [];
  
  if (promoData.active !== undefined) {
    fields.push('active = ?');
    values.push(promoData.active ? 1 : 0);
  }
  
  if (promoData.usedCount !== undefined) {
    fields.push('used_count = ?');
    values.push(promoData.usedCount);
  }
  
  if (fields.length > 0) {
    values.push(code);
    await runAsync(`UPDATE promocodes SET ${fields.join(', ')} WHERE code = ?`, values);
  }
}

async function deletePromocode(code) {
  await runAsync('DELETE FROM promocodes WHERE code = ?', [code]);
}

// ============================================
// CUSTOMIZATION
// ============================================

async function getCustomization() {
  return await getAsync('SELECT * FROM customization WHERE id = 1');
}

async function updateCustomization(data) {
  await runAsync(
    `UPDATE customization SET 
      site_name = ?, hero_title = ?, hero_subtitle = ?, 
      primary_color = ?, accent_color = ? 
    WHERE id = 1`,
    [data.siteName, data.heroTitle, data.heroSubtitle, data.primaryColor, data.accentColor]
  );
}

// ============================================
// STATISTICS
// ============================================

async function getStatistics() {
  const totalUsers = await getAsync('SELECT COUNT(*) as count FROM users');
  const activeUsers = await getAsync(`
    SELECT COUNT(*) as count FROM users 
    WHERE date(end_date) > date('now')
  `);
  
  const revenue = await getAsync(`
    SELECT SUM(price) as total FROM users 
    WHERE date(end_date) > date('now')
  `);
  
  const expiringSoon = await getAsync(`
    SELECT COUNT(*) as count FROM users 
    WHERE date(end_date) > date('now') 
    AND date(end_date) <= date('now', '+30 days')
  `);

  return {
    totalUsers: totalUsers.count,
    activeSubscriptions: activeUsers.count,
    monthlyRevenue: revenue.total || 0,
    expiringSoon: expiringSoon.count
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  initialize,
  dbPath,
  
  // Users
  getAllUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  
  // Countries
  getAllCountries,
  createCountry,
  updateCountry,
  deleteCountry,
  
  // Packages
  getAllPackages,
  updatePackage,
  
  // Promocodes
  getAllPromocodes,
  getPromocodeByCode,
  createPromocode,
  updatePromocode,
  deletePromocode,
  
  // Customization
  getCustomization,
  updateCustomization,
  
  // Statistics
  getStatistics
};