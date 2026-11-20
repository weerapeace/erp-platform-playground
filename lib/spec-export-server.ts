/**
 * 📤 ส่งออกรายละเอียดสินค้า — ฝั่ง server (อ่านทะเบียนฟิลด์ + ดึงค่าจริงของหลายรุ่น)
 *   ใช้ที่: /api/parent-skus/spec-export · กฎกลาง: lib/spec-export · คู่มือ: docs/spec-export.md
 *   - สิทธิ์: ช่อง is_sensitive ต้องมี sensitive_permission (ราคา/ต้นทุน) · view_roles ในทะเบียน (getFieldAccess) ตัดซ้ำ
 *   - ช่องผูก (id) → ชื่อ · ช่องดึงจากตารางอื่น (related) → ใช้ resolveRelatedValues ตัวเดียวกับเว็บร้าน
 *   - ช่องคำนวณ (Name Platform / Platform description / สรุปขนาด) → computedTextValue ตัวเดียวกับป๊อป Parent SKU
 */
import type { NextRequest } from "next/server";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { getFieldAccess } from "@/lib/field-permissions";
import { computedTextValue } from "@/lib/computed-text";
import { resolveRelatedValues, type ParentWebField } from "@/lib/website-parent-fields";
import { buildSpecCatalog, type RegistryFieldRow, type SpecField, type SpecKid, type SpecLang, type SpecProduct, type SpecValue } from "@/lib/spec-export";

type Admin = ReturnType<typeof supabaseAdmin>;

const REG_COLS = "field_key, column_name, field_label, field_label_en, ui_field_type, data_type, group_key, is_active, is_sensitive, sensitive_permission, relation_config, ui_style, display_order";

async function registryRows(admin: Admin, table: string): Promise<RegistryFieldRow[]> {
  const { data: mod } = await admin.from("erp_modules").select("id").eq("table_name", table).limit(1).maybeSingle();
  const id = (mod as { id: string } | null)?.id;
  if (!id) return [];
  const { data } = await admin.from("erp_module_fields").select(REG_COLS).eq("module_id", id).order("display_order", { ascending: true });
  return (data ?? []) as RegistryFieldRow[];
}

/** รายการช่องที่ผู้ใช้คนนี้เลือกได้ (ตัดช่องที่ไม่มีสิทธิ์แล้ว) */
export async function loadSpecCatalog(request: NextRequest, admin: Admin): Promise<SpecField[]> {
  const [pRows, sRows, pAccess, sAccess] = await Promise.all([
    registryRows(admin, "parent_skus_v2"), registryRows(admin, "skus_v2"),
    getFieldAccess(request, admin, "parent_skus_v2"), getFieldAccess(request, admin, "skus_v2"),
  ]);
  const perms = new Set<string>();
  for (const r of [...pRows, ...sRows]) if (r.is_sensitive) perms.add(r.sensitive_permission || "products.cost.view");
  const granted = new Set<string>();
  await Promise.all([...perms].map(async (p) => { if (await apiCan(request, p)) granted.add(p); }));
  const hideP = new Set(pAccess.hiddenCols), hideS = new Set(sAccess.hiddenCols);
  return buildSpecCatalog(
    pRows.filter((r) => !hideP.has(String(r.column_name ?? ""))),
    sRows.filter((r) => !hideS.has(String(r.column_name ?? ""))),
    (p) => granted.has(p),
  );
}

const chunk = <T,>(arr: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/** ข้อมูล JSON (จุดเด่น / ใส่อะไรได้ / ช่องใส่ของ) → ข้อความอ่านได้ */
export function jsonToText(v: unknown, lang: "th" | "en"): string | null {
  if (v == null) return null;
  const pick = (o: Record<string, unknown>): string => {
    const en = lang === "en" ? (o.label_en ?? o.name_en ?? o.en ?? o.text_en) : undefined;
    const main = en ?? o.label ?? o.name ?? o.text ?? o.title ?? o.value;
    const size = ["w", "h", "d"].map((k) => o[k]).filter((x) => x != null && x !== "");
    const base = main != null ? String(main) : Object.values(o).filter((x) => typeof x === "string" || typeof x === "number").join(" ");
    return size.length ? `${base} (${size.join("×")} cm)` : base;
  };
  if (Array.isArray(v)) {
    const parts = v.map((x) => (x && typeof x === "object" ? pick(x as Record<string, unknown>) : String(x ?? ""))).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.items)) return jsonToText(o.items, lang);
    const parts = Object.entries(o).filter(([, x]) => x != null && x !== "" && typeof x !== "object").map(([k, x]) => `${k}: ${x}`);
    return parts.length ? parts.join(", ") : null;
  }
  return String(v);
}

