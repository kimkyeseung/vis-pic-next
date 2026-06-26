import { NextRequest, NextResponse } from "next/server";
import { readdir, unlink } from "fs/promises";
import path from "path";
import { PRINTS_BUCKET, EXPIRY_DAYS, getPrintsClient } from "@/lib/prints";

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

  const supabase = getPrintsClient();
  if (supabase) {
    try {
      const { data: files } = await supabase.storage
        .from(PRINTS_BUCKET)
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
            .from(PRINTS_BUCKET)
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
