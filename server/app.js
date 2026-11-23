import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { marked } from 'marked';
import { SEED_USERS, isKnownUser, cleanHtml, validTitle } from './security.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const notFound = (res) => res.status(404).json({ error: 'Document not found or access denied.' });

function escapeText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function createApp(pool) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    const id = req.header('x-demo-user');
    if (req.path === '/api/health' || req.path === '/api/users') return next();
    if (!isKnownUser(id)) return res.status(401).json({ error: 'Select a valid demo user.' });
    req.userId = id;
    next();
  });

  const getDoc = async (id, userId, ownerOnly = false) => {
    const query = ownerOnly
      ? `SELECT d.*, true AS is_owner FROM documents d WHERE d.id=$1 AND d.owner_id=$2`
      : `SELECT d.*, (d.owner_id=$2) AS is_owner FROM documents d WHERE d.id=$1 AND (d.owner_id=$2 OR EXISTS(SELECT 1 FROM document_shares s WHERE s.document_id=d.id AND s.user_id=$2))`;
    return (await pool.query(query, [id, userId])).rows[0];
  };

  app.get('/api/health', asyncRoute(async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }); }));
  app.get('/api/users', (_req, res) => res.json(SEED_USERS));
  app.get('/api/documents', asyncRoute(async (req, res) => {
    const result = await pool.query(`SELECT d.id, d.title, d.owner_id, u.name AS owner_name, d.updated_at,
      (d.owner_id=$1) AS is_owner
      FROM documents d JOIN users u ON u.id=d.owner_id
      WHERE d.owner_id=$1 OR EXISTS(SELECT 1 FROM document_shares s WHERE s.document_id=d.id AND s.user_id=$1)
      ORDER BY d.updated_at DESC`, [req.userId]);
    res.json(result.rows);
  }));
  app.post('/api/documents', asyncRoute(async (req, res) => {
    const title = req.body.title ?? 'Untitled document';
    if (!validTitle(title)) return res.status(400).json({ error: 'Title must be 1–120 characters.' });
    const id = randomUUID();
    const content = cleanHtml(req.body.content ?? '<p></p>');
    const result = await pool.query('INSERT INTO documents(id, owner_id, title, content) VALUES($1,$2,$3,$4) RETURNING *', [id, req.userId, title.trim(), content]);
    res.status(201).json(result.rows[0]);
  }));
  app.post('/api/import', asyncRoute(async (req, res) => {
    const { filename, content } = req.body;
    if (typeof filename !== 'string' || !/\.(md|txt)$/i.test(filename)) return res.status(400).json({ error: 'Only .txt and .md files are supported.' });
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 512_000) return res.status(400).json({ error: 'File must be UTF-8 text no larger than 500 KB.' });
    const rawTitle = filename.replace(/\.(md|txt)$/i, '').trim().slice(0, 120);
    const title = rawTitle || 'Imported document';
    const html = filename.toLowerCase().endsWith('.md')
      ? cleanHtml(marked.parse(content, { async: false }))
      : cleanHtml(content.split(/\r?\n/).map(line => `<p>${escapeText(line) || '<br>'}</p>`).join(''));
    const id = randomUUID();
    const result = await pool.query('INSERT INTO documents(id,owner_id,title,content) VALUES($1,$2,$3,$4) RETURNING *', [id, req.userId, title, html]);
    res.status(201).json(result.rows[0]);
  }));
  app.get('/api/documents/:id', asyncRoute(async (req, res) => {
    const doc = await getDoc(req.params.id, req.userId);
    if (!doc) return notFound(res);
    const shares = doc.is_owner ? (await pool.query(`SELECT u.id,u.name,u.email FROM document_shares s JOIN users u ON u.id=s.user_id WHERE s.document_id=$1 ORDER BY u.name`, [doc.id])).rows : [];
    res.json({ ...doc, shares });
  }));
  app.patch('/api/documents/:id', asyncRoute(async (req, res) => {
    const doc = await getDoc(req.params.id, req.userId);
    if (!doc) return notFound(res);
    const { title, content } = req.body;
    if (title === undefined && content === undefined) return res.status(400).json({ error: 'Provide title or content.' });
    if (title !== undefined && !validTitle(title)) return res.status(400).json({ error: 'Title must be 1–120 characters.' });
    if (content !== undefined && (typeof content !== 'string' || Buffer.byteLength(content) > 512_000)) return res.status(400).json({ error: 'Content must be text under 500 KB.' });
    const sets = [];
    const values = [];
    if (title !== undefined) {
      values.push(title.trim());
      sets.push(`title=$${values.length}`);
    }
    if (content !== undefined) {
      values.push(cleanHtml(content));
      sets.push(`content=$${values.length}`);
    }
    sets.push('updated_at=now()');
    values.push(doc.id);
    const result = await pool.query(`UPDATE documents SET ${sets.join(', ')} WHERE id=$${values.length} RETURNING *`, values);
    res.json(result.rows[0]);
  }));
  app.post('/api/documents/:id/shares', asyncRoute(async (req, res) => {
    const doc = await getDoc(req.params.id, req.userId, true);
    if (!doc) return notFound(res);
    const { userId } = req.body;
    if (!isKnownUser(userId) || userId === req.userId) return res.status(400).json({ error: 'Choose another valid demo user.' });
    await pool.query('INSERT INTO document_shares(document_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [doc.id, userId]);
    res.status(201).json({ ok: true });
  }));
  app.delete('/api/documents/:id/shares/:userId', asyncRoute(async (req, res) => {
    const doc = await getDoc(req.params.id, req.userId, true);
    if (!doc) return notFound(res);
    await pool.query('DELETE FROM document_shares WHERE document_id=$1 AND user_id=$2', [doc.id, req.params.userId]);
    res.json({ ok: true });
  }));
  app.delete('/api/documents/:id', asyncRoute(async (req, res) => {
    const doc = await getDoc(req.params.id, req.userId, true);
    if (!doc) return notFound(res);
    await pool.query('DELETE FROM documents WHERE id=$1', [doc.id]);
    res.json({ ok: true });
  }));

  app.use(express.static(path.resolve(dirname, '../dist')));
  app.get('*', (req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(path.resolve(dirname, '../dist/index.html'), err => err && next(err)));
  app.use((err, _req, res, _next) => { console.error(err); res.status(err.type === 'entity.too.large' ? 413 : 500).json({ error: err.type === 'entity.too.large' ? 'Request too large.' : 'Unexpected server error.' }); });
  return app;
}
