/**
 * 기존 Image.device_id(스칼라) 값을 pic_image_device(ImageDevice) 조인 테이블로 이관한다.
 * - 스칼라 값이 Device.deviceId(코드)와 일치하면 그대로 연결한다.
 * - 코드가 아니라 Device.name(이름)과 일치하면 해당 디바이스 코드로 보정해 연결한다.
 *   (예: "강남점" → 코드 "test3")
 * - 어느 쪽과도 일치하지 않으면 건너뛰고 경고를 출력한다(수동 확인 필요).
 * - 이미 연결 행이 있으면 건너뛴다(idempotent). 스칼라가 null이면 전체 적용이므로 무시.
 *
 * 실행: npm run db:push 로 조인 테이블을 만든 뒤 `npx tsx prisma/backfill-image-devices.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const devices = await prisma.device.findMany({
    select: { deviceId: true, name: true },
  });
  const byCode = new Map(devices.map((d) => [d.deviceId, d.deviceId]));
  const byName = new Map(devices.map((d) => [d.name, d.deviceId]));

  const images = await prisma.image.findMany({
    where: { deviceId: { not: null } },
    include: { devices: { select: { deviceId: true } } },
  });

  let linked = 0;
  let skippedExisting = 0;
  const unresolved: { id: number; value: string }[] = [];

  for (const img of images) {
    const raw = img.deviceId as string;
    const targetCode = byCode.get(raw) ?? byName.get(raw);

    if (!targetCode) {
      unresolved.push({ id: img.id, value: raw });
      continue;
    }

    if (img.devices.some((d) => d.deviceId === targetCode)) {
      skippedExisting++;
      continue;
    }

    await prisma.imageDevice.create({
      data: { imageId: img.id, deviceId: targetCode },
    });
    linked++;
    if (raw !== targetCode) {
      console.log(`  보정 연결: image ${img.id} "${raw}"(이름) → "${targetCode}"(코드)`);
    } else {
      console.log(`  연결: image ${img.id} → "${targetCode}"`);
    }
  }

  console.log(`\n완료 — 신규 연결 ${linked}건, 기존 유지 ${skippedExisting}건`);
  if (unresolved.length > 0) {
    console.log(`\n⚠ 매칭 실패(수동 확인 필요) ${unresolved.length}건:`);
    for (const u of unresolved) {
      console.log(`  image ${u.id}: device_id="${u.value}" — 코드/이름과 일치하는 디바이스 없음`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
