import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../server/app.js';
import { initializeDatabase, poolConfig } from '../server/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('local databases skip SSL and hosted databases keep it', () => {
  assert.equal(poolConfig('postgresql://postgres:secret@localhost:5432/collabdocs').ssl, false);
  assert.equal(poolConfig('postgresql://postgres:secret@127.0.0.1:5432/collabdocs').ssl, false);
  const neon = poolConfig('postgresql://user:pass@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
  assert.deepEqual(neon.ssl, { rejectUnauthorized: false });
  assert.equal(neon.enableChannelBinding, true);
  assert.equal(neon.connectionString.includes('channel_binding'), false);
  assert.equal(neon.connectionString.includes('sslmode'), false);
  assert.equal(new URL(neon.connectionString).hostname, 'ep-example.us-east-2.aws.neon.tech');
  assert.equal(new URL(neon.connectionString).pathname, '/neondb');
  assert.throws(() => poolConfig(''), /DATABASE_URL is required/);
});

test('server exits when DATABASE_URL is missing', async () => {
  const env = { ...process.env, DOTENV_CONFIG_PATH: path.join(root, '.env.missing-for-test') };
  delete env.DATABASE_URL;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: root, env });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server did not exit\n${output}`));
    }, 10000);
    child.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  assert.equal(code, 1);
  assert.match(output, /Startup failed/);
  assert.match(output, /DATABASE_URL is required/);
});

async function withApp(fn) {
  const db = new PGlite();
  const pool = {
    query(text, params) {
      return params === undefined ? db.query(text) : db.query(text, params);
    },
  };
  await initializeDatabase(pool);
  const app = createApp(pool);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, urlPath, user, body) {
    const response = await fetch(`${base}${urlPath}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(user ? { 'x-demo-user': user } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }
  try {
    return await fn(request);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await db.close();
  }
}

