import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readdir, unlink } from "fs/promises";
import path from "path";

const BUCKET_NAME = "prints";
const EXPIRY_DAYS = 3;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, "");

  let deletedSupabase = 0;
  let deletedLocal = 0;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    try {
      const supabase = createClient(url, key);
      const { data: files } = await supabase.storage
        .from(BUCKET_NAME)
        .list("", { limit: 1000 });

      if (files) {
        const expired = files
          .filter((f) => {
            const m = f.name.match(/^(\d{8})_/);
            return m && m[1] < cutoffStr;
          })
          .map((f) => f.name);

        if (expired.length > 0) {
          const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove(expired);
          if (!error) deletedSupabase = expired.length;
        }
      }
    } catch {
      // supabase cleanup failed silently
    }
  }

  try {
    const printsDir = path.join(process.cwd(), "public", "static", "prints");
    const files = await readdir(printsDir).catch(() => [] as string[]);
    for (const file of files) {
      const m = file.match(/^(\d{8})_/);
      if (m && m[1] < cutoffStr) {
        await unlink(path.join(printsDir, file)).catch(() => {});
        deletedLocal++;
      }
    }
  } catch {
    // local cleanup failed silently
  }

  return NextResponse.json({
    success: true,
    deleted: deletedSupabase + deletedLocal,
    deletedSupabase,
    deletedLocal,
  });
}
