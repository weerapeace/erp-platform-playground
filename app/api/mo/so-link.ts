/**
 * ผูกใบสั่งผลิต ↔ ใบสั่งขาย ฝั่งเซิร์ฟเวอร์ (กติกา lib/mo-so-rule.ts)
 *
 *   brandInfoOfSkus  — แบรนด์ของสินค้า (SKU → Parent → แบรนด์) + ลูกค้าประจำแบรนด์
 *   loadSoTarget     — ตรวจใบสั่งขายที่เลือก (มีจริง · ไม่ยกเลิก · รายการเป็นของใบนี้) ก่อนสร้างใบผลิต
 *   attachMoToSo     — หลังสร้างใบผลิต: ผูกเข้ารายการ (หรือเพิ่มรายการใหม่) + ติดเลขใบสั่งขายที่ใบผลิต
 *   createSoForMo    — "ยังไม่มี สร้างใหม่": ออกใบสั่งขายใหม่ 1 ใบ โดยใบผลิตนี้เป็นรายการแรก
 *
 * ใช้โดย POST /api/mo (ป๊อปสร้างใบสั่งผลิต — ของกลาง components/mo-create) และ GET /api/mo/so-options
 * ของกลางที่ใช้ต่อ: app/api/so-orders/shared (เลขที่ · คิดเงิน · แถวรายการ ตัวเดียวกับหน้าใบสั่งขาย)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { BrandCustomer, BrandInfo, NewSoInput } from "@/lib/mo-so-rule";
import { brandCustomerIds, orderCustomers } from "@/lib/brand-customers";
import { computeTotals, lineRow, nextOrderNo, type SoOrderHeaderInput, type SoOrderLineInput } from "../so-orders/shared";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

export type { BrandCustomer, BrandInfo };

async function inChunks<T>(list: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < list.length; i += 200) out.push(...(((await run(list.slice(i, i + 200))).data) ?? []));
  return out;
}

/** ลูกค้า (partners_v2) ตาม id */
export async function customersByIds(admin: Admin, ids: string[]): Promise<Map<string, BrandCustomer>> {
  const out = new Map<string, BrandCustomer>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  const rows = await inChunks<Row>(uniq, (c) => admin.from("partners_v2").select("id, code, name_th").in("id", c));
  for (const r of rows) out.set(String(r.id), { id: String(r.id), code: (r.code as string) ?? null, name: String(r.name_th ?? r.code ?? "") });
  return out;
}

/**
 * แบรนด์ของสินค้าแต่ละรหัส (null = ยังไม่รู้แบรนด์)
 * ค้น skus_v2 ไม่กรอง is_active (ให้ตรงกับแดชบอร์ดผลิต/ป๊อปใส่แบรนด์) แต่ถ้ารหัสซ้ำ เลือกตัวที่ใช้งานอยู่ก่อน
 */
export async function brandInfoOfSkus(admin: Admin, codes: string[]): Promise<Map<string, BrandInfo | null>> {
  const out = new Map<string, BrandInfo | null>();
  const uniq = [...new Set(codes.map((c) => String(c ?? "").trim()).filter(Boolean))];
  for (const c of uniq) out.set(c, null);
  if (!uniq.length) return out;

  const skus = await inChunks<Row>(uniq, (c) => admin.from("skus_v2").select("code, is_active, parent_sku_id").in("code", c));
  const parentOfCode = new Map<string, string>();
  for (const s of skus.sort((a, b) => Number(!!b.is_active) - Number(!!a.is_active))) {
    const code = String(s.code);
    if (!parentOfCode.has(code) && s.parent_sku_id) parentOfCode.set(code, String(s.parent_sku_id));
  }
  const parents = await inChunks<Row>([...new Set(parentOfCode.values())], (c) => admin.from("parent_skus_v2").select("id, brand_id").in("id", c));
  const brandOfParent = new Map(parents.filter((p) => p.brand_id).map((p) => [String(p.id), String(p.brand_id)]));
  const brands = await inChunks<Row>([...new Set(brandOfParent.values())], (c) =>
    admin.from("brands").select("id, name, is_customer_job, default_customer_id, default_customer_ids").in("id", c));
  const custs = await customersByIds(admin, brands.flatMap((b) => brandCustomerIds(b)));
  const brandById = new Map(brands.map((b) => {
    const list = orderCustomers(brandCustomerIds(b), custs);
    return [String(b.id), {
      brand_id: String(b.id), brand_name: String(b.name ?? ""), is_customer_job: !!b.is_customer_job,
      default_customers: list, default_customer: list[0] ?? null,
    } satisfies BrandInfo];
  }));
  for (const code of uniq) {
    const pid = parentOfCode.get(code);
    const bid = pid ? brandOfParent.get(pid) : undefined;
    out.set(code, (bid && brandById.get(bid)) || null);
  }
  return out;
}

