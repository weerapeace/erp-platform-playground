/**
 * /notify — แอปเดี่ยว "แจ้งเตือน ERP" (ตัวแอปอยู่ใน notify-app.tsx)
 *
 * ⚠️ manifest ต้องตั้งที่ "หน้า" ไม่ใช่ layout: หน้าระดับแรก (/notify, /goals) Next แนบ manifest กลาง (app/manifest.ts
 * = แอปโอนเงินจีน) ไว้กับ layout ชั้นนี้ แล้วทับค่าที่ layout ตั้งเอง → ติดตั้งแล้วได้แอปผิดตัว
 * (next-app-loader ใส่ static metadata ของชั้นแม่ให้ layout ลูก · ตัวหน้าได้ของชั้นตัวเองซึ่งไม่มี manifest)
 */
import type { Metadata } from "next";
import { NotifyApp } from "./notify-app";

export const metadata: Metadata = {
  manifest: "/notify.webmanifest",
};

export default function NotifyPage() {
  return <NotifyApp />;
}
