/**
 * RestoPOS demo seed — "FASTFOOD DZ"
 * Idempotent: safe to run repeatedly (upserts everywhere).
 *
 * Phase 1 scope: organization, branches, permission catalog, system roles,
 * demo users, payment methods, expense categories, cash registers, delivery
 * zones, restaurant tables, base settings.
 * Later phases extend this file (menu, ingredients, recipes, customers…).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  PERMISSION_CATALOG,
  DEFAULT_ROLE_PERMISSIONS,
  SYSTEM_ROLE_NAMES,
} from "../lib/permissions";
import { SYSTEM_ROLE_KEYS, type SystemRoleKey } from "../lib/constants";

const db = new PrismaClient();

export const DEMO_PASSWORD = "Demo@2026";

async function seedPermissions() {
  for (const perm of PERMISSION_CATALOG) {
    await db.permission.upsert({
      where: { code: perm.code },
      update: { module: perm.module },
      create: { code: perm.code, module: perm.module },
    });
  }
  console.log(`✓ permissions (${PERMISSION_CATALOG.length})`);
}

async function seedOrganization() {
  const existing = await db.organization.findFirst({ where: { name: "FASTFOOD DZ" } });
  const org =
    existing ??
    (await db.organization.create({
      data: {
        name: "FASTFOOD DZ",
        address: "12 Rue Didouche Mourad, Alger",
        phone: "+213 21 63 00 00",
        email: "contact@fastfood.dz",
        currency: "DZD",
        country: "DZ",
        timezone: "Africa/Algiers",
        defaultLocale: "fr",
      },
    }));

  const branch1 = await db.branch.upsert({
    where: { orgId_code: { orgId: org.id, code: "01" } },
    update: {},
    create: {
      orgId: org.id,
      code: "01",
      name: "Alger Centre",
      address: "12 Rue Didouche Mourad, Alger",
      phone: "+213 21 63 00 01",
    },
  });
  const branch2 = await db.branch.upsert({
    where: { orgId_code: { orgId: org.id, code: "02" } },
    update: {},
    create: {
      orgId: org.id,
      code: "02",
      name: "Bab Ezzouar",
      address: "Centre commercial, Bab Ezzouar, Alger",
      phone: "+213 21 63 00 02",
    },
  });
  console.log(`✓ organization "${org.name}" + branches (${branch1.name}, ${branch2.name})`);
  return { org, branch1, branch2 };
}

async function seedRoles(orgId: string) {
  const permissions = await db.permission.findMany();
  const byCode = new Map(permissions.map((p) => [p.code, p.id]));

  const roles: Record<SystemRoleKey, string> = {} as Record<SystemRoleKey, string>;

  for (const key of SYSTEM_ROLE_KEYS) {
    const role = await db.role.upsert({
      where: { orgId_systemKey: { orgId, systemKey: key } },
      update: {},
      create: {
        orgId,
        name: SYSTEM_ROLE_NAMES[key],
        systemKey: key,
        isSystem: true,
      },
    });
    roles[key] = role.id;

    // Sync default permissions ONLY on first creation (respect later UI edits):
    const existingCount = await db.rolePermission.count({ where: { roleId: role.id } });
    if (existingCount === 0) {
      const codes = DEFAULT_ROLE_PERMISSIONS[key];
      await db.rolePermission.createMany({
        data: codes
          .map((code) => byCode.get(code))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }
  }
  console.log(`✓ roles (${SYSTEM_ROLE_KEYS.length} system roles)`);
  return roles;
}

async function seedUsers(orgId: string, roles: Record<SystemRoleKey, string>, branch1Id: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 11);

  const users: { email: string; name: string; role: SystemRoleKey; branchId?: string; locale?: string }[] = [
    { email: "owner@fastfood.dz", name: "Karim Benali", role: "owner" },
    { email: "admin@fastfood.dz", name: "Nassim Haddad", role: "administrator" },
    { email: "manager@fastfood.dz", name: "Lina Cherif", role: "manager", branchId: branch1Id },
    { email: "caissier@fastfood.dz", name: "Ahmed Meziane", role: "cashier", branchId: branch1Id },
    { email: "serveur@fastfood.dz", name: "Yacine Boudiaf", role: "waiter", branchId: branch1Id },
    { email: "cuisine@fastfood.dz", name: "Mohamed Saidi", role: "kitchen", branchId: branch1Id, locale: "ar" },
    { email: "livreur@fastfood.dz", name: "Sofiane Krim", role: "delivery", branchId: branch1Id },
    { email: "stock@fastfood.dz", name: "Amine Toumi", role: "stock_manager", branchId: branch1Id },
  ];

  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: { roleId: roles[u.role] },
      create: {
        orgId,
        email: u.email,
        name: u.name,
        passwordHash,
        roleId: roles[u.role],
        branchId: u.branchId ?? null,
        locale: u.locale ?? "fr",
      },
    });
  }
  console.log(`✓ users (${users.length}) — password: ${DEMO_PASSWORD}`);
}

async function seedPaymentMethods(orgId: string) {
  const methods = [
    { code: "cash", name: "Espèces", type: "cash", sortOrder: 0 },
    { code: "card_cib", name: "Carte CIB", type: "card", sortOrder: 1 },
    { code: "edahabia", name: "Edahabia", type: "card", sortOrder: 2 },
  ];
  for (const m of methods) {
    await db.paymentMethod.upsert({
      where: { orgId_code: { orgId, code: m.code } },
      update: {},
      create: { orgId, ...m },
    });
  }
  console.log(`✓ payment methods (${methods.length})`);
}

async function seedExpenseCategories(orgId: string) {
  const categories = [
    "Loyer",
    "Électricité",
    "Gaz",
    "Eau",
    "Salaires",
    "Livraison",
    "Maintenance",
    "Marketing",
    "Équipement",
    "Autre",
  ];
  for (const name of categories) {
    await db.expenseCategory.upsert({
      where: { orgId_name: { orgId, name } },
      update: {},
      create: { orgId, name, isSystem: true },
    });
  }
  console.log(`✓ expense categories (${categories.length})`);
}

async function seedBranchFixtures(branchId: string, branchLabel: string) {
  await db.cashRegister.upsert({
    where: { branchId_name: { branchId, name: "Caisse 1" } },
    update: {},
    create: { branchId, name: "Caisse 1" },
  });

  const zones = [
    { name: "Centre-ville", fee: 15000 }, // 150 DA
    { name: "Périphérie", fee: 25000 }, // 250 DA
  ];
  for (const z of zones) {
    await db.deliveryZone.upsert({
      where: { branchId_name: { branchId, name: z.name } },
      update: {},
      create: { branchId, ...z },
    });
  }

  const tables = [
    { name: "T-01", seats: 2, zone: "Salle", posX: 0, posY: 0 },
    { name: "T-02", seats: 2, zone: "Salle", posX: 1, posY: 0 },
    { name: "T-03", seats: 4, zone: "Salle", posX: 2, posY: 0 },
    { name: "T-04", seats: 4, zone: "Salle", posX: 0, posY: 1 },
    { name: "T-05", seats: 4, zone: "Salle", posX: 1, posY: 1 },
    { name: "T-06", seats: 6, zone: "Salle", posX: 2, posY: 1 },
    { name: "T-07", seats: 4, zone: "Terrasse", posX: 0, posY: 2 },
    { name: "T-08", seats: 4, zone: "Terrasse", posX: 1, posY: 2 },
  ];
  for (const t of tables) {
    await db.restaurantTable.upsert({
      where: { branchId_name: { branchId, name: t.name } },
      update: {},
      create: { branchId, ...t },
    });
  }
  console.log(`✓ fixtures for ${branchLabel} (register, zones, ${tables.length} tables)`);
}

async function seedSettings(orgId: string) {
  const settings: { key: string; value: unknown }[] = [
    { key: "pos.defaultOrderType", value: "takeaway" },
    { key: "tax.mode", value: "inclusive" }, // Algerian restaurant prices are TTC by default
    { key: "tax.defaultRate", value: 0 }, // basis points; owner can enable TVA per product
    { key: "receipt.footer", value: "Merci pour votre visite" },
    { key: "receipt.showLogo", value: true },
    { key: "stock.negativePolicy", value: "block" }, // block | allow
    { key: "kitchen.warnAfterMinutes", value: 15 },
    { key: "loyalty.enabled", value: false },
    { key: "loyalty.earnPer100Da", value: 1 },
    { key: "loyalty.pointValueCentimes", value: 100 },
  ];
  for (const s of settings) {
    await db.setting.upsert({
      where: { orgId_scope_key: { orgId, scope: "org", key: s.key } },
      update: {},
      create: { orgId, scope: "org", key: s.key, value: JSON.stringify(s.value) },
    });
  }
  console.log(`✓ settings (${settings.length})`);
}

async function main() {
  console.log("Seeding RestoPOS demo data…");
  await seedPermissions();
  const { org, branch1, branch2 } = await seedOrganization();
  const roles = await seedRoles(org.id);
  await seedUsers(org.id, roles, branch1.id);
  await seedPaymentMethods(org.id);
  await seedExpenseCategories(org.id);
  await seedBranchFixtures(branch1.id, branch1.name);
  await seedBranchFixtures(branch2.id, branch2.name);
  await seedSettings(org.id);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
