/**
 * 📝 เลือกแทรกรายละเอียดลง Description (ของกลาง · pure ใช้ได้ทั้งหน้าจอและ test)
 *   ทะเบียน product_highlight_items: kind 'phrase' ข้อความสำเร็จรูป | 'slot' ช่อง + ตัวเลข
 *   ทะเบียน product_materials: วัสดุ → บรรทัด "วัสดุ: A และ B" (ชื่อวัสดุบนเว็บลิงก์ไปหน้าวัสดุ — lib/product-materials)
 *   ขนาด/น้ำหนัก/หูหิ้ว/สาย (ช่องของสินค้า) → "ขนาด: กว้าง 30 × สูง 20 × หนา 10 ซม." · "น้ำหนัก: 450 กรัม" · "ความยาวสายสะพาย: 100–120 ซม. (ปรับได้)"
 *   ใส่อะไรได้ (product_fit_items · fits) → "ใส่ได้: iPad (11 นิ้ว) และ เอกสาร A4"
 * รูปแบบบรรทัดกลาง (คำนำหน้า · คำเชื่อม "และ" · ชื่ออังกฤษในวงเล็บ) = InsertTemplates ตั้งที่ ⚙️ ในป๊อป
 *   เก็บ app_settings.detail_insert_templates (ทุกสินค้า ทุกคนใช้ชุดเดียวกัน) · API /api/detail-insert/templates
 * ทุกบรรทัดขึ้นต้น "- " ตามรูปแบบคำอธิบายเดิม · แทรกเป็นข้อความธรรมดา (แก้ต่อได้เหมือนพิมพ์เอง)
 * ป๊อป: components/detail-insert.tsx · DB: supabase/migrations/202610210200_product_detail_snippets.sql
 */
import { fitSizeEn } from "@/lib/product-fits";

export type Lang = "th" | "en";

export type SnippetItem = {
  id: string;
  name: string;
  name_en?: string | null;
  kind?: string | null;
  template?: string | null;
  template_en?: string | null;
  /** ชนิด slot: ช่องอยู่ด้านใน/ด้านนอก (null = ไม่ระบุ → รวมบรรทัดเดียว) */
  slot_side?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  /** ข้อความหลายแบบ (lib/phrase-variants) — null = ข้อความเดียว */
  variant_mode?: string | null;
  variants?: unknown;
};

export type MaterialPick = { id: string; name: string; name_en?: string | null };

export const LINE_PREFIX = "- ";
export const DEFAULT_SLOT_TEMPLATE = "{name} {n} ช่อง";
export const DEFAULT_SLOT_TEMPLATE_EN = "{name} × {n}";

const clean = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();
const fill = (tpl: string, name: string, n: number) => tpl.replace(/\{name\}/g, name).replace(/\{n\}/g, String(n)).replace(/\s+/g, " ").trim();

/* ─────────── รูปแบบบรรทัดกลาง ─────────── */

export type LineKind = "material" | "slot" | "slot_in" | "slot_out" | "fit" | "size" | "weight" | "handle" | "strap";
export type BracketKind = "phrase" | "material" | "slot" | "fit";
/** ชนิดบรรทัดที่จัดลำดับได้ = ข้อความสำเร็จรูป + Lifestyle + บรรทัดที่มีคำนำหน้า */
export type OrderKind = "phrase" | "lifestyle" | LineKind;
/** ลำดับบรรทัดตั้งต้น (เหมือนเดิมก่อนมีตั้งค่า): ข้อความ → วัสดุ → ช่องนอก → ช่องใน → ช่อง → ขนาด → น้ำหนัก → หูหิ้ว → สาย → ใส่ได้ → Lifestyle */
export const DEFAULT_LINE_ORDER: OrderKind[] = ["phrase", "material", "slot_out", "slot_in", "slot", "size", "weight", "handle", "strap", "fit", "lifestyle"];

