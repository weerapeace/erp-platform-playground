"use client";

/**
 * กล่อง "ค่าแรงผลิต" ในหน้า BOM — ราคาค่าจ้างประกอบต่อสินค้า
 * - ใส่ได้หลายราคา (ตามช่าง) · เลือกช่างจากพนักงาน หรือ "ราคากลาง"
 * - ดูประวัติราคาได้ (ทุกครั้งที่ราคาเปลี่ยน ระบบเก็บไว้)
 * controlled: value + onChange (พ่อแม่บันทึกพร้อม BOM)
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { LaborRate } from "@/app/api/bom/labor-rates/route";

export type LaborLine = { id?: string; craftsman_id: string | null; craftsman_name: string; rate: number; note: string };
export const emptyLabor = (): LaborLine => ({ craftsman_id: null, craftsman_name: "", rate: 0, note: "" });

const fmtMoney = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }); } catch { return s; } };

export function LaborRates({ value, onChange, readonly, bomCode }: {
  value: LaborLine[]; onChange: (lines: LaborLine[]) => void; readonly?: boolean; bomCode?: string;
}) {
  const [crafts, setCrafts] = useState<Assignee[]>([]);
  const [histOpen, setHistOpen] = useState(false);
  const [hist, setHist] = useState<LaborRate[] | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => { try { const r = await apiFetch("/api/mo/assignees"); const j = await r.json(); if (!cancel) setCrafts((j.craftsmen ?? []) as Assignee[]); } catch { /* ignore */ } })();
    return () => { cancel = true; };
  }, []);

  const patch = (i: number, p: Partial<LaborLine>) => onChange(value.map((l, idx) => idx === i ? { ...l, ...p } : l));
  const pick = (i: number, id: string) => {
    if (id === "") { patch(i, { craftsman_id: null, craftsman_name: "ราคากลาง" }); return; }
    const c = crafts.find((x) => x.id === id);
    patch(i, { craftsman_id: id, craftsman_name: c?.name ?? "" });
  };
  const add = () => onChange([...value, emptyLabor()]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const openHist = async () => {
    setHistOpen((o) => !o);
    if (!hist && bomCode) {
      try { const r = await apiFetch(`/api/bom/labor-rates?bom_code=${encodeURIComponent(bomCode)}&history=1`); const j = await r.json(); setHist((j.data ?? []) as LaborRate[]); }
      catch { setHist([]); }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">💰 ค่าแรงผลิต</h3>
          <p className="text-[11px] text-slate-400">ค่าจ้างประกอบสินค้านี้ — ใส่ได้หลายราคาตามช่าง (เก็บประวัติให้)</p>
        </div>
        {bomCode && <button type="button" onClick={() => void openHist()} className="text-[11px] text-indigo-600 hover:underline shrink-0">🕑 ประวัติราคา</button>}
      </div>

      {value.length === 0 ? (
        <div className="text-center py-5 border border-dashed border-slate-200 rounded-lg text-[12px] text-slate-300">ยังไม่มีค่าแรงผลิต</div>
      ) : (
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_6rem_1fr_2rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500">
            <span>ช่าง</span><span className="text-right">ค่าแรง (บาท)</span><span>หมายเหตุ</span><span></span>
          </div>
          <div className="divide-y divide-slate-50">
            {value.map((l, i) => (
              <div key={l.id ?? i} className="grid grid-cols-[1fr_6rem_1fr_2rem] gap-2 px-3 py-2 items-center">
                <select value={l.craftsman_id ?? ""} disabled={readonly} onChange={(e) => pick(i, e.target.value)}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 bg-white">
                  <option value="">ราคากลาง (ไม่ระบุช่าง)</option>
                  {crafts.map((c) => <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ""}{c.name}</option>)}
                </select>
                <input type="number" inputMode="decimal" value={l.rate || ""} disabled={readonly} placeholder="0"
                  onChange={(e) => patch(i, { rate: Number(e.target.value) || 0 })}
                  className="h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                <input value={l.note} disabled={readonly} placeholder="—" onChange={(e) => patch(i, { note: e.target.value })}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                {!readonly ? <button onClick={() => remove(i)} className="h-8 w-7 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50">🗑</button> : <span />}
              </div>
            ))}
          </div>
        </div>
      )}

      {!readonly && (
        <button onClick={add} className="h-8 px-3 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">＋ เพิ่มค่าแรง</button>
      )}

      {histOpen && (
        <div className="border border-slate-100 rounded-lg bg-slate-50/60 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-500 mb-1">ประวัติค่าแรงผลิต</p>
          {!hist ? <p className="text-[11px] text-slate-400">กำลังโหลด…</p>
            : hist.length === 0 ? <p className="text-[11px] text-slate-300">ยังไม่มีประวัติ</p>
              : <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {hist.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                      <span className="w-16 text-slate-400">{fmtDate(r.created_at)}</span>
                      <span className="flex-1 truncate">{r.craftsman_name ?? "ราคากลาง"}</span>
                      <span className="font-semibold text-slate-800 w-20 text-right">{fmtMoney(r.rate)} ฿</span>
                      {r.is_current && <span className="text-[9px] text-emerald-600">ปัจจุบัน</span>}
                    </div>
                  ))}
                </div>}
        </div>
      )}
    </div>
  );
}
