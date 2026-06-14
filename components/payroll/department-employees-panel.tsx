"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type EmployeeRow = {
  id: string;
  employee_code?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  department_id?: string | null;
  position_name?: string | null;
  employment_status?: string | null;
};

type Props = {
  departmentId: string | null;
  departmentName?: string;
  editable?: boolean;
};

function employeeName(row: EmployeeRow) {
  const full = String(row.full_name ?? "").trim();
  if (full) return full;
  const firstLast = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return firstLast || String(row.nickname ?? "-");
}

export function DepartmentEmployeesPanel({ departmentId, departmentName, editable = false }: Props) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/payroll/core/employees?include_inactive=true");
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows((json.data ?? []) as EmployeeRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายชื่อพนักงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const currentEmployees = useMemo(
    () => rows.filter((row) => String(row.department_id ?? "") === String(departmentId ?? "")),
    [rows, departmentId],
  );

  const addableEmployees = useMemo(
    () => rows
      .filter((row) => String(row.department_id ?? "") !== String(departmentId ?? ""))
      .sort((a, b) => String(a.employee_code ?? "").localeCompare(String(b.employee_code ?? ""), "th")),
    [rows, departmentId],
  );

  const assignEmployee = async () => {
    if (!selectedId || !departmentId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/payroll/core/employees/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: departmentId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSelectedId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มพนักงานเข้าแผนกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const removeEmployee = async (employeeId: string) => {
    if (!window.confirm("เอาพนักงานคนนี้ออกจากแผนกนี้ใช่ไหม?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/payroll/core/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เอาพนักงานออกจากแผนกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (!departmentId) {
    return <div className="text-sm text-slate-400">บันทึกแผนกก่อน แล้วระบบจะแสดงพนักงานในแผนกนี้</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
          <div>
            <div className="text-sm font-semibold text-slate-800">พนักงานในแผนก</div>
            <div className="text-xs text-slate-500">
              {departmentName ? `${departmentName} · ` : ""}{currentEmployees.length} คน
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading || saving}
            className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            รีเฟรช
          </button>
        </div>

        {editable && (
          <div className="flex gap-2 border-b border-slate-100 p-3">
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              disabled={saving}
              className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="">เลือกพนักงานเพื่อเพิ่มเข้าแผนก...</option>
              {addableEmployees.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.employee_code ?? "-"} · {employeeName(row)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={assignEmployee}
              disabled={!selectedId || saving}
              className="h-9 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              เพิ่มเข้าแผนก
            </button>
          </div>
        )}

        {error && <div className="border-b border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {loading ? (
          <div className="px-3 py-6 text-center text-sm text-slate-400">กำลังโหลดรายชื่อพนักงาน...</div>
        ) : currentEmployees.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-slate-400">ยังไม่มีพนักงานในแผนกนี้</div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {currentEmployees.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">
                    {row.employee_code ?? "-"} · {employeeName(row)}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {[row.position_name, row.employment_status].filter(Boolean).join(" · ") || "-"}
                  </div>
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeEmployee(row.id)}
                    disabled={saving}
                    className="shrink-0 rounded-md border border-red-100 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    เอาออก
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">
        การเพิ่มหรือเอาออกจากแผนกจะบันทึกกลับไปที่พนักงานจริง และผ่าน API payroll core ที่มี permission กับ audit log
      </p>
    </div>
  );
}
