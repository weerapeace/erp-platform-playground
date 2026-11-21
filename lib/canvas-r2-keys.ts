// คีย์ R2 ของรูปกระดาน (โฟลเดอร์ canvassketch/) — ใช้ร่วม: /api/assets/canvas-orphans (หาไฟล์ที่ไม่มีใครใช้) · /api/assets/storage/boards (พื้นที่รายกระดาน)
const PREFIX = "canvassketch/";

/** ดึงคีย์ R2 ในโฟลเดอร์กระดานทุกตัวที่ปรากฏในข้อความ (ทั้งแบบตรง และแบบ encode ใน ?key=) */
export function extractKeys(text: string, out: Set<string>) {
  if (!text) return;
  const plain = /canvassketch\/[A-Za-z0-9_\-./]+/g;
  let m: RegExpExecArray | null;
  while ((m = plain.exec(text))) out.add(m[0]);
  const enc = /key=([A-Za-z0-9%_\-.]+)/g;
  while ((m = enc.exec(text))) {
    try { const k = decodeURIComponent(m[1]); if (k.startsWith(PREFIX)) out.add(k); } catch { /* ข้าม */ }
  }
}
