"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ImageOff, Plus, Star, Trash2 } from "lucide-react";

import { deleteProductAction, saveProductAction } from "@/lib/actions/products";
import { uploadMenuImageAction } from "@/lib/actions/upload";
import { analyzeFoodCost, foodCostLevel, formatFoodCostPct, recipeCostMilli } from "@/lib/food-cost";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { toBaseUnits } from "@/lib/units";
import type { Locale } from "@/lib/locale";
import type { ProductPayload } from "@/lib/validation/menu";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  RecipeEditor,
  draftItemCostMilli,
  type IngredientOption,
  type RecipeItemDraft,
} from "@/components/menu/recipe-editor";
import { ComboBuilder, type ComboGroupDraft, type ComboProductOption } from "@/components/menu/combo-builder";

export interface VariantDraft {
  id?: string;
  name: string;
  priceDelta: string;
  isDefault: boolean;
  isActive: boolean;
  recipeItems: RecipeItemDraft[];
}

export interface ProductEditorInitial {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  imageUrl: string | null;
  sku: string;
  barcode: string;
  type: "simple" | "combo";
  sellPrice: string;
  taxRatePct: string;
  manualCost: string;
  isActive: boolean;
  isAvailable: boolean;
  prepTimeMinutes: string;
  variants: VariantDraft[];
  modifierGroupIds: string[];
  comboGroups: ComboGroupDraft[];
  baseRecipeItems: RecipeItemDraft[];
}

export interface ModifierGroupOption {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: { id: string; name: string; priceDelta: number }[];
}

export function emptyProductInitial(defaultCategoryId: string | null): ProductEditorInitial {
  return {
    name: "",
    description: "",
    categoryId: defaultCategoryId ?? "",
    imageUrl: null,
    sku: "",
    barcode: "",
    type: "simple",
    sellPrice: "",
    taxRatePct: "0",
    manualCost: "",
    isActive: true,
    isAvailable: true,
    prepTimeMinutes: "",
    variants: [],
    modifierGroupIds: [],
    comboGroups: [],
    baseRecipeItems: [],
  };
}

