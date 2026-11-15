/**
 * ใบสำคัญรับ — แก้หลังยืนยัน + เวอร์ชัน (pure · ใช้ได้ทั้งหน้าเว็บและเซิร์ฟเวอร์)
 * ★ 2026-11-15 เจ้าของ: "อยากให้ใบที่ยืนยันแล้ว แก้ไขได้ด้วย แต่ต้องเก็บประวัติ" — เลือกแบบ ก. เปิดแก้ในใบเดิม (เลขเดิม · บังคับเหตุผล · เก็บทุกเวอร์ชัน)
 *   voucherEditable: ใบร่าง หรือใบยืนยันแล้วที่ "เปิดแก้" อยู่ (editing_at) = แก้ได้
 *   diffVoucherSnapshots: เทียบ 2 เวอร์ชัน → รายการ "อะไรเปลี่ยน ค่าเก่า → ค่าใหม่" (โชว์ในประวัติ)
 *   mergePriceSnapshots: รวม "ราคาก่อนเขียนทับ" จากการยืนยัน + การแก้แต่ละครั้ง → ยกเลิกใบย้อนราคาได้ถูก (ค่าเดิมจากครั้งแรก · ค่าที่เขียนล่าสุดจากครั้งหลังสุด)
 * ที่เก็บเวอร์ชัน = ตารางกลาง document_revisions (lib/document-revisions) · API /api/purchasing/vouchers/[id]/revise
 * ทดสอบ: lib/__tests__/voucher-revision.test.ts
 */
import type { PriceSnapshot } from "@/lib/po-line-price";

type Row = Record<string, unknown>;

export const voucherEditable = (v: { status?: string | null; editing_at?: string | null } | null | undefined) =>
  !!v && (v.status === "draft" || (v.status === "confirmed" && !!v.editing_at));

/** เอกสารทั้งใบของ 1 เวอร์ชัน (เก็บใน document_revisions.snapshot) */
export type VoucherSnapshot = {
  header: Row;            // แถว purchase_vouchers_v2
  lines: Row[];           // รายการที่ใช้งานอยู่ (purchase_voucher_lines_v2)
  bills?: Row[];          // บิลร้าน/ใบส่งของที่แนบ (purchase_delivery_bills: id, kind, lines, status, summary, applied_at, is_active)
};
export type DiffItem = { label: string; before: string | null; after: string | null };

const HEADER_FIELDS: { key: string; label: string; kind: "num" | "text" | "date" | "method" }[] = [
  { key: "voucher_date", label: "วันที่ใบ", kind: "date" },
  { key: "fx_rate", label: "เรท", kind: "num" },
  { key: "seller_ship_foreign", label: "ค่าส่งในจีน", kind: "num" },
  { key: "pay_fee_thb", label: "ค่าธรรมเนียมจ่ายเงิน ฿", kind: "num" },
  { key: "paid_total_thb", label: "ยอดจ่ายจริงตามบิล ฿", kind: "num" },
  { key: "ship_method", label: "วิธีคิดค่าส่ง", kind: "method" },
  { key: "ship_rate_cube", label: "เรทค่าส่ง ฿/คิว", kind: "num" },
  { key: "ship_rate_kg", label: "เรทค่าส่ง ฿/กก.", kind: "num" },
  { key: "ship_manual_total", label: "ค่าส่งยอดจริง ฿", kind: "num" },
  { key: "carrier_name", label: "ร้านขนส่ง", kind: "text" },
  { key: "note", label: "หมายเหตุ", kind: "text" },
  { key: "subtotal_thb", label: "ค่าสินค้า ฿", kind: "num" },
  { key: "grand_total_thb", label: "รวมทั้งสิ้น ฿", kind: "num" },
];
const LINE_FIELDS: { key: string; label: string; kind: "num" | "method" }[] = [
  { key: "qty", label: "จำนวน", kind: "num" },
  { key: "unit_price", label: "ราคา", kind: "num" },
  { key: "discount", label: "ส่วนลด", kind: "num" },
  { key: "discount_pct", label: "ส่วนลด %", kind: "num" },
  { key: "cbm_per_unit", label: "คิว/ชิ้น", kind: "num" },
  { key: "kg_per_unit", label: "กก./ชิ้น", kind: "num" },
  { key: "ship_method", label: "คิดค่าส่งจาก", kind: "method" },
];
const METHOD: Record<string, string> = { cube: "คิว", weight: "กก.", none: "ไม่คิด" };

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const fmtNum = (v: number | null) => (v == null ? null : v.toLocaleString("th-TH", { maximumFractionDigits: 6 }));
const show = (v: unknown, kind: string): string | null => {
  if (kind === "num") return fmtNum(numOrNull(v));
  if (kind === "method") { const s = String(v ?? ""); return s ? METHOD[s] ?? s : null; }
  const s = String(v ?? "").trim(); return s ? (kind === "date" ? s.slice(0, 10) : s) : null;
};
const same = (a: unknown, b: unknown, kind: string) => {
  if (kind === "num") { const x = numOrNull(a), y = numOrNull(b); return (x ?? 0) === (y ?? 0) || (x != null && y != null && Math.abs(x - y) < 1e-9); }
  return (show(a, kind) ?? "") === (show(b, kind) ?? "");
};
const lineName = (l: Row) => String(l.item_name ?? "").replace(/^\s*\[[^\]]*\]\s*/, "").trim() || "รายการ";

