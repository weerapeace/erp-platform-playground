"use client";

/**
 * ของกลาง — กล่อง "ของที่ผูกกับพนักงาน 1 คน" แบบแก้ไขได้จริง
 *   🔁 รายการประจำ · ⚠️ ใบเตือน · 📄 สัญญา   (ดู / เพิ่ม / แก้ / ปิดใช้งาน)
 *
 * ใช้ซ้ำได้ทุกที่ที่มี employee_id — ตอนนี้ใช้ที่ ผังพนักงาน (drawer) และ หน้าประวัติพนักงาน
 * แทนของเดิม RecordPeekCell ที่ "ดูได้อย่างเดียว"
 *
 * โหลด: /api/payroll/employee-profile/<id>?only=records  (ยิงครั้งเดียวได้ทั้ง 3 ลิสต์)
 * เขียน: ใช้ endpoint เดิมของแต่ละเรื่อง เพื่อให้ validate + audit log เดิมทำงานครบ
 *   รายการประจำ → /api/payroll/recurring          (POST · PATCH/DELETE /<id>)
 *   ใบเตือน      → /api/payroll/master/warnings    (POST · PATCH/DELETE /<id>)
 *   สัญญา        → /api/payroll/core/contracts     (POST · PATCH/DELETE /<id>)
 *
 * หมายเหตุ: "ลบ" ของระบบนี้ = ปิดใช้งาน (soft delete) เสมอ — เก็บประวัติไว้ ไม่ลบจริง
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/modal";

type Row = Record<string, unknown>;
export type RecordKind = "recurring" | "warnings" | "contracts";
export type EmployeeRecords = { recurring: Row[]; warnings: Row[]; contracts: Row[] };

type Opt = { v: string; th: string };
type Field = {
  key: string; label: string;
  type: "text" | "number" | "date" | "select" | "textarea" | "checkbox";
  options?: Opt[]; required?: boolean; span?: 1 | 2; placeholder?: string; hint?: string;
  showIf?: (f: Row) => boolean;
};

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const baht = (v: unknown) => `฿${n(v).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const dateTH = (v: unknown) => {
  const raw = s(v); if (!raw) return "—";
  const d = new Date(raw); if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
const today = () => new Date().toISOString().slice(0, 10);

const pill = (text: string, cls: string) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{text}</span>;

// ── ตัวเลือกที่ใช้ร่วมกัน (ให้ตรงกับหน้าตารางเดิม) ──
const ITEM_TYPE: Opt[] = [{ v: "earning", th: "เงินเพิ่ม" }, { v: "deduction", th: "เงินหัก" }];
const DURATION: Opt[] = [{ v: "unlimited", th: "ไม่จำกัด (ทุกงวด)" }, { v: "until_amount", th: "จนกว่าจะครบยอด" }];
const REC_STATUS: Opt[] = [{ v: "active", th: "ใช้งาน" }, { v: "paused", th: "พักไว้" }, { v: "completed", th: "ครบแล้ว" }, { v: "cancelled", th: "ยกเลิก" }];
const SEVERITY: Opt[] = [{ v: "low", th: "เบา" }, { v: "medium", th: "ปานกลาง" }, { v: "high", th: "รุนแรง" }];
const WARN_STATUS: Opt[] = [{ v: "active", th: "มีผล" }, { v: "revoked", th: "ยกเลิกแล้ว" }];
const CONTRACT_TYPE: Opt[] = [
  { v: "permanent", th: "ประจำ" }, { v: "regular_external", th: "ประจำ (นอกระบบ)" },
  { v: "daily", th: "รายวัน" }, { v: "contractor", th: "ช่างเหมา" }, { v: "hourly", th: "รายชั่วโมง" },
];
const EMPLOYMENT_TYPE: Opt[] = [{ v: "full_time", th: "เต็มเวลา" }, { v: "part_time", th: "พาร์ทไทม์" }, { v: "contractor", th: "งานเหมา" }];
const WAGE_TYPE: Opt[] = [
  { v: "monthly", th: "รายเดือน" }, { v: "daily", th: "รายวัน" }, { v: "hourly", th: "รายชั่วโมง" },
  { v: "piece_rate", th: "รายชิ้น" }, { v: "mixed", th: "ผสม" },
];
const CONTRACT_STATUS: Opt[] = [{ v: "active", th: "ใช้งาน" }, { v: "ended", th: "สิ้นสุด" }, { v: "cancelled", th: "ยกเลิก" }];
const label = (opts: Opt[], v: unknown) => opts.find((o) => o.v === s(v))?.th ?? (s(v) || "—");

type KindCfg = {
  key: RecordKind; label: string; icon: string; addLabel: string;
  createUrl: string; itemUrl: (id: string) => string;
  fields: Field[]; defaults: Row;
  /** ช่องที่ไม่ได้โชว์ในฟอร์ม แต่ต้องส่งกลับไปด้วยตอนแก้ ไม่งั้นหลังบ้านจะรีเซ็ตเป็นค่า default */
  passthrough?: string[];
  /** แถวในลิสต์ */
  title: (r: Row) => React.ReactNode; sub: (r: Row) => React.ReactNode; right: (r: Row) => React.ReactNode;
  dim: (r: Row) => boolean;              // ยกเลิก/สิ้นสุดแล้ว → แสดงจาง ๆ
  deleteHint: string;                    // ข้อความยืนยันตอนกดถังขยะ
  /** รายละเอียดเต็มของแถว (กางอยู่ใต้หัวข้อ) — ไม่ต้องกดแก้ก็เห็น */
  detail?: (r: Row) => React.ReactNode;
  /** แถวไหนควรกางไว้ตั้งแต่แรก (เช่น สัญญาปัจจุบัน) */
  autoOpen?: (r: Row) => boolean;
};

