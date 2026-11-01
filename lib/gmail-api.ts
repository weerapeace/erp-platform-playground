/**
 * ระบบกลาง: เชื่อม Gmail ต่อกล่องเมล (OAuth "เชื่อม Gmail" ครั้งเดียวต่อกล่อง) แล้วให้ระบบค้นเมล/ดึงไฟล์แนบได้เอง
 * ⚠️ ใช้ฝั่ง server เท่านั้น (API route) — มี client secret + กุญแจถอดรหัส
 *
 * ใช้ครั้งแรกกับ App Subscription "📥 ดึงบิลจากเมล" · โมดูลอื่นที่อยากดึงไฟล์จากเมล (เช่น บิลซัพพลายเออร์) ใช้ตัวนี้ซ้ำได้
 *
 * ตั้งค่า (env บน Vercel): GMAIL_OAUTH_CLIENT_ID + GMAIL_OAUTH_CLIENT_SECRET (OAuth client แบบ Web application)
 *   redirect URI ที่ต้องลงทะเบียนใน Google Cloud = <โดเมนเว็บ>/api/gmail/callback (หรือกำหนดเองด้วย GMAIL_OAUTH_REDIRECT_URI)
 *   GMAIL_TOKEN_KEY (ไม่บังคับ) = กุญแจเข้ารหัส refresh token · ไม่ตั้ง = ใช้ client secret เป็นวัตถุดิบกุญแจ
 * ขอสิทธิ์ gmail.readonly (อ่านอย่างเดียว) · refresh token เก็บในตาราง gmail_connections แบบเข้ารหัส AES-256-GCM
 * ขั้นตอนตั้งค่าสำหรับเจ้าของ: docs/gmail-connect-setup.md
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const clientId = () => process.env.GMAIL_OAUTH_CLIENT_ID ?? "";
const clientSecret = () => process.env.GMAIL_OAUTH_CLIENT_SECRET ?? "";

/** ตั้งค่าครบหรือยัง (ยังไม่ตั้ง = ปุ่มเชื่อม/ดึงจากเมล บอกให้ผู้ดูแลตั้งค่าก่อน) */
export function gmailConfigured(): boolean {
  return !!(clientId() && clientSecret());
}

export function gmailRedirectUri(origin: string): string {
  return process.env.GMAIL_OAUTH_REDIRECT_URI || `${origin}/api/gmail/callback`;
}

export const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

