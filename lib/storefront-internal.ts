/**
 * 🔐 ด่านของ API ที่ "เว็บร้านฝั่งเซิร์ฟเวอร์เท่านั้น" เรียกได้ (/api/storefront-member/*)
 *
 * เว็บร้านส่ง header:
 *   x-storefront-shop         = slug ร้าน
 *   x-storefront-member-token = 🎫 บัตรสมาชิกที่ ERP ออกให้ตอนเข้าสู่ระบบ (lib/storefront-member-token) — เส้นของสมาชิกคนนั้น
 *   x-storefront-key          = กุญแจภายใน (ไม่บังคับแล้ว · env STOREFRONT_INTERNAL_KEY) — ต้องมีเฉพาะเส้นที่ "เชื่อข้อมูลจากเว็บร้าน"
 *                               คือ login (เว็บร้านแลก OAuth เองด้วยรหัสใน env ของเว็บร้าน) และ password
 *   x-storefront-member       = รหัสสมาชิก — ใช้แทนบัตรได้เฉพาะตอนมีกุญแจภายใน (แบบเดิม) · ส่งคู่กับบัตรต้องตรงกัน
 *
 * 3 ด่าน: guardShop (แค่ร้าน — เส้นที่ ERP ตรวจตัวตนเอง: oauth / trial-login) · guardStorefront (ต้องมีกุญแจภายใน)
 *         guardMember (บัตรสมาชิก หรือ กุญแจ+รหัสสมาชิก) · เทียบกุญแจแบบเวลาคงที่ (กันเดาทีละตัวอักษร)
 * ⚠️ ห้ามใช้ guardApi (ของพนักงาน) กับเส้นนี้ และห้ามให้ลูกค้าเข้า Supabase Auth ตัวเดียวกับพนักงาน (ดู migration 202610160100)
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { issueMemberToken, memberTokensReady, verifyMemberToken } from "@/lib/storefront-member-token";

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
  /** 🧪 สมาชิกทดลอง (ERP สร้าง · ไม่นับสถิติ · สั่งซื้อจริงไม่ได้) */
  is_test: boolean;
}

export const MEMBER_ROW_COLS = "id, shop_id, email, email_verified, name, phone, avatar_url, marketing_opt_in, status, created_at, is_test";

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function storefrontKeyOk(request: Request): boolean {
  const want = process.env.STOREFRONT_INTERNAL_KEY?.trim();
  const got = request.headers.get("x-storefront-key")?.trim();
  if (!want || want.length < 24 || !got) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function activeShop(sb: Admin, request: Request): Promise<MemberShop | NextResponse> {
  const slug = (request.headers.get("x-storefront-shop") ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุร้าน" }, 400);
  const { data } = await sb.from("shops").select("id, slug, name, status").eq("slug", slug).maybeSingle();
  const s = data as (MemberShop & { status: string }) | null;
  if (!s || s.status !== "active") return json({ ok: false, error: "ไม่พบร้าน" }, 404);
  return { id: s.id, slug: s.slug, name: s.name };
}

/** ด่านที่ต้องมีกุญแจภายใน (เชื่อข้อมูลที่เว็บร้านส่งมา) · ผ่าน = { sb, shop } · ไม่ผ่าน = คำตอบ error ส่งกลับได้เลย */
export async function guardStorefront(request: Request): Promise<{ sb: Admin; shop: MemberShop } | NextResponse> {
  if (!process.env.STOREFRONT_INTERNAL_KEY?.trim()) return json({ ok: false, error: "ระบบสมาชิกยังไม่เปิดใช้" }, 503);
  if (!storefrontKeyOk(request)) return json({ ok: false, error: "forbidden" }, 403);
  const sb = supabaseAdmin();
  const shop = await activeShop(sb, request);
  if (shop instanceof NextResponse) return shop;
  return { sb, shop };
}

/** ด่านแค่ "ร้าน" (ไม่ต้องมีกุญแจภายใน) — เส้นที่ ERP ตรวจตัวตนเองทั้งหมด (แลก OAuth code / ตั๋วสมาชิกทดลอง) · ออกบัตรไม่ได้ = 503 */
export async function guardShop(request: Request): Promise<{ sb: Admin; shop: MemberShop; trusted: boolean } | NextResponse> {
  if (!memberTokensReady()) return json({ ok: false, error: "ระบบสมาชิกยังไม่เปิดใช้" }, 503);
  const sb = supabaseAdmin();
  const shop = await activeShop(sb, request);
  if (shop instanceof NextResponse) return shop;
  return { sb, shop, trusted: storefrontKeyOk(request) };
}

/** + สมาชิกที่ล็อกอินอยู่ (ต้องเป็นของร้านนี้และยังใช้งานได้) — 🎫 บัตรสมาชิก หรือ กุญแจภายใน + รหัสสมาชิก */
export async function guardMember(request: Request): Promise<{ sb: Admin; shop: MemberShop; member: MemberRow } | NextResponse> {
  const trusted = storefrontKeyOk(request);
  if (!trusted && !memberTokensReady()) return json({ ok: false, error: "ระบบสมาชิกยังไม่เปิดใช้" }, 503);
  const sb = supabaseAdmin();
  const shop = await activeShop(sb, request);
  if (shop instanceof NextResponse) return shop;
  const raw = request.headers.get("x-storefront-member-token")?.trim();
  const asserted = (request.headers.get("x-storefront-member") ?? "").trim();
  let id = "";
  if (raw) {
    const t = verifyMemberToken(raw, shop.slug);
    // บัตรเสีย/หมดอายุ = เข้าใหม่ · ส่งรหัสสมาชิกมาคู่กัน ต้องตรงกับบัตร
    if (!t || (asserted && asserted !== t.memberId)) return json({ ok: false, error: "ต้องเข้าสู่ระบบใหม่" }, 401);
    id = t.memberId;
  } else if (trusted) id = asserted;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "ต้องเข้าสู่ระบบ" }, 401);
  const { data } = await sb.from("store_customers").select(MEMBER_ROW_COLS).eq("id", id).eq("shop_id", shop.id).maybeSingle();
  const m = data as MemberRow | null;
  if (!m || m.status !== "active") return json({ ok: false, error: "ต้องเข้าสู่ระบบใหม่" }, 401);
  return { sb, shop, member: m };
}

/** 🧪 เส้นที่สมาชิกทดลองใช้ไม่ได้ (สั่งซื้อ / ผูกออเดอร์เก่า / เชื่อมช่องทาง / โค้ดชวนเพื่อน / ตั้งรหัสผ่าน) · คืน 403 หรือ null = ผ่าน */
export function denyTestMember(member: MemberRow, what = "ทำรายการนี้"): NextResponse | null {
  return member.is_test ? json({ ok: false, code: "test_member", error: `บัญชีทดลอง${what}ไม่ได้ — ใช้ดูหน้าตาเว็บเท่านั้น` }, 403) : null;
}

/** คำตอบ "เข้าสู่ระบบสำเร็จ" ของทุกช่องทาง = ข้อมูลสมาชิก + 🎫 บัตรสมาชิก (เว็บร้านเก็บในคุกกี้ sf_member) */
export function memberLoginBody<T extends { id: string; name: string; avatarUrl: string | null }>(shop: MemberShop, member: T, isTest = false): { member: T; token: string | null } {
  return { member, token: issueMemberToken({ shop: shop.slug, memberId: member.id, name: member.name, avatar: member.avatarUrl, isTest }) };
}

export { json as storefrontJson };
