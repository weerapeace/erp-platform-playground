"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePayrollPeriod } from "@/components/payroll/payroll-period-context";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { DEFAULT_PND3_RANDOM_SPREAD_PERCENT, applyPnd3AllocationToPreviewRows, distributePnd3Allocation, equalizePnd3Allocation, filterPnd3OutputRows, pnd3GrossUpFromNet, randomizePnd3Allocation, randomizePnd3AllocationSelection, type Pnd3AllocationPreview, type Pnd3AllocationTarget } from "@/lib/payroll-pnd3-allocation";

type ExportType = "payroll_register" | "pnd3";
type RowSource = "employee" | "pnd3_recurring" | "payroll_register_recurring";

type ExportRow = {
  id: string;
  selection_id: string;
  source: RowSource;
  source_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  nickname: string;
  national_id: string;
  passport_no: string;
  address: string;
  income_type: string;
  contract_type: string;
  wage_type: string;
  payroll_register_base_salary: number;
  gross_pay: number;
  withholding_tax: number;
  net_pay: number;
  identity_no: string;
  register_base_salary: number;
  register_mid_month_paid: number;
  register_month_end_pay: number;
  register_transfer_net_pay: number;
  register_overtime_amount: number;
  register_cash_pay: number;
  register_social_security: number;
  register_balance: number;
  pnd3_allocation_net?: number;
  pnd3_row_key?: string;
  pnd3_base_selection_id?: string;
  pnd3_payment_date?: string;
  pnd3_is_extra?: boolean;
  pnd3_net_override?: number | null;
  pnd3_national_id_override?: string | null;
  pnd3_address_override?: string | null;
};

type ExportPreview = {
  export_type: ExportType;
  period: { id: string; period_name: string; status: string; payment_date: string };
  run: { id: string; run_no: number; calculated_at: string | null } | null;
  rows: ExportRow[];
  totals: { count: number; gross_pay: number; withholding_tax: number; net_pay: number; register_base: number };
  pnd3_allocation?: Pnd3AllocationPreview | null;
};

type Pnd3Draft = {
  recipient_name: string;
  tax_id: string;
  address: string;
  income_type: string;
  default_net_amount: string;
  tax_rate: string;
};

type Pnd3RowEditDraft = {
  payment_date: string;
  net_pay: string;
  national_id: string;
  address: string;
};

type RegisterRecurringDraft = {
  recipient_name: string;
  nickname: string;
  nationality: string;
  national_id: string;
  passport_no: string;
  register_base_salary: string;
  register_mid_month_paid: string;
  register_month_end_pay: string;
  register_transfer_net_pay: string;
  register_overtime_amount: string;
  register_cash_pay: string;
  register_social_security: string;
  register_balance: string;
};

const BLANK_PND3: Pnd3Draft = {
  recipient_name: "",
  tax_id: "",
  address: "",
  income_type: "ค่าจ้าง",
  default_net_amount: "",
  tax_rate: "3",
};

const BLANK_REGISTER_RECURRING: RegisterRecurringDraft = {
  recipient_name: "",
  nickname: "",
  nationality: "",
  national_id: "",
  passport_no: "",
  register_base_salary: "",
  register_mid_month_paid: "",
  register_month_end_pay: "",
  register_transfer_net_pay: "",
  register_overtime_amount: "",
  register_cash_pay: "",
  register_social_security: "",
  register_balance: "",
};

