/**
 * 🎨 ทะเบียนสีกลาง — แปลง "ชื่อสี" เป็น "หน้าตาจุดสี" (ของกลาง ใช้ได้ทั้งฝั่ง server และหน้าจอ)
 *
 * ข้อมูลอยู่ในพจนานุกรมสี (erp_color_dictionary: swatch_kind / swatch_colors / swatch_image_key)
 * - สีเดียว (solid) · หลายสีแบ่งช่อง (split 2–4 สี) · รูปลาย (image)
 * - ชื่อสีผสม เช่น "กรมท่า-ครีม-ขาว" → แยกตามขีด แล้วประกอบจากสีย่อยให้เอง (ไม่ต้องตั้งทีละชื่อ)
 *   ถ้าตั้งชื่อเต็มไว้ในพจนานุกรม ชื่อเต็มชนะ (ตั้งทับเฉพาะชื่อนั้นได้)
 * - หาชื่อได้ทั้งไทย/อังกฤษ และตัดวงเล็บท้ายชื่อ เช่น "Brown (08)" → "Brown"
 *
 * ผลลัพธ์เป็นค่า CSS `background` (สี / gradient / url) → เว็บร้านใช้ `style={{ background }}` ได้ทันที
 * ⚠️ ไฟล์นี้ต้องไม่มี "use client" — API route import ไปใช้ด้วย
 */

export type SwatchKind = "solid" | "split" | "image";

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

export const SWATCH_KIND_LABEL: Record<SwatchKind, string> = { solid: "สีเดียว", split: "หลายสี (แบ่งช่อง)", image: "รูปลาย" };
export const MAX_SPLIT = 4;

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX_RE.test(s.trim());

export const normColorName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** แยกชื่อสีผสมตาม - / , + & (คืน [] ถ้ามีชื่อเดียว) */
export function splitColorName(label: string): string[] {
  const parts = label.split(/\s*[-–—/,+&]\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : [];
}

/** ตรวจ/เกลาค่าที่จะบันทึก — คืน error เป็นภาษาคน ถ้าไม่ผ่าน */
export function normalizeSwatchInput(raw: { kind?: unknown; colors?: unknown; imageKey?: unknown }):
  | { ok: true; kind: SwatchKind | null; colors: string[]; imageKey: string | null }
  | { ok: false; error: string } {
  const kind = raw.kind === "solid" || raw.kind === "split" || raw.kind === "image" ? raw.kind : null;
  const colors = (Array.isArray(raw.colors) ? raw.colors : []).filter(isHex).map((c) => c.trim().toUpperCase());
  const imageKey = typeof raw.imageKey === "string" && raw.imageKey.trim() ? raw.imageKey.trim() : null;
  if (kind === null) return { ok: true, kind: null, colors: [], imageKey: null };
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

/** แถวนี้ตั้งหน้าตาจุดสีครบแล้วหรือยัง */
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
    const parts = splitColorName(label);
    if (!parts.length) return null;
    const colors: string[] = [];
    for (const p of parts.slice(0, MAX_SPLIT)) {
      const e = this.find(p);
      if (!hasSwatch(e) || e.kind === "image") return null;
      colors.push(e.colors[0]);
    }
    return { colors, imageKey: null };
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
    return splitColorName(label).filter((p) => {
      const e = this.find(p);
      return !hasSwatch(e) || e.kind === "image";
    });
  }
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
  const kind = r.swatch_kind === "solid" || r.swatch_kind === "split" || r.swatch_kind === "image" ? r.swatch_kind : null;
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
