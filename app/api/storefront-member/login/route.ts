/**
 * 👤 สมาชิกเข้าสู่ระบบ (เว็บร้านฝั่งเซิร์ฟเวอร์เรียกหลังทำ OAuth เสร็จ) — /api/storefront-member/login
 * POST { provider, providerUserId, email, emailVerified, name, avatarUrl, mode?, consent?, marketing? } → { ok, member, token, created }
 * ด่าน: กุญแจภายใน (lib/storefront-internal) — ทางนี้ "เชื่อโปรไฟล์ที่เว็บร้านส่งมา" จึงต้องมีกุญแจเสมอ (เว็บร้านแลก OAuth เองด้วยรหัสใน env)
 *       ร้านที่ตั้งรหัสไว้ใน ERP ใช้ /api/storefront-member/oauth แทน (ERP แลก code เอง ไม่ต้องมีกุญแจ)
 * กฎผูกบัญชี lib/website-members (resolveLogin) · mode/consent = แท็บสมัคร/เข้าสู่ระบบ (lib/website-members-db LoginIntent)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardStorefront, memberLoginBody, storefrontJson } from "@/lib/storefront-internal";
import { sanitizeLoginInput } from "@/lib/website-members";
import { loginMember, memberSummary, sanitizeLoginIntent } from "@/lib/website-members-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardStorefront(request);
  if (g instanceof NextResponse) return g;
  const body = await request.json().catch(() => null);
  const v = sanitizeLoginInput(body);
  if (!v.ok) return storefrontJson({ ok: false, error: v.error }, 400);
  const r = await loginMember(g.sb, g.shop.id, v.input, sanitizeLoginIntent(body));
  if (!r.ok) return storefrontJson({ ok: false, error: r.error, code: r.code }, r.status);
  return storefrontJson({ ok: true, created: r.created, ...memberLoginBody(g.shop, await memberSummary(g.sb, r.member), r.member.is_test) }, 200);
}
