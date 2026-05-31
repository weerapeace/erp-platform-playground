import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ─────────────────────────────────────────────────────────
        // BRAND = ORANGE (เปลี่ยนจาก blue เดิม — 2026-05-31)
        // หมายเหตุ: override "blue" ของ Tailwind ทั้งระบบให้กลายเป็นส้ม
        //   เพื่อไม่ต้องไล่แก้ 377 จุดในโค้ด
        //   ถ้าอยากกลับเป็นน้ำเงิน — comment block นี้ออก
        // ─────────────────────────────────────────────────────────
        blue: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Thai", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
