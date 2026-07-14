import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient, BUCKET_NAME } from "@/lib/storage";

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "mp4", "webp"];

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { ext, name } = await request.json();

  if (!ext || !ALLOWED_EXTENSIONS.includes(ext.toLowerCase())) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: " + ALLOWED_EXTENSIONS.join(", ") },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    // Supabase 미설정 시 클라이언트에게 직접 업로드 방식 사용 안내
    return NextResponse.json({ mode: "local" });
  }

  const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const filename = `${uid}.${ext.toLowerCase()}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(filename);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    mode: "presign",
    signedUrl: data.signedUrl,
    filename,
  });
}
