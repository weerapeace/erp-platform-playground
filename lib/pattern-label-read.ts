/**
 * 🏷️ อ่านตัวเขียนบนชิ้นแพทเทิร์นกระดาษ (สตูดิโอแพทเทิร์น → แกะจากรูป → ทำให้ตรง · เจ้าของขอ 2026-11-16)
 *   รูปชิ้นที่ดัดตรงแล้ว (ตัดเฉพาะชิ้น) → AI อ่านลายมือที่ช่างเขียนบนกระดาษ เช่น "ข้าง 102x30 ×2" → ชื่อชิ้น / กว้าง / ยาว / จำนวน
 *   ใช้ที่: POST /api/pattern-projects/read-label (บริการเสียเงิน ai.pattern_label) · หน้าจอ components/pattern-studio/photo-modal
 *   ผลเป็นแค่ "ค่าที่เติมให้" — ผู้ใช้ตรวจ/แก้ในช่องก่อนกดเสมอ · เทสต์ lib/__tests__/pattern-label-read.test.ts
 */

export type LabelRead = { text: string; name: string; w: number | null; l: number | null; count: number | null; unsure: boolean };

export const LABEL_READ_SYSTEM =
  "You read handwriting on a photo of one paper sewing-pattern piece (bags). The writing is usually Thai, sometimes English or numbers, and may be rotated. " +
  "Return JSON only, no prose.";

export const LABEL_READ_ASK =
  "Read everything written on this pattern piece. Then extract:\n" +
  "- name: the piece name as written (Thai ok), e.g. ข้าง, ตัวหน้า, ก้น, หู, ซับใน — empty string if none\n" +
  "- w_cm / l_cm: real size in centimetres if written (e.g. \"102x30\" → the smaller is w, the larger is l); null if not written\n" +
  "- count: how many to cut if written (e.g. \"×2\", \"2 ชิ้น\", \"ตัด 2\"); null if not written\n" +
  "- text: all the text you can read, as written\n" +
  "- unsure: true if the handwriting is hard to read\n" +
  'Answer exactly: {"text":"…","name":"…","w_cm":null,"l_cm":null,"count":null,"unsure":false}';

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null;
};

/** คำตอบ AI (ข้อความ มี JSON อยู่ข้างใน) → ค่าที่ตรวจแล้ว · อ่านไม่ได้ = ค่าว่างทั้งหมด (unsure) */
export function parseLabelRead(raw: string | Record<string, unknown> | null | undefined): LabelRead {
  const empty: LabelRead = { text: "", name: "", w: null, l: null, count: null, unsure: true };
  let j: Record<string, unknown>;
  if (raw && typeof raw === "object") j = raw;   // aiChat แปลง JSON ให้แล้ว
  else {
    const m = /\{[\s\S]*\}/.exec(raw ?? "");
    if (!m) return empty;
    try { j = JSON.parse(m[0]) as Record<string, unknown>; } catch { return empty; }
  }
  const text = typeof j.text === "string" ? j.text.trim().slice(0, 300) : "";
  const name = typeof j.name === "string" ? j.name.trim().slice(0, 60) : "";
  let w = num(j.w_cm, 0.5, 500), l = num(j.l_cm, 0.5, 500);
  if (w != null && l != null && w > l) [w, l] = [l, w];
  const c = num(j.count, 1, 200);
  return { text, name, w, l, count: c != null ? Math.round(c) : null, unsure: j.unsure === true || (!name && w == null && l == null && c == null) };
}
