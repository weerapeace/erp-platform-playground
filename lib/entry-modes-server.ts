/**
 * 📝 โหมดลงรายละเอียด — ฝั่งเซิร์ฟเวอร์ (ของกลาง): นับ "ทั้งระบบเหลือกี่ตัวที่ยังไม่ครบโหมดนี้"
 *
 * ใช้กฎเดียวกับหน้าจอในป๊อป (computeModeProgress ใน lib/entry-modes) → ตัวเลขตรงกันทุกที่:
 *   - ช่องว่าง / ขีด (-, —, N/A) = ยังไม่ลง · ติ๊ก = ต้องเป็น "ใช่"
 *   - ช่องที่ประเภทสินค้า (Product Family) ซ่อนไว้ / section whitelist ตามแท็ก / เงื่อนไขโชว์ไม่ผ่าน = ไม่นับ
 *   - แท็กหลายรายการ (many2many) = ต้องผูกอย่างน้อย 1 รายการ
 *   - จำนวนรูป = นับรูปในแกลเลอรี (erp_playground_attachments) เฉพาะโมดูลสินค้า
 *   - นับเฉพาะรายการที่เปิดใช้อยู่ (is_active)
 *   ⚠️ ไม่ตัดช่องตามสิทธิ์ระดับฟิลด์ของผู้ดู (ตัวเลขเป็นของข้อมูล ไม่ขึ้นกับคนดู)
 *
 * ผู้ใช้: GET /api/entry-modes/stats · ตัวกรองตาราง master-v2 (?mode_incomplete=) · รายงานข้อมูลค้าง (scope=modes:<module>)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { evaluateCondition } from "@/lib/field-helpers";
import {
  ENTRY_MODE_IMAGE_ENTITY, IMAGES_KEY, computeModeProgress, isModeIncomplete, resolveEntryModes,
  type EntryMode, type EntryModeLevel, type EntryModeProgress, type EntryModeStat,
} from "@/lib/entry-modes";

export type { EntryModeStat };
type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

type FieldMeta = {
  key: string;
  column: string | null;
  uiType: string;
  group: string;
  label: string;
  condition: Record<string, unknown> | null;
  junction: string | null;       // many2many → ตาราง junction (src_id/tgt_id)
};
type FamilyTpl = { show: Set<string>; hide: Set<string>; hideSec: Set<string> };

export type EntryModeContext = {
  moduleKey: string;
  table: string;
  softDelete: boolean;
  modes: EntryMode[];
  fields: Map<string, FieldMeta>;
  imageEntity: string | null;
  familyJunction: string | null;
  familyTpl: Map<string, FamilyTpl>;
  sectionTagRules: Record<string, string[]>;
};

const SAFE = /^[a-z_][a-z0-9_]*$/i;
const VIRTUAL = new Set(["computed", "one2many", "related", "image"]);
const TTL = 30_000;
const ctxCache = new Map<string, { at: number; v: EntryModeContext | null }>();
const dataCache = new Map<string, { at: number; v: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = dataCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  const v = await load();
  dataCache.set(key, { at: Date.now(), v });
  return v;
}

/** ดึงทุกแถว (ทีละ 1,000 — เพดาน PostgREST) สูงสุด cap แถว */
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, cap = 50_000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/** ข้อมูลโมดูล + โหมด + ทะเบียนฟิลด์ + เทมเพลตประเภทสินค้า (จำไว้ 30 วิ) — หาได้ทั้งจาก moduleKey หรือชื่อตาราง */
export async function loadEntryModeContext(admin: Admin, by: { moduleKey?: string; table?: string }): Promise<EntryModeContext | null> {
  const ck = by.moduleKey ? `m:${by.moduleKey}` : `t:${by.table}`;
  const hit = ctxCache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  let q = admin.from("erp_modules").select("id, module_key, table_name, config");
  q = by.moduleKey ? q.eq("module_key", by.moduleKey) : q.eq("table_name", by.table ?? "");
  const { data: mods } = await q.limit(1);
  const mod = (mods ?? [])[0] as Row | undefined;
  if (!mod || !SAFE.test(String(mod.table_name ?? ""))) { ctxCache.set(ck, { at: Date.now(), v: null }); return null; }
  const moduleKey = String(mod.module_key);
  const cfg = (mod.config ?? {}) as Record<string, unknown>;
  const modes = resolveEntryModes(moduleKey, cfg.entry_modes);

  const { data: flds } = await admin.from("erp_module_fields")
    .select("field_key, column_name, ui_field_type, group_key, field_label, condition_rules, relation_config")
    .eq("module_id", mod.id).eq("is_active", true);
  const fields = new Map<string, FieldMeta>();
  let familyJunction: string | null = null;
  for (const f of (flds ?? []) as Row[]) {
    const rc = (f.relation_config ?? {}) as Record<string, unknown>;
    const uiType = String(f.ui_field_type ?? "text");
    const junction = uiType === "many2many" && typeof rc.junction_table === "string" && SAFE.test(rc.junction_table) ? rc.junction_table : null;
    const col = typeof f.column_name === "string" && SAFE.test(f.column_name) ? f.column_name : null;
    fields.set(String(f.field_key), {
      key: String(f.field_key), column: col, uiType, group: String(f.group_key ?? "other"), label: String(f.field_label ?? f.field_key),
      condition: f.condition_rules && typeof f.condition_rules === "object" ? f.condition_rules as Record<string, unknown> : null, junction,
    });
    if (junction && (rc.target_module_key === "product_families" || rc.target_table === "product_families")) familyJunction ??= junction;
  }

  // เทมเพลตประเภทสินค้า (แบบเดียวกับ drawer: แบบใหม่ {parent_sku, sku} / แบบเก่า flat = ของ Parent)
  const familyTpl = new Map<string, FamilyTpl>();
  if (familyJunction) {
    const scope = moduleKey.includes("sku") && !moduleKey.includes("parent") ? "sku" : "parent_sku";
    const { data: fams } = await admin.from("product_families").select("id, template").not("template", "is", null);
    for (const r of (fams ?? []) as Row[]) {
      const raw = (r.template ?? {}) as Record<string, unknown>;
      const t = (raw.parent_sku !== undefined || raw.sku !== undefined ? raw[scope] ?? {} : scope === "parent_sku" ? raw : {}) as Record<string, unknown>;
      const list = (k: string) => (Array.isArray(t[k]) ? (t[k] as unknown[]).map(String) : []);
      const tpl = { show: new Set(list("show_fields")), hide: new Set(list("hide_fields")), hideSec: new Set(list("hide_sections")) };
      if (tpl.show.size || tpl.hide.size || tpl.hideSec.size) familyTpl.set(String(r.id), tpl);
    }
  }
  const ctx: EntryModeContext = {
    moduleKey, table: String(mod.table_name), softDelete: [...fields.values()].some((f) => f.column === "is_active"),
    modes, fields, imageEntity: ENTRY_MODE_IMAGE_ENTITY[moduleKey] ?? null, familyJunction, familyTpl,
    sectionTagRules: (cfg.section_tag_rules ?? {}) as Record<string, string[]>,
  };
  if (!ctx.softDelete) {
    const { error } = await admin.from(ctx.table).select("is_active").limit(1);
    ctx.softDelete = !error;
  }
  ctxCache.set(ck, { at: Date.now(), v: ctx });
  return ctx;
}

