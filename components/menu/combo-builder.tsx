"use client";

import { useLocale, useTranslations } from "next-intl";
import { GripVertical, Plus, Star, Trash2 } from "lucide-react";

import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/locale";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ComboProductOption {
  id: string;
  name: string;
  sellPrice: number;
  categoryId: string;
}

export interface ComboItemDraft {
  productId: string;
  priceDelta: string;
  isDefault: boolean;
}

export interface ComboGroupDraft {
  id?: string;
  name: string;
  minSelect: string;
  maxSelect: string;
  items: ComboItemDraft[];
}

export function ComboBuilder({
  groups,
  onChange,
  products,
}: {
  groups: ComboGroupDraft[];
  onChange: (groups: ComboGroupDraft[]) => void;
  products: ComboProductOption[];
}) {
  const t = useTranslations("menu");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;

  function updateGroup(index: number, patch: Partial<ComboGroupDraft>) {
    onChange(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    onChange([...groups, { name: "", minSelect: "1", maxSelect: "1", items: [] }]);
  }

  function removeGroup(index: number) {
    onChange(groups.filter((_, i) => i !== index));
  }

  function addItem(groupIndex: number, productId: string) {
    const group = groups[groupIndex]!;
    if (group.items.some((i) => i.productId === productId)) return;
    updateGroup(groupIndex, {
      items: [...group.items, { productId, priceDelta: "0", isDefault: group.items.length === 0 }],
    });
  }

  function updateItem(groupIndex: number, itemIndex: number, patch: Partial<ComboItemDraft>) {
    const group = groups[groupIndex]!;
    let items = group.items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item));
    if (patch.isDefault) {
      items = items.map((item, i) => ({ ...item, isDefault: i === itemIndex }));
    }
    updateGroup(groupIndex, { items });
  }

  function removeItem(groupIndex: number, itemIndex: number) {
    const group = groups[groupIndex]!;
    const items = group.items.filter((_, i) => i !== itemIndex);
    if (!items.some((i) => i.isDefault) && items.length > 0) items[0]!.isDefault = true;
    updateGroup(groupIndex, { items });
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => (
        <Card key={gi} className="p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <GripVertical className="mb-2 h-4 w-4 shrink-0 text-muted-foreground/50" />
            <div className="grid min-w-40 flex-1 gap-1.5">
              <Label>{t("comboGroupName")}</Label>
              <Input
                value={group.name}
                onChange={(e) => updateGroup(gi, { name: e.target.value })}
                placeholder={t("comboGroupPlaceholder")}
                maxLength={60}
              />
            </div>
            <div className="grid w-20 gap-1.5">
              <Label>{t("fields.minSelect")}</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={group.minSelect}
                onChange={(e) => updateGroup(gi, { minSelect: e.target.value })}
              />
            </div>
            <div className="grid w-20 gap-1.5">
              <Label>{t("fields.maxSelect")}</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={group.maxSelect}
                onChange={(e) => updateGroup(gi, { maxSelect: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              className="mb-1 text-destructive hover:text-destructive"
              onClick={() => removeGroup(gi)}
            >
              <Trash2 />
            </Button>
          </div>

          <div className="space-y-2">
            {group.items.length > 0 && (
              <div className="divide-y rounded-lg border">
                {group.items.map((item, ii) => {
                  const product = products.find((p) => p.id === item.productId);
                  if (!product) return null;
                  return (
                    <div key={item.productId} className="flex flex-wrap items-center gap-2 p-2.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => updateItem(gi, ii, { isDefault: true })}
                            className="text-muted-foreground transition-colors hover:text-warning"
                            aria-label={t("defaultChoice")}
                          >
                            <Star
                              className={item.isDefault ? "h-4 w-4 fill-warning text-warning" : "h-4 w-4"}
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t("defaultChoice")}</TooltipContent>
                      </Tooltip>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</span>
                      <span className="text-xs text-muted-foreground tabular">
                        {formatMoney(product.sellPrice, locale)}
                      </span>
                      <div className="w-32">
                        <MoneyInput
                          value={item.priceDelta}
                          onChange={(v) => updateItem(gi, ii, { priceDelta: v })}
                          allowNegative
                          className="h-8"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeItem(gi, ii)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <Combobox
              options={products
                .filter((p) => !group.items.some((i) => i.productId === p.id))
                .map((p) => ({ value: p.id, label: p.name, hint: formatMoney(p.sellPrice, locale) }))}
              value={null}
              onChange={(id) => addItem(gi, id)}
              placeholder={t("addComboChoice")}
              searchPlaceholder={tc("search")}
              emptyText={tc("noData")}
            />
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addGroup}>
        <Plus />
        {t("addComboGroup")}
      </Button>
    </div>
  );
}
