const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function initDb() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'charide.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      user_type TEXT NOT NULL,
      rating REAL DEFAULT 5.0,
      total_reviews INTEGER DEFAULT 0,
      profile_picture_url TEXT,
      payment_method TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vehicle_type TEXT NOT NULL,
      vehicle_plate TEXT NOT NULL,
      current_latitude REAL,
      current_longitude REAL,
      is_online INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY,
      passenger_id TEXT NOT NULL,
      driver_id TEXT,
      pickup_location TEXT NOT NULL,
      dropoff_location TEXT NOT NULL,
      status TEXT NOT NULL,
      fare REAL DEFAULT 0,
      distance REAL,
      vehicle_type TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  return db;
}

module.exports = { initDb };