function plain(f: SpecField, v: unknown, lang: SpecLang): SpecValue {
  if (v == null || v === "") return null;
  if (f.kind === "number") { const n = Number(v); return Number.isFinite(n) ? n : String(v); }
  if (f.kind === "bool") return v === true ? (lang === "en" ? "Yes" : "ใช่") : v === false ? (lang === "en" ? "No" : "ไม่") : String(v);
  if (f.kind === "date") return String(v).slice(0, 10);
  if (f.kind === "json") return jsonToText(v, lang === "en" ? "en" : "th");
  if (typeof v === "object") return jsonToText(v, "th");
  return String(v).slice(0, 32000);   // Excel รับได้ 32,767 ตัวอักษร/ช่อง
}

/** ชื่อของช่องผูก: table → (id → ชื่อ) */
async function relationLabels(admin: Admin, fields: SpecField[], rows: Record<string, unknown>[]): Promise<Map<string, Map<string, string>>> {
  const byTable = new Map<string, { label: string; ids: Set<string> }>();
  for (const f of fields) {
    if (!f.relation) continue;
    const key = `${f.relation.table}|${f.relation.labelField}`;
    const e = byTable.get(key) ?? { label: f.relation.labelField, ids: new Set<string>() };
    for (const r of rows) { const id = r[f.column]; if (typeof id === "string" && id) e.ids.add(id); }
    byTable.set(key, e);
  }
  const out = new Map<string, Map<string, string>>();
  await Promise.all([...byTable.entries()].map(async ([key, e]) => {
    const table = key.split("|")[0];
    const m = new Map<string, string>();
    for (const ids of chunk([...e.ids], 150)) {
      try {
        const { data } = await admin.from(table).select(`id, ${e.label}`).in("id", ids);
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) m.set(String(row.id), String(row[e.label] ?? ""));
      } catch { /* ตารางปลายทางอ่านไม่ได้ = โชว์ว่าง */ }
    }
    out.set(key, m);
  }));
  return out;
}

function valuesFor(
  row: Record<string, unknown>, fields: SpecField[], lang: SpecLang,
  rel: Map<string, Map<string, string>>, related: Map<string, Map<string, Record<string, unknown>>>,
): Record<string, SpecValue> {
  const out: Record<string, SpecValue> = {};
  for (const f of fields) {
    if (f.kind === "relation" && f.relation) {
      const id = row[f.column];
      out[f.column] = typeof id === "string" ? (rel.get(`${f.relation.table}|${f.relation.labelField}`)?.get(id) || null) : null;
    } else if (f.kind === "related" && f.related) {
      const id = row[f.related.via];
      out[f.column] = plain(f, typeof id === "string" ? related.get(f.related.table)?.get(id)?.[f.related.field] : null, lang);
    } else if (f.kind === "computed" && f.compute) {
      out[f.column] = computedTextValue(f.compute.name, row, f.compute.cfg) || null;
      if (f.enColumn) out[f.enColumn] = f.compute.enName ? (computedTextValue(f.compute.enName, row, f.compute.enCfg) || null) : null;
    } else {
      out[f.column] = plain(f, row[f.column], lang);
      if (f.enColumn) out[f.enColumn] = plain(f, row[f.enColumn], lang);
    }
  }
  return out;
}

/**
 * ข้อความคำนวณของ Parent (เช่น "platform_description" = Platform Description ที่ป๊อป Parent SKU โชว์) — ฝั่ง server · ของกลาง
 * ทำไม: ช่องนี้ "คำนวณสด" ตอนเปิดป๊อป (lib/computed-text + บล็อก ⚙) ไม่ได้เขียนกลับคอลัมน์ → คอลัมน์ platform_description เป็นค่าเก่า (นำเข้าจาก Odoo)
 *   เจอ 2026-11-20: หน้าลงสินค้า Shopee/Lazada ดึงคอลัมน์ = รายละเอียดเก่า ไม่ตรงกับที่เห็นใน Parent SKU
 * คืน { id: { th, en } } · ไม่มีช่องในทะเบียน/คำนวณไม่ได้ = ไม่มีคีย์ (ผู้เรียกใช้คอลัมน์เดิมแทน)
 */
