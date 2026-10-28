import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");

export async function saveProductImage(file: File): Promise<string> {
  const ext = ALLOWED.get(file.type);
  if (!ext) {
    throw new Error("Use a JPG, PNG, or WebP image");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 2 MB or smaller");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, name), buffer);
  return `/uploads/products/${name}`;
}

export async function deleteProductImage(imageUrl: string | null | undefined) {
  if (!imageUrl?.startsWith("/uploads/products/")) return;
  const file = path.basename(imageUrl);
  if (!file || file.includes("..")) return;
  try {
    await unlink(path.join(UPLOAD_DIR, file));
  } catch {
    // ignore missing file
  }
}
