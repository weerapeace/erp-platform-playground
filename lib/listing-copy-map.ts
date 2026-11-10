/**
 * "ลงร้านอื่นจากรายการนี้" — กฎจับคู่ช่อง: ช่องของร้านปลายทาง ← ร้านต้นทาง → Parent SKU → SKU (ของกลาง · pure · มีเทสต์)
 * --------------------------------------------------------------------------
 * เจ้าของอนุมัติเฟส 1 (2026-11-10): ปลายทาง = LINE SHOPPING · ร้านต้นทาง = Lazada / Shopee (ไฟล์) / LINE
 * หลักการ:
 *   - "คัดลอก" = เขียนลงร่างของร้านปลายทาง (platform_listing_drafts) เท่านั้น — ไม่แก้ข้อมูลสินค้าในระบบ
 *     แล้วตัวสร้างสินค้าเดิมของร้าน (LINE: lib/line-create-payload) อ่านร่างไปส่ง → ไม่มีตัวประกอบ payload ตัวที่ 2
 *   - แต่ละช่องเลือกได้: ร้านต้นทาง / ข้อมูลในระบบ / ร่างเดิม (ถ้าเคยแก้ไว้) · ค่าเริ่ม: เคยแก้ไว้ = คงไว้ · ร้านต้นทางมี = ใช้ของร้าน · ไม่งั้นใช้ในระบบ
 *   - หมวด: ไม่แปลงหมวดร้านต่อร้าน — ใช้หมวดกลางของสินค้า → หมวดของร้านปลายทาง (platform_category_mappings)
 *   - ตัวเลือก: LINE สร้างจาก SKU ในระบบเสมอ · ร้านต้นทางให้แค่ราคา (จับด้วยรหัส SKU)
 *   - ราคา: ไม่เขียนเอง — บอกว่าตัวไหน "ในระบบยังว่างแต่ร้านต้นทางมี" (กดเติมลงระบบได้) และตัวไหน "ไม่ตรงกัน"
 *   - สต๊อก: ไม่คัดลอก
 * จำว่าค่าไหนมาจากร้านต้นทาง: ร่าง extra.copied_from { listing_id, platform_name, hash } → หน้าดูก่อนส่งโชว์ "จากร้าน Lazada"
 * ห้าม import "@/..." ที่มีโค้ดฝั่งเซิร์ฟเวอร์ (ใช้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์)
 */
import type { CopySource } from "@/lib/listing-copy-source";

/** ปลายทางที่คัดลอกได้ในเฟสนี้ */
export const COPY_TARGETS = ["line_shopping"] as const;
export type CopyTarget = (typeof COPY_TARGETS)[number];
export const isCopyTarget = (v: unknown): v is CopyTarget => (COPY_TARGETS as readonly string[]).includes(String(v));
/** คัดลอกได้ครั้งละกี่รายการ (Lazada ต้องดึงสดทีละตัว · จำกัดความถี่) */
export const COPY_MAX_ITEMS = 50;
/** รูปสูงสุดของปลายทาง */
export const COPY_MAX_IMAGES: Record<CopyTarget, number> = { line_shopping: 7 };

export type CopyFieldKey = "title" | "description" | "images" | "brand" | "weight";
export type CopyChoice = "source" | "system" | "keep";
export const COPY_FIELD_LABEL: Record<CopyFieldKey, string> = { title: "ชื่อสินค้า", description: "รายละเอียด", images: "รูปสินค้า", brand: "แบรนด์", weight: "น้ำหนัก" };
export const COPY_CHOICE_LABEL: Record<CopyChoice, string> = { source: "ร้านต้นทาง", system: "ข้อมูลในระบบ", keep: "ร่างที่แก้ไว้" };

