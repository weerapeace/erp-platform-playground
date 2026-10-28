/**
 * 🔑 สมาชิกแบบอีเมล + รหัสผ่าน — /api/storefront-member/password  (POST { action, ... })
 *
 *  register { email, password, name, origin, consent?, marketing? } → สร้างบัญชี (ยังไม่ยืนยัน) + ส่งลิงก์ยืนยันอีเมล · consent = ✅ เวลายอมรับนโยบาย (PDPA)
 *  resend   { email, origin }                 → ส่งลิงก์ยืนยันใหม่ (ตอบ ok เสมอ ไม่บอกว่ามีบัญชีไหม)
 *  verify   { token }                         → ยืนยันอีเมล → { member } (เว็บร้านเข้าสู่ระบบให้)
 *  login    { email, password }               → { member } · ผิด 5 ครั้งล็อก 15 นาที · ยังไม่ยืนยัน = code "unverified"
 *  forgot   { email, origin }                 → ส่งลิงก์ตั้งรหัสใหม่ (ตอบ ok เสมอ)
 *  reset    { token, password }               → ตั้งรหัสใหม่ + ถือว่ายืนยันอีเมลแล้ว → { member }
 *  change   { current?, password } + x-storefront-member → ตั้ง/เปลี่ยนรหัส (มีรหัสเดิม = ต้องใส่รหัสเดิม)
 *
 * ด่าน: กุญแจภายใน (lib/storefront-internal) · อีเมลส่งด้วยของกลาง lib/email (ยังไม่ตั้ง Resend = บอก email-not-configured)
 * ลิงก์ในอีเมลชี้โดเมนร้านที่ลงทะเบียนใน shop_domains เท่านั้น (กันลิงก์ไปเว็บปลอม)
 */
