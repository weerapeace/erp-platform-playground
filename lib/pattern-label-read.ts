/**
 * 🏷️ อ่านตัวเขียนบนชิ้นแพทเทิร์นกระดาษ (สตูดิโอแพทเทิร์น → แกะจากรูป → ทำให้ตรง · เจ้าของขอ 2026-11-16)
 *   รูปชิ้นที่ดัดตรงแล้ว (ตัดเฉพาะชิ้น) → AI อ่านลายมือที่ช่างเขียนบนกระดาษ เช่น "ข้าง 102x30 ×2 · ผ้าตัว 2 ซับใน 2"
 *   → ชื่อชิ้น / กว้าง / ยาว / จำนวน / วัสดุ (+จำนวนต่อวัสดุ) — วัสดุจับคู่กับรายการวัสดุของหน้านั้นด้วย matchMaterials
 *   ใช้ที่: POST /api/pattern-projects/read-label (บริการเสียเงิน ai.pattern_label) · หน้าจอ components/pattern-studio/photo-modal
 *   ผลเป็นแค่ "ค่าที่เติมให้" — ผู้ใช้ตรวจ/แก้ในช่องก่อนกดเสมอ · เทสต์ lib/__tests__/pattern-label-read.test.ts
 */

export type LabelMat = { name: string; count: number | null };
export type LabelRead = { text: string; name: string; w: number | null; l: number | null; count: number | null; mats: LabelMat[]; unsure: boolean };

export const LABEL_READ_SYSTEM =
  "You read handwriting on a photo of one paper sewing-pattern piece (bags). The writing is usually Thai, sometimes English or numbers, and may be rotated. " +
  "Return JSON only, no prose.";

export const LABEL_READ_ASK =
  "Read everything written on this pattern piece. Then extract:\n" +
  "- name: the piece name as written (Thai ok), e.g. ข้าง, ตัวหน้า, ก้น, หู — empty string if none\n" +
  "- w_cm / l_cm: real size in centimetres if written (e.g. \"102x30\" → the smaller is w, the larger is l); null if not written\n" +
  "- count: how many to cut if written as one number for the piece (e.g. \"×2\", \"2 ชิ้น\", \"ตัด 2\"); null if not written\n" +
  "- materials: materials written on the piece with their own cut count if given, e.g. \"ผ้าตัว 2 ซับใน 1\" → [{\"name\":\"ผ้าตัว\",\"count\":2},{\"name\":\"ซับใน\",\"count\":1}] (ผ้า, ซับใน, หนัง, PU, กาว, ฟองน้ำ…); [] if none\n" +
  "- text: all the text you can read, as written\n" +
  "- unsure: true if the handwriting is hard to read\n" +
  'Answer exactly: {"text":"…","name":"…","w_cm":null,"l_cm":null,"count":null,"materials":[],"unsure":false}';

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null;
};

/** คำตอบ AI (ข้อความ มี JSON อยู่ข้างใน หรือ object ที่แปลงแล้ว) → ค่าที่ตรวจแล้ว · อ่านไม่ได้ = ค่าว่างทั้งหมด (unsure) */
export function parseLabelRead(raw: string | Record<string, unknown> | null | undefined): LabelRead {
  const empty: LabelRead = { text: "", name: "", w: null, l: null, count: null, mats: [], unsure: true };
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
  const mats: LabelMat[] = Array.isArray(j.materials)
    ? j.materials.flatMap((m): LabelMat[] => {
        const o = (m && typeof m === "object" ? m : { name: m }) as Record<string, unknown>;
        const n = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
        const q = num(o.count, 1, 200);
        return n ? [{ name: n, count: q != null ? Math.round(q) : null }] : [];
      }).slice(0, 8)
    : [];
  return { text, name, w, l, count: c != null ? Math.round(c) : null, mats, unsure: j.unsure === true || (!name && w == null && l == null && c == null && !mats.length) };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * ชื่อวัสดุที่ AI อ่านได้ → วัสดุในรายการของหน้านั้น (ตรงชื่อก่อน แล้วค่อย "ชื่อหนึ่งอยู่ในอีกชื่อ") · ไม่เจอ = ข้าม (ไม่สร้างวัสดุใหม่เอง)
 *   คืนแต่ละตัวพร้อมจำนวน (ไม่มีจำนวน = null) · ไม่ซ้ำ id
 */
export function matchMaterials(read: LabelMat[], list: { id: string; name: string }[]): { id: string; name: string; count: number | null }[] {
  const out: { id: string; name: string; count: number | null }[] = [];
  for (const r of read) {
    const k = norm(r.name); if (!k) continue;
    const hit = list.find((m) => norm(m.name) === k) ?? list.find((m) => { const n = norm(m.name); return n.length > 1 && (n.includes(k) || k.includes(n)); });
    if (hit && !out.some((x) => x.id === hit.id)) out.push({ id: hit.id, name: hit.name, count: r.count });
  }
  return out;
}
