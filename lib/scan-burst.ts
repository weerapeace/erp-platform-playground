// ============================================================
// scan-burst — แยก "เครื่องยิงบาร์โค้ดยิงเข้าช่องค้นหา" ออกจากคนพิมพ์ (pure เทสต์ได้)
// เครื่องยิง = พิมพ์รัวมาก (ห่างกันไม่เกิน ~60ms) แล้วจบด้วย Enter
// เก็บตัวอักษรตาม "ตำแหน่งปุ่มจริง" (typedChar) → แป้นไทยเปิดอยู่ก็ได้รหัสอังกฤษถูก
// ใช้คู่ useScanInBox (components/scan-input/use-scan-in-box.ts) — ช่องที่ไม่ได้โฟกัสใช้ useScanGun
// ============================================================

export type KeyStamp = { t: number; ch: string };

export const SCAN_GAP_MS = 60;
export const SCAN_MIN_LEN = 4;

/** เอาช่วงท้ายสุดที่พิมพ์รัวต่อเนื่อง (ช่องว่างระหว่างตัว ≤ gap) และกด Enter ภายใน gap → รหัสที่ยิง · ไม่ใช่การยิง = null */
export function detectScanBurst(stamps: KeyStamp[], enterAt: number, gap = SCAN_GAP_MS, minLen = SCAN_MIN_LEN): string | null {
  if (stamps.length < minLen) return null;
  const last = stamps[stamps.length - 1];
  if (enterAt - last.t > gap) return null;
  let i = stamps.length - 1;
  while (i > 0 && stamps[i].t - stamps[i - 1].t <= gap) i--;
  const burst = stamps.slice(i);
  if (burst.length < minLen) return null;
  return burst.map((s) => s.ch).join("");
}

/** เลือกสินค้าที่ตรงรหัสที่ยิงแบบเป๊ะ (รหัส หรือ บาร์โค้ด ไม่สนตัวพิมพ์เล็ก/ใหญ่) · ไม่เจอ/เจอหลายตัว = null */
export function exactScanMatch<T extends { code?: string | null; barcode?: string | null }>(rows: T[], code: string): T | null {
  const c = code.trim().toLowerCase();
  const hits = rows.filter((r) => (r.code ?? "").toLowerCase() === c || (r.barcode ?? "").toLowerCase() === c);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0 && rows.length === 1) return rows[0];
  return null;
}