export type InsertTemplates = {
  /** คำเชื่อมรายการ: 2 รายการ = A{last}B · 3+ = A{sep}B{last}C */
  joiner: { sep: string; last: string; sep_en: string; last_en: string };
  /** ชื่ออังกฤษในวงเล็บ (เฉพาะบรรทัดไทย) เช่น "ผ้าไนล่อน (Nylon)" */
  enInBrackets: Record<BracketKind, boolean>;
  /** คำนำหน้าบรรทัด (ว่าง = ไม่มี) */
  prefix: Record<LineKind, { th: string; en: string }>;
  /** ลำดับบรรทัดที่แทรก (เจ้าของ 2026-10-19: "อยากให้เรียงลำดับบรรทัดตรงนี้ได้") — ลาก ⠿ ที่ ⚙️ รูปแบบบรรทัด */
  order: OrderKind[];
  /** ชุดรายการตามประเภทสินค้า (เช่น กระเป๋าสตางค์ / เข็มขัด) — เลือกอัตโนมัติจากหมวดสินค้า */
  profiles: InsertProfile[];
};

export type InsertTab = "phrase" | "material" | "slot" | "size" | "fit" | "lifestyle";
export type CatalogKind = "phrase" | "material" | "slot" | "fit" | "style" | "lifestyle";
export const INSERT_TABS: InsertTab[] = ["phrase", "material", "slot", "size", "fit", "lifestyle"];
/** ช่องตัวเลขในแท็บขนาด (กว้าง สูง หนา น้ำหนัก หูหิ้ว สาย สายยาวสุด) */
export const INSERT_SIZE_KEYS = ["w", "h", "d", "g", "hd", "s1", "s2"] as const;

export type InsertProfile = {
  id: string;
  name: string;
  /** หมวดสินค้าที่ใช้ชุดนี้ (รวมหมวดย่อยข้างใต้อัตโนมัติ) */
  categoryIds: string[];
  /** แท็บที่โชว์ (null = ทุกแท็บ) */
  tabs: InsertTab[] | null;
  /** รายการที่โชว์ในแต่ละแท็บ (null/ไม่มี = ทุกรายการ) */
  items: Partial<Record<CatalogKind, string[] | null>>;
  /** ช่องตัวเลขที่โชว์ในแท็บขนาด (null = ทุกช่อง) */
  sizeFields: string[] | null;
};

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  material: "วัสดุ",
  slot: "ช่อง (ไม่ระบุ)",
  slot_in: "ช่องด้านใน",
  slot_out: "ช่องด้านนอก",
  fit: "ใส่อะไรได้",
  size: "ขนาด",
  weight: "น้ำหนัก",
  handle: "หูหิ้ว",
  strap: "สายสะพาย",
};

export const DEFAULT_INSERT_TEMPLATES: InsertTemplates = {
  joiner: { sep: ", ", last: " และ ", sep_en: ", ", last_en: " and " },
  enInBrackets: { phrase: false, material: false, slot: false, fit: false },
  prefix: {
    material: { th: "วัสดุ:", en: "Material:" },
    slot: { th: "", en: "" },
    slot_in: { th: "ด้านในกระเป๋า:", en: "Inside:" },
    slot_out: { th: "ด้านนอก:", en: "Outside:" },
    fit: { th: "ใส่ได้:", en: "Fits:" },
    size: { th: "ขนาด:", en: "Size:" },
    weight: { th: "น้ำหนัก:", en: "Weight:" },
    handle: { th: "ความสูงหูหิ้ว:", en: "Handle drop:" },
    strap: { th: "ความยาวสายสะพาย:", en: "Strap drop:" },
  },
  order: DEFAULT_LINE_ORDER,
  profiles: [],
};

/** ลำดับจาก DB → ครบทุกชนิดเสมอ (ชนิดที่ไม่รู้จัก/ซ้ำ = ทิ้ง · ชนิดที่ขาด = ต่อท้ายตามลำดับตั้งต้น) */
export function normalizeLineOrder(raw: unknown): OrderKind[] {
  const known = new Set<string>(DEFAULT_LINE_ORDER);
  const out: OrderKind[] = [];
  if (Array.isArray(raw)) for (const x of raw) if (typeof x === "string" && known.has(x) && !out.includes(x as OrderKind)) out.push(x as OrderKind);
  for (const k of DEFAULT_LINE_ORDER) if (!out.includes(k)) out.push(k);
  return out;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const strList = (v: unknown, max: number, ok?: (s: string) => boolean): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ID_RE.test(x) && (!ok || ok(x))))].slice(0, max) : [];

