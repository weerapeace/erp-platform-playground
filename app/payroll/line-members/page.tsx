"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AccessDenied, useAuth } from "@/components/auth";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";

type EmployeeSummary = {
  id: string;
  employee_code?: string | null;
  code?: string | null;
  name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  phone?: string | null;
  mobile?: string | null;
  status?: string | null;
};

type LineMemberRow = {
  id: string;
  employee_id: string;
  line_user_id: string;
  line_display_name?: string | null;
  line_picture_url?: string | null;
  status: "pending" | "linked" | "blocked" | "unlinked";
  linked_at?: string | null;
  updated_at?: string | null;
  employee?: EmployeeSummary | null;
  employee_label?: string | null;
  employees?: EmployeeSummary | EmployeeSummary[] | null;
};

type LineMembersPayload = {
  linked: LineMemberRow[];
  not_linked: EmployeeSummary[];
};

type PendingAction = {
  row: LineMemberRow;
  action: "reset" | "block" | "unblock";
};

type QuickEmployeeForm = {
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string;
  phone: string;
};

const EMPTY_QUICK_EMPLOYEE: QuickEmployeeForm = {
  employee_code: "",
  first_name: "",
  last_name: "",
  nickname: "",
  phone: "",
};

const ACTION_COPY: Record<PendingAction["action"], { title: string; confirm: string; message: string; danger?: boolean }> = {
  reset: {
    title: "ปลดการผูก LINE",
    confirm: "ปลดการผูก",
    message: "พนักงานคนนี้จะต้องสมัคร/ผูก LINE ใหม่อีกครั้ง ข้อมูล LINE เดิมในบัตรพนักงานจะถูกล้างออก",
    danger: true,
  },
  block: {
    title: "ระงับ LINE พนักงาน",
    confirm: "ระงับ",
    message: "พนักงานจะเข้า Employee Portal ผ่าน LINE ไม่ได้ จนกว่าจะปลดระงับ",
    danger: true,
  },
  unblock: {
    title: "ปลดระงับ LINE พนักงาน",
    confirm: "ปลดระงับ",
    message: "พนักงานจะกลับมาเข้า Employee Portal ผ่าน LINE ได้อีกครั้ง",
  },
};

function employeeOf(row: LineMemberRow): EmployeeSummary | null {
  if (row.employee) return row.employee;
  if (Array.isArray(row.employees)) return row.employees[0] ?? null;
  return row.employees ?? null;
}

function employeeCode(employee?: EmployeeSummary | null) {
  return employee?.employee_code || employee?.code || "-";
}

function employeeName(employee?: EmployeeSummary | null) {
  const fullName = employee?.full_name || [employee?.first_name, employee?.last_name].filter(Boolean).join(" ");
  return employee?.display_name || employee?.name || fullName || "-";
}