/** คอลัมน์ที่ต้องดึงมาตัดสิน (id + ช่องของโหมด + ช่องที่เงื่อนไขโชว์อ้างถึง) */
export function entryModeColumns(ctx: EntryModeContext, modes: EntryMode[]): string[] {
  const cols = new Set<string>(["id"]);
  const addField = (key: string) => {
    const f = ctx.fields.get(key);
    if (!f) return;
    if (f.column && !VIRTUAL.has(f.uiType) && f.uiType !== "many2many") cols.add(f.column);
    const dep = (f.condition as { show_if?: { field?: string } } | null)?.show_if?.field;
    const df = dep ? ctx.fields.get(dep) : undefined;
    if (df?.column) cols.add(df.column);
  };
  for (const m of modes) for (const it of m.items) addField(it.field);
  return [...cols];
}

/** ตัวตัดสินต่อแถว — โหลดจำนวนรูป + แท็กประเภทสินค้า + ลิงก์แท็กของช่อง many2many ในโหมดครั้งเดียว (จำไว้ 30 วิ) */
export async function buildEntryModeEvaluator(admin: Admin, ctx: EntryModeContext, modes: EntryMode[]): Promise<(mode: EntryMode, row: Row) => EntryModeProgress> {
  const needImages = !!ctx.imageEntity && modes.some((m) => (m.imagesMin ?? 0) > 0);
  const imageCounts = needImages
    ? await cached(`img:${ctx.imageEntity}`, async () => {
        const rows = await fetchAll((a, b) => admin.from("erp_playground_attachments").select("entity_id")
          .eq("entity_type", ctx.imageEntity!).like("content_type", "image/%").range(a, b));
        const m = new Map<string, number>();
        for (const r of rows) { const id = String(r.entity_id); m.set(id, (m.get(id) ?? 0) + 1); }
        return m;
      })
    : null;
  const junctionLinks = async (junction: string) => cached(`jn:${junction}`, async () => {
    const rows = await fetchAll((a, b) => admin.from(junction).select("src_id, tgt_id").range(a, b));
    const m = new Map<string, string[]>();
    for (const r of rows) { const s = String(r.src_id); const arr = m.get(s) ?? []; arr.push(String(r.tgt_id)); m.set(s, arr); }
    return m;
  });
  const needFamilies = !!ctx.familyJunction && (ctx.familyTpl.size > 0 || Object.keys(ctx.sectionTagRules).length > 0);
  const famLinks = needFamilies ? await junctionLinks(ctx.familyJunction!) : null;
  const m2mLinks = new Map<string, Map<string, string[]>>();
  for (const m of modes) for (const it of m.items) {
    const f = ctx.fields.get(it.field);
    if (f?.uiType === "many2many" && f.junction && !m2mLinks.has(f.key)) m2mLinks.set(f.key, await junctionLinks(f.junction));
  }

  return (mode, row) => {
    const id = String(row.id);
    // ค่าตามชื่อช่อง (ทะเบียน) — แถวจาก DB ใช้ชื่อคอลัมน์
    const values: Row = {};
    for (const f of ctx.fields.values()) {
      if (f.column && f.column in row) values[f.key] = row[f.column];
      else if (f.uiType === "many2many" && m2mLinks.has(f.key)) values[f.key] = m2mLinks.get(f.key)!.get(id) ?? [];
    }
    const fams = famLinks?.get(id) ?? [];
    const show = new Set<string>(), hide = new Set<string>(), hideSec = new Set<string>();
    for (const fid of fams) {
      const t = ctx.familyTpl.get(fid); if (!t) continue;
      t.show.forEach((k) => show.add(k)); t.hide.forEach((k) => hide.add(k)); t.hideSec.forEach((k) => hideSec.add(k));
    }
    const skip = (key: string) => {
      const f = ctx.fields.get(key);
      if (!f || VIRTUAL.has(f.uiType)) return true;
      if (f.uiType === "many2many" ? !m2mLinks.has(key) : !f.column) return true;
      if (!evaluateCondition(f.condition, values)) return true;
      if (show.has(key)) return false;
      if (hide.has(key) || hideSec.has(f.group)) return true;
      const allow = ctx.sectionTagRules[f.group];
      if (allow && allow.length > 0 && !fams.some((x) => allow.includes(x))) return true;
      return false;
    };
    return computeModeProgress(mode, values, { skip, imageCount: imageCounts ? imageCounts.get(id) ?? 0 : null });
  };
}


