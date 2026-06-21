import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create image types
  const backgroundType = await prisma.imageType.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "background" },
  });

  const imageType = await prisma.imageType.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: "image" },
  });

  console.log("Created image types:", { backgroundType, imageType });

  // Create default admin account
  const hashedPassword = await bcrypt.hash("admin", 10);
  const admin = await prisma.adminAccount.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      name: "관리자",
      isActive: true,
    },
  });

  console.log("Created admin:", admin.username);

  // Create test device
  const device = await prisma.device.upsert({
    where: { deviceId: "test" },
    update: {},
    create: {
      deviceId: "test",
      name: "테스트 장치",
      description: "기본 테스트 장치",
      isActive: true,
    },
  });

  console.log("Created device:", device.deviceId);

  // Create default device settings
  const defaultSettings = [
    { name: "PAYMENT_ENABLED", value: "1", description: "결제 사용 여부" },
    { name: "PAYMENT_AMOUNT", value: "1000", description: "결제 금액" },
    { name: "CAPTURE_SECONDS", value: "3", description: "촬영 카운트다운" },
    { name: "CAPTURE_COUNT_MODE", value: "4", description: "촬영 횟수" },
    { name: "CHROMAKEY_RGB", value: "0,255,0", description: "크로마키 색상" },
  ];

  for (const setting of defaultSettings) {
    await prisma.deviceSetting.upsert({
      where: {
        deviceId_name: { deviceId: "test", name: setting.name },
      },
      update: {},
      create: {
        deviceId: "test",
        name: setting.name,
        value: setting.value,
        description: setting.description,
      },
    });
  }

  console.log("Created default settings");

  // Create background images
  const backgrounds = [
    { name: "핑크 퍼플", filename: "bg_pink_purple.svg", priority: 6 },
    { name: "블루 시안", filename: "bg_blue_cyan.svg", priority: 5 },
    { name: "그린 민트", filename: "bg_green_mint.svg", priority: 4 },
    { name: "핑크 옐로우", filename: "bg_pink_yellow.svg", priority: 3 },
    { name: "인디고 퍼플", filename: "bg_indigo_purple.svg", priority: 2 },
    { name: "핑크 레드", filename: "bg_pink_red.svg", priority: 1 },
  ];

  for (const bg of backgrounds) {
    await prisma.image.upsert({
      where: { id: backgrounds.indexOf(bg) + 1 },
      update: {},
      create: {
        deviceId: null,
        imageType: 1,
        name: bg.name,
        filename: bg.filename,
        width: 1200,
        height: 800,
        priority: bg.priority,
      },
    });
  }

  console.log("Created background images:", backgrounds.length);

  // Create global settings
  const globalSettings = [
    { name: "PICTURE_WIDTH", value: "15", description: "인화 가로 크기(cm)" },
    { name: "PICTURE_HEIGHT", value: "10", description: "인화 세로 크기(cm)" },
    { name: "CAPTURE_MODES", value: "1x1,1x2,2x2", description: "지원 프레임" },
  ];

  for (const setting of globalSettings) {
    await prisma.setting.upsert({
      where: { name: setting.name },
      update: {},
      create: setting,
    });
  }

  console.log("Created global settings");

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
