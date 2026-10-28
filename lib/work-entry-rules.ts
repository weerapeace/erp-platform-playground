/**
 * กฎกลางของการลงงานผลิต (จ่ายงาน / ช่างส่งคืน / QC รับเข้า) — ไม่มี React ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์
 * ใช้ร่วม: ป๊อปจ่ายงานบนบอร์ด (page.tsx) · ป๊อป 🔄 อัปเดตงาน (catch-up.ts) — แก้กฎที่นี่ที่เดียว ทุกป๊อปเปลี่ยนตาม
 *
 * ระดับ: error = ต้องแก้ก่อนบันทึก · warn = เตือนสีเหลือง บันทึกได้ (เหมือนป๊อป "ยังไม่พร้อมจ่าย" เดิม)
 * field = คีย์ช่องบนจอ (ไว้ทำกรอบแดง/เหลือง + เลื่อนไปช่องแรกที่ผิด)
 */

export type EntryLevel = "error" | "warn";
export type EntryIssue = { level: EntryLevel; field: string; msg: string };

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString("th-TH");

/** Parent SKU จากรหัส (ตัดท้าย -NN) เช่น TTM094-02 → TTM094 — ใช้หาประวัติงานเสียของรุ่นเดียวกัน */
export const parentKeyOf = (sku: string | null | undefined) => (sku ?? "").trim().toUpperCase().replace(/-\d+$/, "");

/** โต๊ะเหมา (ชื่อมีคำว่า เหมา) = เลือกช่างได้ทุกคน แต่ต้องระบุคนรับ */
export const isHireDesk = (name: string | null | undefined) => !!name && /เหมา/.test(name);

/** จ่ายงาน 1 แถว: เลือกโต๊ะ · จำนวน > 0 และไม่เกินที่เหลือ · โต๊ะเหมาต้องเลือกช่าง */
export function dispatchRowIssues(r: { qty: number; remaining: number; deskName: string | null; crewCount: number }, field = "disp"): EntryIssue[] {
  const out: EntryIssue[] = [];
  if (!r.deskName) out.push({ level: "error", field: `${field}:dept`, msg: "เลือกโต๊ะก่อน" });
  if (!(r.qty > 0)) out.push({ level: "error", field: `${field}:qty`, msg: "จำนวนต้องมากกว่า 0" });
  else if (r.qty > r.remaining + EPS) out.push({ level: "error", field: `${field}:qty`, msg: `เกินที่เหลือให้จ่าย ${fmt(r.remaining)} ชิ้น` });
  if (isHireDesk(r.deskName) && r.crewCount === 0) out.push({ level: "error", field: `${field}:crew`, msg: "งานเหมา ต้องเลือกช่างอย่างน้อย 1 คน" });
  return out;
}

/** เตรียม/ตัดยังไม่ครบ = "ยังไม่พร้อมจ่าย" — เตือนแต่จ่ายต่อได้ (กติกาเดียวกับลากการ์ดไปโต๊ะ) */
export function notReadyIssue(prepDone: boolean, cutDone: boolean, field = "disp"): EntryIssue | null {
  if (prepDone && cutDone) return null;
  const miss = [!prepDone && "เตรียม", !cutDone && "ตัด"].filter(Boolean).join("/");
  return { level: "warn", field, msg: `ยังไม่ได้ติ๊ก${miss} — ยังไม่พร้อมจ่าย (จ่ายต่อได้)` };
}

/** ค่าแรง/ชิ้น: ติดลบไม่ได้ · สูงกว่าราคากลางเกิน 2 เท่า = เตือน (พิมพ์เกินหลัก / ใส่ยอดรวมแทนต่อชิ้น) */
export const WAGE_WARN_TIMES = 2;
export function wageIssues(perPiece: number | null | undefined, central: number | null | undefined, field: string): EntryIssue[] {
  if (perPiece == null || Number.isNaN(perPiece)) return [];
  if (perPiece < 0) return [{ level: "error", field, msg: "ค่าแรงติดลบไม่ได้" }];
  if (central && central > 0 && perPiece > central * WAGE_WARN_TIMES)
    return [{ level: "warn", field, msg: `สูงกว่าราคากลาง ฿${fmt(central)}/ชิ้น เกิน ${WAGE_WARN_TIMES} เท่า — ใส่เป็น "ต่อชิ้น" หรือยัง?` }];
  return [];
}

