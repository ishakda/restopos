import type { getOrderDetail } from "@/lib/pos-queries";

/** Plain-JSON order detail for client components (dates → ISO strings). */
export interface OrderDetailData {
  id: string;
  number: string;
  type: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  confirmedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  tableId: string | null;
  tableName: string | null;
  guestCount: number | null;
  waiterId: string | null;
  waiterName: string | null;
  driverName: string | null;
  createdByName: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryZoneName: string | null;
  notes: string | null;
  subtotal: number;
  discountAmount: number;
  discountReason: string | null;
  taxAmount: number;
  deliveryFee: number;
  total: number;
  paidAmount: number;
  refundedAmount: number;
  items: {
    id: string;
    nameSnapshot: string;
    variantNameSnapshot: string | null;
    unitPrice: number;
    qty: number;
    notes: string | null;
    lineTotal: number;
    modifiers: { id: string; nameSnapshot: string; priceDelta: number }[];
    children: { id: string; nameSnapshot: string }[];
  }[];
  payments: {
    id: string;
    methodName: string;
    methodType: string;
    amount: number;
    receivedAmount: number | null;
    changeAmount: number | null;
    takenByName: string;
    createdAt: string;
  }[];
  refunds: {
    id: string;
    amount: number;
    reason: string;
    processedByName: string;
    createdAt: string;
  }[];
}

type OrderWithRelations = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

export function serializeOrderDetail(order: OrderWithRelations): OrderDetailData {
  const parents = order.items.filter((i) => i.parentItemId === null);
  const childrenByParent = new Map<string, { id: string; nameSnapshot: string }[]>();
  for (const item of order.items) {
    if (!item.parentItemId) continue;
    const list = childrenByParent.get(item.parentItemId) ?? [];
    list.push({ id: item.id, nameSnapshot: item.nameSnapshot });
    childrenByParent.set(item.parentItemId, list);
  }

  return {
    id: order.id,
    number: order.number,
    type: order.type,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    cancelledByName: order.cancelledBy?.name ?? null,
    tableId: order.table?.id ?? null,
    tableName: order.table?.name ?? null,
    guestCount: order.guestCount,
    waiterId: order.waiter?.id ?? null,
    waiterName: order.waiter?.name ?? null,
    driverName: order.driver?.name ?? null,
    createdByName: order.createdBy.name,
    customerName: order.customerNameSnapshot,
    customerPhone: order.customerPhoneSnapshot,
    deliveryAddress: order.deliveryAddress,
    deliveryZoneName: order.deliveryZone?.name ?? null,
    notes: order.notes,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    discountReason: order.discountReason,
    taxAmount: order.taxAmount,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paidAmount: order.paidAmount,
    refundedAmount: order.refundedAmount,
    items: parents.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      variantNameSnapshot: item.variantNameSnapshot,
      unitPrice: item.unitPrice,
      qty: item.qty,
      notes: item.notes,
      lineTotal: item.lineTotal,
      modifiers: item.modifiers.map((m) => ({ id: m.id, nameSnapshot: m.nameSnapshot, priceDelta: m.priceDelta })),
      children: childrenByParent.get(item.id) ?? [],
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      methodName: p.method.name,
      methodType: p.method.type,
      amount: p.amount,
      receivedAmount: p.receivedAmount,
      changeAmount: p.changeAmount,
      takenByName: p.takenBy.name,
      createdAt: p.createdAt.toISOString(),
    })),
    refunds: order.refunds.map((r) => ({
      id: r.id,
      amount: r.amount,
      reason: r.reason,
      processedByName: r.processedBy.name,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
