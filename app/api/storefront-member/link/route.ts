/**
 * 👤 เชื่อม / ยกเลิกเชื่อม วิธีเข้าสู่ระบบ ของสมาชิกที่ล็อกอินอยู่ — /api/storefront-member/link
 * POST   { provider, providerUserId, email, emailVerified, name, avatarUrl } → ผูกวิธีใหม่เข้าบัญชีนี้
 *        (ทำตอนล็อกอินอยู่แล้วเท่านั้น = ยืนยันตัวตนแล้ว จึงผูก LINE/Facebook ได้โดยไม่ต้องพึ่งอีเมล)
 *        ช่องทางนี้ผูกกับสมาชิกคนอื่นอยู่ = 409 (ไม่ย้ายให้เอง กันแย่งบัญชี)
 * DELETE ?provider=line → ยกเลิกเชื่อม (ต้องเหลืออย่างน้อย 1 วิธี — lib/website-members canUnlink)
 * ด่าน: กุญแจภายใน + สมาชิก
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { canUnlink, MEMBER_PROVIDERS, PROVIDER_LABEL, sanitizeLoginInput, type MemberProvider } from "@/lib/website-members";
import { memberSummary } from "@/lib/website-members-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const v = sanitizeLoginInput(await request.json().catch(() => null));
  if (!v.ok) return storefrontJson({ ok: false, error: v.error }, 400);
  const p = v.input;
  const { data: cur } = await g.sb.from("store_customer_identities").select("customer_id").eq("shop_id", g.shop.id).eq("provider", p.provider).eq("provider_user_id", p.providerUserId).maybeSingle();
  const owner = (cur as { customer_id: string } | null)?.customer_id;
  if (owner && owner !== g.member.id) return storefrontJson({ ok: false, error: `บัญชี ${PROVIDER_LABEL[p.provider]} นี้ใช้กับสมาชิกอีกคนแล้ว — ออกจากระบบแล้วเข้าด้วย ${PROVIDER_LABEL[p.provider]} เพื่อใช้บัญชีนั้น` }, 409);
  if (!owner) {
    const { error } = await g.sb.from("store_customer_identities").insert({ customer_id: g.member.id, shop_id: g.shop.id, provider: p.provider, provider_user_id: p.providerUserId, email: p.email, last_login_at: new Date().toISOString() });
    if (error) return storefrontJson({ ok: false, error: "เชื่อมไม่สำเร็จ กรุณาลองใหม่" }, 500);
  }
  // บัญชียังไม่มีอีเมล + ช่องทางใหม่ส่งอีเมลที่ยืนยันแล้ว (Google) → ใช้เป็นอีเมลบัญชี (ถ้าไม่ซ้ำกับสมาชิกอื่นในร้าน)
  if (!g.member.email && p.email && p.emailVerified) {
    const { data: taken } = await g.sb.from("store_customers").select("id").eq("shop_id", g.shop.id).eq("email", p.email).neq("status", "deleted").maybeSingle();
    if (!taken) await g.sb.from("store_customers").update({ email: p.email, email_verified: true, updated_at: new Date().toISOString() }).eq("id", g.member.id);
  }
  const { data: m } = await g.sb.from("store_customers").select("id, shop_id, email, email_verified, name, phone, avatar_url, marketing_opt_in, status, created_at").eq("id", g.member.id).maybeSingle();
  return storefrontJson({ ok: true, already: !!owner, member: await memberSummary(g.sb, (m ?? g.member) as typeof g.member) }, 200);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const provider = (request.nextUrl.searchParams.get("provider") ?? "") as MemberProvider;
  if (!MEMBER_PROVIDERS.includes(provider)) return storefrontJson({ ok: false, error: "ช่องทางไม่ถูกต้อง" }, 400);
  const { data } = await g.sb.from("store_customer_identities").select("provider").eq("customer_id", g.member.id);
  const all = (data ?? []) as { provider: string }[];
  const c = canUnlink(all.length, all.filter((r) => r.provider === provider).length);
  if (!c.ok) return storefrontJson({ ok: false, error: c.error }, 400);
  const { error } = await g.sb.from("store_customer_identities").delete().eq("customer_id", g.member.id).eq("provider", provider);
  if (error) return storefrontJson({ ok: false, error: "ยกเลิกไม่สำเร็จ" }, 500);
  return storefrontJson({ ok: true, member: await memberSummary(g.sb, g.member) }, 200);
}
