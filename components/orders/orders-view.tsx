"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ReceiptText, Search } from "lucide-react";

import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/locale";
import { ORDER_STATUSES } from "@/lib/constants";
import { ORDER_STATUS_BADGE, PAYMENT_STATUS_BADGE } from "@/lib/order-status";
import type { OrderDetailData } from "@/lib/order-detail";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderDetailSheet, type OrderSheetPermissions } from "@/components/orders/order-detail-sheet";

export interface OrderListRow {
  id: string;
  number: string;
  type: string;
  status: string;
  paymentStatus: string;
  total: number;
  itemCount: number;
  tableName: string | null;
  customerName: string | null;
  staffName: string;
  createdAt: string;
}

interface PaymentMethodOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

const ALL = "__all__";

export function OrdersView({
  rows,
  detail,
  methods,
  locale,
  filters,
  permissions,
}: {
  rows: OrderListRow[];
  detail: OrderDetailData | null;
  methods: PaymentMethodOption[];
  locale: Locale;
  filters: { status: string | null; type: string | null; q: string };
  permissions: OrderSheetPermissions;
}) {
  const t = useTranslations("orders");
  const tp = useTranslations("pos");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(filters.q);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (search !== filters.q) setParam("q", search || null);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function timeOf(iso: string) {
    return new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-DZ" : "fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="ps-9" />
        </div>
        <div className="flex gap-2">
          <Select value={filters.status ?? ALL} onValueChange={(v) => setParam("status", v === ALL ? null : v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.type ?? ALL} onValueChange={(v) => setParam("type", v === ALL ? null : v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allTypes")}</SelectItem>
              {(["dine_in", "takeaway", "delivery"] as const).map((tt) => (
                <SelectItem key={tt} value={tt}>
                  {tp(`types.${tt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.number")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.time")}</TableHead>
              <TableHead>{t("table.type")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.context")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.payment")}</TableHead>
              <TableHead className="text-end">{t("table.total")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  <ReceiptText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {tc("noData")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn("cursor-pointer", row.status === "cancelled" && "opacity-55")}
                onClick={() => setParam("order", row.id)}
              >
                <TableCell className="font-semibold tabular">#{row.number}</TableCell>
                <TableCell className="hidden text-muted-foreground tabular sm:table-cell">{timeOf(row.createdAt)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{tp(`types.${row.type}`)}</Badge>
                </TableCell>
                <TableCell className="hidden max-w-44 truncate text-muted-foreground md:table-cell">
                  {row.tableName ? `${t("tableShort")} ${row.tableName}` : row.customerName ?? row.staffName}
                </TableCell>
                <TableCell>
                  <Badge variant={ORDER_STATUS_BADGE[row.status as keyof typeof ORDER_STATUS_BADGE] ?? "secondary"}>
                    {t(`status.${row.status}`)}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={PAYMENT_STATUS_BADGE[row.paymentStatus] ?? "secondary"}>
                    {t(`paymentStatus.${row.paymentStatus}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-end font-medium tabular">{formatMoney(row.total, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <OrderDetailSheet
        detail={detail}
        methods={methods}
        locale={locale}
        permissions={permissions}
        onClose={() => setParam("order", null)}
      />
    </div>
  );
}
