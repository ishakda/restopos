import { describe, expect, it } from "vitest";

import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password strength", () => {
  it("accepts a valid password", () => {
    expect(checkPasswordStrength("Demo@2026").valid).toBe(true);
  });
  it("rejects short passwords", () => {
    const r = checkPasswordStrength("a1");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("password_too_short");
  });
  it("requires a letter and a digit", () => {
    expect(checkPasswordStrength("12345678").errors).toContain("password_needs_letter");
    expect(checkPasswordStrength("abcdefgh").errors).toContain("password_needs_digit");
  });
});

describe("hash/verify", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("S3cret-pass");
    expect(await verifyPassword("S3cret-pass", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
  it("never throws on malformed hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
