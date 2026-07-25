"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

export function Providers({ dir, children }: { dir: "ltr" | "rtl"; children: React.ReactNode }) {
  return (
    <DirectionProvider dir={dir}>
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster
          richColors
          closeButton
          dir={dir}
          position={dir === "rtl" ? "bottom-left" : "bottom-right"}
        />
      </TooltipProvider>
    </DirectionProvider>
  );
}