/** บรรทัด "หัวข้อ : ค่า" ในกล่องรายละเอียด */
const KV = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2 py-0.5">
    <span className="text-[11px] text-slate-400 shrink-0">{label}</span>
    <span className="text-xs text-slate-700 text-right truncate">{value || <span className="text-slate-300">—</span>}</span>
  </div>
);

const KINDS: Record<RecordKind, KindCfg> = {
  recurring: {
    key: "recurring", label: "รายการประจำ", icon: "🔁", addLabel: "เพิ่มรายการประจำ",
    createUrl: "/api/payroll/recurring", itemUrl: (id) => `/api/payroll/recurring/${id}`,
    defaults: { item_type: "earning", duration_type: "unlimited", status: "active", start_date: today(), calculation_method: "fixed" },
    // วิธีคิด/จำนวน/อัตรา ตั้งจากหน้าตารางเงินประจำ — ที่นี่แค่ส่งค่าเดิมกลับไป (ห้ามให้ถูกรีเซ็ตเป็น "fixed")
    passthrough: ["calculation_method", "quantity_default", "rate_default"],
    fields: [
      { key: "item_name", label: "ชื่อรายการ", type: "text", required: true, span: 2, placeholder: "เช่น ค่าตำแหน่ง / หักเงินกู้" },
      { key: "item_type", label: "ประเภท", type: "select", options: ITEM_TYPE, required: true },
      { key: "amount_per_period", label: "ยอดต่องวด (บาท)", type: "number", required: true },
      { key: "duration_type", label: "ระยะเวลา", type: "select", options: DURATION },
      { key: "target_total_amount", label: "ยอดรวมที่ต้องครบ", type: "number", showIf: (f) => s(f.duration_type) === "until_amount", hint: "ระบบจะหยุดให้เองเมื่อครบยอดนี้" },
      { key: "start_date", label: "เริ่มงวดวันที่", type: "date", required: true },
      { key: "end_date", label: "สิ้นสุด (ถ้ามี)", type: "date" },
      { key: "status", label: "สถานะ", type: "select", options: REC_STATUS },
    ],
    title: (r) => s(r.item_name) || "—",
    sub: (r) => (
      <span className={s(r.item_type) === "deduction" ? "text-rose-600" : "text-emerald-600"}>
        {label(ITEM_TYPE, r.item_type)} · {label(DURATION, r.duration_type)}
        {s(r.duration_type) === "until_amount" && ` · จ่ายแล้ว ${baht(r.paid_or_deducted_amount)} / ${baht(r.target_total_amount)}`}
      </span>
    ),
    right: (r) => <b className="tabular-nums text-slate-800">{baht(r.amount_per_period)}</b>,
    dim: (r) => ["cancelled", "completed"].includes(s(r.status)),
    deleteHint: "ปิดใช้งานรายการประจำนี้? (เก็บประวัติไว้ ไม่ได้ลบทิ้ง)",
  },
  warnings: {
    key: "warnings", label: "ใบเตือน", icon: "⚠️", addLabel: "ออกใบเตือน",
    createUrl: "/api/payroll/master/warnings", itemUrl: (id) => `/api/payroll/master/warnings/${id}`,
    defaults: { severity: "medium", status: "active", warning_date: today() },
    fields: [
      { key: "warning_date", label: "วันที่เตือน", type: "date", required: true },
      { key: "severity", label: "ระดับ", type: "select", options: SEVERITY },
      { key: "title", label: "เรื่อง", type: "text", required: true, span: 2, placeholder: "เช่น มาสายเกิน 3 ครั้ง/เดือน" },
      { key: "detail", label: "รายละเอียด", type: "textarea", span: 2 },
      { key: "status", label: "สถานะ", type: "select", options: WARN_STATUS },
    ],
    title: (r) => s(r.title) || "—",
    sub: (r) => <span className="text-slate-500">{dateTH(r.warning_date)}{s(r.detail) ? ` · ${s(r.detail).slice(0, 60)}` : ""}</span>,
    right: (r) => {
      const sev = s(r.severity);
      const cls = sev === "high" ? "bg-red-100 text-red-700" : sev === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
      return pill(label(SEVERITY, sev), cls);
    },
    dim: (r) => s(r.status) === "revoked",
    deleteHint: "ยกเลิกใบเตือนนี้? (สถานะจะเปลี่ยนเป็น “ยกเลิกแล้ว” ไม่ได้ลบทิ้ง)",
    autoOpen: (r) => s(r.status) === "active" && s(r.detail).trim() !== "",
    detail: (r) => (
      <div className="mt-2 pt-2 border-t border-slate-100">
        <KV label="วันที่เตือน" value={dateTH(r.warning_date)} />
        <KV label="สถานะ" value={label(WARN_STATUS, r.status)} />
        {s(r.detail).trim() && (
          <div className="mt-1">
            <div className="text-[11px] text-slate-400">รายละเอียด</div>
            <div className="text-xs text-slate-700 whitespace-pre-wrap">{s(r.detail)}</div>
          </div>
        )}
      </div>
    ),
  },
  contracts: {
    key: "contracts", label: "สัญญา", icon: "📄", addLabel: "เพิ่มสัญญา",
    createUrl: "/api/payroll/core/contracts", itemUrl: (id) => `/api/payroll/core/contracts/${id}`,
    defaults: { contract_type: "permanent", employment_type: "full_time", wage_type: "monthly", status: "active", is_current: true, start_date: today() },
    fields: [
      { key: "contract_no", label: "เลขที่สัญญา", type: "text", placeholder: "เว้นว่าง = ออกเลขให้อัตโนมัติ" },
      { key: "contract_type", label: "ประเภทสัญญา", type: "select", options: CONTRACT_TYPE, required: true },
      { key: "employment_type", label: "รูปแบบจ้าง", type: "select", options: EMPLOYMENT_TYPE },
      { key: "wage_type", label: "วิธีคิดค่าจ้าง", type: "select", options: WAGE_TYPE },
      { key: "base_salary", label: "เงินเดือน (บาท)", type: "number", showIf: (f) => ["monthly", "mixed"].includes(s(f.wage_type)) },
      { key: "daily_wage", label: "ค่าแรง/วัน", type: "number", showIf: (f) => ["daily", "mixed"].includes(s(f.wage_type)) },
      { key: "hourly_wage", label: "ค่าแรง/ชม.", type: "number", showIf: (f) => ["hourly", "mixed"].includes(s(f.wage_type)) },
      { key: "payroll_register_base_salary", label: "ฐานทะเบียนค่าจ้าง", type: "number", hint: "ยอดที่ใช้ในรายงานทะเบียนค่าจ้าง" },
      { key: "start_date", label: "เริ่มสัญญา", type: "date", required: true },
      { key: "end_date", label: "สิ้นสุด (ถ้ามี)", type: "date" },
      { key: "is_current", label: "เป็นสัญญาปัจจุบัน", type: "checkbox", hint: "ติ๊กไว้ = ใช้ใบนี้คิดเงินเดือน" },
      { key: "status", label: "สถานะ", type: "select", options: CONTRACT_STATUS },
    ],
    title: (r) => s(r.contract_no) || "(ยังไม่มีเลขที่)",
    sub: (r) => <span className="text-slate-500">{label(CONTRACT_TYPE, r.contract_type)} · {dateTH(r.start_date)} → {s(r.end_date) ? dateTH(r.end_date) : "ไม่กำหนด"}</span>,
    right: (r) => (
      <span className="flex items-center gap-1.5">
        {r.is_current === true && pill("ปัจจุบัน", "bg-emerald-100 text-emerald-700")}
        <b className="tabular-nums text-slate-800">{baht(n(r.base_salary) || n(r.payroll_register_base_salary))}</b>
      </span>
    ),
    dim: (r) => ["ended", "cancelled"].includes(s(r.status)),
    deleteHint: "ปิดสัญญาใบนี้? (เปลี่ยนสถานะเป็นสิ้นสุด ไม่ได้ลบทิ้ง)",
    autoOpen: (r) => r.is_current === true,        // สัญญาปัจจุบัน = กางรายละเอียดให้เลย
    detail: (r) => (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 mt-2 pt-2 border-t border-slate-100">
        <KV label="ประเภทสัญญา" value={label(CONTRACT_TYPE, r.contract_type)} />
        <KV label="รูปแบบจ้าง" value={label(EMPLOYMENT_TYPE, r.employment_type)} />
        <KV label="วิธีคิดค่าจ้าง" value={label(WAGE_TYPE, r.wage_type)} />
        <KV label="รอบจ่าย" value={s(r.payment_cycle) === "monthly" ? "รายเดือน" : s(r.payment_cycle)} />
        <KV label="เงินเดือน" value={n(r.base_salary) > 0 ? baht(r.base_salary) : ""} />
        <KV label="ค่าแรง/วัน" value={n(r.daily_wage) > 0 ? baht(r.daily_wage) : ""} />
        <KV label="ค่าแรง/ชั่วโมง" value={n(r.hourly_wage) > 0 ? baht(r.hourly_wage) : ""} />
        <KV label="ค่าแรงรายชิ้น" value={n(r.piece_rate_default) > 0 ? baht(r.piece_rate_default) : ""} />
        <KV label="ฐานทะเบียนค่าจ้าง" value={n(r.payroll_register_base_salary) > 0 ? baht(r.payroll_register_base_salary) : ""} />
        <KV label="สถานะ" value={label(CONTRACT_STATUS, r.status)} />
        <KV label="เริ่มสัญญา" value={dateTH(r.start_date)} />
        <KV label="สิ้นสุด" value={s(r.end_date) ? dateTH(r.end_date) : "ไม่กำหนด"} />
      </div>
    ),
  },
};

