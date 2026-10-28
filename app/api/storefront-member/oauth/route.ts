/**
 * 🔑 เข้าสู่ระบบ / สมัคร / เชื่อมช่องทาง ด้วย Google · LINE · Facebook — ERP แลก code เอง — /api/storefront-member/oauth
 * POST { provider, code, verifier, redirectUri, mode: "login"|"signup", consent?, marketing?, link? }
 *   → { ok, member, token, created } · ยังไม่เคยสมัคร + แท็บเข้าสู่ระบบ = 409 code need_signup
 *   link: true + บัตรสมาชิก (x-storefront-member-token) = เชื่อมช่องทางนี้เข้าบัญชีที่ล็อกอินอยู่ → { ok, member, already }
 * ด่าน: แค่ร้าน (ไม่ต้องมีกุญแจภายใน) — ตัวตนพิสูจน์ด้วย code ที่ ERP แลกกับผู้ให้บริการเองด้วยรหัสลับของร้าน (lib/storefront-oauth)
 *       redirectUri ต้องเป็น callback บนโดเมนของร้าน (shop_domains) · กันยิงรัวต่อ IP
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, guardShop, memberLoginBody, storefrontJson } from "@/lib/storefront-internal";
import { exchangeOAuthCode, OAUTH_PROVIDERS, providerReady, readLoginProviders, redirectMatches, type OAuthProvider } from "@/lib/storefront-oauth";
import { linkIdentity, loginMember, memberSummary, sanitizeLoginIntent } from "@/lib/website-members-db";
import { trustedShopOrigin } from "@/lib/website-shop";
import { overLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardShop(request);
  if (g instanceof NextResponse) return g;
  const limited = await overLimit(request, [{ name: "member-oauth:ip", limit: 120, windowSec: 600 }]);
  if (limited) return storefrontJson({ ok: false, error: limited }, 429);
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const provider = String(body.provider ?? "") as OAuthProvider;
  if (!OAUTH_PROVIDERS.includes(provider)) return storefrontJson({ ok: false, error: "ช่องทางไม่ถูกต้อง" }, 400);
  const code = typeof body.code === "string" ? body.code.slice(0, 2048) : "";
  const verifier = typeof body.verifier === "string" ? body.verifier.slice(0, 256) : null;
  if (!code) return storefrontJson({ ok: false, error: "ไม่มีรหัสจากผู้ให้บริการ" }, 400);

  const cfg = (await readLoginProviders(g.sb, g.shop.id)).get(provider);
  if (!cfg || !providerReady(cfg)) return storefrontJson({ ok: false, error: "ช่องทางนี้ยังไม่เปิดใช้" }, 404);
  const origin = await trustedShopOrigin(g.sb, g.shop.id, body.redirectUri);
  if (!redirectMatches(body.redirectUri, origin, provider)) return storefrontJson({ ok: false, error: "ที่อยู่ callback ไม่ใช่โดเมนของร้าน" }, 400);

  const x = await exchangeOAuthCode(provider, { clientId: cfg.client_id.trim(), clientSecret: cfg.client_secret.trim() }, { code, verifier, redirectUri: String(body.redirectUri) });
  if (!x.ok) {
    console.warn(`[member-oauth] ${g.shop.slug} ${provider}: ${x.error}`);
    return storefrontJson({ ok: false, code: "provider", error: "ติดต่อผู้ให้บริการไม่สำเร็จ กรุณาลองใหม่" }, 502);
  }

  if (body.link === true) {
    const m = await guardMember(request);
    if (m instanceof NextResponse) return m;
    const r = await linkIdentity(g.sb, g.shop.id, m.member, x.profile);
    return r.ok ? storefrontJson(r, 200) : storefrontJson({ ok: false, error: r.error }, r.status);
  }

  const r = await loginMember(g.sb, g.shop.id, x.profile, sanitizeLoginIntent(body));
  if (!r.ok) return storefrontJson({ ok: false, error: r.error, code: r.code }, r.status);
  return storefrontJson({ ok: true, created: r.created, ...memberLoginBody(g.shop, await memberSummary(g.sb, r.member), r.member.is_test) }, 200);
}
