import { test, expect, type Page } from "@playwright/test";

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 세션 초기화 후 /service 로 이동 */
async function gotoFresh(page: Page) {
  await page.goto("/service/?device=test");
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.reload();
}

/** 페이지 레벨 CircularTimer SVG 원형 테두리 */
const timerCircle = (page: Page) =>
  page.locator('[data-testid="page-idle-timer"] svg circle[stroke-dasharray]');

/** 페이지 레벨 CircularTimer 숫자 텍스트 */
const timerNumber = (page: Page) =>
  page.locator('[data-testid="page-idle-timer"] span');

/** 시작 화면 → 프레임 선택 단계로 진입 */
async function goToFrame(page: Page) {
  await page.locator("section").first().click();
  await expect(page.getByText("프레임을 선택해 주세요")).toBeVisible({ timeout: 5000 });
}

/** 프레임 → 배경 단계 */
async function goToBackground(page: Page) {
  await page.locator(".frame-option").first().click();
  await page.getByText("다음으로").last().click();
  await expect(page.getByText("배경을 선택해 주세요")).toBeVisible({ timeout: 5000 });
}

/** 배경 → 카메라 단계 */
async function goToCamera(page: Page) {
  await page.locator(".background-option").first().click();
  await page.getByText("다음으로").last().click();
  await expect(page.getByText("테스트 사진 추가")).toBeVisible({ timeout: 5000 });
}

/** 카메라에서 테스트 사진 추가 후 선택 단계로 */
async function goToSelect(page: Page) {
  const shootingText = await page.getByText(/촬영 \(0\//).textContent();
  const match = shootingText?.match(/촬영 \(0\/(\d+)\)/);
  const count = match ? Math.min(parseInt(match[1]), 4) : 1;
  for (let i = 0; i < count; i++) {
    await page.getByText("테스트 사진 추가").click({ force: true });
    await page.waitForTimeout(500);
  }
  // CSS pointerEvents:none 이 있어도 React onClick 을 직접 트리거
  await page.evaluate(() => {
    const buttons = document.querySelectorAll("button.nav-button");
    const last = buttons[buttons.length - 1] as HTMLButtonElement;
    last?.click();
  });
  await expect(page.getByText("인화할 사진을 선택해 주세요")).toBeVisible({ timeout: 5000 });
}

// ─── CircularTimer 가시성 테스트 ──────────────────────────────────────────────

test.describe("CircularTimer 가시성", () => {
  test("시작 화면에서는 타이머가 표시되지 않는다", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByText("화면을 터치해주세요")).toBeVisible({ timeout: 5000 });
    await expect(timerCircle(page)).not.toBeVisible();
  });

  test("프레임 선택 단계에서 타이머가 표시된다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);
    await expect(timerCircle(page)).toBeVisible({ timeout: 3000 });
    const num = await timerNumber(page).textContent();
    expect(Number(num)).toBeGreaterThan(0);
  });

  test("배경 선택 단계에서 타이머가 표시된다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);
    await goToBackground(page);
    await expect(timerCircle(page)).toBeVisible({ timeout: 3000 });
  });

  test("카메라 단계에서는 타이머가 표시되지 않는다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);
    await goToBackground(page);
    await goToCamera(page);
    await expect(timerCircle(page)).not.toBeVisible();
  });

  test("사진 선택 단계에서 타이머가 표시된다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);
    await goToBackground(page);
    await goToCamera(page);
    await goToSelect(page);
    await expect(timerCircle(page)).toBeVisible({ timeout: 3000 });
  });
});

// ─── 타이머 동작 테스트 ────────────────────────────────────────────────────────

