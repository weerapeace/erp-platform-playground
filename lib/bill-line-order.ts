/**
 * ของกลาง — ลำดับแถวของเอกสารที่ AI อ่าน (บิลร้านจีน · ใบส่งของจากขนส่ง)
 *   ★ 2026-11-14 เจ้าของขอ "เวลา AI อ่าน ต้องคงบรรทัดไว้เหมือนเดิม ไม่สลับบรรทัดเอง และอยากให้ย้ายเองได้"
 *   1. BILL_ORDER_RULE  = กฎที่ต่อท้าย prompt: เรียงตามเอกสารจริง + ส่ง page / line_no มาทุกแถว
 *   2. orderByBillPosition() = เรียงซ้ำอีกชั้นตาม (หน้า, เลขบรรทัด) — ไม่ต้องเชื่อ AI อย่างเดียว
 *   3. แถวเก็บ no = เลขบรรทัดบนกระดาษ (1..n ต่อเนื่องทุกหน้า) ไว้โชว์ "#3" ให้เทียบกับบิลจริง · ลากย้ายแถวแล้วเลขยังติดแถวเดิม
 */

export const BILL_ORDER_RULE = `
- ลำดับแถว: ใส่ "lines" ตามลำดับบรรทัดในเอกสารจริง จากบนลงล่าง ไฟล์/หน้าที่ 1 ก่อน แล้วค่อยหน้าถัดไป · ห้ามสลับ ห้ามจัดกลุ่มของชนิดเดียวกันไว้ด้วยกัน ห้ามรวมบรรทัด (ของเดียวกันพิมพ์ 2 บรรทัด = 2 แถว)
- ทุกแถวใส่ "page" = ไฟล์/หน้าที่เจอแถวนี้ (เริ่ม 1) และ "line_no" = ลำดับบรรทัดในหน้านั้นจากบนลงล่าง (เริ่ม 1)`;

const posNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
};

/**
 * เรียงแถวตาม (หน้า, เลขบรรทัด) ที่ AI ส่งมา — เรียงแบบคงที่ (เท่ากัน = ลำดับที่ AI ส่ง)
 * มีแถวไหนไม่มีเลขบรรทัด = ไม่เรียง (คงลำดับที่ AI ส่ง) · ไม่มีหน้า = หน้า 1
 */
export function orderByBillPosition<T>(rows: T[], pos: (r: T) => { page?: unknown; line_no?: unknown }): T[] {
  const keyed = rows.map((r, i) => { const p = pos(r); return { r, i, page: posNum(p.page) ?? 1, line: posNum(p.line_no) }; });
  if (keyed.length < 2 || keyed.some((k) => k.line == null)) return rows;
  return keyed.sort((a, b) => a.page - b.page || (a.line as number) - (b.line as number) || a.i - b.i).map((k) => k.r);
}

/** เลขบรรทัดบนกระดาษของแถว (โชว์ "#3") — แถวเก่าที่ยังไม่มี = ลำดับในรายการ */
export const billLineNo = (no: unknown, idx: number): number => posNum(no) ?? idx + 1;
