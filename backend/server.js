const express = require('express');
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || '/data';

const PORT     = process.env.PORT || 3000;
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, ''); // e.g. '/hello-app'
const APP_PASSWORD = process.env.APP_PASSWORD || '';

function createStore() {
  if (process.env.DATABASE_URL) return createPostgresStore(process.env.DATABASE_URL);
  return createSqliteStore();
}

function createSqliteStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, 'regs.db'));
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      key   TEXT NOT NULL,
      child INTEGER NOT NULL,
      PRIMARY KEY (key, child)
    );
    CREATE TABLE IF NOT EXISTS config (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
  `);

  return {
    name: 'sqlite',
    async ping() {
      db.prepare('SELECT 1').get();
    },
    async getConfig() {
      return db.prepare('SELECT k, v FROM config').all();
    },
    async saveConfig(config) {
      const upsert = db.prepare('INSERT OR REPLACE INTO config(k,v) VALUES(?,?)');
      db.transaction(() => {
        for (const [k, v] of Object.entries(config)) upsert.run(k, String(v));
      })();
    },
    async getRegs() {
      return db.prepare('SELECT key, child FROM registrations').all();
    },
    async addReg(key, child) {
      db.prepare('INSERT OR IGNORE INTO registrations(key,child) VALUES(?,?)').run(key, child);
    },
    async removeReg(key, child) {
      db.prepare('DELETE FROM registrations WHERE key=? AND child=?').run(key, child);
    },
    async replaceRegs(key, children) {
      const del = db.prepare('DELETE FROM registrations WHERE key=?');
      const ins = db.prepare('INSERT OR IGNORE INTO registrations(key,child) VALUES(?,?)');
      db.transaction(() => {
        del.run(key);
        for (const child of children) ins.run(key, child);
      })();
    },
  };
}

function createPostgresStore(connectionString) {
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const ssl = process.env.PGSSLMODE === 'disable' || isLocal
    ? false
    : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString, ssl });

  return {
    name: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS registrations (
          key   TEXT NOT NULL,
          child INTEGER NOT NULL,
          PRIMARY KEY (key, child)
        );
        CREATE TABLE IF NOT EXISTS config (
          k TEXT PRIMARY KEY,
          v TEXT NOT NULL
        );
      `);
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    async getConfig() {
      const result = await pool.query('SELECT k, v FROM config');
      return result.rows;
    },
    async saveConfig(config) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [k, v] of Object.entries(config)) {
          await client.query(
            'INSERT INTO config(k,v) VALUES($1,$2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v',
            [k, String(v)]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async getRegs() {
      const result = await pool.query('SELECT key, child FROM registrations ORDER BY key, child');
      return result.rows;
    },
    async addReg(key, child) {
      await pool.query(
        'INSERT INTO registrations(key,child) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [key, child]
      );
    },
    async removeReg(key, child) {
      await pool.query('DELETE FROM registrations WHERE key=$1 AND child=$2', [key, child]);
    },
    async replaceRegs(key, children) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM registrations WHERE key=$1', [key]);
        for (const child of children) {
          await client.query(
            'INSERT INTO registrations(key,child) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [key, child]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

// ── HTML with injected BASE_PATH ──────────────────────────────────────────
const HTML_PATH = path.join(__dirname, 'public', 'index.html');
function getHtml() {
  let html = fs.readFileSync(HTML_PATH, 'utf8');
  // Inject BASE_PATH so the frontend knows where to call the API
  html = html.replace(
    '<head>',
    `<head>\n<script>window.ORATORIJ_API='${BASE_PATH}';window.ORATORIJ_AUTH_REQUIRED=${APP_PASSWORD ? 'true' : 'false'};</script>`
  );
  return html;
}

// ── Router mounted at BASE_PATH ───────────────────────────────────────────
const router = express.Router();
const store = createStore();

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/healthz', asyncHandler(async (req, res) => {
  await store.ping();
  res.json({ ok: true, db: store.name });
}));

router.use('/api', (req, res, next) => {
  if (!APP_PASSWORD) return next();
  if (req.get('x-app-password') === APP_PASSWORD) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

// Config
router.get('/api/config', asyncHandler(async (req, res) => {
  const rows = await store.getConfig();
  const cfg = {};
  for (const r of rows) cfg[r.k] = r.v;
  res.json(cfg);
}));

router.post('/api/config', asyncHandler(async (req, res) => {
  await store.saveConfig(req.body || {});
  res.json({ ok: true });
}));

// Registrations
router.get('/api/regs', asyncHandler(async (req, res) => {
  const rows = await store.getRegs();
  const regs = {};
  for (const r of rows) {
    if (!regs[r.key]) regs[r.key] = [];
    regs[r.key].push(r.child);
  }
  res.json(regs);
}));

router.post('/api/regs/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { child } = req.body;
  if (!child || typeof child !== 'number') return res.status(400).json({ error: 'child required' });
  await store.addReg(key, child);
  res.json({ ok: true });
}));

router.delete('/api/regs/:key/:child', asyncHandler(async (req, res) => {
  await store.removeReg(req.params.key, parseInt(req.params.child));
  res.json({ ok: true });
}));

router.put('/api/regs/:key', asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { children } = req.body;
  if (!Array.isArray(children)) return res.status(400).json({ error: 'children array required' });
  await store.replaceRegs(key, children);
  res.json({ ok: true });
}));

router.get(['/', '/index.html'], (req, res) => res.type('html').send(getHtml()));

// Static assets (js, css, etc.) — index.html served dynamically above
router.use(express.static(path.join(__dirname, 'public')));

// SPA fallback — always return index.html with injected BASE_PATH
router.get('*', (req, res) => res.type('html').send(getHtml()));

app.use(BASE_PATH || '/', router);

// If BASE_PATH set, also redirect bare root → BASE_PATH
if (BASE_PATH) {
  app.get('/', (req, res) => res.redirect(BASE_PATH + '/'));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

async function start() {
  if (store.init) await store.init();
  app.listen(PORT, () => {
    console.log(`Oratorij app on :${PORT} (base: '${BASE_PATH || '/'}', db: ${store.name})`);
  });
}

start().catch(err => {
  console.error('Failed to start Oratorij app:', err);
  process.exit(1);
});
