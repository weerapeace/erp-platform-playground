"use client";

/**
 * 📊 สรุปผลงาน (/master/work-logs/summary) — เฟส 2b
 *   จากบรรทัดใบจดที่ยืนยันแล้ว: แต่ละขั้นตอน "ควรได้กี่ชิ้น/ชม. · ต่อวัน" (ค่ามาตรฐาน = ค่ากลาง 20 บรรทัดล่าสุด)
 *   และใครเร็ว/ปกติ/ช้าเทียบมาตรฐาน — กติกาทั้งหมดใน lib/work-log-stats.ts
 *   ยังไม่มีข้อมูลจริง → ปุ่ม "ดูตัวอย่าง" ใช้ข้อมูลจำลอง (ป้ายเตือนชัดเจน ไม่บันทึกอะไร)
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { DateInput } from "@/components/date-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import {
  demoStatEntries, durationLabel, fmtHours, personStats, stepStats, VERDICT_LABEL, MIN_SAMPLES, STANDARD_SAMPLE,
  type PersonStat, type StatEntry, type StepGroupMode, type StepStat, type Verdict,
} from "@/lib/work-log-stats";

const CHIP: Record<Verdict, string> = {
  fast: "bg-emerald-50 text-emerald-700", normal: "bg-slate-100 text-slate-700", slow: "bg-rose-50 text-rose-700", few: "border border-dashed border-slate-300 text-slate-500",
};
const BAR: Record<Verdict, string> = { fast: "bg-emerald-200", normal: "bg-slate-300", slow: "bg-rose-200", few: "bg-slate-100" };
const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
const num = (n: number) => n.toLocaleString("th-TH");

function Chip({ v }: { v: Verdict }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs ${CHIP[v]}`}>{VERDICT_LABEL[v]}</span>;
}

/** แถบเทียบรายคนของ 1 ขั้นตอน (เส้นประ = ค่ามาตรฐาน) */
function PersonBars({ s }: { s: StepStat }) {
  const max = Math.max(s.standard ?? 0, ...s.people.map((p) => p.rate ?? 0)) * 1.1 || 1;
  return (
    <div className="space-y-1.5 px-2 py-2">
      {s.people.map((p) => (
        <div key={p.employee_id ?? p.employee_name} className="grid grid-cols-[96px_minmax(0,1fr)_84px] items-center gap-2 text-sm">
          <span className="truncate">{p.employee_name}{p.samples < MIN_SAMPLES ? <span className="text-[11px] text-slate-400"> ({p.samples} ครั้ง)</span> : null}</span>
          <div className="relative h-6">
            <div className={`flex h-6 items-center rounded px-2 text-xs text-slate-700 ${BAR[p.verdict]}`} style={{ width: `${Math.max(4, ((p.rate ?? 0) / max) * 100)}%` }}>
              <span className="whitespace-nowrap">{p.rate ?? "—"} ชิ้น/ชม. · {pct(p.ratio)}</span>
            </div>
            {s.standard ? <div className="absolute -bottom-1 -top-1 border-l border-dashed border-slate-500" style={{ left: `${(s.standard / max) * 100}%` }} /> : null}
          </div>
          <span className="text-right"><Chip v={p.verdict} /></span>
        </div>
      ))}
      <div className="pt-1 text-[11px] text-slate-400">เส้นประ = ค่ามาตรฐาน · เร็ว ≥ 115% · ช้า &lt; 85% · คนที่จดไม่ถึง {MIN_SAMPLES} ครั้ง = ข้อมูลน้อย (ยังไม่ตัดสิน)</div>
    </div>
  );
}

