"use client";

// ============================================================
// Brainstorm Board — หน้ากระดานของ Content Project
// ก้อน 2: top bar (Slides/Drive/สถานะ) + การ์ด SKU + พื้นที่กระดาน (ก้อน 3 = canvas เต็ม)
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StandaloneShell } from "@/components/standalone-shell";
import { PROJECT_STATUS, getProject, updateProject, type ProjectDetail } from "../../data";

const CSTAT = Object.fromEntries(PROJECT_STATUS.map((s) => [s.value, s]));

export default function BoardPage() {
  const params = useParams();
  const id = String(params.id);
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { try { setP(await getProject(id)); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: string) => { try { await updateProject(id, { status }); await load(); } catch (e) { setErr((e as Error).message); } };

  if (err) return <StandaloneShell title="กระดาน" icon="🧠" accent="violet"><div className="p-8 text-red-600">{err}</div></StandaloneShell>;
  if (!p) return <StandaloneShell title="กระดาน" icon="🧠" accent="violet"><div className="p-8 text-slate-400">กำลังโหลด...</div></StandaloneShell>;

  return (
    <StandaloneShell title={p.name} icon="🧠" accent="violet">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/projects" className="text-sm text-slate-500 hover:text-slate-800">โปรเจกต์</a>
            <span className="text-slate-300">›</span>
            <span className="font-semibold text-slate-900 truncate">{p.name}</span>
            <span className="font-mono text-xs text-slate-400">{p.code}</span>
            {p.brand_label && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.brand_color || "#cbd5e1" }} />{p.brand_label}</span>}
            <select value={p.status} onChange={(e) => setStatus(e.target.value)} className="h-8 border border-slate-200 rounded-md px-2 text-sm">
              {PROJECT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {p.google_slides_url
              ? <a href={p.google_slides_url} target="_blank" rel="noopener noreferrer" className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📊 เปิด Slides</a>
              : <span className="h-9 px-3 inline-flex items-center text-sm text-slate-400 border border-slate-200 rounded-lg">＋ Slides Brief</span>}
            {p.drive_folder_url
              ? <a href={p.drive_folder_url} target="_blank" rel="noopener noreferrer" className="h-9 px-3 inline-flex items-center text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📁 Drive</a>
              : <span className="h-9 px-3 inline-flex items-center text-sm text-slate-400 border border-slate-200 rounded-lg">＋ Drive</span>}
            <button disabled className="h-9 px-4 text-sm font-medium text-white bg-violet-400 rounded-lg cursor-not-allowed" title="กำลังพัฒนา">🚀 ส่งเข้าผลิต</button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* SKU cards */}
        {p.skus.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">สินค้าในโปรเจกต์ ({p.skus.length})</p>
            <div className="flex flex-wrap gap-3">
              {p.skus.map((s) => (
                <div key={s.sku_id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm w-56">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{s.code}</span>
                    {s.role === "primary" && <span className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded px-1">หลัก</span>}
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-1">{s.name}</p>
                  <div className="flex gap-3 text-xs text-slate-400 mt-1">
                    {s.color && <span>สี: {s.color}</span>}
                    {s.price != null && <span>{Number(s.price).toLocaleString()}฿</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* กระดาน (ก้อน 3) */}
        <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">🧠</div>
          <p className="text-slate-600 font-medium">กระดานระดมไอเดีย (Canvas เต็ม) กำลังต่อในขั้นถัดไป</p>
          <p className="text-slate-400 text-sm mt-1">โครงสร้างพร้อมแล้ว: โซน Reference/Photo/Video/Banner/Caption/Approve/Done + การ์ดสินค้า ถูกสร้างไว้ในกระดานนี้แล้ว</p>
        </div>
      </div>
    </StandaloneShell>
  );
}
