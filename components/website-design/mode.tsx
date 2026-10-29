"use client";

/**
 * 👷 โหมดหน้าดีไซน์ของคนที่เปิดอยู่ — ทุกหัวข้อ (แบบเดิม) หรือ พนักงานแก้บางหัวข้อ (lib/website-access designAccess)
 *   limited = แก้ได้บางหัวข้อ → การ์ดระดับ "full" ซ่อน (ใช้ API ที่ต้องสิทธิ์เต็ม / เปลี่ยนหลายหัวข้อพร้อมกัน)
 *   simple  = แบบง่าย (ไม่มีสิทธิ์โชว์การตั้งค่าละเอียด) → การ์ดระดับ "advanced" + ปรับละเอียดทีละชิ้น (PartStyleFold) ซ่อน
 * นอกหน้าดีไซน์ = ค่าเริ่ม (ไม่ซ่อนอะไร) — ของกลางที่ยืมไปใช้ที่อื่นหน้าตาเหมือนเดิม
 */
import { createContext, useContext } from "react";
import { designCardLevel } from "@/lib/website-design-nav";

export interface DesignMode {
  limited: boolean;
  simple: boolean;
}
const FULL: DesignMode = { limited: false, simple: false };
export const DesignModeCtx = createContext<DesignMode>(FULL);
export const useDesignMode = () => useContext(DesignModeCtx);

/** การ์ดนี้ซ่อนในโหมดนี้ไหม (เทียบหัวการ์ดกับระดับในทะเบียน lib/website-design-nav) */
export function cardHiddenIn(mode: DesignMode, title: string): boolean {
  if (!mode.limited) return false;
  const lv = designCardLevel(title);
  return lv === "full" || (lv === "advanced" && mode.simple);
}
