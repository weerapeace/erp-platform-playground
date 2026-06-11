"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AccessDenied, useAuth, type Permission } from "@/components/auth";
import { DataTable, type DataTableView, type RowAction } from "@/components/data-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { buildPayrollEmployeeSelectOption, payrollEmployeeSearchText, type PayrollEmployeeDisplayRow } from "@/lib/payroll-employee-display";
import { getResignationTransitionCopy } from "@/lib/payroll-resignations-copy";

type ResignationStatus = "pending" | "approved" | "rejected" | "cancelled";

type ResignationRow = Record<string, unknown> & {
  id: string;
  employee_id: string;
  employee_label: string;
  notice_date: string;
  last_working_date: string;
  reason: string;
  handover_note: string;
  status: ResignationStatus;
  review_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

type EmployeeOption = PayrollEmployeeDisplayRow;

type FormState = {
  employee_id: string;
  notice_date: string;
  last_working_date: string;
  reason: string;
  handover_note: string;
};

type PendingAction = {
  row: ResignationRow;
  action: "approve" | "reject" | "cancel";
};

const STATUS_META: Record<ResignationStatus, { label: string; className: string }> = {
  pending: { label: "รอตรวจ", className: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "อนุมัติแล้ว", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "ปฏิเสธ", className: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { label: "ยกเลิก", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusBadge(status: unknown) {
  const key = String(status || "pending") as ResignationStatus;
  const meta = STATUS_META[key] ?? STATUS_META.pending;
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>{meta.label}</span>;
}

function DetailField({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-900">{children || "-"}</div>
    </div>
  );
}

async function readJson<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || "ทำรายการไม่สำเร็จ");
  return json as T;
}

export default function PayrollResignationsPage() {
  const { can, user, ready } = useAuth();
  const canView = can("employees.view");
  const canEdit = can("employees.edit");
  const [rows, setRows] = useState<ResignationRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<ResignationRow | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    employee_id: "",
    notice_date: todayIso(),
    last_working_date: "",
    reason: "",
    handover_note: "",
  });

  const loadRows = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const json = await readJson<{ data: ResignationRow[] }>(await apiFetch("/api/payroll/resignations?limit=1000"));
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดรายการแจ้งลาออกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [canView]);

  const loadEmployees = useCallback(async () => {
    if (!canView) return;
    try {
      const json = await readJson<{ data: EmployeeOption[] }>(await apiFetch("/api/payroll/core/employees?include_inactive=false"));
      setEmployees(json.data ?? []);
    } catch {
      setEmployees([]);
    }
  }, [canView]);

  useEffect(() => {
    if (!ready || !canView) return;
    void loadRows();
    void loadEmployees();
  }, [ready, canView, loadRows, loadEmployees]);

  const counts = useMemo(() => {
    return rows.reduce<Record<ResignationStatus, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, { pending: 0, approved: 0, rejected: 0, cancelled: 0 });
  }, [rows]);

  const views: DataTableView[] = useMemo(() => [
    { id: "all", label: "ทั้งหมด", filter: () => true },
    { id: "pending", label: `รอตรวจ (${counts.pending})`, filter: (row: Record<string, unknown>) => row.status === "pending" },
    { id: "approved", label: `อนุมัติแล้ว (${counts.approved})`, filter: (row: Record<string, unknown>) => row.status === "approved" },
    { id: "rejected", label: `ปฏิเสธ (${counts.rejected})`, filter: (row: Record<string, unknown>) => row.status === "rejected" },
    { id: "cancelled", label: `ยกเลิก (${counts.cancelled})`, filter: (row: Record<string, unknown>) => row.status === "cancelled" },
  ], [counts]);

  const employeeOptions = useMemo(() => employees.map((employee) => ({
    ...buildPayrollEmployeeSelectOption(employee),
    searchText: payrollEmployeeSearchText(employee),
  })), [employees]);

  const columns: ColumnDef<ResignationRow>[] = useMemo(() => [
    { accessorKey: "employee_label", header: "พนักงาน", size: 220 },
    { accessorKey: "notice_date", header: "วันที่แจ้ง", size: 120, cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: "last_working_date", header: "วันทำงานวันสุดท้าย", size: 150, cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: "reason", header: "เหตุผล", size: 260 },
    { accessorKey: "handover_note", header: "ส่งมอบงาน", size: 260 },
    { accessorKey: "status", header: "สถานะ", size: 120, cell: ({ getValue }) => statusBadge(getValue()) },
    { accessorKey: "review_note", header: "หมายเหตุ HR", size: 220 },
    { accessorKey: "reviewed_by", header: "ผู้ตรวจ", size: 150 },
  ], []);

  const resetForm = () => {
    setForm({ employee_id: "", notice_date: todayIso(), last_working_date: "", reason: "", handover_note: "" });
  };

  const submitCreate = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await readJson(await apiFetch("/api/payroll/resignations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, actor: user?.name ?? null }),
      }));
      setSuccess("สร้างคำขอแจ้งลาออกแล้ว");
      setCreateOpen(false);
      resetForm();
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างคำขอแจ้งลาออกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const openAction = (row: ResignationRow, action: PendingAction["action"]) => {
    setDetailRow(null);
    setPendingAction({ row, action });
    setReviewNote("");
  };

  const submitAction = async () => {
    if (!pendingAction) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await readJson(await apiFetch(`/api/payroll/resignations/${pendingAction.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction.action, review_note: reviewNote, actor: user?.name ?? null }),
      }));
      setSuccess(getResignationTransitionCopy(pendingAction.action).successMessage);
      setPendingAction(null);
      setDetailRow(null);
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปเดตคำขอแจ้งลาออกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const rowActions: RowAction<ResignationRow>[] = useMemo(() => {
    if (!canEdit) return [];
    return [
      { label: "อนุมัติ", icon: "✓", onClick: (row) => openAction(row, "approve"), show: (row) => row.status === "pending" },
      { label: "ปฏิเสธ", icon: "×", variant: "danger", onClick: (row) => openAction(row, "reject"), show: (row) => row.status === "pending" },
      { label: "ยกเลิก", icon: "–", variant: "danger", onClick: (row) => openAction(row, "cancel"), show: (row) => row.status === "pending" },
    ];
  }, [canEdit]);

  const isCreateDirty = form.employee_id !== "" ||
    form.last_working_date !== "" ||
    form.reason.trim() !== "" ||
    form.handover_note.trim() !== "" ||
    form.notice_date !== todayIso();

  if (ready && !canView) return <AccessDenied message="ต้องมีสิทธิ์ดูข้อมูลพนักงานก่อนเข้าหน้าแจ้งลาออก" />;

  const actionCopy = pendingAction ? getResignationTransitionCopy(pendingAction.action) : null;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payroll</div>
            <h1 className="mt-1 text-xl font-bold text-slate-900">แจ้งลาออก</h1>
            <p className="mt-1 text-sm text-slate-500">
              เก็บเป็นคำขอแยกก่อน อนุมัติแล้วระบบจึงตั้งพนักงานเป็นลาออกและปิดสัญญาปัจจุบัน
            </p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            เพิ่มคำขอแจ้งลาออก
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["pending", "approved", "rejected", "cancelled"] as ResignationStatus[]).map((status) => (
            <div key={status} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-lg font-bold tabular-nums text-slate-900">{counts[status].toLocaleString()}</div>
              <div className="text-xs text-slate-500">{STATUS_META[status].label}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <DataTable
        data={rows}
        columns={columns}
        tableId="payroll-resignations"
        title="รายการแจ้งลาออก"
        description="ดูสถานะและดำเนินการคำขอที่รอตรวจ"
        loading={loading}
        error={error ?? undefined}
        emptyMessage="ยังไม่มีคำขอแจ้งลาออก"
        searchableKeys={["employee_label", "reason", "handover_note", "review_note"]}
        views={views}
        rowActions={rowActions}
        exportFilename="payroll-resignations"
        exportEntityType="employee_portal_request"
        canCheck={(perm) => can(perm as Permission)}
        pageSize={25}
        onRowClick={(row) => setDetailRow(row)}
        onRetry={loadRows}
      />

      <ERPModal
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title="รายละเอียดแจ้งลาออก"
        description={detailRow?.employee_label}
        size="lg"
        footer={(
          <>
            <button type="button" onClick={() => setDetailRow(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">ปิด</button>
            {detailRow?.status === "pending" && canEdit && (
              <>
                <button type="button" onClick={() => openAction(detailRow, "approve")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">อนุมัติ</button>
                <button type="button" onClick={() => openAction(detailRow, "reject")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">ปฏิเสธ</button>
                <button type="button" onClick={() => openAction(detailRow, "cancel")} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">ยกเลิกคำขอ</button>
              </>
            )}
          </>
        )}
      >
        {detailRow && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-medium text-slate-400">สถานะคำขอ</div>
                <div className="mt-1">{statusBadge(detailRow.status)}</div>
              </div>
              <div className="text-sm text-slate-500">สร้างเมื่อ {detailRow.created_at ? formatDate(detailRow.created_at) : "-"}</div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="พนักงาน" full>{detailRow.employee_label}</DetailField>
              <DetailField label="วันที่แจ้ง">{formatDate(detailRow.notice_date)}</DetailField>
              <DetailField label="วันทำงานวันสุดท้าย">{formatDate(detailRow.last_working_date)}</DetailField>
              <DetailField label="เหตุผล" full>{detailRow.reason}</DetailField>
              <DetailField label="ส่งมอบงาน" full>{detailRow.handover_note}</DetailField>
              <DetailField label="หมายเหตุ HR" full>{detailRow.review_note}</DetailField>
              <DetailField label="ผู้ตรวจ">{detailRow.reviewed_by}</DetailField>
              <DetailField label="วันที่ตรวจ">{detailRow.reviewed_at ? formatDate(detailRow.reviewed_at) : "-"}</DetailField>
            </div>
          </div>
        )}
      </ERPModal>

      <ERPModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="เพิ่มคำขอแจ้งลาออก"
        description="คำขอจะยังไม่เปลี่ยนสถานะพนักงาน จนกว่าจะกดอนุมัติ"
        size="lg"
        hasUnsavedChanges={isCreateDirty}
        footer={(
          <>
            <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => setConfirmOpen(true)} disabled={saving || !canEdit} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300">บันทึกคำขอ</button>
          </>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">พนักงาน</span>
            <SearchableSelect
              value={form.employee_id}
              onChange={(employee_id) => setForm((f) => ({ ...f, employee_id }))}
              options={employeeOptions}
              placeholder="เลือกพนักงาน"
              className="mt-1"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">วันที่แจ้ง</span>
            <input
              type="date"
              value={form.notice_date}
              onChange={(e) => setForm((f) => ({ ...f, notice_date: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">วันทำงานวันสุดท้าย</span>
            <input
              type="date"
              value={form.last_working_date}
              onChange={(e) => setForm((f) => ({ ...f, last_working_date: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">เหตุผล</span>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">หมายเหตุส่งมอบงาน</span>
            <textarea
              value={form.handover_note}
              onChange={(e) => setForm((f) => ({ ...f, handover_note: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>
      </ERPModal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => { setConfirmOpen(false); await submitCreate(); }}
        title="ยืนยันสร้างคำขอ"
        message="ระบบจะเก็บเป็นคำขอรอตรวจ ยังไม่เปลี่ยนสถานะพนักงานจนกว่าจะกดอนุมัติ"
        confirmText="สร้างคำขอ"
        loading={saving}
      />

      <ERPModal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title={actionCopy?.title ?? ""}
        description={pendingAction?.row.employee_label}
        size="md"
        closeOnBackdrop={false}
        footer={(
          <>
            <button type="button" onClick={() => setPendingAction(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button
              type="button"
              onClick={submitAction}
              disabled={saving}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300 ${actionCopy?.destructive ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
            >
              {actionCopy?.confirmText ?? "ยืนยัน"}
            </button>
          </>
        )}
      >
        {pendingAction && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <div>วันทำงานวันสุดท้าย: <span className="font-semibold text-slate-900">{formatDate(pendingAction.row.last_working_date)}</span></div>
              <div className="mt-1">เหตุผล: <span className="font-semibold text-slate-900">{pendingAction.row.reason || "-"}</span></div>
            </div>
            {actionCopy && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-semibold">{actionCopy.description}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {actionCopy.impactItems.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            <label>
              <span className="text-sm font-medium text-slate-700">หมายเหตุ HR</span>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