const EXPORT_OPTIONS: Record<ExportType, { title: string; short: string; description: string; accent: string }> = {
  pnd3: {
    title: "ภ.ง.ด.3 Excel",
    short: "ภ.ง.ด.3",
    description: "Preview ตามหน้าตา Excel ก่อนโหลด รวมพนักงานที่ติ๊ก ภ.ง.ด.3 และรายการประจำ",
    accent: "border-sky-200 bg-sky-50 text-sky-800",
  },
  payroll_register: {
    title: "ทะเบียนเงินเดือน Excel",
    short: "ทะเบียนเงินเดือน",
    description: "ใช้ช่องติ๊ก “รวมในทะเบียนเงินเดือน” จากหน้าสัญญา แล้วดึงยอดจากผลคำนวณล่าสุด",
    accent: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

const today = () => new Date().toISOString().slice(0, 10);
const baht = (value: unknown) => `฿${(Number(value) || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dashBaht = (value: unknown) => Math.abs(Number(value) || 0) > 0.004 ? baht(value) : "-";
const identityText = (row: Pick<ExportRow, "identity_no" | "national_id" | "passport_no">) => row.identity_no || row.national_id || row.passport_no || "-";
const thaiDate = (value: string) => {
  const [yyyy, mm, dd] = value.slice(0, 10).split("-");
  if (!yyyy || !mm || !dd) return value || "-";
  return `${Number(dd)}/${Number(mm)}/${Number(yyyy) + 543}`;
};
const isoDateOr = (value: string | undefined | null, fallback: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? String(value) : fallback;
const rowKeyOf = (row: ExportRow) => row.pnd3_row_key || row.selection_id;
const baseSelectionOf = (row: ExportRow) => row.pnd3_base_selection_id || row.selection_id;

function filename(type: ExportType, periodName: string) {
  const safe = (periodName || "period").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
  return `${type === "pnd3" ? "pnd3" : "payroll-register"}-${safe}.xlsx`;
}

export default function PayrollExportsPage() {
  const { periods, periodId, setPeriodId } = usePayrollPeriod();
  const [type, setType] = useState<ExportType>("pnd3");
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paymentDate, setPaymentDate] = useState(today());
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pnd3Draft, setPnd3Draft] = useState<Pnd3Draft>(BLANK_PND3);
  const [registerDraft, setRegisterDraft] = useState<RegisterRecurringDraft>(BLANK_REGISTER_RECURRING);
  const [allocation, setAllocation] = useState<Pnd3AllocationPreview | null>(null);
  const [randomSpreadPercent, setRandomSpreadPercent] = useState(DEFAULT_PND3_RANDOM_SPREAD_PERCENT);
  const [editingPnd3Row, setEditingPnd3Row] = useState<ExportRow | null>(null);
  const [pnd3RowDraft, setPnd3RowDraft] = useState<Pnd3RowEditDraft>({ payment_date: today(), net_pay: "", national_id: "", address: "" });

  const loadPreview = useCallback(async () => {
    if (!periodId) return;
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const qs = new URLSearchParams({ period_id: periodId, type });
      const json = await apiFetch(`/api/payroll/exports?${qs.toString()}`).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      const data = json.data as ExportPreview;
      setPreview(data);
      setAllocation(data.pnd3_allocation ?? null);
      setPaymentDate(data.period.payment_date || today());
      const outputRows = type === "pnd3" ? filterPnd3OutputRows(data.rows) : data.rows;
      setSelectedIds(new Set(outputRows.map((row) => row.selection_id)));
    } catch (e) {
      setPreview(null);
      setAllocation(null);
      setSelectedIds(new Set());
      setErr(e instanceof Error ? e.message : "โหลดรายการ export ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [periodId, type]);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  const previewRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    if (type !== "pnd3" || !allocation) return rows;
    return applyPnd3AllocationToPreviewRows(rows, allocation);
  }, [allocation, preview?.rows, type]);

  const outputRows = useMemo(() => {
    if (type !== "pnd3") return previewRows;
    return filterPnd3OutputRows(previewRows);
  }, [previewRows, type]);

  const shownRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = outputRows;
    if (!needle) return rows;
    return rows.filter((row) => [
      row.employee_code,
      row.employee_name,
      row.nickname,
      row.national_id,
      row.identity_no,
      row.passport_no,
      row.address,
      row.income_type,
      row.contract_type,
      row.wage_type,
    ].join(" ").toLowerCase().includes(needle));
  }, [outputRows, q]);

  const selectedRows = useMemo(() => outputRows.filter((row) => selectedIds.has(row.selection_id)), [outputRows, selectedIds]);
  const selectedTotals = useMemo(() => ({
    count: selectedRows.length,
    gross: selectedRows.reduce((sum, row) => sum + (Number(row.gross_pay) || 0), 0),
    tax: selectedRows.reduce((sum, row) => sum + (Number(row.withholding_tax) || 0), 0),
    net: selectedRows.reduce((sum, row) => sum + (Number(row.net_pay) || 0), 0),
    registerBase: selectedRows.reduce((sum, row) => sum + (Number(row.payroll_register_base_salary) || 0), 0),
    registerMidMonth: selectedRows.reduce((sum, row) => sum + (Number(row.register_mid_month_paid) || 0), 0),
    registerMonthEnd: selectedRows.reduce((sum, row) => sum + (Number(row.register_month_end_pay) || 0), 0),
    registerOvertime: selectedRows.reduce((sum, row) => sum + (Number(row.register_overtime_amount) || 0), 0),
    registerCash: selectedRows.reduce((sum, row) => sum + (Number(row.register_cash_pay) || 0), 0),
    registerSocialSecurity: selectedRows.reduce((sum, row) => sum + (Number(row.register_social_security) || 0), 0),
    registerTransferNet: selectedRows.reduce((sum, row) => sum + (Number(row.register_transfer_net_pay) || 0), 0),
    registerBalance: selectedRows.reduce((sum, row) => sum + (Number(row.register_balance) || 0), 0),
  }), [selectedRows]);

  const recurringCount = outputRows.filter((row) => row.source === "pnd3_recurring").length;
  const registerRecurringCount = outputRows.filter((row) => row.source === "payroll_register_recurring").length;
  const employeeCount = outputRows.filter((row) => row.source === "employee").length;

  function toggleRow(selectionId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(selectionId);
      else next.delete(selectionId);
      return next;
    });
  }

  function toggleShown(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      shownRows.forEach((row) => {
        if (checked) next.add(row.selection_id);
        else next.delete(row.selection_id);
      });
      return next;
    });
  }

  function pnd3Payload(draft: Pnd3Draft) {
    const payload: Record<string, string> = { ...draft };
    if ((Number(payload.default_net_amount) || 0) <= 0) delete payload.default_net_amount;
    return payload;
  }

  function registerPayload(draft: RegisterRecurringDraft) {
    const payload: Record<string, string | number | null> = { ...draft };
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
      payload[key] = Number(payload[key]) || 0;
    }
    return payload;
  }

  async function createPnd3Recurring() {
    setBusy("pnd3-create");
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch("/api/payroll/pnd3-recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pnd3Payload(pnd3Draft)),
      }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setPnd3Draft(BLANK_PND3);
      setMsg("เพิ่มรายการประจำ ภ.ง.ด.3 แล้ว");
      await loadPreview();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เพิ่มรายการประจำไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function createExternalPnd3Recipient(draft: Pnd3Draft, onDone: () => void) {
    setBusy("pnd3-external-create");
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch("/api/payroll/pnd3-recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pnd3Payload(draft)),
      }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      onDone();
      setMsg("เพิ่มคนนอกใน ภ.ง.ด.3 แล้ว เลือกเป็นผู้รับกระจายได้ทันที");
      await loadPreview();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เพิ่มคนนอกไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function archivePnd3Recurring(row: ExportRow) {
    if (row.source !== "pnd3_recurring") return;
    if (!confirm(`ปิดใช้งานรายการประจำของ ${row.employee_name}?`)) return;
    setBusy(`archive-${row.source_id}`);
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch(`/api/payroll/pnd3-recurring/${encodeURIComponent(row.source_id)}`, { method: "DELETE" }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setMsg("ปิดใช้งานรายการประจำแล้ว");
      await loadPreview();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปิดใช้งานรายการประจำไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function createRegisterRecurring() {
    setBusy("register-recurring-create");
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch("/api/payroll/register-recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerPayload(registerDraft)),
      }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setRegisterDraft(BLANK_REGISTER_RECURRING);
      setMsg("เพิ่มคนนอกประจำทะเบียนเงินเดือนแล้ว");
      await loadPreview();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เพิ่มคนนอกประจำทะเบียนเงินเดือนไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function archiveRegisterRecurring(row: ExportRow) {
    if (row.source !== "payroll_register_recurring") return;
    if (!confirm(`ปิดใช้งานคนนอกประจำของ ${row.employee_name}?`)) return;
    setBusy(`archive-${row.source_id}`);
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch(`/api/payroll/register-recurring/${encodeURIComponent(row.source_id)}`, { method: "DELETE" }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      setMsg("ปิดใช้งานคนนอกประจำทะเบียนเงินเดือนแล้ว");
      await loadPreview();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ปิดใช้งานคนนอกประจำทะเบียนเงินเดือนไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  function updateAllocationTargets(updater: (targets: Pnd3AllocationTarget[]) => Pnd3AllocationTarget[]) {
    setAllocation((current) => {
      if (!current) return current;
      const nextTargets = updater(current.targets);
      const distributed = distributePnd3Allocation(current.totals.pool_net_amount, nextTargets);
      rememberAllocatedPnd3Targets(distributed.rows);
      return { ...current, targets: distributed.rows, totals: distributed.totals };
    });
  }

  function selectAllocationTargets(checked: boolean) {
    setAllocation((current) => {
      if (!current) return current;
      const nextTargets = current.targets.map((target) => ({
        ...target,
        is_selected: checked,
        random_net_amount: target.is_fixed ? 0 : 0,
        note: target.is_fixed ? target.note : null,
      }));
      const next = checked
        ? randomizePnd3Allocation(current.totals.pool_net_amount, nextTargets, Math.random, randomSpreadPercent)
        : distributePnd3Allocation(current.totals.pool_net_amount, nextTargets);
      rememberAllocatedPnd3Targets(next.rows);
      return { ...current, targets: next.rows, totals: next.totals };
    });
  }

  function clearAllocationFixed() {
    updateAllocationTargets((targets) => targets.map((target) => ({ ...target, is_fixed: false, fixed_net_amount: 0, random_net_amount: 0, note: null })));
  }

  function randomizeAllocationTargets() {
    setAllocation((current) => {
      if (!current) return current;
      const randomized = randomizePnd3Allocation(current.totals.pool_net_amount, current.targets, Math.random, randomSpreadPercent);
      rememberAllocatedPnd3Targets(randomized.rows);
      return { ...current, targets: randomized.rows, totals: randomized.totals };
    });
  }

  function toggleAllocationTargetSelection(selectionId: string, checked: boolean) {
    setAllocation((current) => {
      if (!current) return current;
      const randomized = randomizePnd3AllocationSelection(current.totals.pool_net_amount, current.targets, selectionId, checked, Math.random, randomSpreadPercent);
      rememberAllocatedPnd3Targets(randomized.rows);
      return { ...current, targets: randomized.rows, totals: randomized.totals };
    });
  }

  function updateRandomSpreadPercent(value: number) {
    const nextValue = Math.min(100, Math.max(0, Number(value) || 0));
    setRandomSpreadPercent(nextValue);
    setAllocation((current) => {
      if (!current) return current;
      const randomized = randomizePnd3Allocation(current.totals.pool_net_amount, current.targets, Math.random, nextValue);
      rememberAllocatedPnd3Targets(randomized.rows);
      return { ...current, targets: randomized.rows, totals: randomized.totals };
    });
  }

  function equalizeAllocationTargets() {
    setAllocation((current) => {
      if (!current) return current;
      const equalized = equalizePnd3Allocation(current.totals.pool_net_amount, current.targets);
      rememberAllocatedPnd3Targets(equalized.rows);
      return { ...current, targets: equalized.rows, totals: equalized.totals };
    });
  }

  function repricePnd3Row(row: ExportRow, netPay: number): ExportRow {
    const amounts = pnd3GrossUpFromNet(netPay, 3);
    return {
      ...row,
      gross_pay: amounts.gross_pay,
      withholding_tax: amounts.withholding_tax,
      net_pay: amounts.net_pay,
      pnd3_net_override: amounts.net_pay,
    };
  }

  function updatePnd3PreviewRow(rowKey: string, updater: (row: ExportRow) => ExportRow) {
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((row) => rowKeyOf(row) === rowKey ? updater(row) : row),
      };
    });
  }

  function openPnd3RowEditor(row: ExportRow) {
    const fallback = paymentDate || preview?.period.payment_date || today();
    setEditingPnd3Row(row);
    setPnd3RowDraft({
      payment_date: isoDateOr(row.pnd3_payment_date, fallback),
      net_pay: String(Number(row.net_pay) || 0),
      national_id: row.national_id || row.identity_no || row.passport_no || "",
      address: row.address || "",
    });
  }

  async function savePnd3RowEdit() {
    if (!editingPnd3Row) return;
    const fallback = paymentDate || preview?.period.payment_date || today();
    const rowKey = rowKeyOf(editingPnd3Row);
    const nextDate = isoDateOr(pnd3RowDraft.payment_date, fallback);
    const nextNationalId = pnd3RowDraft.national_id.trim();
    const nextAddress = pnd3RowDraft.address.trim();
    const isEmployeeRow = editingPnd3Row.source === "employee" && Boolean(editingPnd3Row.employee_id);
    setBusy("pnd3-row-save");
    setErr(null);
    setMsg(null);
    try {
      if (isEmployeeRow && (nextNationalId || nextAddress)) {
        const employeePatch: Record<string, string> = {};
        const idDigits = nextNationalId.replace(/\D/g, "");
        if (nextNationalId) {
          if (idDigits.length === 13) employeePatch.national_id = nextNationalId;
          else employeePatch.passport_no = nextNationalId;
        }
        if (nextAddress) employeePatch.address = nextAddress;
        if (Object.keys(employeePatch).length > 0) {
          const json = await apiFetch(`/api/payroll/core/employees/${encodeURIComponent(editingPnd3Row.employee_id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(employeePatch),
          }).then((res) => res.json());
          if (json.error) throw new Error(json.error);
        }
      }
      updatePnd3PreviewRow(rowKey, (current) => {
        const useMasterData = current.source === "employee" && Boolean(current.employee_id);
        return repricePnd3Row({
          ...current,
          national_id: nextNationalId,
          identity_no: nextNationalId,
          address: nextAddress,
          pnd3_row_key: rowKeyOf(current),
          pnd3_base_selection_id: baseSelectionOf(current),
          pnd3_payment_date: nextDate,
          pnd3_national_id_override: useMasterData ? null : nextNationalId,
          pnd3_address_override: useMasterData ? null : nextAddress,
        }, Math.max(Number(pnd3RowDraft.net_pay) || 0, 0));
      });
      setEditingPnd3Row(null);
      setMsg(isEmployeeRow
        ? "บันทึกแถวแล้ว และอัปเดตเลขบัตร/ที่อยู่กลับไปที่ข้อมูลพนักงานแล้ว"
        : "บันทึกแถว ภ.ง.ด.3 แล้ว รายการนี้ไม่ใช่พนักงานจึงเก็บเป็นข้อมูลของแถวนี้");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกแถว ภ.ง.ด.3 ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  function copyPnd3Row(row: ExportRow) {
    const fallback = paymentDate || preview?.period.payment_date || today();
    const rowKey = `pnd3-extra:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const baseSelectionId = baseSelectionOf(row);
    const copy = repricePnd3Row({
      ...row,
      id: rowKey,
      selection_id: rowKey,
      pnd3_row_key: rowKey,
      pnd3_base_selection_id: baseSelectionId,
      pnd3_payment_date: isoDateOr(row.pnd3_payment_date, fallback),
      pnd3_is_extra: true,
      pnd3_allocation_net: 0,
      pnd3_national_id_override: row.national_id || row.identity_no || row.passport_no || "",
      pnd3_address_override: row.address || "",
    }, Number(row.net_pay) || 0);

    setPreview((current) => {
      if (!current) return current;
      const sourceKey = rowKeyOf(row);
      const nextRows: ExportRow[] = [];
      current.rows.forEach((currentRow) => {
        nextRows.push(currentRow);
        if (rowKeyOf(currentRow) === sourceKey) nextRows.push(copy);
      });
      return { ...current, rows: nextRows };
    });
    setSelectedIds((current) => new Set([...current, rowKey]));
  }

  function deletePnd3CopiedRow(row: ExportRow) {
    if (!row.pnd3_is_extra) return;
    const rowKey = rowKeyOf(row);
    setPreview((current) => current ? { ...current, rows: current.rows.filter((item) => rowKeyOf(item) !== rowKey) } : current);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(rowKey);
      return next;
    });
  }

  function rememberAllocatedPnd3Targets(targets: Pnd3AllocationTarget[]) {
    const allocatedIds = targets
      .filter((target) => (Number(target.allocated_net_amount) || 0) > 0)
      .map((target) => target.selection_id);
    if (!allocatedIds.length) return;
    setSelectedIds((current) => new Set([...current, ...allocatedIds]));
  }

  function pnd3RowOverridePayload() {
    const rows = preview?.rows ?? [];
    const defaultDate = paymentDate || preview?.period.payment_date || today();
    return rows
      .map((row, index) => {
        const rowKey = rowKeyOf(row);
        const baseSelectionId = baseSelectionOf(row);
        const rowDate = isoDateOr(row.pnd3_payment_date, defaultDate);
        const hasDateOverride = rowDate !== defaultDate;
        const hasNetOverride = row.pnd3_net_override != null;
        const hasNationalIdOverride = row.pnd3_national_id_override != null;
        const hasAddressOverride = row.pnd3_address_override != null;
        const isExtra = row.pnd3_is_extra === true;
        if (!isExtra && !hasDateOverride && !hasNetOverride && !hasNationalIdOverride && !hasAddressOverride) return null;
        return {
          row_key: rowKey,
          base_selection_id: baseSelectionId,
          payment_date: rowDate,
          net_pay: hasNetOverride || isExtra ? Number(row.pnd3_net_override ?? row.net_pay) || 0 : null,
          national_id: hasNationalIdOverride || isExtra ? row.national_id || null : null,
          address: hasAddressOverride || isExtra ? row.address || null : null,
          is_extra: isExtra,
          display_order: index,
        };
      })
      .filter(Boolean);
  }

  async function savePnd3Allocation() {
    if (!periodId || !allocation) return;
    setBusy("pnd3-allocation-save");
    setErr(null);
    setMsg(null);
    try {
      const json = await apiFetch("/api/payroll/pnd3-allocation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_id: periodId,
          rows: allocation.targets.map((target) => ({
            selection_id: target.selection_id,
            target_source: target.target_source,
            target_label: target.target_label,
            is_selected: target.is_selected,
            is_fixed: target.is_fixed,
            fixed_net_amount: target.fixed_net_amount,
            random_net_amount: target.random_net_amount ?? 0,
            note: target.note ?? null,
          })),
          row_overrides: pnd3RowOverridePayload(),
        }),
      }).then((res) => res.json());
      if (json.error) throw new Error(json.error);
      await loadPreview();
      setMsg("บันทึกการกระจายยอดและแถว ภ.ง.ด.3 แล้ว preview และ Excel จะใช้ชุดนี้");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกการกระจายยอด ภ.ง.ด.3 ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function downloadExcel() {
    if (!periodId || !preview) return;
    setBusy("download");
    setErr(null);
    setMsg(null);
    try {
      const res = await apiFetch("/api/payroll/exports/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, type, payment_date: paymentDate, employee_ids: selectedRows.map((row) => row.selection_id) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "สร้างไฟล์ Excel ไม่สำเร็จ");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename(type, preview.period.period_name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`โหลดไฟล์ ${EXPORT_OPTIONS[type].short} แล้ว ${selectedIds.size.toLocaleString("th-TH")} รายการ`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  const allShownSelected = shownRows.length > 0 && shownRows.every((row) => selectedIds.has(row.selection_id));
  const option = EXPORT_OPTIONS[type];

  return (
    <div className="mx-auto max-w-[1680px] p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ส่งออกไฟล์เงินเดือน</h1>
          <p className="text-sm text-slate-500">เลือกงวด ดู preview ก่อน แล้วค่อยโหลด Excel จากข้อมูลที่บันทึกแล้ว</p>
        </div>
        <button
          onClick={downloadExcel}
          disabled={busy === "download" || selectedIds.size === 0 || !preview}
          className="h-11 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-40"
        >
          {busy === "download" ? "กำลังสร้างไฟล์..." : `โหลด Excel ${selectedIds.size.toLocaleString("th-TH")} รายการ`}
        </button>
      </div>

      <div className="mb-4 grid gap-3 xl:grid-cols-[360px_1fr_180px]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">งวด</span>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
            {periods.map((period) => <option key={period.id} value={period.id}>{period.period_name} ({period.status})</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">ค้นหาใน preview</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ / เลข 13 หลัก / ที่อยู่ / ประเภทเงินได้"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">วันที่จ่าย</span>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        </label>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        {(Object.keys(EXPORT_OPTIONS) as ExportType[]).map((key) => {
          const meta = EXPORT_OPTIONS[key];
          const active = type === key;
          return (
            <button key={key} onClick={() => setType(key)}
              className={`rounded-lg border p-4 text-left transition ${active ? meta.accent : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <div className="text-base font-bold">{meta.title}</div>
              <div className="mt-1 text-sm opacity-80">{meta.description}</div>
            </button>
          );
        })}
      </div>

      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{msg}</div>}
      {err && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}

      {type === "pnd3" && (
        <Pnd3RecurringPanel
          draft={pnd3Draft}
          setDraft={setPnd3Draft}
          busy={busy === "pnd3-create"}
          onCreate={createPnd3Recurring}
          recurringCount={recurringCount}
        />
      )}

      {type === "payroll_register" && (
        <PayrollRegisterRecurringPanel
          draft={registerDraft}
          setDraft={setRegisterDraft}
          busy={busy === "register-recurring-create"}
          onCreate={createRegisterRecurring}
          recurringCount={registerRecurringCount}
        />
      )}

      {type === "pnd3" && allocation && (
        <Pnd3AllocationPanel
          allocation={allocation}
          busy={busy === "pnd3-allocation-save"}
          randomSpreadPercent={randomSpreadPercent}
          onSelectAll={() => selectAllocationTargets(true)}
          onClearSelection={() => selectAllocationTargets(false)}
          onClearFixed={clearAllocationFixed}
          onRandomize={randomizeAllocationTargets}
          onEqualize={equalizeAllocationTargets}
          onChangeRandomSpread={updateRandomSpreadPercent}
          onToggleTargetSelection={toggleAllocationTargetSelection}
          onCreateExternal={createExternalPnd3Recipient}
          onSave={savePnd3Allocation}
          onChangeTarget={(selectionId, patch) => updateAllocationTargets((targets) => targets.map((target) => (
            target.selection_id === selectionId ? { ...target, ...patch } : target
          )))}
        />
      )}

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-slate-900">{type === "pnd3" ? "Preview ภ.ง.ด.3" : option.title}</div>
            <div className="text-sm text-slate-500">
              {loading ? "กำลังโหลด..." : preview?.run ? `ใช้รอบคำนวณ #${preview.run.run_no} · ${preview.period.period_name}` : "ยังไม่พบผลคำนวณที่บันทึกในงวดนี้"}
            </div>
          </div>
          <button onClick={loadPreview} disabled={loading} className="h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            รีเฟรช
          </button>
        </div>

        {type === "pnd3" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryBox label="เลือกแล้ว" value={`${selectedTotals.count.toLocaleString("th-TH")} รายการ`} />
            <SummaryBox label="จากพนักงาน" value={`${employeeCount.toLocaleString("th-TH")} รายการ`} />
            <SummaryBox label="รายการประจำ" value={`${recurringCount.toLocaleString("th-TH")} รายการ`} />
            <SummaryBox label="ภาษี" value={baht(selectedTotals.tax)} />
            <SummaryBox label="ยอดสุทธิ" value={baht(selectedTotals.net)} strong />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryBox label="เลือกแล้ว" value={`${selectedTotals.count.toLocaleString("th-TH")} รายการ`} />
            <SummaryBox label="คนนอกประจำ" value={`${registerRecurringCount.toLocaleString("th-TH")} รายการ`} />
            <SummaryBox label="ฐานเงินเดือน" value={baht(selectedTotals.registerBase)} />
            <SummaryBox label="เงินเดือน 16" value={baht(selectedTotals.registerMidMonth)} />
            <SummaryBox label="เงินเดือน 31" value={baht(selectedTotals.registerMonthEnd)} />
            <SummaryBox label="สุทธิจ่าย" value={baht(selectedTotals.registerTransferNet)} strong />
          </div>
        )}
      </section>

      {type === "pnd3" ? (
        <Pnd3PreviewTable
          rows={shownRows}
          selectedIds={selectedIds}
          allShownSelected={allShownSelected}
          paymentDate={paymentDate}
          loading={loading}
          busy={busy}
          onToggleShown={toggleShown}
          onToggleRow={toggleRow}
          onArchiveRecurring={archivePnd3Recurring}
          onEditRow={openPnd3RowEditor}
          onCopyRow={copyPnd3Row}
          onDeleteCopiedRow={deletePnd3CopiedRow}
          onSaveRows={savePnd3Allocation}
        />
      ) : (
        <PayrollRegisterTable
          rows={shownRows}
          selectedIds={selectedIds}
          allShownSelected={allShownSelected}
          loading={loading}
          busy={busy}
          totalRows={preview?.rows.length ?? 0}
          onToggleShown={toggleShown}
          onToggleRow={toggleRow}
          onArchiveRecurring={archiveRegisterRecurring}
        />
      )}

      <Pnd3RowEditModal
        row={editingPnd3Row}
        draft={pnd3RowDraft}
        setDraft={setPnd3RowDraft}
        saving={busy === "pnd3-row-save"}
        onClose={() => setEditingPnd3Row(null)}
        onSave={savePnd3RowEdit}
      />
    </div>
  );
}

