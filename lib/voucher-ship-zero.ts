/**
 * 🚚 ค่าส่งของใบสำคัญรับเป็น ฿0 เพราะอะไร + ปุ่มแก้ที่ทำได้ทันที (เจ้าของเลือก 2026-11-27 ข้อ 2 + 4)
 *
 * ใช้: shipZeroCauses({ header, lines, delivery }) → { ship_thb, causes[], preview_all_thb }
 *   - ค่าส่ง > 0 = ไม่มีสาเหตุ (causes ว่าง)
 *   - แต่ละสาเหตุมี fix (หน้าใบเป็นคนทำ) + preview_thb = ค่าส่งถ้าแก้ข้อนั้นข้อเดียว (null = คิดล่วงหน้าไม่ได้)
 *   - preview_all_thb = ค่าส่งถ้าแก้ทุกข้อที่แก้ในหน้าได้ทันที (ล้างช่องยอดจริง · เปลี่ยนวิธีคิด)
 * ใช้ที่: หน้า /purchasing/vouchers/[id] — เช็กลิสต์ข้างหน้า · ป๊อปยืนยัน · ป๊อปก่อนบันทึกการแก้ไข
 * สูตรค่าส่ง = computeVoucher (lib/landed-cost) ตัวเดียวกับหน้า/เซิร์ฟเวอร์ — ไม่คิดเอง
 * pure ไม่มี I/O · เทสต์: lib/__tests__/voucher-ship-zero.test.ts
 */
import { computeVoucher, shipRates, type ShipMethod, type VoucherHeaderInput, type VoucherLineInput } from "./landed-cost";

export type RateMethod = Exclude<ShipMethod, "none">;
export type ShipFix =
  | { kind: "clear_manual" }                                         // ล้างช่อง "ค่าส่งยอดจริง" → ใช้เรท
  | { kind: "switch_method"; to: RateMethod; line_idx: number[] }     // บรรทัดเหล่านี้คิดตามอีกวิธี (วิธีที่มีเรท)
  | { kind: "set_header_method"; to: RateMethod }                     // ใบตั้ง "ไม่คิดค่าส่ง" → คิดตามคิว/กก.
  | { kind: "apply" }                                                // ใช้น้ำหนัก/คิวจากใบส่งของ
  | { kind: "goto_delivery" }                                        // ไปจับคู่กล่องในแผงใบส่งของ
  | { kind: "goto_ship" }                                            // ไปใส่เรทในกล่องค่าส่ง
  | { kind: "goto_lines" };                                          // ไปใส่คิว/กก. ในตารางรายการ

export type ShipCauseKey = "unapplied" | "unmapped" | "manual_zero" | "method_none" | "no_rate" | "no_basis";
export type ShipCause = { key: ShipCauseKey; text: string; fix: ShipFix; fix_label: string; preview_thb: number | null };

export type ShipZeroInput = {
  header: VoucherHeaderInput;
  lines: VoucherLineInput[];
  /** สถานะแผงใบส่งของ (กล่องของใบนี้ · ยังไม่ได้ใช้ · ยังไม่ได้จับคู่) — ไม่มีแผง = 0 */
  delivery?: { mineRows: number; unappliedRows: number; unmappedRows: number } | null;
};

export const METHOD_WORD: Record<RateMethod, string> = { cube: "คิว", weight: "กก." };
const other = (m: RateMethod): RateMethod => (m === "cube" ? "weight" : "cube");
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const perUnit = (l: VoucherLineInput, m: RateMethod) => n(m === "cube" ? l.cbm_per_unit : l.kg_per_unit);
const shipOf = (h: VoucherHeaderInput, ls: VoucherLineInput[]) => computeVoucher(h, ls).totals.ship_total_thb;

/** ใส่การแก้ (ที่หน้าใบทำได้ทันที) ลงหัวใบ/บรรทัด — ใช้ทั้งคิดค่าส่งล่วงหน้าและให้หน้าใบรู้ว่าต้องเปลี่ยนอะไร */
export function applyShipFixes(h: VoucherHeaderInput, ls: VoucherLineInput[], fixes: ShipFix[]): { header: VoucherHeaderInput; lines: VoucherLineInput[] } {
  let header = { ...h };
  const lines = ls.map((l) => ({ ...l }));
  for (const f of fixes) {
    if (f.kind === "clear_manual") header = { ...header, ship_manual_total: null };
    else if (f.kind === "set_header_method") header = { ...header, ship_method: f.to };
    else if (f.kind === "switch_method") for (const i of f.line_idx) if (lines[i]) lines[i] = { ...lines[i], ship_method: f.to };
  }
  return { header, lines };
}

/** กล่องของใบนี้ที่จับคู่สินค้าแล้วแต่ยังไม่ได้ใช้น้ำหนัก/คิว (ใช้ให้เองได้ตอนกดยืนยัน) */
export const mappedUnapplied = (d: { unappliedRows: number; unmappedRows: number } | null | undefined) => Math.max(0, (d?.unappliedRows ?? 0) - (d?.unmappedRows ?? 0));

export const isQuickFix = (f: ShipFix) => f.kind === "clear_manual" || f.kind === "switch_method" || f.kind === "set_header_method";

