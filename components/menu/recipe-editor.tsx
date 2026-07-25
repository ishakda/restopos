"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import { formatMoney } from "@/lib/money";
import { displayUnitsFor, toBaseUnits } from "@/lib/units";
import type { BaseUnit, DisplayUnit } from "@/lib/constants";
import type { Locale } from "@/lib/locale";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface IngredientOption {
  id: string;
  name: string;
  baseUnit: string;
  displayUnit: string;
  avgCostMilli: number;
  category: string | null;
}

export interface RecipeItemDraft {
  ingredientId: string;
  qty: string; // display-unit quantity as typed
  displayUnit: DisplayUnit;
}

/** Line cost in millicentimes for a draft row (0 when invalid). */
export function draftItemCostMilli(item: RecipeItemDraft, ingredients: IngredientOption[]): number {
  const ing = ingredients.find((i) => i.id === item.ingredientId);
  const qty = Number(item.qty);
  if (!ing || !Number.isFinite(qty) || qty <= 0) return 0;
  return toBaseUnits(qty, item.displayUnit) * ing.avgCostMilli;
}

export function RecipeEditor({
  items,
  onChange,
  ingredients,
  locale,
}: {
  items: RecipeItemDraft[];
  onChange: (items: RecipeItemDraft[]) => void;
  ingredients: IngredientOption[];
  locale: Locale;
}) {
  const t = useTranslations("menu");
  const tc = useTranslations("common");

  const used = new Set(items.map((i) => i.ingredientId));

  function addItem(ingredientId: string) {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing || used.has(ingredientId)) return;
    onChange([...items, { ingredientId, qty: "", displayUnit: ing.baseUnit as DisplayUnit }]);
  }

  function updateItem(index: number, patch: Partial<RecipeItemDraft>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="divide-y rounded-lg border">
          {items.map((item, index) => {
            const ing = ingredients.find((i) => i.id === item.ingredientId);
            if (!ing) return null;
            const units = displayUnitsFor(ing.baseUnit as BaseUnit);
            const lineCost = draftItemCostMilli(item, ingredients);
            return (
              <div key={item.ingredientId} className="flex flex-wrap items-center gap-2 p-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{ing.name}</span>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={item.qty}
                  onChange={(e) => updateItem(index, { qty: e.target.value })}
                  className="w-24 text-end tabular"
                  aria-label={t("fields.quantity")}
                />
                <Select
                  value={item.displayUnit}
                  onValueChange={(v) => updateItem(index, { displayUnit: v as DisplayUnit })}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="w-20 text-end text-xs text-muted-foreground tabular">
                  {lineCost > 0 ? formatMoney(Math.round(lineCost / 1000), locale) : "—"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeItem(index)}
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
              .filter((i) => !used.has(i.id))
              .map((i) => ({ value: i.id, label: i.name, hint: i.category ?? undefined }))}
            value={null}
            onChange={addItem}
            placeholder={t("addIngredient")}
            searchPlaceholder={tc("search")}
            emptyText={tc("noData")}
          />
        </div>
      </div>
    </div>
  );
}
