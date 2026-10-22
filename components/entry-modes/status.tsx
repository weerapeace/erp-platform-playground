"use client";
/**
 * 📝 ปุ่ม "ความครบตามโหมด" บนหัวหน้าตาราง (ของกลาง — MasterCRUDPage ใส่ให้เองเมื่อโมดูลมีโหมด)
 *   กดแล้วนับทั้งระบบ (GET /api/entry-modes/stats) → แต่ละโหมดเหลือกี่ตัวที่ยังไม่ครบ + ขาดช่องไหนมากสุด
 *   [ดูในตาราง] = กรองตารางเฉพาะที่ยังไม่ครบ (?mode_incomplete=) · [📋 รายงาน + พิมพ์ A4] = รายงานข้อมูลค้าง scope modes:<โมดูล>
 * docs/entry-modes.md
 */
import { useState } from "react";
import { tr } from "@/lib/lang";
import { ERPModal } from "@/components/modal";
import { PendingDataPanel } from "@/components/pending-data-report";
import type { EntryModeStat } from "@/lib/entry-modes";
import { fetchEntryModeStats } from "./index";

const fmt = (n: number) => n.toLocaleString("th-TH");

export function EntryModeStatusButton({ moduleKey, activeFilter, onFilter }: {
  moduleKey: string;
  /** โหมดที่กำลังกรองตารางอยู่ (null = ไม่กรอง) */
  activeFilter: string | null;
  onFilter: (modeKey: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<EntryModeStat[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const load = async () => {
    setErr(null);
    try { setStats(await fetchEntryModeStats(moduleKey)); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const scope = `modes:${moduleKey}` as const;
  return (
    <div className="relative">
      <button type="button" onClick={() => { const o = !open; setOpen(o); if (o) void load(); }}
        title={tr("ทั้งระบบเหลือกี่รายการที่ยังลงไม่ครบแต่ละโหมด + กรองตาราง/พิมพ์รายงาน", "How many records are still incomplete per mode + filter the table / print a report")}
        className={`h-9 px-3 text-sm font-medium border rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${activeFilter ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
        📝 {tr("ความครบตามโหมด", "Completeness by mode")} <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-[340px] bg-white border border-slate-200 rounded-lg shadow-lg p-2">
            <div className="px-1 pb-1.5 text-[11px] text-slate-400">{tr("นับเฉพาะรายการที่เปิดใช้อยู่ · กฎเดียวกับหน้าจอโหมดในป๊อป", "Active records only · same rules as the mode screen")}</div>
            {err && <div className="px-2 py-3 text-xs text-rose-600">{err}</div>}
            {!err && stats === null && <div className="px-2 py-4 text-xs text-slate-400 text-center">{tr("กำลังนับทั้งระบบ…", "Counting…")}</div>}
            {stats?.length === 0 && <div className="px-2 py-4 text-xs text-slate-400 text-center">{tr("ไม่มีโหมดที่คุณเห็น", "No modes visible to you")}</div>}
            {stats?.map((st) => {
              const pct = st.total ? Math.round(((st.total - st.incomplete) / st.total) * 100) : 100;
              const top = st.byItem.slice().sort((a, b) => b.missing - a.missing).slice(0, 3);
              const on = activeFilter === st.key;
              return (
                <div key={st.key} className={`rounded-md px-2 py-2 ${on ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-center">{st.icon || "📝"}</span>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">{st.label}</span>
                    <button type="button" onClick={() => { setOpen(false); onFilter(on ? null : st.key); }}
                      className={`h-7 px-2 text-xs rounded-md border ${on ? "border-blue-300 bg-white text-blue-700" : "border-slate-200 text-slate-600 hover:bg-white"}`}>
                      {on ? tr("✕ เลิกกรอง", "✕ Clear") : tr("ดูในตาราง", "Show in table")}
                    </button>
                  </div>
                  <div className="ml-7 mt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} /></div>
                      <span className="text-[11px] tabular-nums text-slate-500">{st.incomplete ? tr(`ไม่ครบ ${fmt(st.incomplete)}/${fmt(st.total)}`, `${fmt(st.incomplete)}/${fmt(st.total)} incomplete`) : tr("ครบทุกตัว", "All complete")}</span>
                    </div>
                    {st.recOnly > 0 && <div className="text-[11px] text-slate-400 mt-0.5">{tr(`ต้องมีครบแล้วแต่ขาดช่องแนะนำ ${fmt(st.recOnly)} ตัว (ไม่นับว่าไม่ครบ)`, `${fmt(st.recOnly)} have all required, missing only recommended`)}</div>}
                    {top.length > 0 && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{tr("ขาดมากสุด:", "Most missing:")} {top.map((x) => `${x.label} ${fmt(x.missing)}`).join(" · ")}</div>}
                  </div>
                </div>
              );
            })}
            <div className="border-t border-slate-100 mt-1 pt-1.5">
              <button type="button" onClick={() => { setOpen(false); setReportOpen(true); }}
                className="w-full text-left px-2 py-1.5 rounded-md text-sm text-slate-600 hover:bg-slate-50">📋 {tr("รายงานรายการที่ยังไม่ครบ + พิมพ์ A4", "Incomplete list report + print A4")}</button>
            </div>
          </div>
        </>
      )}
      {reportOpen && (
        <ERPModal open onClose={() => setReportOpen(false)} size="xl" storageKey={`pending-${scope}`}
          title={tr("📋 รายการค้าง — ข้อมูลที่ยังลงไม่ครบ (ตามโหมดลงรายละเอียด)", "📋 Pending — incomplete data (by entry mode)")}
          footer={<>
            <a href={`/print/pending-data?scope=${encodeURIComponent(scope)}`} target="_blank" rel="noreferrer"
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center">🖨 {tr("พิมพ์ A4", "Print A4")}</a>
            <button onClick={() => setReportOpen(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">{tr("ปิด", "Close")}</button>
          </>}>
          <PendingDataPanel scope={scope} />
        </ERPModal>
      )}
    </div>
  );
}
