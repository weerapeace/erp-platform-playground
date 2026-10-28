/**
 * 🧪 เข้าเว็บร้านในฐานะสมาชิกทดลอง — /api/storefront-member/trial-login
 * POST { ticket } → { ok, member, token }
 * ตั๋วออกจาก ERP เท่านั้น (/api/website/members/test action "open" — พนักงานที่ล็อกอิน + สิทธิ์ products.edit)
 * ใช้ได้ครั้งเดียว · อายุ 10 นาที · เก็บแค่แฮช (store_customer_tokens kind trial_login) · ต้องเป็นสมาชิกทดลอง (is_test) ของร้านนี้
 * ลูกค้าจริงใช้ทางนี้ไม่ได้: ไม่มีทางออกตั๋วเอง และบัญชีจริงเปลี่ยนเป็นบัญชีทดลองไม่ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { guardShop, MEMBER_ROW_COLS, memberLoginBody, storefrontJson, type MemberRow } from "@/lib/storefront-internal";
import { memberSummary } from "@/lib/website-members-db";
import { tokenHash } from "@/lib/member-password";
import { overLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardShop(request);
  if (g instanceof NextResponse) return g;
  const limited = await overLimit(request, [{ name: "member-trial:ip", limit: 30, windowSec: 600 }]);
  if (limited) return storefrontJson({ ok: false, error: limited }, 429);
  const body = ((await request.json().catch(() => null)) ?? {}) as { ticket?: unknown };
  const ticket = typeof body.ticket === "string" ? body.ticket.trim() : "";
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(ticket)) return storefrontJson({ ok: false, error: "ลิงก์ไม่ถูกต้อง" }, 400);
  const fail = () => storefrontJson({ ok: false, error: "ลิงก์ทดลองหมดอายุหรือถูกใช้แล้ว — กด “เปิดเว็บในฐานะคนนี้” ใน ERP ใหม่" }, 400);

  const { data } = await g.sb.from("store_customer_tokens").select("id, customer_id, expires_at, used_at").eq("token_hash", tokenHash(ticket)).eq("kind", "trial_login").maybeSingle();
  const t = data as { id: string; customer_id: string; expires_at: string; used_at: string | null } | null;
  if (!t || t.used_at || new Date(t.expires_at) < new Date()) return fail();
  const { data: mm } = await g.sb.from("store_customers").select(MEMBER_ROW_COLS).eq("id", t.customer_id).eq("shop_id", g.shop.id).maybeSingle();
  const m = mm as MemberRow | null;
  if (!m || !m.is_test || m.status !== "active") return fail();
  // ใช้ตั๋ว (ครั้งเดียว — กดซ้ำพร้อมกันได้ผลแค่ครั้งแรก)
  const { data: used } = await g.sb.from("store_customer_tokens").update({ used_at: new Date().toISOString() }).eq("id", t.id).is("used_at", null).select("id").maybeSingle();
  if (!used) return fail();
  await g.sb.from("store_customers").update({ last_login_at: new Date().toISOString() }).eq("id", m.id);
  return storefrontJson({ ok: true, ...memberLoginBody(g.shop, await memberSummary(g.sb, m), true) }, 200);
}
