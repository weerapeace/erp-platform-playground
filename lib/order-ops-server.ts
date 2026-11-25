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
  /** หมายเหตุที่ลูกค้าเขียนตอนสั่ง (Shopee message_to_seller / buyer_message / note) */
  note: string | null;
  items: { sku: string | null; name: string | null; qty: number; sku_id: string | null; image_key?: string | null }[];
  /** ที่อยู่ผู้รับ (platform_orders.ship_to) เป็นข้อความเดียว · ไม่มี = null */
  ship_to?: string | null;
};

/** ที่อยู่ผู้รับ → ข้อความ (ชื่อ เบอร์ ที่อยู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์) */
function shipToLine(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const s = ["name", "phone", "address", "subdistrict", "district", "province", "postal"].map((k) => String(o[k] ?? "").trim()).filter(Boolean).join(" ");
  return s || null;
}

/** หาออเดอร์จากศูนย์ออเดอร์ด้วยเลขออเดอร์ (ตรงตัว) — ไม่เจอ = null (ใบเก่า/ยังไม่ดึง ก็ยังพิมพ์เองได้) */
export async function findPlatformOrder(admin: Admin, raw: string): Promise<OrderHit | null> {
  const code = cleanOrderNo(raw);
  if (!code || code.length < 4) return null;
  const variants = [...new Set([code, code.toUpperCase()])];
  const ors = variants.flatMap((c) => [`order_no.eq."${c.replace(/"/g, "")}"`, `external_order_id.eq."${c.replace(/"/g, "")}"`]).join(",");
  const { data } = await admin
    .from("platform_orders")
    .select(`id, order_no, external_order_id, customer_name, status, ordered_at, platform_id, source, ship_to, ${NOTE_COLS}`)
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
  const its = ((items ?? []) as Row[]).map((i) => ({
    sku: (i.sku_code as string) ?? null,
    name: (i.name as string) ?? null,
    qty: Number(i.qty ?? 1) || 1,
    sku_id: (i.matched_sku_id as string) ?? null,
    image_key: null as string | null,
  }));
  await attachItemImages(admin, its);
  return {
    id: String(o.id),
    order_no: String(o.order_no ?? o.external_order_id ?? code),
    platform: (p?.name_th as string) || (p?.code as string) || null,
    customer_name: (o.customer_name as string) ?? null,
    ordered_at: (o.ordered_at as string) ?? null,
    status: (o.status as string) ?? null,
    note: noteOf(o),
    items: its,
    ship_to: shipToLine(o.ship_to),
  };
}

/**
 * รูปสินค้าของรายการในออเดอร์ (เจ้าของขอ 2026-11-25 รอบ 5 ข้อ 7) — รูปปก SKU ก่อน ไม่มีใช้รูปปกรุ่น
 * จับคู่จาก matched_sku_id · ยังไม่จับคู่ = หาจากรหัส SKU ตรงตัว · แก้รายการเดิม (ใส่ image_key)
 */
