// ============================================================
// esc-stack — กอง "ชั้นที่ปิดด้วย Esc ได้" กองเดียวทั้งระบบ (ของกลาง)
// ป๊อป / ลิ้นชัก / แผ่นล่าง / ดูรูปเต็มจอ ซ้อนกัน → กด Esc ปิดเฉพาะชั้นบนสุดทีละชั้น
// เดิมแต่ละตัวมีกองของตัวเอง (modal กองหนึ่ง bottom-sheet อีกกอง ดูรูปไม่มีกอง) → ซ้อนต่างชนิดกัน Esc ปิดหมดทีเดียว
// ใช้ผ่าน hook useEscLayer (components/modal/esc-layer.ts) · ฟังก์ชันล่างเป็นแกน (pure เทสต์ได้)
// ============================================================

const stack: number[] = [];
let seq = 0;

/** จดชั้นใหม่ (เปิดทีหลัง = อยู่บน) คืน id */
export function pushEscLayer(): number {
  const id = ++seq;
  stack.push(id);
  return id;
}

/** เอาชั้นออก (ปิด/unmount) */
export function popEscLayer(id: number): void {
  const i = stack.lastIndexOf(id);
  if (i >= 0) stack.splice(i, 1);
}

/** ชั้นนี้อยู่บนสุดไหม */
export function isTopEscLayer(id: number): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/** จำนวนชั้นที่เปิดอยู่ (ใช้ในเทสต์/ดีบัก) */
export function escLayerCount(): number {
  return stack.length;
}
