# RestoPOS — Architecture

## Overview

Single deployable Next.js 15 application (App Router) serving three surfaces:

- **Admin** (desktop-first): dashboard, menu, inventory, purchasing, customers, expenses, employees, reports, settings
- **POS** (touch-first): order taking, tables, payments, cash sessions
- **KDS** (kitchen display, touch/readability-first): preparation queue — no financial data

All business logic runs **server-side** in Server Actions / Route Handlers. The client never
computes a price that the server trusts, and never decides authorization.

```
app/
  login/            public auth screen
  (app)/            authenticated shell (sidebar + topbar)
  api/health        liveness probe
components/
  ui/               design-system primitives (Radix-based, RTL-safe)
  layout/           sidebar, topbar, page chrome
lib/
  auth/             sessions (DB-backed), passwords, RBAC helpers
  actions/          server actions per module
  db.ts             Prisma singleton
  money.ts units.ts constants.ts permissions.ts …
prisma/
  schema.prisma     53 models — see "Database"
  seed.ts           FASTFOOD DZ demo data (idempotent)
messages/           fr.json ar.json en.json (next-intl)
tests/              Vitest business-logic suite
```

## Database

SQLite (WAL) by default via Prisma — zero-setup, transactional, ideal for on-premise
single-node POS. The schema is deliberately **PostgreSQL-portable**:

- **No enums** → validated string constants (`lib/constants.ts`, zod at every write)
- **No Json columns** → JSON serialized into `String` columns, zod-parsed on read
- **No Decimal** → integers only (see conventions below)

### Conventions (critical)

| Kind | Storage | Example |
|---|---|---|
| Money | integer **centimes** of DZD | 600 DA → `60000` |
| Tax / percentages | integer **basis points** | 19% → `1900` |
| Stock quantities | integer **base units** (g / ml / unit) | 4 kg → `4000` |
| Ingredient costs | integer **millicentimes per base unit** | 947 DA/kg → `94700` mc/g |

Rounding: half away from zero, applied only when a value enters a financial figure.

### Integrity rules

1. **Stock ledger**: every stock change writes a `StockMovement` row with
   `qtyBefore/qtyChange/qtyAfter`, type, user, reason and a reference to the
   triggering document (order / purchase / waste). Inventory.qtyOnHand is only
   updated inside the same transaction as its movement row.
2. **Snapshots**: `OrderItem` stores name/unit-price/tax/modifier snapshots so
   historical orders and receipts are immune to menu edits.
3. **No hard deletes** for financial rows (orders, payments, expenses) —
   status transitions and reversal records (`Refund`, `voidedAt`, `deletedAt`).
4. **Idempotency**: orders and payments carry a unique client-generated
   `idempotencyKey`; retries cannot double-charge or double-create.
5. **Optimistic concurrency**: `Order.version` guards conflicting writes.
6. **Counters**: `OrderCounter` rows are incremented inside transactions to
   produce per-branch daily order numbers (`A-104`) and PO numbers.

## Authentication & authorization

- Credentials login → DB session row (`sha256(token)` stored) + httpOnly `rp_session`
  cookie (SameSite=Lax, Secure in production). Sliding 24 h expiry.
- Brute-force protection: per-IP+email rate limit and account lock after
  repeated failures; failed logins are audit-logged.
- **RBAC**: `roles × permissions` (catalog in `lib/permissions.ts`) with per-role
  grants stored in DB and editable by owner/admin. Eight system roles are seeded
  with spec-anchored defaults (cashier: no profit reports, no manual stock;
  kitchen: kitchen only…).
- Enforcement is a single server-side helper family:
  `requireAuth` / `requirePermissionPage` (pages) and `assertPermission`
  (actions/routes). Middleware only does redirect UX and is never trusted.
- Sensitive actions write `AuditLog` rows (user, action, entity, before/after, ip).

## i18n & RTL

- next-intl, cookie-based locale (`rp_locale`), default **fr**; per-user preference.
- `<html lang dir>` set per request; Radix `DirectionProvider` propagates direction;
  all custom components use logical CSS properties (`ps-`, `me-`, `start-`…).
- Arabic uses the Cairo typeface (self-hosted via `pnpm fonts`), Latin locales use Inter.
- Financial figures use Latin digits in all locales (standard on Algerian receipts).

## Real-time (Phase 4)

Server-Sent Events with an in-process event bus (POS → KDS, KDS → POS, orders/stock →
dashboard). Single-node by design; the documented scale-out path is a Redis pub/sub
bridge behind the same event API.

## Printing (Phase 4)

Print-perfect 58/80 mm CSS templates for customer receipts and price-free kitchen
tickets, driven by browser/OS printing. Printer records + category routing live in DB;
direct ESC/POS raw printing is a documented hardware-bridge extension.

## Offline posture (Phase 9)

Explicit ONLINE / OFFLINE / SYNCHRONIZING indicator, retry-safe mutations
(idempotency keys), client-side queue for order submission during transient outages,
conflict detection instead of silent overwrite. A fully offline PWA POS is out of
scope for v1.

## Testing

Vitest covers the money/units/permission foundations today and grows each phase to
cover order totals, discounts, taxes, split payments, change, recipe deduction,
receiving, waste, refunds, cash-session math, permission enforcement, multi-branch
isolation and concurrent stock consumption.
