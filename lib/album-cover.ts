// ============================================================
// album-cover — ตรรกะล้วนของ "ปกอัลบั้ม" (รูปรวมบนการ์ดอัลบั้ม/แฟ้ม) · ใช้กับ components/album-cover
//
// แบบ C ที่เจ้าของเลือก (2026-11-14): ทรงเดียวกับการ์ดอัลบั้ม Contents (ใหญ่ 1 + เล็กด้านขวา) แต่ไม่มีช่องว่าง
//   0 รูป = ปกว่าง · 1 รูป = เต็มปก · 2 รูป = ซ้าย-ขวา · 3 รูป = ใหญ่ 1 + เล็ก 2 · 4 รูปขึ้นไป = ใหญ่ 1 + เล็ก 3
//   รูปเกินที่โชว์ได้ → ช่องสุดท้ายขึ้น "+N" (N = รูปที่ไม่ได้โชว์)
// เทสต์: lib/__tests__/album-cover.test.ts
// ============================================================

export type AlbumCoverLayout =
  | { kind: "empty"; shown: 0; more: 0 }
  | { kind: "one"; shown: 1; more: 0 }
  | { kind: "two"; shown: 2; more: 0 }
  | { kind: "big"; shown: 3 | 4; small: 2 | 3; more: number };

/** แบบปกตามจำนวนรูปทั้งหมด (total = รูปทั้งอัลบั้ม · ไม่ใช่แค่รูปที่ส่งมาโชว์) */
export function albumCoverLayout(total: number): AlbumCoverLayout {
  const n = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  if (n === 0) return { kind: "empty", shown: 0, more: 0 };
  if (n === 1) return { kind: "one", shown: 1, more: 0 };
  if (n === 2) return { kind: "two", shown: 2, more: 0 };
  if (n === 3) return { kind: "big", shown: 3, small: 2, more: 0 };
  return { kind: "big", shown: 4, small: 3, more: n - 4 };
}
