/**
 * Payroll module — Read-only view data layer (generic) / Phase 3
 *
 * แสดงข้อมูลที่ "คำนวณแล้ว / operational" แบบอ่านอย่างเดียว (GET เท่านั้น)
 * — payroll_lines (ตรวจสอบเงินเดือน) · payslips · payment_batches
 * — attendance_entries · recurring_pay_items · employee_portal_requests
 *
 * ⚠️ ไม่มี create/update/delete — กันแก้ยอดเงินที่คำนวณแล้ว (ความปลอดภัย/รับผิดชอบ)
 * การคำนวณยังทำที่แอปเดิมจนกว่าจะเทียบยอดเสร็จ (ดู docs/migration-payroll-to-erp.md)
 *
 * รองรับ server-side pagination (limit/offset/total) สำหรับตารางใหญ่ (payroll_lines 2,644)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

type RelKind = "employee" | "period" | "company" | "department" | "contract";
type ViewRel = { field: string; as: string; kind: RelKind };

type ViewCfg = {
  table:       string;
  cols:        string;
  defaultSort: string;
  defaultDir:  "asc" | "desc";
  sortable:    string[];      // คอลัมน์ที่ยอมให้ sort (กัน sql error)
  relations:   ViewRel[];
};

export const VIEW_ENTITIES: Record<string, ViewCfg> = {
  "payroll-lines": {
    table: "payroll_lines",
    cols: "id, employee_id, payroll_period_id, base_salary, gross_pay, total_deduction, social_security_employee, withholding_tax, net_pay, status, created_at",
    defaultSort: "created_at", defaultDir: "desc",
    sortable: ["created_at", "gross_pay", "net_pay", "total_deduction"],
    relations: [
      { field: "employee_id", as: "employee_name", kind: "employee" },
      { field: "payroll_period_id", as: "period_name", kind: "period" },
    ],
  },
  payslips: {
    table: "payroll_payslips",
    cols: "id, payslip_no, employee_id, payroll_period_id, gross_pay, total_deduction, net_pay, status, slip_type, issued_at, created_at",
    defaultSort: "created_at", defaultDir: "desc",
    sortable: ["created_at", "net_pay", "issued_at"],
    relations: [
      { field: "employee_id", as: "employee_name", kind: "employee" },
      { field: "payroll_period_id", as: "period_name", kind: "period" },
    ],
  },
  "payment-batches": {
    table: "payment_batches",
    cols: "id, batch_no, batch_type, payment_date, status, payroll_period_id, note, approved_at, paid_at, created_at",
    defaultSort: "created_at", defaultDir: "desc",
    sortable: ["created_at", "payment_date"],
    relations: [{ field: "payroll_period_id", as: "period_name", kind: "period" }],
  },
  attendance: {
    table: "attendance_entries",
    cols: "id, employee_id, payroll_period_id, work_date, entry_type, regular_hours, late_minutes, late_deduction, absence_hours, absence_deduction, status, source_type",
    defaultSort: "work_date", defaultDir: "desc",
    sortable: ["work_date", "late_minutes"],
    relations: [
      { field: "employee_id", as: "employee_name", kind: "employee" },
      { field: "payroll_period_id", as: "period_name", kind: "period" },
    ],
  },
  recurring: {
    table: "employee_recurring_pay_items",
    cols: "id, employee_id, contract_id, item_name, item_type, amount_per_period, duration_type, calculation_method, status, start_date, end_date",
    defaultSort: "created_at", defaultDir: "desc",
    sortable: ["created_at", "amount_per_period"],
    relations: [
      { field: "employee_id", as: "employee_name", kind: "employee" },
      { field: "contract_id", as: "contract_no", kind: "contract" },
    ],
  },
  requests: {
    table: "employee_portal_requests",
    cols: "id, employee_id, request_type, target_field, old_value, new_value, status, review_note, created_at",
    defaultSort: "created_at", defaultDir: "desc",
    sortable: ["created_at"],
    relations: [{ field: "employee_id", as: "employee_name", kind: "employee" }],
  },
};

export function getViewCfg(entity: string): ViewCfg | null {
  return VIEW_ENTITIES[entity] ?? null;
}

// ---- relation label maps (โหลดครั้งเดียวต่อ request ตามที่ entity ต้องใช้) ----
async function buildMaps(kinds: Set<RelKind>): Promise<Record<RelKind, Record<string, string>>> {
  const a = supabaseAdmin();
  const maps: Record<RelKind, Record<string, string>> = { employee: {}, period: {}, company: {}, department: {}, contract: {} };
  const jobs: PromiseLike<void>[] = [];
  if (kinds.has("employee")) jobs.push(a.from("employees").select("id, employee_code, first_name, last_name, nickname").then(({ data }) => {
    (data ?? []).forEach((e) => {
      const r = e as { id: string; employee_code: string; first_name: string; last_name: string; nickname: string | null };
      const nm = [r.first_name, r.last_name].filter((x) => x && x !== "-").join(" ") || r.nickname || "";
      maps.employee[r.id] = `${r.employee_code}${nm ? " · " + nm : ""}`;
    });
  }));
  if (kinds.has("period")) jobs.push(a.from("payroll_periods").select("id, period_name").then(({ data }) => {
    (data ?? []).forEach((p) => { maps.period[(p as { id: string }).id] = (p as { period_name: string }).period_name; });
  }));
  if (kinds.has("company")) jobs.push(a.from("companies").select("id, name").then(({ data }) => {
    (data ?? []).forEach((c) => { maps.company[(c as { id: string }).id] = (c as { name: string }).name; });
  }));
  if (kinds.has("department")) jobs.push(a.from("departments").select("id, name").then(({ data }) => {
    (data ?? []).forEach((d) => { maps.department[(d as { id: string }).id] = (d as { name: string }).name; });
  }));
  if (kinds.has("contract")) jobs.push(a.from("employee_contracts").select("id, contract_no").then(({ data }) => {
    (data ?? []).forEach((c) => { maps.contract[(c as { id: string }).id] = (c as { contract_no: string }).contract_no; });
  }));
  await Promise.all(jobs);
  return maps;
}

// ---- column filters (รูปแบบเดียวกับ master-v2: { col: {type,value/min/max/selected} }) ----
export type ColFilter =
  | { type: "text"; value: string }
  | { type: "number"; min: string; max: string }
  | { type: "select"; selected: string[] }
  | { type: "boolean"; value: string };

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ViewParams = { limit: number; offset: number; sortBy?: string; sortDir?: "asc" | "desc"; filters?: Record<string, ColFilter> };

export async function listView(cfg: ViewCfg, p: ViewParams): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const sortBy = p.sortBy && cfg.sortable.includes(p.sortBy) ? p.sortBy : cfg.defaultSort;
  const sortDir = p.sortDir ?? cfg.defaultDir;
  // คอลัมน์จริงของตาราง (กันกรองด้วย computed เช่น employee_name ที่ไม่มีใน table)
  const realCols = new Set(cfg.cols.split(",").map((c) => c.trim()));

  let q = supabaseAdmin().from(cfg.table).select(cfg.cols, { count: "exact" });
  for (const [col, f] of Object.entries(p.filters ?? {})) {
    if (!SAFE_IDENT.test(col) || !realCols.has(col)) continue;
    if (f.type === "text" && f.value) {
      if (UUID_RE.test(f.value)) q = q.eq(col, f.value); else q = q.ilike(col, `%${f.value}%`);
    } else if (f.type === "number") {
      if (f.min !== "" && f.min != null) q = q.gte(col, Number(f.min));
      if (f.max !== "" && f.max != null) q = q.lte(col, Number(f.max));
    } else if (f.type === "select" && Array.isArray(f.selected) && f.selected.length > 0) {
      q = q.in(col, f.selected);
    } else if (f.type === "boolean" && (f.value === "true" || f.value === "false")) {
      q = q.eq(col, f.value === "true");
    }
  }
  const { data, error, count } = await q
    .order(sortBy, { ascending: sortDir === "asc" })
    .range(p.offset, p.offset + p.limit - 1);
  if (error) throw new Error(error.message);

  const kinds = new Set<RelKind>(cfg.relations.map((r) => r.kind));
  const maps = kinds.size ? await buildMaps(kinds) : null;
  const rows = (data ?? []).map((row) => {
    const out: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>) };
    if (maps) for (const rel of cfg.relations) {
      const id = out[rel.field] as string | null;
      out[rel.as] = id ? (maps[rel.kind][id] ?? "") : "";
    }
    return out;
  });
  return { data: rows, total: count ?? rows.length };
}
