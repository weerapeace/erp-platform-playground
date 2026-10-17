/**
 * 📝 เลือกแทรกรายละเอียดลง Description (ของกลาง · pure ใช้ได้ทั้งหน้าจอและ test)
 *   ทะเบียน product_highlight_items: kind 'phrase' ข้อความสำเร็จรูป | 'slot' ช่อง + ตัวเลข
 *   ทะเบียน product_materials: วัสดุ → บรรทัด "วัสดุ: A และ B" (ชื่อวัสดุบนเว็บลิงก์ไปหน้าวัสดุ — lib/product-materials)
 * ทุกบรรทัดขึ้นต้น "- " ตามรูปแบบคำอธิบายเดิม · แทรกเป็นข้อความธรรมดา (แก้ต่อได้เหมือนพิมพ์เอง)
 * ป๊อป: components/detail-insert.tsx · DB: supabase/migrations/202610210200_product_detail_snippets.sql
 */

export type Lang = "th" | "en";

export type SnippetItem = {
  id: string;
  name: string;
  name_en?: string | null;
  kind?: string | null;
  template?: string | null;
  template_en?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type MaterialPick = { id: string; name: string; name_en?: string | null };

export const LINE_PREFIX = "- ";
export const DEFAULT_SLOT_TEMPLATE = "{name} {n} ช่อง";
export const DEFAULT_SLOT_TEMPLATE_EN = "{name} × {n}";

const clean = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();
const fill = (tpl: string, name: string, n: number) => tpl.replace(/\{name\}/g, name).replace(/\{n\}/g, String(n)).replace(/\s+/g, " ").trim();

export const isSlot = (it: Pick<SnippetItem, "kind">): boolean => it.kind === "slot";

/** ข้อความสำเร็จรูป · อังกฤษไม่มี = null (ข้ามบรรทัดนั้นในฝั่งอังกฤษ) */
export function phraseText(it: SnippetItem, lang: Lang): string | null {
  const s = clean(lang === "en" ? it.name_en : it.name);
  return s || null;
}

/** ช่อง + ตัวเลข → "ช่องใส่บัตรเครดิต 6 ช่อง" / "6 card slots" · อังกฤษไม่มีชื่อ/รูปแบบ = null */
export function slotText(it: SnippetItem, n: number, lang: Lang): string | null {
  if (!(n > 0)) return null;
  if (lang === "th") return fill(clean(it.template) || DEFAULT_SLOT_TEMPLATE, clean(it.name), n) || null;
  const tpl = clean(it.template_en);
  const name = clean(it.name_en);
  if (!tpl && !name) return null;
  if (!tpl) return fill(DEFAULT_SLOT_TEMPLATE_EN, name, n);
  if (tpl.includes("{name}") && !name) return null;
  return fill(tpl, name, n);
}

/** หลายช่องรวมบรรทัดเดียว คั่นด้วยจุลภาค (ตามแบบคำอธิบายเดิม "ช่องใส่บัตรเครดิต 6 ช่อง, ช่องใส่ธนบัตร 2 ช่อง") · อังกฤษขาดตัวไหน = null ทั้งบรรทัด */
export function slotLine(picks: { item: SnippetItem; n: number }[], lang: Lang): string | null {
  const used = picks.filter((p) => p.n > 0);
  if (!used.length) return null;
  const parts = used.map((p) => slotText(p.item, p.n, lang));
  if (parts.some((x) => !x)) return null;
  return parts.join(", ");
}

/** วัสดุหลายตัวรวมบรรทัดเดียว "วัสดุ: A และ B" / "Material: A and B" · อังกฤษขาดชื่อ = null */
export function materialLine(mats: MaterialPick[], lang: Lang): string | null {
  if (!mats.length) return null;
  const names = mats.map((m) => clean(lang === "en" ? m.name_en : m.name));
  if (names.some((x) => !x)) return null;
  if (lang === "en") return `${mats.length > 1 ? "Materials" : "Material"}: ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}`;
  // ไทยเขียนติด "และหนังวัว…" ตามคำอธิบายเดิม
  return `วัสดุ: ${names.length > 1 ? `${names.slice(0, -1).join(", ")} และ${names[names.length - 1]}` : names[0]}`;
}

/** เติม "- " ข้างหน้า (ถ้ายังไม่มี) */
export const withPrefix = (line: string): string => (/^\s*[-•]/.test(line) ? line.trim() : `${LINE_PREFIX}${line.trim()}`);

/** แยกบรรทัด (ตัดบรรทัดว่างท้ายข้อความออก — กันแทรก "ท้ายสุด" แล้วไปอยู่ใต้บรรทัดว่าง) */
export function splitLines(text: string | null | undefined): string[] {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

/** แทรกบรรทัดที่ตำแหน่ง at (0 = บนสุด · จำนวนบรรทัด = ท้ายสุด) */
export function insertLines(text: string | null | undefined, lines: string[], at: number): string {
  const cur = splitLines(text);
  const i = Math.max(0, Math.min(Number.isFinite(at) ? Math.floor(at) : cur.length, cur.length));
  return [...cur.slice(0, i), ...lines, ...cur.slice(i)].join("\n");
}

/**
 * ตำแหน่งฝั่งอังกฤษ: จำนวนบรรทัดเท่าภาษาไทย = ตำแหน่งเดียวกัน (แปลมาบรรทัดต่อบรรทัด) · ไม่เท่า = ต่อท้าย
 */
export function enInsertAt(thText: string | null | undefined, enText: string | null | undefined, at: number): number {
  const th = splitLines(thText);
  const en = splitLines(enText);
  return en.length === th.length ? Math.min(at, en.length) : en.length;
}

/** เลือกอะไรไว้บ้าง → บรรทัดที่จะแทรก (ไทย + อังกฤษ) เรียง: ข้อความ → วัสดุ → ช่อง */
export function composeLines(
  sel: { phrases: SnippetItem[]; materials: MaterialPick[]; slots: { item: SnippetItem; n: number }[] },
): { th: string[]; en: string[]; enMissing: number } {
  const th: string[] = [];
  const en: string[] = [];
  let enMissing = 0;
  const push = (t: string | null, e: string | null) => {
    if (!t) return;
    th.push(withPrefix(t));
    if (e) en.push(withPrefix(e));
    else enMissing += 1;
  };
  for (const p of sel.phrases) push(phraseText(p, "th"), phraseText(p, "en"));
  push(materialLine(sel.materials, "th"), materialLine(sel.materials, "en"));
  push(slotLine(sel.slots, "th"), slotLine(sel.slots, "en"));
  return { th, en, enMissing };
}