// ── เข้ารหัส refresh token ───────────────────────────────────────────────
function tokenKey(): Buffer {
  return createHash("sha256").update(`erp-gmail-token-v1:${process.env.GMAIL_TOKEN_KEY || clientSecret()}`).digest();
}
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url")}`;
}
function decrypt(enc: string): string | null {
  try {
    const raw = Buffer.from(enc.replace(/^v1\./, ""), "base64url");
    const d = createDecipheriv("aes-256-gcm", tokenKey(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch { return null; } // กุญแจเปลี่ยน/ข้อมูลเสีย → ต้องเชื่อมใหม่
}

// ── state ของ OAuth (เซ็นด้วย HMAC — callback ไม่มี session ผู้ใช้ จึงใช้ state พิสูจน์ว่าใครกดเชื่อม) ──
type StatePayload = { email: string; uid: string | null; ret: string; exp: number };
function stateSig(body: string): string {
  return createHmac("sha256", tokenKey()).update(`state:${body}`).digest("base64url");
}
export function signState(p: Omit<StatePayload, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 15 * 60_000 })).toString("base64url");
  return `${body}.${stateSig(body)}`;
}
export function verifyState(state: string): StatePayload | null {
  const [body, sig] = (state ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(stateSig(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

/** ลิงก์ไปหน้ายินยอมของ Google — login_hint เติมอีเมลกล่องที่จะเชื่อมให้ · prompt=consent เพื่อให้ได้ refresh token ทุกครั้ง */
export function gmailAuthUrl(opts: { email: string; state: string; redirectUri: string }): string {
  const q = new URLSearchParams({
    client_id: clientId(), redirect_uri: opts.redirectUri, response_type: "code", scope: GMAIL_SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", login_hint: opts.email, state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** แลก code เป็น token แล้วถามอีเมลจริงของกล่อง (ผู้ใช้อาจเลือกบัญชีอื่นในหน้า Google) */
export async function exchangeGmailCode(code: string, redirectUri: string)
  : Promise<{ email: string; refreshToken: string; scope: string } | { error: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) return { error: j.error_description || j.error || `token ${res.status}` };
  const scope = String(j.scope ?? "");
  if (!scope.split(" ").includes(GMAIL_SCOPE)) return { error: "no_scope" };
  if (!j.refresh_token) return { error: "no_refresh_token" };
  const prof = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${j.access_token}` } });
  const pj = await prof.json().catch(() => ({}));
  if (!prof.ok || !pj.emailAddress) return { error: "อ่านอีเมลของบัญชีไม่ได้" };
  cacheToken(normEmail(pj.emailAddress), j.access_token, Number(j.expires_in) || 3600);
  return { email: normEmail(pj.emailAddress), refreshToken: String(j.refresh_token), scope };
}

// ── ตารางการเชื่อม ───────────────────────────────────────────────────────
export type GmailConnection = { email: string; connected_at: string; last_used_at: string | null; last_error: string };

export async function listGmailConnections(db: SupabaseClient): Promise<GmailConnection[]> {
  const { data } = await db.from("gmail_connections").select("email, connected_at, last_used_at, last_error").order("email");
  return (data ?? []) as GmailConnection[];
}

export async function saveGmailConnection(db: SupabaseClient, c: { email: string; refreshToken: string; scope: string; uid: string | null }) {
  return db.from("gmail_connections").upsert({
    email: normEmail(c.email), refresh_token_enc: encrypt(c.refreshToken), scope: c.scope,
    connected_by: c.uid, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: "",
  });
}

/** เลิกเชื่อม: ยกเลิกสิทธิ์ที่ Google (best-effort) + ลบแถว */
export async function deleteGmailConnection(db: SupabaseClient, email: string): Promise<{ error: string | null }> {
  const e = normEmail(email);
  const { data } = await db.from("gmail_connections").select("refresh_token_enc").eq("email", e).maybeSingle();
  const rt = data?.refresh_token_enc ? decrypt(data.refresh_token_enc) : null;
  if (rt) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: "POST" }).catch(() => null);
  tokenCache.delete(e);
  const { error } = await db.from("gmail_connections").delete().eq("email", e);
  return { error: error?.message ?? null };
}

// ── access token (แคชในหน่วยความจำ ~ชั่วโมงละครั้ง) ─────────────────────────
const tokenCache = new Map<string, { token: string; exp: number }>();
function cacheToken(email: string, token: string, ttlSec: number) {
  tokenCache.set(email, { token, exp: Date.now() + (ttlSec - 120) * 1000 });
}

export type GmailTokenResult = { token: string } | { error: "not_configured" | "not_connected" | "reconnect"; message: string };

/** ขอ access token ของกล่องนี้ — ไม่ได้เชื่อม/ถูกยกเลิกสิทธิ์ → บอกให้เชื่อมใหม่ */
export async function getGmailToken(db: SupabaseClient, email: string): Promise<GmailTokenResult> {
  const e = normEmail(email);
  if (!gmailConfigured()) return { error: "not_configured", message: "ผู้ดูแลยังไม่ได้ตั้งค่าการเชื่อม Gmail" };
  const hit = tokenCache.get(e);
  if (hit && hit.exp > Date.now()) return { token: hit.token };
  const { data } = await db.from("gmail_connections").select("refresh_token_enc").eq("email", e).maybeSingle();
  if (!data) return { error: "not_connected", message: `ยังไม่ได้เชื่อม Gmail ของ ${e}` };
  const rt = decrypt(data.refresh_token_enc);
  if (!rt) return { error: "reconnect", message: `การเชื่อม Gmail ของ ${e} ใช้ไม่ได้แล้ว — กดเชื่อมใหม่` };
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: rt, client_id: clientId(), client_secret: clientSecret(), grant_type: "refresh_token" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    // invalid_grant = ผู้ใช้ยกเลิกสิทธิ์/เปลี่ยนรหัสผ่าน/token หมดอายุ → ต้องเชื่อมใหม่
    const why = String(j.error ?? res.status);
    await db.from("gmail_connections").update({ last_error: why, updated_at: new Date().toISOString() }).eq("email", e);
    return { error: "reconnect", message: `การเชื่อม Gmail ของ ${e} หมดอายุหรือถูกยกเลิก — กดเชื่อมใหม่ (${why})` };
  }
  cacheToken(e, j.access_token, Number(j.expires_in) || 3600);
  await db.from("gmail_connections").update({ last_used_at: new Date().toISOString(), last_error: "" }).eq("email", e);
  return { token: j.access_token };
}

// ── อ่านเมล ─────────────────────────────────────────────────────────────
export type GmailAttachment = { partId: string; filename: string; mimeType: string; size: number; attachmentId: string | null; inlineData: string | null };
export type GmailMessage = { id: string; subject: string; from: string; date: string | null; snippet: string; attachments: GmailAttachment[] };

type GPart = { partId?: string; filename?: string; mimeType?: string; headers?: { name: string; value: string }[]; body?: { size?: number; attachmentId?: string; data?: string }; parts?: GPart[] };

async function gget(token: string, path: string): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; message: string }> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, message: String((json as { error?: { message?: string } }).error?.message ?? res.status) };
  return { ok: true, json };
}

/** ค้นเมลด้วยคำค้นแบบช่องค้นหา Gmail — คืนรหัสเมล (ใหม่สุดก่อน) */
export async function gmailSearch(token: string, q: string, max = 10): Promise<{ ids: string[]; error: string | null }> {
  const r = await gget(token, `/messages?maxResults=${max}&q=${encodeURIComponent(q)}`);
  if (!r.ok) return { ids: [], error: r.message };
  const msgs = (r.json.messages ?? []) as { id: string }[];
  return { ids: msgs.map((m) => m.id), error: null };
}

/** หัวเรื่อง/ผู้ส่ง/วันที่ + รายการไฟล์แนบของเมล (ยังไม่โหลดเนื้อไฟล์) */
export async function gmailGetMessage(token: string, id: string): Promise<GmailMessage | null> {
  const r = await gget(token, `/messages/${encodeURIComponent(id)}?format=full`);
  if (!r.ok) return null;
  const payload = (r.json.payload ?? {}) as GPart;
  const header = (n: string) => payload.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  const attachments: GmailAttachment[] = [];
  const walk = (p: GPart) => {
    if (p.filename && (p.body?.attachmentId || p.body?.data)) {
      attachments.push({
        partId: p.partId ?? "", filename: p.filename, mimeType: p.mimeType ?? "", size: p.body?.size ?? 0,
        attachmentId: p.body?.attachmentId ?? null, inlineData: p.body?.attachmentId ? null : p.body?.data ?? null,
      });
    }
    p.parts?.forEach(walk);
  };
  walk(payload);
  const ms = Number(r.json.internalDate);
  return {
    id, subject: header("subject"), from: header("from"), snippet: String(r.json.snippet ?? ""),
    date: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null, attachments,
  };
}

/** เนื้อไฟล์แนบจากข้อมูลเมลที่อ่านมาแล้ว (attachmentId ใช้ได้เฉพาะรอบที่อ่านเมลนั้น) */
export async function gmailAttachmentBytes(token: string, messageId: string, att: GmailAttachment): Promise<Uint8Array | null> {
  let data = att.inlineData;
  if (!data && att.attachmentId) {
    const r = await gget(token, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(att.attachmentId)}`);
    if (!r.ok) return null;
    data = String(r.json.data ?? "");
  }
  return data ? new Uint8Array(Buffer.from(data, "base64url")) : null;
}

/** เนื้อไฟล์แนบ (ระบุด้วย partId เพราะ attachmentId ของ Gmail เปลี่ยนทุกครั้งที่อ่านเมล) + ข้อมูลเมลนั้น */
export async function gmailGetAttachment(token: string, messageId: string, partId: string)
  : Promise<{ bytes: Uint8Array; attachment: GmailAttachment; message: GmailMessage } | null> {
  const message = await gmailGetMessage(token, messageId);
  const attachment = message?.attachments.find((a) => a.partId === partId);
  if (!message || !attachment) return null;
  const bytes = await gmailAttachmentBytes(token, messageId, attachment);
  return bytes ? { bytes, attachment, message } : null;
}
