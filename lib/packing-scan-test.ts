/**
 * 🔫 ตรวจเครื่องสแกน (หน้า "ตั้งค่าสถานี" → ทดสอบเครื่องสแกน) — pure · ทดสอบได้
 * เจ้าของสั่ง 2026-11-19 (ระบบแพ็คบนมือถือ + เครื่องสแกน ข้อเสนอ 1)
 *   รับลำดับปุ่มที่เครื่องสแกนส่งมา (เหมือนคีย์บอร์ด) → บอกว่าอ่านได้อะไร · มี Enter ท้ายไหม · เร็วพอไหม · แป้นไทยเพี้ยนไหม
 *   เกณฑ์ความเร็ว/ความยาว = ค่าเดียวกับตัวจับเครื่องยิงกลาง (components/scan-input/use-scan-gun: GAP_MS 60 · MIN_LEN 4)
 */
export const SCAN_GAP_MS = 60;
export const SCAN_MIN_LEN = 4;

/** 1 ปุ่ม: key = ตัวที่เบราว์เซอร์เห็น (เพี้ยนได้ถ้าเปิดแป้นไทย) · ch = ตัวตามตำแหน่งปุ่มจริง (typedChar) · t = เวลา ms */
export type ScanKey = { key: string; ch: string | null; t: number };
export type ScanIssue = { level: "ok" | "warn" | "error"; text: string; fix?: string };
export type ScanReport = { text: string; raw: string; enter: boolean; maxGap: number; avgGap: number; issues: ScanIssue[]; works: boolean };

export function analyzeScan(keys: ScanKey[], endedWithEnter: boolean): ScanReport {
  const chars = keys.filter((k) => k.ch);
  const text = chars.map((k) => k.ch).join("");
  const raw = keys.filter((k) => k.key.length === 1).map((k) => k.key).join("");
  const gaps = keys.slice(1).map((k, i) => k.t - keys[i].t);
  const maxGap = gaps.length ? Math.round(Math.max(...gaps)) : 0;
  const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
  const issues: ScanIssue[] = [];

  if (!text) {
    issues.push({ level: "error", text: "ไม่ได้รับตัวอักษร", fix: "เครื่องสแกนยังไม่ได้ต่อแบบคีย์บอร์ด — ตั้งโหมด Bluetooth HID (ไม่ใช่ SPP/BLE) แล้วจับคู่ใหม่" });
    return { text, raw, enter: endedWithEnter, maxGap, avgGap, issues, works: false };
  }
  issues.push({ level: "ok", text: "ต่อแล้ว ส่งมาแบบคีย์บอร์ด" });

  if (endedWithEnter) issues.push({ level: "ok", text: "มี Enter ท้าย" });
  else issues.push({ level: "error", text: "ไม่มี Enter ท้าย — ระบบไม่รู้ว่ายิงจบ", fix: "ยิงบาร์โค้ดตั้งค่า \"Add CR / Enter suffix\" ในคู่มือเครื่อง" });

  if (text.length < SCAN_MIN_LEN) issues.push({ level: "warn", text: `สั้นเกิน (${text.length} ตัว) — ระบบนับเป็นการพิมพ์`, fix: "ลองยิงใบปะหน้าหรือการ์ดคำสั่งแทน" });

  if (maxGap > SCAN_GAP_MS) issues.push({ level: "error", text: `ส่งช้า (ช่วงห่างสุด ${maxGap} ms เกิน ${SCAN_GAP_MS} ms) — ระบบจะไม่นับเป็นการยิง`, fix: "ตั้งความเร็วส่งของเครื่องเป็นเร็วสุด (Transmit speed / Keyboard delay = 0) · ถ้าเป็นบลูทูธ ลองย้ายเครื่องเข้าใกล้มือถือ" });
  else if (gaps.length) issues.push({ level: "ok", text: `เร็วพอ (เฉลี่ย ${avgGap} ms ต่อตัว)` });

  if (raw && raw !== text) issues.push({ level: "ok", text: "แป้นพิมพ์ภาษาไทยเปิดอยู่ — ระบบแปลงกลับให้แล้ว", fix: "ถ้าใช้กับโปรแกรมอื่นด้วย ตั้งภาษาคีย์บอร์ดของเครื่องสแกนเป็น US" });

  const works = endedWithEnter && text.length >= SCAN_MIN_LEN && maxGap <= SCAN_GAP_MS;
  return { text, raw, enter: endedWithEnter, maxGap, avgGap, issues, works };
}
