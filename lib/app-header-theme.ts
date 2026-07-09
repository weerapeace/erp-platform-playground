import type { CSSProperties } from "react";

/**
 * ธีมแถบบนของแอป (App shell header) — ของกลาง ใช้ทั้งหน้าตั้งค่า (/admin/menu) และ shell (/app/[key])
 * 3 โหมด: solid (สีเดียว) · gradient (ไล่สี 2 สี) · image (รูปพื้นหลัง + overlay มืดให้อ่านตัวอักษรออก)
 */
export type AppHeaderTheme = {
  theme_color?: string | null;
  theme_color2?: string | null;
  header_image?: string | null;
  header_style?: string | null;
};

export function appHeaderStyle(a: AppHeaderTheme): CSSProperties {
  const c1 = a.theme_color || "#1d4ed8";
  const c2 = a.theme_color2 || c1;
  const style = a.header_style || "gradient";
  if (style === "image" && a.header_image) {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,0.20), rgba(0,0,0,0.30)), url(/api/r2-image?key=${encodeURIComponent(a.header_image)}&w=1400)`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (style === "solid") return { backgroundColor: c1 };
  return { backgroundImage: `linear-gradient(to right, ${c1}, ${c2})` };
}