test('owner controls sharing and unrelated users cannot read or edit', { timeout: 30000 }, async () => {
  await withApp(async (request) => {
    const health = await request('GET', '/api/health');
    assert.deepEqual(health.data, { ok: true });
    assert.equal((await request('GET', '/api/documents')).status, 401);
    assert.equal((await request('GET', '/api/documents', 'nobody')).status, 401);

    const created = await request('POST', '/api/documents', 'alice', {
      title: 'Launch plan',
      content: '<p>secret</p><script>alert(1)</script>',
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.owner_id, 'alice');
    assert.doesNotMatch(created.data.content, /script/i);
    assert.match(created.data.content, /<p>secret<\/p>/);
    const id = created.data.id;

    const aliceList = await request('GET', '/api/documents', 'alice');
    assert.equal(aliceList.data.length, 1);
    assert.equal(aliceList.data[0].is_owner, true);
    const bobList = await request('GET', '/api/documents', 'bob');
    const charlieList = await request('GET', '/api/documents', 'charlie');
    assert.deepEqual(bobList.data, []);
    assert.deepEqual(charlieList.data, []);

    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const denied = await request(method, `/api/documents/${id}`, 'charlie', method === 'PATCH' ? { content: '<p>nope</p>' } : undefined);
      assert.equal(denied.status, 404, `${method} as charlie`);
    }
    assert.equal((await request('POST', `/api/documents/${id}/shares`, 'charlie', { userId: 'bob' })).status, 404);
    assert.equal((await request('POST', `/api/documents/${id}/shares`, 'bob', { userId: 'charlie' })).status, 404);

    assert.equal((await request('POST', `/api/documents/${id}/shares`, 'alice', { userId: 'alice' })).status, 400);
    assert.equal((await request('POST', `/api/documents/${id}/shares`, 'alice', { userId: 'bob' })).status, 201);
    assert.equal((await request('POST', `/api/documents/${id}/shares`, 'alice', { userId: 'bob' })).status, 201);

    const shared = await request('GET', `/api/documents/${id}`, 'bob');
    assert.equal(shared.status, 200);
    assert.equal(shared.data.is_owner, false);
    assert.deepEqual(shared.data.shares, []);
    const owned = await request('GET', `/api/documents/${id}`, 'alice');
    assert.equal(owned.data.is_owner, true);
    assert.deepEqual(owned.data.shares.map((person) => person.id), ['bob']);
    const bobSees = await request('GET', '/api/documents', 'bob');
    assert.equal(bobSees.data.length, 1);
    assert.equal(bobSees.data[0].is_owner, false);
    assert.equal(bobSees.data[0].owner_name, 'Alice Johnson');

    const edited = await request('PATCH', `/api/documents/${id}`, 'bob', { content: '<p onclick="x">edited</p><script>bad</script>' });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.content, '<p>edited</p>');
    const renamed = await request('PATCH', `/api/documents/${id}`, 'alice', { title: 'Renamed plan' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.title, 'Renamed plan');
    assert.equal(renamed.data.content, '<p>edited</p>');
    assert.equal((await request('PATCH', `/api/documents/${id}`, 'alice', { title: '   ' })).status, 400);
    assert.equal((await request('GET', `/api/documents/${id}`, 'alice')).data.title, 'Renamed plan');

    assert.equal((await request('DELETE', `/api/documents/${id}`, 'bob')).status, 404);
    assert.equal((await request('DELETE', `/api/documents/${id}/shares/bob`, 'bob')).status, 404);
    assert.equal((await request('POST', `/api/documents/${id}/shares`, 'bob', { userId: 'charlie' })).status, 404);
    assert.equal((await request('GET', `/api/documents/${id}`, 'charlie')).status, 404);

    assert.equal((await request('DELETE', `/api/documents/${id}/shares/bob`, 'alice')).status, 200);
    assert.equal((await request('GET', `/api/documents/${id}`, 'bob')).status, 404);
    assert.deepEqual((await request('GET', '/api/documents', 'bob')).data, []);
    assert.equal((await request('PATCH', `/api/documents/${id}`, 'bob', { content: '<p>after revoke</p>' })).status, 404);
    assert.equal((await request('GET', `/api/documents/${id}`, 'alice')).data.content, '<p>edited</p>');

    assert.equal((await request('DELETE', `/api/documents/${id}`, 'alice')).status, 200);
    assert.equal((await request('GET', `/api/documents/${id}`, 'alice')).status, 404);
    assert.deepEqual((await request('GET', '/api/documents', 'alice')).data, []);
  });
});

test('txt and md import stay editable and reject other files', { timeout: 30000 }, async () => {
  await withApp(async (request) => {
    const text = await request('POST', '/api/import', 'bob', {
      filename: 'notes.txt',
      content: 'hello <script>alert(1)</script>\n\nsecond',
    });
    assert.equal(text.status, 201);
    assert.equal(text.data.owner_id, 'bob');
    assert.equal(text.data.title, 'notes');
    assert.match(text.data.content, /hello &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(text.data.content, /<p>second<\/p>/);
    assert.equal((await request('GET', `/api/documents/${text.data.id}`, 'alice')).status, 404);

    const markdown = await request('POST', '/api/import', 'alice', {
      filename: 'spec.md',
      content: '# Plan\n\n**ship** it\n\n<script>alert(1)</script>',
    });
    assert.equal(markdown.status, 201);
    assert.match(markdown.data.content, /<h1>Plan<\/h1>/);
    assert.match(markdown.data.content, /<strong>ship<\/strong>/);
    assert.doesNotMatch(markdown.data.content, /<script|alert/);

    assert.equal((await request('POST', '/api/import', 'alice', { filename: 'deck.pdf', content: 'nope' })).status, 400);
    assert.equal((await request('POST', '/api/import', 'alice', { filename: 'big.txt', content: 'a'.repeat(512_001) })).status, 400);
  });
});
