/**
 * 💴 ของกลาง (pure): ผูก "บิลจีน" (แอปโอนเงินจีน) ↔ "ใบสั่งซื้อ" — กติกาเดียว ใช้ทั้งหน้าลงบิล (คิดสด) และ API (ตรวจก่อนบันทึก)
 *   ตาราง china_bill_po_links (1 แถว = บิล 1 ใบ จ่ายใบสั่งซื้อ 1 ใบ เป็นยอด ¥ เท่านี้) · migration 202611120900_china_bill_po_links
 *   สถานะจ่ายเงินของใบสั่งซื้อเปลี่ยนเองที่ DB (trigger china_pay_sync_po): ผูกแล้ว = ลงบิลแล้ว รอโอน · บิลโอนครบ + ปิดยอดใบ = จ่ายแล้ว
 * กติกา (เจ้าของอนุมัติ 2026-11-04):
 *   - ใบหยวน: ใส่ยอดได้ไม่เกิน "ที่เหลือ" (ยอดใบ − ที่บิลอื่นผูกไว้) · ใส่เท่าที่เหลือ = ปิดยอดใบนี้ · น้อยกว่า = จ่ายบางส่วน
 *   - ใบหยวนที่ยังไม่มีราคา (¥0): ใส่ยอดเอง ผู้ใช้เลือกว่าปิดยอดไหม
 *   - ใบสกุลบาท (ร้านจีน 123 ใบ ณ วันทำ — ยังไม่รู้ว่าเป็นบาทจริงหรือตั้งผิด): ห้ามแปลง/รวมยอดอัตโนมัติ
 *     ต้องติ๊กยืนยันเอง (currency_confirmed) แล้วใส่ยอด ¥ เอง
 *   - ยอดที่ผูกรวมทุกใบ ต้องไม่เกินยอดบิล (มากกว่าได้ เช่น ค่าส่งในจีน)
 *   - ใบที่จ่ายแล้ว (คนกดเอง หรือบิลอื่นปิดยอดไปแล้ว) ผูกไม่ได้
 *   - บิลค่าส่ง/VAT (บาท) ไม่ผูกใบสั่งซื้อ
 * ทดสอบ: lib/__tests__/china-bill-po.test.ts
 */

export const RMB_CURRENCIES = ["RMB", "YUAN", "CNY"];
export const isRmbCurrency = (cur: string | null | undefined): boolean => RMB_CURRENCIES.includes(String(cur ?? "").trim().toUpperCase());

const EPS = 0.01;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** ใบสั่งซื้อ 1 ใบ ในมุมของ "บิลที่กำลังลง" */
export type BillPoCandidate = {
  po_id: string;
  po_no: string;
  order_date: string | null;
  currency: string;
  is_rmb: boolean;
  grand_total: number;
  partner_id: string | null;
  partner_name: string | null;
  status: string | null;
  payment_status: string | null;
  paid_via: string | null;
  line_count: number;
  /** ชื่อสินค้าบรรทัดแรก ๆ (ไว้ให้คนจำใบได้) */
  items: string;
  /** ยอด ¥ ที่ "บิลอื่น" ผูกไว้แล้ว (เฉพาะบิลที่ยังใช้งาน ไม่ยกเลิก) */
  linked_other_rmb: number;
  /** บิลอื่นปิดยอดใบนี้ไปแล้ว */
  settled_by_other: boolean;
  /** ที่เหลือให้ผูกได้ (¥) — ใบหยวนที่มีราคาเท่านั้น · ใบบาท/ยังไม่มีราคา = null */
  remaining_rmb: number | null;
  /** รายการของบิลนี้ (ถ้าเปิดบิลเดิม) */
  this_amount_rmb: number | null;
  this_settles: boolean | null;
  this_currency_confirmed: boolean | null;
};

export type BillPoLinkInput = { po_id: string; amount_rmb: number | string; settles_po?: boolean; currency_confirmed?: boolean };
export type BillPoLink = { po_id: string; amount_rmb: number; settles_po: boolean; currency_confirmed: boolean };

/** ใบนี้ "ผูกบิลนี้ได้ไหม" — ไม่ได้ คืนเหตุผลภาษาคน */
export function poBlockReason(c: BillPoCandidate): string | null {
  const paid = String(c.payment_status ?? "").toLowerCase() === "paid";
  if (c.this_amount_rmb != null) return null;                     // อยู่ในบิลนี้อยู่แล้ว = แก้ยอดได้เสมอ
  if (paid && c.paid_via !== "china_bill") return "ใบนี้กดจ่ายแล้ว";
  if (c.settled_by_other || paid) return "จ่ายครบแล้วด้วยบิลอื่น";
  if (c.remaining_rmb != null && c.remaining_rmb <= EPS) return "ผูกบิลอื่นครบยอดแล้ว";
  return null;
}

