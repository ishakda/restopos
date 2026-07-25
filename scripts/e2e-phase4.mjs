/**
 * Phase 4 e2e — KDS flow (kitchen RBAC), realtime SSE, print routes.
 * Usage: node scripts/e2e-phase4.mjs [baseUrl]   (needs built server + seeded DB)
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import crypto from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3214";
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

function visibleHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

async function main() {
  console.log(`E2E Phase 4 against ${BASE}\n`);

  const org = await db.organization.findFirstOrThrow({ where: { name: "FASTFOOD DZ" } });
  const branch = await db.branch.findFirstOrThrow({ where: { orgId: org.id, code: "01" } });
  const cashier = await mintSession("caissier@fastfood.dz");
  const kitchen = await mintSession("cuisine@fastfood.dz");
  const frites = await db.product.findFirstOrThrow({ where: { orgId: org.id, name: "Frites" } });

  const createId = actionId("createOrderAction");
  const statusId = actionId("updateOrderStatusAction");

  // --- 1. SSE stream receives order.created in real time -----------------------
  console.log("1. SSE stream delivers events live");
  const controller = new AbortController();
  const received = [];
  const ssePromise = (async () => {
    const res = await fetch(`${BASE}/api/events?branch=${branch.id}`, {
      headers: { Cookie: `rp_session=${cashier}` },
      signal: controller.signal,
    });
    check("SSE endpoint returns 200 + event-stream", res.status === 200 && (res.headers.get("content-type") ?? "").includes("text/event-stream"));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            received.push(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    }
  })().catch(() => {});

  await new Promise((r) => setTimeout(r, 600)); // let the stream connect

  const idem = crypto.randomUUID();
  await callAction("/pos", createId, [branch.id, { idempotencyKey: idem, type: "takeaway", items: [{ productId: frites.id, qty: 1, modifierIds: [], comboSelections: [] }] }], cashier);
  const order = await db.order.findUniqueOrThrow({ where: { idempotencyKey: idem } });

  await new Promise((r) => setTimeout(r, 800));
  check("order.created event received over SSE", received.some((e) => e.type === "order.created" && e.orderId === order.id), JSON.stringify(received.map((e) => e.type)));

  // --- 2. Kitchen user advances via kitchen.update ------------------------------
  console.log("2. Kitchen role advances the pass");
  await callAction("/kitchen", statusId, [order.id, "preparing"], kitchen);
  let refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("kitchen: confirmed → preparing", refreshed.status === "preparing", refreshed.status);

  await callAction("/kitchen", statusId, [order.id, "ready"], kitchen);
  refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("kitchen: preparing → ready", refreshed.status === "ready");

  await new Promise((r) => setTimeout(r, 800));
  check("order.updated (ready) event received", received.some((e) => e.type === "order.updated" && e.status === "ready" && e.orderId === order.id));

  // recall
  await callAction("/kitchen", statusId, [order.id, "preparing"], kitchen);
  refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("kitchen recall: ready → preparing", refreshed.status === "preparing");

  // kitchen must NOT complete
  await callAction("/kitchen", statusId, [order.id, "ready"], kitchen);
  await callAction("/kitchen", statusId, [order.id, "completed"], kitchen);
  refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  check("kitchen role cannot complete orders", refreshed.status === "ready", refreshed.status);

  controller.abort();
  await ssePromise;

  // --- 3. KDS page: renders, and hides financial data ---------------------------
  console.log("3. KDS screen (no financial data)");
  const kdsHtml = visibleHtml(await (await fetch(`${BASE}/kitchen`, { headers: { Cookie: `rp_session=${kitchen}` } })).text());
  check("KDS renders order number", kdsHtml.includes(order.number));
  check("KDS shows items", kdsHtml.includes("Frites"));
  check("KDS visible UI contains no DA amounts", !/[0-9][\u202F\u00A0 ,.]*[0-9]*\s*DA\b/.test(kdsHtml) && !/\bTOTAL\b/.test(kdsHtml), "");

  // --- 4. Print routes ------------------------------------------------------------
  console.log("4. Print templates");
  const receiptHtml = await (await fetch(`${BASE}/print/receipt/${order.id}`, { headers: { Cookie: `rp_session=${cashier}` } })).text();
  check("receipt renders org + number + total", receiptHtml.includes("FASTFOOD DZ") && receiptHtml.includes(order.number) && receiptHtml.includes("250 DA"));
  check("receipt includes footer", receiptHtml.includes("Merci pour votre visite"));

  const receipt58 = await (await fetch(`${BASE}/print/receipt/${order.id}?w=58`, { headers: { Cookie: `rp_session=${cashier}` } })).text();
  check("58mm variant uses 48mm content width", receipt58.includes("48mm"));

  const ticketHtml = visibleHtml(await (await fetch(`${BASE}/print/kitchen/${order.id}`, { headers: { Cookie: `rp_session=${kitchen}` } })).text());
  check("kitchen ticket renders items", ticketHtml.includes("FRITES"));
  check("kitchen ticket visible UI has NO prices", !ticketHtml.includes("250 DA") && !/Sous-total|Subtotal/i.test(ticketHtml));

  // routed printer: Cuisine has no category links → receives everything
  const printer = await db.printer.findFirstOrThrow({ where: { branchId: branch.id, name: "Cuisine" } });
  const routedHtml = await (await fetch(`${BASE}/print/kitchen/${order.id}?printer=${printer.id}`, { headers: { Cookie: `rp_session=${kitchen}` } })).text();
  check("printer-routed ticket works (default = all items)", routedHtml.includes("FRITES") && routedHtml.includes("Cuisine"));

  // category routing: link printer to Burgers only → Frites excluded
  const burgers = await db.category.findFirstOrThrow({ where: { orgId: org.id, name: "Burgers" } });
  await db.printerCategory.create({ data: { printerId: printer.id, categoryId: burgers.id } });
  const filteredHtml = await (await fetch(`${BASE}/print/kitchen/${order.id}?printer=${printer.id}`, { headers: { Cookie: `rp_session=${kitchen}` } })).text();
  check("category routing filters items (Frites not on Burgers printer)", !filteredHtml.includes("1 ×") || !filteredHtml.includes("FRITES"));
  await db.printerCategory.deleteMany({ where: { printerId: printer.id } });

  // --- 5. SSE auth ------------------------------------------------------------------
  console.log("5. SSE security");
  const anon = await fetch(`${BASE}/api/events?branch=${branch.id}`, { redirect: "manual" });
  check("unauthenticated SSE blocked (401 or login redirect)", anon.status === 401 || (anon.status >= 300 && anon.status < 400));
  anon.body?.cancel();
  const wrongBranchUser = await mintSession("caissier@fastfood.dz");
  const otherBranch = await db.branch.findFirstOrThrow({ where: { orgId: org.id, code: "02" } });
  const crossBranch = await fetch(`${BASE}/api/events?branch=${otherBranch.id}`, { headers: { Cookie: `rp_session=${wrongBranchUser}` }, redirect: "manual" });
  check("branch-pinned user cannot subscribe to another branch (403)", crossBranch.status === 403, String(crossBranch.status));
  crossBranch.body?.cancel();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
