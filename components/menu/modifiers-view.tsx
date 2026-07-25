"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";

import {
  deleteModifierAction,
  deleteModifierGroupAction,
  saveModifierAction,
  saveModifierGroupAction,
} from "@/lib/actions/modifiers";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/units";
import type { Locale } from "@/lib/locale";
import type { BaseUnit, DisplayUnit } from "@/lib/constants";
import { displayUnitsFor } from "@/lib/units";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface ModifierItem {
  id: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
  ingredientId: string | null;
  ingredientQty: number | null;
  ingredientName: string | null;
  ingredientBaseUnit: string | null;
}

interface GroupItem {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  productCount: number;
  modifiers: ModifierItem[];
}

interface IngredientOption {
  id: string;
  name: string;
  baseUnit: string;
  displayUnit: string;
}

const NONE = "__none__";

export function ModifiersView({
  groups,
  ingredients,
  canManage,
  locale,
}: {
  groups: GroupItem[];
  ingredients: IngredientOption[];
  canManage: boolean;
  locale: Locale;
}) {
  const t = useTranslations("menu");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();

  // Group dialog state
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [groupEditing, setGroupEditing] = React.useState<GroupItem | null>(null);
  const [groupName, setGroupName] = React.useState("");
  const [minSelect, setMinSelect] = React.useState("0");
  const [maxSelect, setMaxSelect] = React.useState("1");
  const [groupActive, setGroupActive] = React.useState(true);

  // Modifier dialog state
  const [modOpen, setModOpen] = React.useState(false);
  const [modGroupId, setModGroupId] = React.useState<string>("");
  const [modEditing, setModEditing] = React.useState<ModifierItem | null>(null);
  const [modName, setModName] = React.useState("");
  const [modPrice, setModPrice] = React.useState("0");
  const [modIngredient, setModIngredient] = React.useState<string | null>(null);
  const [modQty, setModQty] = React.useState("");
  const [modUnit, setModUnit] = React.useState<DisplayUnit>("g");
  const [modActive, setModActive] = React.useState(true);

  const [deleting, setDeleting] = React.useState<{ type: "group" | "modifier"; id: string; name: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const selectedIngredient = ingredients.find((i) => i.id === modIngredient) ?? null;
  const unitOptions = selectedIngredient ? displayUnitsFor(selectedIngredient.baseUnit as BaseUnit) : [];

  function openGroupCreate() {
    setGroupEditing(null);
    setGroupName("");
    setMinSelect("0");
    setMaxSelect("1");
    setGroupActive(true);
    setGroupOpen(true);
  }

  function openGroupEdit(group: GroupItem) {
    setGroupEditing(group);
    setGroupName(group.name);
    setMinSelect(String(group.minSelect));
    setMaxSelect(String(group.maxSelect));
    setGroupActive(group.isActive);
    setGroupOpen(true);
  }

  function openModifierCreate(groupId: string) {
    setModEditing(null);
    setModGroupId(groupId);
    setModName("");
    setModPrice("0");
    setModIngredient(null);
    setModQty("");
    setModActive(true);
    setModOpen(true);
  }

  function openModifierEdit(groupId: string, modifier: ModifierItem) {
    setModEditing(modifier);
    setModGroupId(groupId);
    setModName(modifier.name);
    setModPrice(String(modifier.priceDelta / 100));
    setModIngredient(modifier.ingredientId);
    const ing = ingredients.find((i) => i.id === modifier.ingredientId);
    if (ing && modifier.ingredientQty != null) {
      // stored in base units → present in base unit for clarity
      setModQty(String(modifier.ingredientQty));
      setModUnit(ing.baseUnit as DisplayUnit);
    } else {
      setModQty("");
      setModUnit("g");
    }
    setModActive(modifier.isActive);
    setModOpen(true);
  }

  async function onSaveGroup() {
    setSaving(true);
    const result = await saveModifierGroupAction({
      id: groupEditing?.id,
      name: groupName.trim(),
      minSelect: Number(minSelect),
      maxSelect: Number(maxSelect),
      isActive: groupActive,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(tc("success"));
      setGroupOpen(false);
      router.refresh();
    } else {
      toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : te("generic"));
    }
  }

  async function onSaveModifier() {
    setSaving(true);
    const result = await saveModifierAction({
      id: modEditing?.id,
      groupId: modGroupId,
      name: modName.trim(),
      priceDelta: modPrice || "0",
      ingredientId: modIngredient,
      ingredientQty: modIngredient ? Number(modQty) : null,
      ingredientQtyUnit: modIngredient ? modUnit : null,
      isActive: modActive,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(tc("success"));
      setModOpen(false);
      router.refresh();
    } else {
      toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : te("generic"));
    }
  }

  async function onDelete() {
    if (!deleting) return;
    const result =
      deleting.type === "group" ? await deleteModifierGroupAction(deleting.id) : await deleteModifierAction(deleting.id);
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
      {canManage && (
        <div className="mb-4">
          <Button onClick={openGroupCreate}>
            <Plus />
            {t("newModifierGroup")}
          </Button>
        </div>
      )}

      {groups.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-muted-foreground">
          <SlidersHorizontal className="h-8 w-8 opacity-40" />
          {tc("noData")}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.id} className={!group.isActive ? "opacity-60" : undefined}>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">{group.name}</CardTitle>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    {t("selectRule", { min: group.minSelect, max: group.maxSelect === 0 ? "∞" : group.maxSelect })}
                  </Badge>
                  <Badge variant="outline">{t("usedByProducts", { count: group.productCount })}</Badge>
                  {!group.isActive && <Badge variant="secondary">{t("inactive")}</Badge>}
                </div>
              </div>
              {canManage && (
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="iconSm" onClick={() => openGroupEdit(group)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting({ type: "group", id: group.id, name: group.name })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="pb-4">
              <div className="divide-y rounded-lg border">
                {group.modifiers.length === 0 && (
                  <div className="p-3 text-center text-sm text-muted-foreground">{tc("noData")}</div>
                )}
                {group.modifiers.map((modifier) => (
                  <div key={modifier.id} className="flex items-center gap-2 p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className={modifier.isActive ? "font-medium" : "font-medium line-through opacity-60"}>
                          {modifier.name}
                        </span>
                        {modifier.priceDelta !== 0 && (
                          <span className="text-xs text-muted-foreground tabular">
                            {formatMoney(modifier.priceDelta, locale, { signed: true })}
                          </span>
                        )}
                      </div>
                      {modifier.ingredientName && modifier.ingredientQty != null && (
                        <div className="text-xs text-muted-foreground">
                          {modifier.ingredientName} · {formatQty(modifier.ingredientQty, (modifier.ingredientBaseUnit ?? "unit") as BaseUnit)}
                        </div>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-0.5">
                        <Button variant="ghost" size="iconSm" onClick={() => openModifierEdit(group.id, modifier)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting({ type: "modifier", id: modifier.id, name: modifier.name })}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canManage && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => openModifierCreate(group.id)}>
                  <Plus />
                  {t("newModifier")}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Group dialog */}
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{groupEditing ? t("editModifierGroup") : t("newModifierGroup")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="group-name">{t("fields.name")}</Label>
              <Input id="group-name" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={60} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="min-select">{t("fields.minSelect")}</Label>
                <Input id="min-select" type="number" min={0} max={20} value={minSelect} onChange={(e) => setMinSelect(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="max-select">{t("fields.maxSelect")}</Label>
                <Input id="max-select" type="number" min={0} max={20} value={maxSelect} onChange={(e) => setMaxSelect(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("maxSelectHint")}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="group-active">{t("fields.active")}</Label>
              <Switch id="group-active" checked={groupActive} onCheckedChange={setGroupActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={onSaveGroup} loading={saving} disabled={!groupName.trim()}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifier dialog */}
      <Dialog open={modOpen} onOpenChange={setModOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modEditing ? t("editModifier") : t("newModifier")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="mod-name">{t("fields.name")}</Label>
              <Input id="mod-name" value={modName} onChange={(e) => setModName(e.target.value)} maxLength={60} placeholder={t("modifierNamePlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label>{t("fields.priceDelta")}</Label>
              <MoneyInput value={modPrice} onChange={setModPrice} allowNegative />
            </div>
            <div className="grid gap-2">
              <Label>{t("fields.linkedIngredient")}</Label>
              <Combobox
                options={[
                  { value: NONE, label: t("noIngredient") },
                  ...ingredients.map((i) => ({ value: i.id, label: i.name })),
                ]}
                value={modIngredient ?? NONE}
                onChange={(v) => setModIngredient(v === NONE ? null : v)}
                placeholder={t("noIngredient")}
                searchPlaceholder={tc("search")}
                emptyText={tc("noData")}
              />
              <p className="text-xs text-muted-foreground">{t("linkedIngredientHint")}</p>
            </div>
            {modIngredient && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="mod-qty">{t("fields.quantity")}</Label>
                  <Input id="mod-qty" type="number" min={0} step="any" value={modQty} onChange={(e) => setModQty(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>{t("fields.unit")}</Label>
                  <Select value={modUnit} onValueChange={(v) => setModUnit(v as DisplayUnit)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="mod-active">{t("fields.active")}</Label>
              <Switch id="mod-active" checked={modActive} onCheckedChange={setModActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={onSaveModifier}
              loading={saving}
              disabled={!modName.trim() || (Boolean(modIngredient) && !(Number(modQty) > 0))}
            >
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm", { name: deleting?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction destructive onClick={onDelete}>
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