function phoneOf(employee?: EmployeeSummary | null) {
  return employee?.phone || employee?.mobile || "-";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusBadge(status: LineMemberRow["status"]) {
  const meta = {
    linked: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blocked: "border-red-200 bg-red-50 text-red-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    unlinked: "border-slate-200 bg-slate-100 text-slate-600",
  }[status];
  const label = {
    linked: "ผูกแล้ว",
    blocked: "ถูกระงับ",
    pending: "รอยืนยัน",
    unlinked: "ปลดแล้ว",
  }[status];
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${meta}`}>{label}</span>;
}

async function readJson<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || "ทำรายการไม่สำเร็จ");
  return json as T;
}

export default function PayrollLineMembersPage() {
  const { can, ready } = useAuth();
  const canView = can("employees.view");
  const canEdit = can("employees.edit");
  const canCreate = can("employees.create");
  const [data, setData] = useState<LineMembersPayload>({ linked: [], not_linked: [] });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LineMemberRow["status"] | "not_linked">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState<QuickEmployeeForm>(EMPTY_QUICK_EMPLOYEE);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const json = await readJson<{ data: LineMembersPayload }>(await apiFetch("/api/payroll/line-members"));
      setData(json.data ?? { linked: [], not_linked: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูล LINE พนักงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    if (ready) void loadData();
  }, [ready, loadData]);

  const stats = useMemo(() => {
    const linked = data.linked.filter((row) => row.status === "linked").length;
    const blocked = data.linked.filter((row) => row.status === "blocked").length;
    return {
      linked,
      blocked,
      notLinked: data.not_linked.length,
      total: linked + blocked + data.not_linked.length,
    };
  }, [data]);

  const filteredLinked = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.linked.filter((row) => {
      if (statusFilter !== "all" && statusFilter !== "not_linked" && row.status !== statusFilter) return false;
      if (statusFilter === "not_linked") return false;
      const emp = employeeOf(row);
      const haystack = [
        employeeCode(emp),
        employeeName(emp),
        emp?.nickname,
        phoneOf(emp),
        row.line_display_name,
        row.line_user_id,
        row.status,
      ].join(" ").toLowerCase();
      return !q || haystack.includes(q);
    });
  }, [data.linked, query, statusFilter]);

  const filteredNotLinked = useMemo(() => {
    if (statusFilter !== "all" && statusFilter !== "not_linked") return [];
    const q = query.trim().toLowerCase();
    return data.not_linked.filter((emp) => {
      const haystack = [employeeCode(emp), employeeName(emp), emp.nickname, phoneOf(emp)].join(" ").toLowerCase();
      return !q || haystack.includes(q);
    });
  }, [data.not_linked, query, statusFilter]);

  const runAction = async () => {
    if (!pendingAction) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await readJson<{ data: LineMemberRow }>(
        await apiFetch("/api/payroll/line-members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pendingAction.row.id, action: pendingAction.action }),
        }),
      );
      setSuccess("บันทึกสถานะ LINE แล้ว");
      setPendingAction(null);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกสถานะ LINE ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const createQuickEmployee = async () => {
    const employeeCode = createForm.employee_code.trim();
    const firstName = createForm.first_name.trim();
    const phone = createForm.phone.trim();
    if (!employeeCode || !firstName || !phone) {
      setError("กรุณากรอกรหัสพนักงาน ชื่อ และเบอร์โทรให้ครบก่อนบันทึก");
      return;
    }
    setCreateSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await readJson<{ data: EmployeeSummary }>(
        await apiFetch("/api/payroll/core/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_code: employeeCode,
            first_name: firstName,
            last_name: createForm.last_name.trim() || "-",
            nickname: createForm.nickname.trim(),
            phone,
            employment_status: "active",
            active: true,
          }),
        }),
      );
      setSuccess("เพิ่มพนักงานสำหรับผูก LINE แล้ว");
      setCreateForm(EMPTY_QUICK_EMPLOYEE);
      setCreateOpen(false);
      setStatusFilter("not_linked");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เพิ่มพนักงานไม่สำเร็จ");
    } finally {
      setCreateSaving(false);
    }
  };

  const closeCreateModal = () => {
    if (createSaving) return;
    setCreateOpen(false);
  };

  if (ready && !canView) return <AccessDenied message="ต้องมีสิทธิ์ดูข้อมูลพนักงานก่อนเข้าหน้า LINE พนักงาน" />;

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Employee Portal</div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">LINE พนักงาน</h1>
            <p className="mt-1 text-sm text-slate-500">
              จัดการการผูกบัญชี LINE กับพนักงาน ใช้สำหรับ Employee Portal และต่อยอดแจ้งเตือนเงินเดือน/คำขอในอนาคต
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCreateOpen(true)}
              disabled={!canCreate}
              className="inline-flex h-10 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              เพิ่มพนักงาน
            </button>
            <Link
              href="/employee-line?preview=1"
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ดูหน้าพนักงาน
            </Link>
            <button
              onClick={() => void loadData()}
              disabled={loading}
              className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              รีเฟรช
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="ผูกแล้ว" value={stats.linked} tone="emerald" />
          <StatCard label="ถูกระงับ" value={stats.blocked} tone="red" />
          <StatCard label="ยังไม่ผูก" value={stats.notLinked} tone="amber" />
          <StatCard label="รวมพนักงาน" value={stats.total} tone="slate" />
        </div>

        {(error || success) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || success}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "ทั้งหมด"],
                ["linked", "ผูกแล้ว"],
                ["blocked", "ถูกระงับ"],
                ["not_linked", "ยังไม่ผูก"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key as typeof statusFilter)}
                  className={`h-9 rounded-lg border px-3 text-sm font-semibold ${
                    statusFilter === key
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อ / ชื่อ LINE / เบอร์โทร"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 lg:max-w-md"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">พนักงาน</th>
                  <th className="px-4 py-3">LINE</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">ผูกล่าสุด</th>
                  <th className="px-4 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : (
                  <>
                    {filteredLinked.map((row) => {
                      const emp = employeeOf(row);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{employeeCode(emp)} · {employeeName(emp)}</div>
                            <div className="text-xs text-slate-400">
                              {emp?.nickname ? `ชื่อเล่น ${emp.nickname} · ` : ""}โทร {phoneOf(emp)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {row.line_picture_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={row.line_picture_url} alt="" className="h-8 w-8 rounded-full border border-slate-200 object-cover" />
                              ) : (
                                <span className="h-8 w-8 rounded-full bg-emerald-50" />
                              )}
                              <div>
                                <div className="font-medium text-slate-800">{row.line_display_name || "-"}</div>
                                <div className="max-w-[220px] truncate font-mono text-[11px] text-slate-400">{row.line_user_id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">{statusBadge(row.status)}</td>
                          <td className="px-4 py-3 text-slate-500">{formatDateTime(row.linked_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {row.status === "blocked" ? (
                                <button
                                  onClick={() => setPendingAction({ row, action: "unblock" })}
                                  disabled={!canEdit}
                                  className="h-8 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                                >
                                  ปลดระงับ
                                </button>
                              ) : (
                                <button
                                  onClick={() => setPendingAction({ row, action: "block" })}
                                  disabled={!canEdit}
                                  className="h-8 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                                >
                                  ระงับ
                                </button>
                              )}
                              <button
                                onClick={() => setPendingAction({ row, action: "reset" })}
                                disabled={!canEdit}
                                className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                              >
                                ปลดผูก
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredNotLinked.map((emp) => (
                      <tr key={emp.id} className="bg-amber-50/20 hover:bg-amber-50/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{employeeCode(emp)} · {employeeName(emp)}</div>
                          <div className="text-xs text-slate-400">{emp.nickname ? `ชื่อเล่น ${emp.nickname} · ` : ""}โทร {phoneOf(emp)}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-400">ยังไม่มีบัญชี LINE</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            ยังไม่ผูก
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">-</td>
                        <td className="px-4 py-3 text-right text-xs text-slate-400">ให้พนักงานเปิดลิงก์และสมัครเอง</td>
                      </tr>
                    ))}

                    {!filteredLinked.length && !filteredNotLinked.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-400">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ERPModal
        open={createOpen}
        onClose={closeCreateModal}
        title="เพิ่มพนักงานเพื่อผูก LINE"
        description="กรอกเฉพาะข้อมูลที่จำเป็น พนักงานจะใช้รหัสพนักงานและเบอร์โทรนี้เพื่อสมัครผูกบัญชี LINE"
        size="lg"
        hasUnsavedChanges={Object.values(createForm).some((value) => value.trim())}
        footer={
          <>
            <button
              type="button"
              onClick={closeCreateModal}
              disabled={createSaving}
              className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void createQuickEmployee()}
              disabled={createSaving || !createForm.employee_code.trim() || !createForm.first_name.trim() || !createForm.phone.trim()}
              className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {createSaving ? "กำลังบันทึก..." : "บันทึกพนักงาน"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div className="font-semibold">ข้อมูลที่จำเป็นต่อการผูกบัญชี</div>
            <div className="mt-1 text-emerald-700">
              พนักงานต้องกรอก “รหัสพนักงาน + เบอร์โทร” ใน LINE Portal ให้ตรงกับข้อมูลนี้ ระบบจึงจะผูก LINE ให้เอง
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <QuickEmployeeField
              label="รหัสพนักงาน"
              required
              value={createForm.employee_code}
              placeholder="เช่น ISG-001"
              onChange={(value) => setCreateForm((old) => ({ ...old, employee_code: value }))}
            />
            <QuickEmployeeField
              label="เบอร์โทร"
              required
              value={createForm.phone}
              placeholder="เบอร์ที่พนักงานจะใช้ยืนยัน"
              inputMode="tel"
              onChange={(value) => setCreateForm((old) => ({ ...old, phone: value }))}
            />
            <QuickEmployeeField
              label="ชื่อ"
              required
              value={createForm.first_name}
              placeholder="ชื่อจริง"
              onChange={(value) => setCreateForm((old) => ({ ...old, first_name: value }))}
            />
            <QuickEmployeeField
              label="นามสกุล"
              value={createForm.last_name}
              placeholder="ถ้าไม่ทราบ เว้นว่างได้"
              onChange={(value) => setCreateForm((old) => ({ ...old, last_name: value }))}
            />
            <QuickEmployeeField
              label="ชื่อเล่น"
              value={createForm.nickname}
              placeholder="เช่น จ่อย"
              onChange={(value) => setCreateForm((old) => ({ ...old, nickname: value }))}
            />
            <div>
              <div className="text-xs font-semibold text-slate-500">สถานะ</div>
              <div className="mt-1 flex h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                active · ใช้งาน
              </div>
            </div>
          </div>
        </div>
      </ERPModal>

      <ConfirmDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={() => void runAction()}
        title={pendingAction ? ACTION_COPY[pendingAction.action].title : ""}
        message={
          pendingAction ? (
            <span>
              {ACTION_COPY[pendingAction.action].message}
              <br />
              <span className="mt-2 block font-semibold text-slate-800">
                {employeeCode(employeeOf(pendingAction.row))} · {employeeName(employeeOf(pendingAction.row))}
              </span>
            </span>
          ) : null
        }
        confirmText={pendingAction ? ACTION_COPY[pendingAction.action].confirm : "ยืนยัน"}
        cancelText="ยกเลิก"
        variant={pendingAction && ACTION_COPY[pendingAction.action].danger ? "danger" : "default"}
        loading={saving}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "red" | "amber" | "slate" }) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-white text-slate-700",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-2xl font-bold">{value.toLocaleString("th-TH")}</div>
      <div className="mt-1 text-sm font-medium opacity-80">{label}</div>
    </div>
  );
}

function QuickEmployeeField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}
