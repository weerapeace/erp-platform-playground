/**
 * ของกลาง — "ฟิลด์ของ Parent SKU ที่ให้โชว์บนเว็บร้านได้" อ่านจากทะเบียนฟิลด์กลาง (erp_module_fields ของ parent_skus_v2)
 *
 *   - ใช้ที่: แท็บดีไซน์ → ชุดรายละเอียดสินค้า → ป๊อปอัป "เลือกฟิลด์" (ทุกฟิลด์ ไม่ใช่แค่ 15 ช่องตายตัว)
 *             /api/website/theme + /api/public/storefront/site (รายการ+ป้าย) · /api/public/storefront/products (ค่าจริงต่อสินค้า)
 *   - ตัดทิ้งเสมอ: ฟิลด์ที่ติ๊ก is_sensitive ในทะเบียน · ต้นทุน/ราคา/กำไร · ที่เก็บไฟล์ · โน้ตการผลิต · id/วันที่/สถานะระบบ · รูป/JSON/relation ดิบ
 *   - รองรับฟิลด์ "related" (ดึงจากตารางอื่นผ่าน *_id เช่น ขนาดกล่อง, วิธีวัดไซส์, ชื่อแบรนด์) — resolveRelatedValues() ดึงค่ามาให้
 *   - ป้ายไทย: ใช้ของ PRODUCT_SPEC_FIELDS ก่อน (15 ช่องเดิม) ไม่งั้นใช้ field_label ในทะเบียน (แก้ป้ายได้ที่ทะเบียนฟิลด์กลาง)
 *   - ทะเบียนว่าง/อ่านไม่ได้ → ถอยไปใช้ PRODUCT_SPEC_FIELDS เหมือนเดิม (เว็บไม่พัง)
 */
import { PRODUCT_SPEC_FIELDS } from "@/lib/website-theme";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export interface ParentWebField {
  key: string;
  label: string;
  /** กลุ่มในทะเบียน (core/content/other…) — ป๊อปอัปใช้จัดหมวด */
  group: string;
  unit?: string;
  /** คอลัมน์ใน parent_skus_v2 (ฟิลด์ธรรมดา) */
  column?: string;
  /** ฟิลด์ดึงจากตารางอื่น: parent.<via> → <table>.id → <field> */
  related?: { via: string; table: string; field: string };
}

export const PARENT_FIELD_GROUP_LABEL: Record<string, string> = {
  core: "ข้อมูลหลัก",
  content: "เนื้อหา / ขนาด",
  other: "วัสดุ / ส่วนประกอบ",
  media: "รูป",
  system: "ระบบ",
};

/** ไม่เอาออกเว็บเด็ดขาด แม้ทะเบียนไม่ได้ติ๊ก sensitive */
const BLOCK_KEY = /cost|price|margin|profit|file_location|work_instruction|_html$|^id$|^is_|_at$|cover_image|attribute_values|platform_category|child_skus|product_family/i;
const SKIP_UI = new Set(["relation", "one2many", "many2many", "image", "json", "boolean", "date", "file"]);
const OK_DATA = new Set(["text", "numeric", "int4", "int8", "integer", "float8", "varchar", "character varying"]);

/** ป้ายไทยสำรอง — ใช้เมื่อป้ายในทะเบียนยังเป็นชื่ออัตโนมัติจากชื่อคอลัมน์ (เช่น "Name En") · แก้ในทะเบียนฟิลด์กลางแล้วจะใช้ของทะเบียนแทน */
const LABEL_TH: Record<string, string> = {
  code: "รหัสรุ่น",
  name_th: "ชื่อสินค้า",
  name_en: "ชื่อสินค้า (EN)",
  sku_name: "ชื่อ SKU",
  name_platform: "ชื่อสำหรับลงขาย",
  name_platform_en: "ชื่อสำหรับลงขาย (EN)",
  introduction: "คำแนะนำสินค้า",
  introduction_en: "คำแนะนำสินค้า (EN)",
  description: "คำอธิบาย",
  platform_description: "คำอธิบายสำหรับลงขาย",
  platform_description_en: "คำอธิบายสำหรับลงขาย (EN)",
  english_description: "คำอธิบาย (EN)",
  size_description: "คำอธิบายขนาด",
  how_to_size: "วิธีวัดไซส์",
  special_description: "คำอธิบายพิเศษ",
  parcel_size: "ขนาดกล่องไปรษณีย์",
  shopee_url: "ลิงก์ Shopee",
  lazada_url: "ลิงก์ Lazada",
  tiktok_url: "ลิงก์ TikTok",
  brand_name: "ชื่อแบรนด์",
};
/** ป้ายอัตโนมัติที่ระบบสร้างจากชื่อคอลัมน์ เช่น name_en → "Name En" / "Name En [EN]" */
const isAutoLabel = (key: string, label: string): boolean => {
  const auto = key.split("_").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ").toLowerCase();
  const l = label.trim().toLowerCase().replace(/\s*\[en\]$/, "");
  return !l || l === auto || l === key.toLowerCase();
};
const pickLabel = (key: string, registryLabel: string | null | undefined): string => {
  const reg = (registryLabel ?? "").trim();
  if (reg && !isAutoLabel(key, reg)) return reg;
  return LABEL_TH[key] ?? (reg || key);
};

