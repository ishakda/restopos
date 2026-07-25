"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, TrendingDown } from "lucide-react";

import { recordWasteAction } from "@/lib/actions/inventory";
import { formatMoney } from "@/lib/money";
import { displayUnitsFor, formatQty } from "@/lib/units";
import { WASTE_REASONS, type BaseUnit, type DisplayUnit, type WasteReason } from "@/lib/constants";
import type { Locale } from "@/lib/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface WasteRow {
  id: string;
  ingredientName: string;
  baseUnit: string;
  qty: number;
  reason: string;
  costCentimes: number;
  userName: string;
  notes: string | null;
  createdAt: string;
}

interface IngredientOption {
  id: string;
  name: string;
  baseUnit: string;
  displayUnit: string;
}

export function WasteView({
  branchId,
  locale,
  canCreate,
  monthLossCentimes,
  monthCount,
  ingredients,
  records,
}: {
  branchId: string;
  locale: Locale;
  canCreate: boolean;
  monthLossCentimes: number;
  monthCount: number;
  ingredients: IngredientOption[];
  records: WasteRow[];
}) {
  const t = useTranslations("waste");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [ingredientId, setIngredientId] = React.useState<string | null>(null);
  const [qty, setQty] = React.useState("");
  const [unit, setUnit] = React.useState<DisplayUnit>("g");
  const [reason, setReason] = React.useState<WasteReason>("expired");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const selected = ingredients.find((i) => i.id === ingredientId) ?? null;

  function openDialog() {
    setIngredientId(null);
    setQty("");
    setReason("expired");
    setNotes("");
    setOpen(true);
  }

  async function onSave() {
    if (!ingredientId) return;
    setPending(true);
    const result = await recordWasteAction({
      branchId,
      ingredientId,
      qty: Number(qty),
      displayUnit: unit,
      reason,
      notes: notes.trim() || null,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : te.has(result.error) ? te(result.error) : te("generic"));
      return;
    }
    toast.success(tc("success"));
    setOpen(false);
    router.refresh();
  }

  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Card className="min-w-56 flex-1">
          <CardHeader className="p-4">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" /> {t("monthLoss")}
            </CardDescription>
            <CardTitle className="text-destructive tabular">{formatMoney(monthLossCentimes, locale)}</CardTitle>
            <CardDescription>{t("monthCount", { count: monthCount })}</CardDescription>
          </CardHeader>
        </Card>
        {canCreate && (
          <Button size="lg" onClick={openDialog}>
            <Plus />
            {t("record")}
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.date")}</TableHead>
              <TableHead>{t("table.ingredient")}</TableHead>
              <TableHead className="text-end">{t("table.qty")}</TableHead>
              <TableHead>{t("table.reason")}</TableHead>
              <TableHead className="text-end">{t("table.loss")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.by")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Trash2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {tc("noData")}
                </TableCell>
              </TableRow>
            )}
            {records.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                  {dateFmt.format(new Date(row.createdAt))}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{row.ingredientName}</span>
                  {row.notes && <div className="text-xs text-muted-foreground">{row.notes}</div>}
                </TableCell>
                <TableCell className="text-end tabular">{formatQty(row.qty, row.baseUnit as BaseUnit)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t(`reasons.${row.reason}`)}</Badge>
                </TableCell>
                <TableCell className="text-end font-medium text-destructive tabular">
                  -{formatMoney(row.costCentimes, locale)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{row.userName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("record")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("table.ingredient")}</Label>
              <Combobox
                options={ingredients.map((i) => ({ value: i.id, label: i.name }))}
                value={ingredientId}
                onChange={(id) => {
                  setIngredientId(id);
                  const ing = ingredients.find((i) => i.id === id);
                  if (ing) setUnit(ing.baseUnit as DisplayUnit);
                }}
                placeholder={tc("search")}
                searchPlaceholder={tc("search")}
                emptyText={tc("noData")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t("table.qty")}</Label>
                <Input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("unit")}</Label>
                <Select value={unit} onValueChange={(v) => setUnit(v as DisplayUnit)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(selected ? displayUnitsFor(selected.baseUnit as BaseUnit) : ["g"]).map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("table.reason")}</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as WasteReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WASTE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`reasons.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>
                {t("notes")} <span className="text-xs text-muted-foreground">({tc("optional")})</span>
              </Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onSave} loading={pending} disabled={!ingredientId || !(Number(qty) > 0)}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
