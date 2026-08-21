"use client";

/**
 * 🧲 กระดานเงินสด (Cash Board)
 * URL: /cashflow/board
 *
 * เส้นเวลาแนวนอน 1 เส้น = ทุกอย่างที่เกี่ยวกับเงิน
 *  - 1 คอลัมน์ = 1 วัน · วันที่มีรายการกว้าง วันว่างหุบ (ขยายเองตอนลาก)
 *  - การ์ด = 1 ใบเอกสาร · ลากไปวันอื่น = ลองเลื่อนวันจ่าย/วันรับเงิน
 *  - เลือกหลายใบแล้วลากทีเดียวได้ · รวมการ์ดของร้านเดียวกันได้
 *  - แปะโน้ตบนวันได้ (เรื่องที่ไม่ใช่ตัวเลข เช่น "คุยกับร้านแล้ว เลื่อนได้")
 *  - เส้นน้ำเงิน = เงินคงเหลือ · ช่องแดง = วันที่เงินติดลบ
 *  - กด "ยืนยัน" ถึงจะเขียนวันใหม่ลงเอกสารจริง
 *
 * ใช้ข้อมูลชุดเดียวกับหน้า /cashflow (API /api/cashflow) และสูตรจาก lib/cashflow.ts
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { InfoHint } from "@/components/info-hint";
import { usePermission, AccessDenied, useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/date";
import {
  CASHFLOW_SOURCE, THB, addDaysISO, buildDailySeries, formatDayMonthTH, parseISO, toISO, todayISO,
  type CashflowEvent, type CashflowSource,
} from "@/lib/cashflow";
import type { CashflowApiData } from "@/app/api/cashflow/route";
import type { PlanResult } from "@/app/api/cashflow/plan/route";
import type { BoardNote } from "@/app/api/cashflow/notes/route";

const RANGES = [
  { days: 45,  label: "6 สัปดาห์" },
  { days: 90,  label: "3 เดือน" },
  { days: 180, label: "6 เดือน" },
];
const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** สีโน้ต — ชื่อสีเก็บใน DB, คลาสอยู่ที่นี่ที่เดียว */
const NOTE_COLORS: Record<string, { chip: string; card: string; label: string }> = {
  yellow: { chip: "bg-amber-300",   card: "bg-amber-50 border-amber-300 text-amber-900",     label: "เหลือง" },
  blue:   { chip: "bg-sky-300",     card: "bg-sky-50 border-sky-300 text-sky-900",           label: "ฟ้า" },
  pink:   { chip: "bg-pink-300",    card: "bg-pink-50 border-pink-300 text-pink-900",        label: "ชมพู" },
  green:  { chip: "bg-emerald-300", card: "bg-emerald-50 border-emerald-300 text-emerald-900", label: "เขียว" },
};

