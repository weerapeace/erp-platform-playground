// ของกลาง: ตรรกะ "สถานะงานผลิต 9 ขั้น" ที่เดียว — ใช้ทั้ง Popup สถานะ + badge บนการ์ด
// กติกา: จ่าย/ส่ง ชนะเสมอ (แม้ของยังไม่ครบ) — ผู้เรียกไปเติม note เตือนเอง
//
// + คำถามกลาง 3 ข้อของใบสั่งผลิต (moProgress) — "จ่ายงานแล้วไหม / จ่ายครบไหม / ช่างส่งงานครบ (เข้า QC) ไหม"
//   เจ้าของสั่ง 2026-11-02: รวมให้เหลือที่เดียว (เดิมคิดเอง 9 ที่ กติกาข้ามขั้น/ปัดเศษไม่ตรงกัน)
//   ใครใช้ (ต้องถามผ่านนี้ ห้ามเทียบ received >= qty เอง): computeMoStatus · lib/mo-dispatch · lib/mo-workflow (ปิดงาน)
//   · lib/mo-backlog (กลุ่ม A/B) · /api/mo/backlog · /api/mo/production-dashboard · /api/mo/sales-unlinked · work-board/mo-steps
//   ก่อนแก้: npm run where-used -- mo-production
export type MoStatusTone = "gray" | "rose" | "amber" | "green" | "indigo";

/** ยอดต่างกันน้อยกว่านี้ถือว่าเท่ากัน (กันเศษทศนิยมจากการบวกยอดหลายใบจ่ายงาน) */
export const MO_QTY_EPS = 0.0001;

/** ป้ายข้ามขั้นที่เกี่ยว (lib/mo-skip) — ส่ง parseSkipped(m.skipped_stages) มาได้ตรง ๆ */
export type MoSkipFlags = { dispatch?: unknown; receive?: unknown } | null | undefined;

export type MoProgressFacts = { qty: number; dispatched: number; received: number; skipped?: MoSkipFlags };
export type MoProgressAnswer = {
  /** จ่ายงานแล้ว (อย่างน้อย 1 ชิ้น หรือข้ามขั้นจ่ายงาน หรือส่งครบแล้ว) */
  started: boolean;
  /** จ่ายครบทุกชิ้น (หรือข้ามขั้นจ่ายงาน) */
  dispatchedAll: boolean;
  /** ช่างส่งงานครบ = เข้า QC แล้ว (หรือแอดมินข้ามขั้นรับคืน) */
  submittedAll: boolean;
  /** ยังไม่ได้จ่ายกี่ชิ้น (จ่ายครบ/ข้ามขั้นจ่าย = 0) */
  remaining: number;
};

export function moProgress(f: MoProgressFacts): MoProgressAnswer {
  const q = Number(f.qty) || 0;
  const disp = Number(f.dispatched) || 0;
  const recv = Number(f.received) || 0;
  const sk = f.skipped ?? {};
  const submittedAll = (q > 0 && recv >= q - MO_QTY_EPS) || !!sk.receive;
  const dispatchedAll = (q > 0 && disp >= q - MO_QTY_EPS) || !!sk.dispatch || submittedAll;
  return {
    started: disp > MO_QTY_EPS || !!sk.dispatch || submittedAll,
    dispatchedAll, submittedAll,
    remaining: dispatchedAll ? 0 : Math.round(Math.max(0, q - disp) * 100) / 100,
  };
}

/**
 * บอร์ดจ่ายงาน: ยังต้องจ่ายช่างอีกกี่ชิ้น — ของที่ "ขายไปแล้ว" (ผูกใบขาย mo_sales_links) = ผลิตเสร็จแล้ว
 * แม้ในระบบยังไม่ได้บันทึกจ่ายช่าง → หักด้วยตัวที่มากกว่าระหว่าง จ่ายแล้ว / ขายแล้ว (เจ้าของ 2026-11-05 "ขายแล้ว 200 ชิ้น งานควรเหลือ 200")
 * ขายครบ = 0 → ไม่ขึ้นการ์ดรอจ่าย (ไปบันทึกผลิตที่ "อัปเดตงานจากใบขาย" แล้วระบบปิดงานเอง — lib/mo-auto-close)
 * ใช้ที่ /api/mo/work-board (ทุกมุมมองของบอร์ด) · ป๊อปอัปเดตงาน (catch-up) ยังคิด จำนวน − จ่ายแล้ว ตามเดิม เพราะใช้บันทึกของที่ทำไปแล้ว
 */
export function remainingToDispatch(qty: number, dispatched: number, sold = 0): number {
  const done = Math.max(Number(dispatched) || 0, Number(sold) || 0);
  const left = (Number(qty) || 0) - done;
  return left > MO_QTY_EPS ? Math.round(left * 100) / 100 : 0;
}

export type MoStatusInput = {
  prepDone: number; prepTotal: number;
  cutDone: number; cutTotal: number;
  qty: number; dispatched: number; received: number;
  skipped?: MoSkipFlags;
};

export type MoStatusResult = { code: number; label: string; short: string; tone: MoStatusTone };

export function computeMoStatus(i: MoStatusInput): MoStatusResult {
  const prepOk = i.prepTotal > 0 && i.prepDone >= i.prepTotal;
  const cutOk = i.cutTotal === 0 || i.cutDone >= i.cutTotal;
  const p = moProgress(i);
  const sk = i.skipped ?? {};
  if (p.submittedAll) {
    return i.qty > 0 && i.received >= i.qty - MO_QTY_EPS
      ? { code: 9, label: "ส่งครบแล้ว", short: "ส่งครบ", tone: "green" }
      : { code: 9, label: "ข้ามขั้นรับคืนแล้ว", short: "ข้ามรับคืน", tone: "green" };
  }
  if (i.received > 0)                  return { code: 8, label: "ส่งแล้วบางส่วน", short: "ส่งบางส่วน", tone: "amber" };
  if (p.dispatchedAll) {
    return sk.dispatch && !(i.dispatched > 0)
      ? { code: 6, label: "ข้ามขั้นจ่ายงาน — รอรับคืน", short: "ข้ามจ่าย", tone: "indigo" }
      : { code: 6, label: "จ่ายครบแล้ว — กำลังผลิต", short: "กำลังผลิต", tone: "indigo" };
  }
  if (i.dispatched > 0)               return { code: 7, label: "จ่ายบางส่วน — ยังจ่ายไม่ครบ", short: "จ่ายบางส่วน", tone: "indigo" };
  if (prepOk && cutOk)                return { code: 5, label: "พร้อมจ่าย", short: "พร้อมจ่าย", tone: "green" };
  if (i.cutDone > 0 && !prepOk)       return { code: 4, label: "ตัดแล้วแต่ของยังไม่ครบ", short: "ตัด·ของไม่ครบ", tone: "rose" };
  if (prepOk && i.cutDone === 0)      return { code: 3, label: "เตรียมครบ รอตัด", short: "รอตัด", tone: "amber" };
  if (i.prepDone > 0)                 return { code: 2, label: "ของไม่ครบ", short: "ของไม่ครบ", tone: "rose" };
  return { code: 1, label: "ยังไม่เริ่ม", short: "ยังไม่เริ่ม", tone: "gray" };
}

// สี badge ต่อ tone (ใช้บนการ์ด/ชิป)
export const MO_STATUS_TONE_CLASS: Record<MoStatusTone, string> = {
  gray: "bg-slate-100 text-slate-600 border-slate-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
};
