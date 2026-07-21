import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 구 print_background(imageType=4)를 프레임(imageType=2)으로 통합한다.
// 1) type 4 이미지를 모두 type 2로 이전 (focalX/Y 등 나머지 필드는 그대로 유지)
// 2) 더 이상 참조가 없어진 print_background 타입 row(id=4) 삭제
//    (Image.imageType FK가 onDelete: NoAction 이라 이미지 이전 후에만 삭제 가능)
async function main() {
  const moved = await prisma.image.updateMany({
    where: { imageType: 4 },
    data: { imageType: 2 },
  });
  console.log(`Moved ${moved.count} image(s): print_background(4) -> frame(2)`);

  const deleted = await prisma.imageType.deleteMany({ where: { id: 4 } });
  console.log(`Deleted ${deleted.count} print_background ImageType row(id=4)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
