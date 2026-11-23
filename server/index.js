import 'dotenv/config';
import { getPool, initializeDatabase } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
try {
  const pool = getPool();
  await initializeDatabase(pool);
  const app = createApp(pool);
  app.listen(port, '0.0.0.0', () => console.log(`CollabDocs listening on ${port}`));
} catch (error) {
  const detail = String(error?.stack || error).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://[redacted]');
  console.error('Startup failed:', detail);
  process.exit(1);
}
