import { z } from "zod";

import { ORDER_TYPES } from "@/lib/constants";
import { moneyString } from "@/lib/validation/menu";

const comboSelectionSchema = z.object({
  comboGroupId: z.string().min(1),
  productId: z.string().min(1),
});

const cartItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  qty: z.coerce.number().int().min(1).max(99),
  notes: z.string().trim().max(200).optional().nullable(),
  modifierIds: z.array(z.string()).max(30).default([]),
  comboSelections: z.array(comboSelectionSchema).max(20).default([]),
});

export const discountInputSchema = z.object({
  kind: z.enum(["percent", "fixed"]),
  /** percent: whole % (10 = 10%) · fixed: money string in DA */
  percentValue: z.coerce.number().min(0).max(100).optional(),
  fixedValue: moneyString.optional(),
  reason: z.string().trim().max(200).optional().nullable(),
});

export const createOrderSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(64),
    type: z.enum(ORDER_TYPES),
    tableId: z.string().optional().nullable(),
    guestCount: z.coerce.number().int().min(1).max(50).optional().nullable(),
    waiterId: z.string().optional().nullable(),
    customerName: z.string().trim().max(80).optional().nullable(),
    customerPhone: z.string().trim().max(30).optional().nullable(),
    deliveryAddress: z.string().trim().max(300).optional().nullable(),
    deliveryZoneId: z.string().optional().nullable(),
    driverId: z.string().optional().nullable(),
    notes: z.string().trim().max(300).optional().nullable(),
    discount: discountInputSchema.optional().nullable(),
    items: z.array(cartItemSchema).min(1).max(100),
  })
  .superRefine((data, ctx) => {
    if (data.type === "dine_in" && !data.tableId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tableId"], message: "table_required" });
    }
    if (data.type === "delivery") {
      if (!data.customerPhone?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customerPhone"], message: "phone_required" });
      }
      if (!data.deliveryAddress?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryAddress"], message: "address_required" });
      }
    }
  });

export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const addPaymentSchema = z.object({
  orderId: z.string().min(1),
  methodId: z.string().min(1),
  /** amount applied to the order, in DA (string) */
  amount: moneyString,
  /** cash tendered (cash methods only) */
  receivedAmount: moneyString.optional(),
  idempotencyKey: z.string().min(8).max(64),
});
export type AddPaymentInput = z.input<typeof addPaymentSchema>;

export const refundSchema = z.object({
  orderId: z.string().min(1),
  amount: moneyString,
  reason: z.string().trim().min(2).max(300),
  methodId: z.string().optional().nullable(),
});
export type RefundInput = z.input<typeof refundSchema>;

export const cancelOrderSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(2).max(300),
});
export type CancelOrderInput = z.input<typeof cancelOrderSchema>;

export const tableSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(30),
  seats: z.coerce.number().int().min(1).max(50),
  zone: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().default(true),
});
export type TableInput = z.input<typeof tableSchema>;