/** เทียบเวอร์ชันก่อน → เวอร์ชันใหม่ (ไม่เปลี่ยน = ไม่โชว์) */
export function diffVoucherSnapshots(prev: VoucherSnapshot, next: VoucherSnapshot): DiffItem[] {
  const out: DiffItem[] = [];
  for (const f of HEADER_FIELDS) {
    const a = prev.header?.[f.key], b = next.header?.[f.key];
    if (!same(a, b, f.kind)) out.push({ label: f.label, before: show(a, f.kind), after: show(b, f.kind) });
  }
  const prevById = new Map((prev.lines ?? []).map((l) => [String(l.id), l]));
  const nextById = new Map((next.lines ?? []).map((l) => [String(l.id), l]));
  for (const l of next.lines ?? []) {
    const p = prevById.get(String(l.id));
    if (!p) { out.push({ label: `เพิ่มรายการ: ${lineName(l)}`, before: null, after: `${fmtNum(numOrNull(l.qty)) ?? "-"} × ${fmtNum(numOrNull(l.unit_price)) ?? "-"}` }); continue; }
    for (const f of LINE_FIELDS) {
      if (!same(p[f.key], l[f.key], f.kind)) out.push({ label: `${lineName(l)} · ${f.label}`, before: show(p[f.key], f.kind), after: show(l[f.key], f.kind) });
    }
  }
  for (const p of prev.lines ?? []) {
    if (!nextById.has(String(p.id))) out.push({ label: `ลบรายการ: ${lineName(p)}`, before: `${fmtNum(numOrNull(p.qty)) ?? "-"} × ${fmtNum(numOrNull(p.unit_price)) ?? "-"}`, after: null });
  }
  return out;
}

/**
 * รวมประวัติราคาก่อนเขียนทับ — groups เรียงจากเก่าไปใหม่ (ยืนยันครั้งแรก, แก้ครั้งที่ 2, …)
 * จุดเดียวกัน (บรรทัด PO + สินค้า + ชื่อ): ค่าเดิม (before) จากครั้งแรกที่เจอ · ค่าที่ใบนี้เขียนลงไป (written) จากครั้งล่าสุด
 */
export function mergePriceSnapshots(groups: PriceSnapshot[][]): PriceSnapshot[] {
  const key = (s: PriceSnapshot) => `${s.po_line_id ?? ""}|${s.sku_id ?? ""}|${s.item_name}`;
  const map = new Map<string, PriceSnapshot>();
  for (const g of groups) for (const s of g ?? []) {
    const k = key(s);
    const cur = map.get(k);
    if (!cur) { map.set(k, { ...s, written: { ...s.written } }); continue; }
    // คงค่าเดิมครั้งแรก · ใช้ค่าที่เขียนล่าสุด (รอบหลังไม่ได้เขียนจุดนั้น = คงค่าที่รอบก่อนเขียนไว้)
    const w = s.written ?? { po_price: null, rmb_cost: null, standard_price: null, supplier_price: null };
    map.set(k, { ...cur, written: {
      po_price: w.po_price ?? cur.written.po_price, rmb_cost: w.rmb_cost ?? cur.written.rmb_cost,
      standard_price: w.standard_price ?? cur.written.standard_price, supplier_price: w.supplier_price ?? cur.written.supplier_price,
    } });
  }
  return [...map.values()];
}
