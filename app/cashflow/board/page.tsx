"use client";

/**
 * 🧲 กระดานเงินสด (Cash Board)
 * URL: /cashflow/board
 *
 * เส้นเวลาแนวนอน 1 เส้น = ทุกอย่างที่เกี่ยวกับเงิน
 *  - 1 คอลัมน์ = 1 วัน · วันที่มีรายการจะกว้าง วันว่างหุบเหลือแถบบาง (กระดานยาวหลายเดือนได้โดยไม่ต้องเลื่อนจนเมื่อย)
 *  - การ์ด = 1 ใบเอกสาร · ลากไปวันอื่น = ลองเลื่อนวันจ่าย/วันรับเงิน
 *  - เส้นน้ำเงิน = เงินคงเหลือ · ช่องแดง = วันที่เงินติดลบ
 *  - กด "ยืนยัน" ถึงจะเขียนวันใหม่ลงเอกสารจริง (ลากเล่นก่อนได้ ไม่กระทบข้อมูล)
 *
 * ใช้ข้อมูลชุดเดียวกับหน้า /cashflow (API /api/cashflow) และสูตรจาก lib/cashflow.ts
 * ห้ามคำนวณยอด/เส้นเงินคงเหลือซ้ำในไฟล์นี้
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog } from "@/components/modal";
import { InfoHint } from "@/components/info-hint";
import { usePermission, AccessDenied, useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import {
  CASHFLOW_SOURCE, THB, addDaysISO, buildDailySeries, parseISO, toISO, todayISO,
  type CashflowEvent, type CashflowSource,
} from "@/lib/cashflow";
import type { CashflowApiData } from "@/app/api/cashflow/route";
import type { PlanResult } from "@/app/api/cashflow/plan/route";

const RANGES = [
  { days: 45,  label: "6 สัปดาห์" },
  { days: 90,  label: "3 เดือน" },
  { days: 180, label: "6 เดือน" },
];
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const shortTHB = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(2)}ล`;
  if (a >= 1_000) return `${s}${Math.round(a / 1_000)}k`;
  return `${s}${Math.round(a)}`;
};
const thaiShortDate = (iso: string) => {
  const d = parseISO(iso);
  return `${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}`;
};

export default function CashBoardPage() {
  const canView = usePermission("cashflow.view");
  const canManage = usePermission("cashflow.manage");
  const { permsReady } = useAuth();

  const [rangeDays, setRangeDays] = useState(90);
  const [data, setData] = useState<CashflowApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** วันใหม่ที่ยังไม่ได้ยืนยัน — key = id ของ event */
  const [pending, setPending] = useState<Record<string, string>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const from = todayISO();
  const to = addDaysISO(from, rangeDays);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    apiFetch(`/api/cashflow?from=${from}&to=${to}&incomeBasis=both`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.error) setError(j.error);
        else { setData(j.data as CashflowApiData); setPending({}); }
      })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  // ---- วันที่ที่ใช้จริงบนกระดาน (รวมที่ลากค้างไว้) ----
  const events: CashflowEvent[] = useMemo(
    () => (data?.events ?? []).map((e) => (pending[e.id] ? { ...e, date: pending[e.id] } : e)),
    [data, pending],
  );

  const opening = data?.meta.openingBalance ?? 0;
  const series = useMemo(() => buildDailySeries(events, opening, from, to), [events, opening, from, to]);
  const baseSeries = useMemo(
    () => buildDailySeries(data?.events ?? [], opening, from, to),
    [data, opening, from, to],
  );

  const stats = useMemo(() => summarize(series.days, series.startBalance), [series]);
  const baseStats = useMemo(() => summarize(baseSeries.days, baseSeries.startBalance), [baseSeries]);

  // ---- คอลัมน์รายวันทั้งช่วง ----
  const days = useMemo(() => {
    const out: string[] = [];
    for (const d = parseISO(from); d <= parseISO(to); d.setUTCDate(d.getUTCDate() + 1)) out.push(toISO(d));
    return out;
  }, [from, to]);

  const byDay = useMemo(() => {
    const m = new Map<string, CashflowEvent[]>();
    for (const e of events) {
      if (e.date < from || e.date > to) continue;
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    for (const list of m.values()) list.sort((a, b) => b.amount - a.amount);
    return m;
  }, [events, from, to]);

  const balanceByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of series.days) m.set(d.date, d.balance);
    return m;
  }, [series]);

  /** เงินคงเหลือของทุกวัน (วันที่ไม่มีรายการ = เท่ากับวันก่อนหน้า) — ใช้วาดเส้น */
  const levelByDay = useMemo(() => {
    const out: { date: string; bal: number }[] = [];
    let run = series.startBalance;
    for (const day of days) {
      if (balanceByDay.has(day)) run = balanceByDay.get(day)!;
      out.push({ date: day, bal: run });
    }
    return out;
  }, [days, balanceByDay, series.startBalance]);

  const pendingList = Object.keys(pending);
  const movedEvents = useMemo(
    () => (data?.events ?? []).filter((e) => pending[e.id] && pending[e.id] !== e.date),
    [data, pending],
  );

  const drop = (day: string) => {
    setOverDay(null);
    if (!dragId) return;
    const src = (data?.events ?? []).find((e) => e.id === dragId);
    setDragId(null);
    if (!src || !src.movable) return;
    setPending((p) => {
      const next = { ...p };
      if (day === src.date) delete next[src.id];
      else next[src.id] = day;
      return next;
    });
  };

  const confirmMoves = async () => {
    setSaving(true); setError(null); setSaveMsg(null);
    try {
      const res = await apiFetch("/api/cashflow/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moves: movedEvents.map((e) => ({ source: e.source, docId: e.docId, date: pending[e.id] })),
        }),
      });
      const j = await res.json();
      if (j?.error) { setError(j.error); return; }
      const r = j.data as PlanResult;
      setSaveMsg(`บันทึกวันใหม่แล้ว ${r.moved} ใบ${r.failed.length ? ` · ไม่สำเร็จ ${r.failed.length} ใบ` : ""}`);
      setConfirmOpen(false);
      load();
    } catch { setError("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (permsReady && !canView) {
    return <PlaygroundShell><AccessDenied message="กระดานเงินสดเปิดให้เฉพาะผู้ที่มีสิทธิ์ดูข้อมูลการเงิน" /></PlaygroundShell>;
  }

  return (
    <PlaygroundShell>
      {/* ── หัวกระดาน ─────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🧲 กระดานเงินสด</h1>
            <p className="text-slate-500 mt-1 text-sm max-w-2xl">
              ทุกใบที่ต้องจ่ายและทุกก้อนที่จะได้รับ วางบนเส้นเวลาเดียวกัน —{" "}
              <b className="text-slate-700">ลากการ์ดไปวันอื่นเพื่อลองดูว่าเงินจะพอไหม</b> แล้วค่อยกดยืนยัน
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/cashflow"
                  className="h-9 px-3.5 inline-flex items-center text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
              📊 มุมมองตาราง
            </Link>
            <button onClick={load} disabled={loading}
                    className="h-9 px-3.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
              {loading ? "กำลังโหลด…" : "🔄 โหลดใหม่"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-slate-500">ดูล่วงหน้า</span>
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setRangeDays(r.days)}
                    className={`h-8 px-3 text-sm rounded-lg border transition-colors ${
                      rangeDays === r.days
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {r.label}
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-1">{formatDate(from)} – {formatDate(to)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[264px_minmax(0,1fr)] min-h-[70vh]">
        {/* ── รางซ้าย ───────────────────────────────────── */}
        <aside className="bg-white border-b xl:border-b-0 xl:border-r border-slate-200 p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] tracking-wider uppercase text-slate-400">สรุปช่วงนี้</p>
            <Stat label="เงินเข้า" value={THB(stats.in)} tone="text-emerald-600" />
            <Stat label="เงินออก" value={THB(stats.out)} tone="text-rose-600" />
            <Stat label="เงินเหลือน้อยสุด" value={THB(stats.low)} sub={stats.lowDay ? `วันที่ ${thaiShortDate(stats.lowDay)}` : ""}
                  tone={stats.low < 0 ? "text-red-600" : "text-slate-900"} box={stats.low < 0 ? "warn" : "good"} />
            <Stat label="วันที่เงินติดลบ" value={`${stats.red} วัน`}
                  sub={stats.redFirst ? `เริ่มติดลบ ${thaiShortDate(stats.redFirst)}` : "เงินพอตลอดช่วง"}
                  tone={stats.red ? "text-red-600" : "text-emerald-600"} box={stats.red ? "warn" : "good"} />
          </div>

          {movedEvents.length > 0 && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3">
              <p className="text-[11px] tracking-wider uppercase text-blue-500">ผลของการเลื่อน</p>
              <p className="text-xl font-bold tabular-nums text-blue-800 mt-1">
                {baseStats.red} → {stats.red} วัน
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                เงินเหลือน้อยสุด {stats.low - baseStats.low >= 0 ? "+" : ""}{THB(stats.low - baseStats.low)}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {movedEvents.length} ใบถูกเลื่อน ·{" "}
                {stats.red < baseStats.red ? `ดีขึ้น ${baseStats.red - stats.red} วัน`
                  : stats.red > baseStats.red ? `แย่ลง ${stats.red - baseStats.red} วัน`
                  : "ยังไม่ช่วย ลองเลื่อนใบที่ยอดใหญ่กว่านี้"}
              </p>
              <div className="flex gap-2 mt-2.5">
                <button onClick={() => setPending({})}
                        className="h-8 px-3 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                  คืนค่าเดิม
                </button>
                {canManage && (
                  <button onClick={() => setConfirmOpen(true)}
                          className="h-8 px-3 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    ยืนยัน {movedEvents.length} ใบ
                  </button>
                )}
              </div>
              {!canManage && <p className="text-[11px] text-blue-500 mt-2">ลากดูได้ แต่ต้องมีสิทธิ์ “ตั้งค่ายอดเงินตั้งต้น” ถึงจะบันทึกวันใหม่ได้</p>}
            </div>
          )}

          <div className="space-y-1.5 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <p className="text-[11px] tracking-wider uppercase text-slate-400 mb-1.5">อ่านกระดาน</p>
            <LegendRow color="bg-emerald-500" text="เงินเข้า — ใบวางบิล / ใบขาย" />
            <LegendRow color="bg-rose-500" text="เงินออก — ใบซื้อ / เงินจีน" />
            <LegendRow color="bg-violet-500" text="🔒 เลื่อนไม่ได้ — งวดผ่อน / เงินเดือน" />
            <div className="flex items-center gap-2"><span className="w-4 border-t-2 border-blue-600 shrink-0" /> เส้นเงินคงเหลือ</div>
            <LegendRow color="bg-red-400" text="ช่องแดง = เงินติดลบวันนั้น" />
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            <p className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              ใช้ยังไง
              <InfoHint>การลากยังไม่บันทึกอะไรจนกว่าจะกดปุ่มยืนยัน · กดคืนค่าเดิมเพื่อล้างที่ลองไว้</InfoHint>
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>หาช่องแดง — วันนั้นเงินจะไม่พอ</li>
              <li>ลากใบซื้อที่เลื่อนได้ไปหลังวันที่เงินเข้า</li>
              <li>ดูตัวเลข “วันที่เงินติดลบ” ว่าลดลงไหม</li>
              <li>พอใจแล้วกดยืนยัน ระบบจะอัปเดตวันครบกำหนดให้</li>
            </ol>
          </div>

          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
            เงินตั้งต้น <b className="text-slate-600 tabular-nums">{THB(opening)}</b>
            {" · "}<Link href="/cashflow" className="text-blue-600 underline">แก้ที่หน้ากระแสเงินสด</Link>
          </p>
        </aside>

        {/* ── กระดาน ────────────────────────────────────── */}
        <div className="min-w-0">
          {error && (
            <div className="m-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3">
              <span>⚠️ {error}</span>
              <button onClick={load} className="h-8 px-3 text-white bg-red-600 rounded-lg">ลองใหม่</button>
            </div>
          )}
          {saveMsg && (
            <div className="m-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-700">✅ {saveMsg}</div>
          )}
          {loading && !data && <div className="text-center text-slate-400 py-24">กำลังจัดของขึ้นกระดาน…</div>}

          {data && (
            <Board
              days={days} byDay={byDay} levelByDay={levelByDay} balanceByDay={balanceByDay}
              today={from} dragId={dragId} overDay={overDay} pending={pending}
              originalDate={(id) => (data.events.find((e) => e.id === id)?.date ?? "")}
              onDragStart={setDragId} onDragEnd={() => { setDragId(null); setOverDay(null); }}
              onOver={setOverDay} onDrop={drop}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmMoves}
        loading={saving}
        title={`ยืนยันเลื่อนวัน ${movedEvents.length} ใบ?`}
        message={
          <div className="space-y-2">
            <p>ระบบจะเขียนวันใหม่ลงเอกสารจริง — หน้าอื่นที่ใช้วันครบกำหนดจะเห็นค่าใหม่ตามไปด้วย</p>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
              {movedEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0 truncate">
                    <span className="text-slate-400 mr-1.5">{CASHFLOW_SOURCE[e.source].icon}</span>
                    {e.ref}
                  </span>
                  <span className="whitespace-nowrap text-xs">
                    <span className="text-slate-400 line-through">{thaiShortDate(e.date)}</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-medium text-blue-700">{thaiShortDate(pending[e.id])}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">ทุกใบจะถูกบันทึกลงประวัติว่าใครเลื่อนจากวันไหนไปวันไหน</p>
          </div>
        }
        confirmText="ยืนยันเลื่อนวัน"
      />
    </PlaygroundShell>
  );
}

// ============================================================
// ชิ้นส่วนย่อย
// ============================================================

function summarize(days: { date: string; in: number; out: number; balance: number }[], start: number) {
  let inAmt = 0, outAmt = 0, low = start, lowDay: string | null = null, red = 0;
  let redFirst: string | null = null;
  for (const d of days) {
    inAmt += d.in; outAmt += d.out;
    if (d.balance < low) { low = d.balance; lowDay = d.date; }
    if (d.balance < 0) { red += 1; if (!redFirst) redFirst = d.date; }
  }
  return { in: inAmt, out: outAmt, low, lowDay, red, redFirst };
}

function Stat({ label, value, sub, tone, box }: {
  label: string; value: string; sub?: string; tone: string; box?: "warn" | "good";
}) {
  const border = box === "warn" ? "border-red-300 bg-red-50" : box === "good" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-lg border p-2.5 ${border}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const LegendRow = ({ color, text }: { color: string; text: string }) => (
  <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${color}`} />{text}</div>
);

function Board({
  days, byDay, levelByDay, balanceByDay, today, dragId, overDay, pending, originalDate,
  onDragStart, onDragEnd, onOver, onDrop,
}: {
  days: string[];
  byDay: Map<string, CashflowEvent[]>;
  levelByDay: { date: string; bal: number }[];
  balanceByDay: Map<string, number>;
  today: string;
  dragId: string | null;
  overDay: string | null;
  pending: Record<string, string>;
  originalDate: (id: string) => string;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOver: (day: string | null) => void;
  onDrop: (day: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [path, setPath] = useState<{ line: string; area: string; zeroY: number; w: number; h: number } | null>(null);

  // วาดเส้นเงินคงเหลือหลัง layout จริงเสมอ (คอลัมน์กว้างไม่เท่ากัน ต้องวัดเอา)
  const draw = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const w = el.scrollWidth, h = el.clientHeight;
    if (!w || !h || !levelByDay.length) return;

    const top = 58, bottom = h - 16, span = Math.max(40, bottom - top);
    const vals = levelByDay.map((p) => p.bal).concat([0]);
    const max = Math.max(...vals), min = Math.min(...vals);
    const range = max - min || 1;
    const y = (v: number) => top + span * (1 - (v - min) / range);

    let x = 0;
    const pts: [number, number][] = [];
    for (const p of levelByDay) {
      const cw = colRefs.current[p.date]?.offsetWidth ?? 0;
      pts.push([x + cw / 2, y(p.bal)]);
      x += cw;
    }
    if (!pts.length) return;
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const zeroY = y(0);
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${zeroY.toFixed(1)} L${pts[0][0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
    setPath({ line, area, zeroY, w, h });
  }, [levelByDay]);

  useLayoutEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const t1 = setTimeout(draw, 80), t2 = setTimeout(draw, 400);
    window.addEventListener("resize", draw);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", draw); };
  }, [draw]);

  return (
    <div className="overflow-x-auto">
      <div ref={boardRef} className={`relative flex items-stretch min-h-[560px] pb-4 ${dragId ? "is-dragging" : ""}`}>
        {path && (
          <svg className="absolute inset-0 pointer-events-none z-0" width={path.w} height={path.h}
               viewBox={`0 0 ${path.w} ${path.h}`} aria-hidden="true">
            <line x1="0" y1={path.zeroY} x2={path.w} y2={path.zeroY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 4" opacity=".7" />
            <path d={path.area} fill="rgba(37,99,235,.08)" />
            <path d={path.line} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
            <text x="6" y={path.zeroY - 5} fontSize="10" fill="#94a3b8">฿0</text>
          </svg>
        )}

        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const busy = list.length > 0;
          const bal = balanceByDay.get(day);
          const flood = (levelByDay.find((p) => p.date === day)?.bal ?? 0) < 0;
          const dow = parseISO(day).getUTCDay();
          const width = busy ? "w-[210px]" : dragId ? "w-[76px]" : "w-[26px]";

          return (
            <div
              key={day}
              ref={(el) => { colRefs.current[day] = el; }}
              data-day={day}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); onOver(day); } }}
              onDragLeave={() => onOver(null)}
              onDrop={(e) => { e.preventDefault(); onDrop(day); }}
              className={`relative z-10 shrink-0 flex flex-col border-r border-slate-200 transition-[width,background-color] duration-150 ${width}
                ${flood ? "bg-red-50/70" : dow === 0 || dow === 6 ? "bg-slate-50/60" : ""}
                ${overDay === day ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""}
                ${day === today ? "shadow-[inset_2px_0_0_#059669]" : ""}`}
            >
              <div className="sticky top-0 z-20 px-2 py-1.5 border-b border-slate-200 bg-white/85 backdrop-blur">
                <div className={`font-semibold tabular-nums leading-tight ${busy ? "text-[15px]" : "text-[13px] text-center"}`}>
                  {parseISO(day).getUTCDate()}
                </div>
                {busy && <div className="text-[10px] text-slate-400">{TH_DOW[dow]}</div>}
                {busy && bal !== undefined && (
                  <div className={`text-[11px] tabular-nums mt-0.5 ${flood ? "text-red-600 font-semibold" : "text-blue-700"}`}>
                    {shortTHB(bal)}
                  </div>
                )}
              </div>

              <div className={`flex-1 flex flex-col gap-1.5 ${busy ? "p-1.5" : "p-1"}`}>
                {list.map((e) => (
                  <Card key={e.id} ev={e} dragging={dragId === e.id}
                        movedFrom={pending[e.id] ? originalDate(e.id) : null}
                        onDragStart={onDragStart} onDragEnd={onDragEnd} />
                ))}
                {!busy && <span className="mx-auto mt-1 w-1.5 h-1.5 rounded-full bg-slate-300" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ ev, dragging, movedFrom, onDragStart, onDragEnd }: {
  ev: CashflowEvent; dragging: boolean; movedFrom: string | null;
  onDragStart: (id: string) => void; onDragEnd: () => void;
}) {
  const meta = CASHFLOW_SOURCE[ev.source as CashflowSource];
  const locked = !ev.movable;
  const edge = locked ? "border-l-violet-500" : ev.direction === "in" ? "border-l-emerald-500" : "border-l-rose-500";
  return (
    <div
      draggable={!locked}
      onDragStart={(e) => {
        if (locked) { e.preventDefault(); return; }
        onDragStart(ev.id);
        try { e.dataTransfer.setData("text/plain", ev.id); e.dataTransfer.effectAllowed = "move"; } catch { /* บางเบราว์เซอร์ไม่ยอมให้ตั้ง */ }
      }}
      onDragEnd={onDragEnd}
      title={locked
        ? `${meta.label} — เลื่อนไม่ได้ ธนาคาร/พนักงานรอไม่ได้`
        : `ลากไปวันอื่นเพื่อเลื่อน${movedFrom ? ` · เดิมคือ ${thaiShortDate(movedFrom)}` : ""}`}
      className={`rounded-lg border border-l-[3px] border-slate-200 bg-white p-1.5 shadow-sm select-none ${edge}
        ${locked ? "cursor-not-allowed bg-slate-50" : "cursor-grab active:cursor-grabbing hover:shadow-md"}
        ${dragging ? "opacity-40" : ""} ${movedFrom ? "border-dashed ring-2 ring-blue-200" : ""}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[9.5px] px-1.5 py-px rounded-full whitespace-nowrap ${
          locked ? "bg-violet-100 text-violet-700"
            : ev.direction === "in" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {locked ? "🔒 " : ""}{meta.label}
        </span>
        <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${
          ev.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>
          {ev.direction === "in" ? "+" : "−"}{THB(ev.amount)}
        </span>
      </div>
      <p className="text-[11.5px] text-slate-700 mt-0.5 line-clamp-2 leading-snug">{ev.party}</p>
      <p className="text-[10px] text-slate-400 mt-px">
        {ev.ref}{movedFrom && <span className="text-blue-600"> · เลื่อนจาก {thaiShortDate(movedFrom)}</span>}
      </p>
    </div>
  );
}
