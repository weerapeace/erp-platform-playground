/**
 * 👤 สมาชิกเว็บร้าน — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎอยู่ lib/website-members.ts
 * ใช้ที่: /api/storefront-member/* (เว็บร้านเรียกด้วยกุญแจภายใน) · /api/website/members (ERP แท็บสมาชิก)
 */
import { PROVIDER_LABEL, resolveLogin, type MemberLoginInput, type MemberProvider } from "@/lib/website-members";
import { MEMBER_ROW_COLS, type MemberRow } from "@/lib/storefront-internal";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export interface MemberSummary {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  phone: string;
  avatarUrl: string | null;
  marketingOptIn: boolean;
  providers: MemberProvider[];
  createdAt: string;
  /** 🧪 สมาชิกทดลอง (เว็บร้านโชว์ป้าย + ปิดปุ่มสั่งซื้อ) */
  isTest: boolean;
}

export async function memberSummary(sb: Admin, m: MemberRow): Promise<MemberSummary> {
  const { data } = await sb.from("store_customer_identities").select("provider").eq("customer_id", m.id);
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    emailVerified: m.email_verified,
    phone: m.phone ?? "",
    avatarUrl: m.avatar_url,
    marketingOptIn: m.marketing_opt_in,
    providers: [...new Set(((data ?? []) as { provider: MemberProvider }[]).map((r) => r.provider))],
    createdAt: m.created_at,
    isTest: !!m.is_test,
  };
}

const MEMBER_COLS = MEMBER_ROW_COLS;

/**
 * แท็บในป๊อปเว็บร้าน: signup = ต้องติ๊กยอมรับนโยบาย (consent) ก่อนสร้างบัญชีใหม่ · login = ไม่สร้างบัญชีใหม่ (ยังไม่เคยสมัคร → need_signup)
 * ไม่ส่ง mode (เว็บร้านรุ่นเก่า) = สร้างให้เลยแบบเดิม
 */
export interface LoginIntent {
  mode?: "login" | "signup";
  consent?: boolean;
  marketing?: boolean;
}
export function sanitizeLoginIntent(raw: unknown): LoginIntent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const mode = r.mode === "login" || r.mode === "signup" ? r.mode : undefined;
  return { mode, consent: r.consent === true, marketing: r.marketing === true };
}

