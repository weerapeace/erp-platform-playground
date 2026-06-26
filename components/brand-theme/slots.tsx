"use client";

/**
 * BrandSlot — วางรูปตกแต่งตาม "slot" ที่ระบบกำหนด (ของกลาง)
 * - ตำแหน่ง/ขนาด/responsive มาจาก SLOT_REGISTRY (ไม่ freeform) → dashboard ไม่พัง
 * - รูปดึงผ่าน ?w= ตาม registry (ห้าม original) · lazy · pointer-events-none (ไม่บัง content)
 * - รูปโหลดไม่ได้ → ซ่อนเอง (fallback ปลอดภัย) · ไม่มี key/ซ่อนไว้ → ไม่ render
 *
 *   <div className="relative"> ... <BrandSlot theme={theme} id="page_br" /> </div>
 */
import { withImageWidth } from "@/lib/r2-image";
import { slotKey, slotStyle, SLOT_REGISTRY, type BrandTheme } from "@/lib/brand-theme";
import { useBrandThemeValue } from "@/components/brand-theme/context";

const DEF: Record<string, (typeof SLOT_REGISTRY)[number]> = Object.fromEntries(SLOT_REGISTRY.map((d) => [d.id, d]));

export function BrandSlot({ theme, id, w, size, className = "", alt = "", round = false }: {
  theme?: Partial<BrandTheme> | null;   // ไม่ส่ง = อ่านจาก context (<BrandThemed>/<BrandThemedShell>)
  id: string;
  w?: number;            // override ขนาด (?w=) — ปกติใช้จาก registry
  size?: string;         // override class ขนาดที่แสดง
  className?: string;
  alt?: string;
  round?: boolean;
}) {
  const ctxTheme = useBrandThemeValue();
  const t = theme ?? ctxTheme;
  const key = slotKey(t, id);
  if (!key) return null;
  const def = DEF[id];
  const width = w ?? def?.w ?? 96;
  const url = withImageWidth(`/api/r2-image?key=${encodeURIComponent(key)}`, width) ?? `/api/r2-image?key=${encodeURIComponent(key)}`;
  const cls = [def?.pos ?? "", size ?? def?.size ?? "", def?.hideOnMobile ? "hidden md:block" : "",
    round ? "rounded-full" : "", "object-contain pointer-events-none select-none z-10", className].filter(Boolean).join(" ");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" decoding="async" style={slotStyle(t, id)}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      className={cls} />
  );
}
