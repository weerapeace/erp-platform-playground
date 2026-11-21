/**
 * ใบสั่งขาย (Sales Order) — ตัวช่วยที่ใช้ร่วมกันของ API ชุดนี้
 *
 * เอกสารตัวนี้คือ "ลูกค้าสั่งของ" — ต้นทางของงาน:
 *   ใบเสนอราคา/ใบสั่งผลิต → **ใบสั่งขาย** → เปิดใบสั่งผลิต → ส่งของ → ออกใบขาย/บิล
 * (คนละใบกับ erp_playground_sales_orders ที่ระบบใช้เป็น "ใบขาย/บิล" ปลายทางอยู่แล้ว)
 *
 * ของกลางที่ใช้: lib/tax (calculateDocument — เลขเงินชุดเดียวกับใบขาย) · erp_next_number (เลขเอกสาร)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateDocument } from "@/lib/tax";
import { toMajor } from "@/lib/money";
import { skuLinkErrorText, unlinkedLineNames } from "@/lib/so-sku-link";

export type SoOrderStatus = "confirmed" | "shipped" | "cancelled";

export type SoOrderLineInput = {
  id?: string;
  sku?: string | null;
  product_name?: string;
  qty?: number;
  unit?: string | null;
  unit_price?: number;
  discount_type?: "percent" | "amount";
  discount_value?: number;
  due_date?: string | null;
  mo_id?: string | null;
  mo_no?: string | null;
  source?: string | null;      // manual | quote | mo
  /** ใบเสนอราคาต้นทางของบรรทัดนี้ — 1 ใบสั่งขายรวมได้หลายใบ (กติกา lib/quote-convert.ts) */
  quote_id?: string | null;
  quote_no?: string | null;
  note?: string | null;
  /** ชุด (= กลุ่มใบสั่งงาน mo_groups) ที่รายการนี้อยู่ */
  mo_group_id?: string | null;
  /** ชุดใหม่ที่ยังไม่มีในระบบ — อ้าง key ใน body.new_groups (สร้างให้ตอนบันทึก) */
  mo_group_key?: string | null;
  /** บรรทัดใบเสนอราคาต้นทาง (ไม่เก็บในใบสั่งขาย) — ใช้เขียน SKU ที่ผูกกลับลงใบเสนอราคา (2026-11-19) */
  quote_line_id?: string | null;
  /** ติ๊ก "ไม่ใช่สินค้า" (ค่าบริการ) = ไม่ต้องผูก SKU (ไม่เก็บ · กติกา lib/so-sku-link) */
  non_product?: boolean | null;
};

type Admin = ReturnType<typeof supabaseAdmin>;

/**
 * ตรวจว่าทุกรายการผูก SKU แล้ว + รหัสมีอยู่จริง (เจ้าของสั่ง 2026-11-19 · กติกา lib/so-sku-link)
 * → ข้อความผิดพลาดภาษาคน หรือ null ถ้าผ่าน
 */
export async function checkLineSkus(admin: Admin, lines: SoOrderLineInput[]): Promise<string | null> {
  const missing = unlinkedLineNames(lines);
  if (missing.length) return skuLinkErrorText(missing);
  const codes = [...new Set(lines.map((l) => String(l.sku ?? "").trim()).filter(Boolean))];
  const found = new Set<string>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data } = await admin.from("skus_v2").select("code").in("code", codes.slice(i, i + 200));
    for (const r of (data ?? []) as { code: string }[]) found.add(r.code);
  }
  const unknown = codes.filter((c) => !found.has(c));
  return unknown.length ? `ไม่พบ SKU ในทะเบียนสินค้า: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? " …" : ""} — เลือก SKU ใหม่` : null;
}

/**
 * เขียน SKU ที่ผูกในใบสั่งขายกลับลงบรรทัดใบเสนอราคาต้นทาง (ข้อเสนอ 3 · 2026-11-19)
 *   sku + product_id · รูป SKU ถ้าบรรทัดใบเสนอราคายังไม่มีรูป · เฉพาะบรรทัดที่อยู่ในใบเสนอราคาเดียวกับที่อ้าง
 * → จำนวนบรรทัดที่อัปเดต (พลาด = ข้าม ไม่ทำให้บันทึกใบสั่งขายล้ม)
 */
