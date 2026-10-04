import { createClient } from "@supabase/supabase-js";

export const BUCKET_NAME = "pic-images";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) return null;
  return createClient(url, key);
}

/** 서비스 롤 키를 사용하는 관리자 클라이언트 (presign URL 생성 등 서버 전용) */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Upload an image to Supabase Storage. Returns the filename (not the full URL).
 * 이미지는 Supabase Storage로 일원화되어 있어 미설정·실패 시 그대로 throw 한다.
 */
export async function uploadImage(
  file: File | Buffer,
  filename: string
): Promise<{ filename: string }> {
  const buffer =
    Buffer.isBuffer(file) ? file : Buffer.from(await (file as File).arrayBuffer());

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase Storage is not configured");
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filename, buffer, {
      contentType: getContentType(filename),
      upsert: true,
    });
  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return { filename };
}

/** Supabase Storage에서 파일을 내려받는다(업로드 후 서버 가공용). 미설정·실패 시 throw. */
export async function downloadImage(filename: string): Promise<Buffer> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase Storage is not configured");
  }
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(filename);
  if (error || !data) {
    throw new Error(`Supabase Storage download failed: ${error?.message ?? "no data"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Delete an image from Supabase Storage (best-effort).
 */
export async function deleteImage(filename: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filename]);
    if (error) {
      console.warn("Supabase Storage delete failed:", error.message);
    }
  } catch (err) {
    console.warn("Supabase Storage delete error:", err);
  }
}

export function getImageBaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}`;
}

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}
