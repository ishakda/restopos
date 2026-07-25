"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Carrot, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { deleteIngredientAction, saveIngredientAction } from "@/lib/actions/ingredients";
import { formatMoney } from "@/lib/money";
import { UNIT_FACTORS, displayUnitsFor } from "@/lib/units";
import type { BaseUnit, DisplayUnit } from "@/lib/constants";
import { BASE_UNITS } from "@/lib/constants";
import type { Locale } from "@/lib/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface IngredientRow {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  barcode: string | null;
  baseUnit: string;
  displayUnit: string;
  avgCostMilli: number;
  isActive: boolean;
  usageCount: number;
}

/** millicentimes per base unit → centimes per display unit */
function costPerDisplayUnit(avgCostMilli: number, displayUnit: DisplayUnit): number {
  return Math.round((avgCostMilli * UNIT_FACTORS[displayUnit].factor) / 1000);
}

export function IngredientsView({
  ingredients,
  canManage,
  locale,
}: {
  ingredients: IngredientRow[];
  canManage: boolean;
  locale: Locale;
}) {
  const t = useTranslations("ingredients");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<IngredientRow | null>(null);
  const [deleting, setDeleting] = React.useState<IngredientRow | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [skuValue, setSkuValue] = React.useState("");
  const [baseUnit, setBaseUnit] = React.useState<BaseUnit>("g");
  const [displayUnit, setDisplayUnit] = React.useState<DisplayUnit>("kg");
  const [cost, setCost] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? ingredients.filter(
        (i) =>
          i.name.toLowerCase().includes(normalizedSearch) ||
          (i.category ?? "").toLowerCase().includes(normalizedSearch) ||
          (i.sku ?? "").toLowerCase().includes(normalizedSearch)
      )
    : ingredients;

  function openCreate() {
    setEditing(null);
    setName("");
    setCategory("");
    setSkuValue("");
    setBaseUnit("g");
    setDisplayUnit("kg");
    setCost("");
    setIsActive(true);
    setDialogOpen(true);
  }

  function openEdit(row: IngredientRow) {
    setEditing(row);
    setName(row.name);
    setCategory(row.category ?? "");
    setSkuValue(row.sku ?? "");
    setBaseUnit(row.baseUnit as BaseUnit);
    setDisplayUnit(row.displayUnit as DisplayUnit);
    setCost(String(costPerDisplayUnit(row.avgCostMilli, row.displayUnit as DisplayUnit) / 100));
    setIsActive(row.isActive);
    setDialogOpen(true);
  }

  function onBaseUnitChange(next: BaseUnit) {
    setBaseUnit(next);
    const options = displayUnitsFor(next);
    setDisplayUnit(options[options.length - 1] ?? "unit");
  }

  async function onSave() {
    setSaving(true);
    const result = await saveIngredientAction({
      id: editing?.id,
      name: name.trim(),
      category: category.trim() || null,
      sku: skuValue.trim() || null,
      barcode: null,
      baseUnit,
      displayUnit,
      costPerDisplayUnit: cost || "0",
      isActive,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(tc("success"));
      setDialogOpen(false);
      router.refresh();
    } else if (result.error === "base_unit_locked") {
      toast.error(t("errors.base_unit_locked"));
    } else {
      toast.error(te.has(result.error) ? te(result.error) : te("generic"));
    }
  }

  async function onDelete() {
    if (!deleting) return;
    const result = await deleteIngredientAction(deleting.id);
    setDeleting(null);
    if (result.ok) {
      toast.success(result.data?.deactivated ? t("deactivatedInstead") : tc("success"));
      router.refresh();
    } else {
      toast.error(te.has(result.error) ? te(result.error) : te("generic"));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tc("search")} className="ps-9" />
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus />
            {t("newIngredient")}
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("table.category")}</TableHead>
              <TableHead>{t("table.unit")}</TableHead>
              <TableHead className="text-end">{t("table.avgCost")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("table.usedIn")}</TableHead>
              {canManage && <TableHead className="w-20 text-end">{tc("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 6 : 5} className="py-12 text-center text-muted-foreground">
                  <Carrot className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  {tc("noData")}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow key={row.id} className={!row.isActive ? "opacity-50" : undefined}>
                <TableCell>
                  <span className="font-medium">{row.name}</span>
                  {!row.isActive && (
                    <Badge variant="secondary" className="ms-2">
                      {t("inactive")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{row.category ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{row.displayUnit}</TableCell>
                <TableCell className="text-end tabular">
                  {formatMoney(costPerDisplayUnit(row.avgCostMilli, row.displayUnit as DisplayUnit), locale)}
                  <span className="text-xs text-muted-foreground"> / {row.displayUnit}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline">{t("usageCount", { count: row.usageCount })}</Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="iconSm" onClick={() => openEdit(row)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("editIngredient") : t("newIngredient")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="ing-name">{t("fields.name")}</Label>
              <Input id="ing-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="ing-category">{t("fields.category")}</Label>
                <Input
                  id="ing-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t("categoryPlaceholder")}
                  maxLength={60}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ing-sku">{t("fields.sku")}</Label>
                <Input id="ing-sku" value={skuValue} onChange={(e) => setSkuValue(e.target.value)} maxLength={60} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{t("fields.baseUnit")}</Label>
                <Select value={baseUnit} onValueChange={(v) => onBaseUnitChange(v as BaseUnit)} disabled={Boolean(editing && editing.usageCount > 0)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {t(`units.${u}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("baseUnitHint")}</p>
              </div>
              <div className="grid gap-2">
                <Label>{t("fields.displayUnit")}</Label>
                <Select value={displayUnit} onValueChange={(v) => setDisplayUnit(v as DisplayUnit)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {displayUnitsFor(baseUnit).map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("fields.costPerUnit", { unit: displayUnit })}</Label>
              <MoneyInput value={cost} onChange={setCost} />
              <p className="text-xs text-muted-foreground">{t("costHint")}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="ing-active">{t("fields.active")}</Label>
              <Switch id="ing-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onSave} loading={saving} disabled={!name.trim()}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteIngredient")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.usageCount > 0
                ? t("deleteUsedHint", { name: deleting.name })
                : t("deleteConfirm", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction destructive onClick={onDelete}>
              {tc("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