export type SoTarget = {
  id: string; order_no: string | null; due_date: string | null;
  line: { id: string; sku: string | null; mo_id: string | null; due_date: string | null } | null;
};

/** ตรวจใบสั่งขายที่เลือกก่อนสร้างใบผลิต — คืนข้อความเตือน (string) ถ้าใช้ไม่ได้ */
export async function loadSoTarget(admin: Admin, soId: string, lineId: string | null): Promise<SoTarget | string> {
  const { data: so } = await admin.from("so_orders").select("id, order_no, status, due_date").eq("id", soId).maybeSingle();
  if (!so) return "ไม่พบใบสั่งขายที่เลือก — ลองเปิดหน้าต่างใหม่";
  const o = so as Row;
  if (o.status === "cancelled") return `ใบสั่งขาย ${o.order_no ?? ""} ถูกยกเลิกแล้ว — เลือกใบอื่น`;
  if (o.status === "shipped") return `ใบสั่งขาย ${o.order_no ?? ""} ส่งของครบแล้ว — เลือกใบอื่น หรือสร้างใบใหม่`;
  let line: SoTarget["line"] = null;
  if (lineId) {
    const { data: l } = await admin.from("so_order_lines").select("id, order_id, sku, mo_id, due_date").eq("id", lineId).maybeSingle();
    if (!l || String((l as Row).order_id) !== soId) return "รายการที่เลือกไม่ได้อยู่ในใบสั่งขายนี้ — ลองเลือกใหม่";
    const r = l as Row;
    line = { id: String(r.id), sku: (r.sku as string) ?? null, mo_id: (r.mo_id as string) ?? null, due_date: (r.due_date as string) ?? null };
  }
  return { id: String(o.id), order_no: (o.order_no as string) ?? null, due_date: (o.due_date as string) ?? null, line };
}

/** คิดยอดเงินของใบสั่งขายใหม่ทั้งใบ (หลังเพิ่มรายการ) — เครื่องคิดเงินกลางตัวเดียวกับหน้าใบสั่งขาย */
async function recomputeSoTotals(admin: Admin, soId: string) {
  const [{ data: so }, { data: lines }] = await Promise.all([
    admin.from("so_orders").select("header_discount_type, header_discount_value, shipping_fee, vat_rate, vat_included, wht_rate").eq("id", soId).maybeSingle(),
    admin.from("so_order_lines").select("sku, product_name, qty, unit_price, discount_type, discount_value").eq("order_id", soId),
  ]);
  if (!so) return;
  const totals = computeTotals(so as SoOrderHeaderInput, (lines ?? []) as SoOrderLineInput[]);
  await admin.from("so_orders").update({ ...totals, updated_at: new Date().toISOString() }).eq("id", soId);
}

export type MoForSo = { id: string; mo_no: string; product_sku: string; product_name: string | null; qty: number; due_date: string | null };

/**
 * ผูกใบผลิตที่เพิ่งสร้างเข้าใบสั่งขายเดิม
 *   เลือกรายการมา → ผูกรายการนั้น (ถ้ารายการมีใบผลิตอยู่แล้ว ใบนี้นับเป็น "เปิดผลิตเพิ่ม" ของรายการเดียวกัน)
 *   ไม่ได้เลือก   → รายการรหัสเดียวกันที่ยังไม่มีใบผลิต / มีรหัสนี้แล้ว = นับรวม / ไม่มีเลย = เพิ่มรายการใหม่ (ราคา 0 ใส่ทีหลัง)
 */
