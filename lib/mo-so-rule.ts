/**
 * กติกากลาง "ใบสั่งผลิต ↔ ใบสั่งขาย" (เจ้าของสั่ง 2026-11-05)
 *   ใบสั่งผลิตของ "แบรนด์ลูกค้า" (brands.is_customer_job) ต้องผูกใบสั่งขายตั้งแต่ตอนเปิด
 *   — เลือกใบที่มีอยู่ หรือสร้างใบใหม่ในป๊อปเดียวกัน · แบรนด์ของเราเองไม่บังคับ (ผูกเองได้)
 *   — ยังไม่รู้แบรนด์ = ให้ใส่แบรนด์ก่อน (ระบบตัดสินไม่ได้ว่าต้องผูกไหม)
 *
 * ไฟล์ pure (ไม่แตะฐานข้อมูล) — ใช้ทั้งป๊อปฝั่งหน้าจอ (components/mo-create) และ API (POST /api/mo)
 * เพื่อให้ข้อความเตือนกับเงื่อนไขตรงกันทั้งสองฝั่ง
 *
 * ยอดต่อรายการ (สั่ง / เปิดผลิตแล้ว / ส่งแล้ว): 1 รายการในใบสั่งขายมีใบผลิตได้หลายใบ
 *   (แตกใบ · ลดจำนวน · เปิดเพิ่ม) — นับจากใบผลิตที่ผูกใบสั่งขายนี้ + รหัสสินค้าเดียวกัน (soLineProgress)
 */

/** แบรนด์ของสินค้า 1 ตัว (null = ยังไม่รู้แบรนด์) */
export type BrandJob = { brand_id: string; brand_name: string; is_customer_job: boolean } | null;

/** ต้องผูกใบสั่งขายไหม */
export type SoNeed = "required" | "optional" | "unknown_brand";

/** ลูกค้าประจำแบรนด์ (brands.default_customer_ids → partners_v2 · หลายสาขาได้ — กติกา lib/brand-customers.ts) */
export type { BrandCustomer } from "@/lib/brand-customers";
import type { BrandCustomer } from "@/lib/brand-customers";
export type BrandInfo = NonNullable<BrandJob> & {
  /** ลูกค้าประจำแบรนด์ทั้งหมด (เรียงตามที่ตั้ง) */
  default_customers: BrandCustomer[];
  /** รายแรก (= default_customers[0]) */
  default_customer: BrandCustomer | null;
};

/** ตัวเลือกใบสั่งขายในป๊อปสร้างใบสั่งผลิต (GET /api/mo/so-options) */
export type SoOptionLine = { id: string; qty: number; opened: number; mo_no: string | null; due_date: string | null };
export type SoOption = {
  id: string; order_no: string | null; order_date: string; due_date: string | null;
  customer_id: string | null; customer_name: string | null; customer_po_no: string | null; company_code: string | null;
  /** รายการที่เป็นสินค้านี้ (ว่าง = ใบนี้ยังไม่มีสินค้านี้ → ผูกแล้วเพิ่มเป็นรายการใหม่) */
  lines: SoOptionLine[];
  line_count: number;
};
export type SoOptionsResponse = {
  need: SoNeed; brand: BrandInfo | null; orders: SoOption[]; filtered_by: "customer" | "brand" | "all"; error: string | null;
};

export function soNeedOf(brand: BrandJob): SoNeed {
  if (!brand) return "unknown_brand";
  return brand.is_customer_job ? "required" : "optional";
}

/** ใบสั่งขายใหม่ที่สร้างพร้อมใบผลิต (ป๊อปสร้างใบสั่งผลิต → "ยังไม่มี สร้างใหม่") */
export type NewSoInput = {
  company_id?: string | null;
  company_code?: string | null;
  customer_id?: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  customer_po_no?: string | null;
  /** กำหนดส่งลูกค้า */
  due_date?: string | null;
  /** ราคาต่อชิ้น — ไม่ใส่ได้ (0 = ยังไม่ใส่ราคา) */
  unit_price?: number | null;
};

/** ผูกใบผลิตกับใบสั่งขาย: ใบเดิม (so_order_id + รายการ ถ้าเลือก) หรือสร้างใหม่ (new_so) */
export type MoSoLinkInput = {
  so_order_id?: string | null;
  /** รายการในใบสั่งขายที่ใบผลิตนี้ทำให้ — ไม่ระบุ = หารายการรหัสเดียวกันให้ / ไม่มีก็เพิ่มรายการใหม่ */
  so_line_id?: string | null;
  new_so?: NewSoInput | null;
};

export const hasSoLink = (l: MoSoLinkInput | null | undefined): boolean =>
  !!l && (!!l.so_order_id || !!l.new_so);

/**
 * ข้อความเตือนก่อนบันทึก (null = ผ่าน) — ใช้ทั้งหน้าจอและ API
 * ⚠️ เตือนเป็นภาษาคน บอกว่าต้องทำอะไร ไม่เดาค่าให้เงียบ ๆ
 */