/** ชุดรายการจาก DB → ถูกรูปเสมอ (ไม่มีชื่อ/id = ทิ้ง) · null = "ทั้งหมด" */
export function normalizeProfiles(raw: unknown): InsertProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: InsertProfile[] = [];
  for (const x of raw.slice(0, 30)) {
    const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const id = typeof r.id === "string" && ID_RE.test(r.id) ? r.id : "";
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    if (!id || !name || out.some((p) => p.id === id)) continue;
    const it = (r.items && typeof r.items === "object" ? r.items : {}) as Record<string, unknown>;
    const items: InsertProfile["items"] = {};
    for (const k of ["phrase", "material", "slot", "fit"] as CatalogKind[]) if (Array.isArray(it[k])) items[k] = strList(it[k], 500);
    out.push({
      id,
      name,
      categoryIds: strList(r.categoryIds, 100),
      tabs: Array.isArray(r.tabs) ? (strList(r.tabs, INSERT_TABS.length, (s) => (INSERT_TABS as string[]).includes(s)) as InsertTab[]) : null,
      items,
      sizeFields: Array.isArray(r.sizeFields) ? strList(r.sizeFields, 7, (s) => (INSERT_SIZE_KEYS as readonly string[]).includes(s)) : null,
    });
  }
  return out;
}

/**
 * ชุดของสินค้าจากหมวด: ไล่จากหมวดของสินค้าขึ้นไปหาหมวดแม่ — เจอชุดที่ผูกหมวดชั้นไหนก่อนใช้ชุดนั้น (หมวดย่อยได้ชุดของหมวดแม่)
 * ไม่มีหมวด / ไม่มีชุดไหนผูก = null (โชว์ทั้งหมด)
 */
export function pickProfile(profiles: InsertProfile[], categoryId: string | null | undefined, parentOf: Map<string, string | null>): InsertProfile | null {
  let cur = categoryId ?? null;
  for (let depth = 0; cur && depth < 12; depth++) {
    const hit = profiles.find((p) => p.categoryIds.includes(cur as string));
    if (hit) return hit;
    cur = parentOf.get(cur) ?? null;
  }
  return null;
}

/** รายการในแท็บนี้ตามชุด (ไม่มีชุด/ไม่ได้จำกัด = ทุกรายการ) */
export function profileAllows(profile: InsertProfile | null, kind: CatalogKind, id: string): boolean {
  const ids = profile?.items[kind];
  return !ids || ids.includes(id);
}

/** ค่าจาก DB (หรือที่ส่งมาบันทึก) → ครบทุกช่องเสมอ · ช่องที่ไม่ส่ง = ค่าเริ่มต้น · คำเชื่อมเก็บช่องว่างหน้า/หลังไว้ */
export function normalizeInsertTemplates(raw: unknown): InsertTemplates {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const D = DEFAULT_INSERT_TEMPLATES;
  const str = (v: unknown, d: string, keepSpaces = false) => {
    if (typeof v !== "string") return d;
    const s = v.replace(/[\r\n]/g, " ").slice(0, 40);
    return keepSpaces ? s : s.trim();
  };
  const j = (r.joiner ?? {}) as Record<string, unknown>;
  const b = (r.enInBrackets ?? {}) as Record<string, unknown>;
  const p = (r.prefix ?? {}) as Record<string, Record<string, unknown> | undefined>;
  return {
    joiner: {
      sep: str(j.sep, D.joiner.sep, true),
      last: str(j.last, D.joiner.last, true),
      sep_en: str(j.sep_en, D.joiner.sep_en, true),
      last_en: str(j.last_en, D.joiner.last_en, true),
    },
    enInBrackets: {
      phrase: typeof b.phrase === "boolean" ? b.phrase : D.enInBrackets.phrase,
      material: typeof b.material === "boolean" ? b.material : D.enInBrackets.material,
      slot: typeof b.slot === "boolean" ? b.slot : D.enInBrackets.slot,
      fit: typeof b.fit === "boolean" ? b.fit : D.enInBrackets.fit,
    },
    prefix: Object.fromEntries(
      (Object.keys(D.prefix) as LineKind[]).map((k) => [k, { th: str(p[k]?.th, D.prefix[k].th), en: str(p[k]?.en, D.prefix[k].en) }])
    ) as InsertTemplates["prefix"],
    order: normalizeLineOrder(r.order),
    profiles: normalizeProfiles(r.profiles),
  };
}

