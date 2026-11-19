"use client";

/**
 * หน้าที่ "ไม่ได้อยู่ในเชลล์" (ไม่มี PlaygroundShell ครอบ) แต่เป็นเมนูของแอปเต็มจอ — ให้กว้างเต็มจอตามแอป
 * ใช้: const wide = useFullWidthAppAttr();  <div className="max-w-5xl mx-auto ..." {...wide}>
 *   แอปที่เปิดอยู่อยู่ในรายการ FULL_WIDTH_APPS (lib/active-app) → ได้ data-app-wide → CSS ใน app/globals.css ปลด max-w
 * หน้าที่อยู่ในเชลล์อยู่แล้วไม่ต้องเรียก (เชลล์ใส่ให้เอง)
 */
import { useEffect, useState } from "react";
import { initialActiveApp, isFullWidthApp } from "@/lib/active-app";

export function useFullWidthAppAttr(): Record<string, string> {
  const [wide, setWide] = useState(false);
  useEffect(() => { setWide(isFullWidthApp(initialActiveApp())); }, []);
  return wide ? { "data-app-wide": "" } : {};
}