export async function writeBackQuoteLineSkus(admin: Admin, lines: SoOrderLineInput[]): Promise<number> {
  const want = lines.filter((l) => l.quote_line_id && l.quote_id && String(l.sku ?? "").trim());
  if (!want.length) return 0;
  const { data: qls } = await admin.from("erp_playground_quote_lines").select("id, quote_id, sku, image_key").in("id", want.map((l) => l.quote_line_id as string));
  const qlById = new Map(((qls ?? []) as { id: string; quote_id: string; sku: string | null; image_key: string | null }[]).map((q) => [q.id, q]));
  const codes = [...new Set(want.map((l) => String(l.sku).trim()))];
  const { data: skus } = await admin.from("skus_v2").select("id, code, cover_image_r2_key").in("code", codes);
  const skuByCode = new Map(((skus ?? []) as { id: string; code: string; cover_image_r2_key: string | null }[]).map((s) => [s.code, s]));
  let n = 0;
  for (const l of want) {
    const ql = qlById.get(l.quote_line_id as string);
    const s = skuByCode.get(String(l.sku).trim());
    if (!ql || !s || ql.quote_id !== l.quote_id || ql.sku === s.code) continue;
    const patch: Record<string, unknown> = { sku: s.code, product_id: s.id };
    if (!ql.image_key && s.cover_image_r2_key) patch.image_key = s.cover_image_r2_key;
    const { error } = await admin.from("erp_playground_quote_lines").update(patch).eq("id", ql.id);
    if (!error) n++;
  }
  return n;
}

