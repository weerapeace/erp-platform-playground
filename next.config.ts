import type { NextConfig } from "next";

/**
 * 🖼 ตัวเสิร์ฟรูปบน Cloudflare (workers/img · เจ้าของอนุมัติ 2026-11-10 "ย้ายรูปไป Cloudflare")
 * รูปที่ "เบราว์เซอร์โหลดมาแสดง" (Sec-Fetch-Dest: image — <img>, CSS background, canvas) ของ /api/r2-image
 * → ส่งต่อไป erp-img (อ่าน R2 ตรง + เก็บรูปย่อไว้ใน R2) แทนการวิ่งผ่าน Vercel (แคช Vercel หายทุก deploy = ค่าส่งข้อมูลพุ่ง)
 * ไม่ส่งต่อ: ระบบภายนอก (LINE/Lazada/Shopee ไม่มีหัวนี้) · fetch() ในหน้า · วิดีโอ <video> · ตัว erp-img เองที่มาขอให้ย่อ (x-img-worker)
 * ปิด (ย้อนกลับ) = ตั้ง env IMG_WORKER_URL=off แล้ว redeploy · memory vercel_cost_breakdown
 */
const IMG_WORKER = (process.env.IMG_WORKER_URL ?? "https://erp-img.weerapeace.workers.dev").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async redirects() {
    if (!IMG_WORKER || IMG_WORKER === "off") return [];
    return [{
      source: "/api/r2-image",
      has: [{ type: "header", key: "sec-fetch-dest", value: "image" }],
      missing: [{ type: "header", key: "x-img-worker" }],
      destination: `${IMG_WORKER}/api/r2-image`,   // query (?key=&w=...) ติดไปเอง
      permanent: false,
    }];
  },
  outputFileTracingRoot: process.cwd(),
  // sharp ใช้ย่อรูปใน /api/r2-image (เฉพาะ Vercel/Node) — เป็น native module
  // → ตั้ง external ไม่ให้ bundle (กัน build บวม/พังตอน bundle ฝั่ง CF; CF จะ fallback รูปเดิม)
  serverExternalPackages: ["sharp"],
  // Cloudflare Pages (@cloudflare/next-on-pages):
  // - images.unoptimized: ปิด server image optimization (CF ไม่มี sharp)
  // - ignore build errors: กัน build fail จาก legacy warning
  //   (รัน lint/typecheck แยก ใน CI/local)
  images: {
    unoptimized: true,
  },
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors:  true },
  // NOTE: เคยลอง experimental.staleTimes (เก็บแคชหน้า 5 นาที) เพื่อเลี่ยง cold start ตอนข้ามแอป
  // แต่บน OpenNext/Cloudflare ทำให้เกิด version skew หลัง deploy (เบราว์เซอร์ปนโค้ดเก่า+ใหม่ → หน้าพัง)
  // → ถอดออก. แก้ cold start ด้วย warmer (cron-job.org) แทน
};

export default nextConfig;
