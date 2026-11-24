/**
 * งานหลังขาย — ตัวช่วยฝั่งเซิร์ฟเวอร์ (ใช้ร่วมกันทุก API ใน app/api/order-ops/*)
 * ตาราง: order_instructions · order_waitlist · after_sales_cases · order_ops_options
 * ทุกการเขียนต้องผ่าน guardApi + writeAudit (changes: auditChangeMeta) · ลบ = ย้ายลงถังขยะ (deleted_at)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { cleanOrderNo } from "@/lib/order-ops";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;

export const OPS_TABLES = {
  instructions: "order_instructions",
  waitlist: "order_waitlist",
  cases: "after_sales_cases",
} as const;
export type OpsTableKey = keyof typeof OPS_TABLES;

/** entity_type ในประวัติ (lib/audit-entities) */
export const OPS_ENTITY: Record<OpsTableKey, string> = {
  instructions: "order_instructions",
  waitlist: "order_waitlist",
  cases: "after_sales_cases",
};

export async function whoAmI(request: Request, admin: Admin): Promise<{ id: string | null; name: string | null }> {
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return { id: null, name: null };
    const { data } = await admin.from("user_profiles").select("display_name, username, email").eq("id", user.id).maybeSingle();
    const p = data as { display_name?: string; username?: string; email?: string } | null;
    return { id: user.id, name: p?.display_name || p?.username || p?.email || user.email || null };
  } catch {
    return { id: null, name: null };
  }
}

export type OrderHit = {
  id: string;
  order_no: string;
  platform: string | null;
  customer_name: string | null;
  ordered_at: string | null;
  status: string | null;
  items: { sku: string | null; name: string | null; qty: number; sku_id: string | null }[];
};

/** หาออเดอร์จากศูนย์ออเดอร์ด้วยเลขออเดอร์ (ตรงตัว) — ไม่เจอ = null (ใบเก่า/ยังไม่ดึง ก็ยังพิมพ์เองได้) */
export async function findPlatformOrder(admin: Admin, raw: string): Promise<OrderHit | null> {
  const code = cleanOrderNo(raw);
  if (!code || code.length < 4) return null;
  const variants = [...new Set([code, code.toUpperCase()])];
  const ors = variants.flatMap((c) => [`order_no.eq."${c.replace(/"/g, "")}"`, `external_order_id.eq."${c.replace(/"/g, "")}"`]).join(",");
  const { data } = await admin
    .from("platform_orders")
    .select("id, order_no, external_order_id, customer_name, status, ordered_at, platform_id, source")
    .or(ors)
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return null;
  const o = rows.find((r) => r.source !== "email") ?? rows[0];
  const [{ data: plat }, { data: items }] = await Promise.all([
    o.platform_id ? admin.from("erp_platforms").select("code, name_th").eq("id", String(o.platform_id)).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("platform_order_items").select("sku_code, name, qty, matched_sku_id").eq("order_id", String(o.id)).limit(50),
  ]);
  const p = plat as Row | null;
  return {
    id: String(o.id),
    order_no: String(o.order_no ?? o.external_order_id ?? code),
    platform: (p?.name_th as string) || (p?.code as string) || null,
    customer_name: (o.customer_name as string) ?? null,
    ordered_at: (o.ordered_at as string) ?? null,
    status: (o.status as string) ?? null,
    items: ((items ?? []) as Row[]).map((i) => ({
      sku: (i.sku_code as string) ?? null,
      name: (i.name as string) ?? null,
      qty: Number(i.qty ?? 1) || 1,
      sku_id: (i.matched_sku_id as string) ?? null,
    })),
  };
}

/** ตัดช่องที่ไม่อนุญาตทิ้ง + ข้อความยาวเกิน */
export function pickFields(body: Row, allowed: readonly string[]): Row {
  const out: Row = {};
  for (const k of allowed) {
    if (!(k in body)) continue;
    const v = body[k];
    out[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim().slice(0, 4000)) : v;
  }
  return out;
}

export const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
