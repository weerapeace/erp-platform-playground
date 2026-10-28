/**
 * 👤 เชื่อม / ยกเลิกเชื่อม วิธีเข้าสู่ระบบ ของสมาชิกที่ล็อกอินอยู่ — /api/storefront-member/link
 * POST   { provider, providerUserId, email, emailVerified, name, avatarUrl } → ผูกวิธีใหม่เข้าบัญชีนี้
 *        (ทำตอนล็อกอินอยู่แล้วเท่านั้น = ยืนยันตัวตนแล้ว จึงผูก LINE/Facebook ได้โดยไม่ต้องพึ่งอีเมล)
 *        ช่องทางนี้ผูกกับสมาชิกคนอื่นอยู่ = 409 (ไม่ย้ายให้เอง กันแย่งบัญชี)
 * DELETE ?provider=line → ยกเลิกเชื่อม (ต้องเหลืออย่างน้อย 1 วิธี — lib/website-members canUnlink)
 * ด่าน: POST = ⚠️ ต้องมีกุญแจภายในเสมอ (เชื่อโปรไฟล์ที่เว็บร้านส่งมา — บัตรสมาชิกอย่างเดียวไม่พอ ไม่งั้นลูกค้ายิงตรงมาผูก Google ของคนอื่นได้)
 *       ร้านที่ตั้งรหัสใน ERP เชื่อมผ่าน /api/storefront-member/oauth (ERP แลก code เอง) · DELETE = บัตรสมาชิกพอ
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson, storefrontKeyOk } from "@/lib/storefront-internal";
import { canUnlink, MEMBER_PROVIDERS, sanitizeLoginInput, type MemberProvider } from "@/lib/website-members";
import { linkIdentity, memberSummary } from "@/lib/website-members-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!storefrontKeyOk(request)) return storefrontJson({ ok: false, error: "forbidden" }, 403);
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const v = sanitizeLoginInput(await request.json().catch(() => null));
  if (!v.ok) return storefrontJson({ ok: false, error: v.error }, 400);
  const r = await linkIdentity(g.sb, g.shop.id, g.member, v.input);
  return r.ok ? storefrontJson(r, 200) : storefrontJson({ ok: false, error: r.error }, r.status);
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
  // ยกเลิก "อีเมล + รหัสผ่าน" = ลบรหัสผ่านด้วย (เข้าด้วยรหัสเดิมไม่ได้อีก — การเข้าด้วยรหัสหาจากอีเมล ไม่ใช่จากรายการช่องทาง)
  if (provider === "password") await g.sb.from("store_customers").update({ password_hash: null, updated_at: new Date().toISOString() }).eq("id", g.member.id);
  return storefrontJson({ ok: true, member: await memberSummary(g.sb, g.member) }, 200);
}
