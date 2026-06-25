import { createClient } from "@supabase/supabase-js";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const BUCKET_NAME = "images";

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

function getLocalDir() {
  return path.join(process.cwd(), "public", "static", "images");
}

/**
 * Upload an image to both Supabase Storage and local filesystem.
 * Falls back to local-only if Supabase upload fails.
 * Returns the filename (not the full URL).
 */
export async function uploadImage(
  file: File | Buffer,
  filename: string
): Promise<string> {
  const buffer =
    Buffer.isBuffer(file) ? file : Buffer.from(await (file as File).arrayBuffer());

  // Always write to local filesystem
  const uploadDir = getLocalDir();
  await mkdir(uploadDir, { recursive: true });
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  // Attempt Supabase Storage upload (best-effort)
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filename, buffer, {
          contentType: getContentType(filename),
          upsert: true,
        });
      if (error) {
        console.warn("Supabase Storage upload failed, using local only:", error.message);
      }
    } catch (err) {
      console.warn("Supabase Storage upload error, using local only:", err);
    }
  }

  return filename;
}

/**
 * Delete an image from both Supabase Storage and local filesystem.
 * Errors are silenced for either target.
 */
export async function deleteImage(filename: string): Promise<void> {
  // Delete from local filesystem
  try {
    const filepath = path.join(getLocalDir(), filename);
    await unlink(filepath);
  } catch {
    // File may not exist locally, continue
  }

  // Delete from Supabase Storage (best-effort)
  const supabase = getSupabaseClient();
  if (supabase) {
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
}

export function getImageBaseUrl(): string {
  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}`;
  }
  return "/static/images";
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