export function shipZeroCauses(i: ShipZeroInput): { ship_thb: number; causes: ShipCause[]; preview_all_thb: number | null } {
  const { header, lines } = i;
  const calc = computeVoucher(header, lines);
  const ship = calc.totals.ship_total_thb;
  if (ship > 0 || lines.length === 0) return { ship_thb: ship, causes: [], preview_all_thb: null };
  const d = i.delivery ?? { mineRows: 0, unappliedRows: 0, unmappedRows: 0 };
  const rates = shipRates(header);
  const causes: ShipCause[] = [];
  const preview = (fixes: ShipFix[]) => { const x = applyShipFixes(header, lines, fixes); const v = shipOf(x.header, x.lines); return v > 0 ? v : null; };

  // กล่องที่ยังไม่ได้ใช้ = รวมกล่องที่ยังไม่ได้จับคู่ (ใช้ไม่ได้) → ปุ่ม "ใช้" เฉพาะกล่องที่จับคู่แล้ว
  const applicable = mappedUnapplied(d);
  if (applicable > 0) causes.push({ key: "unapplied", text: `ยังไม่ได้ใช้น้ำหนัก/คิวจากใบส่งของ ${applicable} กล่อง`, fix: { kind: "apply" }, fix_label: "ใช้น้ำหนัก/คิว", preview_thb: null });
  if (d.unmappedRows > 0) causes.push({ key: "unmapped", text: `กล่องในใบส่งของยังไม่ได้จับคู่สินค้า ${d.unmappedRows} กล่อง`, fix: { kind: "goto_delivery" }, fix_label: "ไปจับคู่", preview_thb: null });

  const manual = header.ship_manual_total;
  if (manual != null && Number.isFinite(Number(manual)) && n(manual) === 0) {
    const fix: ShipFix = { kind: "clear_manual" };
    causes.push({ key: "manual_zero", text: `ช่อง "ค่าส่งยอดจริง" ใส่ 0 ไว้ — ทับค่าที่คิดจากเรท`, fix, fix_label: "ล้างช่องนี้", preview_thb: preview([fix]) });
  }

  const anyShip = calc.lines.some((c) => c.method !== "none");
  if (!anyShip) {
    // ใบตั้ง "ไม่คิดค่าส่ง" — เตือนเฉพาะตอนมีของให้คิด (มีกล่องในใบส่งของ หรือมีคิว/กก.)
    if (d.mineRows > 0 || calc.totals.total_cbm > 0 || calc.totals.total_kg > 0) {
      const to: RateMethod = rates.cube > 0 ? "cube" : rates.weight > 0 ? "weight" : calc.totals.total_cbm > 0 ? "cube" : "weight";
      const fix: ShipFix = { kind: "set_header_method", to };
      causes.push({ key: "method_none", text: `ใบตั้ง "ไม่คิดค่าส่ง"`, fix, fix_label: `คิดตาม${METHOD_WORD[to]}`, preview_thb: preview([fix]) });
    }
  } else {
    // บรรทัดมีปริมาณแต่วิธีนั้นไม่มีเรท → เสนอเปลี่ยนเป็นวิธีที่มีเรท (ถ้าบรรทัดมีปริมาณของวิธีนั้น)
    const noRate: Record<RateMethod, number[]> = { cube: [], weight: [] };
    calc.lines.forEach((c, k) => { if (c.method !== "none" && c.basis > 0 && c.ship_by_rate_thb <= 0 && rates[c.method] <= 0) noRate[c.method].push(k); });
    for (const m of ["weight", "cube"] as RateMethod[]) {
      const idx = noRate[m];
      if (!idx.length) continue;
      const o = other(m);
      const can = rates[o] > 0 ? idx.filter((k) => perUnit(lines[k], o) * n(lines[k].qty) > 0) : [];
      if (can.length) {
        const fix: ShipFix = { kind: "switch_method", to: o, line_idx: can };
        causes.push({ key: "no_rate", text: `สินค้า ${can.length} รายการตั้งคิดตาม ${METHOD_WORD[m]} แต่ใบมีแค่เรทต่อ${METHOD_WORD[o]} ฿${money(rates[o])}`, fix, fix_label: `คิดตาม${METHOD_WORD[o]}แทน`, preview_thb: preview([fix]) });
      }
      if (can.length < idx.length) causes.push({ key: "no_rate", text: `ยังไม่มีเรทต่อ${METHOD_WORD[m]} (สินค้า ${idx.length - can.length} รายการคิดตาม ${METHOD_WORD[m]})`, fix: { kind: "goto_ship" }, fix_label: "ใส่เรท", preview_thb: null });
    }
    // ต้องคิดค่าส่งแต่ไม่มีคิว/กก. — ถ้ายังมีกล่องในใบส่งของที่ยังไม่ได้ใช้/จับคู่ ข้อบนครอบแล้ว
    const noBasis = calc.lines.filter((c, k) => c.method !== "none" && c.basis <= 0 && n(lines[k].qty) > 0).length;
    if (noBasis > 0 && d.unappliedRows === 0 && d.unmappedRows === 0)
      causes.push({ key: "no_basis", text: `สินค้า ${noBasis} รายการยังไม่มีคิว/กก.`, fix: d.mineRows > 0 ? { kind: "goto_delivery" } : { kind: "goto_lines" }, fix_label: d.mineRows > 0 ? "ดูใบส่งของ" : "ไปใส่คิว/กก.", preview_thb: null });
  }

  const quick = causes.map((c) => c.fix).filter(isQuickFix);
  return { ship_thb: ship, causes, preview_all_thb: quick.length ? preview(quick) : null };
}
