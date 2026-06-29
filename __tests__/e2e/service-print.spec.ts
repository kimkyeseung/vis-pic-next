import { test, expect } from "@playwright/test";

// Helper: navigate through the full service flow and land on CompleteSection.
// Playwright runs in a browser (no Tauri), so the browser print path is taken.
async function reachCompleteSection(page: import("@playwright/test").Page) {
  await page.goto("/service/");

  // Start
  await page.locator("section").first().click();
  await expect(page.getByText("프레임을 선택해 주세요")).toBeVisible({ timeout: 5000 });

  // Frame
  await page.locator(".frame-option").first().click();
  await page.getByText("다음으로").last().click();
  await expect(page.getByText("배경을 선택해 주세요")).toBeVisible({ timeout: 5000 });

  // Background
  await page.locator(".background-option").first().click();
  await page.getByText("다음으로").last().click();

  // Camera — add test photos
  await expect(page.getByText("테스트 사진 추가")).toBeVisible({ timeout: 5000 });
  const shootingText = await page.getByText(/촬영 \(0\//).textContent();
  const match = shootingText?.match(/촬영 \(0\/(\d+)\)/);
  const minPhotos = match ? Math.min(parseInt(match[1]), 4) : 1;
  for (let i = 0; i < minPhotos; i++) {
    await page.getByText("테스트 사진 추가").click();
    await page.waitForTimeout(200);
  }

  // Select photos
  await page.getByText("다음으로").last().click();
  await expect(page.getByText("인화할 사진을 선택해 주세요")).toBeVisible({ timeout: 5000 });
  const thumbnails = page.locator(".photo-thumbnail");
  const thumbCount = await thumbnails.count();
  for (let i = 0; i < Math.min(thumbCount, minPhotos); i++) {
    await thumbnails.nth(i).click();
  }
  await page.getByText("다음으로").last().click();

  // Complete
  await expect(page.getByText(/사진이 완성되었습니다|완료/)).toBeVisible({ timeout: 15000 });
}

test.describe("Print button — browser (non-Tauri) path", () => {
  test("clicking 인쇄하기 calls window.print and transitions to done", async ({ page }) => {
    // Intercept window.print so no real dialog opens
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).__print_called__ = false;
      window.print = () => {
        (window as unknown as Record<string, unknown>).__print_called__ = true;
      };
    });

    await reachCompleteSection(page);

    const printButton = page.getByRole("button", { name: /인쇄하기/ });
    await expect(printButton).toBeVisible();

    await printButton.click();

    // Status should advance to "done"
    await expect(page.getByText("인쇄가 완료되었습니다")).toBeVisible({ timeout: 5000 });

    // Print button replaced by restart button
    await expect(printButton).not.toBeVisible();
    await expect(page.getByRole("button", { name: "처음으로 돌아가기" })).toBeVisible();

    // window.print was actually invoked
    const called = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__print_called__
    );
    expect(called).toBe(true);
  });

  test("인쇄 완료 후 처음으로 돌아가기 버튼이 작동한다", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {};
    });

    await reachCompleteSection(page);
    await page.getByRole("button", { name: /인쇄하기/ }).click();
    await expect(page.getByText("인쇄가 완료되었습니다")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "처음으로 돌아가기" }).click();
    await expect(page.getByText("화면을 터치해주세요")).toBeVisible({ timeout: 5000 });
  });
});
