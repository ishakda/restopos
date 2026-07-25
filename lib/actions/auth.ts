"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { hashPassword, verifyPassword, checkPasswordStrength } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  getSession,
  revokeOtherSessions,
} from "@/lib/auth/session";
import { BRANCH_COOKIE, LOCALE_COOKIE } from "@/lib/constants";
import { isValidLocale } from "@/lib/locale";

const LOCK_AFTER_FAILURES = 8;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export async function loginAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fail("invalid_credentials", zodFieldErrors(parsed.error));
  const { email, password } = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`login:${ip}:${email}`, 5, 60_000);
  if (!rl.allowed) return fail("too_many_attempts");

  const user = await db.user.findUnique({ where: { email } });

  // Constant-shape flow: always verify against some hash to reduce timing signal.
  const dummyHash = "$2a$11$8Yh8Qf5eGyZ0uHhZ9rW0a.9uJ0mZ7dY0y3o5C1kQe0R7Wf5eGyZ0u";
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? dummyHash);

  if (!user || !user.isActive) return fail("invalid_credentials");

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return fail("account_locked");
  }

  if (!passwordOk) {
    const failures = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures,
        lockedUntil:
          failures >= LOCK_AFTER_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await writeAudit({
      orgId: user.orgId,
      userId: user.id,
      action: "auth.login_failed",
      entity: "user",
      entityId: user.id,
    });
    return fail("invalid_credentials");
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id);
  await writeAudit({
    orgId: user.orgId,
    userId: user.id,
    action: "auth.login",
    entity: "user",
    entityId: user.id,
  });

  // Apply the user's preferred locale to the device if none chosen yet.
  const store = await cookies();
  if (user.locale && !store.get(LOCALE_COOKIE)) {
    store.set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 3600 * 24 * 365 });
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const auth = await getSession();
  if (auth) {
    await writeAudit({
      orgId: auth.user.orgId,
      userId: auth.user.id,
      action: "auth.logout",
      entity: "user",
      entityId: auth.user.id,
    });
  }
  await destroySession();
  redirect("/login");
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
});

export async function changePasswordAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const auth = await getSession();
  if (!auth) return fail("unauthenticated");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return fail("invalid_input", zodFieldErrors(parsed.error));
  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return fail("invalid_input", { confirmPassword: ["passwords_do_not_match"] });
  }
  const strength = checkPasswordStrength(newPassword);
  if (!strength.valid) return fail("invalid_input", { newPassword: strength.errors });

  const user = await db.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return fail("unauthenticated");

  const okPw = await verifyPassword(currentPassword, user.passwordHash);
  if (!okPw) return fail("invalid_input", { currentPassword: ["wrong_current_password"] });

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
  await revokeOtherSessions(user.id, auth.sessionId);
  await writeAudit({
    orgId: user.orgId,
    userId: user.id,
    action: "auth.password_changed",
    entity: "user",
    entityId: user.id,
  });

  return ok(undefined, "auth.password_changed_success");
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  locale: z.string().optional(),
});

export async function updateProfileAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const auth = await getSession();
  if (!auth) return fail("unauthenticated");

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    locale: formData.get("locale") ?? undefined,
  });
  if (!parsed.success) return fail("invalid_input", zodFieldErrors(parsed.error));

  const locale = isValidLocale(parsed.data.locale) ? parsed.data.locale : null;

  await db.user.update({
    where: { id: auth.user.id },
    data: { name: parsed.data.name, ...(locale ? { locale } : {}) },
  });

  if (locale) {
    const store = await cookies();
    store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 3600 * 24 * 365 });
  }

  return ok(undefined, "account.profile_saved");
}

/** Device-level language switch (also available on the login screen). */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isValidLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 3600 * 24 * 365 });
}

/** Switch the active working branch (validated against user access). */
export async function setActiveBranchAction(branchId: string): Promise<ActionResult> {
  const auth = await getSession();
  if (!auth) return fail("unauthenticated");
  if (auth.user.branchId && auth.user.branchId !== branchId) return fail("forbidden");

  const branch = await db.branch.findFirst({
    where: { id: branchId, orgId: auth.user.orgId, isActive: true },
    select: { id: true },
  });
  if (!branch) return fail("not_found");

  const store = await cookies();
  store.set(BRANCH_COOKIE, branchId, { path: "/", maxAge: 3600 * 24 * 365 });
  return ok();
}
