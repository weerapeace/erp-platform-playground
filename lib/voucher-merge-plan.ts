/**
 * 🧾 ออกใบสำคัญรับจากหลายใบรับ — "รวม" หรือ "แยก" (pure)
 * เจ้าของถาม 2026-11-05: "ตอนใส่ตะกร้าแล้วไปเปิดใบสำคัญ อยากให้เลือกได้ว่าจะแยก (งงว่าแยกจากอะไร) หรือรวม"
 *   ที่มาของ "แยก": รับของ 1 ครั้ง (ชุด RB-…) ระบบออกใบรับ 1 ใบต่อใบสั่งซื้อ 1 ใบ → ได้หลายใบรับ
 *   รวม = ร้านเดียวกัน + สกุลเงินเดียวกัน = ใบสำคัญ 1 ใบ (API ไม่ยอมรวมคนละสกุล) · แยก = 1 ใบรับ = 1 ใบสำคัญ
 * ใช้ที่ app/purchasing/vouchers (ป๊อปก่อนสร้าง) · ทดสอบ lib/__tests__/voucher-merge-plan.test.ts
 */

export type MergeGr = { id: string; gr_no: string; po_no: string; seller_name: string; currency: string };
export type VoucherPlanGroup = { key: string; seller_name: string; currency: string; grs: MergeGr[] };

const curKey = (c: string) => { const u = String(c || "THB").toUpperCase(); return u === "YUAN" || u === "CNY" ? "RMB" : u; };

export function planVoucherGroups(grs: MergeGr[], mode: "merge" | "split"): VoucherPlanGroup[] {
  if (mode === "split") return grs.map((g) => ({ key: g.id, seller_name: g.seller_name, currency: curKey(g.currency), grs: [g] }));
  const map = new Map<string, VoucherPlanGroup>();
  for (const g of grs) {
    const key = `${g.seller_name.trim()}|${curKey(g.currency)}`;
    const e = map.get(key) ?? { key, seller_name: g.seller_name, currency: curKey(g.currency), grs: [] };
    e.grs.push(g);
    map.set(key, e);
  }
  return [...map.values()];
}

/** ร้านที่มีใบรับหลายสกุลในชุดที่เลือก (รวมเป็นใบเดียวไม่ได้ — แก้สกุลที่ใบสั่งซื้อก่อนถ้าตั้งผิด) */
export function mixedCurrencyShops(grs: MergeGr[]): string[] {
  const by = new Map<string, Set<string>>();
  for (const g of grs) { const s = by.get(g.seller_name) ?? new Set<string>(); s.add(curKey(g.currency)); by.set(g.seller_name, s); }
  return [...by.entries()].filter(([, s]) => s.size > 1).map(([n]) => n);
}

/**
 * ★ 2026-11-15 รวมใบร่างหลายใบเป็นใบเดียว (เจ้าของ: "บิลนี้เป็น 3 บิล แต่ส่งของมารอบเดียว" → เลือกแบบ A รวมใบเดียว)
 * รวมได้เมื่อ: เลือก ≥ 2 ใบ · ทุกใบเป็นร่าง · ร้านเดียวกัน · สกุลเดียวกัน — ไม่ผ่าน = บอกเหตุผลเป็นภาษาคน
 * ใบหลัก (ค่าเริ่ม) = ใบที่วันที่เก่าสุด (บิลแรก) · ใช้ทั้งหน้ารายการและ API /api/purchasing/vouchers/merge
 */
export type DraftForMerge = { id: string; pv_no: string | null; status: string; voucher_date: string; seller_name: string | null; currency: string; editing_at?: string | null };
export function checkDraftMerge(rows: DraftForMerge[]): { ok: boolean; reason: string | null; targetId: string | null } {
  if (rows.length < 2) return { ok: false, reason: "เลือกใบร่างอย่างน้อย 2 ใบ", targetId: null };
  const notDraft = rows.filter((r) => r.status !== "draft" || r.editing_at);
  if (notDraft.length) return { ok: false, reason: `รวมได้เฉพาะใบร่าง — ${notDraft.map((r) => r.pv_no ?? "ใบที่ไม่มีเลข").join(", ")} ไม่ใช่ร่าง`, targetId: null };
  const norm = (s: string | null) => String(s ?? "").trim();
  const shops = [...new Set(rows.map((r) => norm(r.seller_name)))];
  if (shops.length > 1) return { ok: false, reason: `ต้องเป็นร้านเดียวกัน (เลือกมา ${shops.length} ร้าน)`, targetId: null };
  const curs = [...new Set(rows.map((r) => String(r.currency ?? "THB").toUpperCase().replace("YUAN", "RMB").replace("CNY", "RMB")))];
  if (curs.length > 1) return { ok: false, reason: `ต้องเป็นสกุลเงินเดียวกัน (${curs.join(" / ")})`, targetId: null };
  const target = [...rows].sort((a, b) => String(a.voucher_date).localeCompare(String(b.voucher_date)) || String(a.pv_no ?? "").localeCompare(String(b.pv_no ?? "")))[0];
  return { ok: true, reason: null, targetId: target.id };
}


