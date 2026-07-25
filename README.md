# RestoPOS

**Restaurant & fast-food management platform** — POS, kitchen display, tables, menu & recipes, inventory, purchasing, cash sessions, expenses, customers & loyalty, reports, multi-branch.

Built for Algerian restaurants, fast-foods, cafés, pizzerias and takeaway businesses:
**Arabic / French / English** UI with full **RTL**, **DZD** currency, CIB/Edahabia payment methods.

> Status: built in phases — see the module rollout on the home screen after login.
> Phase 1 (auth, organization, branches, RBAC, database foundation) is live.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict |
| Database | Prisma ORM on SQLite (WAL) — PostgreSQL-portable schema |
| UI | Tailwind CSS v4, Radix UI primitives, Lucide icons, Recharts |
| i18n | next-intl (fr / ar / en, cookie-based, full RTL) |
| Auth | DB-backed sessions (httpOnly cookie), bcrypt, configurable RBAC |
| Tests | Vitest |

## Quick start

```bash
pnpm install               # installs deps + generates Prisma client
cp .env.example .env       # then set a real SESSION_SECRET (openssl rand -hex 32)
pnpm db:migrate            # create the SQLite database (prisma/dev.db)
pnpm db:seed               # load the FASTFOOD DZ demo data
pnpm fonts                 # (optional) self-host Inter + Cairo webfonts
pnpm dev                   # http://localhost:3000
```

### Demo accounts (password: `Demo@2026`)

| Email | Role |
|---|---|
| owner@fastfood.dz | Propriétaire (all permissions) |
| admin@fastfood.dz | Administrateur |
| manager@fastfood.dz | Manager (branch 01) |
| caissier@fastfood.dz | Caissier — no profit reports, no manual stock edits |
| serveur@fastfood.dz | Serveur |
| cuisine@fastfood.dz | Cuisine — kitchen screen only (Arabic UI) |
| livreur@fastfood.dz | Livreur |
| stock@fastfood.dz | Magasinier — inventory/purchasing only |

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | run the app |
| `pnpm test` | Vitest suite (business logic) |
| `pnpm typecheck` | strict TypeScript check |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:studio` / `db:reset` | database lifecycle |
| `pnpm fonts` | download & self-host webfonts |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, database, money/stock conventions, security model
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production deployment, PostgreSQL option, backups

## Non-negotiable data rules

- Money is **integer centimes** of DZD — no floats, ever.
- Stock changes **only** through the `StockMovement` ledger (before/after, user, reason).
- Completed financial records are **never hard-deleted** — reversals/cancellations instead.
- Order items store **price/name/tax snapshots**: historical receipts never change when the menu does.
- Critical operations (payment, stock deduction, receiving, refunds, cash close) run in **DB transactions** with idempotency keys.
