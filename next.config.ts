import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