/** รวมรายการ: 1 = A · 2 = A และ B · 3+ = A, B และ C (คำเชื่อมตั้งได้) */
export function joinList(items: string[], lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string {
  const xs = items.filter(Boolean);
  const sep = lang === "en" ? tpl.joiner.sep_en : tpl.joiner.sep;
  const last = lang === "en" ? tpl.joiner.last_en : tpl.joiner.last;
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(sep)}${last}${xs[xs.length - 1]}`;
}

const withLead = (lead: string, body: string) => (lead.trim() ? `${lead.trim()} ${body}` : body);
const lead = (tpl: InsertTemplates, k: LineKind, lang: Lang) => (lang === "en" ? tpl.prefix[k].en : tpl.prefix[k].th);
/** ชื่อไทย + (อังกฤษ) เมื่อเปิดวงเล็บ · อังกฤษว่าง/เหมือนไทย = ไทยอย่างเดียว */
const thWithEn = (th: string, en: string | null | undefined, on: boolean) => {
  const e = clean(en);
  return on && e && e !== th ? `${th} (${e})` : th;
};

/* ─────────── บรรทัดแต่ละแบบ ─────────── */

export const isSlot = (it: Pick<SnippetItem, "kind">): boolean => it.kind === "slot";
/** ข้อความสำเร็จรูป (ไม่ใช่ ช่อง / สไตล์ / ข้อความ Lifestyle) */
export const isPhrase = (it: Pick<SnippetItem, "kind">): boolean => !it.kind || it.kind === "phrase";
/** 🌿 แท็บ Lifestyle: สไตล์ = kind style · ข้อความ = kind lifestyle (parent_id = สไตล์) */
export const isStyle = (it: Pick<SnippetItem, "kind">): boolean => it.kind === "style";
export const isLifestyle = (it: Pick<SnippetItem, "kind">): boolean => it.kind === "lifestyle";

/** ข้อความที่พิมพ์เอง (บรรทัดละข้อ) → บรรทัด Lifestyle · อังกฤษจับคู่ตามลำดับบรรทัด (ขาด = ไม่มีอังกฤษ) */
export function freeLines(th: string, en: string): { th: string; en: string | null }[] {
  const t = th.split(/\r?\n/).map((x) => x.replace(/^\s*[-•]\s*/, "").trim());
  const e = en.split(/\r?\n/).map((x) => x.replace(/^\s*[-•]\s*/, "").trim());
  return t.flatMap((x, i) => (x ? [{ th: x, en: e[i] || null }] : []));
}

/** prompt ถาม ChatGPT ให้คิดข้อความ Lifestyle (คัดลอกไปวาง) */
export function lifestylePrompt(o: { product?: string | null; style?: { name: string; name_en?: string | null } | null; examples?: string[]; description?: string | null; count?: number }): string {
  const n = o.count ?? 10;
  const lines = [
    `ช่วยคิดข้อความไลฟ์สไตล์สั้น ๆ สำหรับใส่ในคำอธิบายสินค้า ${n} ข้อ (บรรทัดละ 1 ข้อ ขึ้นต้นด้วย "- ")`,
    o.product ? `สินค้า: ${o.product}` : "",
    o.style ? `สไตล์: ${o.style.name}${o.style.name_en ? ` (${o.style.name_en})` : ""}` : "สไตล์: (ตามความเหมาะสมของสินค้า)",
    o.examples?.length ? `ตัวอย่างโทนที่ใช้อยู่:\n${o.examples.slice(0, 5).map((x) => `- ${x}`).join("\n")}` : "",
    o.description?.trim() ? `คำอธิบายสินค้าตอนนี้:\n"""\n${o.description.trim().slice(0, 1500)}\n"""` : "",
    "ขอภาษาไทยเป็นกันเอง สั้น กระชับ ไม่เกิน 1 บรรทัดต่อข้อ ไม่ซ้ำกับตัวอย่าง",
    "แล้วตามด้วยคำแปลภาษาอังกฤษของทุกข้อ เรียงลำดับเดียวกัน (หัวข้อ English)",
  ];
  return lines.filter(Boolean).join("\n\n");
}

/** ข้อความสำเร็จรูป · อังกฤษไม่มี = null (ข้ามบรรทัดนั้นในฝั่งอังกฤษ) */
export function phraseText(it: SnippetItem, lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  const s = clean(lang === "en" ? it.name_en : it.name);
  if (!s) return null;
  return lang === "th" ? thWithEn(s, it.name_en, tpl.enInBrackets.phrase) : s;
}

/** ช่อง + ตัวเลข → "ช่องใส่บัตรเครดิต 6 ช่อง" / "6 card slots" · อังกฤษไม่มีชื่อ/รูปแบบ = null · วงเล็บ = "ช่องหลัก (Main compartment) 2 ช่อง" */
export function slotText(it: SnippetItem, n: number, lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  if (!(n > 0)) return null;
  if (lang === "th") return fill(clean(it.template) || DEFAULT_SLOT_TEMPLATE, thWithEn(clean(it.name), it.name_en, tpl.enInBrackets.slot), n) || null;
  const tplEn = clean(it.template_en);
  const name = clean(it.name_en);
  if (!tplEn && !name) return null;
  if (!tplEn) return fill(DEFAULT_SLOT_TEMPLATE_EN, name, n);
  if (tplEn.includes("{name}") && !name) return null;
  return countEn(tplEn, fill(tplEn.replace(/\{s\}/g, n === 1 ? "" : "s"), name, n), n);
}

/** อังกฤษ 1 ชิ้น = เอกพจน์: "{n} bill compartments" + 1 → "1 bill compartment" (ใส่ {s} ในรูปแบบ = คุมเอง) */
function countEn(tplEn: string, s: string, n: number): string {
  if (n !== 1 || tplEn.includes("{s}") || !tplEn.includes("{n}")) return s;
  return s.replace(/([A-Za-z]+)$/, (w) => (/(ches|shes|sses|xes|zes)$/i.test(w) ? w.slice(0, -2) : /[^su]s$/i.test(w) ? w.slice(0, -1) : w));
}

/** หลายช่องรวมบรรทัดเดียว "ช่องหลัก 2 ช่อง, ช่องซิป 2 ช่อง และ ช่องใส่บัตร 1 ช่อง" · อังกฤษขาดตัวไหน = null ทั้งบรรทัด */
export function slotLine(picks: { item: SnippetItem; n: number }[], lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES, kind: "slot" | "slot_in" | "slot_out" = "slot"): string | null {
  const used = picks.filter((p) => p.n > 0);
  if (!used.length) return null;
  const parts = used.map((p) => slotText(p.item, p.n, lang, tpl));
  if (parts.some((x) => !x)) return null;
  return withLead(lead(tpl, kind, lang), joinList(parts as string[], lang, tpl));
}

/** แยกช่องตามตำแหน่ง → กลุ่มบรรทัด: ด้านนอก → ด้านใน → ไม่ระบุ (เรียงเหมือนแท็บช่องในป๊อป) */
export function slotGroups<T extends { item: SnippetItem; n: number }>(picks: T[]): { kind: "slot_in" | "slot_out" | "slot"; picks: T[] }[] {
  const by = (s: string | null) => picks.filter((p) => (p.item.slot_side === "inside" ? "inside" : p.item.slot_side === "outside" ? "outside" : null) === s);
  return [
    { kind: "slot_out" as const, picks: by("outside") },
    { kind: "slot_in" as const, picks: by("inside") },
    { kind: "slot" as const, picks: by(null) },
  ].filter((g) => g.picks.some((p) => p.n > 0));
}

/** วัสดุหลายตัวรวมบรรทัดเดียว "วัสดุ: A และ B" / "Material: A and B" · อังกฤษขาดชื่อ = null */
export function materialLine(mats: MaterialPick[], lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  if (!mats.length) return null;
  const names = mats.map((m) => clean(lang === "en" ? m.name_en : m.name));
  if (names.some((x) => !x)) return null;
  const shown = lang === "th" ? mats.map((m, i) => thWithEn(names[i], m.name_en, tpl.enInBrackets.material)) : names;
  // คำนำหน้าค่าเริ่มต้น + หลายตัว = พหูพจน์ (Materials:)
  const pre = lead(tpl, "material", lang);
  const pre2 = lang === "en" && pre === "Material:" && mats.length > 1 ? "Materials:" : pre;
  return withLead(pre2, joinList(shown, lang, tpl));
}

const pos = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const cmU = (lang: Lang) => (lang === "en" ? "cm" : "ซม.");

export type SizeInput = { w?: unknown; h?: unknown; d?: unknown };

/** ขนาด กว้าง × สูง × หนา (ช่องที่ว่าง/0 ข้าม) · ไม่มีเลย = null */
export function sizeLine(s: SizeInput, lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  const en = lang === "en";
  const parts: [string, number][] = [
    [en ? "W" : "กว้าง", pos(s.w)],
    [en ? "H" : "สูง", pos(s.h)],
    [en ? "D" : "หนา", pos(s.d)],
  ];
  const used = parts.filter(([, v]) => v > 0);
  if (!used.length) return null;
  return withLead(lead(tpl, "size", lang), `${used.map(([l, v]) => `${l} ${v}`).join(" × ")} ${cmU(lang)}`);
}

/** น้ำหนัก (กรัม) · 0/ว่าง = null */
export function weightLine(g: unknown, lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  const n = pos(g);
  if (!n) return null;
  return withLead(lead(tpl, "weight", lang), `${n.toLocaleString("en-US")} ${lang === "en" ? "g" : "กรัม"}`);
}

/** ความสูงหูหิ้ว (ซม.) · 0/ว่าง = null */
export function handleLine(cm: unknown, lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  const n = pos(cm);
  return n ? withLead(lead(tpl, "handle", lang), `${n} ${cmU(lang)}`) : null;
}

/** ความยาวสายสะพาย — มีทั้งสั้น/ยาว (ยาวกว่า) = ช่วง "100–120 ซม. (ปรับได้)" · มีค่าเดียว = ค่านั้น */
export function strapLine(min: unknown, max: unknown, lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  const a = pos(min);
  const b = pos(max);
  const body = a && b && b > a ? `${a}–${b} ${cmU(lang)} ${lang === "en" ? "(adjustable)" : "(ปรับได้)"}` : a || b ? `${a || b} ${cmU(lang)}` : "";
  return body ? withLead(lead(tpl, "strap", lang), body) : null;
}

export type FitEntry = { th: string; en?: string | null; size?: string | null };

/** ใส่อะไรได้ → "ใส่ได้: iPad (11 นิ้ว) และ เอกสาร A4" · อังกฤษขาดชื่อตัวไหน = null ทั้งบรรทัด · ไม่มี = null */
export function fitLine(entries: FitEntry[], lang: Lang, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): string | null {
  const xs = entries.filter((e) => clean(e.th));
  if (!xs.length) return null;
  if (lang === "en" && xs.some((e) => !clean(e.en))) return null;
  const names = xs.map((e) => {
    const size = clean(e.size);
    if (lang === "en") return size ? `${clean(e.en)} (${fitSizeEn(size)})` : clean(e.en);
    const n = thWithEn(clean(e.th), e.en, tpl.enInBrackets.fit);
    return size ? `${n} (${size})` : n;
  });
  return withLead(lead(tpl, "fit", lang), joinList(names, lang, tpl));
}

/* ─────────── กันใส่ซ้ำ ─────────── */

const DUP_WORDS: Record<LineKind, string[]> = {
  material: ["วัสดุ"],
  slot: [],
  slot_in: ["ด้านใน"],
  slot_out: ["ด้านนอก"],
  fit: ["ใส่ได้"],
  size: ["ขนาด"],
  weight: ["น้ำหนัก"],
  handle: ["หูหิ้ว"],
  strap: ["สายสะพาย"],
};

/** คำอธิบายมีเรื่องนี้อยู่แล้วไหม (เช่น มีบรรทัด "ความยาวสายสะพาย 35 cm." อยู่แล้ว) → เตือน "อาจซ้ำ" */
export function alreadyMentions(text: string | null | undefined, kind: LineKind, tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  const pre = tpl.prefix[kind].th.replace(/[:：]\s*$/, "").trim();
  const words = [...DUP_WORDS[kind], ...(pre ? [pre] : [])];
  return words.some((w) => w && t.includes(w));
}

/* ─────────── ประกอบ / แทรก ─────────── */

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

/** เลือกอะไรไว้บ้าง → บรรทัดที่จะแทรก (ไทย + อังกฤษ) เรียงตาม tpl.order (ตั้งต้น: ข้อความ → วัสดุ → ช่อง → ขนาด → น้ำหนัก → หูหิ้ว → สาย → ใส่ได้) */
export function composeLines(
  sel: {
    phrases: SnippetItem[];
    materials: MaterialPick[];
    slots: { item: SnippetItem; n: number }[];
    size?: SizeInput | null;
    weight?: unknown;
    handle?: unknown;
    strap?: { min?: unknown; max?: unknown } | null;
    fits?: FitEntry[] | null;
    /** 🌿 Lifestyle / อื่นๆ — บรรทัดละข้อ (ข้อความของสไตล์ + พิมพ์เอง) */
    lifestyle?: { th: string; en: string | null }[] | null;
  },
  tpl: InsertTemplates = DEFAULT_INSERT_TEMPLATES
): { th: string[]; en: string[]; enMissing: number; pairs: { th: string; en: string | null }[] } {
  const th: string[] = [];
  const en: string[] = [];
  const pairs: { th: string; en: string | null }[] = [];
  let enMissing = 0;
  const push = (t: string | null, e: string | null) => {
    if (!t) return;
    th.push(withPrefix(t));
    pairs.push({ th: withPrefix(t), en: e ? withPrefix(e) : null });
    if (e) en.push(withPrefix(e));
    else enMissing += 1;
  };
  const slots = new Map(slotGroups(sel.slots).map((g) => [g.kind, g.picks]));
  const emit: Record<OrderKind, () => void> = {
    phrase: () => { for (const p of sel.phrases) push(phraseText(p, "th", tpl), phraseText(p, "en", tpl)); },
    material: () => push(materialLine(sel.materials, "th", tpl), materialLine(sel.materials, "en", tpl)),
    slot_out: () => { const g = slots.get("slot_out"); if (g) push(slotLine(g, "th", tpl, "slot_out"), slotLine(g, "en", tpl, "slot_out")); },
    slot_in: () => { const g = slots.get("slot_in"); if (g) push(slotLine(g, "th", tpl, "slot_in"), slotLine(g, "en", tpl, "slot_in")); },
    slot: () => { const g = slots.get("slot"); if (g) push(slotLine(g, "th", tpl, "slot"), slotLine(g, "en", tpl, "slot")); },
    size: () => { if (sel.size) push(sizeLine(sel.size, "th", tpl), sizeLine(sel.size, "en", tpl)); },
    weight: () => { if (sel.weight != null) push(weightLine(sel.weight, "th", tpl), weightLine(sel.weight, "en", tpl)); },
    handle: () => { if (sel.handle != null) push(handleLine(sel.handle, "th", tpl), handleLine(sel.handle, "en", tpl)); },
    strap: () => { if (sel.strap) push(strapLine(sel.strap.min, sel.strap.max, "th", tpl), strapLine(sel.strap.min, sel.strap.max, "en", tpl)); },
    fit: () => { if (sel.fits?.length) push(fitLine(sel.fits, "th", tpl), fitLine(sel.fits, "en", tpl)); },
    lifestyle: () => { for (const l of sel.lifestyle ?? []) push(clean(l.th) || null, clean(l.en) || null); },
  };
  for (const k of normalizeLineOrder(tpl.order)) emit[k]();
  return { th, en, enMissing, pairs };
}

/* ─────────── ⠿ จัดลำดับทุกบรรทัดในตัวอย่าง (บรรทัดเดิม + บรรทัดใหม่) ─────────── */

/** แถวในตัวอย่าง: "o:<เลขบรรทัดเดิม>" หรือ "n:<ข้อความไทยของบรรทัดใหม่ (ก่อนแก้)>" */
export type RowKey = string;
export const oldRowKey = (i: number): RowKey => `o:${i}`;
export const newRowKey = (th: string): RowKey => `n:${th}`;
export const isNewRow = (k: RowKey) => k.startsWith("n:");
export const oldRowIndex = (k: RowKey) => (k.startsWith("o:") ? Number(k.slice(2)) : -1);

/**
 * ลำดับแถวที่โชว์/บันทึก
 *   custom = null (ยังไม่เคยลาก) → บรรทัดเดิมตามเดิม + บรรทัดใหม่เป็นก้อนเดียวที่ตำแหน่ง at
 *   custom = ลำดับที่ลากไว้ → ตามนั้น (บรรทัดใหม่ที่ไม่ได้เลือกแล้วหายไป · ที่เพิ่งเลือกเพิ่ม ต่อท้ายบรรทัดใหม่ตัวสุดท้าย
 *            ถ้ายังไม่มีบรรทัดใหม่ในลำดับ = วางที่ตำแหน่ง at)
 */
export function arrangeRows(oldCount: number, newKeys: RowKey[], at: number, custom: RowKey[] | null): RowKey[] {
  const olds = Array.from({ length: oldCount }, (_, i) => oldRowKey(i));
  const pos = Math.max(0, Math.min(Number.isFinite(at) ? Math.floor(at) : oldCount, oldCount));
  if (!custom) return [...olds.slice(0, pos), ...newKeys, ...olds.slice(pos)];
  const wantNew = new Set(newKeys);
  const seen = new Set<RowKey>();
  const rows = custom.filter((k) => {
    if (seen.has(k)) return false;
    const ok = isNewRow(k) ? wantNew.has(k) : oldRowIndex(k) >= 0 && oldRowIndex(k) < oldCount;
    if (ok) seen.add(k);
    return ok;
  });
  for (const k of olds) if (!seen.has(k)) rows.push(k);
  const missing = newKeys.filter((k) => !seen.has(k));
  if (missing.length) {
    let lastNew = -1;
    rows.forEach((k, i) => {
      if (isNewRow(k)) lastNew = i;
    });
    const ins = lastNew >= 0 ? lastNew + 1 : (() => {
      const i = rows.findIndex((k) => !isNewRow(k) && oldRowIndex(k) >= pos);
      return i < 0 ? rows.length : i;
    })();
    rows.splice(ins, 0, ...missing);
  }
  return rows;
}

/** ย้ายบรรทัดใหม่ทั้งหมดเป็นก้อนเดียว ไปไว้หลังบรรทัดเดิม oldBefore บรรทัดแรก (ตามลำดับที่โชว์อยู่) — ปุ่มบนสุด/ท้ายสุด/คลิกระหว่างบรรทัด */
export function moveNewBlock(rows: RowKey[], oldBefore: number): RowKey[] {
  const news = rows.filter(isNewRow);
  const olds = rows.filter((k) => !isNewRow(k));
  const i = Math.max(0, Math.min(oldBefore, olds.length));
  return [...olds.slice(0, i), ...news, ...olds.slice(i)];
}

/** บรรทัดใหม่อยู่ติดกันเป็นก้อน → มีบรรทัดเดิมอยู่ก่อนกี่บรรทัด (ไม่ติดกัน/ไม่มีบรรทัดใหม่ = null) */
export function newBlockAt(rows: RowKey[]): number | null {
  const idx = rows.map((k, i) => (isNewRow(k) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length || idx[idx.length - 1] - idx[0] !== idx.length - 1) return null;
  return idx[0];
}

/** ลากบรรทัดเดิมสลับกันแล้วหรือยัง (บรรทัดเดิมไม่เรียง 0,1,2… = จัดใหม่) */
export function oldRowsMoved(rows: RowKey[]): boolean {
  let prev = -1;
  for (const k of rows) {
    const i = oldRowIndex(k);
    if (i < 0) continue;
    if (i < prev) return true;
    prev = i;
  }
  return false;
}

/** ประกอบข้อความไทยตามลำดับแถว — บรรทัดใหม่ใช้ข้อความ (แก้แล้ว) จาก newText · ว่าง = ไม่ใส่ */
export function arrangeTh(rows: RowKey[], oldLines: string[], newText: (k: RowKey) => string | null): string[] {
  return rows.flatMap((k) => {
    if (!isNewRow(k)) return [oldLines[oldRowIndex(k)] ?? ""];
    const t = newText(k);
    return t && t.trim() ? [t] : [];
  });
}

/**
 * ประกอบข้อความอังกฤษ — กติกาเดียวกับ enInsertAt:
 *   บรรทัดอังกฤษเท่าไทย (แปลบรรทัดต่อบรรทัด) → เรียงตามลำดับเดียวกับไทย (บรรทัดเดิมที่ลากสลับ ฝั่งอังกฤษสลับตาม)
 *   ไม่เท่า → บรรทัดอังกฤษเดิมคงที่ + บรรทัดใหม่ต่อท้าย (ตามลำดับในไทย)
 * newText = null ทุกตัว (ไม่ใส่อังกฤษ) → ได้แค่บรรทัดเดิม
 */
export function arrangeEn(rows: RowKey[], thOld: string[], enOld: string[], newText: (k: RowKey) => string | null): string[] {
  const neu = (k: RowKey) => {
    const t = newText(k);
    return t && t.trim() ? [t] : [];
  };
  if (enOld.length === thOld.length) return rows.flatMap((k) => (isNewRow(k) ? neu(k) : [enOld[oldRowIndex(k)] ?? ""]));
  return [...enOld, ...rows.filter(isNewRow).flatMap(neu)];
}
