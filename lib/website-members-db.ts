/**
 * 👤 สมาชิกเว็บร้าน — ส่วนที่อ่าน/เขียนฐานข้อมูล (ฝั่งเซิร์ฟเวอร์เท่านั้น) · กฎอยู่ lib/website-members.ts
 * ใช้ที่: /api/storefront-member/* (เว็บร้านเรียกด้วยกุญแจภายใน) · /api/website/members (ERP แท็บสมาชิก)
 */
import { resolveLogin, type MemberLoginInput, type MemberProvider } from "@/lib/website-members";
import type { MemberRow } from "@/lib/storefront-internal";

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
  };
}

const MEMBER_COLS = "id, shop_id, email, email_verified, name, phone, avatar_url, marketing_opt_in, status, created_at";

/** เข้าสู่ระบบ: หา/ผูก/สร้างสมาชิกของร้านนี้ตามกฎ resolveLogin */
export async function loginMember(sb: Admin, shopId: string, input: MemberLoginInput): Promise<{ ok: true; member: MemberRow; created: boolean } | { ok: false; error: string; status: number }> {
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
