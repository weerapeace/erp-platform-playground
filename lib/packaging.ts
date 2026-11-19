/**
 * 🎁 บรรจุภัณฑ์ตอนแพ็ค (pure · ทดสอบได้) — เจ้าของสั่ง 2026-11-19 รอบ 6
 *   รายการกลาง packaging_items · รุ่นสินค้าเก็บ parent_skus_v2.pack_items (id[]) + pack_note + pack_flags
 *   สถานีแพ็คโชว์ใต้สินค้าแต่ละบรรทัด + สรุปรวมทั้งออเดอร์ (ข้อเสนอ 1)
 */
export type PackagingItem = { id: string; name: string; image_r2_key: string | null; sort: number; is_active: boolean };

/** ป้ายเตือนตอนแพ็คที่ใช้บ่อย (พิมพ์เพิ่มเองได้) */
export const PACK_FLAG_PRESETS = ["แตกง่าย", "ห่อ 2 ชั้น", "ห้ามพับ", "ห้ามทับ", "ใส่ถุงกันชื้น", "เช็กสีก่อนแพ็ค"] as const;
export const PACK_NOTE_MAX = 300;
export const PACK_FLAG_MAX = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

/** เพิ่ม/เอาออก 1 รายการ (ไม่ซ้ำ · คงลำดับเดิม) */
export function togglePackItem(list: readonly string[] | null | undefined, id: string, on: boolean): string[] {
  const cur = [...new Set((list ?? []).filter(isUuid))];
  if (on) return cur.includes(id) ? cur : [...cur, id];
  return cur.filter((x) => x !== id);
}

/** ทำความสะอาดรายการที่ส่งมา (uuid เท่านั้น · ไม่ซ้ำ · เฉพาะที่มีอยู่จริงถ้าส่ง known มา) */
export function cleanPackItems(v: unknown, known?: Set<string>): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(isUuid))].filter((id) => !known || known.has(id)).slice(0, 30);
}

/** ป้ายเตือน: ตัดช่องว่าง · ไม่ซ้ำ · ไม่เกิน 8 ป้าย ป้ายละ 30 ตัว */
export function cleanPackFlags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x ?? "").trim().slice(0, 30)).filter(Boolean))].slice(0, PACK_FLAG_MAX);
}

export const cleanPackNote = (v: unknown): string | null => {
  const s = String(v ?? "").trim().slice(0, PACK_NOTE_MAX);
  return s || null;
};

/** สรุปบรรจุภัณฑ์รวมทั้งออเดอร์: นับตามจำนวนชิ้นของแต่ละบรรทัด · เรียงตามลำดับรายการกลาง */
export function summarizePackaging(lines: { qty: number; packaging: { id: string; name: string }[] }[], order?: Map<string, number>): { id: string; name: string; qty: number }[] {
  const m = new Map<string, { id: string; name: string; qty: number }>();
  for (const l of lines) {
    for (const p of l.packaging) {
      const cur = m.get(p.id) ?? { id: p.id, name: p.name, qty: 0 };
      cur.qty += Math.max(0, Math.round(l.qty || 0));
      m.set(p.id, cur);
    }
  }
  return [...m.values()].filter((x) => x.qty > 0).sort((a, b) => (order?.get(a.id) ?? 0) - (order?.get(b.id) ?? 0) || a.name.localeCompare(b.name, "th"));
}
