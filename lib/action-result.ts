/**
 * Uniform result type for server actions consumed by useActionState.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail<T = undefined>(error: string, fieldErrors?: Record<string, string[]>): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/** Map a zod error into field errors. */
export function zodFieldErrors(err: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const flat = err.flatten().fieldErrors;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(flat)) if (v && v.length) out[k] = v;
  return out;
}
