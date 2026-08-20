"use client";

/**
 * 💧 กระแสเงินสด (Cashflow) — เฟส 1 "ดูอย่างเดียว"
 * URL: /cashflow
 *
 * รวมเงินเข้า-เงินออกทั้งบริษัทไว้หน้าเดียว จาก 5 แหล่ง:
 * คำสั่งขาย · จัดซื้อ · เงินเดือน · หนี้ (เงินกู้/OD) · โอนเงินจีน
 *
 * หน้านี้ไม่แก้ข้อมูลต้นทางเลย — ยกเว้น "ยอดเงินในบัญชี" ที่ผู้ใช้กรอกเองเพื่อใช้เป็นจุดเริ่มของกราฟ
 * สูตรรวมยอด/สีแหล่งที่มาอยู่ที่ lib/cashflow.ts (ของกลาง) — ห้ามเขียนซ้ำในไฟล์นี้
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { DataTable } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { InfoHint } from "@/components/info-hint";
import { usePermission, AccessDenied, useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import {
  CASHFLOW_CERTAINTY, CASHFLOW_SOURCE, THB, THBShort,
  addDaysISO, buildDailySeries, firstNegativeDay, monthLabelTH, todayISO, totalsByMonth,
  type CashflowEvent, type CashflowSource,
} from "@/lib/cashflow";
import type { CashflowApiData } from "@/app/api/cashflow/route";
import type { OpeningBalance } from "@/app/api/cashflow/opening-balances/route";
import type { LoanReconcileRow } from "@/app/api/cashflow/loan-reallocate/route";

const ALL_SOURCES = Object.keys(CASHFLOW_SOURCE) as CashflowSource[];
const RANGES = [
  { days: 30,  label: "30 วัน" },
  { days: 90,  label: "3 เดือน" },
  { days: 180, label: "6 เดือน" },
  { days: 365, label: "1 ปี" },
];

/** ค่าที่ผู้ใช้ปรับเอง — จำไว้ต่อเครื่อง (ไม่กระทบคนอื่น) */
type Prefs = { rangeDays: number; customerDays: number; supplierDays: number; rmbRate: number | null; off: CashflowSource[] };
const PREF_KEY = "erp-cashflow-prefs";
const DEFAULT_PREFS: Prefs = { rangeDays: 90, customerDays: 30, supplierDays: 30, rmbRate: null, off: [] };

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}

type Row = CashflowEvent & { balance: number };

