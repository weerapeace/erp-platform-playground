/**
 * 🌐 ศูนย์แปลภาษา — ตัวเชื่อมแหล่งข้อความทุกแบบให้อยู่ในตารางเดียว (ไม่ผูก React)
 *
 * แต่ละแหล่ง (หน้าแรก · หน้าเว็บ · ธีม · หมวด/ตัวเลือก · คอลเลกชัน · ข้อมูลร้าน · สินค้า) เก็บข้อมูลคนละรูปแบบ
 * → ตัวเชื่อม 1 ตัวต่อรูปแบบ แปลงเป็นแถวกลาง (CenterRow) + แก้คำแปลกลับลงข้อมูลเดิม
 *   blocks  = Section ของหน้า (lib/website-i18n · ช่องตาม schema รวมปุ่ม/รายการ)
 *   paths   = ข้อมูลซ้อนลึก (lib/content-i18n collectTextPaths) — ธีม/หมวด/คอลเลกชัน/ข้อมูลร้าน
 *   products = ชื่อ/คำอธิบายสินค้า (Parent SKU เก็บอังกฤษคนละคอลัมน์ ไม่มีสถานะ AI/ไทยเปลี่ยน)
 * หน้าจอ: components/website-translation-center.tsx
 */
import {
  EN_SUFFIX,
  I18N_META_KEY,
  collectTextPaths,
  confirmPatch,
  translationPatch,
  updateAt,
  type TranslationStatus,
} from "@/lib/content-i18n";
import { applySlotTranslations, collectTextSlots, type TextSlot } from "@/lib/website-i18n";

export interface CenterRow {
  /** รหัสแถวในแหล่งนั้น */
  id: string;
  /** แหล่ง (key) — ใช้กรอง/บันทึก */
  source: string;
  where: string;
  th: string;
  en: string;
  status: TranslationStatus;
  /** ข้อความยาว/หลายบรรทัด → ช่องกรอกใหญ่ */
  long: boolean;
  /** รายการ (ทีละบรรทัด) — ช่องอังกฤษกรอกบรรทัดละรายการ */
  list?: boolean;
}

export interface CenterAdapter<V> {
  rows(v: V): CenterRow[];
  /** ใส่คำแปล (ai = ติดป้าย AI รอตรวจ) */
  setEn(v: V, rowId: string, en: string, ai: boolean): V;
  /** ตรวจแล้ว (เอาป้าย AI ออก) */
  confirm(v: V, rowId: string): V;
}

const isLong = (s: string) => s.length > 80 || s.includes("\n");

/* ─────────── Section ของหน้า ─────────── */

const slotId = (s: TextSlot) => `${s.blockId}~${s.childId ?? ""}~${s.fd.key}`;

export function blocksAdapter(source: string): CenterAdapter<unknown[]> {
  const find = (v: unknown[], id: string) => collectTextSlots(v).find((s) => slotId(s) === id);
  const valueOf = (slot: TextSlot, en: string): string | string[] => {
    if (!Array.isArray(slot.th)) return en;
    const lines = en.split("\n");
    return slot.th.map((t, i) => (t.trim() ? (lines[i] ?? "").trim() : ""));
  };
  return {
    rows: (v) =>
      collectTextSlots(v).map((s) => {
        // รายการ: บรรทัดตรงกันทั้งไทย/อังกฤษ (บรรทัดที่ n ของอังกฤษ = รายการที่ n)
        const th = Array.isArray(s.th) ? s.th.join("\n") : s.th;
        const en = Array.isArray(s.en) ? (s.en as string[]).join("\n").replace(/\n+$/, "") : s.en;
        return { id: slotId(s), source, where: `${s.where} › ${s.fd.label}`, th, en, status: s.status, long: isLong(th) || Array.isArray(s.th), list: Array.isArray(s.th) };
      }),
    setEn: (v, id, en, ai) => {
      const slot = find(v, id);
      return slot ? applySlotTranslations(v, [{ slot, en: valueOf(slot, en) }], ai) : v;
    },
    // ตรวจแล้ว = บันทึกคำแปลเดิมซ้ำแบบ "คนตรวจ" (ป้าย AI หาย · จำไทยฉบับนี้)
    confirm: (v, id) => {
      const slot = find(v, id);
      return slot ? applySlotTranslations(v, [{ slot, en: slot.en }], false) : v;
    },
  };
}

/* ─────────── ข้อมูลซ้อนลึก (ธีม/หมวด/คอลเลกชัน/ข้อมูลร้าน) ─────────── */