function Pnd3RecurringPanel({ draft, setDraft, busy, onCreate, recurringCount }: {
  draft: Pnd3Draft;
  setDraft: (next: Pnd3Draft) => void;
  busy: boolean;
  onCreate: () => void;
  recurringCount: number;
}) {
  const set = (key: keyof Pnd3Draft, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <section className="mb-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold text-slate-900">รายการประจำ ภ.ง.ด.3</div>
          <div className="text-sm text-slate-500">บันทึกชื่อ เลข 13 หลัก ที่อยู่ และยอดสุทธิประจำ แล้วระบบจะคำนวณจำนวนเงิน/ภาษีให้ใน preview</div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700">ใช้งานอยู่ {recurringCount.toLocaleString("th-TH")} รายการ</span>
      </div>
      <div className="grid gap-2 xl:grid-cols-[1.2fr_170px_1.4fr_130px_150px_90px_auto]">
        <input value={draft.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} placeholder="ชื่อบุคคล / บริษัท" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input value={draft.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="เลข 13 หลัก" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="ที่อยู่" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input value={draft.income_type} onChange={(e) => set("income_type", e.target.value)} placeholder="ค่าจ้าง" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.default_net_amount} onChange={(e) => set("default_net_amount", e.target.value)} placeholder="ยอดสุทธิประจำ" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} placeholder="%" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <button onClick={onCreate} disabled={busy} className="h-10 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-40">
          {busy ? "กำลังเพิ่ม..." : "+ เพิ่ม"}
        </button>
      </div>
    </section>
  );
}