export async function attachMoToSo(admin: Admin, mo: MoForSo, target: SoTarget): Promise<{ line_id: string | null; added_line: boolean }> {
  let lineId: string | null = null, added = false;
  if (target.line) {
    lineId = target.line.id;
    if (!target.line.mo_id) await admin.from("so_order_lines").update({ mo_id: mo.id, mo_no: mo.mo_no }).eq("id", lineId);
  } else {
    const { data: same } = await admin.from("so_order_lines").select("id, mo_id, line_no").eq("order_id", target.id).eq("sku", mo.product_sku).order("line_no");
    const rows = (same ?? []) as Row[];
    const free = rows.find((r) => !r.mo_id);
    if (free) {
      lineId = String(free.id);
      await admin.from("so_order_lines").update({ mo_id: mo.id, mo_no: mo.mo_no }).eq("id", lineId);
    } else if (rows.length) {
      lineId = String(rows[0].id);
    } else {
      const { data: last } = await admin.from("so_order_lines").select("line_no").eq("order_id", target.id).order("line_no", { ascending: false }).limit(1);
      const nextNo = Number(((last ?? [])[0] as Row | undefined)?.line_no ?? 0);
      const row = lineRow(target.id, {
        sku: mo.product_sku, product_name: mo.product_name || mo.product_sku, qty: mo.qty, unit: "ชิ้น", unit_price: 0,
        due_date: mo.due_date, mo_id: mo.id, mo_no: mo.mo_no, source: "mo", note: "เพิ่มจากป๊อปสร้างใบสั่งผลิต — ยังไม่ใส่ราคา",
      }, nextNo, null);
      const { data: ins, error } = await admin.from("so_order_lines").insert(row).select("id").single();
      if (error || !ins) throw new Error("เพิ่มรายการในใบสั่งขายไม่สำเร็จ");
      lineId = String((ins as Row).id); added = true;
      await recomputeSoTotals(admin, target.id);
    }
  }
  await admin.from("manufacturing_orders").update({ so_order_id: target.id, so_order_no: target.order_no }).eq("id", mo.id);
  await admin.from("so_orders").update({ mo_opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", target.id).is("mo_opened_at", null);
  return { line_id: lineId, added_line: added };
}

/** ออกใบสั่งขายใหม่ให้ใบผลิตนี้ (ใบผลิตเป็นรายการแรก) — คืน id/เลขที่ หรือโยน error ภาษาคน */
export async function createSoForMo(admin: Admin, mo: MoForSo, s: NewSoInput, actor: { id: string | null; email: string | null }): Promise<{ id: string; order_no: string; line_id: string }> {
  let companyId = s.company_id ?? null, companyCode = (s.company_code ?? "").trim() || null, vatRate = 7;
  const cq = companyId ? admin.from("companies").select("id, company_code, vat_registered").eq("id", companyId)
    : admin.from("companies").select("id, company_code, vat_registered").eq("company_code", companyCode ?? "");
  const { data: co } = await cq.maybeSingle();
  if (co) {
    const c = co as Row;
    companyId = String(c.id); companyCode = (c.company_code as string) ?? companyCode;
    if (c.vat_registered === false) vatRate = 0;
  }
  const header: SoOrderHeaderInput = {
    company_id: companyId, company_code: companyCode,
    customer_id: s.customer_id ?? null, customer_code: s.customer_code ?? null, customer_name: s.customer_name ?? null,
    customer_po_no: (s.customer_po_no ?? "").trim() || null, due_date: s.due_date || null, vat_rate: vatRate,
  };
  const line: SoOrderLineInput = {
    sku: mo.product_sku, product_name: mo.product_name || mo.product_sku, qty: mo.qty, unit: "ชิ้น",
    unit_price: Math.max(0, Number(s.unit_price) || 0), due_date: s.due_date || mo.due_date || null,
    mo_id: mo.id, mo_no: mo.mo_no, source: "mo",
    note: Number(s.unit_price) > 0 ? null : "ยังไม่ใส่ราคา",
  };
  const orderNo = await nextOrderNo(admin, companyCode);
  const totals = computeTotals(header, [line]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const { data: order, error } = await admin.from("so_orders").insert({
    order_no: orderNo, company_id: companyId, company_code: companyCode, status: "confirmed",
    customer_id: header.customer_id, customer_name: header.customer_name, customer_code: header.customer_code,
    customer_po_no: header.customer_po_no, order_date: today, due_date: header.due_date,
    currency: "THB", header_discount_type: "amount", header_discount_value: 0, shipping_fee: 0,
    vat_rate: vatRate, vat_included: false, wht_rate: 0, ...totals,
    note: `สร้างจากป๊อปสร้างใบสั่งผลิต ${mo.mo_no}`, created_by: actor.id, mo_opened_at: now.toISOString(),
  }).select("id, order_no").single();
  if (error || !order) throw new Error("สร้างใบสั่งขายไม่สำเร็จ");
  const soId = String((order as Row).id);
  const { data: ins, error: lineErr } = await admin.from("so_order_lines").insert(lineRow(soId, line, 0, null)).select("id").single();
  if (lineErr || !ins) {
    await admin.from("so_orders").delete().eq("id", soId);   // ไม่ทิ้งใบเปล่าไว้
    throw new Error("สร้างรายการในใบสั่งขายไม่สำเร็จ");
  }
  await admin.from("manufacturing_orders").update({ so_order_id: soId, so_order_no: orderNo }).eq("id", mo.id);
  return { id: soId, order_no: orderNo, line_id: String((ins as Row).id) };
}
