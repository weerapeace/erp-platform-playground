import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // Cloudflare Pages (@cloudflare/next-on-pages):
  // - images.unoptimized: ปิด server image optimization (CF ไม่มี sharp)
  // - ignore build errors: กัน build fail จาก legacy warning
  //   (รัน lint/typecheck แยก ใน CI/local)
  images: {
    unoptimized: true,
  },
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors:  true },
  // เก็บ "หน้า" ที่เคยเข้าไว้ในแคชฝั่ง browser นานขึ้น (ค่าเดิม dynamic ~0-30 วิ)
  // → สลับไปแอปอื่นแล้วกลับเข้าหน้าเดิมภายใน 5 นาที = ไม่ต้องวิ่งไปดึงโครงหน้าจาก server ใหม่
  //   (เลี่ยง worker cold start ตอนเปลี่ยนหน้า) · ข้อมูลในตารางยังสดเพราะมี SWR revalidate เอง
  experimental: {
    staleTimes: { dynamic: 300, static: 300 },
  },
};

export default nextConfig;
