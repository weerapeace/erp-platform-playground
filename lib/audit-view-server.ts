/**
 * เตรียมแถวประวัติก่อนส่งให้หน้าจอ (ฝั่งเซิร์ฟเวอร์ · ของกลาง) — ใช้ใน /api/audit-logs
 *
 *   1) ชื่อคนทำ: ชื่อเล่นจาก user_profiles (แทนอีเมล) — หาไม่เจอใช้ค่าที่จดไว้
 *   2) ชื่อช่อง: จากทะเบียน field กลาง (erp_module_fields.field_label)
 *   3) ซ่อนค่าอ่อนไหวตามสิทธิ์ผู้ดู:
 *        - ช่องที่ทะเบียน field จำกัด view_roles / sensitive_permission (เช่น ราคาทุน = products.cost.view)
 *        - งานบุคคล/เงินเดือน/เงินกู้: ช่องตัวเงิน/บัญชี ต้องมีสิทธิ์แอป Payroll (app.payroll + employees.view)
 *      ค่าที่ซ่อนถูกตัดออกจาก metadata ด้วย — ไม่ส่งถึงเบราว์เซอร์เลย (ไม่ใช่แค่ซ่อนบนจอ)
 *   4) แนบ view = ผลแปลภาษาคน (lib/audit-format describeAudit)
 */
import { apiCan } from "@/lib/api-auth";
import { getUserRole } from "@/lib/field-permissions";
import { describeAudit, type AuditView } from "@/lib/audit-format";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { NextRequest } from "next/server";

type Admin = ReturnType<typeof supabaseAdmin>;

export type RawAuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type EnrichedAuditRow = Omit<RawAuditRow, "metadata"> & {
  actor_name: string;
  metadata: Record<string, unknown>;
  view: AuditView;
};

type FieldMeta = { label: string; viewRoles: string[] | null; perm: string | null };

const FIELD_TTL = 5 * 60_000;
const fieldCache = new Map<string, { at: number; fields: Record<string, FieldMeta> }>();

/** ทะเบียน field ของตารางที่อยู่ในหน้านี้ (แคช 5 นาที) */
async function loadFieldMeta(admin: Admin, tables: string[]): Promise<Record<string, Record<string, FieldMeta>>> {
  const out: Record<string, Record<string, FieldMeta>> = {};
  const need: string[] = [];
  for (const t of tables) {
    const hit = fieldCache.get(t);
    if (hit && Date.now() - hit.at < FIELD_TTL) out[t] = hit.fields; else need.push(t);
  }
  if (need.length === 0) return out;
  const { data: mods } = await admin.from("erp_modules").select("id, table_name").in("table_name", need);
  const fresh: Record<string, Record<string, FieldMeta>> = Object.fromEntries(need.map((t) => [t, {}]));
  // ทีละโมดูล — กันชนเพดาน 1,000 แถวต่อคำขอ
  await Promise.all(((mods ?? []) as { id: string; table_name: string }[]).map(async (mod) => {
    const { data: flds } = await admin.from("erp_module_fields")
      .select("column_name, field_label, view_roles, sensitive_permission")
      .eq("module_id", mod.id);
    for (const f of (flds ?? []) as { column_name: string | null; field_label: string | null; view_roles: string[] | null; sensitive_permission: string | null }[]) {
      if (!f.column_name) continue;
      fresh[mod.table_name][f.column_name] = {
        label: f.field_label || f.column_name,
        viewRoles: f.view_roles?.length ? f.view_roles : null,
        perm: f.sensitive_permission || null,
      };
    }
  }));
  for (const t of need) { fieldCache.set(t, { at: Date.now(), fields: fresh[t] }); out[t] = fresh[t]; }
  return out;
}

/** งานบุคคล/เงินเดือน/เงินกู้ — ช่องตัวเงิน/บัญชีต้องมีสิทธิ์ Payroll */
const PAY_ENTITY = /(payroll|salary|wage|employee|contract|loan|^od_|bank|cash|attendance|overtime|leave)/;
const PAY_KEY = /(amount|salary|wage|total|price|cost|pay|tax|bank|account|national_id|passport|visa|work_permit|social_security|advance|rate|income|deduct)/i;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ชื่อช่องทั้งหมดที่ metadata พูดถึง (บนสุด + ใน changes/before/after) */
function fieldNamesIn(m: Record<string, unknown>): string[] {
  const s = new Set<string>(Object.keys(m));
  const ch = m.changes;
  if (Array.isArray(ch)) for (const c of ch) { if (isObj(c) && typeof c.field === "string") s.add(c.field); else if (typeof c === "string") s.add(c); }
  else if (isObj(ch)) for (const k of Object.keys(ch)) s.add(k);
  for (const k of ["before", "after"]) if (isObj(m[k])) for (const f of Object.keys(m[k] as object)) s.add(f);
  if (typeof m.field === "string") s.add(m.field);
  return [...s];
}

