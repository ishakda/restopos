"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";

import type { PosProduct } from "@/lib/pos-queries";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { CartLine } from "@/components/pos/cart-types";

interface ItemConfigDialogProps {
  product: PosProduct;
  existing: CartLine | null;
  locale: Locale;
  onClose: () => void;
  onSubmit: (line: Omit<CartLine, "uid">) => void;
}

export function ItemConfigDialog({ product, existing, locale, onClose, onSubmit }: ItemConfigDialogProps) {
  const t = useTranslations("pos");
  const tc = useTranslations("common");

  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null;
  const [variantId, setVariantId] = React.useState<string | null>(existing?.variantId ?? defaultVariant?.id ?? null);
  const [selectedModifiers, setSelectedModifiers] = React.useState<Set<string>>(
    () => new Set(existing?.modifiers.map((m) => m.id) ?? [])
  );
  const [comboChoices, setComboChoices] = React.useState<Map<string, Set<string>>>(() => {
    const map = new Map<string, Set<string>>();
    for (const group of product.comboGroups) {
      const preset = existing
        ? existing.comboSelections.filter((s) => s.comboGroupId === group.id).map((s) => s.productId)
        : group.items.filter((i) => i.isDefault && i.isAvailable).slice(0, group.maxSelect).map((i) => i.productId);
      map.set(group.id, new Set(preset));
    }
    return map;
  });
  const [qty, setQty] = React.useState(existing?.qty ?? 1);
  const [notes, setNotes] = React.useState(existing?.notes ?? "");

  const variant = product.variants.find((v) => v.id === variantId) ?? null;

  function toggleModifier(groupMax: number, groupModifierIds: string[], modifierId: string) {
    setSelectedModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(modifierId)) {
        next.delete(modifierId);
        return next;
      }
      const inGroup = groupModifierIds.filter((id) => next.has(id));
      if (groupMax === 1 && inGroup.length === 1) {
        // radio behavior for single-choice groups
        next.delete(inGroup[0]!);
      } else if (groupMax > 0 && inGroup.length >= groupMax) {
        return next; // at cap
      }
      next.add(modifierId);
      return next;
    });
  }

  function toggleComboChoice(groupId: string, maxSelect: number, productId: string) {
    setComboChoices((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(groupId) ?? []);
      if (set.has(productId)) {
        set.delete(productId);
      } else if (maxSelect === 1) {
        set.clear();
        set.add(productId);
      } else if (set.size < maxSelect) {
        set.add(productId);
      }
      next.set(groupId, set);
      return next;
    });
  }

  // ---- Validity + price preview -------------------------------------------------
  const groupsValid = product.modifierGroups.every((group) => {
    const count = group.modifiers.filter((m) => selectedModifiers.has(m.id)).length;
    return count >= group.minSelect && (group.maxSelect === 0 || count <= group.maxSelect);
  });
  const combosValid = product.comboGroups.every((group) => {
    const count = comboChoices.get(group.id)?.size ?? 0;
    return count >= group.minSelect && count <= group.maxSelect;
  });
  const valid = groupsValid && combosValid && qty >= 1;

  const comboDelta = product.comboGroups.reduce((sum, group) => {
    const chosen = comboChoices.get(group.id) ?? new Set();
    return sum + group.items.filter((i) => chosen.has(i.productId)).reduce((s, i) => s + i.priceDelta, 0);
  }, 0);
  const modifiersDelta = product.modifierGroups.reduce(
    (sum, group) => sum + group.modifiers.filter((m) => selectedModifiers.has(m.id)).reduce((s, m) => s + m.priceDelta, 0),
    0
  );
  const unitPrice = product.sellPrice + (variant?.priceDelta ?? 0) + comboDelta + modifiersDelta;

  function submit() {
    if (!valid) return;
    onSubmit({
      productId: product.id,
      name: product.name,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      baseUnitPrice: product.sellPrice + (variant?.priceDelta ?? 0) + comboDelta,
      taxRate: product.taxRate,
      modifiers: product.modifierGroups.flatMap((group) =>
        group.modifiers
          .filter((m) => selectedModifiers.has(m.id))
          .map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta }))
      ),
      comboSelections: product.comboGroups.flatMap((group) =>
        group.items
          .filter((i) => (comboChoices.get(group.id) ?? new Set()).has(i.productId))
          .map((i) => ({
            comboGroupId: group.id,
            groupName: group.name,
            productId: i.productId,
            name: i.name,
            priceDelta: i.priceDelta,
          }))
      ),
      qty,
      notes: notes.trim(),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="border-b p-4 pb-3">
          <DialogTitle className="flex items-center justify-between gap-2 pe-8">
            <span className="truncate">{product.name}</span>
            <span className="shrink-0 text-primary tabular">{formatMoney(unitPrice, locale)}</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[55dvh]">
          <div className="space-y-5 p-4">
            {/* Variants */}
            {product.variants.length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold">{t("size")}</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {product.variants.map((v) => (
                    <OptionTile
                      key={v.id}
                      active={variantId === v.id}
                      onClick={() => setVariantId(v.id)}
                      label={v.name}
                      hint={v.priceDelta !== 0 ? formatMoney(v.priceDelta, locale, { signed: true }) : undefined}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Combo groups */}
            {product.comboGroups.map((group) => (
              <section key={group.id}>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {group.name}
                  <Badge variant="secondary">
                    {group.minSelect === group.maxSelect
                      ? t("chooseExactly", { count: group.maxSelect })
                      : t("chooseRange", { min: group.minSelect, max: group.maxSelect })}
                  </Badge>
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.items.map((item) => (
                    <OptionTile
                      key={item.productId}
                      active={(comboChoices.get(group.id) ?? new Set()).has(item.productId)}
                      disabled={!item.isAvailable}
                      onClick={() => toggleComboChoice(group.id, group.maxSelect, item.productId)}
                      label={item.name}
                      hint={item.priceDelta !== 0 ? formatMoney(item.priceDelta, locale, { signed: true }) : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}

            {/* Modifier groups */}
            {product.modifierGroups.map((group) => {
              const ids = group.modifiers.map((m) => m.id);
              return (
                <section key={group.id}>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    {group.name}
                    {group.minSelect > 0 && <Badge variant="warning">{t("required")}</Badge>}
                    {group.maxSelect > 0 && (
                      <span className="text-xs font-normal text-muted-foreground">{t("maxChoices", { count: group.maxSelect })}</span>
                    )}
                  </h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {group.modifiers.map((modifier) => (
                      <OptionTile
                        key={modifier.id}
                        active={selectedModifiers.has(modifier.id)}
                        onClick={() => toggleModifier(group.maxSelect, ids, modifier.id)}
                        label={modifier.name}
                        hint={modifier.priceDelta !== 0 ? formatMoney(modifier.priceDelta, locale, { signed: true }) : undefined}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Notes */}
            <section>
              <Label htmlFor="item-notes" className="mb-2 block text-sm font-semibold">
                {t("itemNotes")}
              </Label>
              <Input
                id="item-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("itemNotesPlaceholder")}
                maxLength={200}
              />
            </section>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-3 border-t p-4">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus />
            </Button>
            <span className="w-10 text-center text-lg font-semibold tabular">{qty}</span>
            <Button variant="outline" size="icon" onClick={() => setQty((q) => Math.min(99, q + 1))}>
              <Plus />
            </Button>
          </div>
          <Button size="xl" className="flex-1" disabled={!valid} onClick={submit}>
            {existing ? tc("save") : t("addToCart")} · {formatMoney(unitPrice * qty, locale)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OptionTile({
  active,
  disabled,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-2 py-2 text-center text-sm font-medium transition-all active:scale-95 disabled:opacity-40",
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
      )}
    >
      <span className="line-clamp-2 leading-tight">{label}</span>
      {hint && <span className="text-xs font-normal opacity-75 tabular">{hint}</span>}
    </button>
  );
}