function FoodCostPanel({
  label,
  sellPrice,
  taxRatePct,
  costMilli,
  locale,
}: {
  label: string;
  sellPrice: number;
  taxRatePct: number;
  costMilli: number;
  locale: Locale;
}) {
  const t = useTranslations("menu.foodCostPanel");
  const analysis = analyzeFoodCost({
    sellPrice,
    taxRateBp: Math.round(taxRatePct * 100),
    taxMode: "inclusive",
    costMilli,
  });
  const level = foodCostLevel(analysis.foodCostBp);
  const color =
    level === "good" ? "text-success" : level === "warning" ? "text-warning-foreground" : level === "bad" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-lg font-semibold tabular ${color}`}>{formatFoodCostPct(analysis.foodCostBp)}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-background p-2">
          <dt className="text-muted-foreground">{t("price")}</dt>
          <dd className="mt-0.5 font-medium tabular">{formatMoney(sellPrice, locale)}</dd>
        </div>
        <div className="rounded-md bg-background p-2">
          <dt className="text-muted-foreground">{t("cost")}</dt>
          <dd className="mt-0.5 font-medium tabular">{formatMoney(analysis.costCentimes, locale)}</dd>
        </div>
        <div className="rounded-md bg-background p-2">
          <dt className="text-muted-foreground">{t("margin")}</dt>
          <dd className="mt-0.5 font-medium tabular">{formatMoney(analysis.grossMarginCentimes, locale)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ProductEditor({
  initial,
  categories,
  modifierGroups,
  ingredients,
  simpleProducts,
}: {
  initial: ProductEditorInitial;
  categories: { id: string; name: string; isActive: boolean }[];
  modifierGroups: ModifierGroupOption[];
  ingredients: IngredientOption[];
  simpleProducts: ComboProductOption[];
}) {
  const t = useTranslations("menu");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [draft, setDraft] = React.useState<ProductEditorInitial>(initial);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const isEdit = Boolean(initial.id);

  function patch(next: Partial<ProductEditorInitial>) {
    setDraft((d) => ({ ...d, ...next }));
  }

  // ---- Derived money values (client preview only — server re-parses) --------
  const sellPriceCentimes = parseMoneyInput(draft.sellPrice || "0") ?? 0;
  const taxPct = Number(draft.taxRatePct) || 0;

  const baseCostMilli =
    draft.baseRecipeItems.length > 0
      ? recipeCostMilli(
          draft.baseRecipeItems.map((item) => ({
            qty: Number.isFinite(Number(item.qty)) && Number(item.qty) > 0 ? toBaseUnits(Number(item.qty), item.displayUnit) : 0,
            avgCostMilli: ingredients.find((i) => i.id === item.ingredientId)?.avgCostMilli ?? 0,
          }))
        )
      : (parseMoneyInput(draft.manualCost || "0") ?? 0) * 1000;

  const comboExtraMilli =
    draft.type === "combo"
      ? draft.comboGroups.reduce((sum, group) => {
          const choice = group.items.find((i) => i.isDefault) ?? group.items[0];
          if (!choice) return sum;
          const product = simpleProducts.find((p) => p.id === choice.productId);
          void product;
          // choice cost is unknown client-side (recipes of other products) —
          // approximate with 0; the table view shows the exact server value.
          return sum;
        }, 0)
      : 0;

  const effectiveBaseCostMilli = baseCostMilli + comboExtraMilli;

  // ---- Upload ----------------------------------------------------------------
  async function onUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadMenuImageAction(fd);
    setUploading(false);
    if (result.ok && result.data) patch({ imageUrl: result.data.url });
    else toast.error(te("generic"));
  }

  // ---- Variants ----------------------------------------------------------------
  function addVariant() {
    const first = draft.variants.length === 0;
    patch({
      variants: [
        ...draft.variants,
        { name: "", priceDelta: "0", isDefault: first, isActive: true, recipeItems: [] },
      ],
    });
  }

  function updateVariant(index: number, vp: Partial<VariantDraft>) {
    let variants = draft.variants.map((v, i) => (i === index ? { ...v, ...vp } : v));
    if (vp.isDefault) variants = variants.map((v, i) => ({ ...v, isDefault: i === index }));
    patch({ variants });
  }

  function removeVariant(index: number) {
    const variants = draft.variants.filter((_, i) => i !== index);
    if (variants.length > 0 && !variants.some((v) => v.isDefault)) variants[0]!.isDefault = true;
    patch({ variants });
  }

  // ---- Save ----------------------------------------------------------------
  async function onSave() {
    const payload: ProductPayload = {
      id: draft.id,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      categoryId: draft.categoryId,
      imageUrl: draft.imageUrl,
      sku: draft.sku.trim() || null,
      barcode: draft.barcode.trim() || null,
      type: draft.type,
      sellPrice: draft.sellPrice || "0",
      taxRatePct: taxPct,
      manualCost: draft.manualCost || "0",
      isActive: draft.isActive,
      isAvailable: draft.isAvailable,
      prepTimeMinutes: draft.prepTimeMinutes ? Number(draft.prepTimeMinutes) : null,
      variants: draft.variants.map((v) => ({
        id: v.id,
        name: v.name.trim(),
        priceDelta: v.priceDelta || "0",
        isDefault: v.isDefault,
        isActive: v.isActive,
      })),
      modifierGroupIds: draft.modifierGroupIds,
      comboGroups:
        draft.type === "combo"
          ? draft.comboGroups.map((g) => ({
              id: g.id,
              name: g.name.trim(),
              minSelect: Number(g.minSelect) || 1,
              maxSelect: Number(g.maxSelect) || 1,
              items: g.items.map((i) => ({
                productId: i.productId,
                priceDelta: i.priceDelta || "0",
                isDefault: i.isDefault,
              })),
            }))
          : [],
      recipes: [
        {
          variantKey: null,
          items: draft.baseRecipeItems
            .filter((i) => Number(i.qty) > 0)
            .map((i) => ({ ingredientId: i.ingredientId, qty: Number(i.qty), displayUnit: i.displayUnit })),
        },
        ...draft.variants.map((v, i) => ({
          variantKey: v.id ?? `new:${i}`,
          items: v.recipeItems
            .filter((item) => Number(item.qty) > 0)
            .map((item) => ({ ingredientId: item.ingredientId, qty: Number(item.qty), displayUnit: item.displayUnit })),
        })),
      ],
    };

    setSaving(true);
    const result = await saveProductAction(payload);
    setSaving(false);

    if (result.ok) {
      toast.success(tc("success"));
      router.push("/menu");
      router.refresh();
    } else {
      toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : te("generic"));
    }
  }

  async function onDelete() {
    if (!draft.id) return;
    const result = await deleteProductAction(draft.id);
    setConfirmDelete(false);
    if (result.ok) {
      toast.success(result.data?.deactivated ? t("deactivatedInstead") : tc("success"));
      router.push("/menu");
      router.refresh();
    } else {
      toast.error(te.has(result.error) ? te(result.error) : te("generic"));
    }
  }

  const canSave =
    draft.name.trim().length > 0 &&
    draft.categoryId &&
    parseMoneyInput(draft.sellPrice || "0") !== null &&
    (draft.type === "simple" || draft.comboGroups.every((g) => g.name.trim() && g.items.length > 0)) &&
    draft.variants.every((v) => v.name.trim().length > 0);

  return (
    <div className="mx-auto max-w-4xl pb-24">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/menu" aria-label={tc("back")}>
            <ArrowLeft className="rtl:rotate-180" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {isEdit ? draft.name || t("editProduct") : t("newProduct")}
          </h1>
        </div>
        {isEdit && (
          <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
            {tc("delete")}
          </Button>
        )}
        <Button onClick={onSave} loading={saving || uploading} disabled={!canSave}>
          {tc("save")}
        </Button>
      </div>

      <div className="grid gap-6">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.general")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid gap-2">
                <Label>{t("fields.image")}</Label>
                {draft.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.imageUrl} alt="" className="h-24 w-24 rounded-xl border object-cover" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUpload(file);
                  }}
                  className="max-w-56"
                />
              </div>
              <div className="grid min-w-60 flex-1 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="p-name">{t("fields.name")}</Label>
                  <Input id="p-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} maxLength={100} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-desc">{t("fields.description")}</Label>
                  <Textarea
                    id="p-desc"
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    maxLength={500}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>{t("fields.category")}</Label>
                <Select value={draft.categoryId} onValueChange={(v) => patch({ categoryId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("fields.category")} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t("fields.type")}</Label>
                <Select
                  value={draft.type}
                  onValueChange={(v) => patch({ type: v as "simple" | "combo" })}
                  disabled={isEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">{t("typeSimple")}</SelectItem>
                    <SelectItem value="combo">{t("typeCombo")}</SelectItem>
                  </SelectContent>
                </Select>
                {isEdit && <p className="text-xs text-muted-foreground">{t("typeLocked")}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-prep">{t("fields.prepTime")}</Label>
                <Input
                  id="p-prep"
                  type="number"
                  min={0}
                  max={240}
                  value={draft.prepTimeMinutes}
                  onChange={(e) => patch({ prepTimeMinutes: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="p-sku">{t("fields.sku")}</Label>
                <Input id="p-sku" value={draft.sku} onChange={(e) => patch({ sku: e.target.value })} maxLength={60} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-barcode">{t("fields.barcode")}</Label>
                <Input id="p-barcode" value={draft.barcode} onChange={(e) => patch({ barcode: e.target.value })} maxLength={60} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="p-active">{t("fields.active")}</Label>
                <Switch id="p-active" checked={draft.isActive} onCheckedChange={(v) => patch({ isActive: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="p-available">{t("fields.available")}</Label>
                <Switch id="p-available" checked={draft.isAvailable} onCheckedChange={(v) => patch({ isAvailable: v })} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.pricing")}</CardTitle>
            <CardDescription>{t("pricingHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>{t("fields.sellPrice")}</Label>
                <MoneyInput value={draft.sellPrice} onChange={(v) => patch({ sellPrice: v })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-tax">{t("fields.taxRate")}</Label>
                <div className="relative">
                  <Input
                    id="p-tax"
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={draft.taxRatePct}
                    onChange={(e) => patch({ taxRatePct: e.target.value })}
                    className="pe-8 text-end tabular"
                    dir="ltr"
                  />
                  <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              {draft.baseRecipeItems.length === 0 && draft.type === "simple" && (
                <div className="grid gap-2">
                  <Label>{t("fields.manualCost")}</Label>
                  <MoneyInput value={draft.manualCost} onChange={(v) => patch({ manualCost: v })} />
                  <p className="text-xs text-muted-foreground">{t("manualCostHint")}</p>
                </div>
              )}
            </div>
            <FoodCostPanel
              label={t("foodCostPanel.title")}
              sellPrice={sellPriceCentimes}
              taxRatePct={taxPct}
              costMilli={effectiveBaseCostMilli}
              locale={locale}
            />
          </CardContent>
        </Card>

        {/* Combo builder */}
        {draft.type === "combo" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("sections.combo")}</CardTitle>
              <CardDescription>{t("comboHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ComboBuilder
                groups={draft.comboGroups}
                onChange={(comboGroups) => patch({ comboGroups })}
                products={simpleProducts.filter((p) => p.id !== draft.id)}
              />
            </CardContent>
          </Card>
        )}

        {/* Variants (simple products) */}
        {draft.type === "simple" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("sections.variants")}</CardTitle>
              <CardDescription>{t("variantsHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.variants.length > 0 && (
                <div className="divide-y rounded-lg border">
                  {draft.variants.map((variant, index) => (
                    <div key={variant.id ?? `new-${index}`} className="flex flex-wrap items-center gap-2 p-2.5">
                      <button
                        type="button"
                        onClick={() => updateVariant(index, { isDefault: true })}
                        className="text-muted-foreground transition-colors hover:text-warning"
                        aria-label={t("defaultChoice")}
                      >
                        <Star className={variant.isDefault ? "h-4 w-4 fill-warning text-warning" : "h-4 w-4"} />
                      </button>
                      <Input
                        value={variant.name}
                        onChange={(e) => updateVariant(index, { name: e.target.value })}
                        placeholder={t("variantNamePlaceholder")}
                        className="w-40 flex-1"
                        maxLength={60}
                      />
                      <div className="w-32">
                        <MoneyInput
                          value={variant.priceDelta}
                          onChange={(v) => updateVariant(index, { priceDelta: v })}
                          allowNegative
                          className="h-8"
                        />
                      </div>
                      <span className="w-24 text-end text-xs text-muted-foreground tabular">
                        = {formatMoney(sellPriceCentimes + (parseMoneyInput(variant.priceDelta || "0") ?? 0), locale)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeVariant(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="outline" onClick={addVariant}>
                <Plus />
                {t("addVariant")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Modifier groups */}
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.modifiers")}</CardTitle>
            <CardDescription>{t("modifiersAttachHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {modifierGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noModifierGroups")}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {modifierGroups.map((group) => {
                  const checked = draft.modifierGroupIds.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          patch({
                            modifierGroupIds: v
                              ? [...draft.modifierGroupIds, group.id]
                              : draft.modifierGroupIds.filter((id) => id !== group.id),
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{group.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {group.modifiers.map((m) => m.name).join(" · ") || "—"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recipe */}
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.recipe")}</CardTitle>
            <CardDescription>{t("recipeHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {draft.type === "simple" && draft.variants.length > 0 ? (
              <Tabs defaultValue="base">
                <TabsList className="mb-3 flex-wrap">
                  <TabsTrigger value="base">{t("baseRecipe")}</TabsTrigger>
                  {draft.variants.map((v, i) => (
                    <TabsTrigger key={v.id ?? `new-${i}`} value={v.id ?? `new-${i}`}>
                      {v.name || `#${i + 1}`}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="base">
                  <RecipeEditor
                    items={draft.baseRecipeItems}
                    onChange={(items) => patch({ baseRecipeItems: items })}
                    ingredients={ingredients}
                    locale={locale}
                  />
                </TabsContent>
                {draft.variants.map((variant, index) => {
                  const variantCostMilli =
                    variant.recipeItems.length > 0
                      ? variant.recipeItems.reduce((sum, item) => sum + draftItemCostMilli(item, ingredients), 0)
                      : baseCostMilli;
                  const variantPrice = sellPriceCentimes + (parseMoneyInput(variant.priceDelta || "0") ?? 0);
                  return (
                    <TabsContent key={variant.id ?? `new-${index}`} value={variant.id ?? `new-${index}`}>
                      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{variant.recipeItems.length === 0 ? t("usesBaseRecipe") : t("customRecipe")}</Badge>
                      </div>
                      <RecipeEditor
                        items={variant.recipeItems}
                        onChange={(items) => updateVariant(index, { recipeItems: items })}
                        ingredients={ingredients}
                        locale={locale}
                      />
                      <div className="mt-4">
                        <FoodCostPanel
                          label={variant.name || t("sections.variants")}
                          sellPrice={variantPrice}
                          taxRatePct={taxPct}
                          costMilli={variantCostMilli}
                          locale={locale}
                        />
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            ) : (
              <RecipeEditor
                items={draft.baseRecipeItems}
                onChange={(items) => patch({ baseRecipeItems: items })}
                ingredients={ingredients}
                locale={locale}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteProduct")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteProductConfirm", { name: draft.name })}</AlertDialogDescription>
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