export function pathsAdapter<V>(source: string, keys: readonly string[], crumbOf?: (f: string) => string | null): CenterAdapter<V> {
  const parse = (id: string) => {
    const [p, key] = id.split("|");
    return { path: p ? p.split(".").map((x) => (/^\d+$/.test(x) ? Number(x) : x)) : [], key };
  };
  return {
    rows: (v) =>
      collectTextPaths(v, keys, crumbOf).map((s) => ({
        id: `${s.path.join(".")}|${s.key}`,
        source,
        where: s.where.join(" › "),
        th: s.th,
        en: s.en,
        status: s.status,
        long: isLong(s.th),
      })),
    setEn: (v, id, en, ai) => {
      const { path, key } = parse(id);
      return updateAt(v, path, (o) => ({ ...o, ...translationPatch(o, key, o[key], en, ai) }));
    },
    confirm: (v, id) => {
      const { path, key } = parse(id);
      return updateAt(v, path, (o) => ({ ...o, ...confirmPatch(o, key, o[key]) }));
    },
  };
}

/* ─────────── สินค้า (Parent SKU) ─────────── */

export interface CenterProduct {
  id: string;
  code: string;
  webName: string;
  imageKey: string | null;
  /** ai = แปลโดย AI ในรอบนี้ ยังไม่มีคนตรวจ (จำแค่บนหน้าจอ — Parent SKU ไม่มีช่องเก็บสถานะ) */
  name: { th: string; en: string; ai?: boolean };
  desc: { th: string; en: string; enField: string; ai?: boolean } | null;
}

export function productsAdapter(source = "products"): CenterAdapter<CenterProduct[]> {
  return {
    rows: (v) =>
      v.flatMap((p) => {
        const label = `${p.code}${p.webName ? ` · ${p.webName}` : ""}`;
        const out: CenterRow[] = [];
        if (/[฀-๿]/.test(p.name.th))
          out.push({ id: `${p.id}|name`, source, where: `${label} › ชื่อสินค้า`, th: p.name.th, en: p.name.en, status: statusOf(p.name), long: false });
        if (p.desc && /[฀-๿]/.test(p.desc.th))
          out.push({ id: `${p.id}|desc`, source, where: `${label} › คำอธิบาย`, th: p.desc.th, en: p.desc.en, status: statusOf(p.desc), long: true });
        return out;
      }),
    setEn: (v, id, en, ai) => patchPart(v, id, { en, ai }),
    // ตรวจแล้ว = เอาป้าย AI ออก (บนหน้าจอ)
    confirm: (v, id) => patchPart(v, id, { ai: false }),
  };
}

// ช่องอังกฤษที่มีอักษรไทย (ข้อมูลเก่ากรอกไทยลงช่อง name_en) = ยังไม่มีคำแปลจริง
const statusOf = (x: { en: string; ai?: boolean }): TranslationStatus => (!x.en.trim() || /[฀-๿]/.test(x.en) ? "empty" : x.ai ? "ai" : "ok");
function patchPart(v: CenterProduct[], id: string, patch: { en?: string; ai?: boolean }): CenterProduct[] {
  const [rid, part] = id.split("|");
  return v.map((p) => (p.id !== rid ? p : part === "name" ? { ...p, name: { ...p.name, ...patch } } : p.desc ? { ...p, desc: { ...p.desc, ...patch } } : p));
}

/** ช่องที่สินค้าตัวนี้เปลี่ยน (เทียบของเดิม) → แพตช์สำหรับ PATCH /api/master-v2/parent-skus/<id> */
export function productPatch(before: CenterProduct | undefined, after: CenterProduct): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (after.name.en !== (before?.name.en ?? "")) out.name_en = after.name.en.trim();
  if (after.desc && after.desc.en !== (before?.desc?.en ?? "")) out[after.desc.enField] = after.desc.en.trim();
  return Object.keys(out).length ? out : null;
}

/* ─────────── เผยแพร่ได้เลย หรือต้องเก็บเป็นร่าง ─────────── */

/** ตัดคำแปลออกทั้งก้อน (ไว้เทียบว่าต่างกันแค่คำแปลไหม) */
export function stripTranslations(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripTranslations);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === I18N_META_KEY || k.endsWith(EN_SUFFIX)) continue;
    out[k] = stripTranslations(x);
  }
  return out;
}

/**
 * หน้า/ธีมที่มีระบบร่าง: ถ้าสิ่งที่จะบันทึกต่างจากที่เผยแพร่ "แค่คำแปล" = เผยแพร่ได้เลย (ไม่พาของอื่นขึ้นเว็บ)
 * ถ้ามีร่างอื่นค้างอยู่ (เจ้าของแก้หน้าเว็บแต่ยังไม่กดเผยแพร่) = เก็บเป็นร่าง ไม่เผลอเผยแพร่งานที่ยังไม่พร้อม
 */
export const onlyTranslationsDiffer = (published: unknown, edited: unknown): boolean =>
  JSON.stringify(stripTranslations(published)) === JSON.stringify(stripTranslations(edited));
