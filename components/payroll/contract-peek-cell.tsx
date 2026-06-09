"use client";

/**
 * ContractPeekCell — กดแล้วเปิด drawer ดูสัญญาของพนักงานในหน้าเดียวกัน (ไม่เด้งออกไปหน้าอื่น)
 * ดึงสัญญาผ่าน /api/payroll/core/contracts?filters={employee_id} (อ่านอย่างเดียว)
 */
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

type Contract = Record<string, unknown> & {
  id: string; contract_no: string; base_salary: number; daily_wage: number; hourly_wage: number;
  wage_type: string; payment_cycle: string; status: string; start_date: string | null;
  end_date: string | null; is_current: boolean; company_name?: string;
};

const WAGE: Record<string, string> = { monthly: "รายเดือน", daily: "รายวัน", hourly: "รายชั่วโมง", piece_rate: "รายชิ้น", mixed: "ผสม" };
const STATUS: Record<string, { th: string; cls: string }> = {
  active: { th: "ใช้งาน", cls: "bg-emerald-100 text-emerald-700" },
  ended: { th: "สิ้นสุด", cls: "bg-slate-100 text-slate-600" },
  cancelled: { th: "ยกเลิก", cls: "bg-red-100 text-red-700" },
};
const baht = (n: unknown) => `฿${Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

export function ContractPeekCell({ employeeId, employeeCode, employeeName, label, btnClass, variant = "drawer" }: {
  employeeId: string; employeeCode?: string; employeeName?: string;
  label?: string; btnClass?: string; variant?: "drawer" | "modal";
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || rows || err) return;
    const flt = encodeURIComponent(JSON.stringify({ employee_id: { type: "text", value: employeeId } }));
    apiFetch(`/api/payroll/core/contracts?include_inactive=true&filters=${flt}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(j.error); else setRows((j.data ?? []) as Contract[]); })
      .catch(() => setErr("โหลดสัญญาไม่ได้"));
  }, [open, rows, err, employeeId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={btnClass ?? "text-xs px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap"}>
        {label ?? "📄 สัญญา"}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className={variant === "modal"
              ? "absolute left-1/2 top-[7vh] max-h-[86vh] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col"
              : "absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl flex flex-col"}
               onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-400">สัญญาจ้าง</div>
                <div className="font-semibold text-slate-800">{employeeCode}{employeeName ? ` · ${employeeName}` : ""}</div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="ปิด">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{err}</div>}
              {!rows && !err && <div className="text-center text-slate-400 py-10 text-sm">กำลังโหลด...</div>}
              {rows && rows.length === 0 && <div className="text-center text-slate-400 py-10 text-sm">พนักงานคนนี้ยังไม่มีสัญญา</div>}
              {rows?.map((c) => {
                const st = STATUS[c.status] ?? { th: c.status, cls: "bg-slate-100 text-slate-600" };
                return (
                  <div key={c.id} className={`rounded-xl border p-4 ${c.is_current ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-semibold text-slate-800">{c.contract_no}</span>
                      <span className="flex items-center gap-1.5">
                        {c.is_current && <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-medium">ปัจจุบัน</span>}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${st.cls}`}>{st.th}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-sm">
                      <Field label="เงินเดือน" value={baht(c.base_salary)} />
                      <Field label="ประเภทค่าจ้าง" value={WAGE[c.wage_type] ?? c.wage_type} />
                      {Number(c.daily_wage) > 0 && <Field label="ค่าจ้างรายวัน" value={baht(c.daily_wage)} />}
                      {Number(c.hourly_wage) > 0 && <Field label="ค่าจ้างรายชม." value={baht(c.hourly_wage)} />}
                      <Field label="รอบจ่าย" value={c.payment_cycle} />
                      {c.company_name ? <Field label="บริษัท" value={c.company_name} /> : null}
                      <Field label="เริ่มสัญญา" value={c.start_date ?? "—"} />
                      <Field label="สิ้นสุด" value={c.end_date ?? "ปัจจุบัน"} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="text-slate-700 truncate">{value}</div>
    </div>
  );
}
