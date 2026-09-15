import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.includes("supabase.com") && !process.env.SEED_FORCE) {
    console.error("운영 DB에 시드를 실행하려면 SEED_FORCE=1 환경변수를 설정하세요.");
    console.error("예: SEED_FORCE=1 npm run db:seed");
    process.exit(1);
  }

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

  const stickerType = await prisma.imageType.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, name: "sticker" },
  });

  // 구 print_background(id 4)는 프레임(id 2)으로 통합되어 더 이상 생성하지 않는다.
  // 기존 DB의 type 4 데이터는 prisma/merge-print-background-to-frame.ts 로 이전한다.

  // 테마관리용 배경화면(wallpaper) — 키오스크 서비스 화면 전체 배경. id 4는
  // 구 print_background 잔재와 충돌할 수 있어 id 5를 사용한다.
  const wallpaperType = await prisma.imageType.upsert({
    where: { id: 5 },
    update: {},
    create: { id: 5, name: "wallpaper" },
  });

  // 테마관리용 로고(logo) — 서비스 화면 로고 이미지
  const logoType = await prisma.imageType.upsert({
    where: { id: 6 },
    update: {},
    create: { id: 6, name: "logo" },
  });

  // 테마관리용 버튼 이미지(button) — 서비스 화면 대형 강조 버튼(촬영하기·다음 등) 배경
  const buttonType = await prisma.imageType.upsert({
    where: { id: 7 },
    update: {},
    create: { id: 7, name: "button" },
  });

  console.log("Created image types:", { backgroundType, imageType, stickerType, wallpaperType, logoType, buttonType });

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
    { name: "PAYMENT_AMOUNT", value: "5000", description: "1장당 가격(원). 결제 화면 1/2/4장 고정, 총액 = 가격 × 매수" },
    { name: "CAPTURE_SECONDS", value: "3", description: "촬영 카운트다운" },
    { name: "CAPTURE_COUNT_MODE", value: "uniform", description: "촬영 횟수 모드 (uniform/custom)" },
    { name: "CAPTURE_COUNT_UNIFORM", value: "4", description: "슬롯당 촬영 횟수" },
    { name: "CHROMAKEY_MODE", value: "mediapipe", description: "배경 제거 모드 (mediapipe/chromakey/chromakey-yuv/off)" },
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

  // 기본 배경 이미지 시드 제거:
  //  - 과거 bg_*.svg 그라디언트 파일(public/static/images)에 의존했으나 해당 파일을
  //    삭제하고 런타임 이미지는 Supabase Storage로 일원화함(bg_*.svg는 Supabase에 없음).
  //  - DB에 배경이 없으면 클라이언트가 코드 상수 FALLBACK_BACKGROUNDS(그라디언트 6종)로
  //    표시하므로 out-of-box 동작에는 문제 없다. 실제 배경은 관리자에서 업로드한다.

  // Create global settings
  const globalSettings = [
    { name: "PICTURE_WIDTH", value: "10", description: "인화 가로 크기(cm)" },
    { name: "PICTURE_HEIGHT", value: "15", description: "인화 세로 크기(cm)" },
    { name: "CAPTURE_MODES", value: "1x1,2x1,2x2", description: "지원 프레임" },
    { name: "THEME_TEXT_COLOR", value: "#ffffff", description: "테마 글자 색상 (서비스 화면)" },
    { name: "THEME_PRIMARY_COLOR", value: "#6c6fb4", description: "테마 강조(primary) 색상 — 선택 강조·주요 버튼" },
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
