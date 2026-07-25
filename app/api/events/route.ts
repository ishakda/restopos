import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { subscribeToBranch } from "@/lib/events";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream: order/kitchen/stock events for one branch.
 * Auth: session cookie; branch access is validated against the user.
 */
export async function GET(req: NextRequest) {
  const auth = await getSession();
  if (!auth) return new Response("unauthorized", { status: 401 });

  const branchId = req.nextUrl.searchParams.get("branch");
  if (!branchId) return new Response("branch required", { status: 400 });
  if (auth.user.branchId && auth.user.branchId !== branchId) {
    return new Response("forbidden", { status: 403 });
  }
  const branch = await db.branch.findFirst({
    where: { id: branchId, orgId: auth.user.orgId },
    select: { id: true },
  });
  if (!branch) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      write(`data: ${JSON.stringify({ type: "connected", at: new Date().toISOString() })}\n\n`);

      const unsubscribe = subscribeToBranch(branchId, (event) => {
        write(`data: ${JSON.stringify(event)}\n\n`);
      });
      const heartbeat = setInterval(() => write(`: ping\n\n`), 25_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
