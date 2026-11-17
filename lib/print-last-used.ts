// ============================================================
// print-last-used — จำ "ตัวเลือกพิมพ์ที่ใช้ล่าสุด" ต่อคน ต่อชนิดเอกสาร/หน้า (ในเครื่อง localStorage)
// ใช้กับ useDocPrintPrefs (แผงพิมพ์เอกสาร) · แผงพิมพ์ตาราง (ListPrintPanel) จำต่อคนในเซิร์ฟเวอร์อยู่แล้ว
// เก็บคู่กับ "ค่ากลางตอนนั้น" (base) — ค่ากลางเปลี่ยน = ค่าล่าสุดเก่าใช้ไม่ได้ (กันค้างแบบเก่าหลังแอดมินแก้)
// ============================================================

const KEY = (scope: string) => `erp:print-last:${scope}`;

/** ลายนิ้วมือของค่ากลาง (เทียบว่าเปลี่ยนไหม) */
export function baseSig(base: unknown): string {
  try { return JSON.stringify(base) ?? ""; } catch { return ""; }
}

export function rememberLastPrint(scope: string, base: unknown, value: unknown): void {
  try {
    if (baseSig(base) === baseSig(value)) { localStorage.removeItem(KEY(scope)); return; }   // เท่าค่ากลาง = ไม่ต้องจำ
    localStorage.setItem(KEY(scope), JSON.stringify({ base: baseSig(base), value }));
  } catch { /* โหมดส่วนตัว/เต็ม = ไม่จำ */ }
}

/** ค่าที่จำไว้ (ถ้าค่ากลางยังเหมือนตอนจำ) · ไม่มี = null */
export function readLastPrint(scope: string, base: unknown): unknown | null {
  try {
    const raw = localStorage.getItem(KEY(scope));
    if (!raw) return null;
    const o = JSON.parse(raw) as { base?: string; value?: unknown };
    if (o.base !== baseSig(base)) return null;
    return o.value ?? null;
  } catch { return null; }
}
