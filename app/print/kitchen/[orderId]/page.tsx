import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireAnyPermissionPage } from "@/lib/auth/session";
import { getKitchenTicketData } from "@/lib/print-queries";

import { PrintToolbar } from "@/components/print/print-toolbar";

export const metadata = { title: "Kitchen ticket" };

/**
 * Kitchen ticket — NO prices (spec §24). Optional ?printer=<id> applies the
 * printer's category routing; ?w=58 switches to 58 mm paper.
 */
export default async function KitchenTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ w?: string; printer?: string }>;
}) {
  const auth = await requireAnyPermissionPage(["kitchen.view", "orders.view"]);
  const { orderId } = await params;
  const { w, printer } = await searchParams;
  const width: 58 | 80 = w === "58" ? 58 : 80;

  const data = await getKitchenTicketData(auth.user.orgId, orderId, printer ?? null);
  if (!data) notFound();

  const t = await getTranslations();
  const time = new Date(data.confirmedAt).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-dvh bg-muted/40">
      <PrintToolbar />
      <style>{ticketCss(width)}</style>

      <div className="ticket">
        <div className="head">
          <span>{data.printerName ?? t("print.kitchenTicket")}</span>
          <span>{time}</span>
        </div>
        <div className="number">#{data.number}</div>
        <div className="context">
          {data.tableName
            ? `${t("orders.tableShort").toUpperCase()} ${data.tableName}`
            : t(`pos.types.${data.type}`).toUpperCase()}
          {data.customerName ? ` — ${data.customerName}` : ""}
        </div>

        <div className="rule" />

        {data.items.length === 0 && <div className="empty">{t("print.nothingForPrinter")}</div>}
        {data.items.map((item) => (
          <div key={item.id} className="item">
            <div className="line">
              <span className="qty">{item.qty} ×</span>{" "}
              <span className="name">
                {item.name.toUpperCase()}
                {item.variantName ? ` (${item.variantName.toUpperCase()})` : ""}
              </span>
            </div>
            {item.children.map((child, i) => (
              <div key={i} className="sub">• {child.toUpperCase()}</div>
            ))}
            {item.modifiers.map((modifier, i) => (
              <div key={i} className="sub mod">+ {modifier.toUpperCase()}</div>
            ))}
            {item.notes && <div className="sub note">★ {item.notes.toUpperCase()}</div>}
          </div>
        ))}

        {data.notes && (
          <>
            <div className="rule" />
            <div className="ordernote">★ {data.notes.toUpperCase()}</div>
          </>
        )}
      </div>
    </div>
  );
}

function ticketCss(width: 58 | 80): string {
  const contentWidth = width === 58 ? "48mm" : "72mm";
  return `
@page { margin: 0; }
@media print {
  .print-hidden { display: none !important; }
  body { background: #fff !important; }
  .ticket { box-shadow: none !important; margin: 0 !important; }
}
.ticket {
  width: ${contentWidth};
  margin: 0 auto 24px;
  padding: 4mm 2mm;
  background: #fff;
  color: #000;
  font-family: "Courier New", ui-monospace, monospace;
  font-size: ${width === 58 ? "12px" : "14px"};
  line-height: 1.3;
  box-shadow: 0 1px 8px rgb(0 0 0 / 0.15);
}
.ticket .head { display: flex; justify-content: space-between; font-weight: 700; text-transform: uppercase; }
.ticket .number { font-size: ${width === 58 ? "22px" : "28px"}; font-weight: 900; text-align: center; margin: 2px 0; }
.ticket .context { text-align: center; font-weight: 700; }
.ticket .rule { border-top: 2px dashed #000; margin: 5px 0; }
.ticket .item { margin-bottom: 6px; }
.ticket .line { font-weight: 800; font-size: ${width === 58 ? "13px" : "16px"}; }
.ticket .qty { font-size: ${width === 58 ? "14px" : "18px"}; }
.ticket .sub { padding-inline-start: 16px; font-weight: 600; }
.ticket .mod { text-decoration: underline; }
.ticket .note { font-weight: 900; }
.ticket .ordernote { font-weight: 900; text-align: center; }
.ticket .empty { text-align: center; padding: 12px 0; }
`;
}