/** ประวัติงานเสียของช่าง "เฉพาะรุ่นเดียวกัน" → ข้อความเตือนที่ชื่อช่าง (null = ไม่เคยเสียรุ่นนี้) */
export function defectNote(items: { sku: string | null }[] | undefined, productSku: string | null | undefined): string | null {
  const pk = parentKeyOf(productSku);
  if (!items?.length || !pk) return null;
  const n = items.filter((it) => parentKeyOf(it.sku) === pk).length;
  return n ? `เคยทำรุ่นนี้เสีย ${n} ครั้ง` : null;
}

/** ช่างส่งคืน 1 รอบ: จำนวน > 0 และไม่เกินที่ค้างช่าง */
export function returnRowIssues(r: { qty: number; outstanding: number }, field = "ret"): EntryIssue[] {
  if (!(r.qty > 0)) return [{ level: "error", field: `${field}:qty`, msg: "จำนวนต้องมากกว่า 0" }];
  if (r.qty > r.outstanding + EPS) return [{ level: "error", field: `${field}:qty`, msg: `เกินที่ค้างช่าง ${fmt(r.outstanding)} ชิ้น` }];
  return [];
}

/** QC รับเข้า: ของดี+เสีย 1..ที่รอรับ · ของดีต้องมีชั้น · ของเสียต้องเลือกสาเหตุ (กติกาเดียวกับหน้าโกดัง QC) */
export function qcReceiveIssues(r: { good: number; bad: number; available: number; shelfChosen: boolean; reasonChosen: boolean }, field = "qc"): EntryIssue[] {
  const out: EntryIssue[] = [];
  const tot = r2((r.good || 0) + (r.bad || 0));
  if (r.available <= EPS) return [{ level: "error", field: `${field}:good`, msg: "ไม่มีของรอ QC รับเข้า" }];
  if (r.good < 0 || r.bad < 0 || !(tot > 0)) out.push({ level: "error", field: `${field}:good`, msg: "ใส่จำนวนของดีหรือของเสีย" });
  else if (tot > r.available + EPS) out.push({ level: "error", field: `${field}:good`, msg: `ของดี + ของเสีย เกินที่รอรับ ${fmt(r.available)} ชิ้น` });
  if (r.good > 0 && !r.shelfChosen) out.push({ level: "error", field: `${field}:shelf`, msg: "เลือกชั้นที่วางของดี" });
  if (r.bad > 0 && !r.reasonChosen) out.push({ level: "error", field: `${field}:reason`, msg: "เลือกสาเหตุของเสีย" });
  return out;
}

/** วันที่: อยู่ในอนาคต = เตือน · ขั้นหลังก่อนขั้นหน้า (เช่น ส่งคืนก่อนวันจ่าย) = เตือน · ว่าง = ข้ามได้ ไม่เตือน */
export function dateIssues(d: string | null | undefined, field: string, opts: { today: string; notBefore?: string | null; notBeforeLabel?: string }): EntryIssue[] {
  if (!d) return [];
  if (d > opts.today) return [{ level: "warn", field, msg: "วันที่อยู่ในอนาคต" }];
  if (opts.notBefore && d < opts.notBefore) return [{ level: "warn", field, msg: `ก่อน${opts.notBeforeLabel ?? "ขั้นก่อนหน้า"} (${opts.notBefore})` }];
  return [];
}

/** "YYYY-MM-DD" ของวันนี้ตามเวลาเครื่อง (ไม่เพี้ยนตามโซนเวลา) */
export const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
