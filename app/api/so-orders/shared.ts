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
  note?: string | null;
  /** ชุด (= กลุ่มใบสั่งงาน mo_groups) ที่รายการนี้อยู่ */
  mo_group_id?: string | null;
  /** ชุดใหม่ที่ยังไม่มีในระบบ — อ้าง key ใน body.new_groups (สร้างให้ตอนบันทึก) */
  mo_group_key?: string | null;
};

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
    source: l.source ?? "manual", note: l.note ?? null, mo_group_id: groupId,
  };
}

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
};
