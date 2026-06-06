"use client";

/**
 * Payroll module — ข้อมูลคำนวณ (Manual Inputs) Phase A
 * เลือกงวด → ตารางพนักงาน + ยอดสรุป (สาย/ขาด/ลา/OT/เพิ่มพิเศษ/หักอื่น) + สุทธิประมาณ (เครื่องจริง)
 * แก้ "เพิ่มพิเศษ/หักอื่น" ต่อคนผ่าน drawer → บันทึก → สุทธิประมาณอัปเดต → ไปคำนวณ+บันทึก
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Drawer, ERPModal } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { formatDate } from "@/lib/date";

type Period = { id: string; period_name: string; status: string };
type Row = {
  id: string; employee_id: string; employee_code: string; employee_name: string; work_days: number;
  late_baht: number; absence_baht: number; leave_baht: number; ot_baht: number;
  piecework_baht: number; special_add: number; other_deduct: number; net_estimate: number; has_manual: boolean;
};
type Adj = { id: string; employee_id: string; adjustment_type: string; item_name: string; amount: number; source_type?: string | null; item_code?: string | null };
type RecurringItem = { id: string; employee_id: string; item_name: string; item_type: string; applied_amount: number; amount_per_period?: number; duration_type?: string | null; start_date?: string | null; end_date?: string | null };
type TimeKind = "ot" | "late" | "absence" | "leave";
type AdjustMode = "earning" | "deduction" | "piecework";
type DrawerTab = TimeKind;
type DurationPreset = "full" | "half" | "custom";
type LateUnit = "minutes" | "hours";
type LeaveReason = "medical_certificate" | "sick_paid" | "sick_unpaid" | "unpaid";
type TimeItem = { id: string; kind: TimeKind; value: number; amount: number; work_date?: string; note?: string };
type TabKey = "summary" | "special" | "piecework" | "timestamp" | "import" | "attendance";
type TimePreview = {
  kind: TimeKind;
  value: number;
  work_date: string;
  amount: number;
  sign: "+" | "-";
  rate: number;
  divisor: number;
  hours_per_day: number;
  base_salary: number;
  quantity_label: string;
  formula: string;
  hours?: number;
};
type GridDay = { iso: string; day: number; dow: number; is_holiday: boolean };
type GridCell = {
  date: string; status: string; label: string; sublabel?: string; editable: boolean; allow_ot: boolean;
  has_input: boolean; late_minutes: number; absence_hours: number; leave_days: number; ot_hours: number;
  amount: number; note?: string;
};
type GridRow = {
  employee_id: string; employee_code: string; employee_name: string; net_estimate: number; manual_days: number; cells: GridCell[];
};
type GridData = { days: GridDay[]; rows: GridRow[]; period?: { default_hours_per_day?: number } };
const TIME_META: Record<TimeKind, { label: string; unit: string; sign: "+" | "-"; cls: string }> = {
  ot:      { label: "OT",            unit: "ชม.",  sign: "+", cls: "text-emerald-600" },
  late:    { label: "มาสาย",         unit: "นาที", sign: "-", cls: "text-red-600" },
  absence: { label: "ขาดงาน",        unit: "วัน",  sign: "-", cls: "text-red-600" },
  leave:   { label: "ลาไม่รับเงิน",  unit: "วัน",  sign: "-", cls: "text-red-600" },
};

const baht = (v: number) => v ? `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "—";
const dash = (v: number, cls = "") => v ? <span className={`tabular-nums ${cls}`}>{baht(v)}</span> : <span className="text-slate-300">-</span>;
const EDITABLE = (s: string) => s === "draft" || s === "review";
const pickDefaultPeriod = (periods: Period[]) => periods.find((p) => EDITABLE(p.status)) ?? periods.find((p) => p.status !== "cancelled") ?? periods[0];
const isPieceworkItem = (item: Adj) => item.source_type === "piecework" || item.item_code === "PIECEWORK";
const todayIso = () => new Date().toISOString().slice(0, 10);
const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TABS: { key: TabKey; label: string }[] = [
  { key: "summary", label: "ทั้งหมด" },
  { key: "special", label: "เพิ่ม/หักพิเศษ" },
  { key: "piecework", label: "งานเหมา" },
  { key: "timestamp", label: "Timestamp" },
  { key: "import", label: "Import" },
  { key: "attendance", label: "ตารางเข้างาน" },
];
const DRAWER_TABS: { key: DrawerTab; label: string }[] = [
  { key: "late", label: "สาย" },
  { key: "absence", label: "ขาด" },
  { key: "leave", label: "ลา" },
  { key: "ot", label: "OT" },
];
const STANDARD_HOURS_PER_DAY = 8;
const LEAVE_REASON_LABEL: Record<LeaveReason, string> = {
  medical_certificate: "ลาแบบมีใบรับรองแพทย์",
  sick_paid: "ลาป่วยรับเงิน",
  sick_unpaid: "ลาป่วยไม่รับเงิน",
  unpaid: "ลาไม่รับเงิน",
};

export default function ManualInputPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [periodStatus, setPeriodStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Adj[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyManual, setOnlyManual] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editDate, setEditDate] = useState<string | undefined>();
  const [editKind, setEditKind] = useState<TimeKind | undefined>();
  const [editAdjustMode, setEditAdjustMode] = useState<AdjustMode | undefined>();
  const [quickAdjust, setQuickAdjust] = useState<{ row?: Row; mode: AdjustMode } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [grid, setGrid] = useState<GridData | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridErr, setGridErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/payroll/master/periods?include_inactive=true").then((r) => r.json())
      .then((j) => {
        const ps = (j.data ?? []) as Period[];
        setPeriods(ps);
        const initial = pickDefaultPeriod(ps);
        if (initial) setPeriodId(initial.id);
      }).catch(() => {});
  }, []);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/manual-input?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (j.error) { setErr(j.error); setRows([]); }
      else {
        setRows(j.data as Row[]);
        setRecurringItems((j.recurring_items ?? []) as RecurringItem[]);
        setPeriodStatus(j.period_status ?? "");
      }
    } catch { setErr("โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);

  const loadAdjustments = useCallback(async (pid: string) => {
    if (!pid) return;
    try {
      const j = await apiFetch(`/api/payroll/adjustments?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (!j.error) setAdjustments((j.data ?? []) as Adj[]);
    } catch { /* keep summary usable even if the list cannot load */ }
  }, []);

  const loadGrid = useCallback(async (pid: string) => {
    if (!pid) return;
    setGridLoading(true); setGridErr(null);
    try {
      const j = await apiFetch(`/api/payroll/attendance-grid?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (j.error) { setGridErr(j.error); setGrid(null); }
      else setGrid(j as GridData);
    } catch { setGridErr("โหลดตารางเข้างานไม่ได้"); }
    finally { setGridLoading(false); }
  }, []);

  useEffect(() => { if (periodId) { load(periodId); loadAdjustments(periodId); } }, [periodId, load, loadAdjustments]);
  useEffect(() => { if (periodId && activeTab === "attendance") loadGrid(periodId); }, [periodId, activeTab, loadGrid]);

  const editable = EDITABLE(periodStatus);
  const shown = rows
    .filter((r) => !onlyManual || r.has_manual)
    .filter((r) => !q.trim() || `${r.employee_code} ${r.employee_name}`.toLowerCase().includes(q.trim().toLowerCase()));

  const totalNet = rows.reduce((t, r) => t + r.net_estimate, 0);
  const adjustmentsByEmployee = useMemo(() => {
    const m = new Map<string, Adj[]>();
    for (const item of adjustments) {
      const cur = m.get(item.employee_id) ?? [];
      cur.push(item);
      m.set(item.employee_id, cur);
    }
    return m;
  }, [adjustments]);
  const recurringByEmployee = useMemo(() => {
    const m = new Map<string, RecurringItem[]>();
    for (const item of recurringItems) {
      const cur = m.get(item.employee_id) ?? [];
      cur.push(item);
      m.set(item.employee_id, cur);
    }
    return m;
  }, [recurringItems]);
  const openRowEditor = (row: Row, date?: string, kind?: TimeKind, adjustMode?: AdjustMode) => {
    setEditRow(row);
    setEditDate(date);
    setEditKind(kind);
    setEditAdjustMode(adjustMode);
  };
  const openQuickAdjust = (row: Row | undefined, mode: AdjustMode) => setQuickAdjust({ row, mode });
  const openGridEditor = (gridRow: GridRow, cell: GridCell) => {
    const row = rows.find((r) => r.employee_id === gridRow.employee_id) ?? {
      id: gridRow.employee_id,
      employee_id: gridRow.employee_id,
      employee_code: gridRow.employee_code,
      employee_name: gridRow.employee_name,
      work_days: 0,
      late_baht: 0,
      absence_baht: 0,
      leave_baht: 0,
      ot_baht: 0,
      piecework_baht: 0,
      special_add: 0,
      other_deduct: 0,
      net_estimate: gridRow.net_estimate,
      has_manual: gridRow.manual_days > 0,
    };
    const kind: TimeKind = ["off", "ot", "paid_holiday"].includes(cell.status) ? "ot" : "late";
    openRowEditor(row, cell.date, kind);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-xl font-bold text-slate-800">✏️ ข้อมูลคำนวณ</h1>
      <p className="text-sm text-slate-500 mb-4">เลือกงวด → ใส่เฉพาะรายการที่ผิดจากปกติ (เพิ่มพิเศษ/หักอื่น) แล้วไปกดคำนวณ — สุทธิประมาณคิดด้วยเครื่องคำนวณตัวจริง</p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">งวด</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}
            className="h-10 px-3 border border-slate-300 rounded-lg text-sm min-w-[240px]">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.period_name} ({p.status})</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs text-slate-500 mb-1">ค้นหา</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="รหัส / ชื่อ"
            className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm" />
        </div>
        <label className="h-10 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyManual} onChange={(e) => setOnlyManual(e.target.checked)} /> เฉพาะที่มีรายการ
        </label>
        <Link href="/payroll/calc-run" className="h-10 px-5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 inline-flex items-center">▶ ไปคำนวณ + บันทึก</Link>
      </div>

      <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`h-10 px-4 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!editable && periodStatus && (
        <div className="rounded-lg bg-amber-50 text-amber-700 px-4 py-2 text-sm mb-3">งวดนี้สถานะ “{periodStatus}” — ดูได้อย่างเดียว (แก้ได้เฉพาะงวด ร่าง/รอตรวจ)</div>
      )}
      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-3">{err}</div>}

      <div className="flex flex-wrap gap-3 mb-3 text-sm">
        <span className="text-slate-500">พนักงาน <b className="text-slate-700">{rows.length}</b> คน</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">รวมสุทธิประมาณ <b className="text-emerald-700">{baht(Math.round(totalNet * 100) / 100)}</b></span>
      </div>

      {activeTab === "attendance" ? (
        <AttendanceGrid
          grid={grid}
          loading={gridLoading}
          error={gridErr}
          query={q}
          onlyManual={onlyManual}
          editable={editable}
          onCellClick={openGridEditor}
        />
      ) : activeTab === "piecework" ? (
        <AdjustmentList
          title="รายการงานเหมา"
          modes={["piecework"]}
          rows={rows}
          items={adjustments}
          editable={editable}
          onAdd={(mode) => openQuickAdjust(undefined, mode)}
          onOpen={(row, mode) => openQuickAdjust(row, mode)}
        />
      ) : activeTab === "special" ? (
        <AdjustmentList
          title="รายการเพิ่ม/หักพิเศษ"
          modes={["earning", "deduction"]}
          rows={rows}
          items={adjustments}
          editable={editable}
          onAdd={(mode) => openQuickAdjust(undefined, mode)}
          onOpen={(row, mode) => openQuickAdjust(row, mode)}
        />
      ) : activeTab !== "summary" ? (
        <TabPlaceholder
          title={TABS.find((tab) => tab.key === activeTab)?.label ?? ""}
          description="วางโครง tab ไว้ก่อน เพื่อแยกข้อมูลตามชนิดให้เหมือนหน้าตัวอย่าง ขั้นถัดไปค่อยย้ายรายการเฉพาะหมวดนี้เข้ามา"
        />
      ) : loading ? (
        <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลด...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2">พนักงาน</th>
                <th className="text-right px-3 py-2">วันทำงาน</th>
                <th className="text-right px-3 py-2">สาย/ออกก่อน</th>
                <th className="text-right px-3 py-2">ขาด</th>
                <th className="text-right px-3 py-2">ลา</th>
                <th className="text-right px-3 py-2">OT</th>
                <th className="text-right px-3 py-2">รายการประจำ</th>
                <th className="text-right px-3 py-2">งานเหมา</th>
                <th className="text-right px-3 py-2">เพิ่มพิเศษ</th>
                <th className="text-right px-3 py-2">หักอื่น</th>
                <th className="text-right px-3 py-2">สุทธิประมาณ</th>
                <th className="text-center px-3 py-2">แก้</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const employeeAdjustments = adjustmentsByEmployee.get(r.employee_id) ?? [];
                const employeeRecurring = recurringByEmployee.get(r.employee_id) ?? [];
                const pieceworkItems = employeeAdjustments.filter((item) => matchesMode(item, "piecework"));
                const earningItems = employeeAdjustments.filter((item) => matchesMode(item, "earning"));
                const deductionItems = employeeAdjustments.filter((item) => matchesMode(item, "deduction"));
                return (
                  <tr key={r.id} className={`border-t border-slate-100 hover:bg-slate-50 ${r.has_manual ? "bg-amber-50/30" : ""}`}>
                    <td className="px-3 py-2"><span className="font-mono text-xs text-slate-400">{r.employee_code}</span> {r.employee_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.work_days || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <AmountWithTooltip value={r.late_baht} className="text-red-600" prefix="-" title="สาย/ออกก่อน: คิดจากนาทีที่บันทึกไว้" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AmountWithTooltip value={r.absence_baht} className="text-red-600" prefix="-" title="ขาดงาน: คิดจากวัน/ชั่วโมงที่บันทึกไว้" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AmountWithTooltip value={r.leave_baht} className="text-red-600" prefix="-" title="ลา: คิดจากรายการลาที่ไม่รับเงิน/รายการที่ตั้งไว้" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AmountWithTooltip value={r.ot_baht} className="text-emerald-600" prefix="+" title="OT: คิดจากชั่วโมง OT ที่บันทึกไว้" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RecurringCell items={employeeRecurring} editable={editable} onClick={() => { window.location.href = "/payroll/recurring"; }} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AdjustmentCell value={r.piecework_baht} mode="piecework" editable={editable} onClick={() => openQuickAdjust(r, "piecework")} tooltip={adjustmentTooltip("งานเหมา", pieceworkItems, "+")} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AdjustmentCell value={r.special_add} mode="earning" editable={editable} onClick={() => openQuickAdjust(r, "earning")} tooltip={adjustmentTooltip("เพิ่มพิเศษ", earningItems, "+")} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <AdjustmentCell value={r.other_deduct} mode="deduction" editable={editable} onClick={() => openQuickAdjust(r, "deduction")} tooltip={adjustmentTooltip("หักอื่น", deductionItems, "-")} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center justify-end gap-1 tabular-nums font-medium" title={netTooltip(r, employeeRecurring)}>
                        {baht(r.net_estimate)}
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] text-slate-400 cursor-help">?</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => openRowEditor(r)} className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100" title="แก้รายการรายคน">✏️</button>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-400 text-sm">— ไม่มีรายการ —</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <AdjustDrawer row={editRow} periodId={periodId} editable={editable} initialDate={editDate} initialKind={editKind} initialAdjustMode={editAdjustMode}
          onClose={() => { setEditRow(null); setEditDate(undefined); setEditKind(undefined); setEditAdjustMode(undefined); }}
          onChanged={() => { load(periodId); if (activeTab === "attendance") loadGrid(periodId); }} />
      )}
      {quickAdjust && (
        <QuickAdjustmentModal
          row={quickAdjust.row}
          rows={rows}
          mode={quickAdjust.mode}
          periodId={periodId}
          onClose={() => setQuickAdjust(null)}
          onChanged={() => { load(periodId); loadAdjustments(periodId); if (activeTab === "attendance") loadGrid(periodId); }}
        />
      )}
    </div>
  );
}

function AdjustmentCell({ value, mode, editable, onClick, tooltip }: { value: number; mode: AdjustMode; editable: boolean; onClick: () => void; tooltip?: string }) {
  const hasValue = Number(value) > 0;
  const isDeduction = mode === "deduction";
  const isPiecework = mode === "piecework";
  if (!hasValue && !editable) return <span className="text-slate-300">-</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 min-w-[76px] items-center justify-end rounded-lg border px-2 text-xs font-medium tabular-nums transition ${
        hasValue
          ? isDeduction
            ? "border-red-100 bg-red-50 text-red-700 hover:bg-red-100"
            : isPiecework
              ? "border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100"
              : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : isDeduction
            ? "border-red-100 text-red-600 hover:bg-red-50"
            : isPiecework
              ? "border-violet-100 text-violet-600 hover:bg-violet-50"
              : "border-emerald-100 text-emerald-600 hover:bg-emerald-50"
      }`}
      title={tooltip ?? (isDeduction ? "เพิ่ม/ดูรายการหักอื่น" : isPiecework ? "เพิ่ม/ดูรายการงานเหมา" : "เพิ่ม/ดูรายการเพิ่มพิเศษ")}
    >
      {hasValue ? baht(value) : isDeduction ? "+ หัก" : isPiecework ? "+ งานเหมา" : "+ เพิ่ม"}
      {hasValue ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-white/70 text-[10px] cursor-help">?</span> : null}
    </button>
  );
}

function modeMeta(mode: AdjustMode) {
  if (mode === "piecework") return {
    title: "เพิ่มงานเหมา",
    label: "งานเหมา",
    itemLabel: "ชื่องาน",
    placeholder: "ชื่องาน เช่น เหมาแพ็คสินค้า / เหมาติดป้าย",
    button: "+ เพิ่มงานเหมา",
    tone: "violet",
  };
  if (mode === "deduction") return {
    title: "เพิ่มหักอื่น",
    label: "หักอื่น",
    itemLabel: "ชื่อรายการหัก",
    placeholder: "ชื่อรายการ เช่น หักของเสีย / หักเบิกล่วงหน้า",
    button: "+ เพิ่มรายการหัก",
    tone: "red",
  };
  return {
    title: "เพิ่มพิเศษ",
    label: "เพิ่มพิเศษ",
    itemLabel: "ชื่อรายการเพิ่ม",
    placeholder: "ชื่อรายการ เช่น เบี้ยขยัน / โบนัสพิเศษ",
    button: "+ เพิ่มพิเศษ",
    tone: "emerald",
  };
}

const MODE_TONE: Record<AdjustMode, { accent: string; panel: string; primary: string; field: string; badge: string }> = {
  deduction: {
    accent: "bg-red-500",
    panel: "border-red-100 bg-red-50/60",
    primary: "bg-red-600 hover:bg-red-700",
    field: "focus:ring-red-500 focus:border-red-500",
    badge: "bg-red-50 text-red-700 border-red-100",
  },
  earning: {
    accent: "bg-emerald-500",
    panel: "border-emerald-100 bg-emerald-50/60",
    primary: "bg-emerald-600 hover:bg-emerald-700",
    field: "focus:ring-emerald-500 focus:border-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  piecework: {
    accent: "bg-violet-500",
    panel: "border-violet-100 bg-violet-50/60",
    primary: "bg-violet-600 hover:bg-violet-700",
    field: "focus:ring-violet-500 focus:border-violet-500",
    badge: "bg-violet-50 text-violet-700 border-violet-100",
  },
};

function matchesMode(item: Adj, mode: AdjustMode) {
  if (mode === "piecework") return isPieceworkItem(item);
  if (mode === "deduction") return item.adjustment_type === "deduction";
  return item.adjustment_type === "earning" && !isPieceworkItem(item);
}

function totalRecurring(items: RecurringItem[], type: "earning" | "deduction") {
  return items.filter((item) => item.item_type === type).reduce((sum, item) => sum + Number(item.applied_amount || 0), 0);
}

function adjustmentTooltip(title: string, items: Adj[], sign: "+" | "-" = "+") {
  if (items.length === 0) return `${title}: ยังไม่มีรายการ`;
  const lines = items.map((item) => `${sign} ${item.item_name}: ${baht(Number(item.amount || 0))}`);
  return [title, ...lines].join("\n");
}

function recurringTooltip(title: string, items: RecurringItem[], type: "earning" | "deduction") {
  const sign = type === "deduction" ? "-" : "+";
  const filtered = items.filter((item) => item.item_type === type);
  if (filtered.length === 0) return `${title}: ยังไม่มีรายการ`;
  const lines = filtered.map((item) => {
    const range = item.end_date ? `${item.start_date ?? "-"} ถึง ${item.end_date}` : `${item.start_date ?? "-"} ถึงไม่จำกัด`;
    return `${sign} ${item.item_name}: ${baht(Number(item.applied_amount || 0))} (${range})`;
  });
  return [title, ...lines].join("\n");
}

function netTooltip(row: Row, recurring: RecurringItem[]) {
  const lines = [
    `สุทธิประมาณ: ${baht(row.net_estimate)}`,
    `สาย/ออกก่อน: -${baht(row.late_baht)}`,
    `ขาด: -${baht(row.absence_baht)}`,
    `ลา: -${baht(row.leave_baht)}`,
    `OT: +${baht(row.ot_baht)}`,
    `งานเหมา: +${baht(row.piecework_baht)}`,
    `เพิ่มพิเศษ: +${baht(row.special_add)}`,
    `หักอื่น: -${baht(row.other_deduct)}`,
  ];
  const recurringNet = totalRecurring(recurring, "earning") - totalRecurring(recurring, "deduction");
  if (recurringNet) lines.push(`รายการประจำ: ${recurringNet > 0 ? "+" : "-"}${baht(Math.abs(recurringNet))}`);
  return lines.join("\n");
}

function AmountWithTooltip({ value, className = "", title, prefix = "" }: { value: number; className?: string; title: string; prefix?: string }) {
  const hasValue = Number(value) !== 0;
  return (
    <span className={`inline-flex items-center justify-end gap-1 tabular-nums ${className}`} title={title}>
      {hasValue ? `${prefix}${baht(Math.abs(value))}` : <span className="text-slate-300">-</span>}
      {hasValue && <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] text-slate-400 cursor-help">?</span>}
    </span>
  );
}

function RecurringCell({ items, editable, onClick }: { items: RecurringItem[]; editable: boolean; onClick: () => void }) {
  const total = totalRecurring(items, "earning") - totalRecurring(items, "deduction");
  const title = [
    recurringTooltip("รายการประจำเพิ่ม", items, "earning"),
    recurringTooltip("รายการประจำหัก", items, "deduction"),
  ].join("\n\n");

  if (!total && !editable) return <span className="text-slate-300">-</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 min-w-[84px] items-center justify-end gap-1 rounded-lg border px-2 text-xs font-medium tabular-nums transition ${
        total > 0
          ? "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : total < 0
            ? "border-red-100 bg-red-50 text-red-700 hover:bg-red-100"
            : "border-slate-200 text-slate-400 hover:bg-slate-50"
      }`}
      title={title}
    >
      {total ? `${total > 0 ? "+" : "-"} ${baht(Math.abs(total))}` : "-"}
      {total ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/70 bg-white/70 text-[10px] cursor-help">?</span> : null}
    </button>
  );
}

function uniqueNames(items: Adj[], mode: AdjustMode) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!matchesMode(item, mode)) continue;
    const name = item.item_name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function QuickAdjustmentModal({
  row,
  rows,
  mode,
  periodId,
  onClose,
  onChanged,
}: {
  row?: Row;
  rows: Row[];
  mode: AdjustMode;
  periodId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const meta = modeMeta(mode);
  const tone = MODE_TONE[mode];
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(row?.employee_id ?? rows[0]?.employee_id ?? "");
  const [allItems, setAllItems] = useState<Adj[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = `period_id=${encodeURIComponent(periodId)}`;
      const j = await apiFetch(`/api/payroll/adjustments?${qs}`).then((r) => r.json());
      if (j.error) setErr(j.error);
      else setAllItems((j.data ?? []) as Adj[]);
    } catch {
      setErr("โหลดชื่อรายการไม่ได้");
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const names = uniqueNames(allItems, mode);
  const selectedRow = row ?? rows.find((r) => r.employee_id === selectedEmployeeId);
  const employeeItems = allItems.filter((item) => item.employee_id === selectedEmployeeId && matchesMode(item, mode));
  const useCustom = selectedName === "__custom__" || names.length === 0;
  const itemName = (useCustom ? customName : selectedName).trim();
  const hasDraft = !!amount || !!editId || (useCustom && !!customName.trim());

  useEffect(() => {
    if (names.length && !selectedName) setSelectedName(names[0]);
    if (!names.length) setSelectedName("__custom__");
  }, [names, selectedName]);

  function resetForm() {
    setEditId(null);
    setAmount("");
    setCustomName("");
    setSelectedName(names[0] ?? "__custom__");
  }

  function startEdit(item: Adj) {
    setEditId(item.id);
    setAmount(String(Number(item.amount) || ""));
    if (names.includes(item.item_name)) {
      setSelectedName(item.item_name);
      setCustomName("");
    } else {
      setSelectedName("__custom__");
      setCustomName(item.item_name);
    }
  }

  async function save() {
    setErr(null);
    if (!selectedRow) { setErr("เลือกพนักงานก่อน"); return; }
    if (!itemName) { setErr(`เลือกหรือกรอก${meta.itemLabel}`); return; }
    if (!(Number(amount) > 0)) { setErr("กรอกจำนวนเงินมากกว่า 0"); return; }
    const adjustmentType = mode === "deduction" ? "deduction" : "earning";
    setBusy(true);
    try {
      const payload = {
        period_id: periodId,
        employee_id: selectedRow.employee_id,
        adjustment_type: adjustmentType,
        item_name: itemName,
        amount: Number(amount),
        source_type: mode === "piecework" ? "piecework" : "manual",
        item_code: mode === "piecework" ? "PIECEWORK" : undefined,
      };
      const url = editId ? `/api/payroll/adjustments/${editId}` : "/api/payroll/adjustments";
      const j = await apiFetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        resetForm();
        await loadItems();
        onChanged();
      }
    } catch {
      setErr("บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function del(item: Adj) {
    if (!confirm(`ลบ "${item.item_name}"?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/adjustments/${item.id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else {
        if (editId === item.id) resetForm();
        await loadItems();
        onChanged();
      }
    } catch {
      setErr("ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ERPModal
      open
      onClose={onClose}
      size="md"
      title={`${meta.title}${selectedRow ? ` - ${selectedRow.employee_name || selectedRow.employee_code}` : ""}`}
      description="ใส่เฉพาะรายการนี้ ระบบจะนำไปคิดในยอดสุทธิประมาณทันที"
      loading={loading}
      hasUnsavedChanges={hasDraft && !busy}
      footer={
        <>
          {editId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={busy}
              className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              ยกเลิกแก้ไข
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={`h-9 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${tone.primary}`}
          >
            {busy ? "กำลังบันทึก..." : editId ? "บันทึกการแก้ไข" : meta.button}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={`h-1.5 rounded-full ${tone.accent}`} />
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        <div className={`rounded-lg border px-3 py-2 ${tone.panel}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">พนักงาน</div>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>{meta.label}</span>
          </div>
          {row ? (
            <div className="text-sm font-semibold text-slate-800">
              <span className="font-mono text-xs text-slate-400">{row.employee_code}</span> {row.employee_name}
            </div>
          ) : (
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className={`mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 ${tone.field}`}
            >
              {rows.map((r) => <option key={r.employee_id} value={r.employee_id}>{r.employee_code} - {r.employee_name}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">{meta.itemLabel}</span>
            <select
              value={selectedName}
              onChange={(e) => setSelectedName(e.target.value)}
              className={`h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 ${tone.field}`}
            >
              {names.map((name) => <option key={name} value={name}>{name}</option>)}
              <option value="__custom__">+ เพิ่มชื่อใหม่</option>
            </select>
          </label>
          {useCustom && (
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={meta.placeholder}
              className={`h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 ${tone.field}`}
              autoFocus
            />
          )}
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">จำนวนเงิน (บาท)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min="0"
              step="any"
              placeholder="เช่น 500"
              className={`h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tabular-nums focus:outline-none focus:ring-2 ${tone.field}`}
            />
          </label>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">รายการ{meta.label}ของคนนี้</div>
              <div className="text-xs text-slate-400">แก้หรือลบเฉพาะรายการในหมวดนี้</div>
            </div>
            <div className="text-xs tabular-nums text-slate-500">{employeeItems.length} รายการ</div>
          </div>
          {employeeItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">ยังไม่มีรายการ</div>
          ) : (
            <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {employeeItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-slate-700">{item.item_name}</div>
                    <div className="text-xs tabular-nums text-slate-400">{baht(Number(item.amount))}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      disabled={busy}
                      className="h-8 px-2 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      แก้
                    </button>
                    <button
                      type="button"
                      onClick={() => del(item)}
                      disabled={busy}
                      className="h-8 px-2 rounded-md border border-red-100 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ERPModal>
  );
}

function AdjustmentList({
  title,
  modes,
  rows,
  items,
  editable,
  onAdd,
  onOpen,
}: {
  title: string;
  modes: AdjustMode[];
  rows: Row[];
  items: Adj[];
  editable: boolean;
  onAdd: (mode: AdjustMode) => void;
  onOpen: (row: Row | undefined, mode: AdjustMode) => void;
}) {
  const rowById = new Map(rows.map((row) => [row.employee_id, row]));
  const filtered = items.filter((item) => modes.some((mode) => matchesMode(item, mode)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <div className="text-xs text-slate-400">รายการที่บันทึกไว้ในงวดนี้ กดปุ่มด้านขวาเพื่อเพิ่มแบบเร็ว</div>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {modes.map((mode) => {
              const meta = modeMeta(mode);
              const tone = MODE_TONE[mode];
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onAdd(mode)}
                  className={`h-9 rounded-lg px-3 text-sm font-medium text-white ${tone.primary}`}
                >
                  {meta.button}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-left px-3 py-2">พนักงาน</th>
              <th className="text-left px-3 py-2">ประเภท</th>
              <th className="text-left px-3 py-2">รายการ</th>
              <th className="text-right px-3 py-2">จำนวนเงิน</th>
              <th className="text-center px-3 py-2">แก้</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const mode = isPieceworkItem(item) ? "piecework" : item.adjustment_type === "deduction" ? "deduction" : "earning";
              const meta = modeMeta(mode);
              const tone = MODE_TONE[mode];
              const row = rowById.get(item.employee_id);
              return (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    {row ? (
                      <>
                        <span className="font-mono text-xs text-slate-400">{row.employee_code}</span> {row.employee_name}
                      </>
                    ) : (
                      <span className="font-mono text-xs text-slate-400">{item.employee_id}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone.badge}`}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{item.item_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(Number(item.amount))}</td>
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => onOpen(row, mode)}
                        className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        แก้
                      </button>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400 text-sm">— ยังไม่มีรายการ —</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function cellClass(status: string, hasInput: boolean): string {
  if (status === "full") return hasInput ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-emerald-50 border-emerald-200 text-emerald-700";
  if (status === "partial") return "bg-amber-50 border-amber-300 text-amber-700";
  if (status === "zero") return "bg-red-50 border-red-200 text-red-600";
  if (status === "paid_holiday") return "bg-teal-50 border-teal-200 text-teal-700";
  if (status === "exempt") return "bg-slate-100 border-slate-200 text-slate-500";
  if (status === "ot") return "bg-violet-50 border-violet-200 text-violet-700";
  return "bg-slate-50 border-slate-200 text-slate-500";
}

function AttendanceGrid({
  grid,
  loading,
  error,
  query,
  onlyManual,
  editable,
  onCellClick,
}: {
  grid: GridData | null;
  loading: boolean;
  error: string | null;
  query: string;
  onlyManual: boolean;
  editable: boolean;
  onCellClick: (row: GridRow, cell: GridCell) => void;
}) {
  if (loading) return <div className="p-10 text-center text-slate-400 text-sm">กำลังโหลดตารางเข้างาน...</div>;
  if (error) return <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>;
  if (!grid) return <div className="p-10 text-center text-slate-400 text-sm">ยังไม่มีข้อมูลตารางเข้างาน</div>;

  const q = query.trim().toLowerCase();
  const rows = grid.rows
    .filter((r) => !onlyManual || r.manual_days > 0)
    .filter((r) => !q || `${r.employee_code} ${r.employee_name}`.toLowerCase().includes(q));

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">ตารางเข้างานรายวัน</div>
          <div className="text-xs text-slate-500">กดช่องวันที่เพื่อแก้สาย/ขาด/ลา/OT ของพนักงานคนนั้น</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-slate-500">
          <Legend label="8.00" cls="bg-emerald-50 border-emerald-200 text-emerald-700" />
          <Legend label="7.98" cls="bg-amber-50 border-amber-300 text-amber-700" />
          <Legend label="0.00" cls="bg-red-50 border-red-200 text-red-600" />
          <Legend label="หยุด" cls="bg-teal-50 border-teal-200 text-teal-700" />
          <Legend label="+ OT" cls="bg-slate-50 border-slate-200 text-slate-500" />
        </div>
      </div>

      <div className="max-h-[68vh] overflow-auto">
        <table className="min-w-max border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-30 w-[240px] min-w-[240px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                การเข้างาน
              </th>
              {grid.days.map((d) => (
                <th key={d.iso} className={`w-[74px] min-w-[74px] border-b border-r border-slate-200 px-2 py-2 text-center ${d.is_holiday ? "bg-teal-50" : ""}`}>
                  <div className="text-[11px] text-slate-500">{DOW_TH[d.dow]}</div>
                  <div className="font-semibold text-slate-700">{String(d.day).padStart(2, "0")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employee_id} className="group">
                <td className="sticky left-0 z-10 w-[240px] min-w-[240px] border-b border-r border-slate-200 bg-white px-3 py-2 group-hover:bg-slate-50">
                  <div className="font-medium text-slate-800 truncate">{row.employee_name || "—"}</div>
                  <div className="font-mono text-xs text-slate-400">{row.employee_code}</div>
                  <div className="text-[11px] text-slate-400">
                    {row.manual_days ? `มีรายการในงวดนี้ ${row.manual_days} วัน` : "ทำงานปกติทั้งงวด"}
                  </div>
                </td>
                {row.cells.map((cell) => {
                  const disabled = !editable || (!cell.editable && !cell.allow_ot);
                  return (
                    <td key={`${row.employee_id}-${cell.date}`} className="border-b border-r border-slate-100 px-1.5 py-2 text-center">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onCellClick(row, cell)}
                        title={`${formatDate(cell.date)}${cell.note ? ` · ${cell.note}` : ""}`}
                        className={`h-[42px] w-[62px] rounded-lg border px-1 text-xs font-semibold tabular-nums leading-tight transition ${
                          cellClass(cell.status, cell.has_input)
                        } ${disabled ? "cursor-default opacity-80" : "hover:ring-2 hover:ring-blue-200"}`}
                      >
                        <span className="block">{cell.label}</span>
                        {cell.sublabel && <span className="block text-[10px] font-medium opacity-80">{cell.sublabel}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={grid.days.length + 1} className="px-3 py-10 text-center text-slate-400">— ไม่มีรายการ —</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex h-7 items-center rounded-lg border px-2 font-semibold ${cls}`}>{label}</span>;
}

function AdjustDrawer({ row, periodId, editable, initialDate, initialKind, initialAdjustMode, onClose, onChanged }:
  { row: Row; periodId: string; editable: boolean; initialDate?: string; initialKind?: TimeKind; initialAdjustMode?: AdjustMode; onClose: () => void; onChanged: () => void }) {
  const initialDrawerTab: DrawerTab = initialKind ?? "late";
  const [items, setItems] = useState<Adj[]>([]);
  const [timeItems, setTimeItems] = useState<TimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AdjustMode>(initialAdjustMode ?? "earning");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(initialDrawerTab);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [tKind, setTKind] = useState<TimeKind>(initialKind ?? initialDrawerTab);
  const [tValue, setTValue] = useState("");
  const [lateUnit, setLateUnit] = useState<LateUnit>("minutes");
  const [durationPreset, setDurationPreset] = useState<DurationPreset>("custom");
  const [customHours, setCustomHours] = useState("");
  const [customMinutes, setCustomMinutes] = useState("");
  const [leaveReason, setLeaveReason] = useState<LeaveReason>("unpaid");
  const [tDate, setTDate] = useState(initialDate ?? todayIso());
  const [tNote, setTNote] = useState("");
  const [preview, setPreview] = useState<TimePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `period_id=${encodeURIComponent(periodId)}&employee_id=${encodeURIComponent(row.employee_id)}`;
      const [adj, tim] = await Promise.all([
        apiFetch(`/api/payroll/adjustments?${qs}`).then((r) => r.json()),
        apiFetch(`/api/payroll/time-entry?${qs}`).then((r) => r.json()),
      ]);
      setItems((adj.data ?? []) as Adj[]);
      setTimeItems((tim.data ?? []) as TimeItem[]);
    } catch { /* */ } finally { setLoading(false); }
  }, [periodId, row.employee_id]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    setTKind(initialKind ?? "late");
    setTDate(initialDate ?? todayIso());
    setMode(initialAdjustMode ?? "earning");
    setDrawerTab(initialKind ?? "late");
    setTValue("");
    setLateUnit("minutes");
    setDurationPreset("custom");
    setCustomHours("");
    setCustomMinutes("");
    setLeaveReason("unpaid");
    setTNote("");
    setName("");
    setAmount("");
    setPreview(null);
  }, [initialDate, initialKind, initialAdjustMode, row.employee_id]);
  useEffect(() => {
    setTKind(drawerTab);
    setPreview(null);
    setErr(null);
    if (drawerTab === "absence" || drawerTab === "leave") setDurationPreset("full");
    if (drawerTab === "ot") setDurationPreset("custom");
  }, [drawerTab]);

  async function addItem() {
    setErr(null);
    if (!name.trim() || !(Number(amount) > 0)) { setErr("กรอกชื่อรายการ + จำนวนเงิน (> 0)"); return; }
    const adjustmentType = mode === "deduction" ? "deduction" : "earning";
    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/adjustments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_id: periodId,
          employee_id: row.employee_id,
          adjustment_type: adjustmentType,
          item_name: name.trim(),
          amount: Number(amount),
          source_type: mode === "piecework" ? "piecework" : "manual",
          item_code: mode === "piecework" ? "PIECEWORK" : undefined,
        }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else { setName(""); setAmount(""); await reload(); onChanged(); }
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  async function del(id: string) {
    if (!confirm("ลบรายการนี้?")) return;
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/adjustments/${id}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) setErr(j.error); else { await reload(); onChanged(); }
    } catch { setErr("ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  function computedTimeValue() {
    if (tKind === "late") {
      const raw = Number(tValue);
      if (!(raw > 0)) return 0;
      return lateUnit === "hours" ? raw * 60 : raw;
    }
    if (durationPreset === "full") return tKind === "ot" ? STANDARD_HOURS_PER_DAY : 1;
    if (durationPreset === "half") return tKind === "ot" ? STANDARD_HOURS_PER_DAY / 2 : 0.5;
    const hours = Number(customHours || 0);
    const minutes = Number(customMinutes || 0);
    const totalHours = hours + (minutes / 60);
    if (!(totalHours > 0)) return 0;
    return tKind === "ot" ? totalHours : totalHours / STANDARD_HOURS_PER_DAY;
  }

  function timeNote() {
    const note = tNote.trim();
    if (tKind !== "leave") return note;
    const reason = LEAVE_REASON_LABEL[leaveReason];
    return note ? `${reason} - ${note}` : reason;
  }

  function timeQuantityLabel() {
    if (tKind === "late") return lateUnit === "hours" ? "จำนวนชั่วโมงที่สาย" : "จำนวนนาทีที่สาย";
    if (durationPreset === "full") return `เต็มวัน (${STANDARD_HOURS_PER_DAY} ชั่วโมง)`;
    if (durationPreset === "half") return `ครึ่งวัน (${STANDARD_HOURS_PER_DAY / 2} ชั่วโมง)`;
    return tKind === "ot" ? "ใส่ชั่วโมง OT เอง" : "ใส่ชั่วโมง/นาทีเอง";
  }

  async function loadPreview(value: number) {
    setErr(null);
    if (!(value > 0)) { setPreview(null); return; }
    if (!tDate) { setErr("เลือกวันที่ของรายการก่อน"); setPreview(null); return; }
    setPreviewing(true);
    try {
      const j = await apiFetch("/api/payroll/time-entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee_id: row.employee_id, kind: tKind, value, work_date: tDate, note: timeNote(), preview_only: true }),
      }).then((r) => r.json());
      if (j.error) { setErr(j.error); setPreview(null); }
      else setPreview(j.data as TimePreview);
    } catch { setErr("คำนวณตัวอย่างไม่สำเร็จ"); setPreview(null); }
    finally { setPreviewing(false); }
  }

  async function previewTime() {
    const value = computedTimeValue();
    if (!(value > 0)) { setErr(`กรอกจำนวน ${TIME_META[tKind].unit} (> 0)`); return; }
    await loadPreview(value);
  }

  async function addTime() {
    setErr(null);
    const value = computedTimeValue();
    if (!(value > 0)) { setErr(`กรอกจำนวน ${TIME_META[tKind].unit} (> 0)`); return; }
    if (!tDate) { setErr("เลือกวันที่ของรายการก่อน"); return; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/time-entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee_id: row.employee_id, kind: tKind, value, work_date: tDate, note: timeNote() }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else { setTValue(""); setCustomHours(""); setCustomMinutes(""); setTNote(""); setPreview(null); await reload(); onChanged(); }
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  async function delTime(it: TimeItem) {
    if (!confirm("ลบรายการนี้?")) return;
    setBusy(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/time-entry/${it.id}?kind=${it.kind}`, { method: "DELETE" }).then((r) => r.json());
      if (j.error) setErr(j.error); else { await reload(); onChanged(); }
    } catch { setErr("ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    const value = computedTimeValue();
    setPreview(null);
    setErr(null);
    if (!editable || !(value > 0) || !tDate) return;
    const timer = window.setTimeout(() => { void loadPreview(value); }, 350);
    return () => window.clearTimeout(timer);
  }, [editable, tKind, tValue, lateUnit, durationPreset, customHours, customMinutes, tDate, tNote, leaveReason, periodId, row.employee_id]);

  const pieceworks = items.filter(isPieceworkItem);
  const earnings = items.filter((i) => i.adjustment_type === "earning" && !isPieceworkItem(i));
  const deductions = items.filter((i) => i.adjustment_type === "deduction");
  const hasDraftTime = editable && (!!tValue || !!customHours || !!customMinutes || !!tNote || !!preview);
  const visibleTimeItems = timeItems.filter((it) => it.kind === drawerTab);
  const computedValue = computedTimeValue();
  const adjustItems = mode === "piecework" ? pieceworks : mode === "deduction" ? deductions : earnings;
  const adjustTitle = mode === "piecework" ? "งานเหมา" : mode === "deduction" ? "หักอื่น" : "เพิ่มพิเศษ";
  const adjustEmpty = mode === "piecework" ? "ยังไม่มีรายการงานเหมา" : mode === "deduction" ? "ยังไม่มีรายการหัก" : "ยังไม่มีรายการเพิ่ม";

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={`${row.employee_code} ${row.employee_name}`}
      description="กรอกสาย / ขาด / ลา / OT แล้วคำนวณให้ดูก่อนบันทึกเงินจริง"
      hasUnsavedChanges={hasDraftTime}
    >
        <div className="space-y-5">
          {!editable && <div className="rounded-lg bg-amber-50 text-amber-700 px-3 py-2 text-xs">งวดนี้แก้ไม่ได้ (ดูอย่างเดียว)</div>}
          {err && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs">{err}</div>}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
            <div className="flex min-w-max gap-1">
              {DRAWER_TABS.map((tab) => {
                const active = drawerTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDrawerTab(tab.key)}
                    className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* เวลา: สาย/ขาด/ลา/OT — คิดเงินจากเรทค่าจ้างอัตโนมัติ */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">เวลา: {TIME_META[drawerTab].label}</div>
            {visibleTimeItems.length === 0 ? (
              <div className="text-xs text-slate-400 py-1">ยังไม่มีรายการเวลา</div>
            ) : (
              <div className="space-y-1.5">
                {visibleTimeItems.map((it) => {
                  const m = TIME_META[it.kind];
                  return (
                    <div key={`${it.kind}-${it.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <span className="min-w-0">
                        <span className="text-sm text-slate-700">{m.label} <span className="text-slate-400">{it.value} {m.unit}</span></span>
                        {(it.work_date || it.note) && (
                          <span className="block text-[11px] text-slate-400 truncate">
                            {it.work_date || "ไม่ระบุวันที่"}{it.note ? ` · ${it.note}` : ""}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`text-sm tabular-nums ${m.cls}`}>{m.sign}฿{it.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                        {editable && <button onClick={() => delTime(it)} disabled={busy} className="text-slate-300 hover:text-red-500 text-sm" title="ลบ">🗑</button>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {editable && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <div>
                  <div className="text-sm font-medium text-slate-700">ฟอร์ม {TIME_META[drawerTab].label}</div>
                  <p className="mt-0.5 text-xs text-slate-400">กรอกข้อมูลแล้วระบบจะคำนวณตัวอย่างให้ทันที ก่อนกดบันทึกรายการ</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs text-slate-500 mb-1">วันที่</span>
                    <DateInput value={tDate} onChange={setTDate} />
                  </label>
                  {drawerTab === "leave" && (
                    <label className="block">
                      <span className="block text-xs text-slate-500 mb-1">ชนิดลา</span>
                      <select value={leaveReason} onChange={(e) => setLeaveReason(e.target.value as LeaveReason)} className="h-9 w-full px-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="medical_certificate">มีใบรับรองแพทย์</option>
                        <option value="sick_paid">ลาป่วยรับเงิน</option>
                        <option value="sick_unpaid">ลาป่วยไม่รับเงิน</option>
                        <option value="unpaid">ลาไม่รับเงิน</option>
                      </select>
                    </label>
                  )}
                  {drawerTab === "late" ? (
                    <>
                      <label className="block">
                        <span className="block text-xs text-slate-500 mb-1">หน่วย</span>
                        <select value={lateUnit} onChange={(e) => setLateUnit(e.target.value as LateUnit)} className="h-9 w-full px-2 border border-slate-300 rounded-lg text-sm bg-white">
                          <option value="minutes">นาที</option>
                          <option value="hours">ชั่วโมง</option>
                        </select>
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="block text-xs text-slate-500 mb-1">{timeQuantityLabel()}</span>
                        <input value={tValue} onChange={(e) => setTValue(e.target.value)} type="number" min="0" step="any" placeholder={lateUnit === "minutes" ? "เช่น 30" : "เช่น 1.5"}
                          className="h-9 w-full px-3 border border-slate-300 rounded-lg text-sm tabular-nums bg-white" />
                      </label>
                    </>
                  ) : (
                    <div className="sm:col-span-2 space-y-3">
                      <div>
                        <span className="block text-xs text-slate-500 mb-1">ช่วงเวลา</span>
                        <div className="grid grid-cols-3 gap-2">
                          <button type="button" onClick={() => setDurationPreset("full")} className={`h-9 rounded-lg border text-sm font-medium ${durationPreset === "full" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>เต็มวัน</button>
                          <button type="button" onClick={() => setDurationPreset("half")} className={`h-9 rounded-lg border text-sm font-medium ${durationPreset === "half" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>ครึ่งวัน</button>
                          <button type="button" onClick={() => setDurationPreset("custom")} className={`h-9 rounded-lg border text-sm font-medium ${durationPreset === "custom" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}>กำหนดเอง</button>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{timeQuantityLabel()}</p>
                      </div>
                      {durationPreset === "custom" && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="block text-xs text-slate-500 mb-1">ชั่วโมง</span>
                            <input value={customHours} onChange={(e) => setCustomHours(e.target.value)} type="number" min="0" step="any" placeholder="เช่น 2"
                              className="h-9 w-full px-3 border border-slate-300 rounded-lg text-sm tabular-nums bg-white" />
                          </label>
                          <label className="block">
                            <span className="block text-xs text-slate-500 mb-1">นาที</span>
                            <input value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)} type="number" min="0" step="1" placeholder="เช่น 30"
                              className="h-9 w-full px-3 border border-slate-300 rounded-lg text-sm tabular-nums bg-white" />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                  <label className="block sm:col-span-2">
                    <span className="block text-xs text-slate-500 mb-1">หมายเหตุ</span>
                    <textarea value={tNote} onChange={(e) => setTNote(e.target.value)} rows={2} placeholder="เช่น มาสายรถติด / ลากิจไม่รับเงิน / ไม่สแกนนิ้ว"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none bg-white" />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={addTime} disabled={busy || previewing || !(computedValue > 0)}
                    className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {busy ? "กำลังบันทึก..." : "บันทึกรายการ"}
                  </button>
                  {previewing && <span className="inline-flex h-9 items-center text-xs text-slate-400">กำลังคำนวณตัวอย่าง...</span>}
                </div>

                {preview && (
                  <div className={`rounded-xl border p-4 ${preview.sign === "-" ? "border-red-100 bg-red-50/70" : "border-emerald-100 bg-emerald-50/70"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium text-slate-500">ยอดที่จะ{preview.sign === "-" ? "หัก" : "เพิ่ม"}</div>
                        <div className={`text-2xl font-bold tabular-nums ${preview.sign === "-" ? "text-red-700" : "text-emerald-700"}`}>
                          {preview.sign}{baht(preview.amount)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>อัตรา/ชม. <b className="text-slate-700">{baht(preview.rate)}</b></div>
                        {preview.divisor ? <div>ตัวหารวัน <b className="text-slate-700">{preview.divisor}</b></div> : null}
                        <div>ชั่วโมง/วัน <b className="text-slate-700">{preview.hours_per_day}</b></div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg bg-white/80 border border-white px-3 py-2">
                      <div className="text-xs text-slate-500 mb-1">วิธีคิด</div>
                      <div className="text-sm text-slate-800 tabular-nums">{preview.formula} = {baht(preview.amount)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
              <div className="flex min-w-max gap-1">
                {(["piecework", "earning", "deduction"] as AdjustMode[]).map((m) => {
                  const active = mode === m;
                  const meta = modeMeta(m);
                  const tone = MODE_TONE[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
                        active ? `${tone.primary} text-white` : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Section title={adjustTitle} items={adjustItems} onDel={del} editable={editable} busy={busy} empty={adjustEmpty} />

            {editable && (
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="text-sm font-medium text-slate-700">เพิ่ม{modeMeta(mode).label}</div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === "piecework" ? "ชื่องาน เช่น เหมาแพ็คสินค้า / เหมาติดป้าย" : mode === "earning" ? "ชื่อรายการ เช่น เบี้ยขยัน / โบนัสพิเศษ" : "ชื่อรายการ เช่น หักของเสีย / หักเบิกล่วงหน้า"}
                  className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm" />
                <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" placeholder="จำนวนเงิน (บาท)"
                  className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm tabular-nums" />
                <button onClick={addItem} disabled={busy}
                  className={`h-10 w-full text-white rounded-lg text-sm font-medium disabled:opacity-50 ${MODE_TONE[mode].primary}`}>
                  {busy ? "กำลังบันทึก..." : mode === "piecework" ? "+ เพิ่มงานเหมา" : mode === "deduction" ? "+ เพิ่มรายการหัก" : "+ เพิ่มพิเศษ"}
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">หลังแก้รายการ กลับไปกด “คำนวณ + บันทึก” เพื่อออกผลจริง</p>
        </div>
    </Drawer>
  );
}

function Section({ title, items, onDel, editable, busy, empty }:
  { title: string; items: Adj[]; onDel: (id: string) => void; editable: boolean; busy: boolean; empty: string }) {
  const total = items.reduce((t, i) => t + Number(i.amount), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span className="text-sm tabular-nums text-slate-500">{total ? `฿${total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "—"}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 py-2">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm text-slate-700 truncate">{i.item_name}</span>
              <span className="flex items-center gap-2">
                <span className="text-sm tabular-nums">฿{Number(i.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                {editable && <button onClick={() => onDel(i.id)} disabled={busy} className="text-slate-300 hover:text-red-500 text-sm" title="ลบ">🗑</button>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
