import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/payroll-calc";
import {
  initializePnd3Allocation,
  filterPnd3OutputRows,
  parsePnd3RandomAllocationNote,
  pnd3RandomAllocationNote,
  type Pnd3AllocationInputTarget,
  type Pnd3AllocationPreview,
  type Pnd3AllocationSourceRow,
  type Pnd3AllocationTargetSource,
} from "@/lib/payroll-pnd3-allocation";
import { pnd3GrossUpFromNet } from "@/lib/payroll-pnd3-recurring-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PayrollExportRow } from "@/lib/payroll-export";

type Row = Record<string, unknown>;
type Actor = { actorId?: string | null; actorName?: string | null };

export type SavePnd3AllocationRow = {
  selection_id: string;
  target_source: Pnd3AllocationTargetSource;
  target_label: string;
  is_selected: boolean;
  is_fixed: boolean;
  fixed_net_amount: number;
  random_net_amount?: number;
  note?: string | null;
};

const TABLE = "payroll_pnd3_allocation_overrides";
const SELECT = "id, payroll_period_id, target_selection_id, target_source, target_label, is_selected, is_fixed, fixed_net_amount, note";

const text = (value: unknown) => String(value ?? "").trim();
const round2 = (value: number) => Math.round(value * 100) / 100;

export function isThaiNationality(value: unknown) {
  const raw = text(value).toLowerCase();
  if (!raw) return true;
  return ["th", "thai", "thailand", "ไทย", "สัญชาติไทย"].some((word) => raw === word || raw.includes(word));
}

export function isDailyWageType(row: Pick<PayrollExportRow, "contract_type" | "wage_type">) {
  const raw = `${row.contract_type} ${row.wage_type}`.toLowerCase();
  return raw.includes("daily") || raw.includes("รายวัน");
}

export function isForeignDailyPnd3Source(row: PayrollExportRow) {
  return row.source === "employee" && row.net_pay > 0 && isDailyWageType(row) && !isThaiNationality(row.nationality);
}

function toSourceRow(row: PayrollExportRow): Pnd3AllocationSourceRow {
  return {
    selection_id: row.selection_id,
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    employee_name: row.employee_name,
    nationality: row.nationality,
    contract_type: row.contract_type,
    wage_type: row.wage_type,
    net_pay: money(row.net_pay),
  };
}

function allocationKey(row: PayrollExportRow) {
  return row.selection_id || row.employee_id || row.source_id;
}

function toTarget(row: PayrollExportRow, overrides: Map<string, Row>, baseNetAmount = row.net_pay): Pnd3AllocationInputTarget {
  const key = allocationKey(row);
  const override = overrides.get(key);
  const note = override && override.note != null ? text(override.note) : null;
  const isFixed = override ? override.is_fixed === true : false;
  return {
    selection_id: key,
    target_source: row.source === "pnd3_recurring" ? "pnd3_recurring" : "employee",
    target_label: [row.employee_code, row.employee_name].filter(Boolean).join(" · ") || row.employee_name || key,
    base_net_amount: money(baseNetAmount),
    is_selected: override ? override.is_selected === true : false,
    is_fixed: isFixed,
    fixed_net_amount: isFixed && override ? money(override.fixed_net_amount) : 0,
    random_net_amount: isFixed ? 0 : parsePnd3RandomAllocationNote(note),
    note,
  };
}

async function listOverrides(periodId: string) {
  const { data, error } = await supabaseAdmin().from(TABLE).select(SELECT).eq("payroll_period_id", periodId);
  if (error) throw new Error(error.message);
  const map = new Map<string, Row>();
  ((data ?? []) as Row[]).forEach((row) => map.set(text(row.target_selection_id), row));
  return map;
}

export async function buildPnd3AllocationPreview(periodId: string, allRows: PayrollExportRow[], pnd3Rows: PayrollExportRow[]): Promise<Pnd3AllocationPreview> {
  const sourceRows = allRows.filter(isForeignDailyPnd3Source).map(toSourceRow);
  const poolNetAmount = round2(sourceRows.reduce((sum, row) => sum + row.net_pay, 0));
  const overrides = await listOverrides(periodId);
  const pnd3BaseRows = new Map(pnd3Rows.map((row) => [allocationKey(row), row]));
  const targetRows = new Map<string, { row: PayrollExportRow; baseNetAmount: number }>();
  allRows.forEach((row) => {
    if (row.source === "pnd3_recurring") {
      const key = allocationKey(row);
      const baseRow = pnd3BaseRows.get(key);
      targetRows.set(key, { row: baseRow ?? row, baseNetAmount: baseRow ? baseRow.net_pay : money(row.net_pay) });
      return;
    }
    if (row.source !== "employee" || isForeignDailyPnd3Source(row)) return;
    const key = allocationKey(row);
    const baseRow = pnd3BaseRows.get(key);
    targetRows.set(key, { row: baseRow ?? row, baseNetAmount: baseRow ? baseRow.net_pay : 0 });
  });
  pnd3Rows.forEach((row) => {
    if (isForeignDailyPnd3Source(row)) return;
    const key = allocationKey(row);
    if (!targetRows.has(key)) targetRows.set(key, { row, baseNetAmount: row.net_pay });
  });
  const targets = [...targetRows.values()]
    .map(({ row, baseNetAmount }) => toTarget(row, overrides, baseNetAmount))
    .sort((a, b) => a.target_label.localeCompare(b.target_label, "th"));
  const result = initializePnd3Allocation(poolNetAmount, targets, overrides.size > 0);
  return {
    period_id: periodId,
    source_rows: sourceRows,
    targets: result.rows,
    totals: result.totals,
  };
}

