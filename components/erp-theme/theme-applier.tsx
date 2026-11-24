"use client";
/**
 * ThemeApplier (ธีมกลาง ERP เฟส 3) — ทาธีมของแอปที่เปิดอยู่ลงทั้งหน้า (ตัวแปร --tm-* ที่ <html>)
 *   ลำดับ: ธีมของแอป → ธีมบริษัท → ไม่มี (ล้างตัวแปร = หน้าตาเดิม)
 *   ทาที่ <html> (ไม่ใช่กล่องครอบ) เพื่อให้ป๊อปอัป/ลิ้นชักที่ลอยออกนอกกล่องได้สีเดียวกัน
 *   ตอนนี้ผลที่เห็น: สีหลัก/สีเน้น + ตัวอักษร (ขอบมน/ความแน่น/พื้นหลัง/แอนิเมชันมาเฟส 4–5)
 *   ไม่ทำอะไรถ้าหน้านี้อยู่ในพรีวิวของตัวแก้ธีม (ThemePreviewBridge ตั้ง data-theme-preview)
 * วางที่: components/playground-shell (ทั้งโหมดปกติ/embed) · app/app/[appKey] (แอปเดี่ยว)
 */
import { useEffect } from "react";
import { themeCssVars } from "@/lib/erp-theme-config";
import { themeForApp } from "@/lib/erp-theme-assign";
import { ensureThemeFont, useActiveThemes } from "./active-themes";

let applied: string[] = [];

export function ThemeApplier({ appKey }: { appKey: string | null | undefined }) {
  const active = useActiveThemes();
  const cfg = themeForApp(active, appKey ?? null);
  const sig = cfg ? JSON.stringify(cfg) : "";
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.themePreview === "1") return;
    applied.forEach((k) => root.style.removeProperty(k));
    applied = [];
    if (!cfg) { delete root.dataset.erpTheme; return; }
    ensureThemeFont(cfg.typography.font);
    for (const [k, v] of Object.entries(themeCssVars(cfg))) { root.style.setProperty(k, v); applied.push(k); }
    root.dataset.erpTheme = appKey && active?.apps[appKey] ? `app:${appKey}` : "company";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, appKey]);
  return null;
}
