"use client";

/**
 * ContractPeekCell
 * Popup ดู/แก้ไขสัญญาจ้างจากหน้า Payroll โดยไม่พาออกจากหน้าปัจจุบัน
 * ใช้ API กลาง /api/payroll/core/contracts เพื่อให้ permission + audit ทำงานเหมือนหน้าสัญญาจ้างหลัก
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { LookupSelect } from "@/components/lookup-select";
import { ContractTemplateBar } from "@/components/payroll/contract-template-bar";

const round2 = (n: number) => Math.round(n * 100) / 100;

type Contract = Record<string, unknown> & {
  id: string;
  contract_no: string;
  contract_type?: string;
  employment_type?: string;
  base_salary: number;
  daily_wage: number;
  hourly_wage: number;
  piece_rate_default?: number;
  payroll_register_base_salary?: number;
  wage_type: string;
  payment_cycle: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  company_name?: string;
  work_time_profile_name?: string;
  work_schedule_id?: string | null;
  overtime_policy_id?: string | null;
  leave_policy_id?: string | null;
  include_pnd3_export?: boolean;
  include_payroll_register_export?: boolean;
  attendance_scan_exempt?: boolean;
};

type Draft = {
  contract_no: string;
  company_name: string;
  contract_type: string;
  employment_type: string;
  wage_type: string;
  base_salary: string;
  daily_wage: string;
  hourly_wage: string;
  piece_rate_default: string;
  payroll_register_base_salary: string;
  payment_cycle: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  status: string;
  work_schedule_id: string;
  overtime_policy_id: string;
  leave_policy_id: string;
  include_pnd3_export: boolean;
  include_payroll_register_export: boolean;
  attendance_scan_exempt: boolean;
};

const WAGE: Record<string, string> = {
  monthly: "รายเดือน",
  daily: "รายวัน",
  hourly: "รายชั่วโมง",
  piece_rate: "รายชิ้น",
  mixed: "ผสม",
};

const CONTRACT_TYPE: Record<string, string> = {
  permanent: "ประจำ",
  regular_external: "ประจำนอกระบบ",
  daily: "รายวัน",
  contractor: "งานเหมา",
  hourly: "รายชั่วโมง",
  "fixed-term": "สัญญามีกำหนดระยะเวลา",
};

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "เต็มเวลา",
  "full-time": "เต็มเวลา",
  part_time: "ไม่เต็มเวลา (พาร์ทไทม์)",
  contractor: "งานเหมา",
};

const STATUS: Record<string, { th: string; cls: string }> = {
  active: { th: "ใช้งาน", cls: "bg-emerald-100 text-emerald-700" },
  ended: { th: "สิ้นสุด", cls: "bg-slate-100 text-slate-600" },
  cancelled: { th: "ยกเลิก", cls: "bg-red-100 text-red-700" },
};

const WAGE_TYPES = ["monthly", "daily", "hourly", "piece_rate", "mixed"];
const STATUSES = ["active", "ended", "cancelled"];

const baht = (n: unknown) => `฿${Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
const text = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : "—";
};
const boolText = (v: unknown) => (v === true || v === "true" ? "เปิด" : "ปิด");
const toInput = (v: unknown) => (v == null ? "" : String(v));
const toNumber = (v: string) => Number(v || 0);
const todayBangkokISO = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const isExpiredEndDate = (date: unknown) => {
  const s = String(date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s <= todayBangkokISO();
};

function applyEndDateRuleToDraft(d: Draft): Draft {
  if (isExpiredEndDate(d.end_date) && d.status !== "cancelled") {
    return { ...d, status: "ended", is_current: false };
  }
  return d;
}

function contractToDraft(c: Contract): Draft {
  return applyEndDateRuleToDraft({
    contract_no: toInput(c.contract_no),
    company_name: toInput(c.company_name),
    contract_type: toInput(c.contract_type),
    employment_type: toInput(c.employment_type),
    wage_type: toInput(c.wage_type || "monthly"),
    base_salary: toInput(c.base_salary),
    daily_wage: toInput(c.daily_wage),
    hourly_wage: toInput(c.hourly_wage),
    piece_rate_default: toInput(c.piece_rate_default),
    payroll_register_base_salary: toInput(c.payroll_register_base_salary),
    payment_cycle: toInput(c.payment_cycle || "monthly"),
    start_date: toInput(c.start_date),
    end_date: toInput(c.end_date),
    is_current: Boolean(c.is_current),
    status: toInput(c.status || "active"),
    work_schedule_id: toInput(c.work_schedule_id),
    overtime_policy_id: toInput(c.overtime_policy_id),
    leave_policy_id: toInput(c.leave_policy_id),
    include_pnd3_export: Boolean(c.include_pnd3_export),
    include_payroll_register_export: Boolean(c.include_payroll_register_export),
    attendance_scan_exempt: Boolean(c.attendance_scan_exempt),
  });
}

function blankDraft(): Draft {
  return {
    contract_no: "",
    company_name: "",
    contract_type: "",
    employment_type: "",
    wage_type: "monthly",
    base_salary: "",
    daily_wage: "",
    hourly_wage: "",
    piece_rate_default: "",
    payroll_register_base_salary: "",
    payment_cycle: "monthly",
    start_date: todayBangkokISO(),
    end_date: "",
    is_current: true,
    status: "active",
    work_schedule_id: "",
    overtime_policy_id: "",
    leave_policy_id: "",
    include_pnd3_export: false,
    include_payroll_register_export: false,
    attendance_scan_exempt: false,
  };
}

function draftToPayload(d: Draft) {
  const normalized = applyEndDateRuleToDraft(d);
  return {
    contract_no: normalized.contract_no,
    company_name: normalized.company_name,
    contract_type: normalized.contract_type,
    employment_type: normalized.employment_type,
    wage_type: normalized.wage_type,
    base_salary: toNumber(normalized.base_salary),
    daily_wage: toNumber(normalized.daily_wage),
    hourly_wage: toNumber(normalized.hourly_wage),
    piece_rate_default: toNumber(normalized.piece_rate_default),
    payroll_register_base_salary: toNumber(normalized.payroll_register_base_salary),
    payment_cycle: normalized.payment_cycle,
    start_date: normalized.start_date,
    end_date: normalized.end_date,
    is_current: normalized.is_current,
    status: normalized.status,
    work_schedule_id: normalized.work_schedule_id,
    overtime_policy_id: normalized.overtime_policy_id,
    leave_policy_id: normalized.leave_policy_id,
    include_pnd3_export: normalized.include_pnd3_export,
    include_payroll_register_export: normalized.include_payroll_register_export,
    attendance_scan_exempt: normalized.attendance_scan_exempt,
  };
}

export function ContractPeekCell({
  employeeId,
  employeeCode,
  employeeName,
  label,
  btnClass,
  variant = "drawer",
}: {
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  label?: string;
  btnClass?: string;
  variant?: "drawer" | "modal";
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const editingContract = useMemo(
    () => rows?.find((c) => c.id === editingId) ?? null,
    [editingId, rows],
  );

  const load = async (force = false) => {
    if (!force && (rows || err)) return;
    setErr(null);
    const flt = encodeURIComponent(JSON.stringify({ employee_id: { type: "text", value: employeeId } }));
    try {
      const res = await apiFetch(`/api/payroll/core/contracts?include_inactive=true&filters=${flt}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดสัญญาไม่ได้");
      setRows((j.data ?? []) as Contract[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดสัญญาไม่ได้");
    }
  };

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setOpen(false);
    setEditingId(null);
    setCreating(false);
    setDraft(null);
    setSaveMsg(null);
  };

  const startCreate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSaveMsg(null);
    setErr(null);
    setEditingId(null);
    setCreating(true);
    setDraft(blankDraft());
  };

  const cancelCreate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCreating(false);
    setDraft(null);
  };

  const startEdit = (e: React.MouseEvent, c: Contract) => {
    e.preventDefault();
    e.stopPropagation();
    setSaveMsg(null);
    setCreating(false);
    setEditingId(c.id);
    setDraft(contractToDraft(c));
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(null);
    setDraft(null);
    setSaveMsg(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draft) return;
    if (!creating && !editingId) return;
    setSaving(true);
    setSaveMsg(null);
    setErr(null);
    try {
      const url = creating
        ? `/api/payroll/core/contracts`
        : `/api/payroll/core/contracts/${editingId}`;
      const payload = creating
        ? { ...draftToPayload(draft), employee_id: employeeId, employee_code: employeeCode }
        : draftToPayload(draft);
      const res = await apiFetch(url, {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกสัญญาไม่ได้");
      setSaveMsg(creating ? "เพิ่มสัญญาใหม่แล้ว" : "บันทึกสัญญาแล้ว");
      setEditingId(null);
      setCreating(false);
      setDraft(null);
      setRows(null);
      await load(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "บันทึกสัญญาไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={btnClass ?? "whitespace-nowrap rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"}
      >
        {label ?? "📄 สัญญา"}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100]"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="ปิดหน้าต่างสัญญาจ้าง"
            className="absolute inset-0 bg-black/30"
            onClick={close}
          />
          <div
            className={
              variant === "modal"
                ? "absolute left-1/2 top-[6vh] flex max-h-[88vh] w-[min(1100px,calc(100vw-48px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
                : "absolute bottom-0 right-0 top-0 flex w-full max-w-2xl flex-col bg-white shadow-xl"
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <div className="text-xs text-slate-400">สัญญาจ้าง</div>
                <div className="text-lg font-semibold text-slate-900">
                  {employeeCode}{employeeName ? ` · ${employeeName}` : ""}
                </div>
                <div className="mt-1 text-xs text-slate-500">ดูรายละเอียดครบ และแก้ไขสัญญาได้จากหน้าต่างนี้</div>
              </div>
              <div className="flex items-center gap-2">
                {!creating && (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="h-9 whitespace-nowrap rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    ＋ เพิ่มสัญญา
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="ปิด"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5">
              {err && <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
              {saveMsg && <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{saveMsg}</div>}
              {!rows && !err && <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>}
              {rows && rows.length === 0 && !creating && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center">
                  <div className="text-sm text-slate-400">พนักงานคนนี้ยังไม่มีสัญญา</div>
                  <button
                    type="button"
                    onClick={startCreate}
                    className="mt-3 h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    ＋ เพิ่มสัญญาให้พนักงานคนนี้
                  </button>
                </div>
              )}

              {creating && draft && (
                <section className="mb-4 rounded-xl border border-emerald-300 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 px-5 py-3">
                    <div className="text-sm font-semibold text-emerald-800">＋ สัญญาใหม่ — {employeeCode}{employeeName ? ` · ${employeeName}` : ""}</div>
                    <button
                      type="button"
                      onClick={cancelCreate}
                      className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                  <div className="px-5 pt-4">
                    <ContractTemplateBar
                      values={draft as unknown as Record<string, unknown>}
                      onApply={(vals) => setDraft((d) => {
                        if (!d) return d;
                        const boolKeys = ["is_current", "include_pnd3_export", "include_payroll_register_export", "attendance_scan_exempt"];
                        const patch: Record<string, unknown> = {};
                        for (const [k, v] of Object.entries(vals)) {
                          if (!(k in d)) continue;
                          patch[k] = boolKeys.includes(k) ? (v === true || v === "true") : (v == null ? "" : String(v));
                        }
                        return applyEndDateRuleToDraft({ ...d, ...patch } as Draft);
                      })}
                    />
                  </div>
                  <EditContractForm
                    draft={draft}
                    saving={saving}
                    creating
                    onChange={setDraft}
                    onSubmit={saveEdit}
                  />
                </section>
              )}

              <div className="space-y-4">
                {rows?.map((c) => {
                  const st = STATUS[c.status] ?? { th: text(c.status), cls: "bg-slate-100 text-slate-600" };
                  const isEditing = editingId === c.id && draft;
                  return (
                    <section
                      key={c.id}
                      className={`rounded-xl border bg-white shadow-sm ${c.is_current ? "border-emerald-200" : "border-slate-200"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                        <div>
                          <div className="font-mono text-base font-semibold text-slate-900">{c.contract_no}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {c.is_current && <Badge className="bg-emerald-100 text-emerald-700">ปัจจุบัน</Badge>}
                            <Badge className={st.cls}>{st.th}</Badge>
                            {c.contract_type && <Badge className="bg-indigo-50 text-indigo-700">{CONTRACT_TYPE[c.contract_type] ?? c.contract_type}</Badge>}
                            {c.wage_type && <Badge className="bg-blue-50 text-blue-700">{WAGE[c.wage_type] ?? c.wage_type}</Badge>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                            >
                              ยกเลิกแก้ไข
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => startEdit(e, c)}
                              className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
                            >
                              ✎ แก้ไข
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <EditContractForm
                          draft={draft}
                          saving={saving}
                          creating={false}
                          onChange={setDraft}
                          onSubmit={saveEdit}
                        />
                      ) : (
                        <ContractDetails contract={c} />
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function ContractDetails({ contract: c }: { contract: Contract }) {
  // ค่าจ้างรายวัน/รายชม.: ถ้าสัญญาเก็บเป็น 0 แต่มีเงินเดือน → คำนวณให้ดู (÷26 วัน, ÷8 ชม.)
  const baseNum = Number(c.base_salary) || 0;
  const dailyStored = Number(c.daily_wage) || 0;
  const hourlyStored = Number(c.hourly_wage) || 0;
  const dailyCalc = dailyStored > 0;
  const hourlyCalc = hourlyStored > 0;
  const dailyShown = dailyStored > 0 ? dailyStored : (baseNum > 0 ? round2(baseNum / 26) : 0);
  const hourlyShown = hourlyStored > 0 ? hourlyStored : (baseNum > 0 ? round2(baseNum / 26 / 8) : 0);
  const calcTag = <span className="ml-1 align-middle text-[10px] font-normal text-amber-600">(คำนวณ)</span>;
  return (
    <div className="space-y-5 p-5">
      <DetailSection title="ข้อมูลหลัก">
        <Detail label="เลขที่สัญญา" value={c.contract_no} />
        <Detail label="บริษัท" value={c.company_name} />
        <Detail label="ประเภทสัญญา" value={CONTRACT_TYPE[String(c.contract_type ?? "")] ?? c.contract_type} />
        <Detail label="ประเภทการจ้าง" value={EMPLOYMENT_TYPE[String(c.employment_type ?? "")] ?? c.employment_type} />
      </DetailSection>

      <DetailSection title="ค่าจ้าง">
        <Detail label="ประเภทค่าจ้าง" value={WAGE[c.wage_type] ?? c.wage_type} />
        <Detail label="เงินเดือน" value={baht(c.base_salary)} />
        <Detail label="ค่าจ้างรายวัน" value={<>{baht(dailyShown)}{!dailyCalc && dailyShown > 0 && calcTag}</>} />
        <Detail label="ค่าจ้างรายชั่วโมง" value={<>{baht(hourlyShown)}{!hourlyCalc && hourlyShown > 0 && calcTag}</>} />
        <Detail label="ค่าจ้างรายชิ้น" value={baht(c.piece_rate_default)} />
        <Detail label="ฐานทะเบียนเงินเดือน" value={baht(c.payroll_register_base_salary)} />
        <Detail label="รอบจ่าย" value={c.payment_cycle} />
      </DetailSection>

      <DetailSection title="ระยะสัญญา">
        <Detail label="เริ่มสัญญา" value={c.start_date} />
        <Detail label="สิ้นสุด" value={c.end_date ?? "ปัจจุบัน"} />
        <Detail label="สัญญาปัจจุบัน" value={c.is_current ? "ใช่" : "ไม่ใช่"} />
        <Detail label="สถานะ" value={STATUS[c.status]?.th ?? c.status} />
      </DetailSection>

      <DetailSection title="นโยบาย / ส่งออก">
        <Detail label="โปรไฟล์เวลาทำงาน" value={c.work_time_profile_name} />
        <Detail label="ตารางเวลาทำงาน" value={c.work_schedule_id} />
        <Detail label="นโยบาย OT" value={c.overtime_policy_id} />
        <Detail label="นโยบายการลา" value={c.leave_policy_id} />
        <Detail label="ยกเว้นสแกนเวลา" value={boolText(c.attendance_scan_exempt)} />
        <Detail label="รวมใน ภ.ง.ด.3" value={boolText(c.include_pnd3_export)} />
        <Detail label="รวมในทะเบียนเงินเดือน" value={boolText(c.include_payroll_register_export)} />
      </DetailSection>

      <DetailSection title="ข้อมูลระบบ">
        <Detail label="Contract ID" value={c.id} mono />
      </DetailSection>
    </div>
  );
}

function EditContractForm({
  draft,
  saving,
  creating = false,
  onChange,
  onSubmit,
}: {
  draft: Draft;
  saving: boolean;
  creating?: boolean;
  onChange: (draft: Draft) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const set = (key: keyof Draft, value: Draft[keyof Draft]) => {
    const next: Draft = { ...draft, [key]: value };
    // สร้างใหม่: กรอกเงินเดือน → เติมค่าจ้างรายวัน/รายชม. ให้อัตโนมัติ (÷26 วัน, ÷8 ชม.)
    if (creating && key === "base_salary") {
      const base = Number(value) || 0;
      next.daily_wage = base > 0 ? String(round2(base / 26)) : "";
      next.hourly_wage = base > 0 ? String(round2(base / 26 / 8)) : "";
    }
    onChange(applyEndDateRuleToDraft(next));
  };
  const baseNum = Number(draft.base_salary) || 0;
  const wageHint = (kind: "daily" | "hourly") =>
    baseNum > 0
      ? `คิดจากเงินเดือน ÷ 26 วัน${kind === "hourly" ? " ÷ 8 ชม." : ""} = ฿${round2(kind === "daily" ? baseNum / 26 : baseNum / 26 / 8).toLocaleString("th-TH")}`
      : undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-5 p-5">
      <FormSection title="ข้อมูลหลัก">
        {creating ? (
          <FieldWrap label="เลขที่สัญญา">
            <input
              type="text"
              readOnly
              placeholder="(ระบบออกเลขให้อัตโนมัติเมื่อบันทึก)"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          </FieldWrap>
        ) : (
          <TextInput label="เลขที่สัญญา" value={draft.contract_no} onChange={(v) => set("contract_no", v)} />
        )}
        <TextInput label="บริษัท" value={draft.company_name} onChange={(v) => set("company_name", v)} />
        <LookupSelect type="contract_type" label="ประเภทสัญญา" value={draft.contract_type} onChange={(v) => set("contract_type", v)} />
        <LookupSelect type="employment_type" label="ประเภทการจ้าง" value={draft.employment_type} onChange={(v) => set("employment_type", v)} />
      </FormSection>

      <FormSection title="ค่าจ้าง">
        <SelectInput label="ประเภทค่าจ้าง" value={draft.wage_type} options={WAGE_TYPES} labels={WAGE} onChange={(v) => set("wage_type", v)} />
        <TextInput label="เงินเดือน" type="number" value={draft.base_salary} onChange={(v) => set("base_salary", v)} />
        <TextInput label="ค่าจ้างรายวัน" type="number" value={draft.daily_wage} hint={wageHint("daily")} onChange={(v) => set("daily_wage", v)} />
        <TextInput label="ค่าจ้างรายชั่วโมง" type="number" value={draft.hourly_wage} hint={wageHint("hourly")} onChange={(v) => set("hourly_wage", v)} />
        <TextInput label="ค่าจ้างรายชิ้น" type="number" value={draft.piece_rate_default} onChange={(v) => set("piece_rate_default", v)} />
        <TextInput label="ฐานทะเบียนเงินเดือน" type="number" value={draft.payroll_register_base_salary} onChange={(v) => set("payroll_register_base_salary", v)} />
        <TextInput label="รอบจ่าย" value={draft.payment_cycle} onChange={(v) => set("payment_cycle", v)} />
      </FormSection>

      <FormSection title="ระยะสัญญา">
        <TextInput label="เริ่มสัญญา" type="date" value={draft.start_date} onChange={(v) => set("start_date", v)} />
        <TextInput label="สิ้นสุด" type="date" value={draft.end_date} onChange={(v) => set("end_date", v)} />
        <SelectInput label="สถานะ" value={draft.status} options={STATUSES} labels={{ active: "ใช้งาน", ended: "สิ้นสุด", cancelled: "ยกเลิก" }} onChange={(v) => set("status", v)} />
        <CheckInput label="สัญญาปัจจุบัน" checked={draft.is_current} onChange={(v) => set("is_current", v)} />
        {isExpiredEndDate(draft.end_date) && draft.status !== "cancelled" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 md:col-span-2">
            วันสิ้นสุดถึงแล้ว ระบบจะตั้งสถานะเป็น “สิ้นสุด” และเอาเครื่องหมายสัญญาปัจจุบันออกตอนบันทึก
          </div>
        )}
      </FormSection>

      <FormSection title="นโยบาย / ส่งออก">
        <TextInput label="ตารางเวลาทำงาน" value={draft.work_schedule_id} onChange={(v) => set("work_schedule_id", v)} />
        <TextInput label="นโยบาย OT" value={draft.overtime_policy_id} onChange={(v) => set("overtime_policy_id", v)} />
        <TextInput label="นโยบายการลา" value={draft.leave_policy_id} onChange={(v) => set("leave_policy_id", v)} />
        <CheckInput label="ยกเว้นสแกนเวลา" checked={draft.attendance_scan_exempt} onChange={(v) => set("attendance_scan_exempt", v)} />
        <CheckInput label="รวมใน ภ.ง.ด.3" checked={draft.include_pnd3_export} onChange={(v) => set("include_pnd3_export", v)} />
        <CheckInput label="รวมในทะเบียนเงินเดือน" checked={draft.include_payroll_register_export} onChange={(v) => set("include_payroll_register_export", v)} />
      </FormSection>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={saving}
          className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกสัญญา"}
        </button>
      </div>
    </form>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{children}</div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className={`mt-0.5 truncate text-sm text-slate-800 ${mono ? "font-mono" : ""}`}>{value == null || value === "" ? "—" : value}</div>
    </div>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date";
  hint?: string;
}) {
  return (
    <FieldWrap label={label}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
      {hint && <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span>}
    </FieldWrap>
  );
}

function SelectInput({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <FieldWrap label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        <option value="">— ไม่ระบุ —</option>
        {options.map((o) => <option key={o} value={o}>{labels[o] ?? o}</option>)}
      </select>
    </FieldWrap>
  );
}

function CheckInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600"
      />
      {label}
    </label>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}