/** ข้อมูลสินค้าในระบบ (Parent SKU + SKU) */
export type CopySystemSku = { id: string; code: string; fake: number | null; sale: number | null; active: boolean };
export type CopySystem = {
  name: string;               // ชื่อสำหรับแพลตฟอร์ม → ชื่อสินค้า
  altNames: string[];         // ชื่ออื่นที่นับว่า "ข้อมูลในระบบ" (ชื่อไทย/ชื่อแพลตฟอร์ม)
  description: string;        // รายละเอียดสำหรับแพลตฟอร์ม → รายละเอียด
  altDescriptions: string[];
  brand: string;
  weightKg: number;           // 0 = ไม่มี
  imageCount: number;         // รูปในระบบที่ใช้ได้ (ปก + SKU)
  categoryLabel: string | null;   // หมวดของร้านปลายทางจากหมวดกลาง ("{id} · ชื่อ")
  skus: CopySystemSku[];
};
export type CopyDraft = { title: string | null; description: string | null; categoryPath: string | null; extra: Record<string, unknown> };

export type CopyFieldRow = {
  key: CopyFieldKey; label: string; required: boolean;
  /** ค่าแต่ละแหล่ง (ข้อความสั้นไว้โชว์) · null = ไม่มี */
  source: string | null; system: string | null; draft: string | null;
  choices: CopyChoice[];
  /** ตัวที่เลือกอยู่ (สถานะปัจจุบันของร่าง หรือค่าเริ่มถ้ายังไม่เคยคัดลอก) */
  choice: CopyChoice;
  missing: boolean;
  note: string | null;
};
export type CopyPriceRow = {
  sku_id: string; code: string; label: string | null;
  sys_fake: number | null; sys_sale: number | null;
  src_full: number | null; src_sale: number | null;
  /** ที่จะเติมลงระบบเมื่อกด "เติมราคา" (เฉพาะช่องที่ในระบบยังว่าง) */
  fill: { fake_price?: number; list_price?: number };
  conflict: boolean;
};
export type CopyPlan = {
  target: CopyTarget;
  source: { listing_id: string; platform_code: string; platform_name: string; external_id: string | null; title: string; live: boolean; warning: string | null };
  fields: CopyFieldRow[];
  category: { label: string | null; missing: boolean };
  prices: CopyPriceRow[];
  priceFillCount: number;
  priceConflictCount: number;
  variants: { matched: number; source: number; system: number; sourceOnly: string[]; systemOnly: string[] };
  /** ข้อบังคับที่ยังขาด (แดง) */
  missing: string[];
  /** เคยคัดลอกจากรายการนี้ลงร่างแล้ว */
  applied: boolean;
};

const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const norm = (v: unknown) => s(v).replace(/\s+/g, " ");
const short = (v: string, n = 140) => (v.length > n ? `${v.slice(0, n)}…` : v);
const codeKey = (v: unknown) => s(v).toUpperCase();

