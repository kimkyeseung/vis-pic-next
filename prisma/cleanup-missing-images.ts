import { PrismaClient } from "@prisma/client";
import { existsSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  const images = await prisma.image.findMany();
  const dir = join(process.cwd(), "public", "static", "images");

  const missingIds = images
    .filter((img) => !existsSync(join(dir, img.filename)))
    .map((img) => img.id);

  if (missingIds.length === 0) {
    console.log("No missing image records to clean up.");
    return;
  }

  const result = await prisma.image.deleteMany({
    where: { id: { in: missingIds } },
  });

  console.log(`Deleted ${result.count} image records with missing files:`, missingIds);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