/** ตัดค่าของช่องที่ซ่อนออกจาก metadata (ชื่อช่องยังอยู่ — รู้ว่าแก้ แต่ไม่รู้ค่า) */
export function redactAuditMetadata(m: Record<string, unknown>, hidden: Set<string>): Record<string, unknown> {
  if (hidden.size === 0) return m;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) if (!hidden.has(k)) out[k] = v;
  if (Array.isArray(m.changes)) {
    out.changes = m.changes.map((c) => (isObj(c) && typeof c.field === "string" && hidden.has(c.field) ? { field: c.field, label: c.label, hidden: true } : c));
  } else if (isObj(m.changes)) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m.changes)) o[k] = hidden.has(k) ? { hidden: true } : v;
    out.changes = o;
  }
  for (const k of ["before", "after"]) {
    if (!isObj(m[k])) continue;
    const o: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(m[k] as Record<string, unknown>)) if (!hidden.has(f)) o[f] = v;
    out[k] = o;
  }
  if (typeof m.field === "string" && hidden.has(m.field)) { delete out.from; delete out.to; }
  return out;
}

// ── รายชื่อผู้ใช้ (ตารางเล็ก แคช 5 นาที) — ใช้แปลงอีเมล/รหัสเป็นชื่อเล่น + ตัวกรองคน ──
export type AuditProfile = { id: string; display_name: string | null; email: string | null };
let profileCache: { at: number; rows: AuditProfile[] } | null = null;

export async function loadAuditProfiles(admin: Admin): Promise<AuditProfile[]> {
  if (profileCache && Date.now() - profileCache.at < FIELD_TTL) return profileCache.rows;
  const { data, error } = await admin.from("user_profiles").select("id, display_name, email").limit(1000);
  if (error) return profileCache?.rows ?? [];
  profileCache = { at: Date.now(), rows: (data ?? []) as AuditProfile[] };
  return profileCache.rows;
}

/**
 * ประวัติเก่าที่ไม่ได้จดเลขเอกสาร/ชื่อไว้ → ดึงจากตารางจริงด้วย entity_id (เฉพาะชนิดที่รู้คอลัมน์แน่นอน)
 * ชื่อ/รหัสเท่านั้น ไม่มีช่องอ่อนไหว
 */
const LABEL_SOURCES: Record<string, { table: string; code?: string; name?: string }> = {
  skus_v2:                     { table: "skus_v2", code: "code", name: "name_th" },
  parent_skus_v2:              { table: "parent_skus_v2", code: "code", name: "name_th" },
  partners_v2:                 { table: "partners_v2", name: "name_th" },
  purchase_requests_v2:        { table: "purchase_requests_v2", code: "pr_no", name: "item_name" },
  purchase_orders_v2:          { table: "purchase_orders_v2", code: "po_no" },
  purchase_vouchers_v2:        { table: "purchase_vouchers_v2", code: "pv_no" },
  creative_task:               { table: "erp_creative_tasks", code: "task_no", name: "title" },
  creative_campaign:           { table: "erp_creative_campaigns", name: "name" },
  design_sheet:                { table: "design_sheets", code: "code", name: "name" },
  brand:                       { table: "brands", name: "name" },
  mo:                          { table: "manufacturing_orders", code: "mo_no" },
  manufacturing_orders:        { table: "manufacturing_orders", code: "mo_no" },
  erp_playground_so:           { table: "erp_playground_sales_orders", code: "so_number" },
  erp_playground_quote:        { table: "erp_playground_quotations", code: "quote_number" },
  erp_playground_delivery_note:{ table: "erp_playground_delivery_notes", code: "dn_number" },
  erp_playground_credit_note:  { table: "erp_playground_credit_notes", code: "cn_number" },
  employees:                   { table: "employees", name: "nickname" },
  employee_contracts:          { table: "employee_contracts", code: "contract_no" },
  payroll_periods:             { table: "payroll_periods", name: "period_name" },
  pattern_tickets:             { table: "pattern_tickets", code: "ticket_no" },
  china_transfers:             { table: "china_transfers", code: "transfer_no" },
  supplier_items:              { table: "supplier_items", code: "supplier_sku" },
  product_highlight_items:     { table: "product_highlight_items", name: "name" },
  product_materials:           { table: "product_materials", name: "name" },
};

async function lookupRecordLabels(admin: Admin, need: { entity_type: string; entity_id: string }[]): Promise<Map<string, { code: string | null; name: string | null }>> {
  const out = new Map<string, { code: string | null; name: string | null }>();
  const byType = new Map<string, Set<string>>();
  for (const n of need) {
    if (!LABEL_SOURCES[n.entity_type]) continue;
    const s = byType.get(n.entity_type) ?? new Set<string>();
    s.add(n.entity_id); byType.set(n.entity_type, s);
  }
  await Promise.all([...byType].map(async ([type, ids]) => {
    const src = LABEL_SOURCES[type];
    const cols = ["id", src.code, src.name].filter(Boolean).join(",");
    const { data, error } = await admin.from(src.table).select(cols).in("id", [...ids]);
    if (error) return;   // ตารางเปลี่ยน/ไม่มีคอลัมน์ = ข้ามเงียบ ๆ (ไม่ทำให้หน้าพัง)
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const pick = (c?: string) => (c && (typeof r[c] === "string" || typeof r[c] === "number") && String(r[c]).trim() ? String(r[c]).trim().slice(0, 120) : null);
      out.set(`${type}:${r.id}`, { code: pick(src.code), name: pick(src.name) });
    }
  }));
  return out;
}