import { NextRequest, NextResponse } from "next/server";
import { denyTestMember, guardMember, guardStorefront, memberLoginBody, storefrontJson, MEMBER_ROW_COLS, type MemberRow } from "@/lib/storefront-internal";
import { trustedShopOrigin } from "@/lib/website-shop";
import { memberSummary } from "@/lib/website-members-db";
import { sendEmail, emailDevEcho, type EmailMessage } from "@/lib/email";
import { resetPasswordMessage, verifyEmailMessage } from "@/lib/member-emails";
import { customerLang } from "@/lib/customer-messages";
import {
  LOGIN_LOCK_MIN,
  LOGIN_MAX_FAILS,
  TOKEN_MAX_PER_HOUR,
  TOKEN_TTL_MIN,
  hashPassword,
  newLinkToken,
  passwordProblem,
  tokenHash,
  verifyPassword,
} from "@/lib/member-password";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;
const COLS = `${MEMBER_ROW_COLS}, password_hash, failed_login_count, locked_until`;
type Row = MemberRow & { password_hash: string | null; failed_login_count: number; locked_until: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (v: unknown) => String(v ?? "").trim().toLowerCase().slice(0, 200);
const GENERIC_FAIL = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
// hash ตัวอย่างไว้เทียบเมื่อไม่พบบัญชี — เวลาตอบเท่ากัน (ไม่บอกว่าอีเมลนี้มีบัญชีไหม)
const DUMMY_HASH = hashPassword("dummy-password-1");

/** origin ที่เว็บร้านส่งมา ต้องเป็นโดเมนของร้านนี้ — ของกลาง lib/website-shop trustedShopOrigin (ใช้ร่วมกับ OAuth) */
const trustedOrigin = trustedShopOrigin;

async function issueToken(sb: Admin, customerId: string, kind: "verify" | "reset"): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from("store_customer_tokens").select("id", { count: "exact", head: true }).eq("customer_id", customerId).eq("kind", kind).gte("created_at", since);
  if ((count ?? 0) >= TOKEN_MAX_PER_HOUR) return { ok: false, error: "ส่งอีเมลบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  const t = newLinkToken();
  const { error } = await sb.from("store_customer_tokens").insert({ customer_id: customerId, kind, token_hash: t.hash, expires_at: new Date(Date.now() + TOKEN_TTL_MIN[kind] * 60_000).toISOString() });
  if (error) return { ok: false, error: "สร้างลิงก์ไม่สำเร็จ" };
  return { ok: true, token: t.token };
}

async function consumeToken(sb: Admin, token: unknown, kind: "verify" | "reset"): Promise<string | null> {
  const { data } = await sb.from("store_customer_tokens").select("id, customer_id, expires_at, used_at").eq("token_hash", tokenHash(String(token ?? ""))).eq("kind", kind).maybeSingle();
  const t = data as { id: string; customer_id: string; expires_at: string; used_at: string | null } | null;
  if (!t || t.used_at || new Date(t.expires_at) < new Date()) return null;
  const { data: upd } = await sb.from("store_customer_tokens").update({ used_at: new Date().toISOString() }).eq("id", t.id).is("used_at", null).select("id").maybeSingle();
  return upd ? t.customer_id : null;
}

async function ensurePasswordIdentity(sb: Admin, m: { id: string; shop_id: string; email: string | null }) {
  if (!m.email) return;
  await sb.from("store_customer_identities").upsert({ customer_id: m.id, shop_id: m.shop_id, provider: "password", provider_user_id: m.email, email: m.email }, { onConflict: "shop_id,provider,provider_user_id", ignoreDuplicates: true });
}

const mail = async (m: EmailMessage) => {
  const r = await sendEmail(m);
  return r.ok ? { ok: true as const, devLink: r.devEcho ? (r.devEcho.text.match(/https?:\/\/\S+/)?.[0] ?? null) : null } : { ok: false as const, error: r.error };
};

const emailError = (e: string) => (e === "email-not-configured" ? "ร้านยังไม่ได้ตั้งค่าการส่งอีเมล — เข้าด้วย Google/LINE/Facebook แทนได้" : "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "change") {
    const g = await guardMember(request);
    if (g instanceof NextResponse) return g;
    const denied = denyTestMember(g.member, "ตั้งรหัสผ่าน");
    if (denied) return denied;
    const prob = passwordProblem(body.password);
    if (prob) return storefrontJson({ ok: false, error: prob }, 400);
    const { data } = await g.sb.from("store_customers").select(COLS).eq("id", g.member.id).maybeSingle();
    const m = data as Row;
    if (!m.email) return storefrontJson({ ok: false, error: "บัญชีนี้ยังไม่มีอีเมล — เชื่อม Google ก่อน จึงตั้งรหัสผ่านได้" }, 400);
    if (m.password_hash && !verifyPassword(String(body.current ?? ""), m.password_hash)) return storefrontJson({ ok: false, error: "รหัสผ่านเดิมไม่ถูกต้อง" }, 400);
    await g.sb.from("store_customers").update({ password_hash: hashPassword(String(body.password)), updated_at: new Date().toISOString() }).eq("id", m.id);
    await ensurePasswordIdentity(g.sb, m);
    return storefrontJson({ ok: true, member: await memberSummary(g.sb, m) }, 200);
  }

  const g = await guardStorefront(request);
  if (g instanceof NextResponse) return g;
  const { sb, shop } = g;
  const now = new Date().toISOString();

  if (action === "register" || action === "resend" || action === "forgot") {
    const email = cleanEmail(body.email);
    if (!EMAIL_RE.test(email)) return storefrontJson({ ok: false, error: "กรุณากรอกอีเมลให้ถูกต้อง" }, 400);
    const origin = await trustedOrigin(sb, shop.id, body.origin);
    if (!origin) return storefrontJson({ ok: false, error: "โดเมนไม่ถูกต้อง" }, 400);
    // 🌐 อีเมลเป็นภาษาของหน้าที่ลูกค้ากด · ลิงก์พากลับหน้า /en ด้วย
    const lang = customerLang(body.lang);
    const base = lang === "en" ? `${origin}/en` : origin;
    const { data: ex } = await sb.from("store_customers").select(COLS).eq("shop_id", shop.id).eq("email", email).neq("status", "deleted").maybeSingle();
    let m = ex as Row | null;

    if (action === "register") {
      const prob = passwordProblem(body.password);
      if (prob) return storefrontJson({ ok: false, error: prob }, 400);
      const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (name.length < 1) return storefrontJson({ ok: false, error: "กรุณากรอกชื่อ" }, 400);
      if (m && m.email_verified) {
        return storefrontJson({ ok: false, error: m.password_hash ? "อีเมลนี้มีบัญชีแล้ว — เข้าสู่ระบบ หรือกด “ลืมรหัสผ่าน”" : "อีเมลนี้สมัครด้วย Google/LINE/Facebook แล้ว — เข้าด้วยช่องทางนั้น หรือกด “ลืมรหัสผ่าน” เพื่อตั้งรหัสผ่าน" }, 409);
      }
      if (m && m.status === "blocked") return storefrontJson({ ok: false, error: "บัญชีนี้ถูกระงับ — ติดต่อร้านค้า" }, 403);
      const hash = hashPassword(String(body.password));
      // ✅ ติ๊กยอมรับนโยบายในฟอร์มสมัคร = บันทึกเวลายอมรับ + รับข่าวสารตามที่ติ๊ก
      const consent = body.consent === true ? { terms_accepted_at: now, marketing_opt_in: body.marketing === true } : {};
      if (m) {
        // บัญชีเดิมยังไม่ยืนยัน → ใช้ข้อมูลล่าสุด + ลิงก์ยืนยันเก่าใช้ไม่ได้แล้ว (กันคนที่สมัครค้างไว้ยืนยันด้วยรหัสของตัวเอง)
        await sb.from("store_customer_tokens").update({ used_at: now }).eq("customer_id", m.id).eq("kind", "verify").is("used_at", null);
        await sb.from("store_customers").update({ password_hash: hash, name, updated_at: now, ...consent }).eq("id", m.id);
      } else {
        const { data: created, error } = await sb.from("store_customers").insert({ shop_id: shop.id, email, email_verified: false, name, password_hash: hash, ...consent }).select(COLS).maybeSingle();
        if (error || !created) return storefrontJson({ ok: false, error: "สมัครไม่สำเร็จ กรุณาลองใหม่" }, 500);
        m = created as Row;
      }
      await ensurePasswordIdentity(sb, { id: m.id, shop_id: shop.id, email });
      const t = await issueToken(sb, m.id, "verify");
      if (!t.ok) return storefrontJson({ ok: false, error: t.error }, 429);
      const r = await mail(verifyEmailMessage(email, shop.name, `${base}/account/verify?token=${t.token}`, lang));
      if (!r.ok) return storefrontJson({ ok: false, error: emailError(r.error) }, 503);
      return storefrontJson({ ok: true, ...(r.devLink && emailDevEcho() ? { devLink: r.devLink } : {}) }, 200);
    }

    // resend / forgot: ไม่บอกว่ามีบัญชีไหม (ตอบ ok เหมือนกันเสมอ)
    if (m && m.status === "active") {
      if (action === "resend" && !m.email_verified) {
        const t = await issueToken(sb, m.id, "verify");
        if (t.ok) {
          const r = await mail(verifyEmailMessage(email, shop.name, `${base}/account/verify?token=${t.token}`, lang));
          if (!r.ok && r.error === "email-not-configured") return storefrontJson({ ok: false, error: emailError(r.error) }, 503);
          if (r.ok && r.devLink && emailDevEcho()) return storefrontJson({ ok: true, devLink: r.devLink }, 200);
        }
      }
      if (action === "forgot") {
        const t = await issueToken(sb, m.id, "reset");
        if (t.ok) {
          const r = await mail(resetPasswordMessage(email, shop.name, `${base}/account/reset?token=${t.token}`, lang));
          if (!r.ok && r.error === "email-not-configured") return storefrontJson({ ok: false, error: emailError(r.error) }, 503);
          if (r.ok && r.devLink && emailDevEcho()) return storefrontJson({ ok: true, devLink: r.devLink }, 200);
        }
      }
    }
    return storefrontJson({ ok: true }, 200);
  }

  if (action === "verify") {
    const id = await consumeToken(sb, body.token, "verify");
    if (!id) return storefrontJson({ ok: false, error: "ลิงก์ยืนยันหมดอายุหรือถูกใช้แล้ว — ขอลิงก์ใหม่ได้ที่หน้าเข้าสู่ระบบ" }, 400);
    const { data } = await sb.from("store_customers").update({ email_verified: true, last_login_at: now, updated_at: now }).eq("id", id).eq("shop_id", shop.id).eq("status", "active").select(COLS).maybeSingle();
    if (!data) return storefrontJson({ ok: false, error: "ไม่พบบัญชี" }, 404);
    return storefrontJson({ ok: true, ...memberLoginBody(shop, await memberSummary(sb, data as Row)) }, 200);
  }

  if (action === "reset") {
    const prob = passwordProblem(body.password);
    if (prob) return storefrontJson({ ok: false, error: prob }, 400);
    const id = await consumeToken(sb, body.token, "reset");
    if (!id) return storefrontJson({ ok: false, error: "ลิงก์หมดอายุหรือถูกใช้แล้ว — ขอลิงก์ใหม่ได้ที่ “ลืมรหัสผ่าน”" }, 400);
    // เปิดลิงก์จากอีเมลได้ = เป็นเจ้าของอีเมลจริง → ถือว่ายืนยันอีเมลแล้ว + ปลดล็อก
    const { data } = await sb
      .from("store_customers")
      .update({ password_hash: hashPassword(String(body.password)), email_verified: true, failed_login_count: 0, locked_until: null, last_login_at: now, updated_at: now })
      .eq("id", id)
      .eq("shop_id", shop.id)
      .eq("status", "active")
      .select(COLS)
      .maybeSingle();
    if (!data) return storefrontJson({ ok: false, error: "ไม่พบบัญชี" }, 404);
    await sb.from("store_customer_tokens").update({ used_at: now }).eq("customer_id", id).eq("kind", "reset").is("used_at", null);
    await ensurePasswordIdentity(sb, data as Row);
    return storefrontJson({ ok: true, ...memberLoginBody(shop, await memberSummary(sb, data as Row)) }, 200);
  }

  if (action === "login") {
    const email = cleanEmail(body.email);
    const pw = String(body.password ?? "");
    const { data } = EMAIL_RE.test(email) ? await sb.from("store_customers").select(COLS).eq("shop_id", shop.id).eq("email", email).neq("status", "deleted").maybeSingle() : { data: null };
    const m = data as Row | null;
    if (!m || !m.password_hash) {
      verifyPassword(pw, DUMMY_HASH);
      return storefrontJson({ ok: false, error: GENERIC_FAIL }, 401);
    }
    if (m.status === "blocked") return storefrontJson({ ok: false, error: "บัญชีนี้ถูกระงับ — ติดต่อร้านค้า" }, 403);
    if (m.locked_until && new Date(m.locked_until) > new Date()) {
      const min = Math.ceil((new Date(m.locked_until).getTime() - Date.now()) / 60_000);
      return storefrontJson({ ok: false, error: `ใส่รหัสผิดหลายครั้ง กรุณารออีก ${min} นาที หรือกด “ลืมรหัสผ่าน”` }, 429);
    }
    if (!verifyPassword(pw, m.password_hash)) {
      const fails = (m.failed_login_count ?? 0) + 1;
      const lock = fails >= LOGIN_MAX_FAILS;
      await sb.from("store_customers").update({ failed_login_count: lock ? 0 : fails, locked_until: lock ? new Date(Date.now() + LOGIN_LOCK_MIN * 60_000).toISOString() : null }).eq("id", m.id);
      return storefrontJson({ ok: false, error: lock ? `ใส่รหัสผิด ${LOGIN_MAX_FAILS} ครั้ง — ล็อก ${LOGIN_LOCK_MIN} นาที (หรือกด “ลืมรหัสผ่าน”)` : GENERIC_FAIL }, 401);
    }
    if (!m.email_verified) return storefrontJson({ ok: false, code: "unverified", error: "ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ในอีเมลก่อน (ขอลิงก์ใหม่ได้)" }, 403);
    await sb.from("store_customers").update({ failed_login_count: 0, locked_until: null, last_login_at: now }).eq("id", m.id);
    await ensurePasswordIdentity(sb, m);
    return storefrontJson({ ok: true, ...memberLoginBody(shop, await memberSummary(sb, m), m.is_test) }, 200);
  }

  return storefrontJson({ ok: false, error: "ไม่รู้จักคำสั่ง" }, 400);
}
