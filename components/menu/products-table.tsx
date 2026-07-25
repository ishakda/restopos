"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ImageOff, Layers, Search, UtensilsCrossed } from "lucide-react";

import { formatMoney } from "@/lib/money";
import type { Locale } from "@/lib/locale";
import { toggleProductAvailabilityAction } from "@/lib/actions/products";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FoodCostBadge } from "@/components/menu/food-cost-badge";
import { Card } from "@/components/ui/card";

export interface ProductRow {
  id: string;
  name: string;
  imageUrl: string | null;
  categoryName: string;
  type: string;
  sellPrice: number;
  taxRate: number;
  isActive: boolean;
  isAvailable: boolean;
  variantCount: number;
  hasRecipe: boolean;
  costCentimes: number;
  foodCostBp: number | null;
  marginCentimes: number;
}

const ALL = "__all__";

export function ProductsTable({
  rows,
  categories,
  activeCategory,
  query,
  canManage,
  locale,
}: {
  rows: ProductRow[];
  categories: { id: string; name: string }[];
  activeCategory: string | null;
  query: string;
  canManage: boolean;
  locale: Locale;
}) {
  const t = useTranslations("menu");
  const tc = useTranslations("common");
  const te = useTranslations("auth.errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(query);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  function updateParams(next: { q?: string; category?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    if (next.category !== undefined) {
      if (next.category) params.set("category", next.category);
      else params.delete("category");
    }
    router.replace(`/menu?${params.toString()}`);
  }

  // Debounced search → URL
  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (search !== query) updateParams({ q: search });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function onToggle(id: string, next: boolean) {
    setPendingId(id);
    const result = await toggleProductAvailabilityAction(id, next);
    setPendingId(null);
    if (!result.ok) toast.error(te.has(result.error) ? te(result.error) : te("generic"));
    else router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchProducts")}
            className="ps-9"
          />
        </div>
        <Select
          value={activeCategory ?? ALL}
          onValueChange={(v) => updateParams({ category: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allCategories")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14"></TableHead>
            <TableHead>{t("table.product")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("table.category")}</TableHead>
            <TableHead className="text-end">{t("table.price")}</TableHead>
            <TableHead className="hidden text-end lg:table-cell">{t("table.cost")}</TableHead>
            <TableHead className="hidden text-end lg:table-cell">{t("table.margin")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("table.foodCost")}</TableHead>
            <TableHead>{t("table.available")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                <UtensilsCrossed className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {tc("noData")}
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.id} className={!row.isActive ? "opacity-50" : undefined}>
              <TableCell>
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded-md border object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                    <ImageOff className="h-4 w-4" />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link
                  href={canManage ? `/menu/products/${row.id}` : "#"}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {row.type === "combo" && (
                    <Badge variant="info" className="gap-1">
                      <Layers />
                      {t("combo")}
                    </Badge>
                  )}
                  {row.variantCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("variantCount", { count: row.variantCount })}
                    </span>
                  )}
                  {!row.isActive && <Badge variant="secondary">{t("inactive")}</Badge>}
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{row.categoryName}</TableCell>
              <TableCell className="text-end font-medium tabular">{formatMoney(row.sellPrice, locale)}</TableCell>
              <TableCell className="hidden text-end text-muted-foreground tabular lg:table-cell">
                {row.hasRecipe || row.costCentimes > 0 ? formatMoney(row.costCentimes, locale) : "—"}
              </TableCell>
              <TableCell className="hidden text-end text-muted-foreground tabular lg:table-cell">
                {row.hasRecipe || row.costCentimes > 0 ? formatMoney(row.marginCentimes, locale) : "—"}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {row.hasRecipe || row.costCentimes > 0 ? <FoodCostBadge bp={row.foodCostBp} /> : <Badge variant="secondary">—</Badge>}
              </TableCell>
              <TableCell>
                <Switch
                  checked={row.isAvailable}
                  disabled={!canManage || pendingId === row.id || !row.isActive}
                  onCheckedChange={(v) => onToggle(row.id, v)}
                  aria-label={t("table.available")}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
