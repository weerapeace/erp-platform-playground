"use client";

// ============================================================
// Brainstorm Board — หน้ากระดานของ Content Project
// ก้อน 2: top bar (Slides/Drive/สถานะ) + การ์ด SKU + พื้นที่กระดาน (ก้อน 3 = canvas เต็ม)
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StandaloneShell } from "@/components/standalone-shell";
import { ERPModal } from "@/components/modal";
import { PROJECT_STATUS, SUMMARY_FIELDS, PRODUCTION_TASKS, getProject, updateProject, listItems, sendToProduction, type ProjectDetail, type BoardItem } from "../../data";
import { BoardCanvas } from "./board-canvas";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };

export default function BoardPage() {
  const params = useParams();
  const id = String(params.id);
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const pushToast = (type: Toast["type"], message: string) => { const tid = Date.now() + Math.random(); setToasts((q) => [...q, { id: tid, type, message }]); setTimeout(() => setToasts((q) => q.filter((t) => t.id !== tid)), 3500); };

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
            <button onClick={() => setSummaryOpen(true)} className="h-9 px-3 inline-flex items-center text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">📋 สรุปทิศทาง</button>
            <button onClick={() => setProdOpen(true)} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700">🚀 ส่งเข้าผลิต</button>
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

        {/* กระดาน Canvas */}
        {p.board_id
          ? <BoardCanvas boardId={p.board_id} pushToast={pushToast} />
          : <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400">ไม่พบกระดานของโปรเจกต์นี้</div>}
      </div>

      {summaryOpen && <SummaryModal project={p} onClose={() => setSummaryOpen(false)} onSaved={load} pushToast={pushToast} />}
      {prodOpen && <ProductionModal project={p} onClose={() => setProdOpen(false)} onDone={load} pushToast={pushToast} />}

      <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-2">
        {toasts.map((t) => <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === "success" ? "bg-emerald-600" : t.type === "error" ? "bg-red-600" : "bg-slate-800"}`}>{t.message}</div>)}
      </div>
    </StandaloneShell>
  );
}

const ITEM_TYPE_LABEL: Record<string, string> = { note: "โน้ต/ไอเดีย", image: "รูป reference", url: "ลิงก์", video_link: "วิดีโอ", google_slides: "Slides", sku_card: "สินค้า", task_card: "งาน", section: "โซน" };

// สรุปทิศทางที่เลือก
function SummaryModal({ project, onClose, onSaved, pushToast }: { project: ProjectDetail; onClose: () => void; onSaved: () => void; pushToast: (t: Toast["type"], m: string) => void }) {
  const [summary, setSummary] = useState<Record<string, string>>({ ...(project.summary ?? {}) });
  const [selected, setSelected] = useState<BoardItem[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (project.board_id) listItems(project.board_id).then((its) => setSelected(its.filter((i) => i.status === "selected"))).catch(() => { /* ignore */ }); }, [project.board_id]);

  const save = async () => { setSaving(true); try { await updateProject(project.id, { summary }); pushToast("success", "บันทึกสรุปแล้ว"); onSaved(); onClose(); } catch (e) { pushToast("error", (e as Error).message); } finally { setSaving(false); } };

  return (
    <ERPModal open onClose={onClose} title="📋 สรุปทิศทางที่เลือก" size="lg"
      footer={<><button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">ปิด</button><button onClick={save} disabled={saving} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">บันทึกสรุป</button></>}>
      <div className="space-y-3">
        {SUMMARY_FIELDS.map((f) => (
          <div key={f.key}><label className="text-xs text-slate-400">{f.label}</label>
            <input value={summary[f.key] ?? ""} onChange={(e) => setSummary((s) => ({ ...s, [f.key]: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
        ))}
        <div>
          <p className="text-xs text-slate-400 mb-1">สินค้าที่เลือก</p>
          <div className="flex flex-wrap gap-1.5">{project.skus.map((s) => <span key={s.sku_id} className="text-xs bg-slate-100 rounded-full px-2 py-0.5">{s.code}</span>)}{project.skus.length === 0 && <span className="text-xs text-slate-400">—</span>}</div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">item ที่ติด "เลือก" บนกระดาน ({selected.length})</p>
          {selected.length === 0 ? <p className="text-xs text-slate-400 italic">ยังไม่มี item ที่ติดเลือก — ไปกดเลือกบนกระดานก่อน</p> : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {selected.map((it) => <div key={it.id} className="flex items-center gap-2 text-sm border border-slate-100 rounded px-2 py-1"><span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1">{ITEM_TYPE_LABEL[it.item_type] ?? it.item_type}</span><span className="text-slate-700 line-clamp-1">{it.title || it.content || it.url || it.sku_info?.code || "(item)"}</span></div>)}
            </div>
          )}
        </div>
      </div>
    </ERPModal>
  );
}

// ส่งเข้าผลิต — เลือกชุดงานมาตรฐานแล้วสร้างงานจริง
function ProductionModal({ project, onClose, onDone, pushToast }: { project: ProjectDetail; onClose: () => void; onDone: () => void; pushToast: (t: Toast["type"], m: string) => void }) {
  const ref = project.parent_sku_code || project.name;
  const [checked, setChecked] = useState<Record<string, boolean>>(Object.fromEntries(PRODUCTION_TASKS.map((t) => [t.task_type, true])));
  const [busy, setBusy] = useState(false);
  const toggle = (k: string) => setChecked((c) => ({ ...c, [k]: !c[k] }));

  const send = async () => {
    const tasks = PRODUCTION_TASKS.filter((t) => checked[t.task_type]).map((t) => ({ task_type: t.task_type, title: `${t.label} — ${ref}` }));
    if (tasks.length === 0) { pushToast("error", "เลือกอย่างน้อย 1 งาน"); return; }
    setBusy(true);
    try { const n = await sendToProduction(project.id, tasks); pushToast("success", `สร้าง ${n} งานเข้า Task Manager แล้ว`); onDone(); onClose(); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="🚀 ส่งเข้าผลิต" description="สร้างงานจริงเข้า Task Manager (คิว/ตาราง/Kanban/ปฏิทิน) ผูกกับโปรเจกต์นี้" size="md"
      footer={<><button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">ยกเลิก</button><button onClick={send} disabled={busy} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "กำลังสร้าง..." : "สร้างงาน"}</button></>}>
      <p className="text-xs text-slate-400 mb-2">เลือกงานที่จะสร้าง (อ้างอิง: <span className="font-mono">{ref}</span>)</p>
      <div className="space-y-1.5">
        {PRODUCTION_TASKS.map((t) => (
          <label key={t.task_type} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" checked={!!checked[t.task_type]} onChange={() => toggle(t.task_type)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
            <span className="text-sm text-slate-700">{t.label}</span>
          </label>
        ))}
      </div>
    </ERPModal>
  );
}
