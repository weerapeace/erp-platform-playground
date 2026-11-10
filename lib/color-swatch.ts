/**
 * 🎨 ทะเบียนสีกลาง — แปลง "ชื่อสี" เป็น "หน้าตาจุดสี" (ของกลาง ใช้ได้ทั้งฝั่ง server และหน้าจอ)
 *
 * ข้อมูลอยู่ในพจนานุกรมสี (erp_color_dictionary: swatch_kind / swatch_colors / swatch_image_key)
 * - สีเดียว (solid) · หลายสีแบ่งช่อง (split 2–4 สี) · รูปลาย (image)
 * - ชื่อสีผสม เช่น "กรมท่า-ครีม-ขาว" → แยกตามขีด แล้วประกอบจากสีย่อยให้เอง (ไม่ต้องตั้งทีละชื่อ)
 *   ถ้าตั้งชื่อเต็มไว้ในพจนานุกรม ชื่อเต็มชนะ (ตั้งทับเฉพาะชื่อนั้นได้)
 * - หาชื่อได้ทั้งไทย/อังกฤษ และตัดวงเล็บท้ายชื่อ เช่น "Brown (08)" → "Brown"
 * - 📏 ชนิด "none" = ไซส์ / ไม่ใช่สี (2026-11-10) — ชื่ออย่าง "M (20.5 cm.)" · "10 รู" ที่ติดมากับช่องสีของ SKU
 *   ไม่ต้องตั้งจุดสี · ชื่อผสม "ดำ (01),M (20.5 cm.)" ใช้แค่ส่วนที่เป็นสี · หน้าเว็บตัดส่วนไซส์ออกจากชื่อตัวเลือก (splitOptionSizes)
 *
 * ผลลัพธ์เป็นค่า CSS `background` (สี / gradient / url) → เว็บร้านใช้ `style={{ background }}` ได้ทันที
 * ⚠️ ไฟล์นี้ต้องไม่มี "use client" — API route import ไปใช้ด้วย
 */

export type SwatchKind = "solid" | "split" | "image" | "none";

export interface SwatchEntry {
  id?: string;
  th: string;
  en: string;
  kind: SwatchKind | null;
  colors: string[];
  imageKey: string | null;
}

/** หน้าตาจุดสีที่หาได้แล้ว — colors (1–4 สี) หรือ imageKey */
export interface SwatchSpec {
  colors: string[];
  imageKey: string | null;
}

export const SWATCH_KIND_LABEL: Record<SwatchKind, string> = { solid: "สีเดียว", split: "หลายสี (แบ่งช่อง)", image: "รูปลาย", none: "ไซส์ (ไม่มีสี)" };
export const MAX_SPLIT = 4;

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX_RE.test(s.trim());

export const normColorName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * 📏 ชื่อนี้ "ดูเป็นไซส์/จำนวน" ไหม (ใช้แนะนำเท่านั้น — เจ้าของต้องกดยืนยันเอง ไม่ตั้งให้อัตโนมัติ)
 * S M L XL · "M (20.5 cm.)" · "15x20 cm" · "4 mm." · "10 รู" · "A4 21*30 cm" · "Free size"
 */