/** เข้าสู่ระบบ: หา/ผูก/สร้างสมาชิกของร้านนี้ตามกฎ resolveLogin */
export async function loginMember(
  sb: Admin,
  shopId: string,
  input: MemberLoginInput,
  intent: LoginIntent = {}
): Promise<{ ok: true; member: MemberRow; created: boolean } | { ok: false; error: string; status: number; code?: "need_signup" | "need_consent" }> {
  const now = new Date().toISOString();
  const { data: ident } = await sb
    .from("store_customer_identities")
    .select("customer_id, store_customers(status)")
    .eq("shop_id", shopId)
    .eq("provider", input.provider)
    .eq("provider_user_id", input.providerUserId)
    .maybeSingle();
  const byIdentity = ident ? { customerId: (ident as { customer_id: string }).customer_id, status: (ident as unknown as { store_customers: { status: string } | null }).store_customers?.status ?? "active" } : null;

  let byEmail: { customerId: string; status: string } | null = null;
  if (!byIdentity && input.email && input.emailVerified) {
    const { data } = await sb.from("store_customers").select("id, status, email_verified").eq("shop_id", shopId).eq("email", input.email).neq("status", "deleted").maybeSingle();
    const row = data as { id: string; status: string; email_verified: boolean } | null;
    // ⚠️ ผูกเข้าบัญชีเดิมได้เฉพาะบัญชีที่ "ยืนยันอีเมลแล้ว" — บัญชีที่สมัครด้วยอีเมลแต่ยังไม่ยืนยัน (อาจเป็นคนอื่นแอบใช้อีเมลนี้)
    //    ห้ามผูก · เจ้าของอีเมลตัวจริง (ยืนยันผ่าน Google แล้ว) ได้อีเมลนี้ไป บัญชีที่ยังไม่ยืนยันถูกปลดอีเมลออก
    if (row && row.email_verified) byEmail = { customerId: row.id, status: row.status };
    else if (row) {
      await sb.from("store_customers").update({ email: null, updated_at: now }).eq("id", row.id);
      // ช่องทาง "อีเมล+รหัส" ของบัญชีที่ถูกปลดอีเมลใช้ต่อไม่ได้แล้ว (ไม่งั้นค้างชื่ออีเมลนี้ไว้ เจ้าของตัวจริงตั้งรหัสผ่านไม่ได้)
      await sb.from("store_customer_identities").delete().eq("customer_id", row.id).eq("provider", "password");
    }
  }

  const d = resolveLogin(input, { byIdentity, byEmail });
  if (d.kind === "blocked") return { ok: false, error: "บัญชีนี้ถูกระงับ — ติดต่อร้านค้า", status: 403 };
  // ✅ PDPA: สร้างบัญชีใหม่ได้เฉพาะตอนติ๊กยอมรับนโยบายแล้ว (แท็บสมัคร) · แท็บเข้าสู่ระบบ = ไม่สร้างให้เงียบ ๆ
  if (d.kind === "create" && intent.mode === "login") return { ok: false, error: "ยังไม่มีบัญชีด้วยช่องทางนี้ — ติ๊กยอมรับนโยบายแล้วกดสมัครสมาชิก", status: 409, code: "need_signup" };
  if (d.kind === "create" && intent.mode === "signup" && !intent.consent) return { ok: false, error: "กรุณาติ๊กยอมรับนโยบายความเป็นส่วนตัวก่อนสมัคร", status: 400, code: "need_consent" };

  let customerId: string;
  let created = false;
  if (d.kind === "create") {
    const { data, error } = await sb
      .from("store_customers")
      .insert({
        shop_id: shopId,
        // อีเมลที่ยังไม่ยืนยัน ไม่เก็บเป็นอีเมลบัญชี (กันชนกับเจ้าของอีเมลตัวจริงที่จะสมัครทีหลัง)
        email: input.emailVerified ? input.email : null,
        email_verified: input.emailVerified,
        name: input.name || (input.email ? input.email.split("@")[0] : "สมาชิก"),
        avatar_url: input.avatarUrl,
        last_login_at: now,
        ...(intent.mode === "signup" ? { terms_accepted_at: now, marketing_opt_in: !!intent.marketing } : {}),
      })
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่", status: 500 };
    customerId = (data as { id: string }).id;
    created = true;
  } else customerId = d.customerId;

  if (d.kind !== "existing") {
    const { error } = await sb.from("store_customer_identities").insert({ customer_id: customerId, shop_id: shopId, provider: input.provider, provider_user_id: input.providerUserId, email: input.email, last_login_at: now });
    if (error && (error as { code?: string }).code !== "23505") return { ok: false, error: "ผูกบัญชีไม่สำเร็จ กรุณาลองใหม่", status: 500 };
  } else {
    await sb.from("store_customer_identities").update({ last_login_at: now }).eq("shop_id", shopId).eq("provider", input.provider).eq("provider_user_id", input.providerUserId);
  }

  // เข้าล่าสุด + เติมรูป/ชื่อที่ยังว่าง (ไม่ทับที่สมาชิกแก้เอง)
  const { data: cur } = await sb.from("store_customers").select(MEMBER_COLS).eq("id", customerId).maybeSingle();
  const m = cur as MemberRow;
  const patch: Record<string, unknown> = { last_login_at: now };
  // สมาชิกเดิมกดจากแท็บสมัคร + ติ๊กยอมรับ = บันทึกเวลายอมรับล่าสุด · ติ๊กรับข่าวสาร = เปิดรับ (ไม่ติ๊ก = ไม่ปิดของเดิม)
  if (intent.mode === "signup" && intent.consent && !created) {
    patch.terms_accepted_at = now;
    if (intent.marketing) patch.marketing_opt_in = true;
  }
  if (!m.avatar_url && input.avatarUrl) patch.avatar_url = input.avatarUrl;
  if (!m.email && input.email && input.emailVerified) {
    patch.email = input.email;
    patch.email_verified = true;
  }
  const { data: after } = await sb.from("store_customers").update(patch).eq("id", customerId).select(MEMBER_COLS).maybeSingle();
  return { ok: true, member: (after ?? m) as MemberRow, created };
}

/**
 * ออเดอร์ของสมาชิก: ผูกกับบัญชี + (ยังไม่ผูก และอีเมลตรงกับอีเมลที่ยืนยันแล้ว "ตรงตัว") — แค่อ่าน ไม่เขียนทับออเดอร์
 * ⚠️ ห้ามใช้ ilike เทียบอีเมลตรง ๆ: "_" "%" เป็นตัวแทนอะไรก็ได้ → อาจเห็นออเดอร์คนอื่น · จึงดึงผู้สมัครมาแล้วเทียบตัวเล็กตรงตัวในโค้ด
 */
