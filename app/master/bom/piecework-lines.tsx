"use client";

/**
 * ตารางงานเหมารายชิ้นในหน้า BOM (ตารางที่ 2)
 * - เลือกชื่องานจากทะเบียนกลาง (piecework_jobs) → เติมราคาตั้งต้นให้
 * - เพิ่มงานใหม่ได้ทันทีจาก dropdown (＋ เพิ่มงานใหม่… → popup)
 * - แก้ราคา/จำนวน(ตัวคูณต่อใบสั่ง)/หมายเหตุ/☑งานละเอียด ต่อสูตรได้
 * controlled: value + onChange (พ่อแม่เก็บใน form แล้วบันทึกพร้อม BOM)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import type { PieceworkJob } from "@/app/api/admin/piecework-jobs/route";

export type PieceLine = {
  id?: string; job_id: string | null; job_name: string; rate: number;
  note: string; is_detail: boolean; qty_per: number;
};

export function emptyPiece(): PieceLine {
  return { job_id: null, job_name: "", rate: 0, note: "", is_detail: false, qty_per: 1 };
}

export function PieceworkLines({ value, onChange, readonly }: {
  value: PieceLine[]; onChange: (lines: PieceLine[]) => void; readonly?: boolean;
}) {
  const toast = useToast();
  const [jobs, setJobs] = useState<PieceworkJob[]>([]);
  // popup เพิ่มงานใหม่ — จำว่ากำลังเพิ่มให้แถวไหน
  const [newFor, setNewFor] = useState<number | null>(null);
  const [nName, setNName] = useState(""); const [nRate, setNRate] = useState(0); const [nDetail, setNDetail] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadJobs = useCallback(async () => {
    try { const res = await apiFetch("/api/admin/piecework-jobs"); const j = await res.json(); setJobs((j.data ?? []) as PieceworkJob[]); } catch { /* ignore */ }
  }, []);
  useEffect(() => { void loadJobs(); }, [loadJobs]);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const patch = (i: number, p: Partial<PieceLine>) => onChange(value.map((l, idx) => idx === i ? { ...l, ...p } : l));
  const pickJob = (i: number, jobId: string) => {
    if (jobId === "__new__") { setNName(""); setNRate(0); setNDetail(false); setNewFor(i); return; }
    const j = jobById.get(jobId);
    if (!j) { patch(i, { job_id: null, job_name: "" }); return; }
    patch(i, { job_id: j.id, job_name: j.name, rate: j.default_rate, is_detail: j.is_detail });
  };
  const add = () => onChange([...value, emptyPiece()]);
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const createJob = async () => {
    const name = nName.trim(); if (!name) { toast.error("กรุณาระบุชื่องาน"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/piecework-jobs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, default_rate: nRate, is_detail: nDetail }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await loadJobs();
      if (newFor != null) patch(newFor, { job_id: String(j.id), job_name: name, rate: nRate, is_detail: nDetail });
      toast.success(`เพิ่มงาน “${name}” แล้ว`);
      setNewFor(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">🧵 งานเหมารายชิ้น</h3>
          <p className="text-[11px] text-slate-400">งานที่จ้างเหมาเป็นชิ้น (เย็บ/ติดอะไหล่ ฯลฯ) — จำนวน = ตัวคูณต่อ 1 ใบสั่ง</p>
        </div>
        <a href="/admin/piecework-jobs" target="_blank" rel="noreferrer" className="text-[11px] text-indigo-600 hover:underline shrink-0">⚙ จัดการชื่องาน</a>
      </div>

      {value.length === 0 ? (
        <div className="text-center py-5 border border-dashed border-slate-200 rounded-lg text-[12px] text-slate-300">ยังไม่มีงานเหมาในสูตรนี้</div>
      ) : (
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_5rem_4.5rem_3rem_1fr_2rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500">
            <span>ชื่องาน</span><span className="text-right">ราคา/ชิ้น</span><span className="text-center">จำนวน×</span><span className="text-center">ละเอียด</span><span>หมายเหตุ</span><span></span>
          </div>
          <div className="divide-y divide-slate-50">
            {value.map((l, i) => (
              <div key={l.id ?? i} className="grid grid-cols-[1fr_5rem_4.5rem_3rem_1fr_2rem] gap-2 px-3 py-2 items-center">
                <select value={l.job_id ?? ""} disabled={readonly} onChange={(e) => pickJob(i, e.target.value)}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 bg-white">
                  <option value="">{l.job_name || "— เลือกงาน —"}</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                  <option value="__new__">＋ เพิ่มงานใหม่…</option>
                </select>
                <input type="number" inputMode="decimal" value={l.rate || ""} disabled={readonly} placeholder="0"
                  onChange={(e) => patch(i, { rate: Number(e.target.value) || 0 })}
                  className="h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                <input type="number" inputMode="numeric" value={l.qty_per || ""} disabled={readonly} placeholder="1"
                  onChange={(e) => patch(i, { qty_per: Number(e.target.value) || 0 })}
                  className="h-8 px-2 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                <label className="flex justify-center"><input type="checkbox" checked={l.is_detail} disabled={readonly} onChange={(e) => patch(i, { is_detail: e.target.checked })} className="w-4 h-4 accent-indigo-600" /></label>
                <input value={l.note} disabled={readonly} placeholder="—" onChange={(e) => patch(i, { note: e.target.value })}
                  className="h-8 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                {!readonly ? <button onClick={() => remove(i)} className="h-8 w-7 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50">🗑</button> : <span />}
              </div>
            ))}
          </div>
        </div>
      )}

      {!readonly && (
        <button onClick={add} className="h-8 px-3 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">＋ เพิ่มงานเหมา</button>
      )}

      {/* popup เพิ่มงานใหม่เข้าทะเบียนกลาง */}
      <ERPModal open={newFor !== null} onClose={() => setNewFor(null)} size="sm" title="🧵 เพิ่มงานเหมาใหม่"
        footer={<>
          <button onClick={() => setNewFor(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 mr-auto">ยกเลิก</button>
          <button onClick={() => void createJob()} disabled={saving} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "เพิ่มและเลือก"}</button>
        </>}>
        <div className="space-y-3">
          <p className="text-[12px] text-slate-500">เพิ่มเข้าทะเบียนงานเหมากลาง แล้วเลือกให้แถวนี้ทันที</p>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ชื่องาน</label>
            <input autoFocus value={nName} onChange={(e) => setNName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void createJob(); }}
              placeholder="เช่น งานเย็บริม" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ราคา/ชิ้น (บาท)</label>
              <input type="number" inputMode="decimal" value={nRate || ""} onChange={(e) => setNRate(Number(e.target.value) || 0)} className="w-full h-9 px-3 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={nDetail} onChange={(e) => setNDetail(e.target.checked)} className="w-4 h-4 accent-indigo-600" /> งานละเอียด
            </label>
          </div>
        </div>
      </ERPModal>
    </div>
  );
}
