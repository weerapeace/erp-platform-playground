"use client";

/**
 * Payroll module — ข้อมูลคำนวณ (Manual Inputs) Phase A
 * เลือกงวด → ตารางพนักงาน + ยอดสรุป (สาย/ขาด/ลา/OT/เพิ่มพิเศษ/หักอื่น) + สุทธิประมาณ (เครื่องจริง)
 * แก้ "เพิ่มพิเศษ/หักอื่น" ต่อคนผ่าน drawer → บันทึก → สุทธิประมาณอัปเดต → ไปคำนวณ+บันทึก
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Drawer } from "@/components/modal";
import { DateInput } from "@/components/date-input";
import { formatDate } from "@/lib/date";

type Period = { id: string; period_name: string; status: string };
type Row = {
  id: string; employee_id: string; employee_code: string; employee_name: string; work_days: number;
  late_baht: number; absence_baht: number; leave_baht: number; ot_baht: number;
  special_add: number; other_deduct: number; net_estimate: number; has_manual: boolean;
};
type Adj = { id: string; adjustment_type: string; item_name: string; amount: number };
type TimeKind = "ot" | "late" | "absence" | "leave";
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

export default function ManualInputPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [periodStatus, setPeriodStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyManual, setOnlyManual] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editDate, setEditDate] = useState<string | undefined>();
  const [editKind, setEditKind] = useState<TimeKind | undefined>();
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [grid, setGrid] = useState<GridData | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridErr, setGridErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/payroll/master/periods?include_inactive=true").then((r) => r.json())
      .then((j) => { const ps = (j.data ?? []) as Period[]; setPeriods(ps); if (ps[0]) setPeriodId(ps[0].id); }).catch(() => {});
  }, []);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/payroll/manual-input?period_id=${encodeURIComponent(pid)}`).then((r) => r.json());
      if (j.error) { setErr(j.error); setRows([]); }
      else { setRows(j.data as Row[]); setPeriodStatus(j.period_status ?? ""); }
    } catch { setErr("โหลดไม่ได้"); }
    finally { setLoading(false); }
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

  useEffect(() => { if (periodId) load(periodId); }, [periodId, load]);
  useEffect(() => { if (periodId && activeTab === "attendance") loadGrid(periodId); }, [periodId, activeTab, loadGrid]);

  const editable = EDITABLE(periodStatus);
  const shown = rows
    .filter((r) => !onlyManual || r.has_manual)
    .filter((r) => !q.trim() || `${r.employee_code} ${r.employee_name}`.toLowerCase().includes(q.trim().toLowerCase()));

  const totalNet = rows.reduce((t, r) => t + r.net_estimate, 0);
  const openRowEditor = (row: Row, date?: string, kind?: TimeKind) => {
    setEditRow(row);
    setEditDate(date);
    setEditKind(kind);
  };
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
                <th className="text-right px-3 py-2">เพิ่มพิเศษ</th>
                <th className="text-right px-3 py-2">หักอื่น</th>
                <th className="text-right px-3 py-2">สุทธิประมาณ</th>
                <th className="text-center px-3 py-2">แก้</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`border-t border-slate-100 hover:bg-slate-50 ${r.has_manual ? "bg-amber-50/30" : ""}`}>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-slate-400">{r.employee_code}</span> {r.employee_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.work_days || "—"}</td>
                  <td className="px-3 py-2 text-right">{dash(r.late_baht, "text-red-600")}</td>
                  <td className="px-3 py-2 text-right">{dash(r.absence_baht, "text-red-600")}</td>
                  <td className="px-3 py-2 text-right">{dash(r.leave_baht, "text-red-600")}</td>
                  <td className="px-3 py-2 text-right">{dash(r.ot_baht, "text-emerald-600")}</td>
                  <td className="px-3 py-2 text-right">{dash(r.special_add, "text-emerald-600")}</td>
                  <td className="px-3 py-2 text-right">{dash(r.other_deduct, "text-red-600")}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(r.net_estimate)}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => openRowEditor(r)} className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100" title="แก้เพิ่มพิเศษ/หักอื่น">✏️</button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400 text-sm">— ไม่มีรายการ —</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <AdjustDrawer row={editRow} periodId={periodId} editable={editable} initialDate={editDate} initialKind={editKind}
          onClose={() => { setEditRow(null); setEditDate(undefined); setEditKind(undefined); }}
          onChanged={() => { load(periodId); if (activeTab === "attendance") loadGrid(periodId); }} />
      )}
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

function AdjustDrawer({ row, periodId, editable, initialDate, initialKind, onClose, onChanged }:
  { row: Row; periodId: string; editable: boolean; initialDate?: string; initialKind?: TimeKind; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Adj[]>([]);
  const [timeItems, setTimeItems] = useState<TimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"earning" | "deduction">("earning");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [tKind, setTKind] = useState<TimeKind>(initialKind ?? "ot");
  const [tValue, setTValue] = useState("");
  const [tDate, setTDate] = useState(initialDate ?? todayIso());
  const [tNote, setTNote] = useState("");
  const [preview, setPreview] = useState<TimePreview | null>(null);
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
    setTKind(initialKind ?? "ot");
    setTDate(initialDate ?? todayIso());
    setTValue("");
    setTNote("");
    setPreview(null);
  }, [initialDate, initialKind, row.employee_id]);
  useEffect(() => { setPreview(null); setErr(null); }, [tKind, tValue, tDate]);

  async function addItem() {
    setErr(null);
    if (!name.trim() || !(Number(amount) > 0)) { setErr("กรอกชื่อรายการ + จำนวนเงิน (> 0)"); return; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/adjustments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee_id: row.employee_id, adjustment_type: type, item_name: name.trim(), amount: Number(amount) }),
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

  async function previewTime() {
    setErr(null);
    if (!(Number(tValue) > 0)) { setErr(`กรอกจำนวน ${TIME_META[tKind].unit} (> 0)`); return; }
    if (!tDate) { setErr("เลือกวันที่ของรายการก่อน"); return; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/time-entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee_id: row.employee_id, kind: tKind, value: Number(tValue), work_date: tDate, note: tNote, preview_only: true }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else setPreview(j.data as TimePreview);
    } catch { setErr("คำนวณให้ดูไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  async function addTime() {
    setErr(null);
    if (!(Number(tValue) > 0)) { setErr(`กรอกจำนวน ${TIME_META[tKind].unit} (> 0)`); return; }
    if (!tDate) { setErr("เลือกวันที่ของรายการก่อน"); return; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/time-entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee_id: row.employee_id, kind: tKind, value: Number(tValue), work_date: tDate, note: tNote }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else { setTValue(""); setTNote(""); setPreview(null); await reload(); onChanged(); }
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

  const earnings = items.filter((i) => i.adjustment_type === "earning");
  const deductions = items.filter((i) => i.adjustment_type === "deduction");
  const hasDraftTime = editable && (!!tValue || !!tNote || !!preview);

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

          {/* เวลา: สาย/ขาด/ลา/OT — คิดเงินจากเรทค่าจ้างอัตโนมัติ */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">⏱ เวลา (สาย/ขาด/ลา/OT)</div>
            {timeItems.length === 0 ? (
              <div className="text-xs text-slate-400 py-1">ยังไม่มีรายการเวลา</div>
            ) : (
              <div className="space-y-1.5">
                {timeItems.map((it) => {
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
                <div className="text-sm font-medium text-slate-700">ฟอร์มคำนวณก่อนบันทึก</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-xs text-slate-500 mb-1">ประเภท</span>
                    <select value={tKind} onChange={(e) => setTKind(e.target.value as TimeKind)} className="h-9 w-full px-2 border border-slate-300 rounded-lg text-sm bg-white">
                      <option value="late">มาสาย (นาที)</option>
                      <option value="absence">ขาดงาน (วัน)</option>
                      <option value="leave">ลาไม่รับเงิน (วัน)</option>
                      <option value="ot">OT (ชม.)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-500 mb-1">วันที่</span>
                    <DateInput value={tDate} onChange={setTDate} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="block text-xs text-slate-500 mb-1">จำนวน {TIME_META[tKind].unit}</span>
                    <input value={tValue} onChange={(e) => setTValue(e.target.value)} type="number" min="0" step="any" placeholder={`เช่น ${tKind === "late" ? "30" : "1"}`}
                      className="h-9 w-full px-3 border border-slate-300 rounded-lg text-sm tabular-nums bg-white" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="block text-xs text-slate-500 mb-1">หมายเหตุ</span>
                    <textarea value={tNote} onChange={(e) => setTNote(e.target.value)} rows={2} placeholder="เช่น มาสายรถติด / ลากิจไม่รับเงิน / ไม่สแกนนิ้ว"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none bg-white" />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={previewTime} disabled={busy}
                    className="h-9 px-4 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-50">
                    คำนวณให้ดู
                  </button>
                  <button onClick={addTime} disabled={busy || !preview}
                    className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    บันทึกรายการ
                  </button>
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

          <div className="border-t border-slate-100" />

          <Section title="🟢 เพิ่มพิเศษ" items={earnings} onDel={del} editable={editable} busy={busy} empty="ยังไม่มีรายการเพิ่ม" />
          <Section title="🔴 หักอื่น" items={deductions} onDel={del} editable={editable} busy={busy} empty="ยังไม่มีรายการหัก" />

          {editable && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="text-sm font-medium text-slate-700">เพิ่มเงินเพิ่ม/หัก</div>
              <div className="flex gap-2">
                <button onClick={() => setType("earning")} className={`flex-1 h-9 rounded-lg text-sm font-medium border ${type === "earning" ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-300 text-slate-600"}`}>เพิ่มพิเศษ</button>
                <button onClick={() => setType("deduction")} className={`flex-1 h-9 rounded-lg text-sm font-medium border ${type === "deduction" ? "bg-red-600 text-white border-red-600" : "border-slate-300 text-slate-600"}`}>หักอื่น</button>
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อรายการ เช่น เบี้ยขยัน / หักของเสีย"
                className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" placeholder="จำนวนเงิน (บาท)"
                className="h-10 w-full px-3 border border-slate-300 rounded-lg text-sm tabular-nums" />
              <button onClick={addItem} disabled={busy}
                className="h-10 w-full bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {busy ? "กำลังบันทึก..." : "+ เพิ่มรายการ"}
              </button>
            </div>
          )}
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