/** ยอดตั้งต้นตอนติ๊กใบ: ใบหยวนมีราคา = ที่เหลือ · อื่น ๆ = ว่าง (ให้คนใส่เอง) */
export function defaultAmount(c: BillPoCandidate): number | null {
  return c.is_rmb && c.remaining_rmb != null && c.remaining_rmb > 0 ? r2(c.remaining_rmb) : null;
}

export type LinkCheck = {
  /** ระดับต่อใบ: ok ครบใบ · partial บางส่วน · need_amount ยังไม่ใส่ยอด · over เกินที่เหลือ · need_confirm ใบบาทยังไม่ยืนยัน · no_price ใบไม่มีราคา (ใส่ยอดแล้ว) · blocked ผูกไม่ได้ */
  kind: "ok" | "partial" | "need_amount" | "over" | "need_confirm" | "no_price" | "blocked";
  label: string;
  /** ที่ยังเหลือหลังรอบนี้ (ใบหยวนมีราคา) */
  left_rmb: number | null;
  settles: boolean;
};

/** ตรวจ 1 ใบ (ใช้โชว์ป้ายสดในหน้าลงบิล + ใช้ตรวจตอนบันทึก) */
export function checkLink(c: BillPoCandidate, input: { amount_rmb: number | string; settles_po?: boolean; currency_confirmed?: boolean }): LinkCheck {
  const block = poBlockReason(c);
  if (block) return { kind: "blocked", label: block, left_rmb: null, settles: false };
  const amt = r2(Number(String(input.amount_rmb ?? "").replace(/,/g, "")) || 0);
  if (!c.is_rmb && !input.currency_confirmed) {
    return { kind: "need_confirm", label: `ใบนี้ตั้งเป็น ${c.currency || "บาท"} — สกุลเงินไม่ตรง ตรวจก่อน แล้วติ๊กยืนยัน`, left_rmb: null, settles: false };
  }
  if (amt <= 0) return { kind: "need_amount", label: "ใส่ยอด ¥ ที่จ่ายใบนี้", left_rmb: null, settles: false };
  if (!c.is_rmb || c.remaining_rmb == null) {
    const settles = input.settles_po !== false;
    return { kind: "no_price", label: settles ? "ปิดยอดใบนี้" : "จ่ายบางส่วน", left_rmb: null, settles };
  }
  const left = r2(c.remaining_rmb - amt);
  if (left < -EPS) return { kind: "over", label: `เกินที่เหลือของใบ ¥${fmtRmb(-left)}`, left_rmb: left, settles: false };
  if (left > EPS) return { kind: "partial", label: `จ่ายบางส่วน · เหลือ ¥${fmtRmb(left)}`, left_rmb: left, settles: false };
  return { kind: "ok", label: "ครบใบ", left_rmb: 0, settles: true };
}

export type ValidateResult = { ok: boolean; errors: string[]; links: BillPoLink[]; sum_rmb: number };

/**
 * ตรวจทั้งชุดก่อนบันทึก
 * @param billAmountRmb ยอดบิล (¥ ไม่รวมค่าโอน) · null = บิลบาท (ค่าส่ง/VAT) → ผูกไม่ได้
 */
export function validateBillLinks(billAmountRmb: number | null, inputs: BillPoLinkInput[], candidates: Map<string, BillPoCandidate>): ValidateResult {
  const errors: string[] = [];
  const links: BillPoLink[] = [];
  const seen = new Set<string>();
  if (inputs.length && billAmountRmb == null) errors.push("บิลค่าส่ง/VAT ผูกใบสั่งซื้อไม่ได้");
  for (const inp of inputs) {
    const c = candidates.get(inp.po_id);
    if (!c) { errors.push("ไม่พบใบสั่งซื้อที่เลือก (อาจถูกลบไปแล้ว)"); continue; }
    if (seen.has(inp.po_id)) { errors.push(`${c.po_no} เลือกซ้ำ`); continue; }
    seen.add(inp.po_id);
    const chk = checkLink(c, inp);
    if (chk.kind === "blocked" || chk.kind === "over" || chk.kind === "need_amount" || chk.kind === "need_confirm") {
      errors.push(`${c.po_no}: ${chk.label}`);
      continue;
    }
    links.push({ po_id: inp.po_id, amount_rmb: r2(Number(String(inp.amount_rmb).replace(/,/g, "")) || 0), settles_po: chk.settles, currency_confirmed: !c.is_rmb && !!inp.currency_confirmed });
  }
  const sum = r2(links.reduce((a, l) => a + l.amount_rmb, 0));
  if (billAmountRmb != null && sum > billAmountRmb + EPS) errors.push(`ยอดที่ผูกรวม ¥${fmtRmb(sum)} เกินยอดบิล ¥${fmtRmb(billAmountRmb)} — ลดยอดในใบใดใบหนึ่ง หรือแก้ยอดบิล`);
  return { ok: errors.length === 0, errors, links, sum_rmb: sum };
}

export const fmtRmb = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