export default function WorkLogSummaryPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [today, setToday] = useState("");
  const [real, setReal] = useState<StatEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [mode, setMode] = useState<StepGroupMode>("step");
  const [tab, setTab] = useState<"steps" | "people">("steps");
  const [hours, setHours] = useState(8);
  const [batch, setBatch] = useState(100);
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [openPeople, setOpenPeople] = useState<Set<string>>(new Set());

  useEffect(() => { try { const h = Number(localStorage.getItem("wl-sum-hours")); if (h >= 1 && h <= 16) setHours(h); } catch { /* ignore */ } }, []);
  useEffect(() => { try { localStorage.setItem("wl-sum-hours", String(hours)); } catch { /* ignore */ } }, [hours]);

  const load = async () => {
    setErr(null); setReal(null);
    try {
      const q = new URLSearchParams(); if (from) q.set("from", from); if (to) q.set("to", to);
      const j = await apiFetch(`/api/work-logs/stats?${q}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setReal(j.data as StatEntry[]); setToday(j.today); if (!from) setFrom(j.from); if (!to) setTo(j.to);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); setReal([]); }
  };
  useEffect(() => { void load(); }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => (demo ? demoStatEntries(today || new Date().toISOString().slice(0, 10)) : real ?? []), [demo, real, today]);
  const steps = useMemo(() => stepStats(entries, mode), [entries, mode]);
  const people = useMemo(() => personStats(entries, steps), [entries, steps]);
  const totals = useMemo(() => {
    const qty = entries.reduce((a, e) => a + (e.qty_done ?? 0), 0), waste = entries.reduce((a, e) => a + (e.qty_waste ?? 0), 0);
    return { lines: entries.length, qty, minutes: entries.reduce((a, e) => a + (e.minutes ?? 0), 0), waste: qty + waste > 0 ? Math.round((waste / (qty + waste)) * 1000) / 10 : null };
  }, [entries]);

  const stepCols: MiniColumn<StepStat>[] = [
    { key: "step", header: "ขั้นตอน", width: "2.2fr", cell: (s) => <div className="min-w-0"><div className="truncate font-medium text-slate-800">{s.step_name}</div>{s.product_label && <div className="truncate text-xs text-slate-500">{s.product_label}</div>}</div>, sortValue: (s) => s.step_name },
    { key: "std", header: "ค่ามาตรฐาน", align: "right", width: "1.2fr", cell: (s) => s.standard === null ? "—" : <span>{s.standard} <span className="text-xs text-slate-500">ชิ้น/ชม.</span>{!s.reliable && <div className="text-[11px] text-amber-700">ข้อมูลยังไม่พอ ({s.standardSamples}/{MIN_SAMPLES})</div>}</span>, sortValue: (s) => s.standard ?? -1 },
    { key: "day", header: `ควรได้/วัน (${hours} ชม.)`, align: "right", width: "1.1fr", cell: (s) => (s.standard ? `${num(Math.round(s.standard * hours))} ชิ้น` : "—"), sortValue: (s) => s.standard ?? -1 },
    { key: "batch", header: `จ่าย ${num(batch)} ชิ้น เสร็จใน`, align: "right", width: "1.1fr", cell: (s) => durationLabel(batch, s.standard, hours) },
    { key: "n", header: "บรรทัด", align: "right", width: "0.7fr", cell: (s) => s.samples, sortValue: (s) => s.samples },
    { key: "pp", header: "คน", align: "right", width: "0.6fr", cell: (s) => s.people.length, sortValue: (s) => s.people.length },
    { key: "waste", header: "ของเสีย", align: "right", width: "0.8fr", cell: (s) => (s.wasteRate === null ? "—" : `${s.wasteRate}%`), sortValue: (s) => s.wasteRate ?? -1 },
  ];
  const personCols: MiniColumn<PersonStat>[] = [
    { key: "name", header: "พนักงาน", width: "1.4fr", cell: (p) => <span className="font-medium text-slate-800">{p.employee_name}</span>, sortValue: (p) => p.employee_name },
    { key: "ratio", header: "เทียบมาตรฐาน", align: "right", width: "1.3fr", cell: (p) => <span className="inline-flex items-center gap-2">{pct(p.ratio)} <Chip v={p.verdict} /></span>, sortValue: (p) => p.ratio ?? -1 },
    { key: "qty", header: "ทำได้รวม", align: "right", width: "1fr", cell: (p) => `${num(p.qty)} ชิ้น`, sortValue: (p) => p.qty },
    { key: "hrs", header: "ชั่วโมง", align: "right", width: "0.9fr", cell: (p) => fmtHours(p.minutes), sortValue: (p) => p.minutes },
    { key: "days", header: "วันที่จด", align: "right", width: "0.8fr", cell: (p) => p.days, sortValue: (p) => p.days },
    { key: "steps", header: "ขั้นตอน", align: "right", width: "0.8fr", cell: (p) => p.steps, sortValue: (p) => p.steps },
    { key: "waste", header: "ของเสีย", align: "right", width: "0.8fr", cell: (p) => (p.wasteRate === null ? "—" : `${p.wasteRate}%`), sortValue: (p) => p.wasteRate ?? -1 },
  ];
  const toggle = (set: Set<string>, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const pkey = (p: { employee_id: string | null; employee_name: string }) => p.employee_id ?? `?${p.employee_name}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/master/work-logs" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm leading-9 text-slate-600 hover:bg-slate-50">← ใบจดผลงาน</Link>
        <h1 className="text-xl font-semibold text-slate-800">📊 สรุปผลงาน</h1>
      </div>
      <p className="text-sm text-slate-500">ค่ามาตรฐาน = ค่ากลางของ {STANDARD_SAMPLE} บรรทัดล่าสุดของขั้นตอนนั้น (ต้องมีอย่างน้อย {MIN_SAMPLES} บรรทัด) · ความเร็วรายคน = ชิ้นรวม ÷ ชั่วโมงรวมในช่วงที่เลือก · ไม่นับบรรทัดที่สั้นกว่า 10 นาทีหรือไม่มีเวลา · ของเสียแยกดู ไม่หักจากความเร็ว</p>

      {demo && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ กำลังดู <b>ข้อมูลตัวอย่าง (จำลอง)</b> — ไม่ใช่ผลงานจริงของใคร
          <button onClick={() => setDemo(false)} className="ml-auto h-8 rounded-lg border border-amber-300 bg-white px-3 text-sm">กลับไปดูข้อมูลจริง</button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs text-slate-500">ตั้งแต่<div className="w-36"><DateInput value={from} onChange={setFrom} disabled={demo} /></div></label>
        <label className="text-xs text-slate-500">ถึง<div className="w-36"><DateInput value={to} onChange={setTo} disabled={demo} /></div></label>
        <div className="text-xs text-slate-500">จัดกลุ่มขั้นตอน
          <div className="mt-0.5 flex rounded-lg border border-slate-200 p-0.5">
            <button onClick={() => setMode("step")} className={`h-8 rounded-md px-3 text-sm ${mode === "step" ? "bg-slate-800 text-white" : "text-slate-600"}`}>แยกตามสินค้า</button>
            <button onClick={() => setMode("name")} className={`h-8 rounded-md px-3 text-sm ${mode === "name" ? "bg-slate-800 text-white" : "text-slate-600"}`}>รวมชื่อเดียวกันทุกสินค้า</button>
          </div>
        </div>
        <label className="text-xs text-slate-500">ชั่วโมงทำงาน/วัน<input type="number" min={1} max={16} value={hours} onChange={(e) => setHours(Math.min(16, Math.max(1, Math.round(Number(e.target.value) || 8))))} className="mt-0.5 block h-9 w-20 rounded-lg border border-slate-200 px-2 text-right text-sm" /></label>
        <label className="text-xs text-slate-500">จ่ายงานครั้งละ (ชิ้น)<input type="number" min={1} max={99999} value={batch} onChange={(e) => setBatch(Math.min(99999, Math.max(1, Math.round(Number(e.target.value) || 100))))} className="mt-0.5 block h-9 w-24 rounded-lg border border-slate-200 px-2 text-right text-sm" /></label>
        {!demo && <button onClick={() => setDemo(true)} className="ml-auto h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ดูตัวอย่างข้อมูลจำลอง</button>}
      </div>

      {real === null && !demo ? <LoadingState label="กำลังโหลดผลงาน…" />
        : err && !demo ? <ErrorState title="โหลดข้อมูลผลงานไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : entries.length === 0 ? (
          <EmptyState title="ยังไม่มีผลงานที่ยืนยันในช่วงนี้" hint="ถ่ายรูปใบจดผลงานแล้วกดยืนยันที่หน้า ใบจดผลงาน · ระหว่างรอ ดูหน้าตาด้วยข้อมูลจำลองได้"
            action={{ label: "ดูตัวอย่างข้อมูลจำลอง", onClick: () => setDemo(true) }} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[["บรรทัดผลงาน", num(totals.lines)], ["ชั่วโมงรวม", fmtHours(totals.minutes)], ["ทำได้รวม", `${num(totals.qty)} ชิ้น`], ["ของเสีย", totals.waste === null ? "—" : `${totals.waste}%`]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-semibold text-slate-800">{v}</div></div>
              ))}
            </div>
            <div className="flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
              <button onClick={() => setTab("steps")} className={`h-8 rounded-md px-3 text-sm ${tab === "steps" ? "bg-slate-800 text-white" : "text-slate-600"}`}>ตามขั้นตอน ({steps.length})</button>
              <button onClick={() => setTab("people")} className={`h-8 rounded-md px-3 text-sm ${tab === "people" ? "bg-slate-800 text-white" : "text-slate-600"}`}>ตามคน ({people.length})</button>
            </div>
            {tab === "steps" ? (
              <MiniTable rows={steps} rowKey={(s) => s.key} columns={stepCols} countUnit="ขั้นตอน"
                searchText={(s) => `${s.step_name} ${s.product_label ?? ""} ${s.people.map((p) => p.employee_name).join(" ")}`}
                expandedKeys={openSteps} renderExpanded={(s) => <PersonBars s={s} />} onRowClick={(s) => setOpenSteps((o) => toggle(o, s.key))}
                footnote="กดที่แถวเพื่อดูว่าใครเร็ว/ช้าในขั้นตอนนั้น" />
            ) : (
              <MiniTable rows={people} rowKey={pkey} columns={personCols} countUnit="คน" searchText={(p) => p.employee_name}
                expandedKeys={openPeople} onRowClick={(p) => setOpenPeople((o) => toggle(o, pkey(p)))}
                renderExpanded={(p) => (
                  <ul className="space-y-1 px-3 py-2 text-sm">
                    {steps.flatMap((s) => s.people.filter((x) => pkey(x) === pkey(p)).map((x) => (
                      <li key={s.key} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{s.step_name}{s.product_label ? <span className="text-xs text-slate-500"> · {s.product_label}</span> : null}</span>
                        <span className="tabular-nums text-slate-600">{x.rate ?? "—"} ชิ้น/ชม. (มาตรฐาน {s.standard ?? "—"})</span>
                        <span className="w-12 text-right tabular-nums">{pct(x.ratio)}</span>
                        <Chip v={x.verdict} />
                      </li>
                    )))}
                  </ul>
                )}
                footnote="% เทียบมาตรฐาน = เฉลี่ยถ่วงตามชั่วโมง เฉพาะขั้นตอนที่ค่ามาตรฐานเชื่อได้และคนนั้นจดครบ 5 ครั้ง · กดที่แถวเพื่อดูรายขั้นตอน" />
            )}
          </>
        )}
    </div>
  );
}
