import { PrismaClient } from "@prisma/client";
import { existsSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  const images = await prisma.image.findMany({ orderBy: { id: "asc" } });
  const dir = join(process.cwd(), "public", "static", "images");

  const missing: number[] = [];

  for (const img of images) {
    const exists = existsSync(join(dir, img.filename));
    const status = exists ? "OK     " : "MISSING";
    console.log(`${status} | id:${img.id} | type:${img.imageType} | ${img.filename}`);
    if (!exists) missing.push(img.id);
  }

  console.log(`\nTotal: ${images.length}, OK: ${images.length - missing.length}, Missing: ${missing.length}`);
  console.log("Missing IDs:", missing);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
