/**
 * 🌐 2 ภาษาของ "หน้าเว็บร้าน" — ต่อกติกากลาง (lib/content-i18n.ts) เข้ากับ Schema ของ Section
 *
 * ช่องที่แปลได้ = ชนิด text / textarea / link (ข้อความบนปุ่ม) / list — เว้นช่องที่ตั้ง i18n: false
 *   text/textarea → `<key>_en` เป็น string
 *   link          → `<key>_en` = ข้อความบนปุ่มภาษาอังกฤษ (ปลายทางใช้ร่วมกับไทย)
 *   list          → `<key>_en` = string[] เรียงตรงกับรายการไทยทีละบรรทัด
 *
 * ใช้ 3 ที่: ทำความสะอาดข้อมูล (normalizeBlocks) · ฟอร์มตั้งค่า (SchemaForm) · ปุ่ม "แปลที่ยังขาด"
 * ไม่ผูก React — ใช้ได้ทั้งเซิร์ฟเวอร์และหน้าจอ
 */
import { SECTION_SCHEMAS, matchShowIf, type FieldDef } from "@/lib/website-schema";
import {
  I18N_META_KEY,
  enKey,
  hasText,
  readMeta,
  sanitizeI18nMeta,
  translationPatch,
  translationStatus,
  type TranslationStatus,
} from "@/lib/content-i18n";

const TRANSLATABLE = new Set(["text", "textarea", "link", "list"]);

/** ช่องนี้มีภาษาอังกฤษคู่ไหม */
export const isTranslatable = (fd: FieldDef): boolean => TRANSLATABLE.has(fd.type) && fd.i18n !== false;

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : "")) : []);

/** ข้อความไทยของช่อง (ปุ่ม = ข้อความบนปุ่ม · รายการ = string[]) */
export function thaiValue(fd: FieldDef, item: Record<string, unknown>): string | string[] {
  const v = item[fd.key];
  if (fd.type === "list") return strList(v);
  if (fd.type === "link") return String((v as { text?: unknown } | null | undefined)?.text ?? "");
  return typeof v === "string" ? v : "";
}

/** ข้อความอังกฤษของช่อง (รายการ = เติมให้ยาวเท่ารายการไทย) */
export function englishValue(fd: FieldDef, item: Record<string, unknown>): string | string[] {
  const v = item[enKey(fd.key)];
  if (fd.type === "list") {
    const th = strList(item[fd.key]);
    const en = strList(v);
    return th.map((_, i) => en[i] ?? "");
  }
  return typeof v === "string" ? v : "";
}

/** ความยาวสูงสุดของคำแปล — เผื่อยาวกว่าไทย 1.5 เท่า (อังกฤษมักยาวกว่า) */
const enMax = (fd: FieldDef): number => {
  const base = fd.type === "link" ? 60 : fd.type === "list" ? 300 : fd.max ?? (fd.type === "textarea" ? 600 : 160);
  return Math.ceil(base * 1.5);
};

/** ทำความสะอาดค่าภาษาอังกฤษตามชนิดช่อง */
export function sanitizeEnValue(fd: FieldDef, v: unknown): string | string[] {
  if (fd.type === "list") return strList(v).slice(0, fd.max ?? 20).map((x) => x.slice(0, enMax(fd)));
  return typeof v === "string" ? v.slice(0, enMax(fd)) : "";
}

/**
 * เก็บช่อง `_en` + `_i18n` ลงในผลที่ทำความสะอาดแล้ว (เรียกจาก normalizeBlocks)
 * ไม่มีคำแปล = ไม่เติมช่องใหม่ (ข้อมูลร้านที่ยังไม่ใช้ 2 ภาษาหน้าตาเหมือนเดิมเป๊ะ)
 */
export function sanitizeTranslations(fields: FieldDef[], raw: Record<string, unknown>, out: Record<string, unknown>): void {
  const kept: string[] = [];
  for (const fd of fields) {
    if (!isTranslatable(fd)) continue;
    const v = sanitizeEnValue(fd, raw[enKey(fd.key)]);
    if (!hasText(v)) continue;
    out[enKey(fd.key)] = v;
    kept.push(fd.key);
  }
  const meta = sanitizeI18nMeta(raw[I18N_META_KEY], kept);
  if (meta) out[I18N_META_KEY] = meta;
}

/* ─────────── รวบรวม "ช่องข้อความ" ในหน้า (นับความครบ + แปลทีเดียวหลายช่อง) ─────────── */

