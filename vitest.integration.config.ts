import { defineConfig } from "vitest/config";
import path from "path";

/**
 * 통합 테스트 설정 — `__tests__/integration/**`.
 * 이 테스트들은 실제 API 엔드포인트를 http://localhost:3000 으로 호출하므로
 * **개발 서버가 떠 있어야** 통과한다 (`npm run dev` 후 `npm run test:integration`).
 * 순수 유닛 테스트(`npm test`)와 분리해 서버 없이도 유닛이 그린이도록 한다.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
