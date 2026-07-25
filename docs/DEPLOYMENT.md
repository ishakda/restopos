# RestoPOS — Deployment

## Single-node VPS (recommended baseline)

```bash
# Node 20+ and pnpm required
pnpm install
cp .env.example .env        # set SESSION_SECRET (openssl rand -hex 32), APP_URL
pnpm db:deploy              # apply migrations
pnpm db:seed                # optional demo data
pnpm build
pnpm start                  # behind a reverse proxy (Caddy/Nginx) with HTTPS
```

- Put the app behind **HTTPS** (Caddy auto-TLS is the simplest); the session cookie
  is `Secure` in production.
- Run as a systemd service or with pm2 for restarts.

## Database

Default: SQLite at `prisma/dev.db` (WAL mode). For restaurant-scale traffic on one
node this is fast and transactional.

**Backups (critical — financial data):**

- SQLite: snapshot with `sqlite3 dev.db ".backup backup-$(date +%F).db"` on a cron
  (hourly recommended), sync the backup directory off-device (rclone → any cloud).
- Never rely on a single local device: keep at least one off-site copy.
- Restore procedure: stop the app, replace `prisma/dev.db` with the snapshot, start.

**PostgreSQL option (multi-node / managed):** the schema avoids SQLite-only types
(no enums/Json/Decimal), so porting is mechanical:

1. Change `datasource db` provider to `postgresql` and set `DATABASE_URL`.
2. Regenerate migrations (`prisma migrate dev`) against a fresh Postgres database.
3. Migrate data with `pg_loader`/custom script if moving an existing install.

## Scaling notes

- The in-memory rate limiter and SSE event bus are single-node; scale-out requires a
  Redis-backed limiter and pub/sub bridge (interfaces are isolated for this).
- Uploaded images live in `public/uploads` — move to S3-compatible storage when
  running more than one node.
