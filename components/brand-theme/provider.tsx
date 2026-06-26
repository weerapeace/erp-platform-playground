"use client";

/**
 * Brand Theme Provider — ของกลางสำหรับ "ทาธีมแบรนด์ให้ทั้งหน้า" ใน 1-2 บรรทัด
 *
 * วิธีใช้ (หน้าใด ๆ ก็ได้):
 *   <BrandThemed brandId={brandId}>
 *     ...เนื้อหาหน้า... (วาง <BrandSlot id="..."/> ได้เลย ไม่ต้องส่ง theme)
 *   </BrandThemed>
 *
 * หรือคุมเองเป็นขั้น ๆ:
 *   const theme = useBrandTheme(brandId, reloadKey);
 *   <BrandThemedShell theme={theme}> ... </BrandThemedShell>
 *
 * Shell จะ: ทาพื้นหลัง/ตัวแปร --brand-*, ใส่ <BrandThemeStyles/>, วางรูปตกแต่งมุมหน้า (page_*),
 * และ provide ธีมผ่าน context ให้ <BrandSlot> ลูก ๆ อ่านได้โดยไม่ต้องส่ง prop
 */
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { resolveTheme, brandRootStyle, DEFAULT_THEME, type BrandTheme } from "@/lib/brand-theme";
import { BrandThemeContext, useBrandThemeValue } from "@/components/brand-theme/context";
import { BrandThemeStyles } from "@/components/brand-theme/styles";
import { BrandSlot } from "@/components/brand-theme/slots";

export { useBrandThemeValue };

// โหลดธีม "ที่เผยแพร่" ของแบรนด์ (ไม่มี brandId / ยังไม่มีธีม = ERP default) · bump reloadKey เพื่อโหลดใหม่
export function useBrandTheme(brandId: string | null | undefined, reloadKey?: number): BrandTheme {
  const [theme, setTheme] = useState<BrandTheme>(DEFAULT_THEME);
  useEffect(() => {
    if (!brandId) { setTheme(DEFAULT_THEME); return; }
    let alive = true;
    apiFetch(`/api/brand-themes/${brandId}`).then((r) => r.json())
      .then((j) => { if (alive) setTheme(resolveTheme(j.published)); })
      .catch(() => { if (alive) setTheme(DEFAULT_THEME); });
    return () => { alive = false; };
  }, [brandId, reloadKey]);
  return theme;
}

// เปลือกหน้าที่ทาธีม + เลเยอร์ตกแต่งมุมหน้า + provide context (รับ theme ตรง ๆ)
export function BrandThemedShell({ theme, className = "", children }: {
  theme: BrandTheme; className?: string; children: ReactNode;
}) {
  return (
    <BrandThemeContext.Provider value={theme}>
      <div className={`brand-themed relative min-h-screen overflow-hidden ${className}`.trim()} style={brandRootStyle(theme)}>
        <BrandThemeStyles />
        {/* เลเยอร์ตกแต่งมุมหน้า (หลัง content · ไม่บังคลิก · ซ่อนบนมือถือ) */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <BrandSlot theme={theme} id="page_tl" />
          <BrandSlot theme={theme} id="page_tr" />
          <BrandSlot theme={theme} id="page_bl" />
          <BrandSlot theme={theme} id="page_br" />
        </div>
        <div className="relative z-10">{children}</div>
      </div>
    </BrandThemeContext.Provider>
  );
}

// convenience: โหลด + ทาธีม ในคอมโพเนนต์เดียว
export function BrandThemed({ brandId, reloadKey, className, children }: {
  brandId: string | null | undefined; reloadKey?: number; className?: string; children: ReactNode;
}) {
  const theme = useBrandTheme(brandId, reloadKey);
  return <BrandThemedShell theme={theme} className={className}>{children}</BrandThemedShell>;
}
