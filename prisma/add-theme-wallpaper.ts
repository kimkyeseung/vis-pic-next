import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 테마관리 기능에 필요한 최소 데이터만 추가하는 멱등 스크립트.
// 전체 seed와 달리 admin 계정·test 장치 등을 만들지 않으므로 운영 DB에 안전하게 실행할 수 있다.
//   npx tsx prisma/add-theme-wallpaper.ts
//   (npm 스크립트로도 등록: npm run db:add-theme)
// 1) 배경화면(wallpaper) 이미지 타입 id=5 — 없으면 생성 (id 4는 구 print_background 잔재라 회피)
// 2) THEME_TEXT_COLOR 전역 설정 — 없을 때만 기본값(#ffffff) 생성 (기존 관리자 설정은 덮어쓰지 않음)
async function main() {
  const wallpaperType = await prisma.imageType.upsert({
    where: { id: 5 },
    update: {},
    create: { id: 5, name: "wallpaper" },
  });
  console.log(`ImageType(id=5) ready: ${wallpaperType.name}`);

  const existing = await prisma.setting.findUnique({ where: { name: "THEME_TEXT_COLOR" } });
  if (existing) {
    console.log(`THEME_TEXT_COLOR already set: ${existing.value} (unchanged)`);
  } else {
    await prisma.setting.create({
      data: { name: "THEME_TEXT_COLOR", value: "#ffffff", description: "테마 글자 색상 (서비스 화면)" },
    });
    console.log("THEME_TEXT_COLOR created: #ffffff");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
