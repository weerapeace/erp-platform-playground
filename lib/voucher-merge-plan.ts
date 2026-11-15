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
