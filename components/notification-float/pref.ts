"use client";
/** ค่าตั้ง "การ์ดแจ้งเตือนลอย" ต่อคน (user_ui_prefs key notify_float ผ่าน useUserPref · ตามไปทุกเครื่อง) */
import { useUserPref } from "@/lib/use-user-pref";

export type NotifyFloatPosition = "br" | "tr";
export type NotifyFloatPref = { enabled: boolean; minimized: boolean; position: NotifyFloatPosition };

export const NOTIFY_FLOAT_KEY = "notify_float";
/** ค่าตั้งต้น: เปิด · กางอยู่ · มุมขวาล่าง (เจ้าของอยากให้ทุกคนเห็น — ซ่อนเองได้ที่เมนูโปรไฟล์) */
export const NOTIFY_FLOAT_DEFAULT: NotifyFloatPref = { enabled: true, minimized: false, position: "br" };

export function parseNotifyFloatPref(raw: unknown): NotifyFloatPref | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<NotifyFloatPref>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : NOTIFY_FLOAT_DEFAULT.enabled,
    minimized: typeof r.minimized === "boolean" ? r.minimized : NOTIFY_FLOAT_DEFAULT.minimized,
    position: r.position === "tr" ? "tr" : "br",
  };
}

export function useNotifyFloatPref() {
  return useUserPref<NotifyFloatPref>(NOTIFY_FLOAT_KEY, NOTIFY_FLOAT_DEFAULT, parseNotifyFloatPref);
}
