"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";

import { savePurchaseOrderAction } from "@/lib/actions/purchases";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { UNIT_FACTORS, displayUnitsFor, toBaseUnits } from "@/lib/units";
import type { BaseUnit, DisplayUnit } from "@/lib/constants";
import type { Locale } from "@/lib/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface SupplierOption {
  id: string;
  name: string;
}

interface IngredientOption {
  id: string;
  name: string;
  baseUnit: string;
  displayUnit: string;
  lastCostMilli: number;
  category: string | null;
}

interface LineDraft {
  ingredientId: string;
  qty: string;
  displayUnit: DisplayUnit;
  cost: string; // DA per display unit
}

export function PoEditor({
  branchId,
  suppliers,
  ingredients,
  locale,
}: {
  branchId: string;
  suppliers: SupplierOption[];
  ingredients: IngredientOption[];
  locale: Locale;
}) {
  const t = useTranslations("purchases");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [supplierId, setSupplierId] = React.useState<string | null>(null);
  const [lines, setLines] = React.useState<LineDraft[]>([]);
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  function addLine(ingredientId: string) {
    if (lines.some((l) => l.ingredientId === ingredientId)) return;
    const ingredient = ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) return;
    const unit = ingredient.displayUnit as DisplayUnit;
    // pre-fill with last known cost, converted to per-display-unit DA
    const lastCostCentimes = Math.round((ingredient.lastCostMilli * UNIT_FACTORS[unit].factor) / 1000);
    setLines([
      ...lines,
      { ingredientId, qty: "", displayUnit: unit, cost: lastCostCentimes > 0 ? String(lastCostCentimes / 100) : "" },
    ]);
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function lineTotalCentimes(line: LineDraft): number {
    const qty = Number(line.qty);
    const cost = parseMoneyInput(line.cost || "0") ?? 0;
    if (!Number.isFinite(qty) || qty <= 0 || cost <= 0) return 0;
    const qtyBase = toBaseUnits(qty, line.displayUnit);
    const milliPerBase = Math.round((cost * 1000) / UNIT_FACTORS[line.displayUnit].factor);
    return Math.round((qtyBase * milliPerBase) / 1000);
  }

  const total = lines.reduce((sum, l) => sum + lineTotalCentimes(l), 0);
  const valid = Boolean(supplierId) && lines.length > 0 && lines.every((l) => Number(l.qty) > 0 && (parseMoneyInput(l.cost || "0") ?? 0) > 0);

  async function onSave() {
    if (!valid || !supplierId) return;
    setPending(true);
    const result = await savePurchaseOrderAction({
      branchId,
      supplierId,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        ingredientId: l.ingredientId,
        qty: Number(l.qty),
        displayUnit: l.displayUnit,
        costPerDisplayUnit: l.cost,
      })),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(te.has(result.error) ? te(result.error) : te("generic"));
      return;
    }
    toast.success(t("created", { number: result.data?.number ?? "" }));
    router.push(`/purchases/${result.data?.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("infoSection")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>{t("table.supplier")}</Label>
            <Combobox
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onChange={setSupplierId}
              placeholder={t("chooseSupplier")}
              searchPlaceholder={tc("search")}
              emptyText={tc("noData")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>
              {t("notes")} <span className="text-xs text-muted-foreground">({tc("optional")})</span>
            </Label>
            <Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("linesSection")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.length > 0 && (
            <div className="divide-y rounded-lg border">
              {lines.map((line, index) => {
                const ingredient = ingredients.find((i) => i.id === line.ingredientId);
                if (!ingredient) return null;
                return (
                  <div key={line.ingredientId} className="flex flex-wrap items-center gap-2 p-2.5">
                    <span className="min-w-32 flex-1 truncate text-sm font-medium">{ingredient.name}</span>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={line.qty}
                      onChange={(e) => updateLine(index, { qty: e.target.value })}
                      className="w-24 text-end tabular"
                      placeholder={t("qty")}
                    />
                    <Select value={line.displayUnit} onValueChange={(v) => updateLine(index, { displayUnit: v as DisplayUnit })}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {displayUnitsFor(ingredient.baseUnit as BaseUnit).map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="w-32">
                      <MoneyInput value={line.cost} onChange={(v) => updateLine(index, { cost: v })} className="h-9" placeholder={t("unitCost")} />
                    </div>
                    <span className="w-24 text-end text-sm font-medium tabular">
                      {formatMoney(lineTotalCentimes(line), locale)}
                    </span>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setLines(lines.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Combobox
                options={ingredients
                  .filter((i) => !lines.some((l) => l.ingredientId === i.id))
                  .map((i) => ({ value: i.id, label: i.name, hint: i.category ?? undefined }))}
                value={null}
                onChange={addLine}
                placeholder={t("addIngredient")}
                searchPlaceholder={tc("search")}
                emptyText={tc("noData")}
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-lg font-semibold">{t("total")}</span>
            <span className="text-lg font-bold tabular">{formatMoney(total, locale)}</span>
          </div>
          <Button size="lg" className="w-full" onClick={onSave} loading={pending} disabled={!valid}>
            <Save />
            {t("saveDraft")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
