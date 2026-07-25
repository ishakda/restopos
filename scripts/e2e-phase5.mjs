/**
 * Phase 5 e2e — stock deduction, reversal, alerts policy, waste, purchasing,
 * weighted average cost, and the CONCURRENT last-unit race (spec §36).
 * Usage: node scripts/e2e-phase5.mjs [baseUrl]   (built server + seeded DB)
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3215";
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
  return raw;
}

async function callAction(path, id, args, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Cookie: `rp_session=${token}` },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return res.status;
}

async function qty(branchId, ingredientId) {
  const row = await db.inventory.findUnique({
    where: { branchId_ingredientId: { branchId, ingredientId } },
  });
  return row?.qtyOnHand ?? 0;
}

async function main() {
  console.log(`E2E Phase 5 against ${BASE}\n`);

  const org = await db.organization.findFirstOrThrow({ where: { name: "FASTFOOD DZ" } });
  const branch = await db.branch.findFirstOrThrow({ where: { orgId: org.id, code: "01" } });
  const cashier = await mintSession("caissier@fastfood.dz");
  const manager = await mintSession("manager@fastfood.dz");
  const stockMgr = await mintSession("stock@fastfood.dz");

  const createId = actionId("createOrderAction");
  const cancelId = actionId("cancelOrderAction");
  const wasteId = actionId("recordWasteAction");
  const adjustId = actionId("adjustStockAction");
  const savePoId = actionId("savePurchaseOrderAction");
  const poStatusId = actionId("setPurchaseOrderStatusAction");
  const receiveId = actionId("receivePurchaseOrderAction");

  const byName = async (name) => db.ingredient.findFirstOrThrow({ where: { orgId: org.id, name } });
  const pain = await byName("Pain burger");
  const viande = await byName("Viande hachée");
  const cheddar = await byName("Fromage cheddar");
  const gruyere = await byName("Gruyère râpé");
  const coca = await byName("Coca-Cola 33cl");
  const cocaProduct = await db.product.findFirstOrThrow({ where: { orgId: org.id, name: "Coca-Cola" } });
  const classic = await db.product.findFirstOrThrow({
    where: { orgId: org.id, name: "Classic Burger" },
    include: { variants: true },
  });
  const doubleVariant = classic.variants.find((v) => v.name === "Double");
  const extraFromage = await db.modifier.findFirstOrThrow({ where: { name: "Extra fromage", group: { orgId: org.id } } });

  // --- 1. Opening stock exists (seeded through movements) -----------------------
  console.log("1. Opening stock via ledger");
  const painBefore = await qty(branch.id, pain.id);
  const viandeBefore = await qty(branch.id, viande.id);
  check("opening stock present", painBefore > 0 && viandeBefore > 0, `${painBefore}/${viandeBefore}`);
  const openingMovements = await db.stockMovement.count({ where: { branchId: branch.id, reason: "opening" } });
  check("opening movements recorded", openingMovements > 0);

  // --- 2. Sale deducts the recipe (variant + modifier) ---------------------------
  console.log("2. Sale deducts recipe + variant + modifier");
  const gruyereBefore = await qty(branch.id, gruyere.id);
  const cheddarBefore = await qty(branch.id, cheddar.id);
  const idem = crypto.randomUUID();
  await callAction("/pos", createId, [branch.id, {
    idempotencyKey: idem,
    type: "takeaway",
    items: [{ productId: classic.id, variantId: doubleVariant.id, qty: 2, modifierIds: [extraFromage.id], comboSelections: [] }],
  }], cashier);
  const order = await db.order.findUniqueOrThrow({ where: { idempotencyKey: idem }, include: { items: true } });

  // Double variant recipe: viande 180g, cheddar 30g; modifier: gruyère 20g — ×2
  check("meat deducted 360g (variant recipe ×2)", (await qty(branch.id, viande.id)) === viandeBefore - 360, String(viandeBefore - (await qty(branch.id, viande.id))));
  check("cheddar deducted 60g (variant recipe ×2)", (await qty(branch.id, cheddar.id)) === cheddarBefore - 60);
  check("gruyère deducted 40g (modifier ×2)", (await qty(branch.id, gruyere.id)) === gruyereBefore - 40);
  check("pain deducted 2", (await qty(branch.id, pain.id)) === painBefore - 2);
  const saleMovements = await db.stockMovement.count({ where: { orderId: order.id, type: "sale" } });
  check("sale movements written (9 ingredients incl. modifier)", saleMovements === 9, String(saleMovements));
  const parentItem = order.items.find((i) => !i.parentItemId);
  check("item cost snapshot stored", (parentItem?.costSnapshotMilli ?? 0) > 0, String(parentItem?.costSnapshotMilli));

  // --- 3. Pre-kitchen cancellation restores stock --------------------------------
  console.log("3. Cancel (confirmed) → ledger-driven reversal");
  // cashier lacks orders.cancel by design — cancellation is a manager permission
  await callAction("/orders", cancelId, [{ orderId: order.id, reason: "test annulation" }], cashier);
  check("cashier CANNOT cancel (RBAC)", (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status === "confirmed");
  await callAction("/orders", cancelId, [{ orderId: order.id, reason: "test annulation" }], manager);
  check("meat restored", (await qty(branch.id, viande.id)) === viandeBefore);
  check("pain restored", (await qty(branch.id, pain.id)) === painBefore);
  check("gruyère restored", (await qty(branch.id, gruyere.id)) === gruyereBefore);
  const reversals = await db.stockMovement.count({ where: { orderId: order.id, type: "reversal" } });
  check("reversal movements written", reversals === saleMovements);

  // --- 4. Out-of-stock policy blocks the order -------------------------------------
  console.log("4. Negative-stock policy (block)");
  await db.inventory.update({
    where: { branchId_ingredientId: { branchId: branch.id, ingredientId: coca.id } },
    data: { qtyOnHand: 1 },
  });
  const idem2 = crypto.randomUUID();
  await callAction("/pos", createId, [branch.id, {
    idempotencyKey: idem2,
    type: "takeaway",
    items: [{ productId: cocaProduct.id, qty: 2, modifierIds: [], comboSelections: [] }],
  }], cashier);
  check("2 cocas blocked (only 1 in stock)", (await db.order.findUnique({ where: { idempotencyKey: idem2 } })) === null);
  check("coca stock untouched", (await qty(branch.id, coca.id)) === 1);

  // --- 5. CONCURRENCY: two cashiers, last unit --------------------------------------
  console.log("5. Concurrent sale of the LAST unit (spec §36)");
  const raceKey1 = crypto.randomUUID();
  const raceKey2 = crypto.randomUUID();
  await Promise.all([
    callAction("/pos", createId, [branch.id, {
      idempotencyKey: raceKey1,
      type: "takeaway",
      items: [{ productId: cocaProduct.id, qty: 1, modifierIds: [], comboSelections: [] }],
    }], cashier),
    callAction("/pos", createId, [branch.id, {
      idempotencyKey: raceKey2,
      type: "takeaway",
      items: [{ productId: cocaProduct.id, qty: 1, modifierIds: [], comboSelections: [] }],
    }], cashier),
  ]);
  const cocaAfterRace = await qty(branch.id, coca.id);
  const raceWinners = await db.order.count({ where: { idempotencyKey: { in: [raceKey1, raceKey2] } } });
  check("exactly ONE concurrent sale won", raceWinners === 1, `${raceWinners} orders created`);
  check("stock never negative", cocaAfterRace === 0, String(cocaAfterRace));

  // --- 6. Waste --------------------------------------------------------------------
  console.log("6. Waste recording");
  const viandeBeforeWaste = await qty(branch.id, viande.id);
  const viandeAvgAtWaste = (await byName("Viande hachée")).avgCostMilli;
  await callAction("/waste", wasteId, [{
    branchId: branch.id,
    ingredientId: viande.id,
    qty: 0.5,
    displayUnit: "kg",
    reason: "expired",
    notes: "e2e test",
  }], stockMgr);
  check("waste deducted 500g", (await qty(branch.id, viande.id)) === viandeBeforeWaste - 500);
  const waste = await db.wasteRecord.findFirst({ where: { branchId: branch.id }, orderBy: { createdAt: "desc" } });
  // 500 g at the CURRENT weighted average cost
  const expectedWasteCost = Math.round((500 * viandeAvgAtWaste) / 1000);
  check("waste cost = 500g × current avg cost", waste?.costCentimes === expectedWasteCost, `${waste?.costCentimes} vs ${expectedWasteCost}`);

  // --- 7. RBAC: cashier can waste but NOT adjust -------------------------------------
  console.log("7. RBAC boundaries");
  const before7 = await qty(branch.id, viande.id);
  await callAction("/inventory", adjustId, [{
    branchId: branch.id,
    ingredientId: viande.id,
    countedQty: 99,
    displayUnit: "kg",
    reason: "hack attempt",
  }], cashier);
  check("cashier cannot adjust stock", (await qty(branch.id, viande.id)) === before7);

  // --- 8. Purchase flow: draft → ordered → partial → received + weighted cost ---------
  console.log("8. Purchasing & weighted average cost");
  const supplier = await db.supplier.findFirstOrThrow({ where: { orgId: org.id, name: "Boucherie El Baraka" } });
  const viandeAvgBefore = (await byName("Viande hachée")).avgCostMilli; // 85 000

  await callAction("/purchases/new", savePoId, [{
    branchId: branch.id,
    supplierId: supplier.id,
    lines: [{ ingredientId: viande.id, qty: 10, displayUnit: "kg", costPerDisplayUnit: "950" }],
  }], stockMgr);
  const po = await db.purchaseOrder.findFirstOrThrow({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  check("PO created as draft with total 9500 DA", po.status === "draft" && po.total === 950_000, `${po.status}/${po.total}`);

  await callAction(`/purchases/${po.id}`, poStatusId, [po.id, "ordered"], stockMgr);
  check("PO ordered", (await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status === "ordered");

  const stockBeforeReceive = await qty(branch.id, viande.id);
  // Partial: 4 kg now
  await callAction(`/purchases/${po.id}`, receiveId, [{ poId: po.id, lines: [{ itemId: po.items[0].id, qty: 4 }] }], stockMgr);
  let poNow = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
  check("partial receipt: status partially_received", poNow.status === "partially_received");
  check("stock +4000g", (await qty(branch.id, viande.id)) === stockBeforeReceive + 4000);

  const viandeAfterPartial = await byName("Viande hachée");
  const expectedAvg = Math.round((stockBeforeReceive * viandeAvgBefore + 4000 * 95_000) / (stockBeforeReceive + 4000));
  check("weighted avg cost recomputed", viandeAfterPartial.avgCostMilli === expectedAvg, `${viandeAfterPartial.avgCostMilli} vs ${expectedAvg}`);
  check("last cost updated to 95 000 milli/g", viandeAfterPartial.lastCostMilli === 95_000);

  // Receive the remaining 6 kg
  await callAction(`/purchases/${po.id}`, receiveId, [{ poId: po.id, lines: [{ itemId: po.items[0].id, qty: 6 }] }], stockMgr);
  poNow = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
  check("fully received", poNow.status === "received" && poNow.items[0].qtyReceived === 10_000);
  const purchaseMovements = await db.stockMovement.count({ where: { purchaseOrderId: po.id, type: "purchase" } });
  check("purchase movements written (2 receipts)", purchaseMovements === 2);

  // Over-receive must fail
  await callAction(`/purchases/${po.id}`, receiveId, [{ poId: po.id, lines: [{ itemId: po.items[0].id, qty: 1 }] }], stockMgr);
  poNow = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { items: true } });
  check("over-receiving rejected", poNow.items[0].qtyReceived === 10_000);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
