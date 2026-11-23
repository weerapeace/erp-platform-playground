/**
 * 🤝 สรุปต่อคู่ค้า (ของกลาง · pure — เทสต์ได้ ไม่มี "use client")
 *
 * ใช้ที่: GET /api/partners/summary (หน้า Partners) · GET /api/partners/credit-terms (หน้าจัดการเครดิตเทอม)
 *
 *   - suspectSupplier   = ติดป้าย "ลูกค้า" อย่างเดียว แต่มีสินค้า/ใบสั่งซื้อผูกกับร้านนี้ → น่าจะเป็นผู้จำหน่าย
 *                         (ข้อมูลจริง 2026-11-22: 36 ราย เช่น KAYAN สินค้า 141 ใบสั่งซื้อ 6) — แค่เตือน ไม่แก้เอง
 *   - dueOfDoc          = วันครบกำหนดของเอกสาร 1 ใบ: วันที่ตั้งเองในใบก่อน → ไม่มีค่อยคิดจากเครดิตร้าน (lib/credit-term)
 *   - foldOpenDocs      = รวมใบค้างของคู่ค้า → ยอดค้าง · จำนวนใบ · ครบกำหนดใกล้สุด · เลยกำหนดกี่ใบ
 *   - overLimit         = ยอดค้างเกินวงเงิน (วงเงินว่าง/0 = ไม่จำกัด ไม่เตือน)
 */
import { computeDueDate, parseCreditTerm } from "@/lib/credit-term";

export type OpenDoc = { date: string | null; dueDate?: string | null; amount: number };

export type OpenDocsFold = {
  openDocs: number;
  openAmount: number;
  /** ครบกำหนดใกล้สุดของใบที่ยังค้าง (YYYY-MM-DD) · null = ไม่รู้ (ไม่มีวันและยังไม่ตั้งเครดิต) */
  nextDue: string | null;
  /** จำนวนใบที่เลยกำหนดแล้ว */
  overdueDocs: number;
  overdueAmount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** วันครบกำหนดของใบเดียว — วันในใบชนะเสมอ (ผู้ใช้ตั้งเอง) */
export function dueOfDoc(doc: OpenDoc, term: string | null | undefined): string | null {
  if (doc.dueDate) return String(doc.dueDate).slice(0, 10);
  if (!term || !parseCreditTerm(term)) return null;
  return computeDueDate(doc.date, term);
}

/** รวมใบค้างของคู่ค้า 1 ราย · today = YYYY-MM-DD (ส่งเข้ามาเพื่อเทสต์ได้) */
export function foldOpenDocs(docs: readonly OpenDoc[], term: string | null | undefined, today: string): OpenDocsFold {
  let openAmount = 0, overdueDocs = 0, overdueAmount = 0;
  let nextDue: string | null = null;
  for (const d of docs) {
    const amt = Number.isFinite(d.amount) ? d.amount : 0;
    if (amt <= 0) continue;
    openAmount += amt;
    const due = dueOfDoc(d, term);
    if (!due) continue;
    if (due < today) { overdueDocs++; overdueAmount += amt; }
    if (!nextDue || due < nextDue) nextDue = due;
  }
  const counted = docs.filter((d) => (Number.isFinite(d.amount) ? d.amount : 0) > 0).length;
  return { openDocs: counted, openAmount: round2(openAmount), nextDue, overdueDocs, overdueAmount: round2(overdueAmount) };
}

/** ติดป้ายลูกค้าอย่างเดียว แต่มีหลักฐานว่าเป็นผู้จำหน่าย */
export function suspectSupplier(p: { is_customer?: unknown; is_supplier?: unknown }, evidence: { items: number; pos: number }): boolean {
  return p.is_customer === true && p.is_supplier !== true && (evidence.items > 0 || evidence.pos > 0);
}

/** ยอดค้างเกินวงเงินไหม — วงเงินว่าง/0/ติดลบ = ไม่จำกัด */
export function overLimit(openAmount: number, limit: unknown): boolean {
  const l = Number(limit);
  return Number.isFinite(l) && l > 0 && openAmount > l;
}

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — server รันบน UTC */
export function todayTH(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

// ───────── เทมเพลตเครดิตเทอมที่ใช้บ่อย (app_settings.credit_term_templates) ─────────
export type CreditTermTemplate = { term: string; label?: string };

/** เทมเพลตตั้งต้น ถ้าบริษัทยังไม่ได้ตั้งเอง */
export const DEFAULT_TERM_TEMPLATES: CreditTermTemplate[] = [
  { term: "immediate" }, { term: "days:15" }, { term: "days:30" }, { term: "days:45" }, { term: "eom" }, { term: "monthday:25" },
];

/** ทำความสะอาดรายการเทมเพลต: ต้องอ่านออกด้วย lib/credit-term · ไม่ซ้ำ · ไม่เกิน 20 */
export function cleanTemplates(raw: unknown): CreditTermTemplate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CreditTermTemplate[] = [];
  for (const r of raw) {
    const term = typeof r === "string" ? r : (r && typeof r === "object" ? String((r as { term?: unknown }).term ?? "") : "");
    if (!term || !parseCreditTerm(term) || seen.has(term)) continue;
    seen.add(term);
    const label = r && typeof r === "object" ? String((r as { label?: unknown }).label ?? "").trim().slice(0, 40) : "";
    out.push(label ? { term, label } : { term });
    if (out.length >= 20) break;
  }
  return out;
}

/** เครดิตที่ใช้บ่อยสุดในข้อมูลจริง (แนะนำเป็นเทมเพลต) */
export function topUsedTerms(values: readonly (string | null | undefined)[], n = 4): string[] {
  const cnt = new Map<string, number>();
  for (const v of values) if (v && parseCreditTerm(v)) cnt.set(v, (cnt.get(v) ?? 0) + 1);
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}

// ───────── หน้ารายละเอียดคู่ค้า (แบบ B · เจ้าของเลือก 2026-11-23) ─────────
export type PoLineLite = { po_id: string; item_sku_id: string | null; qty: number | null; qty_received: number | null; price_est: number | null; currency: string | null };
export type PoLite = { id: string; po_no: string | null; order_date: string | null; status: string | null; currency: string | null; grand_total: number | null };

/** สถานะรับของของใบสั่งซื้อ จากบรรทัด: ยังไม่รับ / รับบางส่วน / รับครบ · ไม่มีบรรทัด = null */
export function poReceiveState(lines: readonly PoLineLite[]): "none" | "partial" | "full" | null {
  let qty = 0, got = 0;
  for (const l of lines) { qty += Math.max(0, Number(l.qty) || 0); got += Math.max(0, Number(l.qty_received) || 0); }
  if (qty <= 0) return null;
  if (got <= 0) return "none";
  return got >= qty ? "full" : "partial";
}

/** สกุลเงินชื่อต่างกันแต่เงินเดียวกัน (RMB/YUAN/CNY = หยวน) */
export const normCur = (c: string | null | undefined): string => {
  const u = String(c || "THB").toUpperCase();
  return u === "YUAN" || u === "CNY" ? "RMB" : u;
};

/** ยอดรวมแยกสกุล (ไม่นับใบยกเลิก) · fromDate = นับเฉพาะใบตั้งแต่วันนี้ (YYYY-MM-DD) */
export function sumByCurrency(pos: readonly PoLite[], fromDate?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pos) {
    if (p.status === "cancelled") continue;
    if (fromDate && (!p.order_date || p.order_date.slice(0, 10) < fromDate)) continue;
    const n = Number(p.grand_total) || 0; if (n <= 0) continue;
    const c = normCur(p.currency); out[c] = Math.round(((out[c] ?? 0) + n) * 100) / 100;
  }
  return out;
}

