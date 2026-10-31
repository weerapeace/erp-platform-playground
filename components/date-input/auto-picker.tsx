"use client";

/**
 * 📅 กดที่ช่องวันที่ตรงไหนก็ได้ → ปฏิทินเด้งขึ้นเลย (ของกลาง · ติดตั้งครั้งเดียวที่ app/layout.tsx)
 *
 * ปัญหาเดิม: <input type="date"> บนคอม กดที่ตัวหนังสือแล้วแค่เลือกช่อง วว/ดด/ปปปป — ต้องกดไอคอนปฏิทินเล็ก ๆ ทางขวาเท่านั้น
 * ตอนนี้: คลิกช่องวันที่ (date / datetime-local / month) ที่ไหนก็เปิดปฏิทินของเบราว์เซอร์ (showPicker) — ยังพิมพ์เลขเองได้เหมือนเดิม
 * ใช้เฉพาะเมาส์ (มือถือแตะแล้วเปิดเองอยู่แล้ว) · ช่องที่ปิด/อ่านอย่างเดียวไม่ยุ่ง · ไม่อยากให้เด้ง = ใส่ data-no-autopicker ที่ช่องนั้น
 * เจ้าของขอ 2026-10-31 (รูปช่อง "วันที่ส่งคืน")
 */
import { useEffect } from "react";

const TYPES = new Set(["date", "datetime-local", "month"]);

export function DatePickerOnClick() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: fine)").matches) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || !TYPES.has(el.type) || el.disabled || el.readOnly || el.dataset.noAutopicker != null) return;
      try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* เปิดอยู่แล้ว / เบราว์เซอร์ไม่รองรับ — ใช้ไอคอนปฏิทินเดิม */ }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
