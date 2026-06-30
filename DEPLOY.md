# Deploy checklist

## 1. Supabase

1. Create a new Supabase project.
2. Open **Project Settings -> Database**.
3. Copy the Postgres connection string.
4. Keep the password private.

## 2. Render

1. Open Render and choose **New -> Blueprint**.
2. Select this repository: `tobijaantolic-ctrl/oratriji`.
3. Render reads `render.yaml`.
4. Set these environment variables:

```text
DATABASE_URL=postgresql://...
```

5. Deploy the service.
6. Open the public Render URL.
7. The app opens without a password. To require one later, add `APP_PASSWORD`.

## 3. Optional SQLite migration

Run this once if local data should be copied to Supabase:

```bash
cd backend
SQLITE_PATH="../data/regs.db" DATABASE_URL="postgresql://..." npm run migrate:postgres
```

## 4. Smoke test

After deploy, run this from the repository:

```bash
cd backend
APP_URL="https://YOUR-RENDER-URL" npm run smoke
```

This checks `/healthz`, saving a test registration, and deleting it again.
