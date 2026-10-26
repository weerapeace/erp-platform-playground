import type { Metadata } from "next";

/**
 * manifest ของแอปเดี่ยว "เป้าหมาย" — ต้องตั้งที่ "ทุกหน้า" (page.tsx) ไม่ใช่ layout
 * หน้าระดับแรก (/goals, /notify) Next แนบ manifest กลาง (app/manifest.ts = แอปโอนเงินจีน) ไว้กับ layout ชั้นนี้
 * แล้วทับค่าที่ layout ตั้งเอง → ติดตั้งแล้วได้แอปผิดตัว · ตัวหน้าได้ของชั้นตัวเอง (ไม่มี manifest) จึงไม่โดนทับ
 */
export const goalsPageMetadata: Metadata = {
  manifest: "/goals.webmanifest",
};