export async function attachItemImages(admin: Admin, items: { sku: string | null; sku_id: string | null; image_key?: string | null }[]): Promise<void> {
  if (!items.length) return;
  const chunk = <T,>(a: T[]) => { const out: T[][] = []; for (let i = 0; i < a.length; i += 150) out.push(a.slice(i, i + 150)); return out; };
  const ids = [...new Set(items.map((i) => i.sku_id).filter((x): x is string => !!x))];
  const codes = [...new Set(items.filter((i) => !i.sku_id && i.sku).map((i) => String(i.sku).trim()).filter(Boolean))];
  const rows: Row[] = [];
  for (const c of chunk(ids)) rows.push(...(((await admin.from("skus_v2").select("id, code, cover_image_r2_key, parent_sku_id").in("id", c)).data ?? []) as Row[]));
  for (const c of chunk(codes)) rows.push(...(((await admin.from("skus_v2").select("id, code, cover_image_r2_key, parent_sku_id").in("code", c)).data ?? []) as Row[]));
  const parentIds = [...new Set(rows.filter((r) => !r.cover_image_r2_key && r.parent_sku_id).map((r) => String(r.parent_sku_id)))];
  const parentImg = new Map<string, string>();
  for (const c of chunk(parentIds)) for (const r of ((await admin.from("parent_skus_v2").select("id, cover_image_r2_key").in("id", c)).data ?? []) as Row[]) if (r.cover_image_r2_key) parentImg.set(String(r.id), String(r.cover_image_r2_key));
  const imgOf = (r: Row) => (r.cover_image_r2_key as string) || (r.parent_sku_id ? parentImg.get(String(r.parent_sku_id)) ?? null : null);
  const byId = new Map(rows.map((r) => [String(r.id), imgOf(r)]));
  const byCode = new Map(rows.map((r) => [String(r.code ?? ""), imgOf(r)]));
  for (const i of items) i.image_key = (i.sku_id ? byId.get(i.sku_id) : null) ?? (i.sku ? byCode.get(String(i.sku).trim()) ?? null : null);
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

/** ช่องหมายเหตุลูกค้าใน raw (ชุดเดียวกับหน้าแพ็กของ app/api/packing) */
const NOTE_COLS = "buyer_message:raw->>buyer_message, shopee_note:raw->shopee->>message_to_seller, raw_note:raw->>note";
function noteOf(r: Row): string | null {
  for (const k of ["buyer_message", "shopee_note", "raw_note"]) {
    const v = typeof r[k] === "string" ? (r[k] as string).trim() : "";
    if (v) return v;
  }
  return null;
}

/** ตัวพิเศษที่สลักได้ (ที่เปิดใช้อยู่) */
export async function loadEngraveSpecials(admin: Admin): Promise<string[]> {
  const { data } = await admin.from("order_ops_options").select("label").eq("kind", "engrave_special").eq("is_active", true);
  return ((data ?? []) as Row[]).map((r) => String(r.label));
}

export type PickerOrder = {
  id: string; order_no: string; platform: string | null; customer_name: string | null; ordered_at: string | null;
  status: string | null; packed: boolean; note: string | null; has_instruction: boolean;
  items: { sku: string | null; name: string | null; qty: number; sku_id: string | null; image_key?: string | null }[];
};

/**
 * รายการออเดอร์ให้ตัวเลือกออเดอร์ (ของกลาง) — ออเดอร์ที่มีหมายเหตุขึ้นก่อน แล้วตามด้วยใบล่าสุด
 * ไม่นับออเดอร์จากเมล (รายงานยอดขาย) · หน้าละ 40 ใบ
 */
export async function listPickerOrders(admin: Admin, o: { q: string; days: number; openOnly: boolean; platformId: string | null; notesFirst: boolean; page: number }): Promise<{ orders: PickerOrder[]; hasMore: boolean; noteCount: number }> {
  const SIZE = 40;
  const days = Math.min(90, Math.max(1, o.days));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const cols = `id, order_no, external_order_id, customer_name, status, ordered_at, platform_id, packed_at, ${NOTE_COLS}`;
  const q = o.q.replace(/[%,()*"\\]/g, " ").trim().slice(0, 60);
  const base = () => {
    let b = admin.from("platform_orders").select(cols).gte("ordered_at", since).or("source.is.null,source.neq.email");
    if (o.openOnly) b = b.is("packed_at", null).in("status", ["new", "confirmed", "packed"]);
    if (o.platformId && /^[0-9a-f-]{36}$/i.test(o.platformId)) b = b.eq("platform_id", o.platformId);
    if (q) b = b.or(`order_no.ilike.*${q}*,external_order_id.ilike.*${q}*,customer_name.ilike.*${q}*,raw->>buyer_message.ilike.*${q}*,raw->shopee->>message_to_seller.ilike.*${q}*,raw->>note.ilike.*${q}*`);
    return b;
  };
  // ① ใบที่มีหมายเหตุ (เฉพาะหน้าแรก) ② ใบล่าสุดทั้งหมดตามหน้า
  const [noted, recent] = await Promise.all([
    o.notesFirst && o.page === 1
      ? base().or("raw->>buyer_message.not.is.null,raw->shopee->>message_to_seller.not.is.null,raw->>note.not.is.null").order("ordered_at", { ascending: false }).limit(150)
      : Promise.resolve({ data: [] as Row[] }),
    base().order("ordered_at", { ascending: false }).range((o.page - 1) * SIZE, o.page * SIZE),
  ]);
  const notedRows = ((noted.data ?? []) as Row[]).filter((r) => noteOf(r));
  const recentRows = (recent.data ?? []) as Row[];
  const hasMore = recentRows.length > SIZE;
  const seen = new Set(notedRows.map((r) => String(r.id)));
  const rows = [...notedRows, ...recentRows.slice(0, SIZE).filter((r) => !seen.has(String(r.id)))];
  const ids = rows.map((r) => String(r.id));
  const platIds = [...new Set(rows.map((r) => r.platform_id).filter(Boolean).map(String))];
  const [{ data: items }, { data: plats }, { data: ins }] = await Promise.all([
    ids.length ? admin.from("platform_order_items").select("order_id, sku_code, name, qty, matched_sku_id").in("order_id", ids) : Promise.resolve({ data: [] }),
    platIds.length ? admin.from("erp_platforms").select("id, code, name_th").in("id", platIds) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("order_instructions").select("platform_order_id").in("platform_order_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ]);
  const itemsBy = new Map<string, PickerOrder["items"]>();
  for (const i of (items ?? []) as Row[]) {
    const k = String(i.order_id);
    if (!itemsBy.has(k)) itemsBy.set(k, []);
    itemsBy.get(k)!.push({ sku: (i.sku_code as string) ?? null, name: (i.name as string) ?? null, qty: Number(i.qty ?? 1) || 1, sku_id: (i.matched_sku_id as string) ?? null, image_key: null });
  }
  await attachItemImages(admin, [...itemsBy.values()].flat());
  const platBy = new Map(((plats ?? []) as Row[]).map((p) => [String(p.id), (p.name_th as string) || (p.code as string) || null]));
  const hasIns = new Set(((ins ?? []) as Row[]).map((r) => String(r.platform_order_id)));
  return {
    orders: rows.map((r) => ({
      id: String(r.id), order_no: String(r.order_no ?? r.external_order_id ?? ""), platform: r.platform_id ? platBy.get(String(r.platform_id)) ?? null : null,
      customer_name: (r.customer_name as string) ?? null, ordered_at: (r.ordered_at as string) ?? null, status: (r.status as string) ?? null,
      packed: !!r.packed_at, note: noteOf(r), has_instruction: hasIns.has(String(r.id)), items: itemsBy.get(String(r.id)) ?? [],
    })),
    hasMore,
    noteCount: notedRows.length,
  };
}

export const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
