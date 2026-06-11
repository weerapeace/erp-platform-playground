import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/payroll-calc";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Pnd3ExportRowOverride } from "@/lib/payroll-export";

type Row = Record<string, unknown>;
type Actor = { actorId?: string | null; actorName?: string | null };

export type SavePnd3ExportRowOverride = Pnd3ExportRowOverride;

const TABLE = "payroll_pnd3_export_row_overrides";
const SELECT = "id, payroll_period_id, row_key, base_selection_id, payment_date, net_pay, national_id, address, is_extra, display_order";

const text = (value: unknown) => String(value ?? "").trim();

function cleanDate(value: unknown) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeRow(row: SavePnd3ExportRowOverride) {
  const rowKey = text(row.row_key);
  const baseSelectionId = text(row.base_selection_id);
  if (!rowKey) throw new Error("ต้องระบุรหัสแถว ภ.ง.ด.3");
  if (!baseSelectionId) throw new Error("ต้องระบุแถวต้นฉบับ ภ.ง.ด.3");
  const netPay = row.net_pay == null || text(row.net_pay) === "" ? null : Math.max(money(row.net_pay), 0);
  return {
    row_key: rowKey,
    base_selection_id: baseSelectionId,
    payment_date: cleanDate(row.payment_date),
    net_pay: netPay,
    national_id: row.national_id == null ? null : text(row.national_id),
    address: row.address == null ? null : text(row.address),
    is_extra: row.is_extra === true,
    display_order: Number(row.display_order) || 0,
  };
}

export async function listPnd3ExportRowOverrides(periodId: string): Promise<Pnd3ExportRowOverride[]> {
  const cleanPeriodId = text(periodId);
  if (!cleanPeriodId) return [];
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select(SELECT)
    .eq("payroll_period_id", cleanPeriodId)
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((row) => ({
    row_key: text(row.row_key),
    base_selection_id: text(row.base_selection_id),
    payment_date: cleanDate(row.payment_date),
    net_pay: row.net_pay == null ? null : money(row.net_pay),
    national_id: row.national_id == null ? null : text(row.national_id),
    address: row.address == null ? null : text(row.address),
    is_extra: row.is_extra === true,
    display_order: Number(row.display_order) || 0,
  }));
}

export async function savePnd3ExportRowOverrides(periodId: string, rows: SavePnd3ExportRowOverride[], actor: Actor = {}) {
  const cleanPeriodId = text(periodId);
  if (!cleanPeriodId) throw new Error("ต้องเลือกงวดเงินเดือน");
  const normalized = rows.map(normalizeRow);
  const admin = supabaseAdmin();
  const { error: deleteError } = await admin.from(TABLE).delete().eq("payroll_period_id", cleanPeriodId);
  if (deleteError) throw new Error(deleteError.message);

  if (normalized.length) {
    const now = new Date().toISOString();
    const payload = normalized.map((row) => ({
      payroll_period_id: cleanPeriodId,
      ...row,
      updated_at: now,
    }));
    const { error } = await admin.from(TABLE).upsert(payload, { onConflict: "payroll_period_id,row_key" });
    if (error) throw new Error(error.message);
  }

  await writeAudit(admin, {
    action: "update_pnd3_export_rows",
    entityType: "payroll_periods",
    entityId: cleanPeriodId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: {
      override_count: normalized.length,
      extra_count: normalized.filter((row) => row.is_extra).length,
      edited_count: normalized.filter((row) => !row.is_extra).length,
    },
  });
}
