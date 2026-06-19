/**
 * Layout ของบอร์ดจ่ายงาน — ผูก manifest ของบอร์ด (PWA) + แบรนด์/ไอคอน
 * เพื่อให้ติดตั้งบอร์ดเป็นแอปเดี่ยวบนแท็บเล็ต เปิดเต็มจอ (Phase 2)
 */
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = { themeColor: "#059669" };

export const metadata: Metadata = {
  title: "บอร์ดจ่ายงาน",
  manifest: "/api/board-manifest",
  icons: { icon: "/icon-192.png", shortcut: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "บอร์ดจ่ายงาน" },
};

export default function WorkBoardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
