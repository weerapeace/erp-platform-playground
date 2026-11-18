/**
 * 🧷 ตะกร้าอะไหล่ — ส่วนที่ไม่ใช่หน้าจอของป๊อป "เพิ่มอะไหล่" ใบงานออกแบบ (เจ้าของขอ 2026-11-17)
 *   isPartsItem   = วัสดุตีราคาที่นับเป็น อะไหล่ / ซิป / เทป (กลุ่มคิด "นับชิ้น" หรือ "ตามความยาว")
 *   parseSetItems = อ่านชุดอะไหล่ (design_price_items.set_items) แบบปลอดภัย
 *   ชุดสำเร็จรูป (2026-11-18): group = "เลือกอย่างใดอย่างหนึ่ง" (ตัวในชุดที่ group เดียวกัน) · cm = ยาวต่อเส้นของตัวที่คิดตามยาว
 *     แถว self (item_id = ตัวหลัก, self: true) = ยาวของตัวหลักต่อชุด เช่น สายผ้า 120 ซม./ชุด · kitMembers/kitSelfCm/kitToCart
 *   applyCartToLines = เอาตะกร้าลงบรรทัดตีราคา: มีวัสดุนั้นในตารางอยู่แล้ว → บวกจำนวน/ความยาวเข้าบรรทัดเดิม · ไม่มี → บรรทัดใหม่
 *     นับชิ้น: pieces += จำนวน · ตามความยาว: length_cm += ยาวต่อเส้น × จำนวนเส้น (สูตรเงินใช้ lib/design-sheet-cost-row ตัวเดียวกับตาราง)
 *   หน้าจอ: components/parts-cart-modal · เทสต์ lib/__tests__/parts-cart.test.ts · คู่มือ docs/parts-cart.md
 */
import { costLineFromItem, recomputeCostLine, type CostItemLike } from "@/lib/design-sheet-cost-row";

export type PartsMode = "count" | "length";
export type SetItem = { item_id: string; qty: number; on: boolean; group?: string; cm?: number; self?: true };
export type CartEntry = { item_id: string; qty: number; cm?: number | null };

export const PARTS_MAX_QTY = 999;
export const PARTS_MAX_CM = 1000;
export const PARTS_DEFAULT_CM = 30;
export const MAX_SET_ITEMS = 10;

/** วิธีคิดของกลุ่ม → อะไหล่นับชิ้น / ซิป-เทปตามยาว · อย่างอื่น (ผ้า แผ่น) = ไม่ใช่อะไหล่ */
export const partsModeOf = (calc: string | null | undefined): PartsMode | null =>
  calc === "count" ? "count" : calc === "length" ? "length" : null;
export const isPartsItem = (it: { calc_method: string | null }) => partsModeOf(it.calc_method) != null;

const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

/** ชุดอะไหล่จากฐานข้อมูล (jsonb) → รายการที่ใช้ได้จริง · ตัดตัวเอง ตัวซ้ำ และค่าเพี้ยนทิ้ง */
export function parseSetItems(raw: unknown, selfId?: string): SetItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SetItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const id = (x as Record<string, unknown>).item_id;
    const o = x as Record<string, unknown>;
    const cmN = Number(o.cm); const cm = Number.isFinite(cmN) && cmN > 0 ? Math.min(PARTS_MAX_CM, Math.round(cmN * 100) / 100) : null;
    // แถวยาวของตัวหลักต่อชุด (self) — เก็บไว้ได้ตัวเดียว
    if (o.self === true && typeof id === "string" && id && (selfId == null || id === selfId)) {
      if (cm != null && !out.some((e) => e.self)) out.push({ item_id: id, qty: 1, on: true, cm, self: true });
      continue;
    }
    if (typeof id !== "string" || !id || id === selfId || seen.has(id)) continue;
    seen.add(id);
    const e: SetItem = { item_id: id, qty: clampInt(o.qty, 1, PARTS_MAX_QTY, 1), on: o.on !== false };
    const g = typeof o.group === "string" ? o.group.trim().slice(0, 20) : "";
    if (g) e.group = g;
    if (cm != null) e.cm = cm;
    out.push(e);
    if (out.filter((m) => !m.self).length >= MAX_SET_ITEMS) break;
  }
  return out;
}

/** ใส่ตะกร้า (มีแล้ว = บวกจำนวน) · cm = ยาวต่อเส้นตอนเพิ่มใหม่ (ตามยาว) */
export function addToCart(cart: CartEntry[], itemId: string, mode: PartsMode, qty = 1, cm?: number | null): CartEntry[] {
  const i = cart.findIndex((c) => c.item_id === itemId);
  if (i >= 0) return cart.map((c, k) => (k === i ? { ...c, qty: Math.min(PARTS_MAX_QTY, c.qty + qty) } : c));
  return [...cart, { item_id: itemId, qty: Math.min(PARTS_MAX_QTY, Math.max(1, qty)), cm: mode === "length" ? (cm && cm > 0 ? cm : PARTS_DEFAULT_CM) : null }];
}