const BTN = "inline-flex items-center justify-center gap-1 rounded-lg border text-xs font-medium transition disabled:opacity-50";

export function EmployeeRecordsPanel({
  employeeId, employeeName, kinds = ["recurring", "warnings", "contracts"], initialRecords, defaultKind, onChanged, compact,
}: {
  employeeId: string;
  employeeName?: string;
  kinds?: RecordKind[];
  initialRecords?: EmployeeRecords;              // ถ้าหน้าโหลดมาแล้ว ส่งมาได้เลย ไม่ต้องยิงซ้ำ
  defaultKind?: RecordKind;
  onChanged?: () => void;                        // แจ้งหน้าหลักให้รีเฟรชตัวเลข (เช่น badge บนการ์ด)
  compact?: boolean;
}) {
  const [recs, setRecs] = useState<EmployeeRecords | null>(initialRecords ?? null);
  const [tab, setTab] = useState<RecordKind>(defaultKind ?? kinds[0]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; form: Row } | null>(null);   // id=null → เพิ่มใหม่
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);                          // แถวที่รอยืนยันปิดใช้งาน
  const [toggled, setToggled] = useState<Set<string>>(new Set());                          // แถวที่ผู้ใช้กดสลับ กาง/ย่อ เอง

  const load = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/payroll/employee-profile/${employeeId}?only=records`).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      setRecs(j.records as EmployeeRecords);
    } catch { setErr("โหลดข้อมูลไม่ได้"); }
  }, [employeeId]);

  useEffect(() => { if (!recs) void load(); }, [recs, load]);

  // หน้าโปรไฟล์สลับแท็บด้านบน = ส่ง kinds ใหม่เข้ามา (React ใช้ component ตัวเดิม)
  // ถ้าไม่ sync ตรงนี้ เนื้อหาจะค้างอยู่แท็บแรกที่เปิด — เหมือนกดแล้วไม่เปลี่ยน
  const kindsKey = kinds.join(",");
  useEffect(() => {
    setTab((cur) => (kinds.includes(cur) ? cur : (defaultKind && kinds.includes(defaultKind) ? defaultKind : kinds[0])));
    setEditing(null); setConfirmRow(null); setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey, defaultKind]);

  const cfg = KINDS[tab];
  const rows = useMemo(() => (recs ? (recs[tab] ?? []) : []), [recs, tab]);
  const activeCount = (k: RecordKind) => {
    const list = recs?.[k] ?? [];
    if (k === "warnings") return list.filter((r) => s(r.status) === "active").length;
    if (k === "recurring") return list.filter((r) => s(r.status) === "active").length;
    return list.length;
  };

  const startAdd = () => { setErr(null); setEditing({ id: null, form: { ...cfg.defaults } }); };
  const startEdit = (r: Row) => {
    setErr(null);
    const form: Row = {};
    for (const f of cfg.fields) form[f.key] = r[f.key] ?? "";
    for (const k of cfg.passthrough ?? []) if (r[k] != null && r[k] !== "") form[k] = r[k];
    setEditing({ id: s(r.id), form });
  };

  const save = async () => {
    if (!editing) return;
    const missing = cfg.fields.find((f) => f.required && (f.showIf ? f.showIf(editing.form) : true) && !s(editing.form[f.key]).trim());
    if (missing) { setErr(`กรอก “${missing.label}” ก่อนนะครับ`); return; }
    setBusy(true); setErr(null);
    try {
      const body: Row = { ...editing.form };
      // ช่องที่ซ่อนอยู่ ไม่ต้องส่ง (กันค่าค้างจากตอนสลับตัวเลือก)
      for (const f of cfg.fields) if (f.showIf && !f.showIf(editing.form)) delete body[f.key];
      if (!editing.id) body.employee_id = employeeId;
      const url = editing.id ? cfg.itemUrl(editing.id) : cfg.createUrl;
      const j = await apiFetch(url, {
        method: editing.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); return; }
      setEditing(null);
      await load();
      onChanged?.();
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const remove = async (r: Row) => {
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch(cfg.itemUrl(s(r.id)), { method: "DELETE" }).then((res) => res.json());
      if (j.error) { setErr(j.error); return; }
      setConfirmRow(null);
      await load();
      onChanged?.();
    } catch { setErr("ปิดใช้งานไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* แท็บ */}
      {kinds.length > 1 && (
        <div className="flex gap-1 flex-wrap px-1 pb-2">
          {kinds.map((k) => {
            const on = k === tab;
            return (
              <button key={k} onClick={() => { setTab(k); setEditing(null); setErr(null); }}
                className={`px-3 h-8 rounded-full text-xs font-medium border transition ${on ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                {KINDS[k].icon} {KINDS[k].label}
                {recs && <span className={`ml-1 ${on ? "text-white/70" : "text-slate-400"}`}>{activeCount(k)}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-xs text-slate-500">
          {employeeName ? `${employeeName} · ` : ""}{rows.length} รายการ
        </span>
        <button onClick={startAdd} disabled={busy || editing !== null}
          className={`${BTN} h-8 px-3 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
          ➕ {cfg.addLabel}
        </button>
      </div>

      {err && <div className="mx-1 mb-2 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">{err}</div>}

      {/* ฟอร์มเพิ่ม/แก้ */}
      {editing && (
        <div className="mx-1 mb-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
          <div className="text-xs font-medium text-slate-600 mb-2">{editing.id ? `✏️ แก้ ${cfg.label}` : `➕ ${cfg.addLabel}`}</div>
          <div className="grid grid-cols-2 gap-2">
            {cfg.fields.filter((f) => !f.showIf || f.showIf(editing.form)).map((f) => (
              <div key={f.key} className={f.span === 2 ? "col-span-2" : ""}>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </label>
                <FieldInput f={f} value={editing.form[f.key]}
                  onChange={(v) => setEditing((e) => (e ? { ...e, form: { ...e.form, [f.key]: v } } : e))} />
                {f.hint && <div className="text-[10px] text-slate-400 mt-0.5">{f.hint}</div>}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => { setEditing(null); setErr(null); }} disabled={busy} className={`${BTN} h-8 px-3 border-slate-300 bg-white text-slate-600 hover:bg-slate-50`}>ยกเลิก</button>
            <button onClick={() => void save()} disabled={busy} className={`${BTN} h-8 px-4 border-transparent bg-emerald-600 text-white hover:bg-emerald-700`}>{busy ? "กำลังบันทึก…" : "💾 บันทึก"}</button>
          </div>
        </div>
      )}

      {/* ลิสต์ */}
      <div className={`flex-1 min-h-0 overflow-y-auto px-1 space-y-1.5 ${compact ? "" : "pb-2"}`}>
        {!recs && <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</div>}
        {recs && rows.length === 0 && !editing && (
          <div className="py-8 text-center text-sm text-slate-400">ยังไม่มี{cfg.label} — กด “{cfg.addLabel}” ได้เลย</div>
        )}
        {rows.map((r) => {
          const id = s(r.id);
          // กางรายละเอียดเอง = สลับจากค่าเริ่มต้น (สัญญาปัจจุบัน/ใบเตือนที่มีผล กางไว้ให้ตั้งแต่แรก)
          const open = cfg.detail ? (cfg.autoOpen?.(r) ?? false) !== toggled.has(id) : false;
          return (
          <div key={id} className={`rounded-xl border bg-white px-3 py-2 ${open ? "border-slate-300" : "border-slate-200"} ${cfg.dim(r) ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{cfg.title(r)}</div>
                <div className="text-[11px] mt-0.5 truncate">{cfg.sub(r)}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {cfg.detail && (
                  <button onClick={() => setToggled((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                    title={open ? "ย่อรายละเอียด" : "ดูรายละเอียด"}
                    className={`${BTN} h-7 w-7 border-slate-200 bg-white text-slate-500 hover:bg-slate-50`}>{open ? "▴" : "▾"}</button>
                )}
                {cfg.right(r)}
                <button onClick={() => startEdit(r)} disabled={busy} title="แก้ไข"
                  className={`${BTN} h-7 w-7 border-slate-200 bg-white text-slate-500 hover:bg-slate-50`}>✏️</button>
                <button onClick={() => setConfirmRow(r)} disabled={busy} title="ปิดใช้งาน (ไม่ลบจริง)"
                  className={`${BTN} h-7 w-7 border-slate-200 bg-white text-red-500 hover:bg-red-50`}>🗑</button>
              </div>
            </div>
            {open && cfg.detail?.(r)}
          </div>
          );
        })}
      </div>

      {/* ยืนยันก่อนปิดใช้งาน — ใช้ ConfirmDialog ของกลาง (ไม่ใช้ window.confirm ของเบราว์เซอร์) */}
      <ConfirmDialog
        open={confirmRow !== null}
        onClose={() => setConfirmRow(null)}
        onConfirm={() => { if (confirmRow) void remove(confirmRow); }}
        title={`ปิดใช้งาน${cfg.label}`}
        message={cfg.deleteHint}
        confirmText="ปิดใช้งาน"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const base = "w-full h-9 px-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200";
  if (f.type === "select") {
    return (
      <select value={s(value)} onChange={(e) => onChange(e.target.value)} className={base}>
        {(f.options ?? []).map((o) => <option key={o.v} value={o.v}>{o.th}</option>)}
      </select>
    );
  }
  if (f.type === "textarea") {
    return <textarea value={s(value)} onChange={(e) => onChange(e.target.value)} rows={2}
      className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" />;
  }
  if (f.type === "checkbox") {
    return (
      <label className="inline-flex items-center gap-2 h-9 text-sm text-slate-700">
        <input type="checkbox" checked={value === true || value === "true"} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
        ใช่
      </label>
    );
  }
  return (
    <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
      value={s(value)} placeholder={f.placeholder}
      onChange={(e) => onChange(e.target.value)} className={base} />
  );
}
