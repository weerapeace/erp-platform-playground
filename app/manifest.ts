import type { MetadataRoute } from "next";

// PWA manifest — ติดตั้งเป็นแอปบนมือถือ ("Add to Home Screen") เปิดเต็มจอ
// ⚠️ scope ต้องแคบแค่ /app/china-pay — เดิมเป็น "/" (ทั้งเว็บ) → เครื่องที่ติดตั้งแอปโอนเงินจีนไว้ เปิดลิงก์ไหนของระบบ
//    (เช่น QR ติดตั้งแอป "ผลิต" /app/production) ก็ถูกดึงไปเปิดในแอปโอนเงินจีนแทน · id คงเดิม (= start_url เดิม) → เครื่องที่ติดตั้งไว้อัปเดตเอง ไม่ต้องลงใหม่
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app/china-pay",
    name: "ERP — โอนเงินจีน",
    short_name: "โอนเงินจีน",
    description: "วางบิล / โอนเงินร้านจีน",
    start_url: "/app/china-pay",
    scope: "/app/china-pay",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#e11d48",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
