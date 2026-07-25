"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assertPermission, ForbiddenError, type AuthContext } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { addPaymentSchema, refundSchema, type AddPaymentInput, type RefundInput } from "@/lib/validation/orders";
import { changeDue, remainingDue } from "@/lib/order-math";
import { isOpenStatus } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/constants";

function assertBranchAccess(auth: AuthContext, branchId: string) {
  if (auth.user.branchId && auth.user.branchId !== branchId) throw new ForbiddenError("branch");
}

export interface PaymentResult {
  paymentId: string;
  appliedAmount: number;
  changeAmount: number;
  paidAmount: number;
  remaining: number;
  paymentStatus: string;
}

/**
 * Record a payment (full, split or partial). Amounts are re-validated against
 * the order inside the transaction; an idempotency key makes retries safe.
 * (Cash-session linkage arrives in Phase 7 — cashSessionId stays null for now.)
 */
export async function addPaymentAction(input: AddPaymentInput): Promise<ActionResult<PaymentResult>> {
  try {
    const auth = await assertPermission("payments.take");
    const parsed = addPaymentSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    if (data.amount <= 0) return fail("invalid_input");

    // Idempotency short-circuit
    const existing = await db.payment.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: { order: { select: { paidAmount: true, total: true, paymentStatus: true } } },
    });
    if (existing) {
      return ok({
        paymentId: existing.id,
        appliedAmount: existing.amount,
        changeAmount: existing.changeAmount ?? 0,
        paidAmount: existing.order.paidAmount,
        remaining: remainingDue(existing.order.total, existing.order.paidAmount),
        paymentStatus: existing.order.paymentStatus,
      });
    }

    try {
      const result = await db.$transaction(async (tx) => {
        const order = await tx.order.findFirst({ where: { id: data.orderId, orgId: auth.user.orgId } });
        if (!order) throw new Error("not_found");
        assertBranchAccess(auth, order.branchId);
        if (!isOpenStatus(order.status as OrderStatus)) throw new Error("invalid_transition");

        const method = await tx.paymentMethod.findFirst({
          where: { id: data.methodId, orgId: auth.user.orgId, isActive: true },
        });
        if (!method) throw new Error("not_found");

        const remaining = remainingDue(order.total, order.paidAmount);
        if (remaining <= 0) throw new Error("already_paid");
        if (data.amount > remaining) throw new Error("amount_exceeds_due");

        let receivedAmount: number | null = null;
        let change = 0;
        if (method.type === "cash") {
          receivedAmount = data.receivedAmount ?? data.amount;
          if (receivedAmount < data.amount) throw new Error("received_too_low");
          change = changeDue(data.amount, receivedAmount);
        } else if (data.receivedAmount && data.receivedAmount !== data.amount) {
          throw new Error("invalid_input");
        }

        const payment = await tx.payment.create({
          data: {
            orgId: auth.user.orgId,
            branchId: order.branchId,
            orderId: order.id,
            methodId: method.id,
            amount: data.amount,
            receivedAmount,
            changeAmount: method.type === "cash" ? change : null,
            takenById: auth.user.id,
            idempotencyKey: data.idempotencyKey,
          },
        });

        const paidAmount = order.paidAmount + data.amount;
        const paymentStatus = paidAmount >= order.total ? "paid" : "partial";
        await tx.order.update({
          where: { id: order.id },
          data: { paidAmount, paymentStatus, version: { increment: 1 } },
        });

        await writeAudit(
          {
            orgId: auth.user.orgId,
            branchId: order.branchId,
            userId: auth.user.id,
            action: "payment.taken",
            entity: "payment",
            entityId: payment.id,
            after: { order: order.number, method: method.code, amount: data.amount, change },
          },
          tx
        );

        return {
          paymentId: payment.id,
          appliedAmount: data.amount,
          changeAmount: change,
          paidAmount,
          remaining: remainingDue(order.total, paidAmount),
          paymentStatus,
        };
      });

      revalidatePath("/orders");
      revalidatePath("/tables");
      return ok(result);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const winner = await db.payment.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: { order: { select: { paidAmount: true, total: true, paymentStatus: true } } },
        });
        if (winner) {
          return ok({
            paymentId: winner.id,
            appliedAmount: winner.amount,
            changeAmount: winner.changeAmount ?? 0,
            paidAmount: winner.order.paidAmount,
            remaining: remainingDue(winner.order.total, winner.order.paidAmount),
            paymentStatus: winner.order.paymentStatus,
          });
        }
      }
      if (e instanceof Error && ["not_found", "invalid_transition", "already_paid", "amount_exceeds_due", "received_too_low", "invalid_input"].includes(e.message)) {
        return fail(e.message);
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("generic");
  }
}

/**
 * Refund part or all of the PAID amount. Money is never deleted — a Refund
 * row reverses it. Fully refunded orders flip paymentStatus to "refunded"
 * (and can then be cancelled).
 */
export async function refundOrderAction(input: RefundInput): Promise<ActionResult<{ refundedAmount: number }>> {
  try {
    const auth = await assertPermission("orders.refund");
    const parsed = refundSchema.safeParse(input);
    if (!parsed.success) return fail("invalid_input");
    const data = parsed.data;
    if (data.amount <= 0) return fail("invalid_input");

    const result = await db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: data.orderId, orgId: auth.user.orgId } });
      if (!order) throw new Error("not_found");
      assertBranchAccess(auth, order.branchId);

      const refundable = order.paidAmount - order.refundedAmount;
      if (data.amount > refundable) throw new Error("amount_exceeds_due");

      let methodId: string | null = null;
      if (data.methodId) {
        const method = await tx.paymentMethod.findFirst({
          where: { id: data.methodId, orgId: auth.user.orgId },
        });
        if (!method) throw new Error("not_found");
        methodId = method.id;
      }

      await tx.refund.create({
        data: {
          orgId: auth.user.orgId,
          branchId: order.branchId,
          orderId: order.id,
          methodId,
          amount: data.amount,
          reason: data.reason,
          processedById: auth.user.id,
        },
      });

      const refundedAmount = order.refundedAmount + data.amount;
      await tx.order.update({
        where: { id: order.id },
        data: {
          refundedAmount,
          paymentStatus: refundedAmount >= order.paidAmount ? "refunded" : order.paymentStatus,
          version: { increment: 1 },
        },
      });

      await writeAudit(
        {
          orgId: auth.user.orgId,
          branchId: order.branchId,
          userId: auth.user.id,
          action: "order.refunded",
          entity: "order",
          entityId: order.id,
          before: { refundedAmount: order.refundedAmount },
          after: { refundedAmount, reason: data.reason },
        },
        tx
      );

      return { refundedAmount };
    });

    revalidatePath("/orders");
    return ok(result);
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    if (e instanceof Error && ["not_found", "amount_exceeds_due"].includes(e.message)) return fail(e.message);
    return fail("generic");
  }
}
