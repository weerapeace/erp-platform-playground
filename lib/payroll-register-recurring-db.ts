import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/payroll-calc";
import { formatThaiNationalId } from "@/lib/payroll-register-print";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, unknown>;
type Actor = { actorId?: string | null; actorName?: string | null };

export type PayrollRegisterRecurringItem = {
  id: string;
  recipient_code: string;
  recipient_name: string;
  nickname: string;
  nationality: string;
  national_id: string;
  passport_no: string;
  identity_no: string;
  register_base_salary: number;
  register_mid_month_paid: number;
  register_month_end_pay: number;
  register_transfer_net_pay: number;
  register_overtime_amount: number;
  register_cash_pay: number;
  register_social_security: number;
  register_balance: number;
  status: string;
  display_order: number;
  note: string | null;
  created_at?: string;
  updated_at?: string;
};

const TABLE = "payroll_register_recurring_items";
const SELECT = [
  "id",
  "recipient_code",
  "recipient_name",
  "nickname",
  "nationality",
  "national_id",
  "passport_no",
  "register_base_salary",
  "register_mid_month_paid",
  "register_month_end_pay",
  "register_transfer_net_pay",
  "register_overtime_amount",
  "register_cash_pay",
  "register_social_security",
  "register_balance",
  "status",
  "display_order",
  "note",
  "created_at",
  "updated_at",
].join(", ");
const WRITABLE = new Set([
  "recipient_code",
  "recipient_name",
  "nickname",
  "nationality",
  "national_id",
  "passport_no",
  "register_base_salary",
  "register_mid_month_paid",
  "register_month_end_pay",
  "register_transfer_net_pay",
  "register_overtime_amount",
  "register_cash_pay",
  "register_social_security",
  "register_balance",
  "status",
  "display_order",
  "note",
]);

const text = (v: unknown) => String(v ?? "").trim();
const round2 = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function identityNo(row: Row) {
  return formatThaiNationalId(text(row.national_id)) || text(row.passport_no);
}

function toItem(row: Row): PayrollRegisterRecurringItem {
  return {
    id: text(row.id),
    recipient_code: text(row.recipient_code),
    recipient_name: text(row.recipient_name),
    nickname: text(row.nickname),
    nationality: text(row.nationality),
    national_id: formatThaiNationalId(text(row.national_id)),
    passport_no: text(row.passport_no),
    identity_no: identityNo(row),
    register_base_salary: money(row.register_base_salary),
    register_mid_month_paid: money(row.register_mid_month_paid),
    register_month_end_pay: money(row.register_month_end_pay),
    register_transfer_net_pay: money(row.register_transfer_net_pay),
    register_overtime_amount: money(row.register_overtime_amount),
    register_cash_pay: money(row.register_cash_pay),
    register_social_security: money(row.register_social_security),
    register_balance: money(row.register_balance),
    status: text(row.status) || "active",
    display_order: Number(row.display_order ?? 100) || 100,
    note: row.note == null ? null : text(row.note),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
  };
}

function toColumns(body: Row) {
  const out: Row = {};
  for (const [key, value] of Object.entries(body)) {
    if (!WRITABLE.has(key)) continue;
    out[key] = value === "" ? null : value;
  }
  for (const key of ["recipient_code", "recipient_name", "nickname", "nationality", "passport_no", "note"]) {
    if (key in out) out[key] = text(out[key]);
  }
  if ("national_id" in out) out.national_id = text(out.national_id).replace(/\s+/g, "");
  for (const key of [
    "register_base_salary",
    "register_mid_month_paid",
    "register_month_end_pay",
    "register_transfer_net_pay",
    "register_overtime_amount",
    "register_cash_pay",
    "register_social_security",
    "register_balance",
  ]) {
    if (key in out) out[key] = round2(out[key]);
  }
  if ("display_order" in out) out.display_order = Number(out.display_order ?? 100) || 100;
  if (!("status" in out)) out.status = "active";
  return out;
}

function validate(cols: Row, partial = false) {
  if ((!partial || "recipient_name" in cols) && !text(cols.recipient_name)) return "ต้องระบุชื่อคนนอก";
  if ("status" in cols && !["active", "inactive"].includes(text(cols.status))) return "สถานะรายการไม่ถูกต้อง";
  const hasId = text(cols.national_id) || text(cols.passport_no);
  if (!partial && !hasId) return "ต้องระบุเลขบัตรหรือ Passport";
  for (const key of [
    "register_base_salary",
    "register_mid_month_paid",
    "register_month_end_pay",
    "register_transfer_net_pay",
    "register_overtime_amount",
    "register_cash_pay",
    "register_social_security",
    "register_balance",
  ]) {
    if (key in cols && money(cols[key]) < 0) return "ยอดเงินต้องไม่ติดลบ";
  }
  return null;
}

export async function listPayrollRegisterRecurringItems(includeInactive = false) {
  let query = supabaseAdmin().from(TABLE).select(SELECT).order("display_order", { ascending: true }).order("recipient_name", { ascending: true });
  if (!includeInactive) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (((data ?? []) as unknown) as Row[]).map(toItem);
}

export async function createPayrollRegisterRecurringItem(body: Row, actor: Actor = {}) {
  const cols = toColumns(body);
  const err = validate(cols);
  if (err) throw new Error(err);
  const { data, error } = await supabaseAdmin().from(TABLE).insert(cols).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const row = toItem(((data?.[0] ?? {}) as unknown) as Row);
  await writeAudit(supabaseAdmin(), {
    action: "create",
    entityType: TABLE,
    entityId: row.id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { recipient_name: row.recipient_name, register_transfer_net_pay: row.register_transfer_net_pay },
  });
  return row;
}

export async function updatePayrollRegisterRecurringItem(id: string, body: Row, actor: Actor = {}) {
  const cols = toColumns(body);
  const err = validate(cols, true);
  if (err) throw new Error(err);
  const { data, error } = await supabaseAdmin().from(TABLE).update({ ...cols, updated_at: new Date().toISOString() }).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const row = toItem(((data?.[0] ?? {}) as unknown) as Row);
  await writeAudit(supabaseAdmin(), {
    action: "update",
    entityType: TABLE,
    entityId: row.id || id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { fields: Object.keys(cols), recipient_name: row.recipient_name },
  });
  return row;
}

export async function archivePayrollRegisterRecurringItem(id: string, actor: Actor = {}) {
  const { data, error } = await supabaseAdmin().from(TABLE).update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const row = toItem(((data?.[0] ?? {}) as unknown) as Row);
  await writeAudit(supabaseAdmin(), {
    action: "archive",
    entityType: TABLE,
    entityId: row.id || id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { recipient_name: row.recipient_name },
  });
  return row;
}
