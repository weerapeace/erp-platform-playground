/**
 * ☑️ เลือกบรรทัดก่อน "ดึงข้อมูล" เข้าตารางตีราคา — ส่วนที่ไม่ใช่หน้าจอ (เจ้าของขอ 2026-11-17 "เวลาดึงข้อมูลต้องมีให้เลือกว่าจะดึงอะไร")
 *   groupsOf     = ชนิดวัสดุของบรรทัด (ปุ่มกรอง ผ้า / ตัวเสริม / อะไหล่ …) เรียงตามที่เจอก่อน + จำนวน
 *   lineDupKey   = ตัวตนบรรทัด (วัสดุ + กว้าง × ยาว × จำนวน) ไว้บอก "มีแล้ว" ในแท็บปลายทาง
 *   dupIndexes   = บรรทัดต้นทางที่ซ้ำกับของในแท็บปลายทาง → ไม่ติ๊กให้ก่อน
 *   หน้าจอ: components/design-sheet-detail/pull-cost-modal (คัดลอกจากแท็บอื่น + ดึงจากใบงานอื่น) · bom-to-cost-wizard (ปุ่มกรองชนิด)
 *   เทสต์ lib/__tests__/cost-line-pick.test.ts
 */
export const NO_GROUP = "ไม่ระบุชนิด";
export const groupLabel = (g: string | null | undefined) => (g ?? "").trim() || NO_GROUP;

export function groupsOf(names: (string | null | undefined)[]): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const n of names) { const k = groupLabel(n); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([label, count]) => ({ label, count }));
}

type DupLine = {
  item_id?: string | null; item_sku_id?: string | null; item_name?: string | null; group_name?: string | null;
  width_cm?: number | null; length_cm?: number | null; pieces?: number | null;
};
const num = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? "" : String(Math.round(Number(v) * 100) / 100));

/** วัสดุ (id ก่อน ชื่อทีหลัง) + ขนาด + จำนวน · บรรทัดว่างเปล่า = "" (ไม่นับซ้ำ) */
export function lineDupKey(l: DupLine): string {
  const mat = l.item_id ? `i:${l.item_id}` : l.item_sku_id ? `s:${l.item_sku_id}` : (l.item_name ?? "").trim() ? `n:${(l.item_name ?? "").trim().toLowerCase()}` : "";
  if (!mat) return "";
  return `${mat}|${num(l.width_cm)}|${num(l.length_cm)}|${num(l.pieces)}`;
}

export function dupIndexes(source: DupLine[], target: DupLine[]): Set<number> {
  const have = new Set(target.map(lineDupKey).filter(Boolean));
  const out = new Set<number>();
  source.forEach((l, i) => { const k = lineDupKey(l); if (k && have.has(k)) out.add(i); });
  return out;
}
