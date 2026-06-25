import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

const EXPIRY_DAYS = 3;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gifId: string }> },
) {
  const { gifId } = await params;

  const printsDir = path.join(process.cwd(), "public", "static", "prints");
  const files = await readdir(printsDir).catch(() => [] as string[]);
  const matchedFile = files.find((f) => f.includes(gifId) && f.endsWith(".gif"));

  if (!matchedFile) {
    return NextResponse.json({ error: "GIF not found" }, { status: 404 });
  }

  const dateMatch = matchedFile.match(/^(\d{4})(\d{2})(\d{2})_/);
  if (!dateMatch) {
    return NextResponse.json({ error: "Invalid filename format" }, { status: 404 });
  }

  const createdAt = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
  const expiryTime = new Date(createdAt);
  expiryTime.setDate(expiryTime.getDate() + EXPIRY_DAYS);
  const remainingDays = Math.max(0, Math.ceil((expiryTime.getTime() - Date.now()) / 86400000));

  return NextResponse.json({
    success: true,
    gif_id: gifId,
    gif_url: `/static/prints/${matchedFile}`,
    created_at: createdAt.toLocaleDateString("ko-KR"),
    expiry_date: expiryTime.toLocaleDateString("ko-KR"),
    remaining_days: remainingDays,
  });
}