/** สรุปทั้งระบบต่อโหมด (เฉพาะรายการที่เปิดใช้อยู่) · withRows = คืนรายการที่ยังไม่ครบด้วย (ใช้ทำรายงาน) */
export async function entryModeStats(admin: Admin, ctx: EntryModeContext, modes: EntryMode[], opts: { withRows?: string[] } = {}): Promise<{
  stats: EntryModeStat[];
  rows: Map<string, { row: Row; missing: { key: string; level: EntryModeLevel }[] }[]>;
}> {
  const cols = new Set(entryModeColumns(ctx, modes));
  for (const c of opts.withRows ?? []) if (SAFE.test(c)) cols.add(c);
  const evaluate = await buildEntryModeEvaluator(admin, ctx, modes);
  const all = await fetchAll((a, b) => {
    let q = admin.from(ctx.table).select([...cols].join(",")).order("id").range(a, b);
    if (ctx.softDelete) q = q.eq("is_active", true);
    return q;
  });
  const stats: EntryModeStat[] = [];
  const rows = new Map<string, { row: Row; missing: { key: string; level: EntryModeLevel }[] }[]>();
  for (const m of modes) {
    const miss = new Map<string, number>();
    const list: { row: Row; missing: { key: string; level: EntryModeLevel }[] }[] = [];
    let incomplete = 0, recOnly = 0;
    for (const r of all) {
      const p = evaluate(m, r);
      if (p.missing.length === 0) continue;
      for (const x of p.missing) miss.set(x.key, (miss.get(x.key) ?? 0) + 1);
      if (!isModeIncomplete(p)) { recOnly++; continue; }   // ขาดแค่ช่องแนะนำ = ไม่นับว่าไม่ครบ
      incomplete++;
      if (opts.withRows) list.push({ row: r, missing: p.missing });
    }
    const labelOf = (k: string) => (k === IMAGES_KEY ? `รูปสินค้า (อย่างน้อย ${m.imagesMin} รูป)` : ctx.fields.get(k)?.label ?? k);
    const order = [...m.items.map((it) => ({ key: it.field, level: it.level })), ...((m.imagesMin ?? 0) > 0 ? [{ key: IMAGES_KEY, level: m.imagesLevel ?? "required" as EntryModeLevel }] : [])];
    stats.push({
      key: m.key, label: m.label, icon: m.icon, total: all.length, incomplete, recOnly,
      byItem: order.filter((o) => miss.has(o.key)).map((o) => ({ key: o.key, label: labelOf(o.key), level: o.level, missing: miss.get(o.key)! })),
    });
    if (opts.withRows) rows.set(m.key, list);
  }
  return { stats, rows };
}
