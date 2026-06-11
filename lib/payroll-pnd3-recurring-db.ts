import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/payroll-calc";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, unknown>;
type Actor = { actorId?: string | null; actorName?: string | null };

export type Pnd3RecurringItem = {
  id: string;
  recipient_name: string;
  tax_id: string;
  address: string;
  income_type: string;
  default_net_amount: number;
  tax_rate: number;
  status: string;
  display_order: number;
  note: string | null;
  created_at?: string;
  updated_at?: string;
};

const TABLE = "payroll_pnd3_recurring_items";
const SELECT = "id, recipient_name, tax_id, address, income_type, default_net_amount, tax_rate, status, display_order, note, created_at, updated_at";
const WRITABLE = new Set(["recipient_name", "tax_id", "address", "income_type", "default_net_amount", "tax_rate", "status", "display_order", "note"]);

const text = (v: unknown) => String(v ?? "").trim();

export function pnd3GrossUpFromNet(netAmount: unknown, taxRate: unknown) {
  const net = money(netAmount);
  const rate = Math.max(money(taxRate), 0);
  if (net <= 0) return { gross_pay: 0, withholding_tax: 0, net_pay: 0 };
  if (rate <= 0) return { gross_pay: net, withholding_tax: 0, net_pay: net };
  const gross = Math.round((net / (1 - rate / 100)) * 100) / 100;
  const tax = Math.round((gross - net) * 100) / 100;
  return { gross_pay: gross, withholding_tax: tax, net_pay: net };
}

function toItem(row: Row): Pnd3RecurringItem {
  return {
    id: text(row.id),
    recipient_name: text(row.recipient_name),
    tax_id: text(row.tax_id),
    address: text(row.address),
    income_type: text(row.income_type) || "ค่าจ้าง",
    default_net_amount: money(row.default_net_amount),
    tax_rate: money(row.tax_rate) || 3,
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
  if ("recipient_name" in out) out.recipient_name = text(out.recipient_name);
  if ("tax_id" in out) out.tax_id = text(out.tax_id).replace(/\s+/g, "");
  if ("address" in out) out.address = text(out.address);
  if ("income_type" in out) out.income_type = text(out.income_type) || "ค่าจ้าง";
  if ("default_net_amount" in out) out.default_net_amount = money(out.default_net_amount);
  if ("tax_rate" in out) out.tax_rate = money(out.tax_rate) || 3;
  if ("display_order" in out) out.display_order = Number(out.display_order ?? 100) || 100;
  if (!("status" in out)) out.status = "active";
  return out;
}

function validate(cols: Row, partial = false) {
  const name = text(cols.recipient_name);
  if (!partial || "recipient_name" in cols) {
    if (!name) return "ต้องระบุชื่อบุคคล/บริษัท";
  }
  if ("default_net_amount" in cols && money(cols.default_net_amount) <= 0) return "ยอดสุทธิประจำต้องมากกว่า 0";
  if ("tax_rate" in cols && (money(cols.tax_rate) < 0 || money(cols.tax_rate) >= 100)) return "อัตราภาษีต้องอยู่ระหว่าง 0-99.99";
  if ("status" in cols && !["active", "inactive"].includes(text(cols.status))) return "สถานะรายการไม่ถูกต้อง";
  return null;
}

export async function listPnd3RecurringItems(includeInactive = false) {
  let query = supabaseAdmin().from(TABLE).select(SELECT).order("display_order", { ascending: true }).order("recipient_name", { ascending: true });
  if (!includeInactive) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toItem);
}

export async function createPnd3RecurringItem(body: Row, actor: Actor = {}) {
  const cols = toColumns(body);
  const err = validate(cols);
  if (err) throw new Error(err);
  const { data, error } = await supabaseAdmin().from(TABLE).insert(cols).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const row = toItem((data?.[0] ?? {}) as Row);
  await writeAudit(supabaseAdmin(), {
    action: "create",
    entityType: TABLE,
    entityId: row.id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: { recipient_name: row.recipient_name, default_net_amount: row.default_net_amount, tax_rate: row.tax_rate },
  });
  return row;
}

export async function updatePnd3RecurringItem(id: string, body: Row, actor: Actor = {}) {
  const cols = toColumns(body);
  const err = validate(cols, true);
  if (err) throw new Error(err);
  const { data, error } = await supabaseAdmin().from(TABLE).update({ ...cols, updated_at: new Date().toISOString() }).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const row = toItem((data?.[0] ?? {}) as Row);
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

export async function archivePnd3RecurringItem(id: string, actor: Actor = {}) {
  const { data, error } = await supabaseAdmin().from(TABLE).update({ status: "inactive", updated_at: new Date().toISOString() }).eq("id", id).select(SELECT).limit(1);
  if (error) throw new Error(error.message);
  const row = toItem((data?.[0] ?? {}) as Row);
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
