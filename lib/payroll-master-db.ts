/**
 * Payroll module — Master data layer (generic) / Phase 2
 *
 * route กลางตัวเดียวรองรับหลายตาราง master ของ payroll (กัน bundle โต → กัน 1102):
 *   departments (แผนก) · companies (บริษัท) · periods (งวดเงินเดือน)
 *
 * ต่อตารางจริงผ่าน service-role + map relation (เช่น period.company_id → ชื่อบริษัท)
 * soft delete เท่านั้น (เปลี่ยน status) — กันลบข้อมูลจริง
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

type Relation = { field: string; table: string; as: string };
type EntityCfg = {
  table:       string;
  cols:        string;
  search:      string[];
  statusField: string;        // คอลัมน์ที่ใช้เป็น active/archive
  activeVal:   string;        // ค่าที่ถือว่า active
  inactiveVal: string;        // ค่าตอน soft-delete
  writable:    string[];
  required:    string[];
  numeric?:    string[];
  relation?:   Relation;      // map FK → ชื่อ (เช่น company_id → company_name)
  defaultSort: string;
};

export const PAYROLL_ENTITIES: Record<string, EntityCfg> = {
  departments: {
    table: "departments",
    cols: "id, code, name, status, note, display_order, created_at, updated_at",
    search: ["code", "name"],
    statusField: "status", activeVal: "active", inactiveVal: "inactive",
    writable: ["code", "name", "status", "note", "display_order"],
    required: ["name"], numeric: ["display_order"],
    defaultSort: "display_order",
  },
  companies: {
    table: "companies",
    cols: "id, company_code, name, tax_id, address, status, note, created_at, updated_at",
    search: ["company_code", "name"],
    statusField: "status", activeVal: "active", inactiveVal: "inactive",
    writable: ["company_code", "name", "tax_id", "address", "status", "note"],
    required: ["name"],
    defaultSort: "company_code",
  },
  "work-time-profiles": {
    table: "work_time_profiles",
    cols: "id, profile_code, profile_name, morning_check_in_cutoff, noon_check_in_cutoff, checkout_required_at, early_checkout_grace_minutes, status, sort_order, note, created_at, updated_at",
    search: ["profile_code", "profile_name"],
    statusField: "status", activeVal: "active", inactiveVal: "inactive",
    writable: ["profile_code", "profile_name", "morning_check_in_cutoff", "noon_check_in_cutoff", "checkout_required_at", "early_checkout_grace_minutes", "status", "sort_order", "note"],
    required: ["profile_name"], numeric: ["early_checkout_grace_minutes", "sort_order"],
    defaultSort: "sort_order",
  },
  periods: {
    table: "payroll_periods",
    cols: "id, period_name, start_date, end_date, payment_date, status, default_work_days, default_hours_per_day, company_id, created_at, updated_at",
    search: ["period_name"],
    statusField: "status", activeVal: "draft", inactiveVal: "cancelled",
    writable: ["period_name", "start_date", "end_date", "payment_date", "status", "default_work_days", "default_hours_per_day"],
    required: ["period_name", "start_date", "end_date"],
    numeric: ["default_work_days", "default_hours_per_day"],
    relation: { field: "company_id", table: "companies", as: "company_name" },
    defaultSort: "start_date",
  },
};

export type MasterRow = Record<string, unknown> & { id: string };

export function getEntityCfg(entity: string): EntityCfg | null {
  return PAYROLL_ENTITIES[entity] ?? null;
}

async function relationMap(rel: Relation): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin().from(rel.table).select("id, name");
  const m: Record<string, string> = {};
  (data ?? []).forEach((r) => { m[(r as { id: string }).id] = (r as { name: string }).name; });
  return m;
}
async function nameToId(rel: Relation, name: string): Promise<string | null> {
  if (!name) return null;
  const { data } = await supabaseAdmin().from(rel.table).select("id").eq("name", name).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

function decorate(cfg: EntityCfg, row: Record<string, unknown>, relMap: Record<string, string> | null): MasterRow {
  const out: MasterRow = { ...row, id: row.id as string, active: row[cfg.statusField] === cfg.activeVal };
  if (cfg.relation && relMap) {
    out[cfg.relation.as] = row[cfg.relation.field] ? (relMap[row[cfg.relation.field] as string] ?? "") : "";
  }
  return out;
}

export async function listMaster(cfg: EntityCfg, includeInactive: boolean): Promise<MasterRow[]> {
  let q = supabaseAdmin().from(cfg.table).select(cfg.cols).order(cfg.defaultSort, { ascending: true });
  if (!includeInactive) q = q.eq(cfg.statusField, cfg.activeVal);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const relMap = cfg.relation ? await relationMap(cfg.relation) : null;
  return (data ?? []).map((r) => decorate(cfg, r as Record<string, unknown>, relMap));
}

export async function getMaster(cfg: EntityCfg, id: string): Promise<MasterRow | null> {
  const { data, error } = await supabaseAdmin().from(cfg.table).select(cfg.cols).eq("id", id).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const relMap = cfg.relation ? await relationMap(cfg.relation) : null;
  return decorate(cfg, data[0] as Record<string, unknown>, relMap);
}

async function toColumns(cfg: EntityCfg, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) { if (cfg.writable.includes(k)) out[k] = v; }
  for (const k of cfg.numeric ?? []) { if (k in out) out[k] = out[k] === "" ? null : Number(out[k]) || 0; }
  if ("active" in body && !(cfg.statusField in out)) {
    out[cfg.statusField] = body.active === true || body.active === "true" ? cfg.activeVal : cfg.inactiveVal;
  }
  if (cfg.relation && cfg.relation.as in body) {
    out[cfg.relation.field] = await nameToId(cfg.relation, String(body[cfg.relation.as] ?? ""));
  }
  for (const k of ["start_date", "end_date", "payment_date"]) { if (out[k] === "") out[k] = null; }
  return out;
}

export async function createMaster(cfg: EntityCfg, body: Record<string, unknown>): Promise<MasterRow> {
  for (const r of cfg.required) {
    if (!body[r] || String(body[r]).trim() === "") throw new Error(`ต้องระบุ ${r}`);
  }
  const cols = await toColumns(cfg, body);
  const { data, error } = await supabaseAdmin().from(cfg.table).insert(cols).select(cfg.cols).limit(1);
  if (error) throw new Error(error.message);
  const relMap = cfg.relation ? await relationMap(cfg.relation) : null;
  return decorate(cfg, data![0] as Record<string, unknown>, relMap);
}

export async function updateMaster(cfg: EntityCfg, id: string, body: Record<string, unknown>): Promise<MasterRow | null> {
  const cols = await toColumns(cfg, body);
  if (Object.keys(cols).length === 0) return getMaster(cfg, id);
  const { data, error } = await supabaseAdmin().from(cfg.table).update(cols).eq("id", id).select(cfg.cols).limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) return null;
  const relMap = cfg.relation ? await relationMap(cfg.relation) : null;
  return decorate(cfg, data[0] as Record<string, unknown>, relMap);
}

export async function softDeleteMaster(cfg: EntityCfg, id: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from(cfg.table).update({ [cfg.statusField]: cfg.inactiveVal }).eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
