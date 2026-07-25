import { z } from "zod";

import { BASE_UNITS, DISPLAY_UNITS, PRODUCT_TYPES } from "@/lib/constants";
import { parseMoneyInput } from "@/lib/money";

/** "450" / "1 450,50" → centimes (validated). */
export const moneyString = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const parsed = parseMoneyInput(v || "0");
    if (parsed === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_money" });
      return z.NEVER;
    }
    return parsed;
  });

/** Signed variant of moneyString (deltas can be negative). */
export const moneyDeltaString = moneyString;

/** Percent (e.g. 19 or 9.5) → basis points. */
export const percentToBp = z.coerce
  .number()
  .min(0)
  .max(100)
  .transform((v) => Math.round(v * 100));

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  imageUrl: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const ingredientSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(60).optional().nullable(),
  sku: z.string().trim().max(60).optional().nullable(),
  barcode: z.string().trim().max(60).optional().nullable(),
  baseUnit: z.enum(BASE_UNITS),
  displayUnit: z.enum(DISPLAY_UNITS),
  /** cost per DISPLAY unit in DA, e.g. "850" (per kg) — converted server-side */
  costPerDisplayUnit: moneyString,
  isActive: z.boolean().default(true),
});

export const modifierGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  minSelect: z.coerce.number().int().min(0).max(20),
  maxSelect: z.coerce.number().int().min(0).max(20), // 0 = unlimited
  isActive: z.boolean().default(true),
});

export const modifierSchema = z.object({
  id: z.string().optional(),
  groupId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  priceDelta: moneyDeltaString,
  ingredientId: z.string().optional().nullable(),
  /** consumption entered in the ingredient's display unit */
  ingredientQty: z.coerce.number().min(0).optional().nullable(),
  ingredientQtyUnit: z.enum(DISPLAY_UNITS).optional().nullable(),
  isActive: z.boolean().default(true),
});

const variantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  priceDelta: moneyDeltaString,
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const comboItemSchema = z.object({
  productId: z.string().min(1),
  priceDelta: moneyDeltaString,
  isDefault: z.boolean().default(false),
});

const comboGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  minSelect: z.coerce.number().int().min(1).max(10),
  maxSelect: z.coerce.number().int().min(1).max(10),
  items: z.array(comboItemSchema).min(1),
});

const recipeItemSchema = z.object({
  ingredientId: z.string().min(1),
  /** quantity in the chosen display unit (e.g. 0.1 kg) */
  qty: z.coerce.number().gt(0),
  displayUnit: z.enum(DISPLAY_UNITS),
});

const recipeSchema = z.object({
  /** null = base recipe; otherwise a variant id OR a client key "new:N" resolved server-side */
  variantKey: z.string().nullable(),
  items: z.array(recipeItemSchema),
});

export const productPayloadSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional().nullable(),
    categoryId: z.string().min(1),
    imageUrl: z.string().max(500).optional().nullable(),
    sku: z.string().trim().max(60).optional().nullable(),
    barcode: z.string().trim().max(60).optional().nullable(),
    type: z.enum(PRODUCT_TYPES),
    sellPrice: moneyString,
    taxRatePct: percentToBp,
    /** manual cost used only when no recipe exists */
    manualCost: moneyString.optional(),
    isActive: z.boolean().default(true),
    isAvailable: z.boolean().default(true),
    prepTimeMinutes: z.coerce.number().int().min(0).max(240).optional().nullable(),
    variants: z.array(variantSchema).max(20).default([]),
    modifierGroupIds: z.array(z.string()).max(20).default([]),
    comboGroups: z.array(comboGroupSchema).max(10).default([]),
    recipes: z.array(recipeSchema).max(21).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.type === "combo" && data.comboGroups.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comboGroups"], message: "combo_needs_groups" });
    }
    if (data.type === "simple" && data.comboGroups.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comboGroups"], message: "simple_no_groups" });
    }
    const defaults = data.variants.filter((v) => v.isDefault);
    if (data.variants.length > 0 && defaults.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "one_default_variant" });
    }
    for (const g of data.comboGroups) {
      if (g.maxSelect < g.minSelect) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["comboGroups"], message: "max_lt_min" });
      }
    }
  });

// NOTE: callers (client components) construct the PRE-transform shape — money
// fields as strings, percents as numbers — so the exported types are z.input.
// Server actions parse and work with the post-transform output internally.
export type ProductPayload = z.input<typeof productPayloadSchema>;
export type CategoryInput = z.input<typeof categorySchema>;
export type IngredientInput = z.input<typeof ingredientSchema>;
export type ModifierGroupInput = z.input<typeof modifierGroupSchema>;
export type ModifierInput = z.input<typeof modifierSchema>;
