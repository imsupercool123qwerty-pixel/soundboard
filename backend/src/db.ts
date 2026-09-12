import { config } from './config.js';
import pg from 'pg';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (!config.databaseUrl) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl });
    pool.on('error', (err) => console.error('PG pool error', err));
  }
  return pool;
}

export async function initDb() {
  const p = getPool();
  if (!p) {
    console.log('No DATABASE_URL, using in-memory storage');
    return;
  }
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        code VARCHAR(20) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        password_hash TEXT,
        max_users INT NOT NULL,
        created_at BIGINT NOT NULL,
        last_activity BIGINT NOT NULL,
        creator_id VARCHAR(100) NOT NULL,
        creator_name VARCHAR(100) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sounds (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        file_path TEXT NOT NULL,
        category VARCHAR(100),
        duration FLOAT,
        enabled BOOLEAN DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS room_members (
        room_code VARCHAR(20) REFERENCES rooms(code) ON DELETE CASCADE,
        user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        joined_at BIGINT NOT NULL,
        PRIMARY KEY (room_code, user_id)
      );
    `);
    console.log('Postgres tables ensured');
  } catch (e) {
    console.error('Failed to init DB', e);
  }
}
