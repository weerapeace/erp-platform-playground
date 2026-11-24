"use client";
/**
 * ThemePreviewBridge — ให้หน้าจริงที่เปิดอยู่ใน iframe ของตัวแก้ธีม (/admin/themes/[id]) แสดงสีตามร่างที่กำลังแก้
 *   ทำงานเฉพาะตอนอยู่ใน iframe + ข้อความมาจากโดเมนเดียวกัน · ไม่บันทึกอะไร (ปิดหน้า = หาย)
 *   ข้อความ: { type: "erp-theme-preview", vars: { "--tm-primary-500": "14 116 144", ... } } · vars=null = ล้าง
 * วางที่ app/layout.tsx (ไม่มี UI)
 */
import { useEffect } from "react";
import { themeCssVars, type ErpThemeConfig } from "@/lib/erp-theme-config";
import { themeEffects } from "@/lib/erp-theme-effects";

export const THEME_PREVIEW_MSG = "erp-theme-preview";

/** ข้อความพรีวิวที่ส่งเข้า iframe (ตัวแปรสี/ฟอนต์ + เอฟเฟกต์) · cfg=null = ล้างกลับหน้าตาเดิม */
export function themePreviewMessage(cfg: ErpThemeConfig | null, mobile = false) {
  if (!cfg) return { type: THEME_PREVIEW_MSG, vars: null, attrs: null };
  const fx = themeEffects(cfg, { mobile, motionOff: false });
  return { type: THEME_PREVIEW_MSG, vars: { ...themeCssVars(cfg), ...fx.vars }, attrs: fx.attrs };
}

export function ThemePreviewBridge() {
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; vars?: Record<string, string> | null; attrs?: Record<string, string> | null } | null;
      if (!d || d.type !== THEME_PREVIEW_MSG) return;
      const root = document.documentElement;
      root.dataset.themePreview = "1";   // บอก ThemeApplier ว่าหน้านี้อยู่ในพรีวิว อย่าทาทับ
      // ล้างธีมเดิมของหน้า (ทั้งที่ ThemeApplier ทาไว้ และพรีวิวรอบก่อน)
      for (const k of Array.from(root.style)) if (k.startsWith("--tm-")) root.style.removeProperty(k);
      for (const a of Array.from(root.attributes)) if (a.name.startsWith("data-tm-")) root.removeAttribute(a.name);
      for (const [k, v] of Object.entries(d.vars ?? {})) {
        if (k.startsWith("--tm-") && typeof v === "string") root.style.setProperty(k, v);
      }
      // เอฟเฟกต์ (ปุ่มไล่สี/แสงวิ่ง · แถบบน · เมนูข้าง — lib/erp-theme-effects) · ชั้นพื้นหลัง/แบนเนอร์/มาสคอตไม่มาในพรีวิวนี้
      for (const [k, v] of Object.entries(d.attrs ?? {})) {
        if (/^tm-[a-z-]+$/.test(k) && typeof v === "string") root.setAttribute(`data-${k}`, v);
      }
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: `${THEME_PREVIEW_MSG}-ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return null;
}
