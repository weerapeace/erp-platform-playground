/**
 * 🔐 ด่านของ API ที่ "เว็บร้านฝั่งเซิร์ฟเวอร์" เท่านั้นเรียกได้ (/api/storefront-member/*)
 *
 * เว็บร้านส่ง header:
 *   x-storefront-key    = กุญแจภายใน (env STOREFRONT_INTERNAL_KEY — ตั้งค่าเดียวกันทั้ง ERP และเว็บร้าน · ห้ามอยู่ในโค้ดฝั่งเบราว์เซอร์)
 *   x-storefront-shop   = slug ร้าน
 *   x-storefront-member = รหัสสมาชิก (เว็บร้านอ่านจากคุกกี้ที่เซ็นแล้ว) — เฉพาะ API ของสมาชิกคนนั้น
 *
 * ยังไม่ได้ตั้งกุญแจ = ปิดทั้งระบบสมาชิก (503) · เทียบกุญแจแบบเวลาคงที่ (กันเดาทีละตัวอักษร)
 * ⚠️ ห้ามใช้ guardApi (ของพนักงาน) กับเส้นนี้ และห้ามให้ลูกค้าเข้า Supabase Auth ตัวเดียวกับพนักงาน (ดู migration 202610160100)
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;
export interface MemberShop {
  id: string;
  slug: string;
  name: string;
}
export interface MemberRow {
  id: string;
  shop_id: string;
  email: string | null;
  email_verified: boolean;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  marketing_opt_in: boolean;
  status: string;
  created_at: string;
}

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function storefrontKeyOk(request: Request): boolean {
  const want = process.env.STOREFRONT_INTERNAL_KEY?.trim();
  const got = request.headers.get("x-storefront-key")?.trim();
  if (!want || want.length < 24 || !got) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** ผ่านด่าน = { sb, shop } · ไม่ผ่าน = คำตอบ error ส่งกลับได้เลย */
export async function guardStorefront(request: Request): Promise<{ sb: Admin; shop: MemberShop } | NextResponse> {
  if (!process.env.STOREFRONT_INTERNAL_KEY?.trim()) return json({ ok: false, error: "ระบบสมาชิกยังไม่เปิดใช้" }, 503);
  if (!storefrontKeyOk(request)) return json({ ok: false, error: "forbidden" }, 403);
  const slug = (request.headers.get("x-storefront-shop") ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุร้าน" }, 400);
  const sb = supabaseAdmin();
  const { data } = await sb.from("shops").select("id, slug, name, status").eq("slug", slug).maybeSingle();
  const s = data as (MemberShop & { status: string }) | null;
  if (!s || s.status !== "active") return json({ ok: false, error: "ไม่พบร้าน" }, 404);
  return { sb, shop: { id: s.id, slug: s.slug, name: s.name } };
}

/** + สมาชิกที่ล็อกอินอยู่ (ต้องเป็นของร้านนี้และยังใช้งานได้) */
export async function guardMember(request: Request): Promise<{ sb: Admin; shop: MemberShop; member: MemberRow } | NextResponse> {
  const g = await guardStorefront(request);
  if (g instanceof NextResponse) return g;
  const id = (request.headers.get("x-storefront-member") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "ต้องเข้าสู่ระบบ" }, 401);
  const { data } = await g.sb
    .from("store_customers")
    .select("id, shop_id, email, email_verified, name, phone, avatar_url, marketing_opt_in, status, created_at")
    .eq("id", id)
    .eq("shop_id", g.shop.id)
    .maybeSingle();
  const m = data as MemberRow | null;
  if (!m || m.status !== "active") return json({ ok: false, error: "ต้องเข้าสู่ระบบใหม่" }, 401);
  return { ...g, member: m };
}

export { json as storefrontJson };
