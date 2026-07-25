"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "__all__";

export function MovementFilters({
  ingredients,
  types,
  active,
}: {
  ingredients: { id: string; name: string }[];
  types: string[];
  active: { ingredient: string | null; type: string | null };
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={active.ingredient ?? ALL} onValueChange={(v) => setParam("ingredient", v === ALL ? null : v)}>
        <SelectTrigger className="sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allIngredients")}</SelectItem>
          {ingredients.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={active.type ?? ALL} onValueChange={(v) => setParam("type", v === ALL ? null : v)}>
        <SelectTrigger className="sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("allTypes")}</SelectItem>
          {types.map((type) => (
            <SelectItem key={type} value={type}>
              {t(`mvType.${type}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
