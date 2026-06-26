import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const PRINTS_BUCKET = "prints";
export const EXPIRY_DAYS = 3;

export function getPrintsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function decodeBase64Image(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  const raw = match ? match[1] : dataUrl;
  return Buffer.from(raw, "base64");
}

export function formatExpiryDate(days = EXPIRY_DAYS): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return `${expiry.getFullYear()}년 ${String(expiry.getMonth() + 1).padStart(2, "0")}월 ${String(expiry.getDate()).padStart(2, "0")}일`;
}

export async function uploadPrintFile(
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const supabase = getPrintsClient();
  if (supabase) {
    const { error } = await supabase.storage
      .from(PRINTS_BUCKET)
      .upload(filename, buffer, { contentType, upsert: false });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from(PRINTS_BUCKET).getPublicUrl(filename);
      return publicUrl;
    }
  }
  const printsDir = path.join(process.cwd(), "public", "static", "prints");
  await mkdir(printsDir, { recursive: true });
  await writeFile(path.join(printsDir, filename), buffer);
  return `/static/prints/${filename}`;
}
