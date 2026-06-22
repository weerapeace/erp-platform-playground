/**
 * /api/ping — เบาที่สุด (ไม่แตะ DB/auth) สำหรับ heartbeat กัน Cloudflare Worker "เย็น"
 * ระหว่าง user ใช้งานอยู่ → ยิงทุก ~25 วิ ให้ isolate ของ colo นั้นอุ่นไว้ → request จริงไม่ต้อง cold-start
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(): NextResponse {
  return NextResponse.json({ ok: 1, t: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
