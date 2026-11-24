import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import {
  ORANGE_SCALE,
  VIOLET_SCALE,
  fixedScale,
  tailwindScaleFor,
  themeVars,
} from "./lib/erp-theme";

// ─────────────────────────────────────────────────────────
// ธีมกลาง ERP (lib/erp-theme · docs/erp-theme.md)
//   blue-* / brand-* = สีหลัก (primary) · violet-* = สีเน้นรอง (accent)
//   ไม่ใช่สีตายตัวแล้ว — อ่านจากตัวแปร --tm-* (ค่าเริ่ม = ส้ม/ม่วงเดิมเป๊ะ)
//   → ธีมของโมดูล/ผู้ใช้ เปลี่ยนสีได้โดยไม่ต้องแก้คลาสในหน้า
//   (เดิม 2026-05-31 เขียนทับ blue เป็นส้มตายตัวเพื่อไม่ต้องไล่แก้หลายร้อยจุด)
//   status-blue-* / status-violet-* = ชุดล็อกสำหรับสีสถานะ ไม่ตามธีม
// ─────────────────────────────────────────────────────────
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // สีสถานะชุดล็อกอยู่ใน lib/ (ไม่อยู่ใน content) → สั่งสร้างคลาสไว้เลย
  safelist: [{ pattern: /^(bg|text|border|ring)-status-(blue|violet)-(50|100|200|300|400|500|600|700|800|900|950)$/ }],
  theme: {
    extend: {
      colors: {
        blue: tailwindScaleFor("primary"),
        brand: tailwindScaleFor("primary"),
        violet: tailwindScaleFor("accent"),
        status: {
          blue: fixedScale(ORANGE_SCALE), // = หน้าตาป้ายสถานะ "blue" เดิม (ซึ่งเป็นส้มตั้งแต่ 2026-05-31)
          violet: fixedScale(VIOLET_SCALE),
        },
      },
      // วงแหวนโฟกัสเริ่มต้น (คลาส ring เปล่า) — เดิม = blue-500 โปร่ง 50% · ต้องระบุเองเพราะ blue เป็นตัวแปรแล้ว
      ringColor: { DEFAULT: "rgb(var(--tm-primary-500) / 0.5)" },
      fontFamily: {
        sans: ["Inter", "Noto Sans Thai", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [
    // ค่าเริ่มของตัวแปรธีมที่ :root (ธีมของโมดูลจะทับในกล่องครอบ — เฟส 3)
    plugin(({ addBase }) => {
      addBase({ ":root": themeVars() });
    }),
  ],
};

export default config;