// ─── ชุดสำเร็จรูป ───
/** ตัวในชุด (ไม่รวมแถวยาวของตัวหลัก) */
export const kitMembers = (set: SetItem[] | undefined) => (set ?? []).filter((m) => !m.self);
/** ยาวของตัวหลักต่อชุด (ซม.) · ไม่ได้ตั้ง = null */
export const kitSelfCm = (set: SetItem[] | undefined) => (set ?? []).find((m) => m.self)?.cm ?? null;
/** ตัวเลือกตั้งต้นของแต่ละกลุ่ม "เลือก 1 อย่าง" = ตัวแรกที่ติ๊กไว้ก่อน (ไม่มี = ตัวแรก) */
export function kitDefaultChoices(set: SetItem[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of kitMembers(set)) if (m.group && (!out[m.group] || (m.on && !kitMembers(set).find((x) => x.item_id === out[m.group!])?.on))) out[m.group] = m.item_id;
  return out;
}
/**
 * ใส่ทั้งชุดลงตะกร้า × kitQty: ตัวหลัก (ยาวต่อชุด ถ้าตั้งไว้) + ตัวในชุดที่ติ๊ก · กลุ่ม "เลือก 1 อย่าง" ใส่เฉพาะตัวที่เลือก
 *   modeOf = วิธีคิดของวัสดุ (ไม่ใช่อะไหล่ = ข้าม) · withOwner=false = ใส่เฉพาะตัวในชุด (ตัวหลักใส่ไปแล้ว)
 */
export function kitToCart(cart: CartEntry[], ownerId: string, set: SetItem[] | undefined, modeOf: (id: string) => PartsMode | null,
  pick: { on: Record<string, boolean>; choices: Record<string, string> }, kitQty = 1, withOwner = true): CartEntry[] {
  const n = Math.max(1, Math.min(PARTS_MAX_QTY, Math.round(kitQty)));
  let next = cart;
  const om = modeOf(ownerId);
  if (withOwner && om) next = addToCart(next, ownerId, om, n, kitSelfCm(set));
  for (const m of kitMembers(set)) {
    const mm = modeOf(m.item_id); if (!mm) continue;
    const use = m.group ? pick.choices[m.group] === m.item_id : pick.on[m.item_id] ?? m.on;
    if (use) next = addToCart(next, m.item_id, mm, m.qty * n, m.cm ?? null);
  }
  return next;
}

/** ความยาวรวมของบรรทัดตามยาว (ซม.) */
export const cartLengthCm = (c: CartEntry) => Math.round((c.cm ?? PARTS_DEFAULT_CM) * c.qty * 100) / 100;

type LineLike = {
  item_id: string | null; calc_method: string | null; pieces: number | null; length_cm: number | null;
  note: string | null; sort_order?: number | null;
  group_name: string | null; group_code?: string | null; width_cm: number | null; face_width_cm: number | null;
  waste_percent: number | null; divisor: number | null; qty: number | null; unit_price: number | null; amount: number | null;
};

const lenNote = (c: CartEntry) => `${c.qty} เส้น × ${c.cm ?? PARTS_DEFAULT_CM} ซม.`;

/**
 * ตะกร้า → บรรทัดตีราคา (ของ Parent ที่ดูอยู่)
 *   lines = บรรทัดของแท็บนี้ · items = วัสดุตีราคาทั้งหมด · make = สร้างแถวใหม่ของหน้าจอ (ใส่ key/parent_code)
 *   คืน { lines: บรรทัดใหม่ทั้งหมดของแท็บ, added, merged }
 */
export function applyCartToLines<L extends LineLike>(
  lines: L[], cart: CartEntry[], items: Map<string, CostItemLike>,
  make: (base: ReturnType<typeof costLineFromItem>, idx: number) => L,
): { lines: L[]; added: number; merged: number } {
  const out = [...lines];
  let added = 0, merged = 0;
  for (const c of cart) {
    const it = items.get(c.item_id); if (!it) continue;
    const mode = partsModeOf(it.calc_method); if (!mode || c.qty <= 0) continue;
    const at = out.findIndex((l) => l.item_id === it.id && l.calc_method === it.calc_method);
    if (at >= 0) {
      const l = out[at];
      const patch = mode === "count"
        ? { pieces: (Number(l.pieces) || 0) + c.qty }
        : { length_cm: Math.round(((Number(l.length_cm) || 0) + cartLengthCm(c)) * 100) / 100, note: l.note ? `${l.note} + ${lenNote(c)}` : lenNote(c) };
      out[at] = recomputeCostLine({ ...l, ...patch });
      merged++;
    } else {
      const base = costLineFromItem(it, out.length);
      const filled = recomputeCostLine(mode === "count"
        ? { ...base, pieces: c.qty }
        : { ...base, length_cm: cartLengthCm(c), note: lenNote(c) });
      out.push(make(filled, out.length));
      added++;
    }
  }
  return { lines: out, added, merged };
}

/** ราคาต่อใบของรายการในตะกร้า (ไว้โชว์ในตะกร้า — สูตรเดียวกับตาราง) */
export function cartEntryAmount(c: CartEntry, it: CostItemLike | undefined): number {
  if (!it) return 0;
  const mode = partsModeOf(it.calc_method); if (!mode) return 0;
  const base = costLineFromItem(it, 0);
  const r = recomputeCostLine(mode === "count" ? { ...base, pieces: c.qty } : { ...base, length_cm: cartLengthCm(c) });
  return Number(r.amount) || 0;
}
