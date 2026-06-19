/**
 * Web App Manifest ของ "บอร์ดจ่ายงาน" (PWA) — /api/board-manifest
 * ติดตั้งบอร์ดเป็นแอปเดี่ยวบนแท็บเล็ตหน้างาน เปิดเต็มจอ (standalone)
 * สาธารณะ (ไม่ต้อง auth) — เบราว์เซอร์/OS ต้องดึง manifest ตอนติดตั้ง
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  const manifest = {
    id: "/master/work-board",
    name: "บอร์ดจ่ายงาน",
    short_name: "จ่ายงาน",
    start_url: "/master/work-board",
    scope: "/master/",                 // เปิดหน้าอื่นใน /master (ใบสั่งผลิต/ตารางส่งงาน) ยังอยู่ในแอป
    display: "standalone",
    orientation: "landscape",
    background_color: "#f8fafc",
    theme_color: "#059669",            // เขียว (ธีมบอร์ด)
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
