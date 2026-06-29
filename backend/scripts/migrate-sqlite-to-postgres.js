const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const sqlitePath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.resolve(__dirname, '../../data/regs.db');

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL to your Supabase/Postgres connection string first.');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const ssl = process.env.PGSSLMODE === 'disable' || isLocal
  ? false
  : { rejectUnauthorized: false };

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });

async function main() {
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

  const configRows = sqlite.prepare('SELECT k, v FROM config').all();
  const regRows = sqlite.prepare('SELECT key, child FROM registrations').all();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of configRows) {
      await client.query(
        'INSERT INTO config(k,v) VALUES($1,$2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v',
        [row.k, row.v]
      );
    }

    for (const row of regRows) {
      await client.query(
        'INSERT INTO registrations(key,child) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [row.key, row.child]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`Migrated ${configRows.length} config rows and ${regRows.length} registrations from ${sqlitePath}.`);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await pool.end();
  });