export async function loadParentComputedTexts(admin: Admin, ids: string[], computeName: string): Promise<Record<string, { th: string | null; en: string | null }>> {
  if (!ids.length) return {};
  const catalog = buildSpecCatalog(await registryRows(admin, "parent_skus_v2"), [], () => true);
  const f = catalog.find((x) => x.level === "parent" && x.kind === "computed" && x.compute?.name === computeName);
  if (!f) return {};
  const prods = await loadSpecProducts(admin, catalog, ids, [f.key], "th");
  const txt = (v: unknown) => (v == null ? null : String(v).trim() ? String(v) : null);
  return Object.fromEntries(prods.map((p) => [p.id, { th: txt(p.values[f.column]), en: f.enColumn ? txt(p.values[f.enColumn]) : null }]));
}

/**
 * ค่าจริงของหลายรุ่น + SKU ลูก (เฉพาะช่องที่เลือกและมีสิทธิ์ — catalog ต้องมาจาก loadSpecCatalog)
 * คืนเรียงตามลำดับ ids ที่ส่งมา
 */
export async function loadSpecProducts(admin: Admin, catalog: SpecField[], ids: string[], fieldKeys: string[], lang: SpecLang): Promise<SpecProduct[]> {
  const allowed = new Map(catalog.map((f) => [f.key, f]));
  const chosen = fieldKeys.map((k) => allowed.get(k)).filter((f): f is SpecField => !!f);
  const pFields = chosen.filter((f) => f.level === "parent");
  const sFields = chosen.filter((f) => f.level === "sku");
  // ช่องคำนวณอ่านหลายช่องในแถว (ชื่อ/ขนาด/คำอธิบายจากตารางอื่น) → เติมช่อง related ทุกตัวเข้าแถวด้วย
  const needCompute = pFields.some((f) => f.kind === "computed");
  const relatedForRow = needCompute ? catalog.filter((f) => f.level === "parent" && f.kind === "related") : pFields.filter((f) => f.kind === "related");

  const parents: Record<string, unknown>[] = [];
  for (const part of chunk(ids, 150)) {
    const { data, error } = await admin.from("parent_skus_v2")
      .select("*, brands ( name ), collections ( name ), product_categories ( name )").in("id", part);
    if (error) throw new Error("โหลดข้อมูลสินค้าไม่สำเร็จ");
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const nm = (k: string) => ((r[k] as { name?: string } | null)?.name ?? null);
      parents.push({ ...r, brand_label: nm("brands"), brand_name: nm("brands"), collection_label: nm("collections"), category_label: nm("product_categories") });
    }
  }
  const webFields: ParentWebField[] = relatedForRow.map((f) => ({ key: f.fieldKey, label: f.label, group: "content", related: f.related }));
  const [pRel, related] = await Promise.all([
    relationLabels(admin, pFields, parents),
    resolveRelatedValues(admin, webFields, parents),
  ]);
  // ค่า related เข้าแถว (คีย์ = field_key) ให้สูตรคำนวณใช้
  for (const p of parents) for (const f of relatedForRow) {
    const id = p[f.related!.via];
    p[f.fieldKey] = typeof id === "string" ? related.get(f.related!.table)?.get(id)?.[f.related!.field] ?? null : null;
  }

  // SKU ลูก
  const kidsBy = new Map<string, SpecKid[]>();
  const kidRows: Record<string, unknown>[] = [];
  for (const part of chunk(ids, 150)) {
    const { data } = await admin.from("skus_v2").select("*").in("parent_sku_id", part)
      .order("color_index", { ascending: true, nullsFirst: false }).order("code", { ascending: true });
    kidRows.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const sRel = await relationLabels(admin, sFields, kidRows);
  const colorCols = ["color_platform_th", "color_platform_en", "color_th", "color"];
  for (const k of kidRows) {
    const values = valuesFor(k, sFields, lang, sRel, new Map());
    for (const c of colorCols) if (!(c in values)) values[c] = k[c] == null || k[c] === "" ? null : String(k[c]);   // ใช้กับช่องสรุปสี
    const kid: SpecKid = { id: String(k.id), code: String(k.code ?? ""), active: k.is_active !== false, values };
    const pid = String(k.parent_sku_id);
    kidsBy.set(pid, [...(kidsBy.get(pid) ?? []), kid]);
  }

  const byId = new Map(parents.map((p) => [String(p.id), p]));
  const out: SpecProduct[] = [];
  for (const id of ids) {
    const p = byId.get(id) as (Record<string, unknown> & { code?: unknown }) | undefined;
    if (!p) continue;
    out.push({ id, code: String(p.code ?? ""), name: (p.name_th as string) || null, image: (p.cover_image_r2_key as string) || null, values: valuesFor(p, pFields, lang, pRel, related), kids: kidsBy.get(id) ?? [] });
  }
  return out;
}