const SIZE_LETTER_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl|free\s*size|freesize)(\s*\(.*\))?$/i;
const SIZE_UNIT_RE = /^\d+(\.\d+)?\s*([x*×]\s*\d+(\.\d+)?\s*){0,2}(cm|ซม|mm|มม|นิ้ว|inch|in|")\.?$/i;
const SIZE_COUNT_RE = /^\d+\s*(รู|ช่อง|ชิ้น|ใบ)$/;
const SIZE_PAPER_RE = /^a[0-6](\s+\d.*)?$/i;
export function looksLikeSize(name: string): boolean {
  const n = name.trim().replace(/\s+/g, " ");
  return !!n && (SIZE_LETTER_RE.test(n) || SIZE_UNIT_RE.test(n) || SIZE_COUNT_RE.test(n) || SIZE_PAPER_RE.test(n) || /^(size|ไซส์|ไซซ์)\s/i.test(n));
}

/** แยกชื่อสีผสมตาม - / , + & (คืน [] ถ้ามีชื่อเดียว) */
export function splitColorName(label: string): string[] {
  const parts = label.split(/\s*[-–—/,+&]\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : [];
}

/** ตรวจ/เกลาค่าที่จะบันทึก — คืน error เป็นภาษาคน ถ้าไม่ผ่าน */
export function normalizeSwatchInput(raw: { kind?: unknown; colors?: unknown; imageKey?: unknown }):
  | { ok: true; kind: SwatchKind | null; colors: string[]; imageKey: string | null }
  | { ok: false; error: string } {
  const kind = raw.kind === "solid" || raw.kind === "split" || raw.kind === "image" || raw.kind === "none" ? raw.kind : null;
  const colors = (Array.isArray(raw.colors) ? raw.colors : []).filter(isHex).map((c) => c.trim().toUpperCase());
  const imageKey = typeof raw.imageKey === "string" && raw.imageKey.trim() ? raw.imageKey.trim() : null;
  if (kind === null) return { ok: true, kind: null, colors: [], imageKey: null };
  if (kind === "none") return { ok: true, kind, colors: [], imageKey: null };
  if (kind === "solid") {
    if (!colors.length) return { ok: false, error: "เลือกสีก่อนบันทึก" };
    return { ok: true, kind, colors: colors.slice(0, 1), imageKey: null };
  }
  if (kind === "split") {
    if (colors.length < 2) return { ok: false, error: "แบบหลายสีต้องมีอย่างน้อย 2 สี" };
    return { ok: true, kind, colors: colors.slice(0, MAX_SPLIT), imageKey: null };
  }
  if (!imageKey) return { ok: false, error: "อัปโหลดรูปลายก่อนบันทึก" };
  return { ok: true, kind, colors: [], imageKey };
}

/** 📏 แถวนี้ตั้งเป็น "ไซส์ (ไม่มีสี)" */
export const isSizeEntry = (e: SwatchEntry | undefined | null): boolean => e?.kind === "none";

/** แถวนี้ตั้งหน้าตาจุดสีครบแล้วหรือยัง (ไซส์ = ไม่มีจุดสี → false) */
export const hasSwatch = (e: SwatchEntry | undefined | null): e is SwatchEntry =>
  !!e && (e.kind === "image" ? !!e.imageKey : e.kind === "solid" || e.kind === "split" ? e.colors.length > 0 : false);

/** ดัชนีค้นหาเร็ว (ไทย + อังกฤษ) — สร้างครั้งเดียวต่อคำขอ */
export class SwatchIndex {
  private byTh = new Map<string, SwatchEntry>();
  private byEn = new Map<string, SwatchEntry>();

  constructor(entries: SwatchEntry[]) {
    for (const e of entries) {
      this.byTh.set(normColorName(e.th), e);
      const en = normColorName(e.en || "");
      // คำอังกฤษซ้ำกันได้ (เช่น Light Blue 2 คำ) — เอาตัวที่ตั้งจุดสีแล้วก่อน
      if (en && (!this.byEn.has(en) || (!hasSwatch(this.byEn.get(en)) && hasSwatch(e)))) this.byEn.set(en, e);
    }
  }

  /** หาแถวของชื่อนี้ (ไทย → อังกฤษ → ตัดวงเล็บท้ายแล้วลองใหม่) */
  find(name: string): SwatchEntry | undefined {
    const n = normColorName(name);
    const hit = this.byTh.get(n) ?? this.byEn.get(n);
    if (hit) return hit;
    const stripped = normColorName(name.replace(/\s*\([^)]*\)\s*/g, " "));
    return stripped && stripped !== n ? this.byTh.get(stripped) ?? this.byEn.get(stripped) : undefined;
  }

  /**
   * หน้าตาจุดสีของชื่อนี้ — null = ยังตั้งไม่ครบ (เว็บจะใช้รูปเล็กของสีนั้นแทนเหมือนเดิม)
   * สีผสม: ทุกสีย่อยต้องตั้งแล้ว และเป็นสี (ไม่ใช่รูปลาย) · เกิน 4 สีใช้ 4 สีแรก
   */
  resolve(label: string): SwatchSpec | null {
    const direct = this.find(label);
    if (hasSwatch(direct)) return direct.kind === "image" ? { colors: [], imageKey: direct.imageKey } : { colors: direct.colors, imageKey: null };
    if (isSizeEntry(direct)) return null;
    // 📏 ส่วนที่ตั้งเป็นไซส์ไม่นับ ("ดำ (01),M (20.5 cm.)" = จุดสีดำ) · เหลือสีเดียว = ใช้หน้าตาของสีนั้นเต็ม ๆ (รูปลายได้)
    const parts = splitColorName(label).filter((p) => !isSizeEntry(this.find(p)));
    if (!parts.length) return null;
    if (parts.length === 1) {
      const e = this.find(parts[0]);
      if (!hasSwatch(e)) return null;
      return e.kind === "image" ? { colors: [], imageKey: e.imageKey } : { colors: e.colors, imageKey: null };
    }
    const colors: string[] = [];
    for (const p of parts.slice(0, MAX_SPLIT)) {
      const e = this.find(p);
      if (!hasSwatch(e) || e.kind === "image") return null;
      colors.push(e.colors[0]);
    }
    return { colors, imageKey: null };
  }

  /** 📏 ชื่อนี้เป็นไซส์ล้วน (ตั้งชื่อเต็มเป็นไซส์ หรือทุกส่วนของชื่อผสมเป็นไซส์) — ไม่ต้องมีจุดสี */
  isSizeOnly(label: string): boolean {
    if (isSizeEntry(this.find(label))) return true;
    const parts = splitColorName(label);
    return parts.length > 0 && parts.every((p) => isSizeEntry(this.find(p)));
  }

  /**
   * 📏 ตัดส่วนที่ตั้งเป็นไซส์ออกจากชื่อผสม — คงตัวคั่นเดิม
   *   "ดำ (01),M (20.5 cm.)" → { label: "ดำ (01)", sizes: ["M (20.5 cm.)"] } · "แดง-ดำ (04),M" → "แดง-ดำ (04)"
   * ไม่มีส่วนไซส์ / ไซส์ล้วน (ตัดแล้วไม่เหลือชื่อ) / ชื่อเต็มตั้งไว้เองในทะเบียน = คืนชื่อเดิม sizes []
   */
  stripSizes(label: string): { label: string; sizes: string[] } {
    const same = { label, sizes: [] as string[] };
    const direct = this.find(label);
    if (direct && !isSizeEntry(direct)) return same;
    const tokens = label.split(/(\s*[-–—/,+&]\s*)/);
    const partIdx = tokens.map((t, i) => (i % 2 === 0 && t.trim() ? i : -1)).filter((i) => i >= 0);
    if (partIdx.length < 2) return same;
    const flag = new Set(partIdx.filter((i) => isSizeEntry(this.find(tokens[i].trim()))));
    if (!flag.size || flag.size === partIdx.length) return same;
    let out = "";
    for (const i of partIdx) {
      if (flag.has(i)) continue;
      out += out ? tokens[i - 1] + tokens[i].trim() : tokens[i].trim();
    }
    return { label: out, sizes: partIdx.filter((i) => flag.has(i)).map((i) => tokens[i].trim()) };
  }

  /**
   * 🌐 ชื่อสีภาษาอังกฤษจากทะเบียนสีกลาง (หน้าเว็บ /en) — เช่น "กรมท่า (02)" → "Navy (02)"
   * สีผสม แปลทีละคำแล้วคงตัวคั่นเดิม ("กรมท่า-ขาว" → "Navy-White") · คำไหนไม่มีในทะเบียน = "" ทั้งชื่อ (เว็บใช้ไทยแทน)
   * ชื่อที่ไม่มีอักษรไทยอยู่แล้ว = "" (ไม่ต้องแปล)
   */
  english(label: string): string {
    if (!/[฀-๿]/.test(label)) return "";
    const m = /^(.*?)(\s*\([^)]*\))?\s*$/.exec(label.trim());
    const core = (m?.[1] ?? label).trim();
    const suffix = m?.[2] ?? "";
    const one = (s: string) => this.find(s)?.en?.trim() || "";
    const direct = one(core);
    if (direct) return direct + suffix;
    const tokens = core.split(/(\s*[-–—/,+&]\s*)/);
    if (tokens.length < 3) return "";
    const out: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (i % 2 === 1) {
        out.push(tokens[i]);
        continue;
      }
      const en = /[฀-๿]/.test(tokens[i]) ? one(tokens[i]) : tokens[i].trim();
      if (!en) return "";
      out.push(en);
    }
    return out.join("") + suffix;
  }

  /** สีย่อยที่ยังขาด (ใช้บอกเจ้าของว่าต้องตั้งสีไหนก่อน) */
  missingParts(label: string): string[] {
    const parts = splitColorName(label).filter((p) => !isSizeEntry(this.find(p)));
    // เหลือสีเดียวหลังตัดไซส์ = รูปลายใช้ได้ (resolve ใช้หน้าตาของสีนั้นเต็ม ๆ)
    return parts.filter((p) => {
      const e = this.find(p);
      return !hasSwatch(e) || (e.kind === "image" && parts.length > 1);
    });
  }
}

