// ============================================================
// ai-draft-setup — แกนกลาง (pure · เทสต์ได้) ของป๊อป "✨ ให้ AI ร่างรายละเอียดสินค้า" แบบ 5 ขั้น
//   (เจ้าของเลือก 2026-11-25: Theme = ชุดแม่แบบ · รูปข้างซ้ายทุกขั้น · ตั้งค่าหัวข้อในขั้น 2)
//
//   ① ชุดแม่แบบ (Theme) = ลำดับหัวข้อ + รูปแบบ Description · เก็บที่ ui_config key "ai_desc_templates"
//      ตั้งค่าเริ่มต้นต่อแบรนด์ได้ (brand_default) · ใช้ทั้งหน้าเว็บ (เลือก) และหลังบ้าน (เขียนคำสั่ง AI)
//   ② ค่าตั้งเพิ่มของ "กฎตามประเภทสินค้า" (erp_ai_product_rules.extras)
//      highlights = รายการจุดเด่นให้ติ๊ก · manual_required = ช่องกรอกมือที่บังคับ · optional_topics = หัวข้อที่ไม่บังคับ
//   ③ เลือกกล่องไปรษณีย์เล็กสุดที่ใส่ได้ (parcel_sizes)
//   ④ ใส่อะไรได้บ้าง — คิดจากขนาดสินค้า (product_fit_items + lib/fit-check)
// ============================================================

import { fitInto, fitTargetOf } from "@/lib/fit-check";
import { fitSizeOptions, parseSizeDims } from "@/lib/product-fits";

// ── ① ชุดแม่แบบ ─────────────────────────────────────────────
export const DRAFT_SETUP_KEY = "ai_desc_templates";

export type DescTemplate = {
  id: string;
  name: string;
  /** หัวข้อ Description เรียงตามลำดับ (AI ต้องเรียงตามนี้ · หัวข้อที่ไม่มีข้อมูลให้ตัดทิ้ง) */
  headings: string[];
  /** รูปแบบการเขียน เช่น "ใช้ • นำหน้าแต่ละข้อ · หัวข้อตัวหนา" */
  format: string;
  /** ลบแบบเก็บไว้ก่อน (ถังขยะ) — ไม่โชว์ให้เลือก แต่กู้คืนได้ */
  archived?: boolean;
};
export type DraftSetup = {
  templates: DescTemplate[];
  brand_default: Record<string, string>;
  /** ตัวเลือกประกันใน dropdown ขั้นกรอกมือ (ตั้งได้ · ยังไม่ตั้ง = ค่าที่ใช้จริงในระบบ) */
  warranty_options: string[];
};

/** ค่าประกันที่ใช้จริงในระบบ (นับจาก parent_skus_v2 · 2026-11-25) เรียงจากใช้บ่อย */
export const DEFAULT_WARRANTY_OPTIONS = ["1 เดือน", "2 ปี", "ไม่มีรับประกัน", "1 ปี", "6 เดือน", "7 วัน", "3 ปี", "3 เดือน"];

export const DEFAULT_TEMPLATES: DescTemplate[] = [
  { id: "bag", name: "แม่แบบกระเป๋า", headings: ["จุดเด่น", "วัสดุ", "ช่อง", "ขนาด", "ใส่อะไรได้", "การดูแล"], format: "บรรทัดละ 1 ข้อ ขึ้นต้นด้วย '- ' · ขึ้นต้นบรรทัดด้วยชื่อหัวข้อตามด้วย ':'" },
  { id: "short", name: "สั้น ขายไว", headings: ["จุดเด่น 3 ข้อ", "ขนาด", "ประกัน"], format: "สั้นที่สุด บรรทัดละ 1 ข้อ ขึ้นต้นด้วย '- ' ไม่เกิน 6 บรรทัด" },
  { id: "story", name: "เล่าเรื่อง", headings: ["ย่อหน้าเปิด", "จุดเด่น", "สเปค"], format: "เปิดด้วยย่อหน้าสั้น 1-2 ประโยค แล้วตามด้วยรายการ '- '" },
];

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const strList = (v: unknown, maxItems = 20, maxLen = 120): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(x, maxLen)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, maxItems);

