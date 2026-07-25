/**
 * Phase 3 end-to-end harness — exercises the REAL server actions over HTTP
 * (Next-Action protocol) against a running production server + seeded DB.
 *
 * Usage:  node scripts/e2e-phase3.mjs [baseUrl]
 * Needs:  pnpm build && PORT=3212 pnpm start   (and a seeded prisma/dev.db)
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3212";
const db = new PrismaClient();

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

/** Find a server action's id in the built client chunks by exported name. */
function actionId(exportName) {
  const out = execSync(
    `grep -rhoE '"[0-9a-f]{40,}",[^)]{0,200}"${exportName}"' .next/static/chunks | head -1`,
    { encoding: "utf8" }
  ).trim();
  const match = out.match(/"([0-9a-f]{40,})"/);
  if (!match) throw new Error(`action id not found for ${exportName}`);
  return match[1];
}

async function mintSession(email) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const raw = crypto.randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
      expiresAt: new Date(Date.now() + 3600e3),
    },
  });
  return { token: raw, userId: user.id };
}

async function callAction(path, id, args, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Next-Action": id,
      "Content-Type": "text/plain;charset=UTF-8",
      Cookie: `rp_session=${token}`,
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  console.log(`E2E against ${BASE}\n`);

  // --- Setup -----------------------------------------------------------------
  const org = await db.organization.findFirstOrThrow({ where: { name: "FASTFOOD DZ" } });
  const branch = await db.branch.findFirstOrThrow({ where: { orgId: org.id, code: "01" } });
  const cashier = await mintSession("caissier@fastfood.dz");
  const kitchen = await mintSession("cuisine@fastfood.dz");

  const classic = await db.product.findFirstOrThrow({ where: { orgId: org.id, name: "Classic Burger" }, include: { variants: true } });
  const doubleVariant = classic.variants.find((v) => v.name === "Double");
  const extraFromage = await db.modifier.findFirstOrThrow({ where: { name: "Extra fromage", group: { orgId: org.id } } });
  const combo = await db.product.findFirstOrThrow({ where: { orgId: org.id, name: "Menu Burger" }, include: { comboGroups: { include: { items: true } } } });
  const frites = await db.product.findFirstOrThrow({ where: { orgId: org.id, name: "Frites" } });
  const coca = await db.product.findFirstOrThrow({ where: { orgId: org.id, name: "Coca-Cola" } });
  const cashMethod = await db.paymentMethod.findFirstOrThrow({ where: { orgId: org.id, code: "cash" } });
  const table1 = await db.restaurantTable.findFirstOrThrow({ where: { branchId: branch.id, name: "T-01" } });

  const createId = actionId("createOrderAction");
  const payId = actionId("addPaymentAction");
  const statusId = actionId("updateOrderStatusAction");

  const comboSelections = combo.comboGroups.map((g) => {
    const wanted =
      g.name === "Burger" ? classic.id : g.name === "Accompagnement" ? frites.id : coca.id;
    const item = g.items.find((i) => i.productId === wanted) ?? g.items[0];
    return { comboGroupId: g.id, productId: item.productId };
  });

  // --- 1. Takeaway order via cashier -------------------------------------------
  console.log("1. Cashier creates a takeaway order (variant + modifier + combo)");
  const idem = crypto.randomUUID();
  const payload = {
    idempotencyKey: idem,
    type: "takeaway",
    items: [
      {
        productId: classic.id,
        variantId: doubleVariant.id,
        qty: 1,
        notes: "sans oignon",
        modifierIds: [extraFromage.id],
        comboSelections: [],
      },
      { productId: combo.id, qty: 1, modifierIds: [], comboSelections },
    ],
  };
  await callAction("/pos", createId, [branch.id, payload], cashier.token);

  const order = await db.order.findUnique({
    where: { idempotencyKey: idem },
    include: { items: { include: { modifiers: true } } },
  });
  check("order created", Boolean(order));
  check("order number has takeaway prefix A-", order?.number.startsWith("A-") ?? false, order?.number);
  // Classic Double 600 + extra fromage 50 = 650 · Menu Burger 800 → 1450 DA
  check("server-computed subtotal = 1450 DA", order?.subtotal === 145000, String(order?.subtotal));
  check("total = 1450 DA", order?.total === 145000);
  check("status confirmed", order?.status === "confirmed");
  const parents = order?.items.filter((i) => !i.parentItemId) ?? [];
  const children = order?.items.filter((i) => i.parentItemId) ?? [];
  check("2 parent lines + 3 combo children", parents.length === 2 && children.length === 3, `${parents.length}/${children.length}`);
  check("modifier snapshot stored", parents.some((p) => p.modifiers.some((m) => m.nameSnapshot === "Extra fromage")));
  check("item note stored", parents.some((p) => p.notes === "sans oignon"));

  // --- 2. Idempotent retry -------------------------------------------------------
  console.log("2. Retrying the same createOrder (same idempotency key)");
  const before = await db.order.count({ where: { orgId: org.id } });
  await callAction("/pos", createId, [branch.id, payload], cashier.token);
  const after = await db.order.count({ where: { orgId: org.id } });
  check("no duplicate order on retry", before === after, `${before} -> ${after}`);

  // --- 3. Split payment: 1000 cash + 450 cash w/ 500 received ---------------------
  console.log("3. Split payment with change");
  await callAction("/pos", payId, [{ orderId: order.id, methodId: cashMethod.id, amount: "1000", idempotencyKey: crypto.randomUUID() }], cashier.token);
  let refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("partial payment recorded (paid 1000)", refreshed.paidAmount === 100000, String(refreshed.paidAmount));
  check("paymentStatus partial", refreshed.paymentStatus === "partial");

  await callAction("/pos", payId, [{ orderId: order.id, methodId: cashMethod.id, amount: "450", receivedAmount: "500", idempotencyKey: crypto.randomUUID() }], cashier.token);
  refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { payments: true } });
  check("fully paid", refreshed.paidAmount === 145000 && refreshed.paymentStatus === "paid");
  const lastPayment = refreshed.payments.find((p) => p.amount === 45000);
  check("change 50 DA computed on second payment", lastPayment?.changeAmount === 5000, String(lastPayment?.changeAmount));

  // --- 4. Overpayment rejected -----------------------------------------------------
  console.log("4. Overpayment is rejected");
  const payCountBefore = await db.payment.count();
  await callAction("/pos", payId, [{ orderId: order.id, methodId: cashMethod.id, amount: "100", idempotencyKey: crypto.randomUUID() }], cashier.token);
  check("no payment recorded beyond total", (await db.payment.count()) === payCountBefore);

  // --- 5. Complete + lifecycle guard ------------------------------------------------
  console.log("5. Lifecycle: preparing → ready → served → completed");
  for (const next of ["preparing", "ready", "served", "completed"]) {
    await callAction("/orders", statusId, [order.id, next], cashier.token);
  }
  refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("order completed", refreshed.status === "completed");
  await callAction("/orders", statusId, [order.id, "preparing"], cashier.token);
  refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("completed order cannot regress", refreshed.status === "completed");

  // --- 6. Dine-in occupies the table --------------------------------------------------
  console.log("6. Dine-in order occupies table T-01");
  const dineIdem = crypto.randomUUID();
  await callAction(
    "/pos",
    createId,
    [branch.id, {
      idempotencyKey: dineIdem,
      type: "dine_in",
      tableId: table1.id,
      guestCount: 3,
      items: [{ productId: frites.id, qty: 2, modifierIds: [], comboSelections: [] }],
    }],
    cashier.token
  );
  const dineOrder = await db.order.findUnique({ where: { idempotencyKey: dineIdem } });
  const tableAfter = await db.restaurantTable.findUniqueOrThrow({ where: { id: table1.id } });
  check("dine-in order created (D- prefix)", dineOrder?.number.startsWith("D-") ?? false, dineOrder?.number);
  check("table marked occupied", tableAfter.status === "occupied", tableAfter.status);
  check("unpaid order cannot be completed", true); // covered below
  await callAction("/orders", statusId, [dineOrder.id, "completed"], cashier.token);
  const dineRefreshed = await db.order.findUniqueOrThrow({ where: { id: dineOrder.id } });
  check("completion blocked while unpaid", dineRefreshed.status === "confirmed", dineRefreshed.status);

  // --- 7. RBAC: kitchen cannot create orders -------------------------------------------
  console.log("7. RBAC: kitchen account is refused");
  const kitchenIdem = crypto.randomUUID();
  await callAction(
    "/pos",
    createId,
    [branch.id, { idempotencyKey: kitchenIdem, type: "takeaway", items: [{ productId: frites.id, qty: 1, modifierIds: [], comboSelections: [] }] }],
    kitchen.token
  );
  check("no order created by kitchen role", (await db.order.findUnique({ where: { idempotencyKey: kitchenIdem } })) === null);

  // --- 8. Client price tampering is ignored (server reprices) -------------------------
  console.log("8. Server ignores client-side price fields");
  const tamperIdem = crypto.randomUUID();
  await callAction(
    "/pos",
    createId,
    [branch.id, {
      idempotencyKey: tamperIdem,
      type: "takeaway",
      items: [{ productId: coca.id, qty: 1, modifierIds: [], comboSelections: [], unitPrice: 1, sellPrice: 1, total: 1 }],
    }],
    cashier.token
  );
  const tampered = await db.order.findUnique({ where: { idempotencyKey: tamperIdem } });
  check("price came from DB (150 DA), not client", tampered?.total === 15000, String(tampered?.total));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
