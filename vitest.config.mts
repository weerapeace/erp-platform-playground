import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config สำหรับ ERP playground
 *
 * - resolve "@/" → root ของ playground (mirrors tsconfig.json paths)
 * - environment "node" — lib เหล่านี้ไม่ต้องการ jsdom
 * - .mts เพื่อให้ Vite load เป็น ESM ตรงๆ
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.{ts,tsx}", "**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    globals: false,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/__tests__/**", "lib/**/*.test.ts"],
      reporter: ["text", "html"],
    },
  },
});