/** ตรวจ/ทำความสะอาดแม่แบบ 1 ตัว (ใช้ทั้งตอนอ่าน ui_config และตอนหลังบ้านรับจากป๊อป) */
export function cleanTemplate(raw: unknown): DescTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 80);
  const headings = strList(r.headings, 15, 80);
  if (!name || headings.length === 0) return null;
  return { id: str(r.id, 60) || name, name, headings, format: str(r.format, 400), ...(r.archived === true ? { archived: true } : {}) };
}

export function normalizeSetup(raw: unknown): DraftSetup {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (Array.isArray(r.templates) ? r.templates : []).map(cleanTemplate).filter((t): t is DescTemplate => !!t);
  const seen = new Set<string>();
  const templates = (list.length ? list : DEFAULT_TEMPLATES).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  const bd = (r.brand_default && typeof r.brand_default === "object" ? r.brand_default : {}) as Record<string, unknown>;
  const brand_default: Record<string, string> = {};
  for (const [k, v] of Object.entries(bd)) if (k && typeof v === "string" && templates.some((t) => t.id === v)) brand_default[k] = v;
  const wo = strList(r.warranty_options, 30, 80);
  return { templates, brand_default, warranty_options: wo.length ? wo : DEFAULT_WARRANTY_OPTIONS };
}

/** แม่แบบที่ใช้ได้ (ไม่อยู่ถังขยะ) */
export const liveTemplates = (s: DraftSetup) => s.templates.filter((t) => !t.archived);

/** แม่แบบเริ่มต้นของแบรนด์ (ไม่ตั้ง = ตัวแรกที่ใช้ได้) */
export function templateFor(s: DraftSetup, brandId: string | null | undefined): DescTemplate | null {
  const live = liveTemplates(s);
  const byBrand = brandId ? live.find((t) => t.id === s.brand_default[brandId]) : undefined;
  return byBrand ?? live[0] ?? null;
}

/** คำสั่งให้ AI จากแม่แบบ (หลังบ้านเอาไปต่อท้าย prompt) */
export function templateInstruction(t: DescTemplate): string {
  return [
    `ชุดแม่แบบ "${t.name}" — Description ต้องเรียงหัวข้อตามลำดับนี้เท่านั้น (หัวข้อที่ไม่มีข้อมูลให้ตัดทิ้ง ห้ามแต่ง):`,
    ...t.headings.map((h, i) => `${i + 1}. ${h}`),
    t.format ? `รูปแบบการเขียน: ${t.format}` : "",
    "English Description ต้องเรียงหัวข้อแบบเดียวกัน (แปลชื่อหัวข้อเป็นอังกฤษ)",
  ].filter(Boolean).join("\n");
}

// ── ② ค่าตั้งเพิ่มของกฎ ─────────────────────────────────────
/** ช่องที่กรอกเองในขั้นสุดท้าย (AI ไม่เดา) — ref = เลือกจากรายการ master */
export const MANUAL_FIELDS: { key: string; label: string; en: string; kind: "text" | "ref"; entity?: string }[] = [
  { key: "warranty", label: "ประกัน", en: "Warranty", kind: "text" },
  { key: "custom_size", label: "Custom size", en: "Custom size", kind: "text" },
  { key: "size_description_id", label: "Size description", en: "Size description", kind: "ref", entity: "size_descriptions" },
  { key: "special_description_id", label: "Special description", en: "Special description", kind: "ref", entity: "special_descriptions" },
];
const MANUAL_KEYS = MANUAL_FIELDS.map((f) => f.key);

export type RuleExtras = {
  highlights: string[]; manual_required: string[]; optional_topics: string[];
  /** ชนิดช่องที่โชว์ในขั้น 2 (id ของ product_highlight_items ชนิด slot) · ว่าง = โชว์ทุกชนิด */
  slot_ids: string[];
};

export function normalizeExtras(raw: unknown): RuleExtras {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    highlights: strList(r.highlights, 30, 120),
    manual_required: strList(r.manual_required, 10, 60).filter((k) => MANUAL_KEYS.includes(k)),
    optional_topics: strList(r.optional_topics, 30, 200),
    slot_ids: strList(r.slot_ids, 60, 60),
  };
}

