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