/**
 * 📏 ชื่อตัวเลือกทั้งชุดของรุ่นหนึ่ง → ตัดไซส์ออก ให้หน้าเว็บโชว์แค่สี + บรรทัด "ไซส์: …" ครั้งเดียว
 * ทำเฉพาะเมื่อปลอดภัย (ไม่ผ่าน = null → หน้าเว็บโชว์ชื่อเต็มเหมือนเดิม):
 *   - ทุกตัวเลือกที่มีไซส์ ใช้ไซส์เดียวกัน (รุ่นที่มีหลายไซส์ให้ใช้ "ตัวเลือกชุดที่ 2" แทน)
 *   - ตัดแล้วชื่อไม่ซ้ำกัน (ไม่งั้นลูกค้าแยกตัวเลือกไม่ออก)
 *   - ไซส์ไม่ขึ้นต้นด้วยตัวเลข (เว็บร้านอ่านเลขในแถวขนาดไปคิดตัวกรอง "ขนาด" เป็น ซม.)
 */
export function splitOptionSizes(labels: string[], idx: SwatchIndex): { labels: string[]; size: string } | null {
  const split = labels.map((l) => idx.stripSizes(l));
  const withSize = split.filter((s) => s.sizes.length);
  if (!withSize.length) return null;
  const key = (s: { sizes: string[] }) => s.sizes.map(normColorName).join("|");
  if (new Set(withSize.map(key)).size > 1) return null;
  const size = withSize[0].sizes.join(" / ");
  if (Number.isFinite(parseFloat(size))) return null;
  const out = split.map((s) => s.label);
  if (new Set(out.map(normColorName)).size !== out.length) return null;
  return { labels: out, size };
}

