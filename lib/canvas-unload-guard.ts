// ============================================================
// ตัวกันเตือน "Leave site?" ชั่วคราว — ใช้ตอนยิง external protocol (เช่นเปิดโฟลเดอร์)
// ที่ทำให้เบราว์เซอร์เรียก beforeunload ของกระดาน ทั้งที่หน้าไม่ได้ออกจริง
// page: เรียก suppressUnload() ก่อนยิง · canvas-sketch: เช็ค isUnloadSuppressed() ใน beforeunload
// แยกเป็น lib เล็ก (ไม่ดึง Excalidraw เข้า bundle หน้า)
// ============================================================

let suppressUntil = 0;

/** กันเตือน beforeunload ชั่วคราว (ms) */
export function suppressUnload(ms = 2500): void {
  suppressUntil = Date.now() + ms;
}

/** อยู่ในช่วงกันเตือนอยู่ไหม */
export function isUnloadSuppressed(): boolean {
  return Date.now() < suppressUntil;
}
