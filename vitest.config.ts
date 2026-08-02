import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // 전체 src를 분모로 잡아 실제(테스트 안 된 UI/API 포함) 현황을 정직하게 보여준다.
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/types/**",
        "src/**/layout.tsx",
        "src/**/page.tsx", // 페이지/라우트 셸은 E2E(playwright) 담당
      ],
      reporter: ["text-summary", "html", "json-summary"],
      reportOnFailure: true,
      // 회귀 방지 바닥값(ratchet). 현재 수치보다 살짝 아래로 잡아 지금은 통과,
      // 커버리지가 떨어지면 실패. 유닛이 실제로 겨냥하는 src/lib은 별도로 더 높게 강제.
      thresholds: {
        lines: 2,
        functions: 2,
        branches: 1.5,
        statements: 2,
        "src/lib/**": {
          lines: 28,
          functions: 38,
          branches: 33,
          statements: 28,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