/**
 * แปลงเป็นค่า CSS background
 * 1 สี = สีเต็ม · 2 สี = แบ่งครึ่งเฉียง · 3–4 สี = แบ่งเป็นชิ้นพาย · รูปลาย = url() เต็มวง
 */
export function swatchCss(spec: SwatchSpec, imageUrl: (key: string) => string): string {
  if (spec.imageKey) return `url("${imageUrl(spec.imageKey)}") center / cover no-repeat`;
  const c = spec.colors;
  if (c.length <= 1) return c[0] ?? "transparent";
  if (c.length === 2) return `linear-gradient(135deg, ${c[0]} 0 50%, ${c[1]} 50% 100%)`;
  const step = 360 / c.length;
  return `conic-gradient(from -45deg, ${c.map((x, i) => `${x} ${Math.round(i * step)}deg ${Math.round((i + 1) * step)}deg`).join(", ")})`;
}

/** แถวจากตาราง → SwatchEntry */
export function rowToSwatchEntry(r: {
  id?: string;
  th: string;
  en: string | null;
  swatch_kind: string | null;
  swatch_colors: string[] | null;
  swatch_image_key: string | null;
}): SwatchEntry {
  const kind = r.swatch_kind === "solid" || r.swatch_kind === "split" || r.swatch_kind === "image" || r.swatch_kind === "none" ? r.swatch_kind : null;
  return {
    id: r.id,
    th: r.th,
    en: r.en ?? "",
    kind,
    colors: (r.swatch_colors ?? []).filter(isHex),
    imageKey: r.swatch_image_key || null,
  };
}

export const SWATCH_SELECT = "id, th, en, swatch_kind, swatch_colors, swatch_image_key";
