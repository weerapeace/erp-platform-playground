/**
 * กติกาแถวจ่ายงานของใบเดียว (ไม่มี React) — ./dispatch-lines.tsx ใช้ + เทสต์ dispatch-lines.test.ts
 */
import { isHireDesk } from "@/lib/work-entry-rules";

export type DispLine = { key: string; deptId: string; crewIds: string[]; qty: number; rate: string };
export type DispDesk = { id: string; name: string };
export type DispLinesCheck = { total: number; left: number; n: number; errors: string[]; lineErr: Record<string, string> };

const EPS = 0.0001;
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** ตรวจแถวจ่าย: เลือกโต๊ะ · งานเหมาต้องมีคน · จำนวน > 0 · รวมไม่เกินที่เหลือ */
export function dispLinesCheck(lines: DispLine[], remaining: number, desks: DispDesk[]): DispLinesCheck {
  const lineErr: Record<string, string> = {};
  const used = lines.filter((l) => l.qty > 0);
  const total = r2(used.reduce((a, l) => a + l.qty, 0));
  lines.forEach((l, i) => {
    const d = desks.find((x) => x.id === l.deptId);
    const where = lines.length > 1 ? `แถว ${i + 1}: ` : "";
    if (!d) lineErr[l.key] = `${where}เลือกโต๊ะ`;
    else if (isHireDesk(d.name) && !l.crewIds.length) lineErr[l.key] = `${where}งานเหมา ต้องเลือกคนรับ`;
    else if (!(l.qty > 0)) lineErr[l.key] = `${where}ใส่จำนวน (หรือกด ✕ ลบแถวนี้)`;
  });
  const errors = Object.values(lineErr);
  if (total > remaining + EPS) errors.unshift(`จ่ายเกิน ${fmt(total - remaining)} ชิ้น — ใบนี้เหลือให้จ่าย ${fmt(remaining)}`);
  if (!used.length && !errors.length) errors.push("ใส่จำนวนที่จะจ่าย");
  return { total, left: r2(Math.max(0, remaining - total)), n: used.length, errors, lineErr };
}
