import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 테마관리 기능에 필요한 최소 데이터만 추가하는 멱등 스크립트.
// 전체 seed와 달리 admin 계정·test 장치 등을 만들지 않으므로 운영 DB에 안전하게 실행할 수 있다.
//   npx tsx prisma/add-theme-wallpaper.ts
//   (npm 스크립트: npm run db:add-theme)
// 이미지 타입: 5=배경화면(wallpaper), 6=로고(logo) — 없으면 생성 (id 4는 구 print_background 잔재라 회피)
// 전역 설정: THEME_TEXT_COLOR(#ffffff), THEME_PRIMARY_COLOR(#6c6fb4) — 없을 때만 기본값 생성
//            (기존 관리자 설정값은 덮어쓰지 않음)
async function main() {
  const imageTypes = [
    { id: 5, name: "wallpaper" },
    { id: 6, name: "logo" },
  ];
  for (const t of imageTypes) {
    const row = await prisma.imageType.upsert({ where: { id: t.id }, update: {}, create: t });
    console.log(`ImageType(id=${row.id}) ready: ${row.name}`);
  }

  const settings = [
    { name: "THEME_TEXT_COLOR", value: "#ffffff", description: "테마 글자 색상 (서비스 화면)" },
    { name: "THEME_PRIMARY_COLOR", value: "#6c6fb4", description: "테마 강조(primary) 색상 — 선택 강조·주요 버튼" },
  ];
  for (const s of settings) {
    const existing = await prisma.setting.findUnique({ where: { name: s.name } });
    if (existing) {
      console.log(`${s.name} already set: ${existing.value} (unchanged)`);
    } else {
      await prisma.setting.create({ data: s });
      console.log(`${s.name} created: ${s.value}`);
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
