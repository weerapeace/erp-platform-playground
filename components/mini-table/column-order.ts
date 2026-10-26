/**
 * เรียงคอลัมน์ตามลำดับที่ผู้ใช้จัด (ตัวคำนวณล้วน — ใช้ใน useColumnPrefs และ test)
 *   locked = อยู่ตำแหน่งเดิมเสมอ · คอลัมน์ที่ไม่อยู่ใน order (เพิ่มใหม่ทีหลัง) แทรกถัดจากเพื่อนบ้านเดิม
 */
import type { MiniColumn } from "./index";

export function applyColumnOrder<T>(columns: MiniColumn<T>[], order: string[]): MiniColumn<T>[] {
  if (order.length === 0) return columns;
  const movable = columns.filter((c) => !c.locked);
  const byKey = new Map(movable.map((c) => [c.key, c]));
  const res = order.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  const placed = new Set(res.map((c) => c.key));
  movable.forEach((c, i) => {
    if (placed.has(c.key)) return;
    const prev = i > 0 ? movable[i - 1].key : null;
    const at = prev ? res.findIndex((x) => x.key === prev) + 1 : 0;
    res.splice(at, 0, c); placed.add(c.key);
  });
  columns.forEach((c, i) => { if (c.locked) res.splice(Math.min(i, res.length), 0, c); });
  return res;
}
