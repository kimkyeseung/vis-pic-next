import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const PRINTS_BUCKET = "pic-prints";
// QR 다운로드 보관 기간(일). 1일 = 24시간. 표시 문구도 24시간 기준(complete.expiry).
export const EXPIRY_DAYS = 1;

export function getPrintsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function decodeBase64Image(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  const raw = match ? match[1] : dataUrl;
  return Buffer.from(raw, "base64");
}

/** 만료일을 로케일 중립 ISO(YYYY-MM-DD)로 반환. 표시 포맷은 클라이언트가 언어에 맞춰 처리한다. */
export function formatExpiryDate(days = EXPIRY_DAYS): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  const y = expiry.getFullYear();
  const m = String(expiry.getMonth() + 1).padStart(2, "0");
  const d = String(expiry.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
