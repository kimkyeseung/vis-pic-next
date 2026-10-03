import sharp from "sharp";

/**
 * 프레임(인화 배경) 이미지는 가로(landscape) 디자인을 전제로 합성된다(세로 용지 모드에선 합성 시 다시 90° 회전).
 * 세로로 제작된 시안을 올리면 가운데만 가로로 잘려 쓰이므로, 업로드 시점에 시계방향 90°로 돌려 가로로 저장한다.
 * EXIF 회전값을 먼저 반영(autoOrient)한 실제 보이는 방향 기준으로 판단한다. 가로·정사각형이면 원본 그대로 반환.
 */
export async function normalizeFrameToLandscape(input: Buffer, ext: string): Promise<{ buffer: Buffer; rotated: boolean }> {
  const meta = await sharp(input).metadata();
  // EXIF orientation 5~8은 90°/270° 회전이라 보이는 가로·세로가 뒤바뀐다.
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = swapped ? meta.height : meta.width;
  const height = swapped ? meta.width : meta.height;
  if (!width || !height || height <= width) return { buffer: input, rotated: false };

  const pipeline = sharp(input).autoOrient().rotate(90);
  const buffer = ext === "png"
    ? await pipeline.png().toBuffer()
    : await pipeline.jpeg({ quality: 95 }).toBuffer();
  return { buffer, rotated: true };
}
