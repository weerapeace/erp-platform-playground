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
 * หน้าจับคู่ชื่อสี ↔ สีหลัก (ทะเบียนสี แท็บ "สีหลักในตัวกรอง"): applyToneAssignments (บันทึกทีเดียว) · suggestTone (คำแนะนำ) · NOT_COLOR_KEY (ไม่ใช่สี)
 */
import { normColorName, splitColorName, looksLikeSize } from "@/lib/color-swatch";

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

/**
 * แถวพิเศษใน erp_color_tones เก็บ "ชื่อที่ไม่ใช่สี" (เช่น 10 รู · ชื่อลาย) ไว้ใน members — is_active=false เสมอ
 * → เว็บร้าน/รายการโทนปกติไม่เห็น (อ่านเฉพาะ is_active) · หน้าจับคู่สีหลักไม่นับเป็น "ยังไม่มีสีหลัก"
 */
export const NOT_COLOR_KEY = "_not_color";

/** จัดชื่อสี 1 ชื่อ: tone = key ของโทน · "" = ไม่อยู่โทนไหน · NOT_COLOR_KEY = ไม่ใช่สี (ไม่โชว์ในตัวกรอง) */
export interface ToneAssign {
  color: string;
  tone: string;
}

/**
 * จัดชื่อสีเข้าโทนทีละหลายชื่อ (pure — API ใช้ตอนกดบันทึกทั้งหมด)
 * - เข้าโทน = ออกจากโทนอื่นที่ย้ายเข้าเองไว้ + ใส่ members โทนนี้ + ล้างข้อยกเว้นของโทนนี้
 * - ไม่อยู่โทนไหน / ไม่ใช่สี = ออกจาก members ทุกโทน + ใส่ข้อยกเว้นให้โทนที่ยังจับอัตโนมัติจากคำอยู่ (วนจนไม่มีโทนไหนจับ)
 * คืนโทนชุดใหม่ + รายชื่อ "ไม่ใช่สี" + id โทนที่เปลี่ยน (ไว้บันทึกเฉพาะแถวที่แก้)
 */
export function applyToneAssignments(tones: ColorTone[], notColor: string[], items: ToneAssign[]) {
  const next = tones.map((t) => ({ ...t, members: [...t.members], excludes: [...t.excludes] }));
  const nc = new Set(notColor.map(normColorName).filter(Boolean));
  const changed = new Set<string>();
  for (const it of items) {
    const c = normColorName(it.color);
    if (!c) continue;
    for (const t of next)
      if (t.members.includes(c)) {
        t.members = t.members.filter((m) => m !== c);
        changed.add(t.id);
      }
    nc.delete(c);
    const target = next.find((t) => t.key === it.tone);
    if (target) {
      target.members.push(c);
      target.excludes = target.excludes.filter((x) => x !== c);
      changed.add(target.id);
      continue;
    }
    for (let guard = 0; guard < next.length; guard++) {
      const hit = toneOfColor(c, next);
      if (!hit) break;
      const t = next.find((x) => x.id === hit.tone.id)!;
      t.excludes.push(c);
      changed.add(t.id);
    }
    if (it.tone === NOT_COLOR_KEY) nc.add(c);
  }
  return { tones: next, notColor: [...nc], changed };
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** กลุ่มสีจากจุดสี (hex) — ความสว่าง/ความสด/เฉดสี → key โทนตั้งต้น (black white grey brown red pink orange green blue navy purple) */
export function hexToneKey(hex: string): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = hexRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const chroma = max - min;
  if (l < 0.13) return "black";
  if (chroma < 0.08) return l > 0.82 ? "white" : l < 0.2 ? "black" : "grey";
  let h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 15 && h < 65 && l > 0.75 && chroma < 0.3) return "white"; // ครีม / เบจ / งาช้าง
  if (h >= 15 && h < 50 && (l < 0.45 || chroma < 0.35)) return "brown"; // น้ำตาล / แทน / คาราเมล
  if (h < 15 || h >= 345) return l > 0.7 ? "pink" : "red";
  if (h < 65) return "orange";
  if (h < 170) return "green";
  if (h < 250) return h >= 200 && l < 0.3 ? "navy" : "blue";
  if (h < 290) return "purple";
  return l < 0.35 ? "purple" : "pink";
}

/**
 * แนะนำโทนให้ชื่อสีที่ยังไม่มีโทน (pure) — ลำดับ: ชื่ออีกภาษาในพจนานุกรมสี → จุดสีในทะเบียนสี → ชื่อที่ไม่ใช่สี
 * entry = แถวพจนานุกรมสีของชื่อนี้ (ไม่มี = ข้ามข้อ 1–2)
 */
export function suggestTone(
  name: string,
  tones: ColorTone[],
  entry?: { th: string; en: string; kind: string | null; colors: string[] } | null,
): { key: string; why: string } | null {
  const c = normColorName(name);
  if (entry?.kind === "none") return { key: NOT_COLOR_KEY, why: "ตั้งเป็นไซส์ในทะเบียนสีแล้ว" };
  if (entry) {
    for (const other of [entry.en, entry.th]) {
      if (!other || normColorName(other) === c) continue;
      const hit = toneOfColor(other, tones);
      if (hit) return { key: hit.tone.key, why: `ชื่อ ${other.trim()}` };
    }
    const pattern = tones.find((t) => t.key === "pattern");
    if (entry.kind === "image" && pattern) return { key: pattern.key, why: "จุดสีเป็นรูปลาย" };
    const k = entry.kind !== "image" && entry.colors[0] ? hexToneKey(entry.colors[0]) : null;
    if (k) {
      const t = tones.find((x) => x.key === k) ?? nearestTone(entry.colors[0], tones);
      if (t) return { key: t.key, why: `จุดสีใกล้ ${t.name}` };
    }
  }
  // ไซส์/จำนวน (กติกากลาง looksLikeSize — ตัวเดียวกับแท็บหน้าตาจุดสี) → "ไม่ใช่สี"
  if (looksLikeSize(name)) return { key: NOT_COLOR_KEY, why: "ดูเป็นไซส์/จำนวน" };
  return null;
}

/** โทนที่สีตัวแทนใกล้ hex นี้ที่สุด (ไม่นับโทนลาย) — ใช้ตอนร้านไม่มีโทน key ตั้งต้น */
function nearestTone(hex: string, tones: ColorTone[]): ColorTone | null {
  const [r, g, b] = hexRgb(hex);
  let best: { t: ColorTone; d: number } | null = null;
  for (const t of tones) {
    if (t.key === "pattern") continue;
    const [r2, g2, b2] = hexRgb(t.hex);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (!best || d < best.d) best = { t, d };
  }
  return best?.t ?? null;
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
