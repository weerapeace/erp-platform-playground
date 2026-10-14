/**
 * 🎨 โทนสี (ของกลาง · pure — ใช้ได้ทั้ง API และหน้าจอ) — ตาราง erp_color_tones
 * ใช้ทำตัวกรอง "กรองตามสี" บนเว็บร้าน: ลูกค้ากดโทน "แดง" → เห็นสินค้าที่มีสี แดง / แดงเลือดหมู / แดงไวน์ …
 *
 * ชื่อสี 1 ชื่อ → อยู่ได้ 1 โทน ตามลำดับนี้
 *   1) ย้ายเข้าเอง (members) ชนะเสมอ
 *   2) คำที่จับอัตโนมัติ (keywords) · ยกเว้นที่ excludes
 *      - คำไทย = ชื่อสีขึ้นต้นด้วยคำนั้น (แดงเลือดหมู → "แดง") · หลายคำตรง = คำยาวสุดชนะ
 *      - คำอังกฤษ = มีคำนั้นเป็น "คำ" อยู่ตรงไหนก็ได้ (Hot Pink (02) → "pink") · หลายคำตรง = คำที่อยู่ท้ายสุดชนะ (Denim Bubblegum → ชมพู)
 *   3) ไม่ตรงอะไร = ยังไม่อยู่ในโทนไหน (ลูกค้ากรองไม่เจอ — หน้าต่าง 🎨 โทนสี โชว์ให้จัด)
 * สีผสม "กรมท่า-ส้ม" (แยกด้วย - / , + &) → นับเข้าทุกโทนของสีย่อย · ถ้าย้ายชื่อเต็มเข้าโทนเอง = ใช้โทนนั้นโทนเดียว
 */
import { normColorName, splitColorName } from "@/lib/color-swatch";

export interface ColorTone {
  id: string;
  /** รหัสสั้นในลิงก์เว็บ (?tone=red) */
  key: string;
  name: string;
  hex: string;
  keywords: string[];
  members: string[];
  excludes: string[];
  sortOrder: number;
}

export const TONE_SELECT = "id, key, name, hex, keywords, members, excludes, sort_order";

export function rowToTone(r: {
  id: string;
  key: string;
  name: string;
  hex: string | null;
  keywords: string[] | null;
  members: string[] | null;
  excludes: string[] | null;
  sort_order: number | null;
}): ColorTone {
  const list = (a: string[] | null) => [...new Set((a ?? []).map(normColorName).filter(Boolean))];
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    hex: /^#[0-9a-f]{6}$/i.test(r.hex ?? "") ? (r.hex as string) : "#888888",
    keywords: list(r.keywords),
    members: list(r.members),
    excludes: list(r.excludes),
    sortOrder: Number(r.sort_order) || 0,
  };
}

const LATIN = /[a-z]/;
/** ตำแหน่งของคำอังกฤษ k ที่เป็น "คำเต็ม" ใน c (ไม่เจอ = -1) — "hot pink (02)" มี "pink" · "pinky" ไม่นับเป็น "pink" */
function wordPos(c: string, k: string): number {
  let from = 0;
  for (;;) {
    const i = c.indexOf(k, from);
    if (i < 0) return -1;
    const before = i === 0 ? "" : c[i - 1];
    const after = c[i + k.length] ?? "";
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) return i;
    from = i + 1;
  }
}

/** โทนของ "ชื่อสีเดียว" (ไม่ใช่สีผสม) — null = ยังไม่อยู่ในโทนไหน */
export function toneOfColor(name: string, tones: ColorTone[]): { tone: ColorTone; how: "member" | "keyword" } | null {
  const c = normColorName(name);
  if (!c) return null;
  const sorted = [...tones].sort((a, b) => a.sortOrder - b.sortOrder);
  const m = sorted.find((t) => t.members.includes(c));
  if (m) return { tone: m, how: "member" };
  // คะแนน: ตำแหน่งที่เจอ (ท้ายกว่าชนะ — ภาษาอังกฤษคำหลักมักอยู่ท้าย) แล้วค่อยความยาวคำ
  let best: { tone: ColorTone; pos: number; len: number } | null = null;
  for (const t of sorted) {
    if (t.excludes.includes(c)) continue;
    for (const k of t.keywords) {
      if (!k) continue;
      const pos = LATIN.test(k) ? wordPos(c, k) : c.startsWith(k) ? 0 : -1;
      if (pos < 0) continue;
      if (!best || pos > best.pos || (pos === best.pos && k.length > best.len)) best = { tone: t, pos, len: k.length };
    }
  }
  return best ? { tone: best.tone, how: "keyword" } : null;
}

/** โทนของชื่อสีบนสินค้า (รองรับสีผสม) — ไม่ซ้ำ เรียงตามลำดับโทน */
export function tonesOfLabel(label: string, tones: ColorTone[]): ColorTone[] {
  const full = normColorName(label);
  const whole = tones.find((t) => t.members.includes(full));
  if (whole) return [whole];
  const parts = splitColorName(label);
  const out = new Map<string, ColorTone>();
  for (const p of parts.length ? parts : [label]) {
    const r = toneOfColor(p, tones);
    if (r) out.set(r.tone.id, r.tone);
  }
  return [...out.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** ชื่อสีเดี่ยวทั้งหมดที่อยู่ในรายการ (แตกสีผสมเป็นสีย่อย) — ไว้โชว์ในหน้าต่างจัดโทน */
export function singleColorNames(labels: string[]): string[] {
  const out = new Map<string, string>();
  for (const l of labels) for (const p of splitColorName(l).length ? splitColorName(l) : [l]) {
    const k = normColorName(p);
    if (k && !out.has(k)) out.set(k, p.trim());
  }
  return [...out.values()];
}
