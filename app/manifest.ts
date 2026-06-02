import type { MetadataRoute } from "next";

// PWA manifest — ติดตั้งเป็นแอปบนมือถือ ("Add to Home Screen") เปิดเต็มจอ
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP — โอนเงินจีน",
    short_name: "โอนเงินจีน",
    description: "วางบิล / โอนเงินร้านจีน",
    start_url: "/app/china-pay",
    scope: "/",
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
