"use client";
/**
 * ปิด/เปิดแอนิเมชันของธีม (ต่อเครื่อง · เฟส 4 ข้อ 4) — ปุ่มในเมนูบัญชี
 *   เก็บใน localStorage · เครื่องที่ตั้ง "ลดการเคลื่อนไหว" (prefers-reduced-motion) = ปิดให้อัตโนมัติ
 *   เฟส 5 จะย้ายไปเป็นค่าส่วนตัวในบัญชี (ตามคนข้ามเครื่อง)
 */
import { useSyncExternalStore } from "react";

const KEY = "erp-theme-motion-off";
const EVT = "erp-theme-motion";

export function getUserMotionOff(): boolean {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setUserMotionOff(off: boolean) {
  try { if (off) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* ปิด storage = ข้าม */ }
  window.dispatchEvent(new Event(EVT));
}

function subscribe(fn: () => void) {
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  window.addEventListener(EVT, fn);
  window.addEventListener("storage", fn);
  mq?.addEventListener?.("change", fn);
  return () => { window.removeEventListener(EVT, fn); window.removeEventListener("storage", fn); mq?.removeEventListener?.("change", fn); };
}
const snap = () => (getUserMotionOff() ? "user" : window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "system" : "on");

/** "on" = เล่นได้ · "user" = ผู้ใช้ปิดเอง · "system" = เครื่องตั้งลดการเคลื่อนไหว */
export function useMotionPref(): "on" | "user" | "system" {
  return useSyncExternalStore(subscribe, snap, () => "on") as "on" | "user" | "system";
}

function subscribeMobile(fn: () => void) {
  const mq = window.matchMedia?.("(max-width: 767px)");
  mq?.addEventListener?.("change", fn);
  return () => mq?.removeEventListener?.("change", fn);
}
/** จอมือถือ (กว้าง < 768px) — ใช้เปิดโหมดเบา */
export function useIsMobileScreen(): boolean {
  return useSyncExternalStore(subscribeMobile, () => !!window.matchMedia?.("(max-width: 767px)").matches, () => false);
}
