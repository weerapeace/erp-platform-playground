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
};

export default nextConfig;