export type SoOrderHeaderInput = {
  company_id?: string | null;
  company_code?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  customer_po_no?: string | null;
  sale_person_name?: string | null;
  order_date?: string | null;
  due_date?: string | null;
  currency?: string;
  header_discount_type?: "percent" | "amount";
  header_discount_value?: number;
  shipping_fee?: number;
  vat_rate?: number;
  vat_included?: boolean;
  wht_rate?: number;
  note?: string | null;
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** ยอดเงินของใบ — ใช้เครื่องคิดเงินกลาง (lib/tax) ตัวเดียวกับใบขาย เลขจะได้ตรงกันทั้งระบบ */
export function computeTotals(header: SoOrderHeaderInput, lines: SoOrderLineInput[]) {
  const r = calculateDocument({
    lines: lines
      .filter((l) => (l.product_name ?? "").trim() || l.sku)
      .map((l) => ({
        qty: num(l.qty),
        unit_price: num(l.unit_price),
        discount: num(l.discount_value) > 0 ? { type: l.discount_type ?? "amount", value: num(l.discount_value) } : undefined,
      })),
    header_discount: num(header.header_discount_value) > 0
      ? { type: header.header_discount_type ?? "amount", value: num(header.header_discount_value) }
      : undefined,
    shipping_fee: num(header.shipping_fee),
    tax: { vat_rate: num(header.vat_rate), vat_included: !!header.vat_included, wht_rate: num(header.wht_rate) },
  });
  // เครื่องคิดเงินกลางคืนค่าเป็นสตางค์ (Money.amount) → แปลงเป็นบาทก่อนเก็บ (เดิมเก็บสตางค์ ยอดในตารางเลยเกิน 100 เท่า)
  return {
    subtotal:              toMajor(r.subtotal.amount),
    total_line_discount:   toMajor(r.total_line_discount.amount),
    total_header_discount: toMajor(r.header_discount.amount),
    total_shipping:        toMajor(r.shipping.amount),
    taxable:               toMajor(r.taxable.amount),
    total_vat:             toMajor(r.total_vat.amount),
    total_wht:             toMajor(r.total_wht.amount),
    grand_total:           toMajor(r.grand_total.amount),
  };
}

/** เลขที่ใบสั่งขาย — แยกชุดต่อบริษัท (so_order_<CODE>) เหมือนที่ใบกำกับภาษีทำอยู่ */
export async function nextOrderNo(admin: ReturnType<typeof supabaseAdmin>, companyCode: string | null): Promise<string> {
  const code = (companyCode ?? "").trim().toUpperCase();
  if (code) {
    const { data, error } = await admin.rpc("erp_next_number", { p_key: `so_order_${code}` });
    if (!error && data) return String(data);
  }
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "so_order" });
  if (!error && data) return String(data);
  // กันพลาดสุดท้าย — ไม่ให้บันทึกไม่ได้เพราะเลขออกไม่ได้
  const d = new Date();
  const { count } = await admin.from("so_orders").select("id", { count: "exact", head: true });
  return `SO${d.getFullYear() + 543}-${String(d.getMonth() + 1).padStart(2, "0")}-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/**
 * ชุดของแต่ละบรรทัด → mo_group_id จริง
 * ชุดใหม่ (mo_group_key + newGroups[key] = ชื่อ) สร้างลง mo_groups ให้ตอนบันทึก
 * (ไม่สร้างตอนกดในป๊อป → กดยกเลิกแล้วไม่มีกลุ่มว่างค้าง · สิทธิ์ตามใบสั่งขาย ไม่ต้องมี products.edit)
 */
export async function resolveLineGroups(
  admin: ReturnType<typeof supabaseAdmin>,
  lines: SoOrderLineInput[],
  newGroups: Record<string, string> | undefined,
  actor: { id: string | null; email: string | null },
): Promise<{ groupOf: (l: SoOrderLineInput) => string | null; created: { id: string; name: string }[] }> {
  const used = new Set(lines.map((l) => l.mo_group_key).filter((k): k is string => !!k && !!newGroups?.[k]?.trim()));
  const keyToId = new Map<string, string>();
  const created: { id: string; name: string }[] = [];
  for (const key of used) {
    const name = newGroups![key].trim();
    // ชื่อซ้ำกับกลุ่มที่มีอยู่ (ยังใช้งาน) → ใช้กลุ่มเดิม ไม่สร้างซ้ำ
    const { data: dup } = await admin.from("mo_groups").select("id").eq("is_active", true).eq("name", name).limit(1).maybeSingle();
    if (dup) { keyToId.set(key, (dup as { id: string }).id); continue; }
    const { data, error } = await admin.from("mo_groups")
      .insert({ name, mo_nos: [], created_by: actor.email ?? actor.id }).select("id").single();
    if (error || !data) throw new Error(`สร้างชุด "${name}" ไม่สำเร็จ: ${error?.message ?? ""}`);
    const id = (data as { id: string }).id;
    keyToId.set(key, id);
    created.push({ id, name });
    await admin.from("audit_logs").insert({ actor_user_id: actor.id, action: "create", entity_type: "mo_group", entity_id: id, metadata: { name, from: "so_order" } }).then(() => {}, () => {});
  }
  return {
    groupOf: (l) => (l.mo_group_key && keyToId.get(l.mo_group_key)) || l.mo_group_id || null,
    created,
  };
}

/** แถวบรรทัดใบสั่งขายสำหรับ insert (ใช้ทั้งสร้างใหม่และบันทึกแก้ไข) */
export function lineRow(orderId: string, l: SoOrderLineInput, i: number, groupId: string | null) {
  return {
    order_id: orderId, line_no: i + 1,
    sku: l.sku ?? null, product_name: l.product_name ?? l.sku ?? "",
    qty: Number(l.qty) || 0, unit: l.unit || "ชิ้น", unit_price: Number(l.unit_price) || 0,
    discount_type: l.discount_type ?? "amount", discount_value: Number(l.discount_value) || 0,
    due_date: l.due_date || null, mo_id: l.mo_id ?? null, mo_no: l.mo_no ?? null,
    source: l.source ?? (l.quote_id ? "quote" : "manual"), note: l.note ?? null, mo_group_id: groupId,
    quote_id: l.quote_id || null, quote_no: l.quote_id ? (l.quote_no ?? null) : null,
  };
}

/** ใบเสนอราคาที่บรรทัดอ้าง (ไม่ซ้ำ) */
export const lineQuoteIds = (lines: SoOrderLineInput[]) => [...new Set(lines.map((l) => l.quote_id).filter((x): x is string => !!x))];

/** แถวใบสั่งขาย 1 ใบ + จำนวนบรรทัด (ใช้ในหน้ารายการ) */
export type SoOrderRow = {
  id: string; order_no: string | null; status: string;
  company_code: string | null; customer_name: string | null; customer_code: string | null;
  customer_po_no: string | null; sale_person_name: string | null;
  order_date: string; due_date: string | null;
  grand_total: number; line_count: number;
  mo_opened_at: string | null; invoice_so_id: string | null; shipped_at: string | null;
  /** ชุดที่รายการในใบนี้อยู่ (ไม่ซ้ำ) */
  groups: { id: string; name: string }[];
  /** ใบนี้ถูกรวมเข้าใบอื่นแล้ว (ยกเลิก · เลขเดิม merged_from_no) */
  merged_into_id?: string | null; merged_from_no?: string | null;
  /** ส่งของ: รายการที่ส่งครบ / ส่งบางส่วน · ชิ้นที่สั่ง / ส่งแล้ว · รายการที่รวมมาจากใบอื่น (แยกคืนได้) */
  ship?: { done: number; partial: number; ordered: number; shipped: number; merged_in: number } | null;
};

/**
 * ราคาที่เคยขายล่าสุดต่อรหัสสินค้า (ใช้เติมรายการที่ราคา 0 — เจ้าของเลือก 2026-11-21)
 *   ลูกค้าเดียวกันก่อน → ใบสั่งขายใบอื่น → ใบขาย (บิล) · ไม่นับใบที่ยกเลิก · ไม่เจอ = ไม่มีใน Map (ต้องพิมพ์เอง)
 */
export async function lastPrices(admin: Admin, skus: string[], customerId?: string | null): Promise<Map<string, { price: number; from: string }>> {
  const out = new Map<string, { price: number; from: string }>();
  const list = [...new Set(skus.map((s) => String(s ?? "").trim()).filter(Boolean))];
  if (!list.length) return out;
  type L = { sku: string; unit_price: number; created_at: string; so_orders: { order_no: string | null; customer_id: string | null; status: string } | { order_no: string | null; customer_id: string | null; status: string }[] | null };
  const { data } = await admin.from("so_order_lines").select("sku, unit_price, created_at, so_orders!inner(order_no, customer_id, status)")
    .in("sku", list).gt("unit_price", 0).order("created_at", { ascending: false }).limit(2000);
  const rows = ((data ?? []) as unknown as L[]).map((r) => ({ ...r, h: Array.isArray(r.so_orders) ? r.so_orders[0] : r.so_orders }))
    .filter((r) => r.h && r.h.status !== "cancelled");
  for (const pass of [true, false]) {
    for (const r of rows) {
      const k = String(r.sku).trim();
      if (out.has(k) || (pass && (!customerId || r.h!.customer_id !== customerId))) continue;
      out.set(k, { price: Number(r.unit_price), from: r.h!.order_no ?? "ใบสั่งขาย" });
    }
  }
  const left = list.filter((s) => !out.has(s));
  if (left.length) {
    type B = { sku: string; unit_price: number; erp_playground_sales_orders: { so_number: string | null; status: string } | { so_number: string | null; status: string }[] | null };
    const { data: bl } = await admin.from("erp_playground_so_lines").select("sku, unit_price, created_at, erp_playground_sales_orders!inner(so_number, status)")
      .in("sku", left).gt("unit_price", 0).order("created_at", { ascending: false }).limit(2000);
    for (const r of (bl ?? []) as unknown as B[]) {
      const h = Array.isArray(r.erp_playground_sales_orders) ? r.erp_playground_sales_orders[0] : r.erp_playground_sales_orders;
      const k = String(r.sku).trim();
      if (!h || h.status === "cancelled" || out.has(k)) continue;
      out.set(k, { price: Number(r.unit_price), from: h.so_number ?? "ใบขาย" });
    }
  }
  return out;
}