export type PricePoint = { date: string | null; price: number; currency: string; po_no: string | null; po_id: string };

/** ประวัติราคาต่อสินค้า (จากบรรทัดใบสั่งซื้อที่ไม่ยกเลิก) ใหม่สุดก่อน · ไม่เกิน cap จุดต่อสินค้า */
export function priceHistoryBySku(lines: readonly PoLineLite[], pos: readonly PoLite[], cap = 12): Map<string, PricePoint[]> {
  const poMap = new Map(pos.map((p) => [p.id, p]));
  const out = new Map<string, PricePoint[]>();
  for (const l of lines) {
    const po = poMap.get(l.po_id); const price = Number(l.price_est) || 0;
    if (!l.item_sku_id || !po || po.status === "cancelled" || price <= 0) continue;
    const arr = out.get(l.item_sku_id) ?? [];
    arr.push({ date: po.order_date ? po.order_date.slice(0, 10) : null, price, currency: normCur(l.currency || po.currency), po_no: po.po_no, po_id: po.id });
    out.set(l.item_sku_id, arr);
  }
  for (const [k, arr] of out) out.set(k, arr.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, cap));
  return out;
}

/** ราคาเปลี่ยนกี่ % เทียบครั้งก่อน (สกุลเดียวกันเท่านั้น) · ไม่มีครั้งก่อน = null */
export function priceChangePct(points: readonly PricePoint[]): number | null {
  if (points.length < 2 || points[0].currency !== points[1].currency || points[1].price <= 0) return null;
  return Math.round(((points[0].price - points[1].price) / points[1].price) * 1000) / 10;
}