const shortTHB = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(2)}ล`;
  if (a >= 1_000) return `${s}${Math.round(a / 1_000)}k`;
  return `${s}${Math.round(a)}`;
};

/** การ์ด 1 ใบ หรือกองที่รวมของร้านเดียวกันไว้ */
type BoardCard =
  | { kind: "single"; key: string; ev: CashflowEvent }
  | { kind: "group"; key: string; party: string; events: CashflowEvent[]; total: number; direction: "in" | "out"; movable: boolean };

export default function CashBoardPage() {
  const canView = usePermission("cashflow.view");
  const canManage = usePermission("cashflow.manage");
  const { permsReady } = useAuth();

  const [rangeDays, setRangeDays] = useState(90);
  const [data, setData] = useState<CashflowApiData | null>(null);
  const [notes, setNotes] = useState<BoardNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  /** วันใหม่ที่ยังไม่ได้ยืนยัน — key = id ของ event */
  const [pending, setPending] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupByParty, setGroupByParty] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteEdit, setNoteEdit] = useState<Partial<BoardNote> & { note_date: string } | null>(null);

  const from = todayISO();
  const to = addDaysISO(from, rangeDays);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([
      apiFetch(`/api/cashflow?from=${from}&to=${to}&incomeBasis=both`).then((r) => r.json()),
      apiFetch(`/api/cashflow/notes?from=${from}&to=${to}`).then((r) => r.json()),
    ])
      .then(([cf, nt]) => {
        if (cf?.error) setError(cf.error);
        else { setData(cf.data as CashflowApiData); setPending({}); setSelected(new Set()); }
        if (!nt?.error) setNotes((nt.data ?? []) as BoardNote[]);
      })
      .catch(() => setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const events: CashflowEvent[] = useMemo(
    () => (data?.events ?? []).map((e) => (pending[e.id] ? { ...e, date: pending[e.id] } : e)),
    [data, pending],
  );

  const opening = data?.meta.openingBalance ?? 0;
  const series = useMemo(() => buildDailySeries(events, opening, from, to), [events, opening, from, to]);
  const baseSeries = useMemo(() => buildDailySeries(data?.events ?? [], opening, from, to), [data, opening, from, to]);
  const stats = useMemo(() => summarize(series.days, series.startBalance), [series]);
  const baseStats = useMemo(() => summarize(baseSeries.days, baseSeries.startBalance), [baseSeries]);

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

  /** แปลงรายการของแต่ละวันเป็นการ์ด — รวมกองตามร้านถ้าเปิดโหมดรวม */
  const cardsByDay = useMemo(() => {
    const m = new Map<string, BoardCard[]>();
    for (const [day, list] of byDay) {
      if (!groupByParty) {
        m.set(day, list.map((ev) => ({ kind: "single" as const, key: ev.id, ev })));
        continue;
      }
      const buckets = new Map<string, CashflowEvent[]>();
      for (const ev of list) {
        const k = `${ev.direction}|${ev.party}`;
        buckets.set(k, [...(buckets.get(k) ?? []), ev]);
      }
      const cards: BoardCard[] = [];
      for (const [k, evs] of buckets) {
        if (evs.length === 1) { cards.push({ kind: "single", key: evs[0].id, ev: evs[0] }); continue; }
        cards.push({
          kind: "group", key: `${day}|${k}`, party: evs[0].party, events: evs,
          total: evs.reduce((s, e) => s + e.amount, 0),
          direction: evs[0].direction,
          movable: evs.every((e) => e.movable),
        });
      }
      cards.sort((a, b) => (b.kind === "group" ? b.total : b.ev.amount) - (a.kind === "group" ? a.total : a.ev.amount));
      m.set(day, cards);
    }
    return m;
  }, [byDay, groupByParty]);

  const balanceByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of series.days) m.set(d.date, d.balance);
    return m;
  }, [series]);

  const levelByDay = useMemo(() => {
    const out: { date: string; bal: number }[] = [];
    let run = series.startBalance;
    for (const day of days) {
      if (balanceByDay.has(day)) run = balanceByDay.get(day)!;
      out.push({ date: day, bal: run });
    }
    return out;
  }, [days, balanceByDay, series.startBalance]);

  const notesByDay = useMemo(() => {
    const m = new Map<string, BoardNote[]>();
    for (const n of notes) m.set(n.note_date, [...(m.get(n.note_date) ?? []), n]);
    return m;
  }, [notes]);

  const movedEvents = useMemo(
    () => (data?.events ?? []).filter((e) => pending[e.id] && pending[e.id] !== e.date),
    [data, pending],
  );

  // ---- เลือก / ลาก ----
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectDay = (day: string) => {
    const ids = (byDay.get(day) ?? []).filter((e) => e.movable).map((e) => e.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      for (const id of ids) { if (allIn) next.delete(id); else next.add(id); }
      return next;
    });
  };

  const startDrag = (ids: string[]) => {
    // ลากใบที่อยู่ในชุดที่เลือกไว้ = ลากทั้งชุด · ลากใบนอกชุด = ลากเฉพาะใบนั้น
    const inSelection = ids.some((id) => selected.has(id));
    const all = inSelection ? [...new Set([...ids, ...selected])] : ids;
    setDragIds(all.filter((id) => events.find((e) => e.id === id)?.movable));
  };

  const drop = (day: string) => {
    setOverDay(null);
    const ids = dragIds;
    setDragIds(null);
    if (!ids?.length) return;
    setPending((p) => {
      const next = { ...p };
      for (const id of ids) {
        const src = (data?.events ?? []).find((e) => e.id === id);
        if (!src?.movable) continue;
        if (day === src.date) delete next[id];
        else next[id] = day;
      }
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

  // ---- โน้ต ----
  const saveNote = async () => {
    if (!noteEdit) return;
    const body = (noteEdit.body ?? "").trim();
    if (!body) return;
    setSaving(true); setError(null);
    try {
      const res = await apiFetch("/api/cashflow/notes", {
        method: noteEdit.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: noteEdit.id, note_date: noteEdit.note_date, body, color: noteEdit.color ?? "yellow" }),
      });
      const j = await res.json();
      if (j?.error) { setError(j.error); return; }
      setNoteEdit(null);
      load();
    } catch { setError("บันทึกโน้ตไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const deleteNote = async () => {
    if (!noteEdit?.id) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/cashflow/notes?id=${noteEdit.id}`, { method: "DELETE" });
      const j = await res.json();
      if (j?.error) { setError(j.error); return; }
      setNoteEdit(null);
      load();
    } catch { setError("ลอกโน้ตไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  if (permsReady && !canView) {
    return <PlaygroundShell><AccessDenied message="กระดานเงินสดเปิดให้เฉพาะผู้ที่มีสิทธิ์ดูข้อมูลการเงิน" /></PlaygroundShell>;
  }

  return (
    <PlaygroundShell>
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
                      rangeDays === r.days ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {r.label}
            </button>
          ))}
          <span className="text-xs text-slate-400 mr-2">{formatDate(from)} – {formatDate(to)}</span>

          <button onClick={() => setGroupByParty((v) => !v)}
                  className={`h-8 px-3 text-sm rounded-lg border transition-colors ${
                    groupByParty ? "bg-slate-800 border-slate-800 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            🗂 รวมการ์ดของร้านเดียวกัน
          </button>

          {selected.size > 0 && (
            <span className="flex items-center gap-2 text-sm">
              <span className="px-2.5 h-8 inline-flex items-center rounded-lg bg-blue-50 border border-blue-300 text-blue-700">
                เลือกไว้ {selected.size} ใบ — ลากใบไหนก็ได้ ทั้งชุดจะย้ายตาม
              </span>
              <button onClick={() => setSelected(new Set())}
                      className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                ล้างที่เลือก
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[264px_minmax(0,1fr)] min-h-[70vh]">
        <aside className="bg-white border-b xl:border-b-0 xl:border-r border-slate-200 p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] tracking-wider uppercase text-slate-400">สรุปช่วงนี้</p>
            <Stat label="เงินเข้า" value={THB(stats.in)} tone="text-emerald-600" />
            <Stat label="เงินออก" value={THB(stats.out)} tone="text-rose-600" />
            <Stat label="เงินเหลือน้อยสุด" value={THB(stats.low)}
                  sub={stats.lowDay ? `วันที่ ${formatDayMonthTH(stats.lowDay)}` : ""}
                  tone={stats.low < 0 ? "text-red-600" : "text-slate-900"} box={stats.low < 0 ? "warn" : "good"} />
            <Stat label="วันที่เงินติดลบ" value={`${stats.red} วัน`}
                  sub={stats.redFirst ? `เริ่มติดลบ ${formatDayMonthTH(stats.redFirst)}` : "เงินพอตลอดช่วง"}
                  tone={stats.red ? "text-red-600" : "text-emerald-600"} box={stats.red ? "warn" : "good"} />
          </div>

          {movedEvents.length > 0 && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3">
              <p className="text-[11px] tracking-wider uppercase text-blue-500">ผลของการเลื่อน</p>
              <p className="text-xl font-bold tabular-nums text-blue-800 mt-1">{baseStats.red} → {stats.red} วัน</p>
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
              {!canManage && <p className="text-[11px] text-blue-500 mt-2">ลากดูได้ แต่ต้องมีสิทธิ์ตั้งค่ากระแสเงินสดถึงจะบันทึกวันใหม่ได้</p>}
            </div>
          )}

          <div className="space-y-1.5 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <p className="text-[11px] tracking-wider uppercase text-slate-400 mb-1.5">อ่านกระดาน</p>
            <LegendRow color="bg-emerald-500" text="เงินเข้า — ใบวางบิล / ใบขาย" />
            <LegendRow color="bg-rose-500" text="เงินออก — ใบซื้อ / เงินจีน" />
            <LegendRow color="bg-violet-500" text="🔒 เลื่อนไม่ได้ — งวดผ่อน / เงินเดือน / รายการประจำ" />
            <div className="flex items-center gap-2"><span className="w-4 border-t-2 border-blue-600 shrink-0" /> เส้นเงินคงเหลือ</div>
            <LegendRow color="bg-red-400" text="ช่องแดง = เงินติดลบวันนั้น" />
            <LegendRow color="bg-amber-300" text="โน้ตแปะวัน — กด ＋ ที่หัวคอลัมน์" />
          </div>

          <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            <p className="font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              ใช้ยังไง
              <InfoHint>คลิกการ์ดเพื่อเลือก (เลือกได้หลายใบ) แล้วลากใบไหนก็ได้ ทั้งชุดจะย้ายตาม · การลากยังไม่บันทึกจนกว่าจะกดยืนยัน</InfoHint>
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>หาช่องแดง — วันนั้นเงินจะไม่พอ</li>
              <li>คลิกเลือกใบที่เลื่อนได้ (หรือกด “เลือกทั้งวัน” ที่หัวคอลัมน์)</li>
              <li>ลากไปวางหลังวันที่เงินเข้า</li>
              <li>ดูว่า “วันที่เงินติดลบ” ลดลงไหม แล้วค่อยกดยืนยัน</li>
            </ol>
          </div>

          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
            เงินตั้งต้น <b className="text-slate-600 tabular-nums">{THB(opening)}</b>
            {" · "}<Link href="/cashflow" className="text-blue-600 underline">ตั้งค่า + รายจ่ายประจำ</Link>
          </p>
        </aside>

        <div className="min-w-0">
          {error && (
            <div className="m-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3">
              <span>⚠️ {error}</span>
              <button onClick={load} className="h-8 px-3 text-white bg-red-600 rounded-lg">ลองใหม่</button>
            </div>
          )}
          {saveMsg && <div className="m-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-700">✅ {saveMsg}</div>}
          {loading && !data && <div className="text-center text-slate-400 py-24">กำลังจัดของขึ้นกระดาน…</div>}

          {data && (
            <Board
              days={days} cardsByDay={cardsByDay} notesByDay={notesByDay} byDay={byDay}
              levelByDay={levelByDay} balanceByDay={balanceByDay} today={from}
              dragIds={dragIds} overDay={overDay} pending={pending} selected={selected}
              openGroups={openGroups} canManage={canManage}
              originalDate={(id) => data.events.find((e) => e.id === id)?.date ?? ""}
              onDragStart={startDrag} onDragEnd={() => { setDragIds(null); setOverDay(null); }}
              onOver={setOverDay} onDrop={drop} onToggleSelect={toggleSelect} onSelectDay={selectDay}
              onToggleGroup={(k) => setOpenGroups((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
              onAddNote={(day) => setNoteEdit({ note_date: day, body: "", color: "yellow" })}
              onEditNote={(n) => setNoteEdit({ ...n })}
            />
          )}
        </div>
      </div>

      {/* ---- ป๊อปยืนยันเลื่อนวัน ---- */}
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
                    <span className="text-slate-400 mr-1.5">{CASHFLOW_SOURCE[e.source].icon}</span>{e.ref}
                  </span>
                  <span className="whitespace-nowrap text-xs">
                    <span className="text-slate-400 line-through">{formatDayMonthTH(e.date)}</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-medium text-blue-700">{formatDayMonthTH(pending[e.id])}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">ทุกใบจะถูกบันทึกลงประวัติว่าใครเลื่อนจากวันไหนไปวันไหน</p>
          </div>
        }
        confirmText="ยืนยันเลื่อนวัน"
      />

      {/* ---- ป๊อปโน้ต ---- */}
      <ERPModal
        open={!!noteEdit}
        onClose={() => setNoteEdit(null)}
        title={noteEdit?.id ? "แก้โน้ต" : "แปะโน้ตบนวันนี้"}
        description={noteEdit ? formatDate(noteEdit.note_date) : ""}
        size="sm"
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            {noteEdit?.id
              ? <button onClick={deleteNote} disabled={saving}
                        className="h-9 px-3 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                  ลอกโน้ตออก
                </button>
              : <span />}
            <div className="flex gap-2">
              <button onClick={() => setNoteEdit(null)}
                      className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
                ยกเลิก
              </button>
              <button onClick={saveNote} disabled={saving || !(noteEdit?.body ?? "").trim()}
                      className="h-9 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </div>
        }
      >
        {noteEdit && (
          <div className="space-y-3">
            <textarea
              value={noteEdit.body ?? ""}
              onChange={(e) => setNoteEdit({ ...noteEdit, body: e.target.value.slice(0, 500) })}
              rows={4} autoFocus
              placeholder="เช่น คุยกับร้านแล้ว เลื่อนได้อีก 2 อาทิตย์ / รอเช็คเคลียร์"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-blue-400 resize-y"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">สี</span>
              {Object.entries(NOTE_COLORS).map(([key, c]) => (
                <button key={key} onClick={() => setNoteEdit({ ...noteEdit, color: key })}
                        title={c.label}
                        className={`w-6 h-6 rounded-full ${c.chip} ${noteEdit.color === key ? "ring-2 ring-offset-1 ring-slate-500" : ""}`} />
              ))}
            </div>
          </div>
        )}
      </ERPModal>
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

type BoardProps = {
  days: string[];
  cardsByDay: Map<string, BoardCard[]>;
  notesByDay: Map<string, BoardNote[]>;
  byDay: Map<string, CashflowEvent[]>;
  levelByDay: { date: string; bal: number }[];
  balanceByDay: Map<string, number>;
  today: string;
  dragIds: string[] | null;
  overDay: string | null;
  pending: Record<string, string>;
  selected: Set<string>;
  openGroups: Set<string>;
  canManage: boolean;
  originalDate: (id: string) => string;
  onDragStart: (ids: string[]) => void;
  onDragEnd: () => void;
  onOver: (day: string | null) => void;
  onDrop: (day: string) => void;
  onToggleSelect: (id: string) => void;
  onSelectDay: (day: string) => void;
  onToggleGroup: (key: string) => void;
  onAddNote: (day: string) => void;
  onEditNote: (n: BoardNote) => void;
};

function Board(p: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [path, setPath] = useState<{ line: string; area: string; zeroY: number; w: number; h: number } | null>(null);

  // คอลัมน์กว้างไม่เท่ากัน → ต้องวัดจริงหลัง layout ถึงจะวางเส้นได้ตรง
  const draw = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const w = el.scrollWidth, h = el.clientHeight;
    if (!w || !h || !p.levelByDay.length) return;

    const top = 58, bottom = h - 16, span = Math.max(40, bottom - top);
    const vals = p.levelByDay.map((x) => x.bal).concat([0]);
    const max = Math.max(...vals), min = Math.min(...vals);
    const range = max - min || 1;
    const y = (v: number) => top + span * (1 - (v - min) / range);

    let x = 0;
    const pts: [number, number][] = [];
    for (const item of p.levelByDay) {
      const cw = colRefs.current[item.date]?.offsetWidth ?? 0;
      pts.push([x + cw / 2, y(item.bal)]);
      x += cw;
    }
    if (!pts.length) return;
    const line = pts.map((pt, i) => `${i ? "L" : "M"}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(" ");
    const zeroY = y(0);
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${zeroY.toFixed(1)} L${pts[0][0].toFixed(1)} ${zeroY.toFixed(1)} Z`;
    setPath({ line, area, zeroY, w, h });
  }, [p.levelByDay]);

  useLayoutEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const t1 = setTimeout(draw, 80), t2 = setTimeout(draw, 400);
    window.addEventListener("resize", draw);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", draw); };
  }, [draw]);

  return (
    <div className="overflow-x-auto">
      <div ref={boardRef} className="relative flex items-stretch min-h-[560px] pb-4">
        {path && (
          <svg className="absolute inset-0 pointer-events-none z-0" width={path.w} height={path.h}
               viewBox={`0 0 ${path.w} ${path.h}`} aria-hidden="true">
            <line x1="0" y1={path.zeroY} x2={path.w} y2={path.zeroY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 4" opacity=".7" />
            <path d={path.area} fill="rgba(37,99,235,.08)" />
            <path d={path.line} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
            <text x="6" y={path.zeroY - 5} fontSize="10" fill="#94a3b8">฿0</text>
          </svg>
        )}

        {p.days.map((day) => {
          const cards = p.cardsByDay.get(day) ?? [];
          const dayNotes = p.notesByDay.get(day) ?? [];
          const busy = cards.length > 0 || dayNotes.length > 0;
          const bal = p.balanceByDay.get(day);
          const flood = (p.levelByDay.find((x) => x.date === day)?.bal ?? 0) < 0;
          const dow = parseISO(day).getUTCDay();
          const width = busy ? "w-[210px]" : p.dragIds ? "w-[76px]" : "w-[26px]";
          const movableHere = (p.byDay.get(day) ?? []).filter((e) => e.movable).length;

          return (
            <div
              key={day}
              ref={(el) => { colRefs.current[day] = el; }}
              data-day={day}
              onDragOver={(e) => { if (p.dragIds) { e.preventDefault(); p.onOver(day); } }}
              onDragLeave={() => p.onOver(null)}
              onDrop={(e) => { e.preventDefault(); p.onDrop(day); }}
              className={`group/col relative z-10 shrink-0 flex flex-col border-r border-slate-200 transition-[width,background-color] duration-150 ${width}
                ${flood ? "bg-red-50/70" : dow === 0 || dow === 6 ? "bg-slate-50/60" : ""}
                ${p.overDay === day ? "bg-blue-50 ring-2 ring-inset ring-blue-400" : ""}
                ${day === p.today ? "shadow-[inset_2px_0_0_#059669]" : ""}`}
            >
              <div className="sticky top-0 z-20 px-2 py-1.5 border-b border-slate-200 bg-white/85 backdrop-blur">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className={`font-semibold tabular-nums leading-tight ${busy ? "text-[15px]" : "text-[13px] text-center"}`}>
                      {parseISO(day).getUTCDate()}
                    </div>
                    {busy && <div className="text-[10px] text-slate-400">{TH_DOW[dow]}</div>}
                  </div>
                  {busy && p.canManage && (
                    <button onClick={() => p.onAddNote(day)} title="แปะโน้ตบนวันนี้"
                            className="opacity-0 group-hover/col:opacity-100 transition-opacity h-5 w-5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 text-xs leading-none">
                      ＋
                    </button>
                  )}
                </div>
                {busy && bal !== undefined && (
                  <div className={`text-[11px] tabular-nums mt-0.5 ${flood ? "text-red-600 font-semibold" : "text-blue-700"}`}>
                    {shortTHB(bal)}
                  </div>
                )}
                {busy && movableHere > 1 && (
                  <button onClick={() => p.onSelectDay(day)}
                          className="mt-1 text-[10px] text-slate-500 hover:text-blue-700 underline decoration-dotted">
                    เลือกทั้งวัน ({movableHere})
                  </button>
                )}
              </div>

              <div className={`flex-1 flex flex-col gap-1.5 ${busy ? "p-1.5" : "p-1"}`}>
                {dayNotes.map((n) => (
                  <button key={n.id} onClick={() => p.canManage && p.onEditNote(n)}
                          className={`text-left text-[11px] leading-snug rounded-md border px-2 py-1.5 whitespace-pre-wrap ${
                            NOTE_COLORS[n.color]?.card ?? NOTE_COLORS.yellow.card} ${p.canManage ? "hover:brightness-95" : "cursor-default"}`}>
                    📝 {n.body}
                  </button>
                ))}

                {cards.map((c) =>
                  c.kind === "single" ? (
                    <Card key={c.key} ev={c.ev}
                          dragging={!!p.dragIds?.includes(c.ev.id)}
                          checked={p.selected.has(c.ev.id)}
                          movedFrom={p.pending[c.ev.id] ? p.originalDate(c.ev.id) : null}
                          onDragStart={p.onDragStart} onDragEnd={p.onDragEnd} onToggleSelect={p.onToggleSelect} />
                  ) : (
                    <GroupCard key={c.key} card={c} open={p.openGroups.has(c.key)}
                               dragging={!!p.dragIds?.some((id) => c.events.some((e) => e.id === id))}
                               selected={p.selected} pending={p.pending} originalDate={p.originalDate}
                               onToggle={() => p.onToggleGroup(c.key)}
                               onDragStart={p.onDragStart} onDragEnd={p.onDragEnd} onToggleSelect={p.onToggleSelect} />
                  ),
                )}

                {!busy && <span className="mx-auto mt-1 w-1.5 h-1.5 rounded-full bg-slate-300" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ ev, dragging, checked, movedFrom, onDragStart, onDragEnd, onToggleSelect }: {
  ev: CashflowEvent; dragging: boolean; checked: boolean; movedFrom: string | null;
  onDragStart: (ids: string[]) => void; onDragEnd: () => void; onToggleSelect: (id: string) => void;
}) {
  const meta = CASHFLOW_SOURCE[ev.source as CashflowSource];
  const locked = !ev.movable;
  const edge = locked ? "border-l-violet-500" : ev.direction === "in" ? "border-l-emerald-500" : "border-l-rose-500";
  return (
    <div
      draggable={!locked}
      onClick={() => { if (!locked) onToggleSelect(ev.id); }}
      onDragStart={(e) => {
        if (locked) { e.preventDefault(); return; }
        onDragStart([ev.id]);
        try { e.dataTransfer.setData("text/plain", ev.id); e.dataTransfer.effectAllowed = "move"; } catch { /* บางเบราว์เซอร์ไม่ยอมให้ตั้ง */ }
      }}
      onDragEnd={onDragEnd}
      title={locked
        ? `${meta.label} — เลื่อนไม่ได้${ev.source === "manual" ? " (แก้ที่ตั้งค่ารายจ่ายประจำ)" : " ธนาคาร/พนักงานรอไม่ได้"}`
        : `คลิกเพื่อเลือก · ลากไปวันอื่นเพื่อเลื่อน${movedFrom ? ` · เดิมคือ ${formatDayMonthTH(movedFrom)}` : ""}`}
      className={`rounded-lg border border-l-[3px] border-slate-200 bg-white p-1.5 shadow-sm select-none ${edge}
        ${locked ? "cursor-not-allowed bg-slate-50" : "cursor-grab active:cursor-grabbing hover:shadow-md"}
        ${dragging ? "opacity-40" : ""} ${movedFrom ? "border-dashed" : ""}
        ${checked ? "ring-2 ring-blue-500" : movedFrom ? "ring-2 ring-blue-200" : ""}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[9.5px] px-1.5 py-px rounded-full whitespace-nowrap ${
          locked ? "bg-violet-100 text-violet-700"
            : ev.direction === "in" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {locked ? "🔒 " : checked ? "✓ " : ""}{meta.label}
        </span>
        <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${
          ev.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>
          {ev.direction === "in" ? "+" : "−"}{THB(ev.amount)}
        </span>
      </div>
      <p className="text-[11.5px] text-slate-700 mt-0.5 line-clamp-2 leading-snug">{ev.party}</p>
      <p className="text-[10px] text-slate-400 mt-px">
        {ev.ref}{movedFrom && <span className="text-blue-600"> · เลื่อนจาก {formatDayMonthTH(movedFrom)}</span>}
      </p>
    </div>
  );
}

/** กองการ์ดของร้านเดียวกันในวันเดียวกัน — ลากทั้งกองได้ กดเพื่อกางดูรายใบ */
function GroupCard({ card, open, dragging, selected, pending, originalDate, onToggle, onDragStart, onDragEnd, onToggleSelect }: {
  card: Extract<BoardCard, { kind: "group" }>;
  open: boolean; dragging: boolean;
  selected: Set<string>; pending: Record<string, string>;
  originalDate: (id: string) => string;
  onToggle: () => void;
  onDragStart: (ids: string[]) => void; onDragEnd: () => void; onToggleSelect: (id: string) => void;
}) {
  const ids = card.events.map((e) => e.id);
  const edge = !card.movable ? "border-l-violet-500" : card.direction === "in" ? "border-l-emerald-500" : "border-l-rose-500";
  return (
    <div className="space-y-1.5">
      <div
        draggable={card.movable}
        onClick={onToggle}
        onDragStart={(e) => {
          if (!card.movable) { e.preventDefault(); return; }
          onDragStart(ids);
          try { e.dataTransfer.effectAllowed = "move"; } catch { /* ไม่เป็นไร */ }
        }}
        onDragEnd={onDragEnd}
        title={card.movable ? "ลากทั้งกองไปวันอื่น · กดเพื่อกางดูรายใบ" : "ในกองมีใบที่เลื่อนไม่ได้ปนอยู่"}
        className={`rounded-lg border border-l-[3px] border-slate-300 bg-slate-50 p-1.5 shadow-sm select-none ${edge}
          ${card.movable ? "cursor-grab active:cursor-grabbing hover:shadow-md" : "cursor-pointer"}
          ${dragging ? "opacity-40" : ""}`}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[9.5px] px-1.5 py-px rounded-full bg-slate-200 text-slate-600 whitespace-nowrap">
            🗂 {card.events.length} ใบ
          </span>
          <span className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${
            card.direction === "in" ? "text-emerald-600" : "text-rose-600"}`}>
            {card.direction === "in" ? "+" : "−"}{THB(card.total)}
          </span>
        </div>
        <p className="text-[11.5px] text-slate-700 mt-0.5 line-clamp-2 leading-snug">{card.party}</p>
        <p className="text-[10px] text-slate-400 mt-px">{open ? "▲ ซ่อนรายใบ" : "▼ กดดูรายใบ"}</p>
      </div>

      {open && (
        <div className="pl-2 space-y-1.5 border-l-2 border-slate-200">
          {card.events.map((ev) => (
            <Card key={ev.id} ev={ev} dragging={false} checked={selected.has(ev.id)}
                  movedFrom={pending[ev.id] ? originalDate(ev.id) : null}
                  onDragStart={onDragStart} onDragEnd={onDragEnd} onToggleSelect={onToggleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