function PayrollRegisterRecurringPanel({ draft, setDraft, busy, onCreate, recurringCount }: {
  draft: RegisterRecurringDraft;
  setDraft: (next: RegisterRecurringDraft) => void;
  busy: boolean;
  onCreate: () => void;
  recurringCount: number;
}) {
  const set = (key: keyof RegisterRecurringDraft, value: string) => setDraft({ ...draft, [key]: value });
  return (
    <section className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold text-slate-900">คนนอกประจำทะเบียนเงินเดือน</div>
          <div className="text-sm text-slate-500">ใช้กับคนที่ต้องอยู่ในทะเบียนเงินเดือนซ้ำทุกงวด แต่ไม่ได้อยู่ในรายชื่อพนักงาน เช่น คนนอกหรือแรงงานที่ต้องใช้ Passport</div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">ใช้งานอยู่ {recurringCount.toLocaleString("th-TH")} รายการ</span>
      </div>

      <div className="grid gap-2 xl:grid-cols-[1.2fr_120px_110px_150px_150px]">
        <input value={draft.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} placeholder="ชื่อ-นามสกุล" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input value={draft.nickname} onChange={(e) => set("nickname", e.target.value)} placeholder="ชื่อเล่น" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input value={draft.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="สัญชาติ" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input value={draft.national_id} onChange={(e) => set("national_id", e.target.value)} placeholder="เลขบัตรประชาชน" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input value={draft.passport_no} onChange={(e) => set("passport_no", e.target.value)} placeholder="Passport" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
      </div>

      <div className="mt-2 grid gap-2 xl:grid-cols-[repeat(8,minmax(110px,1fr))_auto]">
        <input type="number" value={draft.register_base_salary} onChange={(e) => set("register_base_salary", e.target.value)} placeholder="ฐานเงินเดือน" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.register_mid_month_paid} onChange={(e) => set("register_mid_month_paid", e.target.value)} placeholder="เงินเดือน 16" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.register_month_end_pay} onChange={(e) => set("register_month_end_pay", e.target.value)} placeholder="เงินเดือน 31" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.register_overtime_amount} onChange={(e) => set("register_overtime_amount", e.target.value)} placeholder="OT 31" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.register_cash_pay} onChange={(e) => set("register_cash_pay", e.target.value)} placeholder="เงินสด" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.register_social_security} onChange={(e) => set("register_social_security", e.target.value)} placeholder="ปกส. 5%" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <input type="number" value={draft.register_transfer_net_pay} onChange={(e) => set("register_transfer_net_pay", e.target.value)} placeholder="สุทธิจ่าย" className="h-10 rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800" />
        <input type="number" value={draft.register_balance} onChange={(e) => set("register_balance", e.target.value)} placeholder="ยอดคงเหลือ" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        <button onClick={onCreate} disabled={busy} className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40">
          {busy ? "กำลังบันทึก..." : "+ เพิ่ม"}
        </button>
      </div>
      <div className="mt-2 text-xs text-slate-500">ช่องเลขบัตร/Passport ใช้แทนกันได้ ถ้าไม่มีเลขบัตรไทย ระบบจะแสดง Passport ในทะเบียนเงินเดือนและไฟล์ Excel</div>
    </section>
  );
}