/** ลายนิ้วมือสั้น ๆ ของค่า (จำว่าค่าในร่างมาจากร้านต้นทางไหม โดยไม่ต้องเก็บข้อความซ้ำ) */
export function copyHash(v: unknown): string {
  const t = Array.isArray(v) ? v.map(s).join("\n") : norm(v);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${t.length.toString(36)}.${(h >>> 0).toString(36)}`;
}

export type CopiedFrom = {
  listing_id: string; platform_code: string; platform_name: string; external_id: string | null;
  at: string; by: string | null;
  /** ช่องที่ใช้ค่าจากร้านต้นทาง → ลายนิ้วมือของค่านั้น */
  hash: Partial<Record<CopyFieldKey, string>>;
};
export function copiedFromOf(extra: Record<string, unknown> | null | undefined): CopiedFrom | null {
  const c = extra && typeof extra === "object" ? (extra as Record<string, unknown>).copied_from : null;
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (!s(o.listing_id)) return null;
  return { listing_id: s(o.listing_id), platform_code: s(o.platform_code), platform_name: s(o.platform_name), external_id: s(o.external_id) || null, at: s(o.at), by: s(o.by) || null, hash: (o.hash && typeof o.hash === "object" ? o.hash : {}) as CopiedFrom["hash"] };
}
/** ค่าในร่างช่องนี้มาจากร้านต้นทางไหม → ชื่อร้าน (ใช้ทำป้าย "มาจาก" ในหน้าดูก่อนส่ง) */
export function copiedLabel(extra: Record<string, unknown> | null | undefined, key: CopyFieldKey, value: unknown): string | null {
  const c = copiedFromOf(extra);
  if (!c || !c.hash[key]) return null;
  const empty = Array.isArray(value) ? value.length === 0 : !norm(value);
  if (empty || c.hash[key] !== copyHash(value)) return null;
  return `จากร้าน ${c.platform_name || c.platform_code}${c.external_id ? ` (#${c.external_id})` : ""}`;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
const kgOf = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : 0; };
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** ค่าของแต่ละช่องจากแต่ละแหล่ง (ใช้ทั้งทำแผนและเขียนร่าง) */
function fieldValues(target: CopyTarget, src: CopySource, sys: CopySystem, draft: CopyDraft) {
  const ex = draft.extra ?? {};
  const maxImg = COPY_MAX_IMAGES[target];
  return {
    title: { src: norm(src.title) || null, sysVals: [sys.name, ...sys.altNames].map(norm).filter(Boolean), draft: norm(draft.title) || null },
    description: { src: s(src.descriptionText) || null, sysVals: [sys.description, ...sys.altDescriptions].map(norm).filter(Boolean), draft: s(draft.description) || null },
    images: { src: src.images.slice(0, maxImg), draft: strList(ex.line_images) },
    brand: { src: s(src.brand) || null, sys: norm(sys.brand) || null, draft: norm(ex.brand) || null },
    weight: { src: kgOf(src.weightKg), sys: kgOf(sys.weightKg), draft: kgOf(ex.weight) },
  };
}

/**
 * สถานะปัจจุบันของร่างแต่ละช่อง: ตรงกับร้านต้นทาง = source · ว่าง/ตรงกับในระบบ = system · อย่างอื่น = keep (คนแก้ไว้)
 */
function currentChoices(target: CopyTarget, src: CopySource, sys: CopySystem, draft: CopyDraft): Record<CopyFieldKey, CopyChoice> {
  const v = fieldValues(target, src, sys, draft);
  const textState = (d: string | null, sv: string | null, sysVals: string[]): CopyChoice =>
    !d ? "system" : sv && norm(d) === norm(sv) ? "source" : sysVals.includes(norm(d)) ? "system" : "keep";
  return {
    title: textState(v.title.draft, v.title.src, v.title.sysVals),
    description: textState(v.description.draft, v.description.src, v.description.sysVals),
    images: v.images.draft.length === 0 ? "system" : v.images.src.length && sameList(v.images.draft, v.images.src) ? "source" : "keep",
    brand: !v.brand.draft ? "system" : v.brand.src && v.brand.draft === norm(v.brand.src) ? "source" : v.brand.draft === v.brand.sys ? "system" : "keep",
    weight: !v.weight.draft ? "system" : v.weight.src && v.weight.draft === v.weight.src ? "source" : v.weight.draft === v.weight.sys ? "system" : "keep",
  };
}

/** แหล่งที่มีค่าให้เลือกได้ต่อช่อง */
function availableChoices(target: CopyTarget, src: CopySource, sys: CopySystem, draft: CopyDraft, cur: Record<CopyFieldKey, CopyChoice>): Record<CopyFieldKey, CopyChoice[]> {
  const v = fieldValues(target, src, sys, draft);
  const has: Record<CopyFieldKey, boolean> = { title: !!v.title.src, description: !!v.description.src, images: v.images.src.length > 0, brand: !!v.brand.src, weight: v.weight.src > 0 };
  const out = {} as Record<CopyFieldKey, CopyChoice[]>;
  for (const k of Object.keys(has) as CopyFieldKey[]) out[k] = [...(has[k] ? ["source" as const] : []), "system" as const, ...(cur[k] === "keep" ? ["keep" as const] : [])];
  return out;
}

/** ค่าเริ่มของแต่ละช่อง (ยังไม่เคยคัดลอกจากรายการนี้): เคยแก้ไว้ = คงไว้ · ร้านต้นทางมี = ใช้ของร้าน · ไม่งั้นในระบบ */
export function defaultCopyChoices(target: CopyTarget, src: CopySource, sys: CopySystem, draft: CopyDraft): Record<CopyFieldKey, CopyChoice> {
  const cur = currentChoices(target, src, sys, draft);
  const avail = availableChoices(target, src, sys, draft, cur);
  const out = {} as Record<CopyFieldKey, CopyChoice>;
  for (const k of Object.keys(cur) as CopyFieldKey[]) out[k] = cur[k] === "keep" ? "keep" : avail[k].includes("source") ? "source" : cur[k];
  return out;
}

/** ราคาที่ใช้จริงของ SKU ขาย: ตัวขายไม่มี → ตัวสี (รหัสฐาน เช่น WK42-01 ของ WK42-01D) · กติกาเดียวกับ lib/line-create-payload */
export function sellableWithPrices(skus: CopySystemSku[]): (CopySystemSku & { effFake: number | null; effSale: number | null })[] {
  const act = skus.filter((x) => x.active);
  const byCode = new Map(act.map((x) => [x.code, x]));
  const baseOf = (code: string): string | null => { const m = code.match(/^(.*\d)[A-Za-z]+$/); return m ? m[1] : null; };
  const masters = new Set<string>();
  for (const x of act) { const b = baseOf(x.code); if (b && byCode.has(b)) masters.add(b); }
  const p = (n: number | null | undefined) => (Number(n) > 0 ? Number(n) : null);
  return act.filter((x) => !masters.has(x.code)).map((x) => {
    const m = (() => { const b = baseOf(x.code); return b ? byCode.get(b) ?? null : null; })();
    return { ...x, effFake: p(x.fake) ?? p(m?.fake), effSale: p(x.sale) ?? p(m?.sale) };
  });
}

/** แผนคัดลอก (หน้าตารางจับคู่) */
export function planCopy(input: { target: CopyTarget; source: CopySource; system: CopySystem; draft: CopyDraft }): CopyPlan {
  const { target, source: src, system: sys, draft } = input;
  const v = fieldValues(target, src, sys, draft);
  const cur = currentChoices(target, src, sys, draft);
  const avail = availableChoices(target, src, sys, draft, cur);
  const copied = copiedFromOf(draft.extra);
  const applied = !!copied && copied.listing_id === src.listingId;
  const choice = applied ? cur : defaultCopyChoices(target, src, sys, draft);

  const fields: CopyFieldRow[] = [
    {
      key: "title", label: COPY_FIELD_LABEL.title, required: true,
      source: v.title.src, system: sys.name ? norm(sys.name) : null, draft: cur.title === "keep" ? v.title.draft : null,
      choices: avail.title, choice: choice.title, missing: false, note: null,
    },
    {
      key: "description", label: COPY_FIELD_LABEL.description, required: false,
      source: v.description.src ? short(v.description.src) : null, system: sys.description ? short(norm(sys.description)) : null,
      draft: cur.description === "keep" && v.description.draft ? short(v.description.draft) : null,
      choices: avail.description, choice: choice.description, missing: false,
      note: v.description.src ? "แปลงเป็นข้อความแล้ว (ไม่เอารูปในรายละเอียด) · LINE จัดย่อหน้าให้" : null,
    },
    {
      key: "images", label: COPY_FIELD_LABEL.images, required: true,
      source: v.images.src.length ? `${v.images.src.length} รูปจากร้าน` : null,
      system: sys.imageCount > 0 ? `รูปในระบบ ${sys.imageCount} รูป (ปก + SKU)` : null,
      draft: cur.images === "keep" ? `${v.images.draft.length} รูปที่เลือกไว้` : null,
      choices: avail.images, choice: choice.images, missing: false,
      note: src.images.length > v.images.src.length ? `ร้านต้นทางมี ${src.images.length} รูป · ${target === "line_shopping" ? "LINE" : "ร้านนี้"} รับ ${COPY_MAX_IMAGES[target]} รูปแรก` : null,
    },
    {
      key: "brand", label: COPY_FIELD_LABEL.brand, required: false,
      source: v.brand.src, system: v.brand.sys, draft: cur.brand === "keep" ? v.brand.draft : null,
      choices: avail.brand, choice: choice.brand, missing: false,
      note: !v.brand.src && src.platformCode === "lazada" ? "ร้านต้นทางเป็น No Brand — ใช้แบรนด์ของสินค้า" : null,
    },
    {
      key: "weight", label: COPY_FIELD_LABEL.weight, required: false,
      source: v.weight.src ? `${v.weight.src} กก.` : null, system: v.weight.sys ? `${v.weight.sys} กก.` : null,
      draft: cur.weight === "keep" ? `${v.weight.draft} กก.` : null,
      choices: avail.weight, choice: choice.weight, missing: false,
      note: !v.weight.src && !v.weight.sys ? "ไม่มีทั้งสองที่ — ไม่ส่ง (LINE ไม่บังคับ)" : null,
    },
  ];
  // ข้อบังคับ: ชื่อ · รูป (ค่าที่เลือกต้องมีจริง)
  const valueOf = (r: CopyFieldRow) => (r.choice === "source" ? r.source : r.choice === "keep" ? r.draft : r.system);
  for (const r of fields) if (r.required && !valueOf(r)) r.missing = true;

  // ราคา: จับตัวเลือกร้านต้นทางกับ SKU ขายในระบบด้วยรหัส
  const sellable = sellableWithPrices(sys.skus);
  const srcBy = new Map(src.variants.filter((x) => x.sku).map((x) => [codeKey(x.sku), x]));
  const prices: CopyPriceRow[] = [];
  for (const k of sellable) {
    const sv = srcBy.get(codeKey(k.code));
    if (!sv) continue;
    const fill: CopyPriceRow["fill"] = {};
    if (k.effFake == null && sv.full != null) fill.fake_price = sv.full;
    if (k.effSale == null && sv.sale != null) fill.list_price = sv.sale;
    const conflict = (k.effFake != null && sv.full != null && k.effFake !== sv.full) || (k.effSale != null && sv.sale != null && k.effSale !== sv.sale);
    prices.push({ sku_id: k.id, code: k.code, label: sv.label || null, sys_fake: k.effFake, sys_sale: k.effSale, src_full: sv.full, src_sale: sv.sale, fill, conflict });
  }
  const sysCodes = new Set(sellable.map((k) => codeKey(k.code)));
  const sourceOnly = src.variants.filter((x) => !x.sku || !sysCodes.has(codeKey(x.sku))).map((x) => x.sku || x.label);
  const systemOnly = sellable.filter((k) => !srcBy.has(codeKey(k.code))).map((k) => k.code);
  const priceMissing = sellable.length === 0 || sellable.every((k) => k.effFake == null && k.effSale == null && !prices.find((p) => p.sku_id === k.id && (p.fill.fake_price || p.fill.list_price)));

  const categoryLabel = s(draft.categoryPath) || sys.categoryLabel || null;
  const missing = [
    ...fields.filter((r) => r.missing).map((r) => r.label),
    ...(!categoryLabel ? ["หมวด LINE"] : []),
    ...(priceMissing ? ["ราคา SKU"] : []),
  ];
  return {
    target,
    source: { listing_id: src.listingId, platform_code: src.platformCode, platform_name: src.platformName, external_id: src.externalId, title: src.title, live: src.live, warning: src.warning },
    fields, category: { label: categoryLabel, missing: !categoryLabel },
    prices, priceFillCount: prices.filter((p) => p.fill.fake_price != null || p.fill.list_price != null).length,
    priceConflictCount: prices.filter((p) => p.conflict).length,
    variants: { matched: prices.length, source: src.variants.length, system: sellable.length, sourceOnly, systemOnly },
    missing, applied,
  };
}

/** แก้ร่างตามที่เลือก → ค่าที่จะเขียนลง platform_listing_drafts (title / description / extra ทั้งก้อน) */
export function applyCopyChoices(input: {
  target: CopyTarget; source: CopySource; system: CopySystem; draft: CopyDraft;
  choices?: Partial<Record<CopyFieldKey, CopyChoice>> | null; by?: string | null; now?: string;
}): { title?: string | null; description?: string | null; extra: Record<string, unknown>; used: Record<CopyFieldKey, CopyChoice> } {
  const { target, source: src, system: sys, draft } = input;
  const v = fieldValues(target, src, sys, draft);
  const cur = currentChoices(target, src, sys, draft);
  const avail = availableChoices(target, src, sys, draft, cur);
  const def = defaultCopyChoices(target, src, sys, draft);
  const used = {} as Record<CopyFieldKey, CopyChoice>;
  for (const k of Object.keys(def) as CopyFieldKey[]) {
    const want = input.choices?.[k];
    used[k] = want && avail[k].includes(want) ? want : def[k];
  }
  const extra: Record<string, unknown> = { ...(draft.extra ?? {}) };
  const out: { title?: string | null; description?: string | null } = {};
  const hash: CopiedFrom["hash"] = {};

  if (used.title === "source") { out.title = v.title.src; hash.title = copyHash(v.title.src); }
  else if (used.title === "system") out.title = null;
  if (used.description === "source") { out.description = v.description.src; hash.description = copyHash(v.description.src); }
  else if (used.description === "system") out.description = null;
  if (used.images === "source") { extra.line_images = v.images.src; hash.images = copyHash(v.images.src); }
  else if (used.images === "system") delete extra.line_images;
  if (used.brand === "source") { extra.brand = v.brand.src; hash.brand = copyHash(v.brand.src); }
  else if (used.brand === "system") extra.brand = v.brand.sys;
  if (used.weight === "source") { extra.weight = v.weight.src; hash.weight = copyHash(String(v.weight.src)); }
  else if (used.weight === "system") delete extra.weight;

  extra.copied_from = {
    listing_id: src.listingId, platform_code: src.platformCode, platform_name: src.platformName, external_id: src.externalId,
    at: input.now ?? new Date().toISOString(), by: input.by ?? null, hash,
  } satisfies CopiedFrom;
  return { ...out, extra, used };
}

/** ราคาที่จะเติมลงระบบ (เฉพาะช่องที่ว่าง) — เลือกเฉพาะบาง SKU ได้ */
export function priceFills(plan: CopyPlan, skuIds?: string[] | null): { sku_id: string; code: string; field: "fake_price" | "list_price"; price: number }[] {
  const pick = skuIds?.length ? new Set(skuIds) : null;
  const out: { sku_id: string; code: string; field: "fake_price" | "list_price"; price: number }[] = [];
  for (const p of plan.prices) {
    if (pick && !pick.has(p.sku_id)) continue;
    if (p.fill.fake_price != null) out.push({ sku_id: p.sku_id, code: p.code, field: "fake_price", price: p.fill.fake_price });
    if (p.fill.list_price != null) out.push({ sku_id: p.sku_id, code: p.code, field: "list_price", price: p.fill.list_price });
  }
  return out;
}
