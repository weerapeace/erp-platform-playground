/**
 * API สาธารณะ — สมัครรับข่าวสารจากเว็บร้าน : POST /api/public/storefront/subscribe
 *
 * body: { shop, email, source? }  → เก็บลง store_subscribers (ร้านละชุด อีเมลซ้ำไม่เพิ่ม)
 * ดูรายชื่อ/ลบ ได้ที่ ERP แท็บ "🏪 ข้อมูลร้าน" (/api/website/subscribers)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · ตรวจรูปแบบอีเมล + จำกัดความยาว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { storefrontCors, corsPreflight, corsJson } from "@/lib/storefront-cors";
import { activeShopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = storefrontCors("POST");

export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}

const json = corsJson(CORS);

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 🔒 กันยิงรัว (lib/rate-limit · audit 2026-10-21)
  const limited = await overLimit(request, [{ name: "subscribe:ip", limit: 10, windowSec: 3600 }]);
  if (limited) return json({ ok: false, error: limited }, 429);
  let body: { shop?: string; email?: string; source?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }
  const slug = String(body.shop ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  const source = String(body.source ?? "web").trim().slice(0, 40) || "web";
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ ok: false, error: "รูปแบบอีเมลไม่ถูกต้อง" }, 400);

  const sb = supabaseAdmin();
  const s = await activeShopBySlug(sb, slug);
  if (!s) return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  const { error } = await sb.from("store_subscribers").upsert({ shop_id: s.id, email, source }, { onConflict: "shop_id,email", ignoreDuplicates: true });
  if (error) {
    console.error("[storefront/subscribe]", error);
    return json({ ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, 500);
  }
  return json({ ok: true });
}
