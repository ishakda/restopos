import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";

import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_HOURS, SESSION_RENEW_THRESHOLD_MS } from "@/lib/constants";

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  /** null = access to all branches */
  branchId: string | null;
  locale: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

export interface AuthContext {
  user: AuthUser;
  permissions: Set<string>;
  sessionId: string;
}

export class ForbiddenError extends Error {
  constructor(public permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
}

/** Create a DB session and set the cookie. Call from a Server Action / Route Handler only. */
export async function createSession(userId: string): Promise<void> {
  const raw = generateSessionToken();
  const h = await headers();
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: sessionExpiry(),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

/** Revoke the current session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(raw) },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

/** Revoke every OTHER session of a user (e.g. after a password change). */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, id: { not: keepSessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Resolve the current session (request-cached). Returns null when absent,
 * expired, revoked, or the user was deactivated. Applies sliding renewal.
 */
export const getSession = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  // Sliding renewal (best-effort; cookie maxAge is refreshed on next login)
  if (session.expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    db.session
      .update({ where: { id: session.id }, data: { expiresAt: sessionExpiry(), lastUsedAt: new Date() } })
      .catch(() => {});
  }

  const permissions = new Set(session.user.role.permissions.map((rp) => rp.permission.code));

  return {
    sessionId: session.id,
    permissions,
    user: {
      id: session.user.id,
      orgId: session.user.orgId,
      email: session.user.email,
      name: session.user.name,
      roleId: session.user.roleId,
      roleName: session.user.role.name,
      branchId: session.user.branchId,
      locale: session.user.locale,
      avatarUrl: session.user.avatarUrl,
      mustChangePassword: session.user.mustChangePassword,
    },
  };
});

/** For pages/layouts: redirect to /login when unauthenticated. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getSession();
  if (!auth) redirect("/login");
  return auth;
}

/** For pages: redirect home when the permission is missing. */
export async function requirePermissionPage(code: string): Promise<AuthContext> {
  const auth = await requireAuth();
  if (!auth.permissions.has(code)) redirect("/");
  return auth;
}

/** For server actions / route handlers: throw (caller maps to ActionResult). */
export async function assertPermission(code: string): Promise<AuthContext> {
  const auth = await getSession();
  if (!auth) throw new ForbiddenError("authenticated");
  if (!auth.permissions.has(code)) throw new ForbiddenError(code);
  return auth;
}