export default function CashflowPage() {
  const canView = usePermission("cashflow.view");
  const canManage = usePermission("cashflow.manage");
  const { permsReady } = useAuth();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [data, setData] = useState<CashflowApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);

  useEffect(() => { setPrefs(loadPrefs()); }, []);
  const savePrefs = (next: Prefs) => {
    setPrefs(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* โหมดส่วนตัวของเบราว์เซอร์ */ }
  };

  const from = todayISO();
  const to = addDaysISO(from, prefs.rangeDays);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    const qs = new URLSearchParams({
      from, to,
      incomeBasis: "both",
      customerDays: String(prefs.customerDays),
      supplierDays: String(prefs.supplierDays),
    });
    if (prefs.rmbRate && prefs.rmbRate > 0) qs.set("rmbRate", String(prefs.rmbRate));
    apiFetch(`/api/cashflow?${qs}`)
      .then((r) => r.json())
      .then((j) => { if (j?.error) setError(j.error); else setData(j.data as CashflowApiData); })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, [from, to, prefs.customerDays, prefs.supplierDays, prefs.rmbRate]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // ---- กรองตามแหล่งที่ผู้ใช้เปิดไว้ แล้วคำนวณเส้นเงินคงเหลือ ----
  const offSet = useMemo(() => new Set(prefs.off), [prefs.off]);
  const events = useMemo(
    () => (data?.events ?? []).filter((e) => !offSet.has(e.source)),
    [data, offSet],
  );

  const series = useMemo(
    () => buildDailySeries(events, data?.meta.openingBalance ?? 0, from, to),
    [events, data, from, to],
  );

  const rows: Row[] = useMemo(() => {
    let running = series.startBalance;
    const out: Row[] = [];
    for (const d of series.days) {
      for (const e of d.events) {
        running += e.direction === "in" ? e.amount : -e.amount;
        out.push({ ...e, balance: running });
      }
    }
    return out;
  }, [series]);

  const inTotal  = series.days.reduce((s, d) => s + d.in, 0);
  const outTotal = series.days.reduce((s, d) => s + d.out, 0);
  const endBalance = series.days.length ? series.days[series.days.length - 1].balance : series.startBalance;
  const negative = firstNegativeDay(series.days);
  const months = useMemo(() => totalsByMonth(series.days), [series.days]);

  // แยกเงินเข้า 2 มุม: วางบิลแล้ว (เกือบแน่นอน) กับ ใบขายยืนยันแล้ว (คาดการณ์)
  // นับเฉพาะที่ตกอยู่ในช่วงที่ดูอยู่ ให้ตรงกับตัวเลขใหญ่บนการ์ด (ของค้างจากอดีตแสดงแยกอีกแถบ)
  const inWindow = useMemo(() => series.days.flatMap((d) => d.events), [series.days]);
  const inBilling = inWindow.filter((e) => e.source === "billing_note").reduce((s, e) => s + e.amount, 0);
  const inSO = inWindow.filter((e) => e.source === "sales_order").reduce((s, e) => s + e.amount, 0);

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    {
      id: "date", accessorKey: "date", header: "วันที่", size: 110,
      cell: ({ row }) => (
        <span className={row.original.dateConfident ? "text-slate-700" : "text-slate-400 italic"}>
          {formatDate(row.original.date)}
          {!row.original.dateConfident && <span className="ml-1" title={row.original.dateNote}>~</span>}
        </span>
      ),
    },
    {
      id: "source", accessorKey: "source", header: "มาจาก", size: 130,
      cell: ({ row }) => {
        const meta = CASHFLOW_SOURCE[row.original.source];
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ color: meta.color, background: `${meta.color}18` }}>
            {meta.icon} {meta.label}
          </span>
        );
      },
    },
    { id: "ref", accessorKey: "ref", header: "เอกสาร", size: 170 },
    { id: "party", accessorKey: "party", header: "คู่ค้า / เจ้าหนี้", size: 220 },
    {
      id: "in", header: "เงินเข้า", size: 120,
      accessorFn: (r) => (r.direction === "in" ? r.amount : 0),
      cell: ({ row }) => row.original.direction === "in"
        ? <span className="tabular-nums font-medium text-emerald-600">{THB(row.original.amount)}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      id: "out", header: "เงินออก", size: 120,
      accessorFn: (r) => (r.direction === "out" ? r.amount : 0),
      cell: ({ row }) => row.original.direction === "out"
        ? <span className="tabular-nums font-medium text-rose-600">{THB(row.original.amount)}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      id: "balance", accessorKey: "balance", header: "เงินคงเหลือ", size: 130,
      cell: ({ row }) => (
        <span className={`tabular-nums font-semibold ${row.original.balance < 0 ? "text-red-600" : "text-slate-700"}`}>
          {THB(row.original.balance)}
        </span>
      ),
    },
    {
      id: "certainty", accessorKey: "certainty", header: "ความมั่นใจ", size: 110,
      cell: ({ row }) => {
        const c = CASHFLOW_CERTAINTY[row.original.certainty];
        return <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.badge}`} title={c.hint}>{c.label}</span>;
      },
    },
    {
      id: "note", accessorKey: "note", header: "หมายเหตุ", size: 260,
      cell: ({ row }) => (
        <span className="text-xs text-slate-500">{row.original.note || row.original.dateNote || "—"}</span>
      ),
    },
  ], []);

  if (permsReady && !canView) {
    return <PlaygroundShell><AccessDenied message="หน้ากระแสเงินสดเปิดให้เฉพาะผู้ที่มีสิทธิ์ดูข้อมูลการเงิน" /></PlaygroundShell>;
  }

  const warnings = data?.meta.warnings ?? [];

  return (
    <PlaygroundShell>
      {/* ---------- หัวหน้า ---------- */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">💧 กระแสเงินสด</h1>
            <p className="text-slate-500 mt-1 text-sm">
              เงินเข้า-เงินออกทั้งบริษัทในหน้าเดียว — รวมจากใบขาย ใบซื้อ เงินเดือน หนี้ และเงินจีน
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/receipts"
                  className="h-9 px-3.5 inline-flex items-center text-sm font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100">
              💵 รับชำระเงิน
            </Link>
            <Link href="/cashflow/credit-terms"
                  className="h-9 px-3.5 inline-flex items-center text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
              🗓️ ตั้งเครดิต
            </Link>
            <button onClick={() => setSettingsOpen(true)}
                    className="h-9 px-3.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
              ⚙️ ตั้งค่า
            </button>
            <button onClick={load} disabled={loading}
                    className="h-9 px-3.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? "กำลังโหลด…" : "🔄 โหลดใหม่"}
            </button>
          </div>
        </div>

        {/* ช่วงเวลา */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="text-xs text-slate-500">ดูล่วงหน้า</span>
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => savePrefs({ ...prefs, rangeDays: r.days })}
                    className={`h-8 px-3 text-sm rounded-lg border transition-colors ${
                      prefs.rangeDays === r.days
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {r.label}
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-1">{formatDate(from)} – {formatDate(to)}</span>
        </div>

        {/* เปิด/ปิดแหล่งเงิน */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-slate-500">นับแหล่งไหนบ้าง</span>
          {ALL_SOURCES.map((s) => {
            const meta = CASHFLOW_SOURCE[s];
            const on = !offSet.has(s);
            return (
              <button key={s}
                      onClick={() => savePrefs({ ...prefs, off: on ? [...prefs.off, s] : prefs.off.filter((x) => x !== s) })}
                      className={`h-8 px-3 text-xs rounded-full border transition-colors ${
                        on ? "text-white" : "bg-white text-slate-400 border-slate-200"}`}
                      style={on ? { background: meta.color, borderColor: meta.color } : undefined}>
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-600 font-medium">⚠️ {error}</p>
            <button onClick={load} className="mt-3 h-9 px-4 text-sm text-white bg-red-600 rounded-lg">ลองใหม่</button>
          </div>
        )}

        {loading && !data && <div className="text-center text-slate-400 py-16">กำลังรวมข้อมูลจากทุกแหล่ง…</div>}

        {data && (
          <>
            {/* ---------- เตือนเรื่องความแม่นของข้อมูล ---------- */}
            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                <button onClick={() => setShowWarnings((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50">
                  <span className="text-sm font-semibold text-amber-800">
                    ⚠️ ตัวเลขนี้ยังไม่แม่น 100% — มี {warnings.length} เรื่องที่ควรรู้
                  </span>
                  <span className="text-amber-500 text-xs">{showWarnings ? "ซ่อน ▲" : "ดู ▼"}</span>
                </button>
                {showWarnings && (
                  <ul className="px-4 pb-3 space-y-1.5">
                    {warnings.map((w) => (
                      <li key={w.code} className="text-sm text-amber-900 flex gap-2">
                        <span className="text-amber-400">•</span>
                        <span>
                          {w.message}
                          {w.href && <Link href={w.href} className="ml-1.5 underline text-amber-700 hover:text-amber-900">ไปแก้</Link>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ---------- การ์ดสรุป ---------- */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card label="เงินในบัญชีตอนนี้"
                    value={THB(data.meta.openingBalance)}
                    sub={data.meta.openingAsOf ? `ยอด ณ ${formatDate(data.meta.openingAsOf)}` : "ยังไม่ได้กรอก — กด ⚙️ ตั้งค่า"}
                    tone={data.meta.openingBalance > 0 ? "text-slate-900" : "text-slate-400"} />
              <Card label="เงินเข้าที่คาดว่าจะได้"
                    value={THB(inTotal)}
                    sub={`วางบิลแล้ว ${THB(inBilling)} · ใบขาย ${THB(inSO)}`}
                    tone="text-emerald-600" />
              <Card label="เงินที่ต้องจ่าย"
                    value={THB(outTotal)}
                    sub={`${series.days.reduce((s, d) => s + d.events.filter((e) => e.direction === "out").length, 0)} รายการ`}
                    tone="text-rose-600" />
              <Card label="เงินคงเหลือปลายช่วง"
                    value={THB(endBalance)}
                    sub={`สุทธิ ${inTotal - outTotal >= 0 ? "+" : ""}${THB(inTotal - outTotal)}`}
                    tone={endBalance < 0 ? "text-red-600" : "text-slate-900"} />
            </div>

            {/* ---------- เตือนวันเงินขาด ---------- */}
            {negative ? (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">🚨</span>
                <div className="min-w-0">
                  <p className="font-semibold text-red-700">
                    เงินจะไม่พอวันที่ {formatDate(negative.date)} — ติดลบ {THB(Math.abs(negative.balance))}
                  </p>
                  <p className="text-sm text-red-600/80 mt-0.5">
                    อีก {Math.max(0, Math.round((new Date(negative.date).getTime() - new Date(from).getTime()) / 86400000))} วันข้างหน้า ·
                    ควรเร่งเก็บเงินลูกค้า หรือเลื่อนจ่ายบางรายการ
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                ✅ ตามตัวเลขที่มีตอนนี้ เงินไม่ติดลบตลอดช่วง {formatDate(from)} – {formatDate(to)}
              </div>
            )}

            {/* ---------- ของค้างจากอดีต ---------- */}
            {(series.carriedIn > 0 || series.carriedOut > 0) && (
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 flex gap-4 flex-wrap items-center">
                <span className="font-medium text-slate-700">ของค้างจากก่อนวันนี้ (รวมเข้ายอดตั้งต้นแล้ว)</span>
                <span>ค้างรับ <b className="text-emerald-600 tabular-nums">{THB(series.carriedIn)}</b></span>
                <span>ค้างจ่าย <b className="text-rose-600 tabular-nums">{THB(series.carriedOut)}</b></span>
                <span className="text-slate-400">→ เริ่มกราฟที่ <b className="tabular-nums">{THB(series.startBalance)}</b></span>
              </div>
            )}

            {/* ---------- ตัดยอดจ่ายเงินกู้ให้ตรง ---------- */}
            <LoanReconcilePanel onDone={load} />

            {/* ---------- กราฟรายเดือน ---------- */}
            <MonthChart months={months} startBalance={series.startBalance} />

            {/* ---------- ตารางรายการ (ตารางกลาง) ---------- */}
            <DataTable<Row>
              data={rows}
              columns={columns}
              tableId="cashflow-events"
              title="รายการเงินเข้า-เงินออกทั้งหมด"
              description="เรียงตามวันที่ · คอลัมน์เงินคงเหลือคือยอดสะสมหลังรายการนั้น"
              loading={loading}
              emptyMessage="ไม่มีรายการเงินเข้า-ออกในช่วงนี้"
              searchPlaceholder="ค้นหาเลขเอกสาร / ชื่อคู่ค้า…"
              searchableKeys={["ref", "party", "note"]}
              exportFilename="cashflow"
              exportEntityType="cashflow"
              selectable
              pageSize={50}
              onRetry={load}
            />
          </>
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canManage={canManage}
        prefs={prefs}
        onPrefsChange={savePrefs}
        rmbRateSource={data?.meta.rmbRateSource ?? ""}
        rmbRateInUse={data?.meta.rmbRate ?? 0}
        onSaved={load}
      />
    </PlaygroundShell>
  );
}

// ============================================================
// ชิ้นส่วนย่อยของหน้านี้
// ============================================================

function Card({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1 truncate" title={sub}>{sub}</p>
    </div>
  );
}

/**
 * แผง "ตัดยอดจ่ายเงินกู้ให้ตรง"
 * โผล่เฉพาะเมื่อเจอสัญญาที่มีบันทึกการจ่ายอยู่ แต่ยังไม่ได้ตัดเข้างวดผ่อนเลย
 * (ของเก่าที่เข้าฐานข้อมูลมาโดยไม่ผ่านหน้าบันทึกจ่าย)
 */
function LoanReconcilePanel({ onDone }: { onDone: () => void }) {
  const canFix = usePermission("loan_payments.create");
  const [rows, setRows] = useState<LoanReconcileRow[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(() => {
    apiFetch("/api/cashflow/loan-reallocate")
      .then((r) => r.json())
      .then((j) => { if (!j?.error) setRows((j.data ?? []) as LoanReconcileRow[]); })
      .catch(() => { /* ไม่ต้องรบกวนผู้ใช้ — แผงนี้เป็นของเสริม */ });
  }, []);

  useEffect(load, [load]);

  const run = async () => {
    setRunning(true); setErr(null); setResult(null);
    try {
      const res = await apiFetch("/api/cashflow/loan-reallocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      const { done, skipped } = j.data as { done: number; skipped: number };
      setResult(`ตัดยอดให้ ${done} สัญญาแล้ว${skipped ? ` · ข้าม ${skipped} สัญญาที่ยังไม่มีตารางผ่อน` : ""}`);
      setConfirmOpen(false);
      load();
      onDone();
    } catch { setErr("ตัดยอดไม่สำเร็จ"); }
    finally { setRunning(false); }
  };

  if (!rows.length && !result) return null;

  const doable = rows.filter((r) => r.canReconcile);
  const totalPaid = doable.reduce((s, r) => s + r.paid_total, 0);

  return (
    <>
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3.5">
        {result && <p className="text-sm text-emerald-700 font-medium mb-2">✅ {result}</p>}
        {err && <p className="text-sm text-red-600 mb-2">⚠️ {err}</p>}

        {rows.length > 0 && (
          <>
            <div className="flex items-start gap-3 flex-wrap justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-violet-800 text-sm">
                  🏦 มีบันทึกการจ่ายเงินกู้ที่ยังไม่ได้ตัดเข้างวดผ่อน
                </p>
                <p className="text-sm text-violet-700/80 mt-0.5">
                  {rows.length} สัญญา · จ่ายไปแล้วรวม {THB(rows.reduce((s, r) => s + r.paid_total, 0))} —
                  ยอดหนี้ในหน้านี้จึงสูงเกินจริง
                </p>
              </div>
              {canFix && doable.length > 0 && (
                <button onClick={() => setConfirmOpen(true)} disabled={running}
                        className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap">
                  {running ? "กำลังตัดยอด…" : "ตัดยอดให้ตรง"}
                </button>
              )}
            </div>

            <ul className="mt-2.5 space-y-1">
              {rows.map((r) => (
                <li key={r.contract_id} className="text-xs text-violet-900/80 flex flex-wrap gap-x-2">
                  <span className="font-mono">{r.loan_code}</span>
                  <span>{r.loan_name}</span>
                  <span className="text-violet-500">· จ่ายแล้ว {r.payments} ครั้ง {THB(r.paid_total)}</span>
                  {!r.canReconcile && <span className="text-amber-700">· {r.reason}</span>}
                </li>
              ))}
            </ul>
            {!canFix && <p className="text-xs text-violet-500 mt-2">ต้องมีสิทธิ์ “บันทึกการจ่ายเงินกู้” ถึงจะกดตัดยอดได้</p>}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={run}
        loading={running}
        title="ตัดยอดจ่ายเข้างวดผ่อน?"
        message={
          <span>
            ระบบจะเอาเงินที่จ่ายไปแล้ว <b>{THB(totalPaid)}</b> ({doable.length} สัญญา) ไปตัดงวดผ่อนจากงวดเก่าสุดก่อน
            แล้วอัปเดตสถานะงวดเป็น “จ่ายแล้ว / จ่ายบางส่วน” ตามจริง
            <br /><br />
            การทำงานนี้ <b>คำนวณใหม่จากต้นทางทั้งหมด</b> กดกี่รอบผลก็เท่าเดิม ไม่ตัดซ้ำซ้อน
            และย้อนกลับได้ด้วยการแก้/ลบบันทึกการจ่าย
          </span>
        }
        confirmText="ตัดยอดเลย"
      />
    </>
  );
}

/** กราฟแท่งเงินเข้า-ออกรายเดือน + เส้นเงินคงเหลือ (วาดเองด้วย SVG ไม่ต้องพึ่งไลบรารีนอก) */
function MonthChart({
  months, startBalance,
}: { months: { month: string; in: number; out: number; net: number; endBalance: number }[]; startBalance: number }) {
  if (!months.length) return null;

  const W = 900, H = 240, PAD_L = 60, PAD_R = 20, PAD_T = 20, PAD_B = 34;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const slot = innerW / months.length;

  const balances = [startBalance, ...months.map((m) => m.endBalance)];
  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.in, m.out)));
  const maxVal = Math.max(maxBar, ...balances.map((b) => Math.abs(b)));
  const yZero = PAD_T + innerH / 2;
  const scale = (innerH / 2) / maxVal;
  const y = (v: number) => yZero - v * scale;

  const linePts = balances.map((b, i) => `${PAD_L + slot * i},${y(b)}`).join(" ");

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-700">ภาพรวมรายเดือน</h2>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> เงินเข้า</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> เงินออก</span>
          <span className="flex items-center gap-1"><i className="w-4 h-0.5 bg-blue-600 inline-block" /> เงินคงเหลือ</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ height: H }}>
          {/* เส้นศูนย์ */}
          <line x1={PAD_L} y1={yZero} x2={W - PAD_R} y2={yZero} stroke="#cbd5e1" strokeWidth="1" />
          <text x={PAD_L - 8} y={yZero + 4} textAnchor="end" fontSize="10" fill="#94a3b8">0</text>
          <text x={PAD_L - 8} y={y(maxVal) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{THBShort(maxVal)}</text>
          <text x={PAD_L - 8} y={y(-maxVal) + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{THBShort(-maxVal)}</text>

          {months.map((m, i) => {
            const cx = PAD_L + slot * i + slot / 2;
            const bw = Math.min(26, slot / 3);
            return (
              <g key={m.month}>
                <rect x={cx - bw - 2} y={y(m.in)} width={bw} height={Math.max(1, yZero - y(m.in))} fill="#10b981" rx="2">
                  <title>{`เงินเข้า ${monthLabelTH(m.month)} = ${THB(m.in)}`}</title>
                </rect>
                <rect x={cx + 2} y={yZero} width={bw} height={Math.max(1, y(-m.out) - yZero)} fill="#f43f5e" rx="2">
                  <title>{`เงินออก ${monthLabelTH(m.month)} = ${THB(m.out)}`}</title>
                </rect>
                <text x={cx} y={H - 12} textAnchor="middle" fontSize="11" fill="#64748b">{monthLabelTH(m.month)}</text>
              </g>
            );
          })}

          <polyline points={linePts} fill="none" stroke="#2563eb" strokeWidth="2" />
          {balances.map((b, i) => (
            <circle key={i} cx={PAD_L + slot * i} cy={y(b)} r="3.5" fill={b < 0 ? "#dc2626" : "#2563eb"}>
              <title>{`เงินคงเหลือ ${THB(b)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <p className="text-[11px] text-slate-400 mt-1">ชี้ที่แท่ง/จุดเพื่อดูตัวเลข · จุดสีแดง = เดือนที่เงินติดลบ</p>
    </div>
  );
}

/** ป๊อปอัปตั้งค่า: ยอดเงินในบัญชี + ค่าที่ใช้เดาวันจ่าย/วันรับเงิน */
function SettingsModal({
  open, onClose, canManage, prefs, onPrefsChange, rmbRateSource, rmbRateInUse, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  prefs: Prefs;
  onPrefsChange: (p: Prefs) => void;
  rmbRateSource: string;
  rmbRateInUse: number;
  onSaved: () => void;
}) {
  const [accounts, setAccounts] = useState<OpeningBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState(todayISO());
  const [deleteTarget, setDeleteTarget] = useState<OpeningBalance | null>(null);

  const loadAccounts = useCallback(() => {
    setLoading(true); setErr(null);
    apiFetch("/api/cashflow/opening-balances")
      .then((r) => r.json())
      .then((j) => { if (j?.error) setErr(j.error); else setAccounts((j.data ?? []) as OpeningBalance[]); })
      .catch(() => setErr("โหลดรายการบัญชีไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (open) loadAccounts(); }, [open, loadAccounts]);

  const add = async () => {
    if (!newLabel.trim()) { setErr("ต้องใส่ชื่อบัญชี"); return; }
    setSaving(true); setErr(null);
    try {
      const res = await apiFetch("/api/cashflow/opening-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), amount: Number(newAmount || 0), as_of_date: newDate }),
      });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      setNewLabel(""); setNewAmount("");
      loadAccounts(); onSaved();
    } catch { setErr("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const patch = async (id: string, changes: Record<string, unknown>) => {
    setErr(null);
    try {
      const res = await apiFetch("/api/cashflow/opening-balances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      loadAccounts(); onSaved();
    } catch { setErr("บันทึกไม่สำเร็จ"); }
  };

  const remove = async (row: OpeningBalance) => {
    setErr(null);
    try {
      const res = await apiFetch(`/api/cashflow/opening-balances?id=${row.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j?.error) { setErr(j.error); return; }
      setDeleteTarget(null);
      loadAccounts(); onSaved();
    } catch { setErr("ลบไม่สำเร็จ"); }
  };

  const total = accounts.reduce((s, a) => s + Number(a.amount || 0), 0);

  return (
    <>
      <ERPModal open={open} onClose={onClose} title="⚙️ ตั้งค่ากระแสเงินสด" size="lg" storageKey="cashflow-settings">
        <div className="space-y-6">
          {err && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{err}</div>}

          {/* ---- ยอดเงินในบัญชี ---- */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-800">💰 เงินในบัญชีตอนนี้</h3>
              <InfoHint>ระบบยังไม่ได้ต่อกับธนาคาร จึงต้องบอกก่อนว่าตอนนี้มีเงินอยู่เท่าไหร่ กราฟถึงจะบอกได้ว่าเงินจะพอไหม · ใส่ได้หลายบัญชี ระบบจะรวมยอดให้เอง</InfoHint>
            </div>
            <p className="text-xs text-slate-500 mb-3">อัปเดตเมื่อไหร่ก็ได้ — ยิ่งใส่ตรงกับยอดจริง กราฟยิ่งเชื่อถือได้</p>

            {loading && <p className="text-sm text-slate-400 py-2">กำลังโหลด…</p>}

            {!loading && accounts.length === 0 && (
              <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg py-4 text-center">
                ยังไม่มีบัญชี — เพิ่มด้านล่างได้เลย
              </p>
            )}

            {accounts.length > 0 && (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 flex-wrap">
                    <input
                      defaultValue={a.label} disabled={!canManage}
                      onBlur={(e) => e.target.value.trim() !== a.label && patch(a.id, { label: e.target.value.trim() })}
                      className="flex-1 min-w-[140px] h-8 px-2 text-sm border border-transparent hover:border-slate-200 focus:border-blue-400 rounded outline-none disabled:bg-transparent"
                    />
                    <div className="w-36">
                      <MoneyInput
                        value={a.amount} disabled={!canManage}
                        onChange={() => { /* บันทึกตอนออกจากช่อง */ }}
                        onBlur={(raw) => Number(raw || 0) !== Number(a.amount) && patch(a.id, { amount: Number(raw || 0) })}
                        className="w-full h-8 px-2 text-sm text-right border border-slate-200 rounded"
                      />
                    </div>
                    <div className="w-36">
                      <DateInput value={a.as_of_date} disabled={!canManage}
                                 onChange={(iso) => iso !== a.as_of_date && patch(a.id, { as_of_date: iso })} />
                    </div>
                    {canManage && (
                      <button onClick={() => setDeleteTarget(a)}
                              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="เอาบัญชีนี้ออก">
                        🗑
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 text-sm">
                  <span className="text-slate-500">รวมทุกบัญชี</span>
                  <span className="font-bold tabular-nums text-slate-800">{THB(total)}</span>
                </div>
              </div>
            )}

            {canManage && (
              <div className="flex items-end gap-2 mt-3 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-slate-500 mb-1">ชื่อบัญชี</label>
                  <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                         placeholder="เช่น กสิกร 123-4-56789"
                         className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400" />
                </div>
                <div className="w-36">
                  <label className="block text-xs text-slate-500 mb-1">ยอดคงเหลือ</label>
                  <MoneyInput value={newAmount} onChange={setNewAmount}
                              className="w-full h-9 px-2.5 text-sm text-right border border-slate-200 rounded-lg" />
                </div>
                <div className="w-36">
                  <label className="block text-xs text-slate-500 mb-1">ยอด ณ วันที่</label>
                  <DateInput value={newDate} onChange={setNewDate} />
                </div>
                <button onClick={add} disabled={saving}
                        className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "กำลังเพิ่ม…" : "+ เพิ่มบัญชี"}
                </button>
              </div>
            )}
            {!canManage && <p className="text-xs text-slate-400 mt-2">คุณดูได้อย่างเดียว — การแก้ยอดเงินต้องมีสิทธิ์ “ตั้งค่ายอดเงินตั้งต้น”</p>}
          </section>

          {/* ---- ค่าที่ใช้เดา ---- */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-800">🔮 ค่าที่ใช้เดา (เมื่อข้อมูลจริงยังไม่ครบ)</h3>
              <InfoHint>ใช้เฉพาะกับเอกสารที่ยังไม่ได้ตั้งเครดิต — ถ้าตั้งเครดิตรายลูกค้า/รายร้านไว้แล้ว ระบบจะใช้ของจริงเสมอ · ค่านี้จำไว้เฉพาะเครื่องของคุณ</InfoHint>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mt-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">ลูกค้าจ่ายภายในกี่วัน</label>
                <input type="number" min={0} value={prefs.customerDays}
                       onChange={(e) => onPrefsChange({ ...prefs, customerDays: Math.max(0, Number(e.target.value) || 0) })}
                       className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">เราจ่ายร้านค้าภายในกี่วัน</label>
                <input type="number" min={0} value={prefs.supplierDays}
                       onChange={(e) => onPrefsChange({ ...prefs, supplierDays: Math.max(0, Number(e.target.value) || 0) })}
                       className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">เรตเงินหยวน (บาท/หยวน)</label>
                <input type="number" min={0} step="0.001" value={prefs.rmbRate ?? ""}
                       placeholder={String(rmbRateInUse || "")}
                       onChange={(e) => onPrefsChange({ ...prefs, rmbRate: e.target.value === "" ? null : Number(e.target.value) })}
                       className="w-full h-9 px-2.5 text-sm border border-slate-200 rounded-lg" />
                <p className="text-[11px] text-slate-400 mt-1">ตอนนี้ใช้ {rmbRateInUse} — {rmbRateSource}</p>
              </div>
            </div>
          </section>
        </div>
      </ERPModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove(deleteTarget)}
        title="เอาบัญชีนี้ออกจากการคำนวณ?"
        message={deleteTarget ? `“${deleteTarget.label}” (${THB(Number(deleteTarget.amount || 0))}) จะไม่ถูกนับเป็นเงินตั้งต้นอีก — ข้อมูลเก่ายังเก็บไว้ในประวัติ` : ""}
        confirmText="เอาออก"
        variant="danger"
      />
    </>
  );
}