test.describe("타이머 동작", () => {
  test("프레임 선택 시 클릭해도 타이머가 초기화되지 않는다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);

    // 타이머 초기값 확인
    await expect(timerCircle(page)).toBeVisible({ timeout: 3000 });
    const before = Number(await timerNumber(page).textContent());
    expect(before).toBeGreaterThan(0);

    // 3초 대기 후 프레임 클릭
    await page.waitForTimeout(3000);
    await page.locator(".frame-option").first().click();

    // 클릭 후 타이머 값이 before보다 줄었어야 함 (초기화됐다면 다시 최댓값)
    const after = Number(await timerNumber(page).textContent());
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  test("단계 이동 시 타이머가 리셋된다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);

    // 2초 대기
    await page.waitForTimeout(2000);
    const frameTimer = Number(await timerNumber(page).textContent());

    // 배경 단계로 이동
    await page.locator(".frame-option").first().click();
    await page.getByText("다음으로").last().click();
    await expect(page.getByText("배경을 선택해 주세요")).toBeVisible({ timeout: 5000 });

    // 배경 단계에서 타이머가 프레임보다 크거나 같음 (새로 시작)
    await page.waitForTimeout(500);
    const bgTimer = Number(await timerNumber(page).textContent());
    expect(bgTimer).toBeGreaterThan(frameTimer);
  });

  test("타이머 SVG의 stroke-dashoffset이 줄어든다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);

    await expect(timerCircle(page)).toBeVisible({ timeout: 3000 });

    const offsetBefore = await timerCircle(page).evaluate((el) =>
      parseFloat((el as SVGCircleElement).getAttribute("stroke-dashoffset") || "0")
    );

    await page.waitForTimeout(2000);

    const offsetAfter = await timerCircle(page).evaluate((el) =>
      parseFloat((el as SVGCircleElement).getAttribute("stroke-dashoffset") || "0")
    );

    // offset이 증가해야 함 (테두리가 줄어드는 방향)
    expect(offsetAfter).toBeGreaterThan(offsetBefore);
  });
});

// ─── 전체 서비스 플로우 테스트 ────────────────────────────────────────────────

test.describe("전체 서비스 플로우", () => {
  test("start → frame → background → camera → select → complete 순서로 이동한다", async ({ page }) => {
    await gotoFresh(page);

    // Start
    await expect(page.getByText("화면을 터치해주세요")).toBeVisible({ timeout: 5000 });
    await page.locator("section").first().click();

    // Frame
    await expect(page.getByText("프레임을 선택해 주세요")).toBeVisible({ timeout: 5000 });
    await page.locator(".frame-option").first().click();
    await page.getByText("다음으로").last().click();

    // Background
    await expect(page.getByText("배경을 선택해 주세요")).toBeVisible({ timeout: 5000 });
    await page.locator(".background-option").first().click();
    await page.getByText("다음으로").last().click();

    // Camera
    await expect(page.getByText("테스트 사진 추가")).toBeVisible({ timeout: 5000 });
    const shootingText = await page.getByText(/촬영 \(0\//).textContent();
    const match = shootingText?.match(/촬영 \(0\/(\d+)\)/);
    const count = match ? Math.min(parseInt(match[1]), 4) : 1;
    for (let i = 0; i < count; i++) {
      await page.getByText("테스트 사진 추가").click({ force: true });
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => {
      const buttons = document.querySelectorAll("button.nav-button");
      const last = buttons[buttons.length - 1] as HTMLButtonElement;
      last?.click();
    });

    // Select
    await expect(page.getByText("인화할 사진을 선택해 주세요")).toBeVisible({ timeout: 5000 });
    const thumbnails = page.locator(".photo-thumbnail");
    const thumbCount = await thumbnails.count();
    for (let i = 0; i < Math.min(thumbCount, count); i++) {
      await thumbnails.nth(i).click({ force: true });
    }
    await page.getByText("다음으로").last().click({ force: true });

    // Complete — 인화할 사진을 선택 화면이 사라지면 complete 단계 진입 확인
    await expect(page.getByText("인화할 사진을 선택해 주세요")).not.toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/사진이 완성되었습니다|완료|처음으로/)).toBeVisible({ timeout: 30000 });
  });

  test("이전으로 버튼이 이전 단계로 돌아간다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);

    // 배경으로 이동 후 이전으로
    await page.locator(".frame-option").first().click();
    await page.getByText("다음으로").last().click();
    await expect(page.getByText("배경을 선택해 주세요")).toBeVisible({ timeout: 5000 });

    await page.getByText("이전으로").click();
    await expect(page.getByText("프레임을 선택해 주세요")).toBeVisible({ timeout: 5000 });
  });

  test("세션이 저장되고 페이지 새로고침 후 복원된다", async ({ page }) => {
    await gotoFresh(page);
    await goToFrame(page);
    await goToBackground(page);

    // 새로고침
    await page.reload();

    // 배경 선택 단계로 복원
    await expect(page.getByText("배경을 선택해 주세요")).toBeVisible({ timeout: 5000 });
  });
});
