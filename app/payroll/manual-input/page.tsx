"use client";

/**
 * Payroll module — ข้อมูลคำนวณ (Manual Inputs) Phase A
 * เลือกงวด → ตารางพนักงาน + ยอดสรุป (สาย/ขาด/ลา/OT/เพิ่มพิเศษ/หักอื่น) + สุทธิประมาณ (เครื่องจริง)
 * แก้ "เพิ่มพิเศษ/หักอื่น" ต่อคนผ่าน drawer → บันทึก → สุทธิประมาณอัปเดต → ไปคำนวณ+บันทึก
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Period = { id: string; period_name: string; status: string };
type Row = {
  id: string; employee_id: string; employee_code: string; employee_name: string; work_days: number;
  late_baht: number; absence_baht: number; leave_baht: number; ot_baht: number;
  special_add: number; other_deduct: number; net_estimate: number; has_manual: boolean;
};
type Adj = { id: string; adjustment_type: string; item_name: string; amount: number };
type TimeKind = "ot" | "late" | "absence" | "leave";
type TimeItem = { id: string; kind: TimeKind; value: number; amount: number };
const TIME_META: Record<TimeKind, { label: string; unit: string; sign: "+" | "-"; cls: string }> = {
  ot:      { label: "OT",            unit: "ชม.",  sign: "+", cls: "text-emerald-600" },
  late:    { label: "มาสาย",         unit: "นาที", sign: "-", cls: "text-red-600" },
  absence: { label: "ขาดงาน",        unit: "วัน",  sign: "-", cls: "text-red-600" },
  leave:   { label: "ลาไม่รับเงิน",  unit: "วัน",  sign: "-", cls: "text-red-600" },
};

const baht = (v: number) => v ? `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` : "—";
const dash = (v: number, cls = "") => v ? <span className={`tabular-nums ${cls}`}>{baht(v)}</span> : <span className="text-slate-300">-</span>;
const EDITABLE = (s: string) => s === "draft" || s === "review";

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

  useEffect(() => { if (periodId) load(periodId); }, [periodId, load]);

  const editable = EDITABLE(periodStatus);
  const shown = rows
    .filter((r) => !onlyManual || r.has_manual)
    .filter((r) => !q.trim() || `${r.employee_code} ${r.employee_name}`.toLowerCase().includes(q.trim().toLowerCase()));

  const totalNet = rows.reduce((t, r) => t + r.net_estimate, 0);

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

      {!editable && periodStatus && (
        <div className="rounded-lg bg-amber-50 text-amber-700 px-4 py-2 text-sm mb-3">งวดนี้สถานะ “{periodStatus}” — ดูได้อย่างเดียว (แก้ได้เฉพาะงวด ร่าง/รอตรวจ)</div>
      )}
      {err && <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm mb-3">{err}</div>}

      <div className="flex flex-wrap gap-3 mb-3 text-sm">
        <span className="text-slate-500">พนักงาน <b className="text-slate-700">{rows.length}</b> คน</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500">รวมสุทธิประมาณ <b className="text-emerald-700">{baht(Math.round(totalNet * 100) / 100)}</b></span>
      </div>

      {loading ? (
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
                    <button onClick={() => setEditRow(r)} className="px-2 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100" title="แก้เพิ่มพิเศษ/หักอื่น">✏️</button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400 text-sm">— ไม่มีรายการ —</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <AdjustDrawer row={editRow} periodId={periodId} editable={editable}
          onClose={() => setEditRow(null)} onChanged={() => load(periodId)} />
      )}
    </div>
  );
}

function AdjustDrawer({ row, periodId, editable, onClose, onChanged }:
  { row: Row; periodId: string; editable: boolean; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Adj[]>([]);
  const [timeItems, setTimeItems] = useState<TimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"earning" | "deduction">("earning");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [tKind, setTKind] = useState<TimeKind>("ot");
  const [tValue, setTValue] = useState("");
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

  async function addTime() {
    setErr(null);
    if (!(Number(tValue) > 0)) { setErr(`กรอกจำนวน ${TIME_META[tKind].unit} (> 0)`); return; }
    setBusy(true);
    try {
      const j = await apiFetch("/api/payroll/time-entry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId, employee_id: row.employee_id, kind: tKind, value: Number(tValue) }),
      }).then((r) => r.json());
      if (j.error) setErr(j.error);
      else { setTValue(""); await reload(); onChanged(); }
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 sticky top-0 bg-white flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-mono">{row.employee_code}</div>
            <div className="font-semibold text-slate-800">{row.employee_name}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div className="p-5 space-y-5">
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
                      <span className="text-sm text-slate-700">{m.label} <span className="text-slate-400">{it.value} {m.unit}</span></span>
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
              <div className="flex gap-2 mt-2">
                <select value={tKind} onChange={(e) => setTKind(e.target.value as TimeKind)} className="h-9 px-2 border border-slate-300 rounded-lg text-sm bg-white">
                  <option value="ot">OT (ชม.)</option>
                  <option value="late">มาสาย (นาที)</option>
                  <option value="absence">ขาดงาน (วัน)</option>
                  <option value="leave">ลาไม่รับเงิน (วัน)</option>
                </select>
                <input value={tValue} onChange={(e) => setTValue(e.target.value)} type="number" min="0" step="any" placeholder={`จำนวน ${TIME_META[tKind].unit}`}
                  className="h-9 flex-1 px-3 border border-slate-300 rounded-lg text-sm tabular-nums" />
                <button onClick={addTime} disabled={busy} className="h-9 px-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">+</button>
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
      </div>
    </div>
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
