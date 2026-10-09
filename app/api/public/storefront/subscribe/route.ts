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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const { data: shop } = await sb.from("shops").select("id, status").eq("slug", slug).maybeSingle();
  const s = shop as { id: string; status: string } | null;
  if (!s || s.status !== "active") return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  const { error } = await sb.from("store_subscribers").upsert({ shop_id: s.id, email, source }, { onConflict: "shop_id,email", ignoreDuplicates: true });
  if (error) {
    console.error("[storefront/subscribe]", error);
    return json({ ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, 500);
  }
  return json({ ok: true });
}
