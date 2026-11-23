/**
 * 🎁 บรรจุภัณฑ์ตอนแพ็ค (pure · ทดสอบได้)
 *   รอบ 7 (เจ้าของเลือก 2026-11-23): Set บรรจุภัณฑ์ = กลุ่ม SKU แท็ก Packaging + จำนวน
 *   ตาราง packaging_sets (items [{sku_id, qty}] · category_ids = หมวดที่ใช้เป็นค่าเริ่ม)
 *   รุ่นสินค้า parent_skus_v2: pack_set_id (ไม่ตั้ง = ใช้ Set ของหมวด) + pack_extra (SKU เสริมนอก Set) + pack_note + pack_flags
 *   สถานีแพ็คโชว์ใต้สินค้า + สรุปรวมทั้งออเดอร์ · แพ็คเสร็จเก็บลง packing_sessions.packaging (รายงานการใช้ · ไม่ตัดสต๊อก)
 */
export type SetItem = { sku_id: string; qty: number };
export type PackagingSet = { id: string; name: string; items: SetItem[]; category_ids: string[]; sort: number; is_active: boolean };

/** ป้ายเตือนตอนแพ็คที่ใช้บ่อย (พิมพ์เพิ่มเองได้) */
export const PACK_FLAG_PRESETS = ["แตกง่าย", "ห่อ 2 ชั้น", "ห้ามพับ", "ห้ามทับ", "ใส่ถุงกันชื้น", "เช็กสีก่อนแพ็ค"] as const;
export const PACK_NOTE_MAX = 300;
export const PACK_FLAG_MAX = 8;
export const SET_ITEM_MAX = 30;
export const SET_QTY_MAX = 99;
export const PACKAGING_TAG = "Packaging";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

/** รายการ SKU ใน Set / SKU เสริม: uuid เท่านั้น · จำนวน 1–99 · SKU ซ้ำ = รวมจำนวน · ไม่เกิน 30 รายการ */
export function cleanSetItems(v: unknown, known?: Set<string>): SetItem[] {
  if (!Array.isArray(v)) return [];
  const m = new Map<string, number>();
  for (const x of v) {
    const r = x as { sku_id?: unknown; qty?: unknown } | null;
    if (!r || !isUuid(r.sku_id) || (known && !known.has(r.sku_id))) continue;
    const q = Math.round(Number(r.qty));
    m.set(r.sku_id, Math.min(SET_QTY_MAX, (m.get(r.sku_id) ?? 0) + (Number.isFinite(q) && q > 0 ? q : 1)));
  }
  return [...m.entries()].slice(0, SET_ITEM_MAX).map(([sku_id, qty]) => ({ sku_id, qty }));
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

/** หมวด → Set (1 หมวดใช้ได้ 1 Set · Set ที่อยู่ในถังไม่นับ) */
export function categorySetMap(sets: PackagingSet[]): Map<string, PackagingSet> {
  const m = new Map<string, PackagingSet>();
  for (const s of [...sets].sort((a, b) => a.sort - b.sort)) {
    if (!s.is_active) continue;
    for (const c of s.category_ids ?? []) if (!m.has(c)) m.set(c, s);
  }
  return m;
}

/** บรรจุภัณฑ์ของรุ่น 1 ตัว: Set ที่ตั้งเอง (หรือ Set ของหมวด) + SKU เสริม · source บอกว่ามาจากไหน */
export function resolveParentPackaging(
  parent: { pack_set_id: string | null; pack_extra: unknown; category_id: string | null },
  setsById: Map<string, PackagingSet>,
  byCategory: Map<string, PackagingSet>,
): { set: PackagingSet | null; source: "own" | "category" | null; items: SetItem[] } {
  const own = parent.pack_set_id ? setsById.get(parent.pack_set_id) : undefined;
  const set = own && own.is_active ? own : !parent.pack_set_id && parent.category_id ? byCategory.get(parent.category_id) ?? null : null;
  const source = set ? (own && own.is_active ? "own" : "category") : null;
  const items = cleanSetItems([...(set?.items ?? []), ...cleanSetItems(parent.pack_extra)]);
  return { set, source, items };
}

/** สรุปรวมทั้งออเดอร์: จำนวนต่อชิ้นของบรรจุภัณฑ์ × จำนวนชิ้นสินค้า · เรียงตามลำดับที่เจอก่อน */
export function summarizePackaging<T extends { id: string; qty: number }>(lines: { qty: number; packaging: T[] }[]): (T & { qty: number })[] {
  const m = new Map<string, T & { qty: number }>();
  for (const l of lines) {
    const n = Math.max(0, Math.round(l.qty || 0));
    for (const p of l.packaging) {
      const cur = m.get(p.id) ?? { ...p, qty: 0 };
      cur.qty += n * Math.max(1, Math.round(p.qty || 1));
      m.set(p.id, cur);
    }
  }
  return [...m.values()].filter((x) => x.qty > 0);
}

/** รายงานการใช้: รวมจาก packing_sessions.packaging หลายใบ */
export function sumUsage(rows: { packaging: unknown }[]): { sku_id: string; code: string; name: string; qty: number }[] {
  const m = new Map<string, { sku_id: string; code: string; name: string; qty: number }>();
  for (const r of rows) {
    if (!Array.isArray(r.packaging)) continue;
    for (const p of r.packaging as { sku_id?: unknown; code?: unknown; name?: unknown; qty?: unknown }[]) {
      if (!isUuid(p?.sku_id)) continue;
      const cur = m.get(p.sku_id) ?? { sku_id: p.sku_id, code: String(p.code ?? ""), name: String(p.name ?? ""), qty: 0 };
      cur.qty += Math.max(0, Math.round(Number(p.qty) || 0));
      m.set(p.sku_id, cur);
    }
  }
  return [...m.values()].sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code));
}
