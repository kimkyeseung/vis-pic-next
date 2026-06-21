import { NextResponse } from "next/server";
import { getImageBaseUrl } from "@/lib/storage";

export async function GET() {
  return NextResponse.json({ baseUrl: getImageBaseUrl() });
}
