const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PORT     = process.env.PORT || 3000;
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, ''); // e.g. '/hello-app'

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
    `<head>\n<script>window.ORATORIJ_API='${BASE_PATH}';</script>`
  );
  return html;
}

// ── Router mounted at BASE_PATH ───────────────────────────────────────────
const router = express.Router();

// Config
router.get('/api/config', (req, res) => {
  const rows = db.prepare('SELECT k, v FROM config').all();
  const cfg = {};
  for (const r of rows) cfg[r.k] = r.v;
  res.json(cfg);
});

router.post('/api/config', (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO config(k,v) VALUES(?,?)');
  db.transaction(() => {
    for (const [k, v] of Object.entries(req.body)) upsert.run(k, v);
  })();
  res.json({ ok: true });
});

// Registrations
router.get('/api/regs', (req, res) => {
  const rows = db.prepare('SELECT key, child FROM registrations').all();
  const regs = {};
  for (const r of rows) {
    if (!regs[r.key]) regs[r.key] = [];
    regs[r.key].push(r.child);
  }
  res.json(regs);
});

router.post('/api/regs/:key', (req, res) => {
  const { key } = req.params;
  const { child } = req.body;
  if (!child || typeof child !== 'number') return res.status(400).json({ error: 'child required' });
  db.prepare('INSERT OR IGNORE INTO registrations(key,child) VALUES(?,?)').run(key, child);
  res.json({ ok: true });
});

router.delete('/api/regs/:key/:child', (req, res) => {
  db.prepare('DELETE FROM registrations WHERE key=? AND child=?')
    .run(req.params.key, parseInt(req.params.child));
  res.json({ ok: true });
});

router.put('/api/regs/:key', (req, res) => {
  const { key } = req.params;
  const { children } = req.body;
  if (!Array.isArray(children)) return res.status(400).json({ error: 'children array required' });
  const del = db.prepare('DELETE FROM registrations WHERE key=?');
  const ins = db.prepare('INSERT OR IGNORE INTO registrations(key,child) VALUES(?,?)');
  db.transaction(() => { del.run(key); for (const c of children) ins.run(key, c); })();
  res.json({ ok: true });
});

// Static assets (js, css, etc.) — index.html served dynamically below
router.use(express.static(path.join(__dirname, 'public')));

// SPA fallback — always return index.html with injected BASE_PATH
router.get('*', (req, res) => res.type('html').send(getHtml()));

app.use(BASE_PATH || '/', router);

// If BASE_PATH set, also redirect bare root → BASE_PATH
if (BASE_PATH) {
  app.get('/', (req, res) => res.redirect(BASE_PATH + '/'));
}

app.listen(PORT, () => console.log(`Oratorij app on :${PORT} (base: '${BASE_PATH || '/'}')`));
