"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, ArrowRight, Boxes, PackageX, Pencil, Search, SlidersHorizontal } from "lucide-react";

import { adjustStockAction, transferStockAction, updateInventoryMetaAction } from "@/lib/actions/inventory";
import type { InventoryRow } from "@/lib/inventory-queries";
import { formatMoney } from "@/lib/money";
import { displayUnitsFor, formatQty, fromBaseUnits } from "@/lib/units";
import type { BaseUnit, DisplayUnit } from "@/lib/constants";
import type { Locale } from "@/lib/locale";
import type { BranchOption } from "@/lib/branch";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const LEVEL_BADGE = { ok: "success", low: "warning", out: "destructive" } as const;

export function InventoryView({
  rows,
  branchId,
  branches,
  locale,
  permissions,
}: {
  rows: InventoryRow[];
  branchId: string;
  branches: BranchOption[];
  locale: Locale;
  permissions: { adjust: boolean; transfer: boolean };
}) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [search, setSearch] = React.useState("");
  const [levelFilter, setLevelFilter] = React.useState<string>("all");

  const [adjustRow, setAdjustRow] = React.useState<InventoryRow | null>(null);
  const [countedQty, setCountedQty] = React.useState("");
  const [adjustUnit, setAdjustUnit] = React.useState<DisplayUnit>("g");
  const [adjustReason, setAdjustReason] = React.useState("");

  const [metaRow, setMetaRow] = React.useState<InventoryRow | null>(null);
  const [minQty, setMinQty] = React.useState("");
  const [metaUnit, setMetaUnit] = React.useState<DisplayUnit>("g");
  const [location, setLocation] = React.useState("");

  const [transferRow, setTransferRow] = React.useState<InventoryRow | null>(null);
  const [transferQty, setTransferQty] = React.useState("");
  const [transferUnit, setTransferUnit] = React.useState<DisplayUnit>("g");
  const [transferTo, setTransferTo] = React.useState<string>("");

  const [pending, setPending] = React.useState(false);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (levelFilter === "all" || r.level === levelFilter) &&
      (!normalizedSearch ||
        r.name.toLowerCase().includes(normalizedSearch) ||
        (r.category ?? "").toLowerCase().includes(normalizedSearch))
  );

  const totalValue = rows.reduce((sum, r) => sum + r.valueCentimes, 0);
  const lowCount = rows.filter((r) => r.level === "low").length;
  const outCount = rows.filter((r) => r.level === "out").length;

  function errToast(code: string) {
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : te.has(code) ? te(code) : te("generic"));
  }

  function openAdjust(row: InventoryRow) {
    setAdjustRow(row);
    setAdjustUnit(row.displayUnit as DisplayUnit);
    setCountedQty(String(fromBaseUnits(Math.max(0, row.qtyOnHand), row.displayUnit as DisplayUnit)));
    setAdjustReason("");
  }

  function openMeta(row: InventoryRow) {
    setMetaRow(row);
    setMetaUnit(row.displayUnit as DisplayUnit);
    setMinQty(String(fromBaseUnits(row.minQty, row.displayUnit as DisplayUnit)));
    setLocation(row.storageLocation ?? "");
  }

  function openTransfer(row: InventoryRow) {
    setTransferRow(row);
    setTransferUnit(row.displayUnit as DisplayUnit);
    setTransferQty("");
    setTransferTo(branches.find((b) => b.id !== branchId)?.id ?? "");
  }

  async function onAdjust() {
    if (!adjustRow) return;
    setPending(true);
    const result = await adjustStockAction({
      branchId,
      ingredientId: adjustRow.ingredientId,
      countedQty: Number(countedQty),
      displayUnit: adjustUnit,
      reason: adjustReason.trim(),
    });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    setAdjustRow(null);
    router.refresh();
  }

  async function onMeta() {
    if (!metaRow) return;
    setPending(true);
    const result = await updateInventoryMetaAction({
      branchId,
      ingredientId: metaRow.ingredientId,
      minQty: Number(minQty) || 0,
      displayUnit: metaUnit,
      storageLocation: location,
    });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    setMetaRow(null);
    router.refresh();
  }

  async function onTransfer() {
    if (!transferRow || !transferTo) return;
    setPending(true);
    const result = await transferStockAction({
      fromBranchId: branchId,
      toBranchId: transferTo,
      ingredientId: transferRow.ingredientId,
      qty: Number(transferQty),
      displayUnit: transferUnit,
    });
    setPending(false);
    if (!result.ok) return errToast(result.error);
    toast.success(tc("success"));
    setTransferRow(null);
    router.refresh();
  }

  return (
    <div>
      {/* Stats */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="p-4">
            <CardDescription className="flex items-center gap-1.5">
              <Boxes className="h-3.5 w-3.5" /> {t("stats.value")}
            </CardDescription>
            <CardTitle className="tabular">{formatMoney(totalValue, locale)}</CardTitle>
          </CardHeader>
        </Card>
        <button type="button" className="text-start" onClick={() => setLevelFilter(levelFilter === "low" ? "all" : "low")}>
          <Card className={levelFilter === "low" ? "ring-2 ring-warning" : undefined}>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {t("stats.low")}
              </CardDescription>
              <CardTitle className={lowCount > 0 ? "text-warning-foreground" : undefined}>{lowCount}</CardTitle>
            </CardHeader>
          </Card>
        </button>
        <button type="button" className="text-start" onClick={() => setLevelFilter(levelFilter === "out" ? "all" : "out")}>
          <Card className={levelFilter === "out" ? "ring-2 ring-destructive" : undefined}>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1.5">
                <PackageX className="h-3.5 w-3.5" /> {t("stats.out")}
              </CardDescription>
              <CardTitle className={outCount > 0 ? "text-destructive" : undefined}>{outCount}</CardTitle>
            </CardHeader>
          </Card>
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tc("search")} className="ps-9" />
        </div>
        <Button variant="outline" asChild>
          <Link href="/inventory/movements">
            {t("viewMovements")}
            <ArrowRight className="rtl:rotate-180" />
          </Link>
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.ingredient")}</TableHead>
              <TableHead className="text-end">{t("table.qty")}</TableHead>
              <TableHead className="hidden text-end sm:table-cell">{t("table.min")}</TableHead>
              <TableHead className="hidden text-end md:table-cell">{t("table.value")}</TableHead>
              <TableHead className="hidden lg:table-cell">{t("table.location")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              {(permissions.adjust || permissions.transfer) && <TableHead className="w-28 text-end">{tc("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  {tc("noData")}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow key={row.ingredientId} className={!row.isActive ? "opacity-50" : undefined}>
                <TableCell>
                  <span className="font-medium">{row.name}</span>
                  {row.category && <div className="text-xs text-muted-foreground">{row.category}</div>}
                </TableCell>
                <TableCell className="text-end font-semibold tabular">
                  {formatQty(row.qtyOnHand, row.baseUnit as BaseUnit)}
                </TableCell>
                <TableCell className="hidden text-end text-muted-foreground tabular sm:table-cell">
                  {row.minQty > 0 ? formatQty(row.minQty, row.baseUnit as BaseUnit) : "—"}
                </TableCell>
                <TableCell className="hidden text-end text-muted-foreground tabular md:table-cell">
                  {formatMoney(row.valueCentimes, locale)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{row.storageLocation ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={LEVEL_BADGE[row.level]}>{t(`level.${row.level}`)}</Badge>
                </TableCell>
                {(permissions.adjust || permissions.transfer) && (
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-0.5">
                      {permissions.adjust && (
                        <Button variant="ghost" size="iconSm" title={t("adjust")} onClick={() => openAdjust(row)}>
                          <Pencil />
                        </Button>
                      )}
                      <Button variant="ghost" size="iconSm" title={t("thresholds")} onClick={() => openMeta(row)}>
                        <SlidersHorizontal />
                      </Button>
                      {permissions.transfer && branches.length > 1 && (
                        <Button variant="ghost" size="iconSm" title={t("transfer")} onClick={() => openTransfer(row)}>
                          <ArrowLeftRight />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Adjust (physical count) */}
      <Dialog open={Boolean(adjustRow)} onOpenChange={(open) => !open && setAdjustRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adjustTitle", { name: adjustRow?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("currentQty")}: <span className="font-medium tabular">{adjustRow ? formatQty(adjustRow.qtyOnHand, adjustRow.baseUnit as BaseUnit) : ""}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("countedQty")}</Label>
              <Input type="number" min={0} step="any" value={countedQty} onChange={(e) => setCountedQty(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("unit")}</Label>
              <Select value={adjustUnit} onValueChange={(v) => setAdjustUnit(v as DisplayUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {adjustRow &&
                    displayUnitsFor(adjustRow.baseUnit as BaseUnit).map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("adjustReason")}</Label>
            <Textarea rows={2} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} maxLength={200} placeholder={t("adjustReasonPlaceholder")} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustRow(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onAdjust} loading={pending} disabled={adjustReason.trim().length < 2 || countedQty === ""}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thresholds / location */}
      <Dialog open={Boolean(metaRow)} onOpenChange={(open) => !open && setMetaRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("thresholdsTitle", { name: metaRow?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t("minQtyLabel")}</Label>
              <Input type="number" min={0} step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("unit")}</Label>
              <Select value={metaUnit} onValueChange={(v) => setMetaUnit(v as DisplayUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metaRow &&
                    displayUnitsFor(metaRow.baseUnit as BaseUnit).map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("locationLabel")}</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder={t("locationPlaceholder")} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaRow(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onMeta} loading={pending}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer */}
      <Dialog open={Boolean(transferRow)} onOpenChange={(open) => !open && setTransferRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("transferTitle", { name: transferRow?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("transferTo")}</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((b) => b.id !== branchId)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t("table.qty")}</Label>
                <Input type="number" min={0} step="any" value={transferQty} onChange={(e) => setTransferQty(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("unit")}</Label>
                <Select value={transferUnit} onValueChange={(v) => setTransferUnit(v as DisplayUnit)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {transferRow &&
                      displayUnitsFor(transferRow.baseUnit as BaseUnit).map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferRow(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onTransfer} loading={pending} disabled={!transferTo || !(Number(transferQty) > 0)}>
              {t("transfer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
