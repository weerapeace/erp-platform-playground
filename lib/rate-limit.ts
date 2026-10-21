/**
 * 🔒 กันยิงรัว — ของกลางสำหรับ API สาธารณะ (/api/public/*) · audit 2026-10-21
 *
 * นับครั้งในฐานข้อมูล (ตาราง api_rate_limits + ฟังก์ชัน api_rate_limit_hit — นับแบบหน้าต่างเวลาคงที่ ไม่ชนกัน)
 * - เก็บแค่ "รหัสแฮช" ของ IP/เบอร์ (ไม่เก็บ IP ดิบ — PDPA)
 * - ตัวนับล่ม/ต่อฐานข้อมูลไม่ได้ → ปล่อยผ่าน (ไม่ให้ลูกค้าสั่งซื้อไม่ได้เพราะตัวกัน)
 *
 * ใช้: const msg = await overLimit(request, [{ name: "orders:ip", limit: 10, windowSec: 600 }], lang)
 *      if (msg) return json({ ok: false, error: msg }, 429)   ← ใช้ json ของ route เอง (มี CORS)
 */
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type RateRule = {
  /** ชื่อกฎ (ไม่ซ้ำกัน) เช่น "orders:ip" */
  name: string;
  limit: number;
  windowSec: number;
  /** นับตามค่านี้แทน IP (เช่น เบอร์โทร) — ว่าง = ข้ามกฎนี้ */
  key?: string | null;
};

/** IP ลูกค้า (Vercel ใส่ x-real-ip / x-forwarded-for ตัวแรกให้) */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

function bucketOf(name: string, id: string): string {
  return `${name}:${createHash("sha256").update(`${name}|${id}`).digest("hex").slice(0, 32)}`;
}

/** true = ยังไม่เกิน · false = เกินแล้ว (ตัวนับล่ม = true) */
export async function hitRateLimit(name: string, id: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().rpc("api_rate_limit_hit", {
      p_bucket: bucketOf(name, id),
      p_limit: limit,
      p_window_seconds: windowSec,
    });
    if (error) {
      console.warn("[rate-limit] ตัวนับใช้ไม่ได้ ปล่อยผ่าน:", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.warn("[rate-limit] ตัวนับใช้ไม่ได้ ปล่อยผ่าน:", (e as Error).message);
    return true;
  }
}

/** คืนข้อความเตือน (ภาษาลูกค้า) ถ้าเกินกฎใดกฎหนึ่ง · null = ผ่าน */
export async function overLimit(request: Request, rules: RateRule[], lang?: string | null): Promise<string | null> {
  const ip = clientIp(request);
  for (const r of rules) {
    const id = r.key === undefined ? ip : (r.key ?? "").trim();
    if (!id) continue;
    if (!(await hitRateLimit(r.name, id, r.limit, r.windowSec))) {
      return lang === "en"
        ? "Too many requests. Please wait a moment and try again."
        : "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
    }
  }
  return null;
}
