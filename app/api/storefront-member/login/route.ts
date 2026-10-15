/**
 * 👤 สมาชิกเข้าสู่ระบบ (เว็บร้านฝั่งเซิร์ฟเวอร์เรียกหลังทำ OAuth เสร็จ) — /api/storefront-member/login
 * POST { provider, providerUserId, email, emailVerified, name, avatarUrl } → { ok, member, created }
 * ด่าน: กุญแจภายใน (lib/storefront-internal) · กฎผูกบัญชี lib/website-members (resolveLogin)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardStorefront, storefrontJson } from "@/lib/storefront-internal";
import { sanitizeLoginInput } from "@/lib/website-members";
import { loginMember, memberSummary } from "@/lib/website-members-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardStorefront(request);
  if (g instanceof NextResponse) return g;
  const v = sanitizeLoginInput(await request.json().catch(() => null));
  if (!v.ok) return storefrontJson({ ok: false, error: v.error }, 400);
  const r = await loginMember(g.sb, g.shop.id, v.input);
  if (!r.ok) return storefrontJson({ ok: false, error: r.error }, r.status);
  return storefrontJson({ ok: true, created: r.created, member: await memberSummary(g.sb, r.member) }, 200);
}
