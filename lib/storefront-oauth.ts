/**
 * 🔑 เข้าสู่ระบบเว็บร้านด้วย Google / LINE / Facebook — ฝั่ง ERP (เซิร์ฟเวอร์เท่านั้น ห้าม import ในโค้ด "use client")
 *
 * รหัสของผู้ให้บริการ "ต่อร้าน" เก็บในตาราง store_login_providers (เจ้าของวางในหน้า ERP › เว็บร้าน › 👥 สมาชิก › 🔑)
 *   - Client ID เปิดเผยได้ (อยู่ในลิงก์หน้ายินยอมอยู่แล้ว) → ส่งให้เว็บร้านทาง /api/public/storefront/member-config
 *   - Client secret อยู่ใน ERP เท่านั้น — หน้าจอเห็นแค่ ••••4 ตัวท้าย · ERP เป็นคนแลก code เอง (/api/storefront-member/oauth)
 * ลำดับ: เว็บร้านพาลูกค้าไปหน้ายินยอม (state + PKCE ในคุกกี้ของเว็บร้าน) → กลับมา callback ของเว็บร้าน
 *        → เว็บร้านส่ง { code, verifier, redirectUri } มา ERP → ERP แลก code กับผู้ให้บริการตรง (TLS) → โปรไฟล์ → หา/สร้างสมาชิก
 * redirectUri ต้องเป็น https://<โดเมนในshop_domains>/api/auth/<p>/callback (ผู้ให้บริการก็ตรวจซ้ำกับที่ลงทะเบียนไว้)
 *
 * ⚠️ อีเมล "ยืนยันแล้ว" (ผูกเข้าบัญชีเดิมอัตโนมัติ) = เฉพาะ Google ที่ส่ง email_verified=true · LINE/Facebook ถือว่ายังไม่ยืนยัน
 * Facebook: เรียก Graph แบบไม่ระบุเวอร์ชัน (ตามที่ตั้งในแอป Meta) + appsecret_proof (เหมือนเว็บร้าน src/lib/member/oauth.ts)
 */
import { createHmac } from "crypto";
import type { MemberLoginInput } from "@/lib/website-members";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export type OAuthProvider = "google" | "line" | "facebook";
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["google", "line", "facebook"];
export const OAUTH_LABEL: Record<OAuthProvider, string> = { google: "Google", line: "LINE", facebook: "Facebook" };
/** ชื่อช่องในหน้าตั้งค่า (ตามคำที่หน้าเว็บของผู้ให้บริการใช้ — เจ้าของจะหาเจอง่าย) */
export const OAUTH_FIELD_LABEL: Record<OAuthProvider, { id: string; secret: string }> = {
  google: { id: "Client ID", secret: "Client secret" },
  line: { id: "Channel ID", secret: "Channel secret" },
  facebook: { id: "App ID", secret: "App secret" },
};

export interface LoginProviderRow {
  provider: OAuthProvider;
  client_id: string;
  client_secret: string;
  enabled: boolean;
  updated_at?: string | null;
}

/** ตั้งครบ + เปิดอยู่ = ปุ่มขึ้นบนเว็บร้าน */
export const providerReady = (r: Pick<LoginProviderRow, "client_id" | "client_secret" | "enabled"> | null | undefined): boolean =>
  !!r && r.enabled && !!r.client_id.trim() && !!r.client_secret.trim();

export async function readLoginProviders(sb: Admin, shopId: string): Promise<Map<OAuthProvider, LoginProviderRow>> {
  const { data } = await sb.from("store_login_providers").select("provider, client_id, client_secret, enabled, updated_at").eq("shop_id", shopId);
  const out = new Map<OAuthProvider, LoginProviderRow>();
  for (const r of (data ?? []) as LoginProviderRow[]) if (OAUTH_PROVIDERS.includes(r.provider)) out.set(r.provider, r);
  return out;
}

/** ที่อยู่ callback ที่ต้องลงทะเบียนกับผู้ให้บริการ (หน้าตั้งค่าโชว์ให้คัดลอก) */
export const callbackUrl = (origin: string, p: OAuthProvider) => `${origin.replace(/\/+$/, "")}/api/auth/${p}/callback`;