export interface TextSlot {
  blockId: string;
  /** มี = ช่องในชิ้นย่อย (เช่น คำถาม FAQ ข้อหนึ่ง) */
  childId?: string;
  /** ชื่อ Section (และชิ้น) ที่ช่องนี้อยู่ — ใช้แสดงผล */
  where: string;
  fd: FieldDef;
  th: string | string[];
  en: string | string[];
  status: TranslationStatus;
}

function slotsOf(fields: FieldDef[], item: Record<string, unknown>, at: Omit<TextSlot, "fd" | "th" | "en" | "status">): TextSlot[] {
  const meta = readMeta(item);
  const out: TextSlot[] = [];
  for (const fd of fields) {
    if (!isTranslatable(fd) || !matchShowIf(fd, item)) continue;
    const th = thaiValue(fd, item);
    if (!hasText(th)) continue; // ไทยว่าง = ไม่มีอะไรให้แปล
    const en = englishValue(fd, item);
    out.push({ ...at, fd, th, en, status: translationStatus(th, en, meta[fd.key]) });
  }
  return out;
}

/**
 * ช่องข้อความทั้งหมดที่มีภาษาไทย (ข้ามช่องที่ถูกซ่อนด้วย showIf)
 * only.blockId = เฉพาะ Section นั้น (รวมชิ้นย่อย) · only.childId = เฉพาะชิ้นนั้น
 */
export function collectTextSlots(blocks: readonly unknown[], only?: { blockId?: string; childId?: string }): TextSlot[] {
  const out: TextSlot[] = [];
  for (const raw of blocks) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const schema = SECTION_SCHEMAS[String(b.type)];
    const blockId = String(b.id ?? "");
    if (!schema || (only?.blockId && only.blockId !== blockId)) continue;
    const label = schema.meta.label;
    if (!only?.childId) out.push(...slotsOf(schema.fields, b, { blockId, where: label }));
    const spec = schema.children;
    if (!spec) continue;
    const list = Array.isArray(b[spec.key]) ? (b[spec.key] as Record<string, unknown>[]) : [];
    list.forEach((c, i) => {
      const childId = String(c?.id ?? "");
      if (!c || (only?.childId && only.childId !== childId)) return;
      const name = (() => {
        try {
          return spec.summary(c) || `${spec.itemLabel} ${i + 1}`;
        } catch {
          return `${spec.itemLabel} ${i + 1}`;
        }
      })();
      out.push(...slotsOf(spec.fields, c, { blockId, childId, where: `${label} › ${name}` }));
    });
  }
  return out;
}

/** ข้อความที่ต้องส่งไปแปลของช่องนี้ (รายการ = ทีละบรรทัด) */
export const slotSourceTexts = (slot: TextSlot): string[] => (Array.isArray(slot.th) ? slot.th : [slot.th]);

/** ประกอบผลแปลกลับเป็นค่าของช่อง (รายการ: บรรทัดไทยที่ว่าง = อังกฤษว่าง) */
export function slotValueFrom(slot: TextSlot, outs: string[]): string | string[] {
  if (!Array.isArray(slot.th)) return (outs[0] ?? "").trim();
  return slot.th.map((t, i) => (t.trim() ? (outs[i] ?? "").trim() : ""));
}

/** ใส่คำแปลหลายช่องลงโครงหน้าทีเดียว (คืน array ใหม่ — ไม่แก้ของเดิม) · ai = ติดป้าย "AI แปล รอตรวจ" */
export function applySlotTranslations<T>(blocks: readonly T[], results: { slot: TextSlot; en: string | string[] }[], ai = true): T[] {
  const byBlock = new Map<string, { slot: TextSlot; en: string | string[] }[]>();
  for (const r of results) byBlock.set(r.slot.blockId, [...(byBlock.get(r.slot.blockId) ?? []), r]);
  return blocks.map((raw) => {
    const b = raw as unknown as Record<string, unknown>;
    const mine = byBlock.get(String(b.id ?? ""));
    if (!mine) return raw;
    let next: Record<string, unknown> = { ...b };
    const spec = SECTION_SCHEMAS[String(b.type)]?.children;
    for (const { slot, en } of mine) {
      if (!slot.childId) {
        next = { ...next, ...translationPatch(next, slot.fd.key, slot.th, en, ai) };
      } else if (spec && Array.isArray(next[spec.key])) {
        next = {
          ...next,
          [spec.key]: (next[spec.key] as Record<string, unknown>[]).map((c) =>
            c && String(c.id) === slot.childId ? { ...c, ...translationPatch(c, slot.fd.key, slot.th, en, ai) } : c,
          ),
        };
      }
    }
    return next as unknown as T;
  });
}
