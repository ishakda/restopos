import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { requirePermissionPage } from "@/lib/auth/session";
import { getReceiptData } from "@/lib/print-queries";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/locale";

import { PrintToolbar } from "@/components/print/print-toolbar";

export const metadata = { title: "Receipt" };

/**
 * Customer receipt — thermal 80 mm (default) or 58 mm via ?w=58.
 * Historical snapshots only: reprints are identical even if the menu changed.
 */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const auth = await requirePermissionPage("orders.view");
  const { orderId } = await params;
  const { w } = await searchParams;
  const width: 58 | 80 = w === "58" ? 58 : 80;

  const data = await getReceiptData(auth.user.orgId, orderId);
  if (!data) notFound();

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const { order, org, branch } = data;
  const money = (v: number) => formatMoney(v, locale);

  const when = new Date(order.createdAt);
  const dateStr = `${when.toLocaleDateString("fr-DZ")} ${when.toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="min-h-dvh bg-muted/40">
      <PrintToolbar />
      <style>{receiptCss(width)}</style>

      <div className="receipt">
        {/* Header */}
        <div className="center">
          {data.showLogo && org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="logo" />
          ) : null}
          <div className="org">{org.name}</div>
          <div className="dim">{branch.name}</div>
          {branch.address && <div className="dim">{branch.address}</div>}
          {branch.phone && <div className="dim" dir="ltr">{branch.phone}</div>}
          {org.taxId && <div className="dim">NIF: {org.taxId}</div>}
        </div>

        <div className="rule" />

        {/* Meta */}
        <div className="row">
          <span className="bold">#{order.number}</span>
          <span>{dateStr}</span>
        </div>
        <div className="row">
          <span>{t("print.cashier")}: {order.createdByName}</span>
          <span>{t(`pos.types.${order.type}`)}</span>
        </div>
        {order.tableName && (
          <div className="row">
            <span>{t("orders.tableShort")} {order.tableName}</span>
            {order.guestCount ? <span>{t("pos.guests", { count: order.guestCount })}</span> : <span />}
          </div>
        )}
        {order.customerPhone && (
          <div className="row">
            <span>{order.customerName ?? t("pos.customer")}</span>
            <span dir="ltr">{order.customerPhone}</span>
          </div>
        )}
        {order.deliveryAddress && <div className="dim">{order.deliveryAddress}</div>}

        <div className="rule" />

        {/* Items */}
        {order.items.map((item) => (
          <div key={item.id} className="item">
            <div className="row">
              <span className="bold">
                {item.qty} × {item.nameSnapshot}
                {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ""}
              </span>
              <span className="bold nowrap">{money(item.lineTotal)}</span>
            </div>
            {item.qty > 1 && <div className="dim indent">{money(item.unitPrice)} / u</div>}
            {item.children.map((child) => (
              <div key={child.id} className="indent dim">• {child.nameSnapshot}</div>
            ))}
            {item.modifiers.map((modifier) => (
              <div key={modifier.id} className="row indent dim">
                <span>+ {modifier.nameSnapshot}</span>
                <span className="nowrap">{modifier.priceDelta !== 0 ? money(modifier.priceDelta * item.qty) : ""}</span>
              </div>
            ))}
            {item.notes && <div className="indent note">« {item.notes} »</div>}
          </div>
        ))}

        <div className="rule" />

        {/* Totals */}
        <div className="row">
          <span>{t("pos.subtotal")}</span>
          <span className="nowrap">{money(order.subtotal)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className="row">
            <span>{t("pos.discount")}</span>
            <span className="nowrap">-{money(order.discountAmount)}</span>
          </div>
        )}
        {order.deliveryFee > 0 && (
          <div className="row">
            <span>{t("pos.deliveryFee")}</span>
            <span className="nowrap">{money(order.deliveryFee)}</span>
          </div>
        )}
        <div className="row total">
          <span>{t("pos.total")}</span>
          <span className="nowrap">{money(order.total)}</span>
        </div>
        {order.taxAmount > 0 && (
          <div className="row dim small">
            <span>{t("pos.taxIncluded")}</span>
            <span className="nowrap">{money(order.taxAmount)}</span>
          </div>
        )}

        {/* Payments */}
        {order.payments.length > 0 && <div className="rule" />}
        {order.payments.map((p) => (
          <div key={p.id}>
            <div className="row">
              <span>{p.methodName}</span>
              <span className="nowrap">{money(p.receivedAmount ?? p.amount)}</span>
            </div>
            {p.changeAmount != null && p.changeAmount > 0 && (
              <div className="row">
                <span>{t("print.change")}</span>
                <span className="nowrap">{money(p.changeAmount)}</span>
              </div>
            )}
          </div>
        ))}

        <div className="rule" />
        <div className="center footer">{data.footer}</div>
      </div>
    </div>
  );
}

function receiptCss(width: 58 | 80): string {
  const contentWidth = width === 58 ? "48mm" : "72mm";
  return `
@page { margin: 0; }
@media print {
  .print-hidden { display: none !important; }
  body { background: #fff !important; }
  .receipt { box-shadow: none !important; margin: 0 !important; }
}
.receipt {
  width: ${contentWidth};
  margin: 0 auto 24px;
  padding: 4mm 2mm;
  background: #fff;
  color: #000;
  font-family: "Courier New", ui-monospace, monospace;
  font-size: ${width === 58 ? "10px" : "12px"};
  line-height: 1.35;
  box-shadow: 0 1px 8px rgb(0 0 0 / 0.15);
}
.receipt .center { text-align: center; }
.receipt .org { font-size: ${width === 58 ? "13px" : "16px"}; font-weight: 700; text-transform: uppercase; }
.receipt .logo { max-width: 60%; max-height: 48px; margin: 0 auto 4px; display: block; filter: grayscale(1); }
.receipt .dim { opacity: 0.85; }
.receipt .small { font-size: ${width === 58 ? "9px" : "10px"}; }
.receipt .bold { font-weight: 700; }
.receipt .nowrap { white-space: nowrap; }
.receipt .rule { border-top: 1px dashed #000; margin: 5px 0; }
.receipt .row { display: flex; justify-content: space-between; gap: 6px; }
.receipt .item { margin-bottom: 3px; }
.receipt .indent { padding-inline-start: 12px; }
.receipt .note { font-style: italic; }
.receipt .total { font-size: ${width === 58 ? "13px" : "16px"}; font-weight: 800; margin-top: 3px; }
.receipt .footer { margin-top: 6px; font-weight: 600; }
`;
}
