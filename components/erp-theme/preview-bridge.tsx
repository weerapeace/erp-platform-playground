"use client";
/**
 * ThemePreviewBridge — ให้หน้าจริงที่เปิดอยู่ใน iframe ของตัวแก้ธีม (/admin/themes/[id]) แสดงสีตามร่างที่กำลังแก้
 *   ทำงานเฉพาะตอนอยู่ใน iframe + ข้อความมาจากโดเมนเดียวกัน · ไม่บันทึกอะไร (ปิดหน้า = หาย)
 *   ข้อความ: { type: "erp-theme-preview", vars: { "--tm-primary-500": "14 116 144", ... } } · vars=null = ล้าง
 * วางที่ app/layout.tsx (ไม่มี UI)
 */
import { useEffect } from "react";

export const THEME_PREVIEW_MSG = "erp-theme-preview";

export function ThemePreviewBridge() {
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top) return;
    let applied: string[] = [];
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; vars?: Record<string, string> | null } | null;
      if (!d || d.type !== THEME_PREVIEW_MSG) return;
      const root = document.documentElement;
      root.dataset.themePreview = "1";   // บอก ThemeApplier ว่าหน้านี้อยู่ในพรีวิว อย่าทาทับ
      applied.forEach((k) => root.style.removeProperty(k));
      applied = [];
      if (!d.vars) return;
      for (const [k, v] of Object.entries(d.vars)) {
        if (!k.startsWith("--tm-") || typeof v !== "string") continue;
        root.style.setProperty(k, v);
        applied.push(k);
      }
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: `${THEME_PREVIEW_MSG}-ready` }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return null;
}
