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

  const printers = [
    { name: "Caisse", type: "receipt", paperWidth: 80, isDefault: true },
    { name: "Cuisine", type: "kitchen", paperWidth: 80, isDefault: true },
  ];
  for (const p of printers) {
    await db.printer.upsert({
      where: { branchId_name: { branchId, name: p.name } },
      update: {},
      create: { branchId, ...p },
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
  console.log(`✓ fixtures for ${branchLabel} (register, zones, printers, ${tables.length} tables)`);
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

// ---------------------------------------------------------------------------
// Menu (Phase 2): categories, ingredients, modifiers, products, recipes, combo
// ---------------------------------------------------------------------------

/** DA per display unit → millicentimes per base unit (factor = base units per display unit). */
function daPerDisplayToMilli(da: number, factor: number): number {
  return Math.round((da * 100 * 1000) / factor);
}

async function seedMenu(orgId: string) {
  // --- Categories ------------------------------------------------------------
  const categoryNames = ["Menus", "Burgers", "Tacos", "Pizza", "Sandwiches", "Accompagnements", "Boissons", "Desserts"];
  const categories = new Map<string, string>();
  for (let i = 0; i < categoryNames.length; i++) {
    const name = categoryNames[i]!;
    let cat = await db.category.findFirst({ where: { orgId, name } });
    if (!cat) cat = await db.category.create({ data: { orgId, name, sortOrder: i } });
    categories.set(name, cat.id);
  }

  // --- Ingredients -----------------------------------------------------------
  // [name, category, baseUnit, displayUnit, factor(base per display), DA per display unit]
  const ingredientDefs: [string, string, string, string, number, number][] = [
    ["Pain burger", "Boulangerie", "unit", "unit", 1, 25],
    ["Galette tacos", "Boulangerie", "unit", "unit", 1, 30],
    ["Pâton pizza", "Boulangerie", "unit", "unit", 1, 40],
    ["Baguette", "Boulangerie", "unit", "unit", 1, 20],
    ["Viande hachée", "Viandes", "g", "kg", 1000, 850],
    ["Escalope de poulet", "Viandes", "g", "kg", 1000, 900],
    ["Fromage cheddar", "Crèmerie", "g", "kg", 1000, 1000],
    ["Gruyère râpé", "Crèmerie", "g", "kg", 1000, 1500],
    ["Mozzarella", "Crèmerie", "g", "kg", 1000, 1400],
    ["Mix 4 fromages", "Crèmerie", "g", "kg", 1000, 1800],
    ["Œuf", "Crèmerie", "unit", "unit", 1, 20],
    ["Tomate fraîche", "Légumes", "g", "kg", 1000, 120],
    ["Oignon", "Légumes", "g", "kg", 1000, 80],
    ["Laitue", "Légumes", "g", "kg", 1000, 150],
    ["Sauce tomate pizza", "Épicerie", "g", "kg", 1000, 250],
    ["Sauce algérienne", "Sauces", "g", "kg", 1000, 400],
    ["Mayonnaise", "Sauces", "g", "kg", 1000, 350],
    ["Ketchup", "Sauces", "g", "kg", 1000, 300],
    ["Sauce BBQ", "Sauces", "g", "kg", 1000, 500],
    ["Frites surgelées", "Surgelés", "g", "kg", 1000, 300],
    ["Huile de friture", "Épicerie", "ml", "L", 1000, 250],
    ["Coca-Cola 33cl", "Boissons", "unit", "unit", 1, 90],
    ["Eau minérale 50cl", "Boissons", "unit", "unit", 1, 45],
    ["Emballage burger", "Emballages", "unit", "unit", 1, 15],
    ["Emballage tacos", "Emballages", "unit", "unit", 1, 20],
    ["Boîte pizza", "Emballages", "unit", "unit", 1, 60],
    ["Barquette frites", "Emballages", "unit", "unit", 1, 10],
  ];
  const ingredients = new Map<string, string>();
  for (const [name, category, baseUnit, displayUnit, factor, da] of ingredientDefs) {
    let ing = await db.ingredient.findFirst({ where: { orgId, name } });
    if (!ing) {
      const milli = daPerDisplayToMilli(da, factor);
      ing = await db.ingredient.create({
        data: { orgId, name, category, baseUnit, displayUnit, avgCostMilli: milli, lastCostMilli: milli },
      });
    }
    ingredients.set(name, ing.id);
  }

  // --- Modifier groups ---------------------------------------------------------
  async function ensureGroup(name: string, minSelect: number, maxSelect: number, sortOrder: number) {
    let group = await db.modifierGroup.findFirst({ where: { orgId, name } });
    if (!group) group = await db.modifierGroup.create({ data: { orgId, name, minSelect, maxSelect, sortOrder } });
    return group.id;
  }
  async function ensureModifier(
    groupId: string,
    name: string,
    priceDeltaDa: number,
    sortOrder: number,
    ingredientName?: string,
    qtyBase?: number
  ) {
    const existing = await db.modifier.findFirst({ where: { groupId, name } });
    if (existing) return existing.id;
    const created = await db.modifier.create({
      data: {
        groupId,
        name,
        priceDelta: priceDeltaDa * 100,
        sortOrder,
        ingredientId: ingredientName ? ingredients.get(ingredientName) ?? null : null,
        ingredientQty: qtyBase ?? null,
      },
    });
    return created.id;
  }

  const saucesGroup = await ensureGroup("Sauces", 0, 2, 0);
  await ensureModifier(saucesGroup, "Algérienne", 0, 0, "Sauce algérienne", 20);
  await ensureModifier(saucesGroup, "Mayonnaise", 0, 1, "Mayonnaise", 20);
  await ensureModifier(saucesGroup, "Ketchup", 0, 2, "Ketchup", 20);
  await ensureModifier(saucesGroup, "BBQ", 0, 3, "Sauce BBQ", 20);

  const extrasGroup = await ensureGroup("Extras", 0, 0, 1);
  await ensureModifier(extrasGroup, "Extra fromage", 50, 0, "Gruyère râpé", 20);
  await ensureModifier(extrasGroup, "Œuf", 30, 1, "Œuf", 1);
  await ensureModifier(extrasGroup, "Extra viande", 100, 2, "Viande hachée", 100);

  const removeGroup = await ensureGroup("Retirer", 0, 0, 2);
  await ensureModifier(removeGroup, "Sans oignon", 0, 0);
  await ensureModifier(removeGroup, "Sans tomate", 0, 1);
  await ensureModifier(removeGroup, "Sans sauce", 0, 2);

  // --- Products ----------------------------------------------------------------
  interface RecipeDef {
    [ingredientName: string]: number; // qty in BASE units
  }
  interface ProductDef {
    name: string;
    category: string;
    priceDa: number;
    description?: string;
    recipe?: RecipeDef;
    manualCostDa?: number;
    variants?: { name: string; deltaDa: number; isDefault: boolean; recipe?: RecipeDef }[];
    modifierGroups?: string[];
    prepMinutes?: number;
  }

  const displayUnitFor = new Map(ingredientDefs.map((d) => [d[0], { displayUnit: d[3], factor: d[4] }]));

  const productDefs: ProductDef[] = [
    {
      name: "Classic Burger",
      category: "Burgers",
      priceDa: 450,
      description: "Pain artisanal, steak haché, cheddar, crudités, sauce au choix.",
      prepMinutes: 8,
      recipe: {
        "Pain burger": 1, "Viande hachée": 90, "Fromage cheddar": 20, "Tomate fraîche": 30,
        Oignon: 20, Laitue: 15, "Sauce algérienne": 25, "Emballage burger": 1,
      },
      variants: [
        { name: "Normal", deltaDa: 0, isDefault: true },
        {
          name: "Double",
          deltaDa: 150,
          isDefault: false,
          recipe: {
            "Pain burger": 1, "Viande hachée": 180, "Fromage cheddar": 30, "Tomate fraîche": 30,
            Oignon: 20, Laitue: 15, "Sauce algérienne": 25, "Emballage burger": 1,
          },
        },
      ],
      modifierGroups: ["Sauces", "Extras", "Retirer"],
    },
    {
      name: "Double Burger",
      category: "Burgers",
      priceDa: 650,
      description: "Double steak, double fromage — pour les grandes faims.",
      prepMinutes: 10,
      recipe: {
        "Pain burger": 1, "Viande hachée": 200, "Fromage cheddar": 20, "Sauce algérienne": 30,
        "Tomate fraîche": 30, Oignon: 20, "Emballage burger": 1,
      },
      modifierGroups: ["Sauces", "Extras", "Retirer"],
    },
    {
      name: "Chicken Burger",
      category: "Burgers",
      priceDa: 500,
      prepMinutes: 8,
      recipe: {
        "Pain burger": 1, "Escalope de poulet": 120, "Fromage cheddar": 20, Laitue: 15,
        "Tomate fraîche": 30, Mayonnaise: 25, "Emballage burger": 1,
      },
      modifierGroups: ["Sauces", "Extras", "Retirer"],
    },
    {
      name: "Tacos Poulet",
      category: "Tacos",
      priceDa: 600,
      prepMinutes: 9,
      recipe: {
        "Galette tacos": 1, "Escalope de poulet": 130, "Frites surgelées": 100,
        "Gruyère râpé": 30, "Sauce algérienne": 40, "Emballage tacos": 1,
      },
      modifierGroups: ["Sauces", "Extras", "Retirer"],
    },
    {
      name: "Tacos Mixte",
      category: "Tacos",
      priceDa: 750,
      prepMinutes: 10,
      recipe: {
        "Galette tacos": 1, "Escalope de poulet": 80, "Viande hachée": 80, "Frites surgelées": 100,
        "Gruyère râpé": 30, "Sauce algérienne": 40, "Emballage tacos": 1,
      },
      modifierGroups: ["Sauces", "Extras", "Retirer"],
    },
    {
      name: "Pizza Margherita",
      category: "Pizza",
      priceDa: 700,
      prepMinutes: 12,
      recipe: { "Pâton pizza": 1, "Sauce tomate pizza": 100, Mozzarella: 120, "Boîte pizza": 1 },
    },
    {
      name: "Pizza 4 Fromages",
      category: "Pizza",
      priceDa: 950,
      prepMinutes: 12,
      recipe: { "Pâton pizza": 1, "Sauce tomate pizza": 80, "Mix 4 fromages": 150, "Boîte pizza": 1 },
    },
    {
      name: "Sandwich Poulet",
      category: "Sandwiches",
      priceDa: 400,
      prepMinutes: 6,
      recipe: {
        Baguette: 1, "Escalope de poulet": 100, Laitue: 10, "Tomate fraîche": 20, Mayonnaise: 20,
      },
      modifierGroups: ["Sauces", "Retirer"],
    },
    {
      name: "Frites",
      category: "Accompagnements",
      priceDa: 250,
      prepMinutes: 4,
      recipe: { "Frites surgelées": 200, "Huile de friture": 30, "Barquette frites": 1 },
    },
    {
      name: "Coca-Cola",
      category: "Boissons",
      priceDa: 150,
      recipe: { "Coca-Cola 33cl": 1 },
    },
    {
      name: "Eau minérale",
      category: "Boissons",
      priceDa: 100,
      recipe: { "Eau minérale 50cl": 1 },
    },
    {
      name: "Tiramisu maison",
      category: "Desserts",
      priceDa: 300,
      manualCostDa: 90, // no recipe yet — manual cost path
    },
  ];

  const products = new Map<string, string>();

  for (const def of productDefs) {
    let product = await db.product.findFirst({ where: { orgId, name: def.name } });
    if (!product) {
      product = await db.product.create({
        data: {
          orgId,
          categoryId: categories.get(def.category)!,
          name: def.name,
          description: def.description ?? null,
          sellPrice: def.priceDa * 100,
          costPrice: (def.manualCostDa ?? 0) * 100,
          prepTimeMinutes: def.prepMinutes ?? null,
        },
      });

      // variants
      const variantIds = new Map<string, string>();
      for (let i = 0; i < (def.variants?.length ?? 0); i++) {
        const v = def.variants![i]!;
        const created = await db.productVariant.create({
          data: { productId: product.id, name: v.name, priceDelta: v.deltaDa * 100, isDefault: v.isDefault, sortOrder: i },
        });
        variantIds.set(v.name, created.id);
      }

      // recipes
      const createRecipe = async (variantId: string | null, recipe: RecipeDef) => {
        await db.recipe.create({
          data: {
            productId: product!.id,
            variantId,
            items: {
              create: Object.entries(recipe).map(([ingName, qty]) => ({
                ingredientId: ingredients.get(ingName)!,
                qty,
                displayUnit: displayUnitFor.get(ingName)!.displayUnit,
              })),
            },
          },
        });
      };
      if (def.recipe) await createRecipe(null, def.recipe);
      for (const v of def.variants ?? []) {
        if (v.recipe) await createRecipe(variantIds.get(v.name)!, v.recipe);
      }

      // modifier groups
      const groupIdByName = new Map([
        ["Sauces", saucesGroup],
        ["Extras", extrasGroup],
        ["Retirer", removeGroup],
      ]);
      for (let i = 0; i < (def.modifierGroups?.length ?? 0); i++) {
        const gid = groupIdByName.get(def.modifierGroups![i]!);
        if (gid) {
          await db.productModifierGroup.create({ data: { productId: product.id, groupId: gid, sortOrder: i } });
        }
      }
    }
    products.set(def.name, product.id);
  }

  // --- Combo: Menu Burger ------------------------------------------------------
  let combo = await db.product.findFirst({ where: { orgId, name: "Menu Burger" } });
  if (!combo) {
    combo = await db.product.create({
      data: {
        orgId,
        categoryId: categories.get("Menus")!,
        name: "Menu Burger",
        description: "1 burger + 1 accompagnement + 1 boisson.",
        type: "combo",
        sellPrice: 800 * 100,
        prepTimeMinutes: 10,
      },
    });
    const comboGroups: { name: string; items: { product: string; deltaDa: number; isDefault: boolean }[] }[] = [
      {
        name: "Burger",
        items: [
          { product: "Classic Burger", deltaDa: 0, isDefault: true },
          { product: "Chicken Burger", deltaDa: 50, isDefault: false },
          { product: "Double Burger", deltaDa: 200, isDefault: false },
        ],
      },
      { name: "Accompagnement", items: [{ product: "Frites", deltaDa: 0, isDefault: true }] },
      {
        name: "Boisson",
        items: [
          { product: "Coca-Cola", deltaDa: 0, isDefault: true },
          { product: "Eau minérale", deltaDa: -20, isDefault: false },
        ],
      },
    ];
    for (let gi = 0; gi < comboGroups.length; gi++) {
      const g = comboGroups[gi]!;
      await db.comboGroup.create({
        data: {
          productId: combo.id,
          name: g.name,
          sortOrder: gi,
          items: {
            create: g.items.map((item, ii) => ({
              productId: products.get(item.product)!,
              priceDelta: item.deltaDa * 100,
              isDefault: item.isDefault,
              sortOrder: ii,
            })),
          },
        },
      });
    }
  }

  console.log(`✓ menu (${categoryNames.length} categories, ${ingredientDefs.length} ingredients, ${productDefs.length + 1} products, recipes & combo)`);
}

// ---------------------------------------------------------------------------
// Suppliers & opening inventory (Phase 5)
// ---------------------------------------------------------------------------

async function seedSuppliers(orgId: string) {
  const suppliers = [
    {
      name: "Boucherie El Baraka",
      contactName: "Rachid Hamidi",
      phone: "+213 550 11 22 33",
      address: "Marché Clauzel, Alger",
      notes: "Viandes fraîches — livraison quotidienne",
    },
    {
      name: "SARL Distrib Food",
      contactName: "Samira Bouzid",
      phone: "+213 660 44 55 66",
      address: "Zone industrielle, Rouiba",
      notes: "Épicerie, surgelés, boissons, emballages",
    },
  ];
  for (const s of suppliers) {
    const existing = await db.supplier.findFirst({ where: { orgId, name: s.name } });
    if (!existing) await db.supplier.create({ data: { orgId, ...s } });
  }
  console.log(`✓ suppliers (${suppliers.length})`);
}

/**
 * Opening stock — created through PROPER ledger movements (never silent writes).
 * [ingredient name, opening qty (base units), min qty (base units)]
 */
async function seedInventory(orgId: string, branchId: string, branchLabel: string, ownerUserId: string) {
  const alreadySeeded = await db.stockMovement.count({ where: { branchId, reason: "opening" } });
  if (alreadySeeded > 0) {
    console.log(`✓ inventory for ${branchLabel} (already seeded)`);
    return;
  }

  const stock: [string, number, number][] = [
    ["Pain burger", 80, 20],
    ["Galette tacos", 60, 15],
    ["Pâton pizza", 40, 10],
    ["Baguette", 30, 10],
    ["Viande hachée", 12000, 5000], // 12 kg, min 5 kg (spec §11 example)
    ["Escalope de poulet", 10000, 3000],
    ["Fromage cheddar", 3000, 800],
    ["Gruyère râpé", 2500, 600],
    ["Mozzarella", 4000, 1000],
    ["Mix 4 fromages", 2000, 500],
    ["Œuf", 60, 12],
    ["Tomate fraîche", 5000, 1000],
    ["Oignon", 4000, 800],
    ["Laitue", 2000, 400],
    ["Sauce tomate pizza", 3000, 500],
    ["Sauce algérienne", 2500, 500],
    ["Mayonnaise", 2000, 400],
    ["Ketchup", 2000, 400],
    ["Sauce BBQ", 1500, 300],
    ["Frites surgelées", 15000, 4000],
    ["Huile de friture", 10000, 2000],
    ["Coca-Cola 33cl", 96, 24],
    ["Eau minérale 50cl", 72, 24],
    ["Emballage burger", 150, 40],
    ["Emballage tacos", 120, 30],
    ["Boîte pizza", 60, 20],
    ["Barquette frites", 150, 40],
  ];

  for (const [name, qty, minQty] of stock) {
    const ingredient = await db.ingredient.findFirst({ where: { orgId, name } });
    if (!ingredient) continue;
    await db.$transaction(async (tx) => {
      await tx.inventory.upsert({
        where: { branchId_ingredientId: { branchId, ingredientId: ingredient.id } },
        update: { qtyOnHand: qty, minQty },
        create: { branchId, ingredientId: ingredient.id, qtyOnHand: qty, minQty },
      });
      await tx.stockMovement.create({
        data: {
          orgId,
          branchId,
          ingredientId: ingredient.id,
          type: "adjustment",
          qtyBefore: 0,
          qtyChange: qty,
          qtyAfter: qty,
          unitCostMilli: ingredient.avgCostMilli,
          totalCostCentimes: Math.round((qty * ingredient.avgCostMilli) / 1000),
          userId: ownerUserId,
          reason: "opening",
        },
      });
    });
  }
  console.log(`✓ inventory for ${branchLabel} (${stock.length} ingredients, opening movements)`);
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
  await seedMenu(org.id);
  await seedSuppliers(org.id);
  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@fastfood.dz" } });
  await seedInventory(org.id, branch1.id, branch1.name, owner.id);
  await seedInventory(org.id, branch2.id, branch2.name, owner.id);
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
