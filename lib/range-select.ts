/**
 * กดเลือกรายการ + Shift เลือกเป็นช่วง (ของกลาง · pure) — ใช้ในตารางกลาง MiniTable + DataTable ผ่าน components/select-mode
 *
 * order  = ลำดับรายการที่เห็นบนจอตอนนี้ (หลังค้นหา/เรียง/จัดกลุ่ม)
 * anchor = ตัวที่กดล่าสุด · target = ตัวที่เพิ่งกด
 *   - Shift + anchor ยังอยู่บนจอ → ทั้งช่วง anchor..target ตามสถานะของ anchor
 *       anchor ติ๊กอยู่ = ติ๊กทั้งช่วง · anchor ไม่ได้ติ๊ก = เอาติ๊กออกทั้งช่วง (แบบ Gmail)
 *   - ไม่กด Shift / anchor ไม่อยู่บนจอแล้ว / กดตัวเดิม → สลับตัวเดียว
 * คืนชุดใหม่เสมอ (ไม่แก้ชุดเดิม) · ตัวที่เลือกไว้แต่ไม่อยู่บนจอ (โดนกรอง/อยู่หน้าอื่น) ไม่ถูกแตะ
 */
export function clickSelect(
  order: readonly string[],
  current: ReadonlySet<string>,
  target: string,
  opts: { shift?: boolean; anchor?: string | null } = {},
): Set<string> {
  const next = new Set(current);
  const anchor = opts.anchor ?? null;
  const a = opts.shift && anchor != null && anchor !== target ? order.indexOf(anchor) : -1;
  const b = order.indexOf(target);
  if (a < 0 || b < 0) {
    if (next.has(target)) next.delete(target); else next.add(target);
    return next;
  }
  const on = current.has(anchor!);
  const [lo, hi] = a < b ? [a, b] : [b, a];
  for (let i = lo; i <= hi; i++) {
    if (on) next.add(order[i]); else next.delete(order[i]);
  }
  return next;
}

/** เลือกทุกตัวที่เห็น (Ctrl+A / ปุ่ม "เลือกทั้งหมด") — ตัวที่เลือกไว้นอกจออยู่ต่อ */
export function selectAllVisible(order: readonly string[], current: ReadonlySet<string>): Set<string> {
  const next = new Set(current);
  for (const k of order) next.add(k);
  return next;
}