/** redirectUri ที่เว็บร้านส่งมา ต้องเป็น callback ของช่องทางนี้บน origin ที่เชื่อถือได้เท่านั้น */
export function redirectMatches(redirectUri: unknown, trustedOrigin: string | null, p: OAuthProvider): boolean {
  return !!trustedOrigin && typeof redirectUri === "string" && redirectUri === callbackUrl(trustedOrigin, p);
}

/** อ่าน payload ของ id_token (ได้ตรงจาก token endpoint ของผู้ให้บริการผ่าน TLS ฝั่งเซิร์ฟเวอร์ — ตามมาตรฐาน OIDC ไม่ต้องตรวจลายเซ็นซ้ำ) แล้วเช็ก aud/iss/exp */
export function readIdToken(idToken: unknown, want: { aud: string; iss: readonly string[] }, nowMs = Date.now()): Record<string, unknown> | null {
  if (typeof idToken !== "string") return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const c = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    const aud = c.aud;
    const audOk = Array.isArray(aud) ? aud.includes(want.aud) : aud === want.aud;
    if (!audOk || !want.iss.includes(String(c.iss ?? ""))) return null;
    if (typeof c.exp === "number" && c.exp * 1000 < nowMs - 60_000) return null;
    if (typeof c.sub !== "string" || !c.sub) return null;
    return c;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const TIMEOUT = 10_000;

async function postForm(url: string, form: Record<string, string>): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return res.ok ? j : null;
}

export type ExchangeResult = { ok: true; profile: MemberLoginInput } | { ok: false; error: string };

/** แลก code → โปรไฟล์ (ใช้กับกฎผูกบัญชี lib/website-members-db loginMember) */
export async function exchangeOAuthCode(
  p: OAuthProvider,
  creds: { clientId: string; clientSecret: string },
  a: { code: string; verifier: string | null; redirectUri: string }
): Promise<ExchangeResult> {
  try {
    if (p === "facebook") {
      const tokenUrl = new URL("https://graph.facebook.com/oauth/access_token");
      tokenUrl.searchParams.set("client_id", creds.clientId);
      tokenUrl.searchParams.set("client_secret", creds.clientSecret);
      tokenUrl.searchParams.set("redirect_uri", a.redirectUri);
      tokenUrl.searchParams.set("code", a.code);
      const t = await fetch(tokenUrl, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
      const tj = (await t.json().catch(() => ({}))) as { access_token?: string };
      if (!t.ok || !tj.access_token) return { ok: false, error: "facebook-token" };
      const proof = createHmac("sha256", creds.clientSecret).update(tj.access_token).digest("hex");
      const me = new URL("https://graph.facebook.com/me");
      me.searchParams.set("fields", "id,name,email,picture.type(large)");
      me.searchParams.set("access_token", tj.access_token);
      me.searchParams.set("appsecret_proof", proof);
      const res = await fetch(me, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
      const j = (await res.json().catch(() => ({}))) as { id?: string; name?: string; email?: string; picture?: { data?: { url?: string; is_silhouette?: boolean } } };
      if (!res.ok || !j.id) return { ok: false, error: "facebook-profile" };
      const email = (j.email ?? "").toLowerCase();
      return { ok: true, profile: { provider: "facebook", providerUserId: j.id, email: email || null, emailVerified: false, name: (j.name ?? "").slice(0, 120), avatarUrl: j.picture?.data?.is_silhouette ? null : (j.picture?.data?.url ?? null) } };
    }
    if (!a.verifier) return { ok: false, error: "missing-verifier" };
    const isGoogle = p === "google";
    const tj = await postForm(isGoogle ? "https://oauth2.googleapis.com/token" : "https://api.line.me/oauth2/v2.1/token", {
      grant_type: "authorization_code",
      code: a.code,
      redirect_uri: a.redirectUri,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code_verifier: a.verifier,
    });
    const c = readIdToken(tj?.id_token, { aud: creds.clientId, iss: isGoogle ? ["https://accounts.google.com", "accounts.google.com"] : ["https://access.line.me"] });
    if (!c) return { ok: false, error: `${p}-token` };
    const email = str(c.email).toLowerCase();
    const avatar = str(c.picture);
    return {
      ok: true,
      profile: {
        provider: p,
        providerUserId: str(c.sub),
        email: email || null,
        emailVerified: isGoogle && !!email && c.email_verified === true,
        name: str(c.name).slice(0, 120),
        avatarUrl: /^https:\/\//i.test(avatar) ? avatar : null,
      },
    };
  } catch {
    return { ok: false, error: `${p}-network` };
  }
}
