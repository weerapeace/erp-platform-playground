/**
 * แนะนำค่าคุณลักษณะจาก "ชื่อ + รายละเอียดสินค้า" (จับคำ · ฟรี · ไม่ใช้ AI) — pure ใช้ได้ทั้งหน้าเว็บและหลังบ้าน + เทสต์
 * เจ้าของขอ 2026-11-13 "อยากให้มีปุ่ม ติ๊กอันที่แนะนำ อ่านจากรายละเอียดสินค้า" (ช่องคุณลักษณะของหมวด TikTok — ใช้กับ Lazada ได้ด้วย)
 *
 *   suggestAttrsFromText(fields, text, { skip }) → [{ fieldId, fieldName, values[{ id, name }] }]
 *   - หาชื่อตัวเลือกที่ "อยู่ในข้อความ" (ไทย = มีคำนี้อยู่ · อังกฤษ/ตัวเลข = ต้องเป็นคำเต็ม)
 *   - คำสั้นที่อยู่ในคำยาวกว่าที่เจอทุกครั้ง = ไม่นับ (เจอ "หนัง PU" ไม่แนะนำ "หนัง" ซ้ำ ถ้า "หนัง" ไม่โผล่ที่อื่น)
 *   - ช่องเลือกค่าเดียว = เอาค่าที่เจอบ่อยสุด (เสมอ → ชื่อยาวกว่า) · ช่องเลือกหลายค่า = ทุกค่าที่เจอ (สูงสุด 5)
 *   - ข้ามคำกลาง ๆ (อื่นๆ / ไม่มี / ใช่ / ไม่ใช่ / Yes / No …) และช่องที่ skip(fieldId) = true (เช่น ช่องที่มีค่าแล้ว)
 * จับคำอาจพลาดได้ (เช่น "ยาง" ไปเจอใน "ยางยืด") → หน้าเว็บต้องโชว์ให้ตรวจก่อนใส่ และไม่ทับค่าที่มีอยู่
 */

export type SuggestField = { id: string; name: string; multiple: boolean; options: { id: string; name: string }[] };
export type SuggestHit = { fieldId: string; fieldName: string; values: { id: string; name: string }[] };

const GENERIC = new Set(["อื่นๆ", "อื่น ๆ", "อื่น", "ไม่มี", "ไม่ระบุ", "ใช่", "ไม่ใช่", "มี", "other", "others", "none", "n/a", "na", "yes", "no", "unisex", "ทั่วไป"]);
const MAX_MULTI = 5;

/** ข้อความล้วน ตัวเล็ก (ตัดแท็ก HTML / &nbsp; / ช่องว่างซ้ำ) */
export function suggestText(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" \n ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** ตำแหน่งที่เจอคำนี้ในข้อความ ([เริ่ม, จบ)) · คำที่มีอังกฤษ/ตัวเลข = ต้องเป็นคำเต็ม */
function occurrences(text: string, name: string): [number, number][] {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return [];
  const latin = /[a-z0-9]/.test(n);
  const re = new RegExp(latin ? `(?<![a-z0-9])${esc(n)}(?![a-z0-9])` : esc(n), "g");
  const out: [number, number][] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) { out.push([m.index, m.index + m[0].length]); if (m[0].length === 0) re.lastIndex++; }
  return out;
}

export function suggestAttrsFromText(fields: SuggestField[], text: string, opts: { skip?: (fieldId: string) => boolean } = {}): SuggestHit[] {
  const t = text.toLowerCase();
  if (!t.trim()) return [];
  const hits: SuggestHit[] = [];
  for (const f of fields) {
    if (!f.options.length || opts.skip?.(f.id)) continue;
    const found = f.options
      .filter((o) => { const n = o.name.trim(); return n.length >= 2 && !GENERIC.has(n.toLowerCase()); })
      .map((o) => ({ o, occ: occurrences(t, o.name) }))
      .filter((x) => x.occ.length > 0);
    // ตัดคำสั้นที่ทุกครั้งที่เจอ อยู่ในคำยาวกว่าที่เจอ (ในช่องเดียวกัน)
    const kept = found.filter((a) => !a.occ.every(([s, e]) => found.some((b) => b !== a && b.o.name.length > a.o.name.length && b.occ.some(([bs, be]) => bs <= s && e <= be))));
    if (!kept.length) continue;
    kept.sort((a, b) => b.occ.length - a.occ.length || b.o.name.length - a.o.name.length || a.occ[0][0] - b.occ[0][0]);
    const pick = f.multiple ? kept.slice(0, MAX_MULTI) : kept.slice(0, 1);
    hits.push({ fieldId: f.id, fieldName: f.name, values: pick.map((x) => ({ id: x.o.id, name: x.o.name })) });
  }
  return hits;
}
