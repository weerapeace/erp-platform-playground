/**
 * ออกรหัสพนักงานคนถัดไปจาก "รหัสของคนในแผนกเดียวกัน" (ของกลาง)
 *
 * ใช้ตอนเพิ่มช่างใหม่จากหน้าบอร์ดจ่ายงาน (POST /api/mo/assignees) — ผู้ใช้ไม่ต้องคิดรหัสเอง
 * วิธีคิด: ดูรูปแบบ <ตัวอักษรนำ><ตัวเลข> ที่คนในแผนกใช้มากที่สุด แล้วต่อเลขถัดจากตัวมากสุด
 *   ["ISG-CM-1001", "ISG-CM-1017"] → "ISG-CM-1018"   (คงจำนวนหลักเดิม)
 * ไม่มีรหัสให้อ้างอิงเลย → คืน null (ผู้เรียกไป fallback เอง)
 */
export function nextEmployeeCode(existing: (string | null | undefined)[]): string | null {
  const codes = existing.map((c) => (c ?? "").trim()).filter(Boolean);
  const parse = (c: string) => { const m = /^(.*?)(\d+)$/.exec(c); return m ? { prefix: m[1], num: Number(m[2]) || 0, width: m[2].length } : null; };

  // เลือก prefix ที่คนในแผนกใช้เยอะสุด (เท่ากัน = เอาตัวที่เลขมากสุด)
  const stat = new Map<string, { count: number; max: number; width: number }>();
  for (const c of codes) {
    const p = parse(c); if (!p) continue;
    const cur = stat.get(p.prefix) ?? { count: 0, max: 0, width: 0 };   // width เริ่มที่ 0 — ความยาวเลขต้องมาจากรหัสจริง ไม่ใช่เดา
    stat.set(p.prefix, { count: cur.count + 1, max: Math.max(cur.max, p.num), width: Math.max(cur.width, p.width) });
  }
  let best: { prefix: string; max: number; width: number } | null = null;
  for (const [prefix, v] of stat) {
    if (!best || v.count > (stat.get(best.prefix)?.count ?? 0) || (v.count === (stat.get(best.prefix)?.count ?? 0) && v.max > best.max)) {
      best = { prefix, max: v.max, width: v.width };
    }
  }
  if (!best) return null;
  return best.prefix + String(best.max + 1).padStart(best.width || 4, "0");
}

/** รหัสชนกับที่มีอยู่ → ขยับเลขต่อไปเรื่อย ๆ (ใช้คู่กับ unique constraint ของ employee_code) */
export function bumpCode(code: string): string {
  const m = /^(.*?)(\d+)$/.exec(code);
  return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0") : `${code}-1`;
}