/** รวมค่าตั้งของหลายกฎที่สินค้าเข้า (ไม่ซ้ำ) */
export function mergeExtras(list: unknown[]): RuleExtras {
  const out: RuleExtras = { highlights: [], manual_required: [], optional_topics: [], slot_ids: [] };
  for (const x of list.map(normalizeExtras)) {
    for (const k of ["highlights", "manual_required", "optional_topics", "slot_ids"] as const)
      for (const v of x[k]) if (!out[k].includes(v)) out[k].push(v);
  }
  return out;
}

/** จุดเด่นให้เลือก: ชุดของประเภทสินค้า · ประเภทยังไม่ได้ตั้ง = คลังประโยคกลาง (เจ้าของเลือก 2026-11-25) */
export function highlightChoices(extras: Pick<RuleExtras, "highlights">, central: string[]): { list: string[]; fromType: boolean } {
  return extras.highlights.length ? { list: extras.highlights, fromType: true } : { list: [...new Set(central.map((x) => x.trim()).filter(Boolean))], fromType: false };
}

/** ชนิดช่องที่โชว์: เฉพาะที่ประเภทตั้งไว้ (+ ที่ใส่จำนวนไว้แล้ว ไม่ให้หาย) · ไม่ได้ตั้ง/กดดูทั้งหมด = ทุกชนิด */
export function visibleSlots<T extends { id: string }>(items: T[], slotIds: string[], counts: Record<string, number>, showAll: boolean): T[] {
  if (showAll || slotIds.length === 0) return items;
  return items.filter((x) => slotIds.includes(x.id) || (counts[x.id] ?? 0) > 0);
}

const blank = (v: unknown) => { const s = String(v ?? "").trim(); return !s || s === "-" || s === "—"; };

/** หัวข้อบังคับที่ยังไม่ตอบ (หัวข้อใน optional = ไม่บังคับ) */
export function missingTopics(topics: { th: string }[], answers: Record<string, string>, optional: string[] = []): string[] {
  return topics.filter((t) => !optional.includes(t.th) && blank(answers[t.th])).map((t) => t.th);
}

/** ช่องกรอกมือที่บังคับแต่ยังว่าง */
export function missingManual(required: string[], values: Record<string, unknown>): string[] {
  return required.filter((k) => blank(values[k]));
}

// ── ③ กล่องไปรษณีย์ ─────────────────────────────────────────
export type ParcelBox = { id: string; name: string; width_cm: unknown; length_cm: unknown; height_cm: unknown; size_text?: string | null; is_active?: boolean | null };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * กล่องเล็กสุด (ปริมาตรน้อยสุด) ที่ใส่สินค้าได้ — หมุนสินค้าได้ (เทียบด้านยาวสุดกับยาวสุด)
 * ขนาดสินค้าไม่ครบ 3 ด้าน = null (ยังเลือกให้ไม่ได้)
 */
export function pickParcelBox(dims: { w: unknown; h: unknown; d: unknown }, boxes: ParcelBox[]): ParcelBox | null {
  const p = [num(dims.w), num(dims.h), num(dims.d)];
  if (p.some((x) => !x)) return null;
  p.sort((a, b) => b - a);
  let best: ParcelBox | null = null; let bestVol = Infinity;
  for (const b of boxes) {
    if (b.is_active === false) continue;
    const s = [num(b.width_cm), num(b.length_cm), num(b.height_cm)];
    if (s.some((x) => !x)) continue;
    s.sort((a, c) => c - a);
    if (p[0] > s[0] || p[1] > s[1] || p[2] > s[2]) continue;
    const vol = s[0] * s[1] * s[2];
    if (vol < bestVol) { bestVol = vol; best = b; }
  }
  return best;
}

// ── ④ ใส่อะไรได้บ้าง (จากขนาด) ─────────────────────────────
export type FitCatalogRow = {
  id: string; name: string; name_en?: string | null; sizes?: string | null; size_dims?: unknown;
  width_cm?: unknown; height_cm?: unknown; depth_cm?: unknown; is_soft?: unknown; is_active?: unknown; kind?: unknown; squeeze_pct?: unknown;
};
export type FitSuggestion = { id: string; name: string; size: string | null; fits: boolean };

