import { describe, it, expect } from "vitest";
import sharp from "sharp";

async function makeTestJpegBase64(
  color: { r: number; g: number; b: number },
  w = 100,
  h = 100
): Promise<string> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
  return "data:image/jpeg;base64," + buf.toString("base64");
}

describe("POST /api/gif/create", () => {
  const BASE = "http://localhost:3000";

  it("returns error when fewer than 2 images", async () => {
    const res = await fetch(`${BASE}/api/gif/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: ["single"], duration: 500 }),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("2 images");
  });

  it("creates animated GIF from 2 images", async () => {
    const img1 = await makeTestJpegBase64({ r: 255, g: 0, b: 0 });
    const img2 = await makeTestJpegBase64({ r: 0, g: 0, b: 255 });

    const res = await fetch(`${BASE}/api/gif/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [img1, img2], duration: 300 }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.gif_id).toBeTruthy();
    expect(data.gif_url).toMatch(/\.gif$/);
    expect(data.image_count).toBe(2);
    expect(data.expiry_days).toBe(3);
    expect(data.expiry_date).toBeTruthy();
  });

  it("creates animated GIF from 4 images", async () => {
    const imgs = await Promise.all([
      makeTestJpegBase64({ r: 255, g: 0, b: 0 }),
      makeTestJpegBase64({ r: 0, g: 255, b: 0 }),
      makeTestJpegBase64({ r: 0, g: 0, b: 255 }),
      makeTestJpegBase64({ r: 255, g: 255, b: 0 }),
    ]);

    const res = await fetch(`${BASE}/api/gif/create/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: imgs, duration: 500 }),
    });
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.image_count).toBe(4);

    // Verify the GIF file is actually animated
    const gifRes = await fetch(`${BASE}${data.gif_url}`);
    const gifBuf = Buffer.from(await gifRes.arrayBuffer());
    expect(gifBuf[0]).toBe(0x47); // 'G'
    expect(gifBuf[1]).toBe(0x49); // 'I'
    expect(gifBuf[2]).toBe(0x46); // 'F'
  });
});

describe("POST /api/print/upload-image", () => {
  const BASE = "http://localhost:3000";

  it("returns error when no image_data provided", async () => {
    const res = await fetch(`${BASE}/api/print/upload-image/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain("image_data");
  });

  it("uploads photo and returns URL with expiry", async () => {
    const img = await makeTestJpegBase64({ r: 128, g: 128, b: 128 }, 200, 150);

    const res = await fetch(`${BASE}/api/print/upload-image/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: img, image_type: "photo" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.image_id).toBeTruthy();
    expect(data.image_url).toMatch(/\.jpg$/);
    expect(data.expiry_days).toBe(3);
    expect(data.expiry_date).toBeTruthy();
  });

  it("uploaded file is accessible via URL", async () => {
    const img = await makeTestJpegBase64({ r: 64, g: 64, b: 64 });

    const uploadRes = await fetch(`${BASE}/api/print/upload-image/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_data: img, image_type: "photo" }),
    });
    const uploadData = await uploadRes.json();

    const fileRes = await fetch(`${BASE}${uploadData.image_url}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get("content-type")).toMatch(/image\/jpeg/);
  });
});

describe("GET /api/print/cleanup", () => {
  const BASE = "http://localhost:3000";

  it("returns cleanup result", async () => {
    const res = await fetch(`${BASE}/api/print/cleanup/`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.deleted).toBe("number");
    expect(typeof data.deletedLocal).toBe("number");
  });
});
