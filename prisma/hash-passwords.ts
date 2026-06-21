import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.adminAccount.findMany();

  for (const acc of accounts) {
    const isBcrypt = acc.password.startsWith("$2a$") || acc.password.startsWith("$2b$");
    if (!isBcrypt) {
      const hashed = await bcrypt.hash(acc.password, 10);
      await prisma.adminAccount.update({
        where: { id: acc.id },
        data: { password: hashed },
      });
      console.log(`Hashed: ${acc.username}`);
    } else {
      console.log(`Already hashed: ${acc.username}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
