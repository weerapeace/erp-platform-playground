"use client";

/**
 * PlatformIcon (ของกลาง) — ไอคอนแพลตฟอร์มที่ถูกต้องทุกที่
 *   icon_key เป็น "path รูปที่อัปโหลด" (เช่น platform-icons/xxx.jpg) → แสดงเป็น <img>
 *   icon_key เป็น "emoji"                                        → แสดง emoji นั้น
 *   ไม่มี icon_key                                               → emoji ตาม code (fallback)
 *
 * แก้บั๊ก: หลายหน้าเคยเขียน {icon_key || EMOJI[code]} ตรง ๆ → ถ้า icon_key เป็น path
 *          จะโชว์เป็น "ข้อความ path" แทนรูป. ใช้ตัวนี้แทนทุกที่.
 * สำหรับ <option> ที่ใส่ <img> ไม่ได้ ให้ใช้ platformGlyph() (คืน emoji เท่านั้น ไม่คืน path)
 */
import { r2ImageUrl } from "@/lib/r2-image";

const PLATFORM_EMOJI: Record<string, string> = {
  shopee: "🛍️", lazada: "🛒", tiktok: "🎵", tiktok_shop: "🎵", website: "🌐",
  instagram: "📸", facebook: "👍", line_oa: "💬", line_shopping: "💚",
  youtube: "▶️", pinterest: "📌", x: "✖️",
};

/** icon_key เป็น path รูปไหม (มี / หรือ ลงท้ายด้วยนามสกุลรูป) */
function looksLikePath(v: string): boolean {
  return v.includes("/") || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(v);
}

/** emoji ของแพลตฟอร์ม (fallback ตาม code) */
export function platformEmoji(code?: string | null): string {
  return (code && PLATFORM_EMOJI[code]) || "🏬";
}

/** สำหรับที่ใส่ <img> ไม่ได้ (เช่น <option>) — คืน "emoji" เสมอ ไม่คืน path */
export function platformGlyph(code?: string | null, iconKey?: string | null): string {
  if (iconKey && !looksLikePath(iconKey)) return iconKey; // icon_key เป็น emoji
  return platformEmoji(code);
}

export function PlatformIcon({
  code, iconKey, size = 18, className = "",
}: { code?: string | null; iconKey?: string | null; size?: number; className?: string }) {
  if (iconKey && looksLikePath(iconKey)) {
    const src = r2ImageUrl(iconKey, size * 2); // ×2 เผื่อจอความละเอียดสูง
    return (
      <img src={src ?? ""} alt="" width={size} height={size}
        className={`inline-block rounded-sm object-contain align-[-0.15em] ${className}`}
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className={`inline-block leading-none ${className}`} style={{ fontSize: size * 0.9 }}>
      {platformGlyph(code, iconKey)}
    </span>
  );
}

// ---- สีประจำแพลตฟอร์ม ----
// ค่าจริงตั้งที่หน้าแพลตฟอร์ม (erp_platforms.color) — ตารางนี้เป็นค่าสำรองตอนยังไม่ได้โหลด/ยังไม่ได้ตั้ง (ตรงกับค่าในฐานข้อมูล ณ 2026-11-01)
const PLATFORM_COLOR_FALLBACK: Record<string, string> = {
  shopee: "#ee4d2d", lazada: "#1a4f9c", tiktok: "#111827", tiktok_shop: "#111827", website: "#475569",
  instagram: "#e1306c", facebook: "#1877f2", line_oa: "#06c755", line_shopping: "#06c755",
  youtube: "#ff0000", pinterest: "#e60023", x: "#111827",
};

/** สีของแพลตฟอร์ม: สีที่ตั้งไว้ในฐานข้อมูลก่อน → ค่าสำรองตาม code → เทา */
export function platformColor(code?: string | null, color?: string | null): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  return (code && PLATFORM_COLOR_FALLBACK[code]) || "#64748b";
}

/**
 * PlatformBadge (ของกลาง) — ป้ายแพลตฟอร์มมีสี + โลโก้ + ชื่อ
 * ส่ง color/iconKey จาก erp_platforms ถ้ามี (แก้สี/โลโก้ที่หน้าแพลตฟอร์มที่เดียว) · ไม่ส่ง = ใช้ค่าสำรองตาม code
 * active=false → ป้ายจาง (ใช้เป็นชิปกรองที่ยังไม่ได้เลือก)
 */
export function PlatformBadge({
  code, name, color, iconKey, count, active = true, size = "sm", className = "",
}: {
  code?: string | null; name?: string | null; color?: string | null; iconKey?: string | null;
  /** ตัวเลขต่อท้าย (เช่น จำนวนรายการ) */
  count?: number | null;
  active?: boolean;
  size?: "xs" | "sm";
  className?: string;
}) {
  const c = platformColor(code, color);
  const label = name || (code ? code.charAt(0).toUpperCase() + code.slice(1) : "—");
  const pad = size === "xs" ? "px-1.5 py-px text-[11px] gap-1" : "px-2 py-0.5 text-xs gap-1.5";
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-medium ${pad} ${className}`}
      style={active
        ? { color: c, backgroundColor: `${c}14`, borderColor: `${c}40` }
        : { color: "#64748b", backgroundColor: "#ffffff", borderColor: "#e2e8f0" }}>
      <PlatformIcon code={code} iconKey={iconKey} size={size === "xs" ? 12 : 14} />
      {label}
      {count != null && <span className="tabular-nums opacity-70">{count.toLocaleString()}</span>}
    </span>
  );
}
