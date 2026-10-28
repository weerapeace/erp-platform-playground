/**
 * 🔑 ตั้งค่าการเข้าสู่ระบบของเว็บร้าน (Google / LINE / Facebook) ต่อร้าน — /api/website/members/login-settings
 * GET ?shop=<slug> → { providers: { google: { clientId, secretSet, secretTail, enabled, ready, updatedAt } … }, domains, callbacks, tokensReady }
 *     รหัสลับไม่ส่งกลับเด็ดขาด — เห็นแค่ "••••" + 4 ตัวท้าย (lib/settings-secrets SECRET_MASK)
 * PUT { shop, providers: { google?: { clientId, clientSecret?, enabled } … } }
 *     clientSecret ว่าง / ขึ้นต้นด้วย •••• = คงค่าเดิม · ตรวจรูปแบบรหัสคร่าว ๆ (กันวางผิดช่อง) · audit (ไม่บันทึกค่าลับ) · ล้างแคชเว็บร้าน
 * ด่าน: guardApi products.edit · ตาราง store_login_providers อ่านได้ผ่าน service role เท่านั้น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { shopBySlug } from "@/lib/website-shop";
import { SECRET_MASK } from "@/lib/settings-secrets";
import { memberTokensReady } from "@/lib/storefront-member-token";
import { callbackUrl, OAUTH_LABEL, OAUTH_PROVIDERS, providerReady, readLoginProviders, type OAuthProvider } from "@/lib/storefront-oauth";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";

export const dynamic = "force-dynamic";

/** รูปแบบรหัสแต่ละเจ้า (กันวาง secret ผิดช่อง / วางไม่ครบ) */
const ID_RULE: Record<OAuthProvider, { re: RegExp; hint: string }> = {
  google: { re: /^[\w-]+\.apps\.googleusercontent\.com$/, hint: "Client ID ของ Google ต้องลงท้ายด้วย .apps.googleusercontent.com" },
  line: { re: /^\d{6,20}$/, hint: "Channel ID ของ LINE เป็นตัวเลขล้วน (ประมาณ 10 หลัก)" },
  facebook: { re: /^\d{6,25}$/, hint: "App ID ของ Facebook เป็นตัวเลขล้วน (ประมาณ 15–16 หลัก)" },
};

async function shopDomains(sb: ReturnType<typeof supabaseAdmin>, shopId: string): Promise<string[]> {
  const { data } = await sb.from("shop_domains").select("domain").eq("shop_id", shopId).order("created_at");
  return ((data ?? []) as { domain: string }[]).map((d) => d.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()).filter(Boolean);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, request.nextUrl.searchParams.get("shop"));
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const [rows, domains] = await Promise.all([readLoginProviders(sb, shop.id), shopDomains(sb, shop.id)]);
  const providers = Object.fromEntries(
    OAUTH_PROVIDERS.map((p) => {
      const r = rows.get(p);
      const secret = r?.client_secret ?? "";
      return [p, { clientId: r?.client_id ?? "", secretSet: !!secret, secretTail: secret ? `${SECRET_MASK}${secret.slice(-4)}` : "", enabled: r?.enabled ?? true, ready: providerReady(r), updatedAt: r?.updated_at ?? null }];
    })
  );
  const callbacks = Object.fromEntries(OAUTH_PROVIDERS.map((p) => [p, domains.map((d) => callbackUrl(`https://${d}`, p))]));
  return NextResponse.json({ providers, domains, callbacks, tokensReady: memberTokensReady() }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const body = ((await request.json().catch(() => null)) ?? {}) as { shop?: unknown; providers?: Record<string, { clientId?: unknown; clientSecret?: unknown; enabled?: unknown }> };
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; slug: string }>(sb, body.shop, "id, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const before = await readLoginProviders(sb, shop.id);
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const now = new Date().toISOString();
  const changes: Record<string, unknown>[] = [];

  for (const p of OAUTH_PROVIDERS) {
    const v = body.providers?.[p];
    if (!v) continue;
    const old = before.get(p);
    const clientId = String(v.clientId ?? "").trim().slice(0, 300);
    if (clientId && !ID_RULE[p].re.test(clientId)) return NextResponse.json({ error: `${OAUTH_LABEL[p]}: ${ID_RULE[p].hint}` }, { status: 400 });
    const rawSecret = String(v.clientSecret ?? "").trim();
    const keepSecret = !rawSecret || rawSecret.startsWith(SECRET_MASK);
    if (!keepSecret && (rawSecret.length < 8 || rawSecret.length > 300 || /\s/.test(rawSecret))) return NextResponse.json({ error: `${OAUTH_LABEL[p]}: รหัสลับดูไม่ถูกต้อง — คัดลอกมาใหม่ทั้งหมด (ไม่มีช่องว่าง)` }, { status: 400 });
    if (!keepSecret && rawSecret === clientId) return NextResponse.json({ error: `${OAUTH_LABEL[p]}: วางรหัสเดียวกันทั้ง 2 ช่อง — ช่องล่างต้องเป็นรหัสลับ` }, { status: 400 });
    // ลบรหัส (ช่อง ID ว่าง) = ล้างรหัสลับด้วย — ปุ่มนั้นหายจากเว็บ
    const secret = !clientId ? "" : keepSecret ? (old?.client_secret ?? "") : rawSecret;
    const enabled = v.enabled !== false;
    const same = old && old.client_id === clientId && old.client_secret === secret && old.enabled === enabled;
    if (same || (!old && !clientId && !secret)) continue;
    const { error } = await sb.from("store_login_providers").upsert({ shop_id: shop.id, provider: p, client_id: clientId, client_secret: secret, enabled, updated_at: now, updated_by: user?.id ?? null }, { onConflict: "shop_id,provider" });
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    changes.push({ provider: p, client_id_changed: (old?.client_id ?? "") !== clientId, secret_changed: (old?.client_secret ?? "") !== secret, enabled, ready: providerReady({ client_id: clientId, client_secret: secret, enabled }) });
  }

  if (changes.length) {
    await writeAudit(sb, { action: "update", entityType: "store_login_providers", entityId: shop.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { shop: shop.slug, changes } });
  }
  // ปุ่มบนเว็บร้านเปลี่ยนทันที (ไม่ต้องรอแคช 60 วิ)
  const purged = changes.length ? await purgeStorefrontCache(sb, shop.id) : true;
  return NextResponse.json({ ok: true, changed: changes.length, purged });
}