/**
 * ★ 2026-11-21 รวมใบสำคัญรับ "ยืนยันแล้ว" ได้ด้วย (เจ้าของเลือกแบบ 1 + ข้อเสนอ 1, 2, 3 ในเซสชันแม่)
 *   เคสจริง: PV2026-11-11-003 + PV2026-11-03-002 ร้านเดียวกัน ส่งรถคันเดียวกัน แต่กดยืนยันทันทีหลังสร้าง → รวมไม่ได้
 * รวมได้เมื่อ: ≥ 2 ใบ · ร่าง หรือ ยืนยันแล้ว (ไม่ใช่ยกเลิก) · ร้านเดียวกัน · สกุลเดียวกัน
 *   ใบยืนยันแล้วต้อง "ยังไม่จ่าย": ไม่ผูกบิลโอนเงินจีน (china_bill_id) · ไม่ผูกบิลค่าส่ง (shipping_bill_id) · ค่าส่งยังไม่ติ๊กจ่าย
 *   ใบที่คนอื่นกำลังแก้อยู่ = กันไว้ (คนเดียวกัน = ผ่าน)
 * ใบหลัก (ค่าเริ่ม) = วันที่เก่าสุด · มีใบยืนยันแล้วในชุด → API ให้ใบหลักเข้าโหมดแก้ไข (ใส่ค่าส่งแล้วกด บันทึกการแก้ไข)
 * ใช้ทั้งหน้ารายการ (ปุ่มรวม) และ API /api/purchasing/vouchers/merge (ตรวจซ้ำฝั่งเซิร์ฟเวอร์)
 */
export type VoucherForMerge = DraftForMerge & {
  china_bill_id?: string | null; shipping_bill_id?: string | null; shipping_payment_status?: string | null;
  editing_by?: string | null; is_active?: boolean | null;
};
export type MergeBlock = { id: string; pv_no: string | null; why: string };

/** ใบยืนยันแล้วนี้จ่ายไปแล้วหรือยัง (ผูกบิลโอนจีน / บิลค่าส่ง / ติ๊กจ่ายค่าส่ง) — คืนเหตุผล หรือ null = ยังไม่จ่าย */
export function voucherPaidReason(v: Pick<VoucherForMerge, "china_bill_id" | "shipping_bill_id" | "shipping_payment_status">): string | null {
  if (v.china_bill_id) return "ผูกบิลโอนเงินจีนแล้ว";
  if (v.shipping_bill_id) return "ผูกบิลค่าส่งแล้ว";
  if (String(v.shipping_payment_status ?? "") === "paid") return "จ่ายค่าส่งแล้ว";
  return null;
}

