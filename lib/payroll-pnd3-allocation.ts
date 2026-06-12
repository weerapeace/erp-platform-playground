import { money } from "@/lib/payroll-calc";

export type Pnd3AllocationTargetSource = "employee" | "pnd3_recurring";

export type Pnd3AllocationInputTarget = {
  selection_id: string;
  target_source: Pnd3AllocationTargetSource;
  target_label: string;
  base_net_amount: number;
  is_selected: boolean;
  is_fixed: boolean;
  fixed_net_amount: number;
  random_net_amount?: number;
  note?: string | null;
};

export type Pnd3AllocationTarget = Pnd3AllocationInputTarget & {
  allocated_net_amount: number;
};

export type Pnd3AllocationSourceRow = {
  selection_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  nationality: string;
  contract_type: string;
  wage_type: string;
  net_pay: number;
};

export type Pnd3AllocationPreview = {
  period_id: string;
  source_rows: Pnd3AllocationSourceRow[];
  targets: Pnd3AllocationTarget[];
  totals: {
    pool_net_amount: number;
    allocated_net_amount: number;
    remaining_net_amount: number;
    fixed_net_amount: number;
    random_net_amount: number;
  };
};

export type Pnd3AllocationPreviewRow = {
  selection_id: string;
  source?: string;
  include_pnd3_export?: boolean;
  nationality?: string | null;
  contract_type?: string | null;
  wage_type?: string | null;
  gross_pay: number;
  withholding_tax: number;
  net_pay: number;
  total_deduction?: number;
  pnd3_is_extra?: boolean;
  pnd3_allocation_net?: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const cents = (value: number) => Math.round(round2(value) * 100);
const fromCents = (value: number) => round2(value / 100);
export const PND3_RANDOM_ALLOCATION_NOTE = "__pnd3_random_allocation__";
export const DEFAULT_PND3_RANDOM_SPREAD_PERCENT = 30;

export function pnd3SourceSelectionIds(sourceRows: Pnd3AllocationSourceRow[]) {
  return sourceRows.map((row) => row.selection_id).filter(Boolean);
}

export function pnd3SelectedSourcePoolNetAmount(sourceRows: Pnd3AllocationSourceRow[], selectedIds: Iterable<string>) {
  const selected = new Set(selectedIds);
  return round2(sourceRows.reduce((sum, row) => {
    if (!selected.has(row.selection_id)) return sum;
    return sum + Math.max(money(row.net_pay), 0);
  }, 0));
}

export function normalizePnd3RandomSpreadPercent(value: unknown) {
  return Math.min(100, Math.max(0, money(value) || 0));
}

export function pnd3RandomAllocationNote(amount: number) {
  return `${PND3_RANDOM_ALLOCATION_NOTE}:${round2(Math.max(money(amount), 0))}`;
}

export function parsePnd3RandomAllocationNote(note?: string | null) {
  if (!note?.startsWith(PND3_RANDOM_ALLOCATION_NOTE)) return 0;
  const raw = note.slice(PND3_RANDOM_ALLOCATION_NOTE.length).replace(/^:/, "");
  return round2(Math.max(money(raw), 0));
}

export function pnd3GrossUpFromNet(netAmount: unknown, taxRate: unknown) {
  const net = money(netAmount);
  const rate = Math.max(money(taxRate), 0);
  if (net <= 0) return { gross_pay: 0, withholding_tax: 0, net_pay: 0 };
  if (rate <= 0) return { gross_pay: net, withholding_tax: 0, net_pay: net };
  const gross = round2(net / (1 - rate / 100));
  const tax = round2(gross - net);
  return { gross_pay: gross, withholding_tax: tax, net_pay: net };
}

export function applyPnd3AllocationToPreviewRows<T extends Pnd3AllocationPreviewRow>(rows: T[], allocation: Pnd3AllocationPreview): T[] {
  const allocations = new Map(allocation.targets.map((target) => [target.selection_id, Math.max(money(target.allocated_net_amount), 0)]));
  return rows.map((row) => {
    const extraNet = allocations.get(row.selection_id) ?? 0;
    const previousExtraNet = Math.max(money(row.pnd3_allocation_net), 0);
    const isEmployeeBaseRow = row.source === "employee" && row.pnd3_is_extra !== true;
    const baseNet = isEmployeeBaseRow && extraNet > 0
      ? 0
      : round2(Math.max(money(row.net_pay) - (isEmployeeBaseRow ? 0 : previousExtraNet), 0));
    const nextNet = round2(baseNet + extraNet);
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
}

export function filterPnd3OutputRows<T extends Pnd3AllocationPreviewRow>(rows: T[]): T[] {
  return rows.filter((row) => {
    if (Math.max(money(row.net_pay), 0) <= 0) return false;
    const nationality = String(row.nationality ?? "").trim().toUpperCase();
    const wageType = String(row.wage_type ?? "").trim().toLowerCase();
    if (row.source === "employee" && nationality.startsWith("MM") && wageType === "daily") return false;
    if (row.source === "employee" && row.pnd3_is_extra !== true) {
      return Math.max(money(row.net_pay), 0) > 0 || Math.max(money(row.pnd3_allocation_net), 0) > 0;
    }
    return true;
  });
}

export function defaultPnd3ShownSelectionIds<T extends Pnd3AllocationPreviewRow>(rows: T[]): string[] {
  return filterPnd3OutputRows(rows).map((row) => row.selection_id);
}

export function distributePnd3Allocation(poolNetAmount: number, targets: Pnd3AllocationInputTarget[]) {
  const pool = round2(Math.max(money(poolNetAmount), 0));
  const selected = targets.filter((target) => target.is_selected);
  const fixedTotal = round2(selected.filter((target) => target.is_fixed).reduce((sum, target) => sum + Math.max(money(target.fixed_net_amount), 0), 0));
  const randomTotal = round2(selected.filter((target) => !target.is_fixed).reduce((sum, target) => sum + Math.max(money(target.random_net_amount), 0), 0));
  const flexible = selected.filter((target) => !target.is_fixed && Math.max(money(target.random_net_amount), 0) <= 0);
  const remainingForFlexible = round2(pool - fixedTotal - randomTotal);
  const shareBase = flexible.length > 0 && remainingForFlexible > 0 ? Math.floor((remainingForFlexible / flexible.length) * 100) / 100 : 0;

  let flexibleAllocated = 0;
  const flexibleAllocations = new Map<string, number>();
  flexible.forEach((target, index) => {
    const value = index === flexible.length - 1
      ? round2(Math.max(remainingForFlexible - flexibleAllocated, 0))
      : shareBase;
    flexibleAllocated = round2(flexibleAllocated + value);
    flexibleAllocations.set(target.selection_id, value);
  });

  const rows = targets.map((target): Pnd3AllocationTarget => {
    let allocated = 0;
    const fixedNetAmount = target.is_fixed ? Math.max(money(target.fixed_net_amount), 0) : 0;
    const randomNetAmount = !target.is_fixed ? Math.max(money(target.random_net_amount), 0) : 0;
    if (target.is_selected && target.is_fixed) allocated = fixedNetAmount;
    if (target.is_selected && !target.is_fixed) allocated = randomNetAmount > 0 ? randomNetAmount : flexibleAllocations.get(target.selection_id) ?? 0;
    return { ...target, fixed_net_amount: fixedNetAmount, random_net_amount: randomNetAmount, allocated_net_amount: round2(allocated) };
  });

  const allocatedTotal = round2(rows.reduce((sum, target) => sum + target.allocated_net_amount, 0));
  return {
    rows,
    totals: {
      pool_net_amount: pool,
      allocated_net_amount: allocatedTotal,
      remaining_net_amount: round2(pool - allocatedTotal),
      fixed_net_amount: fixedTotal,
      random_net_amount: randomTotal,
    },
  };
}

export function randomizePnd3Allocation(
  poolNetAmount: number,
  targets: Pnd3AllocationInputTarget[],
  random: () => number = Math.random,
  spreadPercent = 100,
) {
  const pool = round2(Math.max(money(poolNetAmount), 0));
  const spread = normalizePnd3RandomSpreadPercent(spreadPercent) / 100;
  const selectedFixed = targets.filter((target) => target.is_selected && target.is_fixed);
  const selectedFlexible = targets.filter((target) => target.is_selected && !target.is_fixed);
  const fixedTotal = round2(selectedFixed.reduce((sum, target) => sum + Math.max(money(target.fixed_net_amount), 0), 0));
  const remainingCents = Math.max(cents(pool - fixedTotal), 0);

  if (selectedFlexible.length === 0 || remainingCents <= 0) {
    return distributePnd3Allocation(pool, targets);
  }

  const allocationUnitCents = remainingCents % 100 === 0 ? 100 : 1;
  const remainingUnits = Math.floor(remainingCents / allocationUnitCents);
  const weights = selectedFlexible.map((target) => {
    const raw = Math.min(1, Math.max(0, random()));
    const centered = (raw * 2) - 1;
    return {
      selection_id: target.selection_id,
      weight: Math.max(1 + (centered * spread), 0),
      units: 0,
      fraction: 0,
    };
  });
  const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0) || 1;
  let allocated = 0;
  weights.forEach((row) => {
    const exact = (remainingUnits * row.weight) / totalWeight;
    row.units = Math.floor(exact);
    row.fraction = exact - row.units;
    allocated += row.units;
  });
  let remainder = remainingUnits - allocated;
  weights
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((row) => {
      if (remainder <= 0) return;
      row.units += 1;
      remainder -= 1;
    });

  const randomized = new Map(weights.map((row) => [row.selection_id, fromCents(row.units * allocationUnitCents)]));
  const nextTargets = targets.map((target) => {
    const amount = randomized.get(target.selection_id);
    if (amount === undefined) return target;
    return { ...target, is_selected: true, is_fixed: false, fixed_net_amount: 0, random_net_amount: amount, note: pnd3RandomAllocationNote(amount) };
  });
  return distributePnd3Allocation(pool, nextTargets);
}

export function equalizePnd3Allocation(poolNetAmount: number, targets: Pnd3AllocationInputTarget[]) {
  const nextTargets = targets.map((target) => {
    if (target.is_fixed) return { ...target, is_selected: true, random_net_amount: 0, note: null };
    return {
      ...target,
      is_selected: true,
      is_fixed: false,
      fixed_net_amount: 0,
      random_net_amount: 0,
      note: null,
    };
  });
  return distributePnd3Allocation(poolNetAmount, nextTargets);
}

function activateSavedRandomTargets(targets: Pnd3AllocationInputTarget[]) {
  return targets.map((target) => {
    const randomNetAmount = Math.max(money(target.random_net_amount), 0);
    if (target.is_fixed || randomNetAmount <= 0) return target;
    return { ...target, is_selected: true };
  });
}

export function initializePnd3Allocation(
  poolNetAmount: number,
  targets: Pnd3AllocationInputTarget[],
  hasSavedOverrides: boolean,
  random: () => number = Math.random,
  spreadPercent = DEFAULT_PND3_RANDOM_SPREAD_PERCENT,
) {
  void random;
  void spreadPercent;
  if (hasSavedOverrides) return distributePnd3Allocation(poolNetAmount, activateSavedRandomTargets(targets));
  return distributePnd3Allocation(poolNetAmount, targets);
}

export function randomizePnd3AllocationSelection(
  poolNetAmount: number,
  targets: Pnd3AllocationInputTarget[],
  selectionId: string,
  checked: boolean,
  random: () => number = Math.random,
  spreadPercent = 100,
) {
  const nextTargets = targets.map((target) => {
    const isTarget = target.selection_id === selectionId;
    const isSelected = isTarget ? checked : target.is_selected;
    if (target.is_fixed) return { ...target, is_selected: isSelected, random_net_amount: 0 };
    return {
      ...target,
      is_selected: isSelected,
      fixed_net_amount: 0,
      random_net_amount: 0,
      note: null,
    };
  });
  if (!nextTargets.some((target) => target.is_selected)) {
    return distributePnd3Allocation(poolNetAmount, nextTargets);
  }
  return randomizePnd3Allocation(poolNetAmount, nextTargets, random, spreadPercent);
}
