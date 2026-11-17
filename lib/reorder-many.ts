// ============================================================
// reorder-many — ย้าย "หลายรายการพร้อมกัน" ในลิสต์ลากจัดลำดับ (ของกลาง SortableList · pure เทสต์ได้)
// หน้าที่ใช้ useDragReorder รับแค่ onReorder(from, to) ทีละตัว → แปลงการย้ายเป็นกลุ่มเป็น "ลำดับการย้ายทีละตัว"
// แล้วเรียก onReorder ตามลำดับ (ไม่ต้องแก้หน้าที่เรียกเลย)
// ============================================================

/** ลำดับใหม่ (เป็นเลขตำแหน่งเดิม) หลังย้ายกลุ่ม selected ไปที่ตำแหน่งของ to
 *  ย้ายลง (to อยู่หลังตัวแรกที่เลือก) = วางต่อหลัง to · ย้ายขึ้น = วางก่อน to · ลำดับในกลุ่มคงเดิม */
export function blockMoveOrder(n: number, selected: number[], to: number): number[] {
  const sel = [...new Set(selected)].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  const ids = Array.from({ length: n }, (_, i) => i);
  if (!sel.length || sel.includes(to) || to < 0 || to >= n) return ids;
  const rest = ids.filter((i) => !sel.includes(i));
  const down = to > sel[0];
  const at = rest.indexOf(to) + (down ? 1 : 0);
  return [...rest.slice(0, at), ...sel, ...rest.slice(at)];
}

/** แปลงลำดับปลายทางเป็นการย้ายทีละตัว [from, to] (เรียงแบบเลือกทีละช่อง — จำนวนครั้งน้อย) */
export function planSingleMoves(finalOrder: number[]): [number, number][] {
  const cur = Array.from({ length: finalOrder.length }, (_, i) => i);
  const moves: [number, number][] = [];
  for (let p = 0; p < finalOrder.length; p++) {
    if (cur[p] === finalOrder[p]) continue;
    const j = cur.indexOf(finalOrder[p]);
    const [m] = cur.splice(j, 1);
    cur.splice(p, 0, m);
    moves.push([j, p]);
  }
  return moves;
}

/** ช่วงตำแหน่ง (Shift+คลิก) a..b รวมปลาย */
export function indexRange(a: number, b: number): number[] {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
}

/** ลำดับใหม่สำหรับคำสั่งเมนู (บนสุด / ขึ้น / ลง / ล่างสุด) ของกลุ่มที่เลือก · ย้ายไม่ได้ = null */
export function groupMenuOrder(n: number, selected: number[], action: "up" | "down" | "top" | "bottom"): number[] | null {
  const sel = [...new Set(selected)].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  if (!sel.length) return null;
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !sel.includes(i));
  let order: number[];
  if (action === "top") order = [...sel, ...rest];
  else if (action === "bottom") order = [...rest, ...sel];
  else if (action === "up") { if (sel[0] === 0) return null; order = blockMoveOrder(n, sel, sel[0] - 1); }
  else { if (sel[sel.length - 1] === n - 1) return null; order = blockMoveOrder(n, sel, sel[sel.length - 1] + 1); }
  return order.every((v, i) => v === i) ? null : order;
}