export async function memberOrderRows<T extends { id: string; customer_id: string | null; customer_email: string | null }>(
  sb: Admin,
  shopId: string,
  m: MemberRow,
  cols: string,
  limit = 50
): Promise<T[]> {
  const { data: own } = await sb.from("store_orders").select(cols).eq("shop_id", shopId).eq("customer_id", m.id).order("created_at", { ascending: false }).limit(limit);
  let rows = (own ?? []) as unknown as T[];
  if (m.email && m.email_verified) {
    const local = m.email.split("@")[0].replace(/[%_\\]/g, "");
    const { data: guess } = await sb.from("store_orders").select(cols).eq("shop_id", shopId).is("customer_id", null).ilike("customer_email", `%${local}%`).limit(200);
    const exact = ((guess ?? []) as unknown as T[]).filter((o) => (o.customer_email ?? "").trim().toLowerCase() === m.email);
    rows = [...rows, ...exact];
  }
  return rows.sort((a, b) => String((b as unknown as { created_at: string }).created_at).localeCompare(String((a as unknown as { created_at: string }).created_at))).slice(0, limit);
}

/** 🎯 วันสั่งล่าสุดของสมาชิก (ไม่นับยกเลิก) — แบ่งกลุ่ม "ห่างหาย" (lib/website-member-segments) · ดึงทีละ 1,000 แถว */
export async function lastOrderDates(sb: Admin, customerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < customerIds.length; i += 200) {
    const ids = customerIds.slice(i, i + 200);
    for (let from = 0; from < 20000; from += 1000) {
      const { data } = await sb.from("store_orders").select("customer_id, created_at").in("customer_id", ids).neq("status", "cancelled").order("created_at", { ascending: false }).range(from, from + 999);
      const rows = (data ?? []) as { customer_id: string; created_at: string }[];
      for (const r of rows) if (!out.has(r.customer_id)) out.set(r.customer_id, r.created_at);
      if (rows.length < 1000) break;
    }
  }
  return out;
}

/**
 * 🔗 เชื่อมช่องทางเข้าสู่ระบบเพิ่มเข้าบัญชีที่ล็อกอินอยู่ (ใช้ร่วม: /api/storefront-member/link และ /oauth โหมดเชื่อม)
 * ล็อกอินอยู่แล้ว = ยืนยันตัวตนแล้ว จึงผูก LINE/Facebook ได้โดยไม่พึ่งอีเมล · ช่องทางนี้เป็นของสมาชิกคนอื่น = 409 (ไม่ย้ายให้เอง)
 * 🧪 สมาชิกทดลองเชื่อมไม่ได้ (ไม่งั้นพนักงานเข้าด้วย Google ตัวเองแล้วเด้งเข้าบัญชีทดลอง)
 */
export async function linkIdentity(
  sb: Admin,
  shopId: string,
  member: MemberRow,
  p: MemberLoginInput
): Promise<{ ok: true; already: boolean; member: MemberSummary } | { ok: false; error: string; status: number }> {
  if (member.is_test) return { ok: false, error: "บัญชีทดลองเชื่อมช่องทางเข้าสู่ระบบไม่ได้ — ใช้ดูหน้าตาเว็บเท่านั้น", status: 403 };
  const { data: cur } = await sb.from("store_customer_identities").select("customer_id").eq("shop_id", shopId).eq("provider", p.provider).eq("provider_user_id", p.providerUserId).maybeSingle();
  const owner = (cur as { customer_id: string } | null)?.customer_id;
  if (owner && owner !== member.id) return { ok: false, error: `บัญชี ${PROVIDER_LABEL[p.provider]} นี้ใช้กับสมาชิกอีกคนแล้ว — ออกจากระบบแล้วเข้าด้วย ${PROVIDER_LABEL[p.provider]} เพื่อใช้บัญชีนั้น`, status: 409 };
  if (!owner) {
    const { error } = await sb.from("store_customer_identities").insert({ customer_id: member.id, shop_id: shopId, provider: p.provider, provider_user_id: p.providerUserId, email: p.email, last_login_at: new Date().toISOString() });
    if (error) return { ok: false, error: "เชื่อมไม่สำเร็จ กรุณาลองใหม่", status: 500 };
  }
  // บัญชียังไม่มีอีเมล + ช่องทางใหม่ส่งอีเมลที่ยืนยันแล้ว (Google) → ใช้เป็นอีเมลบัญชี (ถ้าไม่ซ้ำกับสมาชิกอื่นในร้าน)
  if (!member.email && p.email && p.emailVerified) {
    const { data: taken } = await sb.from("store_customers").select("id").eq("shop_id", shopId).eq("email", p.email).neq("status", "deleted").maybeSingle();
    if (!taken) await sb.from("store_customers").update({ email: p.email, email_verified: true, updated_at: new Date().toISOString() }).eq("id", member.id);
  }
  const { data: m } = await sb.from("store_customers").select(MEMBER_COLS).eq("id", member.id).maybeSingle();
  return { ok: true, already: !!owner, member: await memberSummary(sb, (m ?? member) as MemberRow) };
}
