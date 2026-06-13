"use client";

/**
 * จัดการงานเหมารายชิ้น — /admin/piecework-jobs
 * ทะเบียนชื่องานเหมากลาง: ชื่อ + ราคาตั้งต้น + ☑งานละเอียด + หมายเหตุ + ดูประวัติราคา
 * ใช้เติม dropdown งานเหมาในหน้า BOM (ตารางที่ 2)
 */
import { useCallback, useEffect, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useToast } from "@/components/toast";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { PieceworkJob, PieceworkRate } from "@/app/api/admin/piecework-jobs/route";

const fmtMoney = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }); } catch { return s; } };

export default function PieceworkJobsPage() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("production.piecework");
  const toast = useToast();

  const [list, setList] = useState<PieceworkJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [histOpen, setHistOpen] = useState<string | null>(null);
  const [hist, setHist] = useState<Record<string, PieceworkRate[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await apiFetch("/api/admin/piecework-jobs"); const j = await res.json(); setList((j.data ?? []) as PieceworkJob[]); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (id: string, p: Partial<PieceworkJob> & { rate_note?: string }) => {
    setList((ls) => ls.map((x) => x.id === id ? { ...x, ...p } : x));
    try { const res = await apiFetch("/api/admin/piecework-jobs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) }); const j = await res.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void load(); }
  }, [toast, load]);
  const addJob = useCallback(async () => {
    const name = newName.trim(); if (!name) return;
    try { const res = await apiFetch("/api/admin/piecework-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const j = await res.json(); if (j.error) throw new Error(j.error); setNewName(""); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  }, [newName, toast, load]);
  const del = useCallback(async (id: string) => {
    try { const res = await apiFetch(`/api/admin/piecework-jobs?id=${id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setConfirmDel(null); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast, load]);
  const openHist = useCallback(async (id: string) => {
    if (histOpen === id) { setHistOpen(null); return; }
    setHistOpen(id);
    if (!hist[id]) {
      try { const res = await apiFetch(`/api/admin/piecework-jobs?history=${id}`); const j = await res.json(); setHist((h) => ({ ...h, [id]: (j.data ?? []) as PieceworkRate[] })); }
      catch { /* ignore */ }
    }
  }, [histOpen, hist]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="max-w-[860px] mx-auto px-5 py-5">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-800">🧵 จัดการงานเหมารายชิ้น</h1>
          <p className="text-sm text-slate-500 mt-0.5">ทะเบียนชื่องานเหมากลาง (เช่น เย็บ, ติดอะไหล่, ตอก) + ราคาตั้งต้น — นำไปใส่ใน BOM สินค้าได้</p>
        </div>

        {canEdit && (
          <div className="flex gap-2 mb-4">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addJob(); }}
              placeholder="ชื่องานเหมาใหม่ (เช่น งานเย็บริม)" className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => void addJob()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">＋ เพิ่มงานเหมา</button>
          </div>
        )}

        {loading ? <div className="text-center py-16 text-slate-400">กำลังโหลด…</div>
          : list.length === 0 ? <div className="text-center py-16 text-slate-300">ยังไม่มีงานเหมา</div>
            : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_7rem_5rem_2.5rem_2.5rem] gap-2 px-3 text-[11px] font-medium text-slate-400">
                  <span>ชื่องาน</span><span className="text-right">ราคา/หน่วย (บาท)</span><span className="text-center">งานละเอียด</span><span></span><span></span>
                </div>
                {list.map((t) => (
                  <div key={t.id} className="border border-slate-200 rounded-xl bg-white">
                    <div className="grid grid-cols-[1fr_7rem_5rem_2.5rem_2.5rem] gap-2 items-center p-2.5">
                      <input defaultValue={t.name} disabled={!canEdit} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) void patch(t.id, { name: v }); }}
                        className="h-8 px-2 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                      <input defaultValue={t.default_rate || ""} disabled={!canEdit} type="number" inputMode="decimal" placeholder="0"
                        onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== t.default_rate) void patch(t.id, { default_rate: v }); }}
                        className="h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                      <label className="flex justify-center" title="งานที่ต้องใช้ความละเอียด/ฝีมือ">
                        <input type="checkbox" checked={t.is_detail} disabled={!canEdit} onChange={(e) => void patch(t.id, { is_detail: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                      </label>
                      <button onClick={() => void openHist(t.id)} title="ประวัติราคา" className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-indigo-600 rounded-lg hover:bg-indigo-50">🕑</button>
                      {canEdit ? (confirmDel === t.id
                        ? <button onClick={() => void del(t.id)} className="h-8 px-1 text-[10px] bg-rose-600 text-white rounded-lg">ลบ?</button>
                        : <button onClick={() => setConfirmDel(t.id)} className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50">🗑</button>)
                        : <span />}
                    </div>
                    {canEdit && (
                      <div className="px-2.5 pb-2.5 -mt-1">
                        <input defaultValue={t.note ?? ""} placeholder="หมายเหตุ (ไม่บังคับ)" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (t.note ?? "")) void patch(t.id, { note: v }); }}
                          className="w-full h-7 px-2 text-xs text-slate-500 border border-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    )}
                    {histOpen === t.id && (
                      <div className="border-t border-slate-100 px-3 py-2 bg-slate-50/60">
                        <p className="text-[11px] font-medium text-slate-500 mb-1">ประวัติราคา</p>
                        {!hist[t.id] ? <p className="text-[11px] text-slate-400">กำลังโหลด…</p>
                          : hist[t.id].length === 0 ? <p className="text-[11px] text-slate-300">ยังไม่มีประวัติ</p>
                            : <div className="space-y-0.5">
                                {hist[t.id].map((r) => (
                                  <div key={r.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                                    <span className="w-16 text-slate-400">{fmtDate(r.created_at)}</span>
                                    <span className="font-semibold text-slate-800 w-20 text-right">{fmtMoney(r.rate)} ฿</span>
                                    {r.contractor_name && <span className="text-indigo-500">→ {r.contractor_name}</span>}
                                    {r.note && <span className="text-slate-400">· {r.note}</span>}
                                  </div>
                                ))}
                              </div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
      </div>
    </PlaygroundShell>
  );
}
