import { NextResponse } from "next/server";

import { db } from "@/lib/db";

/** Liveness/readiness probe — also used by deployment health checks. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