/**
 * ของในคลัง "ใส่อะไรได้" ชิ้นไหนใส่สินค้านี้ได้ — ใช้ขนาดด้านนอกของสินค้าเป็นค่าประมาณช่องด้านใน
 *   ของที่มีหลายขนาด (size_dims) → เลือกขนาดใหญ่สุดที่ใส่ได้ · ใส่ไม่ได้สักขนาด = fits:false (ขนาดเล็กสุด)
 *   ของที่ยังไม่มีขนาด = ไม่อยู่ในรายการ (คิดให้ไม่ได้)
 */
export function fitsFromSize(dims: { w: unknown; h: unknown; d: unknown }, rows: FitCatalogRow[]): FitSuggestion[] {
  const comp = { w: num(dims.w), h: num(dims.h), d: num(dims.d) };
  if (!comp.w || !comp.h || !comp.d) return [];
  const out: FitSuggestion[] = [];
  for (const r of rows) {
    if (r.is_active === false) continue;
    const sizeMap = parseSizeDims(r.size_dims);
    const sizes = fitSizeOptions(r).filter((s) => sizeMap[s]);
    if (sizes.length) {
      const ok = sizes.filter((s) => {
        const t = fitTargetOf({ ...r, width_cm: sizeMap[s].w, height_cm: sizeMap[s].h, depth_cm: sizeMap[s].d });
        return !!t && !!fitInto(t, comp);
      });
      out.push({ id: r.id, name: r.name, size: ok.length ? ok[ok.length - 1] : sizes[0], fits: ok.length > 0 });
      continue;
    }
    const t = fitTargetOf(r);
    if (!t) continue;
    out.push({ id: r.id, name: r.name, size: null, fits: !!fitInto(t, comp) });
  }
  return out;
}

// ── ⑤ AI ช่วยคิดการตั้งค่าประเภทสินค้า (/api/ai/tag-setup) ───────────────
export type TagSetupTopic = { th: string; en: string; options: string[] };
export type TagSetup = { name_en: string; group_id: string; topics: TagSetupTopic[]; highlights: string[]; slot_ids: string[]; manual_required: string[] };

/** ผลจาก AI → เก็บเฉพาะค่าที่ใช้ได้ (id ต้องอยู่ในรายการจริง · ตัดซ้ำ · จำกัดจำนวน) */
export function sanitizeTagSetup(raw: unknown, allow: { groupIds: string[]; slotIds: string[] }): TagSetup {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const topics = (Array.isArray(r.topics) ? r.topics : []).map((x) => {
    const t = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return { th: str(t.th, 120), en: str(t.en, 120), options: strList(t.options, 6, 40) };
  }).filter((t) => t.th).filter((t, i, a) => a.findIndex((y) => y.th === t.th) === i).slice(0, 8);
  const gid = str(r.group_id, 60);
  return {
    name_en: str(r.name_en, 80),
    group_id: allow.groupIds.includes(gid) ? gid : "",
    topics,
    highlights: strList(r.highlights, 12, 60),
    slot_ids: strList(r.slot_ids, 30, 60).filter((id) => allow.slotIds.includes(id)),
    manual_required: strList(r.manual_required, 10, 60).filter((k) => MANUAL_KEYS.includes(k)),
  };
}

/** หัวข้อ ⇄ ข้อความในช่อง "หัวข้อ: ตัวเลือก1, ตัวเลือก2" (บรรทัดละข้อ) */
export const topicsToText = (topics: TagSetupTopic[]): string =>
  topics.map((t) => (t.options.length ? `${t.th}: ${t.options.join(", ")}` : t.th)).join("\n");

/** เติมเฉพาะช่องที่ยังว่าง (ช่องที่ผู้ใช้กรอกเองแล้ว AI ไม่ทับ) · หัวข้อ/จุดเด่น = ต่อท้ายของเดิมแบบไม่ซ้ำ */
export function fillEmpty<T extends Record<string, unknown>>(cur: T, ai: Partial<T>): { next: T; filled: (keyof T)[] } {
  const next = { ...cur };
  const filled: (keyof T)[] = [];
  for (const k of Object.keys(ai) as (keyof T)[]) {
    const v = ai[k];
    const c = cur[k];
    const empty = c === undefined || c === null || (typeof c === "string" && !c.trim()) || (Array.isArray(c) && c.length === 0);
    const has = v !== undefined && v !== null && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && v.length === 0);
    if (empty && has) { next[k] = v as T[keyof T]; filled.push(k); }
  }
  return { next, filled };
}
