import bcrypt from "bcryptjs";

const BCRYPT_COST = 11;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordStrength {
  valid: boolean;
  /** i18n keys of the failed rules. */
  errors: string[];
}

/**
 * Minimum policy: 8+ chars, at least one letter and one digit.
 * (Kept pragmatic for POS staff accounts; owners can use longer passphrases.)
 */
export function checkPasswordStrength(password: string): PasswordStrength {
  const errors: string[] = [];
  if (password.length < 8) errors.push("password_too_short");
  if (!/[a-zA-Z]/.test(password)) errors.push("password_needs_letter");
  if (!/[0-9]/.test(password)) errors.push("password_needs_digit");
  if (password.length > 128) errors.push("password_too_long");
  return { valid: errors.length === 0, errors };
}
