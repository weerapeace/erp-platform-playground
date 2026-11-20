"use client";
/**
 * ตัวโหลดศูนย์แจ้งเตือน/ตัว Pet (WorkPopupHost) แบบโหลดตามมา — ไม่รวมในโค้ดตั้งต้นของทุกหน้า
 * (ลดขนาดโครงแอปที่ทุกหน้าโหลด · เจ้าของสั่ง 2026-11-20 "ให้ลดขนาดก่อน") · หน้าตา/การทำงานเหมือนเดิม แค่ขึ้นช้ากว่าหน้าไม่กี่ร้อยมิลลิวินาที
 * ใช้ที่ app/layout.tsx เท่านั้น
 */
import dynamic from "next/dynamic";

const Host = dynamic(() => import("./index").then((m) => m.WorkPopupHost), { ssr: false });

export function WorkPopupHostLazy() {
  return <Host />;
}
