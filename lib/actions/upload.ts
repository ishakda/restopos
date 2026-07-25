"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import sharp from "sharp";

import { assertPermission, ForbiddenError } from "@/lib/auth/session";
import { fail, ok, type ActionResult } from "@/lib/action-result";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Upload a menu image (product/category). Re-encodes through sharp → strips
 * metadata & neutralizes malformed files, resizes to ≤800px, stores webp under
 * public/uploads. Returns the public URL path.
 */
export async function uploadMenuImageAction(formData: FormData): Promise<ActionResult<{ url: string }>> {
  try {
    await assertPermission("menu.manage");

    const file = formData.get("file");
    if (!(file instanceof File)) return fail("invalid_input");
    if (file.size === 0 || file.size > MAX_BYTES) return fail("file_too_large");
    if (!ALLOWED.has(file.type)) return fail("unsupported_file_type");

    const input = Buffer.from(await file.arrayBuffer());
    const output = await sharp(input, { failOn: "error" })
      .rotate()
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const name = `${crypto.randomBytes(12).toString("hex")}.webp`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), output);

    return ok({ url: `/uploads/${name}` });
  } catch (e) {
    if (e instanceof ForbiddenError) return fail("forbidden");
    return fail("upload_failed");
  }
}