/** แถวดิบ → แถวพร้อมแสดง (ชื่อคน · ชื่อช่อง · ซ่อนค่าตามสิทธิ์ · view) */
export async function enrichAuditRows(request: NextRequest, admin: Admin, rows: RawAuditRow[]): Promise<EnrichedAuditRow[]> {
  if (rows.length === 0) return [];

  // ⚡ ยิงขนาน: รายชื่อผู้ใช้ (แคช) · ทะเบียน field · สิทธิ์ผู้ดูทำต่อทีหลัง
  const tables = [...new Set(rows.map((r) => r.entity_type))];
  const [profiles, fieldMeta] = await Promise.all([loadAuditProfiles(admin), loadFieldMeta(admin, tables)]);
  const nameById = new Map<string, string>();
  const nameByEmail = new Map<string, string>();
  for (const p of profiles) {
    const n = p.display_name?.trim();
    if (!n) continue;
    nameById.set(p.id, n);
    if (p.email) nameByEmail.set(p.email.toLowerCase(), n);
  }
  const perms = new Set<string>();
  for (const t of tables) for (const f of Object.values(fieldMeta[t] ?? {})) if (f.perm) perms.add(f.perm);
  const needRole = tables.some((t) => Object.values(fieldMeta[t] ?? {}).some((f) => f.viewRoles));
  const needPay = tables.some((t) => PAY_ENTITY.test(t));
  // แถวเก่าที่ไม่ได้จดเลขเอกสาร/ชื่อ → หาจากตารางจริง (ยิงพร้อมกับเช็กสิทธิ์)
  const LABEL_HINT_KEYS = ["code", "pr_no", "po_no", "pv_no", "so_number", "mo_no", "task_no", "ticket_no", "name", "name_th", "title", "item_name", "sku", "bom_code"];
  const unlabeled = rows
    .filter((r) => r.entity_id && LABEL_SOURCES[r.entity_type] && !(isObj(r.metadata) && LABEL_HINT_KEYS.some((k) => r.metadata![k])))
    .map((r) => ({ entity_type: r.entity_type, entity_id: r.entity_id as string }));

  const [role, permOk, payOk, labels] = await Promise.all([
    needRole || needPay ? getUserRole(request) : Promise.resolve(""),
    Promise.all([...perms].map(async (p) => [p, await apiCan(request, p)] as const)).then((xs) => new Map(xs)),
    needPay ? Promise.all([apiCan(request, "app.payroll"), apiCan(request, "employees.view")]).then(([a, b]) => a && b) : Promise.resolve(true),
    unlabeled.length ? lookupRecordLabels(admin, unlabeled) : Promise.resolve(new Map<string, { code: string | null; name: string | null }>()),
  ]);
  const isAdmin = role === "admin";

  return rows.map((r) => {
    const m = isObj(r.metadata) ? r.metadata : {};
    const fm = fieldMeta[r.entity_type] ?? {};
    const hidden = new Set<string>();
    if (!isAdmin) {
      for (const [col, f] of Object.entries(fm)) {
        if ((f.viewRoles && !f.viewRoles.includes(role)) || (f.perm && !permOk.get(f.perm))) hidden.add(col);
      }
      if (!payOk && PAY_ENTITY.test(r.entity_type)) for (const k of fieldNamesIn(m)) if (PAY_KEY.test(k)) hidden.add(k);
    }
    const fieldLabels: Record<string, string> = {};
    for (const [col, f] of Object.entries(fm)) fieldLabels[col] = f.label;

    const actorRaw = typeof m.actor === "string" ? m.actor : typeof m.actor_name === "string" ? m.actor_name : "";
    const actor_name =
      (r.actor_user_id && nameById.get(r.actor_user_id)) ||
      (actorRaw.includes("@") ? nameByEmail.get(actorRaw.toLowerCase()) : undefined) ||
      actorRaw || "ระบบ";

    // ช่องที่ซ่อน "ที่มีอยู่จริงในแถวนี้" เท่านั้นที่ต้องตัด
    const present = new Set(fieldNamesIn(m));
    const hiddenHere = new Set([...hidden].filter((h) => present.has(h)));
    const view = describeAudit({ action: r.action, entity_type: r.entity_type, entity_id: r.entity_id, metadata: m }, { fieldLabels: fieldLabels, hiddenFields: hiddenHere });
    if (!view.recordCode && !view.recordName && r.entity_id) {
      const found = labels.get(`${r.entity_type}:${r.entity_id}`);
      if (found) { view.recordCode = found.code; view.recordName = found.name; }
    }
    return {
      id: r.id, action: r.action, entity_type: r.entity_type, entity_id: r.entity_id,
      actor_user_id: r.actor_user_id, created_at: r.created_at,
      actor_name,
      metadata: redactAuditMetadata(m, hiddenHere),
      view,
    };
  });
}