export function applyPnd3Allocation(rows: PayrollExportRow[], allocation: Pnd3AllocationPreview, candidateRows: PayrollExportRow[] = rows) {
  const allocations = new Map(allocation.targets.map((target) => [target.selection_id, target.allocated_net_amount]));
  const existing = new Set(rows.map(allocationKey));
  const candidates = new Map(candidateRows.map((row) => [allocationKey(row), row]));
  const applied = rows.map((row) => {
    const extraNet = allocations.get(row.selection_id) ?? 0;
    if (extraNet <= 0) return row;
    const isEmployeeBaseRow = row.source === "employee" && row.pnd3_is_extra !== true;
    const nextNet = round2((isEmployeeBaseRow ? 0 : row.net_pay) + extraNet);
    const amounts = pnd3GrossUpFromNet(nextNet, 3);
    return {
      ...row,
      pnd3_allocation_net: extraNet,
      gross_pay: amounts.gross_pay,
      withholding_tax: amounts.withholding_tax,
      total_deduction: amounts.withholding_tax,
      net_pay: amounts.net_pay,
    };
  });
  allocation.targets.forEach((target) => {
    if (existing.has(target.selection_id) || target.allocated_net_amount <= 0) return;
    const candidate = candidates.get(target.selection_id);
    if (!candidate) return;
    const amounts = pnd3GrossUpFromNet(target.allocated_net_amount, 3);
    applied.push({
      ...candidate,
      include_pnd3_export: true,
      pnd3_allocation_net: target.allocated_net_amount,
      gross_pay: amounts.gross_pay,
      withholding_tax: amounts.withholding_tax,
      total_deduction: amounts.withholding_tax,
      net_pay: amounts.net_pay,
    });
  });
  return filterPnd3OutputRows(applied);
}

function normalizeSaveRow(row: SavePnd3AllocationRow) {
  const selectionId = text(row.selection_id);
  const source = text(row.target_source) as Pnd3AllocationTargetSource;
  const isFixed = row.is_fixed === true;
  const randomNetAmount = isFixed ? 0 : Math.max(money(row.random_net_amount), 0);
  const note = randomNetAmount > 0 ? pnd3RandomAllocationNote(randomNetAmount) : row.note == null ? null : text(row.note);
  if (!selectionId) throw new Error("ต้องระบุรายการผู้รับ ภ.ง.ด.3");
  if (!["employee", "pnd3_recurring"].includes(source)) throw new Error("ประเภทผู้รับ ภ.ง.ด.3 ไม่ถูกต้อง");
  return {
    target_selection_id: selectionId,
    target_source: source,
    target_label: text(row.target_label),
    is_selected: row.is_selected === true,
    is_fixed: isFixed,
    fixed_net_amount: isFixed ? Math.max(money(row.fixed_net_amount), 0) : 0,
    note,
  };
}

export async function savePnd3AllocationOverrides(periodId: string, rows: SavePnd3AllocationRow[], actor: Actor = {}) {
  const cleanPeriodId = text(periodId);
  if (!cleanPeriodId) throw new Error("ต้องระบุงวดเงินเดือน");
  const normalized = rows.map(normalizeSaveRow);
  const admin = supabaseAdmin();
  const { error: deleteError } = await admin.from(TABLE).delete().eq("payroll_period_id", cleanPeriodId);
  if (deleteError) throw new Error(deleteError.message);

  if (normalized.length) {
    const payload = normalized.map((row) => ({
      payroll_period_id: cleanPeriodId,
      ...row,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from(TABLE).upsert(payload, { onConflict: "payroll_period_id,target_selection_id" });
    if (error) throw new Error(error.message);
  }

  await writeAudit(admin, {
    action: "update_pnd3_allocation",
    entityType: "payroll_periods",
    entityId: cleanPeriodId,
    actorId: actor.actorId,
    actorName: actor.actorName,
    metadata: {
      target_count: normalized.length,
      selected_count: normalized.filter((row) => row.is_selected).length,
      fixed_count: normalized.filter((row) => row.is_fixed).length,
    },
  });
}
