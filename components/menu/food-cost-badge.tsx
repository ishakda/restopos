import { Badge } from "@/components/ui/badge";
import { foodCostLevel, formatFoodCostPct } from "@/lib/food-cost";

/**
 * Food-cost % pill with health color (≤35% good, 35–45% watch, >45% high).
 */
export function FoodCostBadge({ bp }: { bp: number | null }) {
  const level = foodCostLevel(bp);
  const variant =
    level === "good" ? "success" : level === "warning" ? "warning" : level === "bad" ? "destructive" : "secondary";
  return (
    <Badge variant={variant} className="tabular">
      {formatFoodCostPct(bp)}
    </Badge>
  );
}
