import { test, expect } from "@playwright/test";

test.describe("Service page QR code flow", () => {
  test("full flow: start → frame → background → test photos → select → complete with QR codes", async ({
    page,
  }) => {
    await page.goto("/service/");

    // Step 1: Start — click anywhere to begin
    await page.locator("section").first().click();
    await expect(page.getByText("프레임을 선택해 주세요")).toBeVisible({
      timeout: 5000,
    });

    // Step 2: Frame selection — pick first frame option and proceed
    await page.locator(".frame-option").first().click();
    await page.getByText("다음으로").last().click();
    await expect(page.getByText("배경을 선택해 주세요")).toBeVisible({
      timeout: 5000,
    });

    // Step 3: Background selection — pick first option and proceed
    await page.locator(".background-option").first().click();
    await page.getByText("다음으로").last().click();

    // Step 4: Camera — expect camera error (headless has no camera)
    // Click "테스트 사진 추가" buttons to add enough photos
    await expect(page.getByText("테스트 사진 추가")).toBeVisible({
      timeout: 5000,
    });

    // Determine how many photos needed from the "촬영 (0/N)" text
    const shootingText = await page.getByText(/촬영 \(0\//).textContent();
    const match = shootingText?.match(/촬영 \(0\/(\d+)\)/);
    const minPhotos = match ? Math.min(parseInt(match[1]), 4) : 1;

    for (let i = 0; i < minPhotos; i++) {
      await page.getByText("테스트 사진 추가").click();
      await page.waitForTimeout(200);
    }

    // Proceed to selection
    await page.getByText("다음으로").last().click();
    await expect(
      page.getByText("인화할 사진을 선택해 주세요")
    ).toBeVisible({ timeout: 5000 });

    // Step 5: Select photos
    const thumbnails = page.locator(".photo-thumbnail");
    const thumbCount = await thumbnails.count();
    const selectCount = Math.min(thumbCount, minPhotos);
    for (let i = 0; i < selectCount; i++) {
      await thumbnails.nth(i).click();
    }
    await page.getByText("다음으로").last().click();

    // Step 6: Complete — should show composite image and QR codes
    await expect(
      page.getByText(/사진이 완성되었습니다|완료/)
    ).toBeVisible({ timeout: 15000 });

    // Wait for QR codes to appear (upload may take a few seconds)
    await expect(page.getByText("사진 다운로드")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("GIF 다운로드")).toBeVisible({
      timeout: 15000,
    });

    // Verify two QR code SVGs are rendered inside white QR boxes
    const qrCodes = page.locator(".bg-white svg");
    expect(await qrCodes.count()).toBeGreaterThanOrEqual(2);

    // Verify expiry badge is shown
    await expect(page.getByText("까지 다운로드 가능")).toBeVisible();

    // Verify buttons exist
    await expect(page.getByRole("button", { name: "인쇄하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: /💾 다운로드/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "처음으로 돌아가기" })).toBeVisible();
  });

  test("restart button goes back to start", async ({ page }) => {
    await page.goto("/service/");

    // Quick path to start
    await page.locator("section").first().click();
    await expect(page.getByText("프레임을 선택해 주세요")).toBeVisible({
      timeout: 5000,
    });

    // Go back to start via 이전으로
    await page
      .getByText("이전으로")
      .first()
      .click();
    await expect(page.getByText("화면을 터치해주세요")).toBeVisible({
      timeout: 5000,
    });
  });
});
