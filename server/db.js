import pg from 'pg';
import { SEED_USERS } from './security.js';

export function poolConfig(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and set it.');
  }
  let hostname = '';
  let normalized = connectionString;
  let channelBinding = '';
  try {
    const url = new URL(connectionString);
    hostname = url.hostname;
    channelBinding = url.searchParams.get('channel_binding') || '';
    // node-pg reads channel binding from enableChannelBinding, not this query parameter.
    url.searchParams.delete('channel_binding');
    // pg-connection-string treats sslmode=require as verify-full and overwrites an explicit ssl option.
    url.searchParams.delete('sslmode');
    normalized = url.toString();
  } catch {
    hostname = '';
  }
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  return {
    connectionString: normalized,
    ssl: local ? false : { rejectUnauthorized: false },
    enableChannelBinding: channelBinding === 'require' || channelBinding === 'prefer',
  };
}

let pool;
export function getPool() {
  if (!pool) pool = new pg.Pool(poolConfig());
  return pool;
}

export async function initializeDatabase(db = getPool()) {
  await db.query(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title VARCHAR(120) NOT NULL,
    content TEXT NOT NULL DEFAULT '<p></p>', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS document_shares (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, user_id)
  )`);
  for (const user of SEED_USERS) {
    await db.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [user.id, user.name, user.email]);
  }
}