function Pnd3AllocationPanel({ allocation, busy, randomSpreadPercent, onSelectAll, onClearSelection, onClearFixed, onRandomize, onEqualize, onChangeRandomSpread, onToggleTargetSelection, onCreateExternal, onSave, onChangeTarget }: {
  allocation: Pnd3AllocationPreview;
  busy: boolean;
  randomSpreadPercent: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onClearFixed: () => void;
  onRandomize: () => void;
  onEqualize: () => void;
  onChangeRandomSpread: (value: number) => void;
  onToggleTargetSelection: (selectionId: string, checked: boolean) => void;
  onCreateExternal: (draft: Pnd3Draft, onDone: () => void) => void;
  onSave: () => void;
  onChangeTarget: (selectionId: string, patch: Partial<Pnd3AllocationTarget>) => void;
}) {
  const [targetQ, setTargetQ] = useState("");
  const [showExternal, setShowExternal] = useState(false);
  const [externalDraft, setExternalDraft] = useState<Pnd3Draft>({ ...BLANK_PND3, default_net_amount: "0" });
  const setExternal = (key: keyof Pnd3Draft, value: string) => setExternalDraft((current) => ({ ...current, [key]: value }));
  const resetExternal = () => {
    setExternalDraft({ ...BLANK_PND3, default_net_amount: "0" });
    setShowExternal(false);
  };
  const targetNeedle = targetQ.trim().toLowerCase();
  const filteredTargets = targetNeedle
    ? allocation.targets.filter((target) => target.target_label.toLowerCase().includes(targetNeedle))
    : allocation.targets;
  const remainingClass = allocation.totals.remaining_net_amount === 0
    ? "text-emerald-700"
    : allocation.totals.remaining_net_amount < 0 ? "text-red-700" : "text-amber-700";
  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold text-slate-900">จัดการกระจายยอดรายวันต่างชาติไป ภ.ง.ด.3</div>
          <div className="text-sm text-slate-600">เปิดครั้งแรกระบบสุ่มให้จากยอดทั้งหมดแล้ว ถ้าติ๊กผู้รับเพิ่ม/ลด ระบบจะสุ่มใหม่ตามคนที่เลือกทันที รายการที่ติ๊ก FIX จะล็อกยอดไว้</div>
        </div>
        <button onClick={onSave} disabled={busy} className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
          {busy ? "กำลังบันทึก..." : "บันทึกการกระจาย"}
        </button>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryBox label="ยอดรายวันต่างชาติที่ต้องกระจาย" value={baht(allocation.totals.pool_net_amount)} />
        <SummaryBox label="กระจายแล้ว" value={baht(allocation.totals.allocated_net_amount)} />
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className={`text-lg font-bold ${remainingClass}`}>{baht(allocation.totals.remaining_net_amount)}</div>
          <div className="text-xs text-slate-500">คงเหลือ</div>
        </div>
        <SummaryBox label="ยอด FIX รวม" value={baht(allocation.totals.fixed_net_amount)} />
        <SummaryBox label="ยอดสุ่มรวม" value={baht(allocation.totals.random_net_amount)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowExternal((v) => !v)} className="h-9 rounded-lg border border-sky-300 bg-white px-3 text-xs font-semibold text-sky-800 hover:bg-sky-50">+ เพิ่มคนนอก</button>
        <button onClick={onRandomize} className="h-9 rounded-lg border border-amber-300 bg-amber-100 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-200">สุ่มใหม่</button>
        <button onClick={onEqualize} className="h-9 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">เฉลี่ยเท่ากัน</button>
        <button onClick={onSelectAll} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">เลือกผู้รับทั้งหมด</button>
        <button onClick={onClearSelection} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">ล้างผู้รับ</button>
        <button onClick={onClearFixed} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">ล้างยอด FIX</button>
        <div className="flex h-9 min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-amber-100 bg-white px-3">
          <span className="whitespace-nowrap text-xs font-semibold text-slate-600">ความต่าง {randomSpreadPercent}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={randomSpreadPercent}
            onChange={(e) => onChangeRandomSpread(Number(e.target.value))}
            className="h-2 min-w-[120px] flex-1 accent-amber-500"
          />
          <span className="whitespace-nowrap text-[11px] text-slate-400">ใกล้ ↔ ต่าง</span>
        </div>
      </div>

      {showExternal && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-white p-3">
          <div className="mb-2 text-sm font-bold text-slate-900">เพิ่มคนนอกสำหรับ ภ.ง.ด.3</div>
          <div className="grid gap-2 xl:grid-cols-[1.2fr_160px_1.4fr_130px_120px_auto]">
            <input value={externalDraft.recipient_name} onChange={(e) => setExternal("recipient_name", e.target.value)} placeholder="ชื่อบุคคล / บริษัท" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            <input value={externalDraft.tax_id} onChange={(e) => setExternal("tax_id", e.target.value)} placeholder="เลข 13 หลัก" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            <input value={externalDraft.address} onChange={(e) => setExternal("address", e.target.value)} placeholder="ที่อยู่" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            <input value={externalDraft.income_type} onChange={(e) => setExternal("income_type", e.target.value)} placeholder="ค่าจ้าง" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            <input type="number" min="0" value={externalDraft.default_net_amount} onChange={(e) => setExternal("default_net_amount", e.target.value)} placeholder="ยอดเริ่มต้น" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            <button onClick={() => onCreateExternal(externalDraft, resetExternal)} disabled={busy} className="h-10 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-40">
              {busy ? "กำลังบันทึก..." : "บันทึกคนนอก"}
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500">บันทึกแล้วชื่อจะเข้า “รายการประจำ ภ.ง.ด.3” และเลือกเป็นผู้รับกระจายได้ทันที ยอดเริ่มต้นใส่ 0 ได้</div>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[340px_1fr]">
        <div className="rounded-lg border border-amber-100 bg-white p-3">
          <div className="mb-2 text-sm font-bold text-slate-900">ต้นทางรายวันต่างชาติ ({allocation.source_rows.length.toLocaleString("th-TH")} คน)</div>
          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {allocation.source_rows.map((row) => (
              <div key={row.selection_id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <div className="font-semibold text-slate-800">{row.employee_code || "-"} · {row.employee_name}</div>
                <div className="text-slate-500">{row.nationality || "-"} · {row.wage_type || row.contract_type || "-"}</div>
                <div className="mt-1 font-bold text-amber-700">{baht(row.net_pay)}</div>
              </div>
            ))}
            {allocation.source_rows.length === 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-8 text-center text-sm text-slate-400">ไม่พบพนักงานรายวันต่างชาติในงวดนี้</div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-amber-100 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <input
              value={targetQ}
              onChange={(e) => setTargetQ(e.target.value)}
              placeholder="ค้นหาผู้รับ ภ.ง.ด.3"
              className="h-9 min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
            <div className="text-xs font-semibold text-slate-500">
              แสดง {filteredTargets.length.toLocaleString("th-TH")} / {allocation.targets.length.toLocaleString("th-TH")} รายการ
            </div>
          </div>
          <div className="grid grid-cols-[44px_minmax(240px,1fr)_110px_90px_120px_120px_130px] border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <div className="px-2 py-2 text-center">ใช้</div>
            <div className="px-3 py-2">ผู้รับ ภ.ง.ด.3</div>
            <div className="px-3 py-2 text-right">ยอดเดิม</div>
            <div className="px-3 py-2 text-center">FIX</div>
            <div className="px-3 py-2 text-right">ยอด FIX</div>
            <div className="px-3 py-2 text-right">ยอดสุ่ม</div>
            <div className="px-3 py-2 text-right">ยอดที่จะลง</div>
          </div>
          <div className="max-h-80 overflow-auto">
            {filteredTargets.map((target) => (
              <div key={target.selection_id} className="grid grid-cols-[44px_minmax(240px,1fr)_110px_90px_120px_120px_130px] items-center border-b border-slate-100 text-sm">
                <div className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={target.is_selected}
                    onChange={(e) => onToggleTargetSelection(target.selection_id, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </div>
                <div className="min-w-0 px-3 py-2">
                  <div className="truncate font-semibold text-slate-900">{target.target_label}</div>
                  <div className="text-xs text-slate-400">{target.target_source === "pnd3_recurring" ? "รายการประจำ" : "พนักงาน"}</div>
                </div>
                <div className="px-3 py-2 text-right text-slate-600">{baht(target.base_net_amount)}</div>
                <div className="px-3 py-2 text-center">
                  <label className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={target.is_fixed}
                      onChange={(e) => onChangeTarget(target.selection_id, { is_fixed: e.target.checked, fixed_net_amount: e.target.checked ? target.fixed_net_amount : 0, random_net_amount: 0, note: null })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    FIX
                  </label>
                </div>
                <div className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    value={target.fixed_net_amount || ""}
                    disabled={!target.is_fixed}
                    onChange={(e) => onChangeTarget(target.selection_id, { fixed_net_amount: Number(e.target.value) || 0, is_fixed: true, random_net_amount: 0, note: null })}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-right text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <div className="px-3 py-2 text-right font-semibold text-amber-700">{!target.is_fixed && (target.random_net_amount ?? 0) > 0 ? baht(target.random_net_amount ?? 0) : "-"}</div>
                <div className="px-3 py-2 text-right font-bold text-emerald-700">{baht(target.allocated_net_amount)}</div>
              </div>
            ))}
            {filteredTargets.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">ยังไม่มีผู้รับ ภ.ง.ด.3 ให้กระจายยอด</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Pnd3PreviewTable({ rows, selectedIds, allShownSelected, paymentDate, loading, busy, onToggleShown, onToggleRow, onArchiveRecurring, onEditRow, onCopyRow, onDeleteCopiedRow, onSaveRows }: {
  rows: ExportRow[];
  selectedIds: Set<string>;
  allShownSelected: boolean;
  paymentDate: string;
  loading: boolean;
  busy: string | null;
  onToggleShown: (checked: boolean) => void;
  onToggleRow: (selectionId: string, checked: boolean) => void;
  onArchiveRecurring: (row: ExportRow) => void;
  onEditRow: (row: ExportRow) => void;
  onCopyRow: (row: ExportRow) => void;
  onDeleteCopiedRow: (row: ExportRow) => void;
  onSaveRows: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={allShownSelected} onChange={(e) => onToggleShown(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          เลือกรายการที่แสดง
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm text-slate-500">Preview ก่อน download · แสดง {rows.length.toLocaleString("th-TH")} รายการ</div>
          <button onClick={onSaveRows} disabled={busy === "pnd3-allocation-save"} className="h-8 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
            {busy === "pnd3-allocation-save" ? "กำลังบันทึก..." : "บันทึกแถว"}
          </button>
        </div>
      </div>
      <div className="border-b border-sky-100 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-800">
        สูตร ภ.ง.ด.3: ตารางนี้เป็น preview อ่านก่อนโหลดไฟล์ · กด “แก้ไข” เพื่อแก้วันที่/ยอดสุทธิ/เลขภาษี/ที่อยู่เฉพาะแถว · กด “คัดลอก” เมื่อต้องลงคนเดิมหลายวัน
      </div>
      <div className="max-h-[66vh] overflow-auto">
        <table className="min-w-[1500px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th colSpan={12} className="border border-slate-300 bg-white px-3 py-2 text-center text-base font-bold text-slate-900">ภงด.3</th>
            </tr>
            <tr className="bg-slate-50 text-slate-700">
              <th className="w-10 border border-slate-300 px-2 py-2"></th>
              <th className="w-16 border border-slate-300 px-2 py-2 text-center">ลำดับ</th>
              <th className="w-[150px] border border-slate-300 px-3 py-2">วันที่</th>
              <th className="w-260 border border-slate-300 px-3 py-2">ชื่อบริษัท/บุคคล</th>
              <th className="w-160 border border-slate-300 px-3 py-2">เลข 13 หลัก</th>
              <th className="min-w-[360px] border border-slate-300 px-3 py-2">ที่อยู่</th>
              <th className="w-150 border border-slate-300 px-3 py-2">ค่าจ้าง/บริการ</th>
              <th className="w-130 border border-slate-300 px-3 py-2 text-right">จำนวนเงิน</th>
              <th className="w-120 border border-slate-300 px-3 py-2 text-right">ภาษี</th>
              <th className="w-[150px] border border-slate-300 px-3 py-2 text-right">ยอดสุทธิ</th>
              <th className="w-120 border border-slate-300 px-3 py-2">แหล่งที่มา</th>
              <th className="w-[150px] border border-slate-300 px-3 py-2">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.selection_id} className={selectedIds.has(row.selection_id) ? "bg-sky-50/40" : "bg-white"}>
                <td className="border border-slate-200 px-2 py-2 text-center">
                  <input type="checkbox" checked={selectedIds.has(row.selection_id)} onChange={(e) => onToggleRow(row.selection_id, e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                </td>
                <td className="border border-slate-200 px-2 py-2 text-center">{index + 1}</td>
                <td className="border border-slate-200 px-3 py-2">
                  <div className="font-medium text-slate-800">{thaiDate(isoDateOr(row.pnd3_payment_date, paymentDate))}</div>
                  {row.pnd3_payment_date && row.pnd3_payment_date !== paymentDate ? (
                    <div className="mt-1 text-[10px] font-medium text-amber-600">แก้เฉพาะแถว</div>
                  ) : null}
                </td>
                <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-900">{row.employee_name || "-"}</td>
                <td className="border border-slate-200 px-3 py-2 font-mono text-xs text-slate-600">
                  {row.national_id || row.identity_no || row.passport_no || <span className="font-sans font-semibold text-red-600">ต้องกรอก</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2 text-slate-700">
                  {row.address || <span className="font-semibold text-red-600">ต้องกรอก</span>}
                </td>
                <td className="border border-slate-200 px-3 py-2">{row.income_type || "ค่าจ้าง"}</td>
                <td className="border border-slate-200 px-3 py-2 text-right">{baht(row.gross_pay)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right">{baht(row.withholding_tax)}</td>
                <td className="border border-slate-200 px-3 py-2 text-right font-semibold text-slate-900">
                  {baht(row.net_pay)}
                  {(row.pnd3_allocation_net ?? 0) > 0 && (
                    <div className="text-[11px] font-medium text-amber-600">+ กระจาย {baht(row.pnd3_allocation_net)}</div>
                  )}
                  {row.pnd3_net_override != null && (
                    <div className="text-[11px] font-medium text-sky-600">แก้ยอดแล้ว</div>
                  )}
                </td>
                <td className="border border-slate-200 px-3 py-2">
                  {row.pnd3_is_extra ? (
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">แถวเพิ่ม</span>
                  ) : row.source === "pnd3_recurring" ? (
                    <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">รายการประจำ</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">พนักงาน</span>
                  )}
                </td>
                <td className="border border-slate-200 px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => onEditRow(row)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      แก้ไข
                    </button>
                    <button onClick={() => onCopyRow(row)} className="rounded-md border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50">
                      คัดลอก
                    </button>
                    {row.pnd3_is_extra ? (
                      <button onClick={() => onDeleteCopiedRow(row)} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                        ลบ
                      </button>
                    ) : row.source === "pnd3_recurring" ? (
                      <button onClick={() => onArchiveRecurring(row)} disabled={busy === `archive-${row.source_id}`} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
                        ปิดใช้
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={12} className="border border-slate-200 px-4 py-12 text-center text-sm text-slate-400">ไม่มีรายการ ภ.ง.ด.3 ให้ preview</td></tr>
            )}
            {loading && (
              <tr><td colSpan={12} className="border border-slate-200 px-4 py-12 text-center text-sm text-slate-400">กำลังโหลด preview...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Pnd3RowEditModal({ row, draft, setDraft, saving, onClose, onSave }: {
  row: ExportRow | null;
  draft: Pnd3RowEditDraft;
  setDraft: (next: Pnd3RowEditDraft) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!row) return null;
  const set = (key: keyof Pnd3RowEditDraft, value: string) => setDraft({ ...draft, [key]: value });
  const netPay = Math.max(Number(draft.net_pay) || 0, 0);
  const amounts = pnd3GrossUpFromNet(netPay, 3);
  const missingIdentity = !draft.national_id.trim();
  const missingAddress = !draft.address.trim();
  const savesToEmployee = row.source === "employee" && Boolean(row.employee_id);

  return (
    <ERPModal
      open
      onClose={onClose}
      title="แก้ไขแถว ภ.ง.ด.3"
      description={`${row.employee_name || "-"} · ${savesToEmployee ? "เลขบัตร/Passport และที่อยู่จะบันทึกกลับข้อมูลพนักงาน" : "รายการนี้ไม่ใช่พนักงาน จึงเก็บเป็นข้อมูลเฉพาะแถว ภ.ง.ด.3"}`}
      size="lg"
      storageKey="payroll-pnd3-row-edit"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            {savesToEmployee ? "ข้อมูลเลขบัตร/ที่อยู่จะถูกเก็บที่พนักงาน และ preview นี้จะอัปเดตทันที" : "หลังบันทึก popup แล้ว อย่าลืมกด “บันทึกแถว” เพื่อเก็บลงระบบ"}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              ยกเลิก
            </button>
            <button type="button" onClick={onSave} disabled={saving} className="h-9 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40">
              {saving ? "กำลังบันทึก..." : "บันทึกแถวนี้"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          {savesToEmployee
            ? "เลขบัตร/Passport และที่อยู่จะบันทึกกลับไปที่ข้อมูลพนักงานจริง ส่วนวันที่จ่ายและยอดสุทธิยังเป็นค่าเฉพาะแถว ภ.ง.ด.3 นี้"
            : "ใช้สำหรับแก้เฉพาะบรรทัดใน ภ.ง.ด.3 เช่น วันที่จ่ายคนละวัน ยอดสุทธิคนละยอด หรือคนนี้ต้องใส่เลขภาษี/ที่อยู่เฉพาะเอกสาร"}
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-700">วันที่จ่าย</label>
            <input
              type="date"
              value={draft.payment_date}
              onChange={(e) => set("payment_date", e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            <div className="mt-1 text-xs text-slate-400">{thaiDate(draft.payment_date)}</div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">ยอดสุทธิที่ต้องการ</label>
            <input
              type="number"
              min="0"
              value={draft.net_pay}
              onChange={(e) => set("net_pay", e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-right text-sm font-semibold"
            />
            <div className="mt-1 text-xs text-slate-400">ระบบจะถอดภาษี 3% ให้เป็นจำนวนเงินและภาษีอัตโนมัติ</div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-700">เลข 13 หลัก / Passport</label>
            <input
              value={draft.national_id}
              onChange={(e) => set("national_id", e.target.value)}
              placeholder="เช่น 3 1234 56789 01 2"
              className={`mt-1 h-10 w-full rounded-lg border px-3 text-sm ${missingIdentity ? "border-red-200 bg-red-50" : "border-slate-300"}`}
            />
            <div className={`mt-1 text-xs ${missingIdentity ? "text-red-500" : "text-slate-400"}`}>
              {savesToEmployee ? "ถ้าเป็นเลขไทย 13 หลักจะบันทึกเป็นเลขบัตร ถ้าไม่ใช่จะบันทึกเป็น Passport" : "ถ้าข้อมูลรายการนี้ไม่มี ให้กรอกตรงนี้ก่อน export"}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">ที่อยู่</label>
            <textarea
              value={draft.address}
              onChange={(e) => set("address", e.target.value)}
              rows={3}
              placeholder="ที่อยู่สำหรับ ภ.ง.ด.3"
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${missingAddress ? "border-red-200 bg-red-50" : "border-slate-300"}`}
            />
            <div className={`mt-1 text-xs ${missingAddress ? "text-red-500" : "text-slate-400"}`}>
              {savesToEmployee ? "ที่อยู่นี้จะบันทึกกลับข้อมูลพนักงาน และใช้ในงวดถัดไปด้วย" : "ค่านี้จะตามไปใน preview และ Excel เฉพาะงวดนี้"}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">ตัวอย่างยอดที่จะออกไฟล์</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-3">
              <div className="text-xs text-slate-500">จำนวนเงิน</div>
              <div className="text-lg font-bold text-slate-900">{baht(amounts.gross_pay)}</div>
            </div>
            <div className="rounded-lg bg-white p-3">
              <div className="text-xs text-slate-500">ภาษี 3%</div>
              <div className="text-lg font-bold text-slate-900">{baht(amounts.withholding_tax)}</div>
            </div>
            <div className="rounded-lg bg-white p-3">
              <div className="text-xs text-slate-500">ยอดสุทธิ</div>
              <div className="text-lg font-bold text-emerald-700">{baht(amounts.net_pay)}</div>
            </div>
          </div>
        </section>
      </div>
    </ERPModal>
  );
}

function PayrollRegisterTable({ rows, selectedIds, allShownSelected, loading, busy, totalRows, onToggleShown, onToggleRow, onArchiveRecurring }: {
  rows: ExportRow[];
  selectedIds: Set<string>;
  allShownSelected: boolean;
  loading: boolean;
  busy: string | null;
  totalRows: number;
  onToggleShown: (checked: boolean) => void;
  onToggleRow: (selectionId: string, checked: boolean) => void;
  onArchiveRecurring: (row: ExportRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={allShownSelected} onChange={(e) => onToggleShown(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          เลือกรายการที่แสดง
        </label>
        <div className="text-sm text-slate-500">แสดง {rows.length.toLocaleString("th-TH")} จาก {totalRows.toLocaleString("th-TH")} รายการ</div>
      </div>

      <div className="max-h-[62vh] overflow-auto">
        <table className="min-w-[1540px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-12 px-3 py-3"></th>
              <th className="w-16 px-3 py-3 text-center">ลำดับ</th>
              <th className="min-w-[220px] px-3 py-3">ชื่อ-นามสกุล</th>
              <th className="w-24 px-3 py-3">ชื่อเล่น</th>
              <th className="w-[170px] px-3 py-3">เลขบัตร/Passport</th>
              <th className="w-[130px] px-3 py-3 text-right">ฐานเงินเดือน</th>
              <th className="w-[130px] px-3 py-3 text-right">เงินเดือน 16</th>
              <th className="w-[130px] px-3 py-3 text-right">เงินเดือน 31</th>
              <th className="w-[110px] px-3 py-3 text-right">OT 31</th>
              <th className="w-[110px] px-3 py-3 text-right">เงินสด</th>
              <th className="w-[110px] bg-yellow-100 px-3 py-3 text-right text-slate-700">ปกส. 5%</th>
              <th className="w-[130px] px-3 py-3 text-right">สุทธิจ่าย</th>
              <th className="w-[130px] px-3 py-3 text-right">ยอดคงเหลือ</th>
              <th className="w-[120px] px-3 py-3">แหล่งที่มา</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.selection_id} className={selectedIds.has(row.selection_id) ? "bg-emerald-50/40" : "bg-white"}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selectedIds.has(row.selection_id)} onChange={(e) => onToggleRow(row.selection_id, e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                </td>
                <td className="px-3 py-3 text-center text-slate-600">{index + 1}</td>
                <td className="px-3 py-3">
                  <div className="font-semibold text-slate-900">{row.employee_name || "-"}</div>
                  <div className="font-mono text-xs text-slate-400">{row.employee_code || "-"}</div>
                </td>
                <td className="px-3 py-3 text-slate-700">{row.nickname || "-"}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{identityText(row)}</td>
                <td className="px-3 py-3 text-right font-semibold text-slate-700">{baht(row.register_base_salary)}</td>
                <td className="px-3 py-3 text-right text-slate-700">{dashBaht(row.register_mid_month_paid)}</td>
                <td className="px-3 py-3 text-right font-semibold text-slate-700">{baht(row.register_month_end_pay)}</td>
                <td className="px-3 py-3 text-right text-slate-700">{dashBaht(row.register_overtime_amount)}</td>
                <td className="px-3 py-3 text-right text-slate-700">{dashBaht(row.register_cash_pay)}</td>
                <td className="bg-yellow-50 px-3 py-3 text-right font-semibold text-slate-800">{baht(row.register_social_security)}</td>
                <td className="px-3 py-3 text-right font-bold text-emerald-700">{baht(row.register_transfer_net_pay)}</td>
                <td className="px-3 py-3 text-right font-bold text-emerald-700">{baht(row.register_balance)}</td>
                <td className="px-3 py-3">
                  {row.source === "payroll_register_recurring" ? (
                    <button onClick={() => onArchiveRecurring(row)} disabled={busy === `archive-${row.source_id}`} className="rounded-full border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
                      ปิดใช้
                    </button>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">พนักงาน</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={14} className="px-4 py-12 text-center text-sm text-slate-400">ไม่มีรายการตามเงื่อนไข export นี้</td></tr>
            )}
            {loading && (
              <tr><td colSpan={14} className="px-4 py-12 text-center text-sm text-slate-400">กำลังโหลดรายการ...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryBox({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${strong ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <div className={`text-lg font-bold ${strong ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}