export function checkVoucherMerge(rows: VoucherForMerge[], actorName: string | null): { ok: boolean; reason: string | null; targetId: string | null; hasConfirmed: boolean; blocks: MergeBlock[] } {
  const fail = (reason: string, blocks: MergeBlock[] = []) => ({ ok: false, reason, targetId: null, hasConfirmed: false, blocks });
  if (rows.length < 2) return fail("เลือกใบสำคัญรับอย่างน้อย 2 ใบ");
  const label = (r: VoucherForMerge) => r.pv_no ?? "ใบที่ไม่มีเลข";
  const blocks: MergeBlock[] = [];
  for (const r of rows) {
    if (r.status === "cancelled" || r.is_active === false) { blocks.push({ id: r.id, pv_no: r.pv_no, why: "ยกเลิกแล้ว" }); continue; }
    if (r.status !== "draft" && r.status !== "confirmed") { blocks.push({ id: r.id, pv_no: r.pv_no, why: "สถานะรวมไม่ได้" }); continue; }
    if (r.status === "confirmed") { const paid = voucherPaidReason(r); if (paid) { blocks.push({ id: r.id, pv_no: r.pv_no, why: paid }); continue; } }
    if (r.editing_at && (!actorName || String(r.editing_by ?? "") !== actorName)) blocks.push({ id: r.id, pv_no: r.pv_no, why: `กำลังถูกแก้โดย ${r.editing_by ?? "คนอื่น"} (ให้คนนั้นกดรวม หรือกด ยกเลิกการแก้ ก่อน)` });
  }
  if (blocks.length) return fail(blocks.map((b) => `${b.pv_no ?? "ใบที่ไม่มีเลข"}: ${b.why}`).join(" · "), blocks);
  const norm = (x: string | null) => String(x ?? "").trim();
  const shops = [...new Set(rows.map((r) => norm(r.seller_name)))];
  if (shops.length > 1) return fail(`ต้องเป็นร้านเดียวกัน (เลือกมา ${shops.length} ร้าน)`);
  const curs = [...new Set(rows.map((r) => String(r.currency ?? "THB").toUpperCase().replace("YUAN", "RMB").replace("CNY", "RMB")))];
  if (curs.length > 1) return fail(`ต้องเป็นสกุลเงินเดียวกัน (${curs.join(" / ")})`);
  const target = [...rows].sort((a, b) => String(a.voucher_date).localeCompare(String(b.voucher_date)) || String(a.pv_no ?? "").localeCompare(String(b.pv_no ?? "")))[0];
  void label;
  return { ok: true, reason: null, targetId: target.id, hasConfirmed: rows.some((r) => r.status === "confirmed"), blocks: [] };
}

/**
 * ★ 2026-11-21 ข้อเสนอ 1: ตอนกด "ยืนยัน + ออกเลข" — ใบอื่นของร้านเดียวกันที่น่าจะ "ส่งมาพร้อมกัน"
 *   = สกุลเดียวกัน · ร่าง หรือ ยืนยันแล้วแต่ยังไม่จ่าย · ยังไม่มีค่าส่ง (0/ว่าง) · วันที่ห่างไม่เกิน 14 วัน · ไม่ใช่ใบนี้ · ไม่ถูกยกเลิก
 */
export type ShipTogetherRow = { id: string; pv_no: string | null; status: string; voucher_date: string; seller_name: string | null; seller_partner_id?: string | null; currency: string;
  ship_total_thb?: number | string | null; china_bill_id?: string | null; shipping_bill_id?: string | null; shipping_payment_status?: string | null; is_active?: boolean | null };
export const SHIP_TOGETHER_DAYS = 14;
export function shipTogetherCandidates(me: ShipTogetherRow, others: ShipTogetherRow[]): ShipTogetherRow[] {
  const cur = (c: string) => String(c ?? "THB").toUpperCase().replace("YUAN", "RMB").replace("CNY", "RMB");
  const sameShop = (o: ShipTogetherRow) => (me.seller_partner_id && o.seller_partner_id ? me.seller_partner_id === o.seller_partner_id : String(o.seller_name ?? "").trim() === String(me.seller_name ?? "").trim());
  const day = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return others.filter((o) => o.id !== me.id && o.is_active !== false && (o.status === "draft" || (o.status === "confirmed" && !voucherPaidReason(o)))
    && sameShop(o) && cur(o.currency) === cur(me.currency) && !(Number(o.ship_total_thb ?? 0) > 0)
    && Math.abs(day(String(o.voucher_date).slice(0, 10)) - day(String(me.voucher_date).slice(0, 10))) <= SHIP_TOGETHER_DAYS * 86400000)
    .sort((a, b) => String(a.voucher_date).localeCompare(String(b.voucher_date)));
}

/** ★ 2026-11-21 หัวใบที่จดไว้ตอนรวม (split_data) — "แยกใบกลับ" คืนค่าพวกนี้ให้ใบหลักและใบที่ถูกรวม */
export const MERGE_HEADER_KEYS = ["status", "pv_no", "voucher_date", "note", "is_active", "editing_at", "editing_by", "edit_reason", "china_bill_id",
  "seller_ship_foreign", "pay_fee_thb", "paid_total_thb", "fx_rate", "seller_partner_id"] as const;
