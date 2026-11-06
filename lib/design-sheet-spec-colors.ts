/**
 * ตารางสีของใบงานออกแบบ (แท็บรายละเอียดงาน รอบ 2) — ชนิดข้อมูล + ตัวทำความสะอาด (pure · ใช้ทั้ง API และหน้าจอ)
 *
 * แถว = ส่วนประกอบ (ตัวกระเป๋า / หูหิ้ว …) · คอลัมน์ = สีของรุ่น (สีที่ 1, 2 …) · ช่อง = สีที่เลือก
 * ช่องสีมาได้ 4 ทาง: แผงผ้า (ชิ้นบนรูปแผ่น swatch) · SKU · ทะเบียนสีกลาง · ดูดสีจากรูป / เลือกเอง
 */

export type SpecColorSource = "swatch" | "sku" | "dict" | "pick";

export type SpecColorCell = {
  source: SpecColorSource;
  name: string | null;          // ชื่อสี เช่น แดงคลาสสิก
  hex: string | null;           // สีเดี่ยว (ดูดสี / เลือกเอง / ทะเบียนสีสีเดียว)
  colors: string[];             // ทะเบียนสีแบบหลายสี (≤4)
  image_key: string | null;     // รูป (ปก SKU / รูปแผ่นผ้า / รูปลายในทะเบียนสี)
  crop: { x: number; y: number; w: number; h: number } | null;   // ชิ้นบนแผ่นผ้า (% ของรูป)
  sku_id: string | null; sku_code: string | null; sku_name: string | null;
  swatch_id: string | null;
};
export type SpecColorRow = { key: string; name: string; code?: string | null };   // code = ส่วนประกอบจากรายการกลาง material_slots (v2)
export type SpecColorway = { key: string; name: string; cells: Record<string, SpecColorCell> };
export type SpecColorTable = { rows: SpecColorRow[]; colorways: SpecColorway[] };

export const SPEC_COLOR_SOURCE_LABEL: Record<SpecColorSource, string> = { swatch: "แผงผ้า", sku: "SKU", dict: "ทะเบียนสี", pick: "ดูดสี" };
export const EMPTY_SPEC_COLORS: SpecColorTable = { rows: [], colorways: [] };
const LIMITS = { rows: 60, colorways: 20, name: 80 } as const;

const HEX = /^#[0-9a-f]{6}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max: number): string | null => { const s = typeof v === "string" ? v.trim().slice(0, max) : ""; return s || null; };
const hex = (v: unknown): string | null => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : null);
const key = (v: unknown): string | null => (typeof v === "string" && /^[\w-]{1,64}$/.test(v) ? v : null);
const pct = (v: unknown): number | null => { const n = Number(v); return v == null || !Number.isFinite(n) ? null : Math.round(Math.min(100, Math.max(0, n)) * 100) / 100; };

export function cleanSpecColorCell(raw: unknown): SpecColorCell | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const source = c.source === "swatch" || c.source === "sku" || c.source === "dict" || c.source === "pick" ? c.source : null;
  if (!source) return null;
  const cr = (c.crop ?? null) as Record<string, unknown> | null;
  const x = pct(cr?.x), y = pct(cr?.y), w = pct(cr?.w), h = pct(cr?.h);
  const skuId = typeof c.sku_id === "string" && UUID.test(c.sku_id) ? c.sku_id : null;
  const swatchId = typeof c.swatch_id === "string" && UUID.test(c.swatch_id) ? c.swatch_id : null;
  const cell: SpecColorCell = {
    source,
    name: str(c.name, LIMITS.name),
    hex: hex(c.hex),
    colors: (Array.isArray(c.colors) ? c.colors : []).map(hex).filter((v): v is string => !!v).slice(0, 4),
    image_key: str(c.image_key, 500),
    crop: x != null && y != null && w && h ? { x, y, w, h } : null,
    sku_id: skuId, sku_code: skuId ? str(c.sku_code, 80) : null, sku_name: skuId ? str(c.sku_name, 300) : null,
    swatch_id: swatchId,
  };
  // ต้องมีอะไรให้โชว์อย่างน้อย 1 อย่าง ไม่งั้นถือว่าช่องว่าง
  return cell.hex || cell.colors.length || cell.image_key || cell.sku_id || cell.name ? cell : null;
}

export function cleanSpecColors(raw: unknown): SpecColorTable {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rows: SpecColorRow[] = [];
  const seen = new Set<string>();
  for (const r of (Array.isArray(o.rows) ? o.rows : []).slice(0, LIMITS.rows)) {
    const k = key((r as Record<string, unknown>)?.key); if (!k || seen.has(k)) continue;
    seen.add(k);
    const code = str((r as Record<string, unknown>).code, 60);
    rows.push({ key: k, name: str((r as Record<string, unknown>).name, LIMITS.name) ?? "", ...(code ? { code } : {}) });
  }
  const colorways: SpecColorway[] = [];
  for (const cw of (Array.isArray(o.colorways) ? o.colorways : []).slice(0, LIMITS.colorways)) {
    const c = (cw ?? {}) as Record<string, unknown>;
    const k = key(c.key); if (!k) continue;
    const cells: Record<string, SpecColorCell> = {};
    const rawCells = (c.cells && typeof c.cells === "object" ? c.cells : {}) as Record<string, unknown>;
    for (const r of rows) { const cell = cleanSpecColorCell(rawCells[r.key]); if (cell) cells[r.key] = cell; }
    colorways.push({ key: k, name: str(c.name, LIMITS.name) ?? "", cells });
  }
  return { rows, colorways };
}

export const specColorsEmpty = (t: SpecColorTable) => t.rows.length === 0 && t.colorways.length === 0;

/** CSS พื้นหลังของชิ้นที่ตัดจากรูปแผ่นผ้า (crop % ของรูป) — ขยายรูปให้ชิ้นนั้นเต็มกล่อง */
export function cropBackground(url: string, crop: { x: number; y: number; w: number; h: number }): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const pos = (start: number, size: number) => (size >= 100 ? 0 : (start / (100 - size)) * 100);
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${(100 / crop.w) * 100}% ${(100 / crop.h) * 100}%`,
    backgroundPosition: `${pos(crop.x, crop.w)}% ${pos(crop.y, crop.h)}%`,
  };
}
