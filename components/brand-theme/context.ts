"use client";

/**
 * BrandThemeContext — ส่งธีมแบรนด์ลงไปให้ลูก ๆ โดยไม่ต้อง prop-drill (ของกลาง)
 * แยกไฟล์ (ไม่มี JSX) เพื่อกัน import วนระหว่าง provider ↔ slots
 */
import { createContext, useContext } from "react";
import { DEFAULT_THEME, type BrandTheme } from "@/lib/brand-theme";

export const BrandThemeContext = createContext<BrandTheme>(DEFAULT_THEME);
export const useBrandThemeValue = (): BrandTheme => useContext(BrandThemeContext);
