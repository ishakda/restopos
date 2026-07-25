"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * On-screen toolbar for print pages (hidden when printing) + auto window.print().
 */
export function PrintToolbar({ auto = true }: { auto?: boolean }) {
  const t = useTranslations("print");

  React.useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [auto]);

  return (
    <div className="print-hidden sticky top-0 z-10 mb-4 flex items-center justify-center gap-2 border-b bg-background/95 p-3 backdrop-blur">
      <Button onClick={() => window.print()}>
        <Printer />
        {t("print")}
      </Button>
      <Button variant="outline" onClick={() => window.close()}>
        <X />
        {t("close")}
      </Button>
    </div>
  );
}