const fallbackFields = (): ParentWebField[] =>
  PRODUCT_SPEC_FIELDS.map((f) => ({ key: f.key, label: f.label, group: "content", unit: f.unit, column: f.key }));

let cache: { at: number; fields: ParentWebField[] } | null = null;
const TTL = 60_000;

export async function loadParentWebFields(sb: Admin): Promise<ParentWebField[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.fields;
  try {
    const { data: mod } = await sb.from("erp_modules").select("id").eq("table_name", "parent_skus_v2").limit(1).maybeSingle();
    const moduleId = (mod as { id: string } | null)?.id;
    if (!moduleId) return fallbackFields();
    const { data } = await sb
      .from("erp_module_fields")
      .select("field_key, column_name, field_label, ui_field_type, data_type, group_key, is_sensitive, is_active, relation_config, display_order")
      .eq("module_id", moduleId)
      .order("display_order", { ascending: true });
    type Row = {
      field_key: string;
      column_name: string | null;
      field_label: string | null;
      ui_field_type: string | null;
      data_type: string | null;
      group_key: string | null;
      is_sensitive: boolean | null;
      is_active: boolean | null;
      relation_config: Record<string, unknown> | null;
    };
    const spec = new Map(PRODUCT_SPEC_FIELDS.map((f) => [f.key, f]));
    const out: ParentWebField[] = [];
    for (const r of (data ?? []) as Row[]) {
      if (r.is_active === false || r.is_sensitive) continue;
      if (BLOCK_KEY.test(r.field_key)) continue;
      const ui = r.ui_field_type ?? "text";
      const base = { key: r.field_key, label: spec.get(r.field_key)?.label ?? pickLabel(r.field_key, r.field_label), group: r.group_key ?? "other", unit: spec.get(r.field_key)?.unit };
      if (ui === "related") {
        const rc = (r.relation_config ?? {}) as { kind?: string; via_column?: string; target_table?: string; target_field?: string };
        if (rc.kind === "related" && rc.via_column && rc.target_table && rc.target_field && /^[\w]+$/.test(rc.target_table) && /^[\w]+$/.test(rc.target_field)) {
          out.push({ ...base, related: { via: rc.via_column, table: rc.target_table, field: rc.target_field } });
        }
        continue;
      }
      if (SKIP_UI.has(ui)) continue;
      if (!r.column_name) continue;
      if (r.data_type && !OK_DATA.has(r.data_type)) continue;
      out.push({ ...base, column: r.column_name });
    }
    const fields = out.length ? out : fallbackFields();
    cache = { at: Date.now(), fields };
    return fields;
  } catch {
    return fallbackFields();
  }
}

/** ค่าของตารางปลายทางสำหรับฟิลด์ related: table → (id → row) — ดึงทีเดียวต่อตารางสำหรับทุกสินค้า */
export async function resolveRelatedValues(
  sb: Admin,
  fields: ParentWebField[],
  parents: Record<string, unknown>[]
): Promise<Map<string, Map<string, Record<string, unknown>>>> {
  const out = new Map<string, Map<string, Record<string, unknown>>>();
  const byTable = new Map<string, { ids: Set<string>; cols: Set<string> }>();
  for (const f of fields) {
    if (!f.related) continue;
    const e = byTable.get(f.related.table) ?? { ids: new Set<string>(), cols: new Set<string>() };
    e.cols.add(f.related.field);
    for (const p of parents) {
      const v = p[f.related.via];
      if (typeof v === "string" && v) e.ids.add(v);
    }
    byTable.set(f.related.table, e);
  }
  await Promise.all(
    [...byTable.entries()].map(async ([table, e]) => {
      if (!e.ids.size) return;
      try {
        const { data } = await sb.from(table).select(["id", ...e.cols].join(", ")).in("id", [...e.ids]);
        const m = new Map<string, Record<string, unknown>>();
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) m.set(String(row.id), row);
        out.set(table, m);
      } catch {
        /* ตารางปลายทางอ่านไม่ได้ = ข้ามฟิลด์นั้น */
      }
    })
  );
  return out;
}

/** ค่าฟิลด์ที่ไม่ว่างของ Parent SKU ตัวหนึ่ง (key → ข้อความพร้อมหน่วย) — ช่อง "-", "ไม่มี" ถือว่าว่าง */
export function productWebAttrs(
  p: Record<string, unknown>,
  fields: ParentWebField[],
  related: Map<string, Map<string, Record<string, unknown>>>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    let v: unknown;
    if (f.related) {
      const id = p[f.related.via];
      v = typeof id === "string" ? related.get(f.related.table)?.get(id)?.[f.related.field] : undefined;
    } else if (f.column) {
      v = p[f.column];
    }
    if (v == null) continue;
    const str = typeof v === "number" ? (v > 0 ? String(v) : "") : String(v).trim();
    if (!str || /^[-–—._/]+$|^(n\/a|na|none|ไม่มี|ไม่ระบุ)$/i.test(str)) continue;
    out[f.key] = f.unit ? `${str} ${f.unit}` : str.slice(0, 4000);
  }
  return out;
}