export function soLinkError(need: SoNeed, link: MoSoLinkInput | null | undefined, brandName?: string | null): string | null {
  if (need === "unknown_brand") return "สินค้านี้ยังไม่มีแบรนด์ — ใส่แบรนด์ก่อน ระบบถึงจะรู้ว่าต้องผูกใบสั่งขายไหม";
  if (link?.new_so) {
    const s = link.new_so;
    if (!s.customer_id && !(s.customer_name ?? "").trim()) return "สร้างใบสั่งขายใหม่ — ต้องเลือกลูกค้าก่อน";
    if (!(s.company_code ?? "").trim() && !s.company_id) return "สร้างใบสั่งขายใหม่ — ต้องเลือกบริษัท (ชุดเลขเอกสาร)";
    if (s.unit_price != null && Number(s.unit_price) < 0) return "ราคาต่อชิ้นติดลบไม่ได้";
    return null;
  }
  if (need === "required" && !link?.so_order_id) {
    return `${brandName ? `แบรนด์ ${brandName} เป็นงานลูกค้า` : "สินค้านี้เป็นงานลูกค้า"} — ต้องเลือกใบสั่งขาย หรือกด "ยังไม่มี สร้างใหม่"`;
  }
  return null;
}

// ── ยอดต่อรายการ: สั่ง / เปิดผลิตแล้ว / ส่งแล้ว ─────────────────────────

export type SoLineMo = { id: string; mo_no: string; qty: number; status: string | null; shipped: number };
export type SoLineProgress = { ordered: number; opened: number; shipped: number; mos: SoLineMo[] };
export type SoLineQtyState = "none" | "under" | "ok" | "over";

const EPS = 0.0001;

/** เปิดผลิตครบไหมเทียบที่ลูกค้าสั่ง */
export function soLineQtyState(p: Pick<SoLineProgress, "ordered" | "opened">): SoLineQtyState {
  if (p.opened <= EPS) return "none";
  if (p.opened + EPS < p.ordered) return "under";
  if (p.opened > p.ordered + EPS) return "over";
  return "ok";
}

/**
 * แจกใบผลิตของใบสั่งขายให้แต่ละรายการ
 *   1) ใบที่รายการอ้างตรง ๆ (so_order_lines.mo_id) → รายการนั้น
 *   2) ใบอื่นที่ผูกใบสั่งขายนี้ (แตกใบ/ลดจำนวน/เปิดเพิ่ม) → รายการแรกที่รหัสสินค้าตรงกัน
 * ใบที่ไม่ตรงรายการไหนเลยคืนแยกใน `orphans` (ให้หน้าจอเตือน)
 */
export function soLineProgress(
  lines: { id: string; sku: string | null; qty: number; mo_id: string | null }[],
  mos: { id: string; mo_no: string; product_sku: string | null; qty: number; status: string | null; shipped?: number }[],
): { byLine: Record<string, SoLineProgress>; orphans: SoLineMo[] } {
  const byLine: Record<string, SoLineProgress> = {};
  for (const l of lines) byLine[l.id] = { ordered: Number(l.qty) || 0, opened: 0, shipped: 0, mos: [] };
  const lineOfMo = new Map<string, string>();
  for (const l of lines) if (l.mo_id) lineOfMo.set(l.mo_id, l.id);
  const firstLineOfSku = new Map<string, string>();
  for (const l of lines) if (l.sku && !firstLineOfSku.has(l.sku)) firstLineOfSku.set(l.sku, l.id);
  const orphans: SoLineMo[] = [];
  for (const m of mos) {
    const row: SoLineMo = { id: m.id, mo_no: m.mo_no, qty: Number(m.qty) || 0, status: m.status, shipped: Number(m.shipped) || 0 };
    const lineId = lineOfMo.get(m.id) ?? (m.product_sku ? firstLineOfSku.get(m.product_sku) : undefined);
    const p = lineId ? byLine[lineId] : undefined;
    if (!p) { orphans.push(row); continue; }
    p.mos.push(row); p.opened += row.qty; p.shipped += row.shipped;
  }
  return { byLine, orphans };
}

/** ข้อความสั้นใต้รายการ เช่น "เปิดผลิต 300/500 · ขาด 200" */
export function soLineQtyText(p: SoLineProgress): string {
  const n = (v: number) => (Math.round(v * 100) / 100).toLocaleString("th-TH");
  const st = soLineQtyState(p);
  if (st === "none") return "ยังไม่เปิดผลิต";
  const base = `เปิดผลิต ${n(p.opened)}/${n(p.ordered)}`;
  if (st === "under") return `${base} · ขาด ${n(p.ordered - p.opened)}`;
  if (st === "over") return `${base} · เกิน ${n(p.opened - p.ordered)}`;
  return base;
}
