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
APP_PASSWORD=your-shared-password
```

5. Deploy the service.
6. Open the public Render URL.
7. Enter `APP_PASSWORD` in the app.

## 3. Optional SQLite migration

Run this once if local data should be copied to Supabase:

```bash
cd backend
SQLITE_PATH="../data/regs.db" DATABASE_URL="postgresql://..." npm run migrate:postgres
```

## 4. Smoke test

After deploy, these should work:

```bash
curl https://YOUR-RENDER-URL/healthz
curl -H "X-App-Password: YOUR_PASSWORD" https://YOUR-RENDER-URL/api/regs
```
