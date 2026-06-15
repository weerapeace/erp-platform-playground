"use client";

// ============================================================
// CampaignDrawer (ของกลางในโมดูล) — drawer รายละเอียดแคมเปญ + งานในแคมเปญ + แก้สถานะ
// ใช้ที่: หน้า list แคมเปญ และหน้า Canvas ของแคมเปญ
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_META, getCampaign, updateCampaign, deleteTask, listBrands, type CampaignDetail, type CreativeStatus, type CreativeTask, type BrandOption } from "../data";
import { TaskDetailDrawer } from "../task-detail-drawer";
import { applyTaskTransition } from "../task-actions";
import { useRefetchOnFocus } from "@/lib/use-refetch-on-focus";
import { ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { RichTextEditor } from "@/components/rich-text";

export const CAMPAIGN_STATUS: { value: string; label: string; cls: string }[] = [
  { value: "planning", label: "วางแผน", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "active",   label: "กำลังทำ", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "done",     label: "จบแล้ว",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cancelled",label: "ยกเลิก",  cls: "bg-slate-100 text-slate-400 border-slate-200" },
];

type ToastType = "success" | "error" | "info";

export function CampaignDrawer({ campaignId, onClose, onChanged, pushToast }: { campaignId: string; onClose: () => void; onChanged?: () => void; pushToast: (type: ToastType, m: string) => void }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null); // งานที่กดเปิด (งานเต็มทับขึ้นมา)
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState<{ name: string; brand_id: string; owner: UserPickerValue | null; start_date: string; end_date: string; objective: string; detail_html: string } | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setDetail(await getCampaign(campaignId)); } catch (e) { pushToast("error", (e as Error).message); } }, [campaignId, pushToast]);
  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load); // กลับมาที่แท็บ → โหลดงานในแคมเปญใหม่

  const startEdit = async () => {
    const c = detail?.campaign; if (!c) return;
    if (!brands.length) { try { setBrands(await listBrands()); } catch { /* ignore */ } }
    setEf({ name: c.name, brand_id: c.brand_id ?? "", owner: c.owner_id ? ({ id: c.owner_id, name: c.owner_label ?? "" } as UserPickerValue) : null, start_date: c.start_date ?? "", end_date: c.end_date ?? "", objective: c.objective ?? "", detail_html: c.detail_html ?? "" });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!ef) return; setBusy(true);
    try { await updateCampaign(campaignId, { name: ef.name.trim(), brand_id: ef.brand_id || null, owner_id: ef.owner?.id ?? null, start_date: ef.start_date || null, end_date: ef.end_date || null, objective: ef.objective.trim() || null, detail_html: ef.detail_html || null }); setEditing(false); await load(); onChanged?.(); pushToast("success", "บันทึกแล้ว"); }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };

  const moveTask = async (task: CreativeTask, toKey: string) => { await applyTaskTransition(task, toKey, { pushToast }); };
  const removeTask = async (tid: string) => { try { await deleteTask(tid); pushToast("info", "ลบงานแล้ว"); setTaskId(null); await load(); onChanged?.(); } catch (e) { pushToast("error", (e as Error).message); } };

  const setStatus = async (status: string) => { try { await updateCampaign(campaignId, { status }); await load(); onChanged?.(); pushToast("success", "อัปเดตสถานะแล้ว"); } catch (e) { pushToast("error", (e as Error).message); } };

  const summaryItems = useMemo(() => detail ? Object.entries(detail.summary).sort((a, b) => b[1] - a[1]) : [], [detail]);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {!detail ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">กำลังโหลด...</div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 truncate">{detail.campaign.name}</h3>
                <span className="text-xs text-slate-500">{detail.task_count} งานในแคมเปญ</span>
              </div>
              <div className="flex items-center gap-1">
                {!editing && <button onClick={startEdit} className="h-8 px-2.5 flex items-center gap-1 rounded-md text-sm text-slate-600 hover:text-violet-700 hover:bg-violet-50 border border-slate-200">✏️ แก้ไข</button>}
                <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {editing && ef ? (
                /* ---- โหมดแก้ไข ---- */
                <div className="space-y-3">
                  <div><label className="text-xs text-slate-400">ชื่อแคมเปญ</label><ERPInput value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-slate-400">แบรนด์</label><ERPSelect value={ef.brand_id} onChange={(e) => setEf({ ...ef, brand_id: e.target.value })} placeholder="— ไม่ระบุ —" options={brands.map((b) => ({ value: b.id, label: b.name }))} /></div>
                    <div><label className="text-xs text-slate-400">ผู้ดูแล</label><UserPicker value={ef.owner} onChange={(v) => setEf({ ...ef, owner: v })} disableCreate /></div>
                    <div><label className="text-xs text-slate-400">เริ่ม</label><ERPInput type="date" value={ef.start_date} onChange={(e) => setEf({ ...ef, start_date: e.target.value })} /></div>
                    <div><label className="text-xs text-slate-400">สิ้นสุด</label><ERPInput type="date" value={ef.end_date} onChange={(e) => setEf({ ...ef, end_date: e.target.value })} /></div>
                  </div>
                  <div><label className="text-xs text-slate-400">วัตถุประสงค์</label><ERPTextarea rows={2} value={ef.objective} onChange={(e) => setEf({ ...ef, objective: e.target.value })} /></div>
                  <div><label className="text-xs text-slate-400 mb-1 block">รายละเอียด (จัดรูปแบบได้)</label><RichTextEditor value={ef.detail_html} onChange={(html) => setEf({ ...ef, detail_html: html })} placeholder="พิมพ์รายละเอียดแคมเปญ ใส่หัวข้อ/ลิสต์/ลิงก์ได้..." /></div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEdit} disabled={busy} className="px-4 h-9 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50">{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
                    <button onClick={() => setEditing(false)} disabled={busy} className="px-4 h-9 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                  </div>
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><p className="text-xs text-slate-400 mb-0.5">แบรนด์</p><p className="font-medium text-slate-800">{detail.campaign.brand_label || "—"}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">ผู้ดูแล</p><p className="font-medium text-slate-800">{detail.campaign.owner_label || "—"}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">ช่วงเวลา</p><p className="font-medium text-slate-800">{detail.campaign.start_date ?? "?"} → {detail.campaign.end_date ?? "?"}</p></div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">สถานะ</p>
                  <select value={detail.campaign.status} onChange={(e) => setStatus(e.target.value)} className="text-sm border border-slate-200 rounded-md px-2 py-1">
                    {CAMPAIGN_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              {detail.campaign.objective && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><p className="text-xs text-slate-400 mb-1">วัตถุประสงค์</p>{detail.campaign.objective}</div>}
              {detail.campaign.detail_html && <div className="rounded-lg border border-slate-100 p-3"><p className="text-xs text-slate-400 mb-1.5">รายละเอียด</p><RichTextEditor value={detail.campaign.detail_html} onChange={() => {}} editable={false} /></div>}
              </>
              )}

              {/* status summary */}
              {summaryItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">สรุปสถานะงาน</p>
                  <div className="flex flex-wrap gap-1.5">
                    {summaryItems.map(([st, n]) => { const m = STATUS_META[st as CreativeStatus] ?? STATUS_META.backlog; return <span key={st} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label} {n}</span>; })}
                  </div>
                </div>
              )}

              {/* task list */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">งานในแคมเปญ ({detail.tasks.length})</p>
                {detail.tasks.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">ยังไม่มีงาน — สร้างการ์ดงานบนกระดาน หรือสร้างที่หน้างาน แล้วเลือกแคมเปญนี้</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.tasks.map((t) => { const m = STATUS_META[t.status] ?? STATUS_META.backlog; return (
                      <button key={t.id} onClick={() => setTaskId(t.id)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-left hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.dot}`} />
                        <span className="text-sm text-slate-700 flex-1 line-clamp-1">{t.title}</span>
                        <span className="text-xs text-slate-400">{t.assignee_label || "—"}</span>
                        <span className="text-[11px] text-slate-400">{t.progress_percent}%</span>
                      </button>
                    ); })}
                  </div>
                )}
                <a href="/tasks" className="inline-block mt-3 text-sm text-violet-700 hover:underline">→ ไปที่ตารางงานทั้งหมด</a>
              </div>
            </div>
          </>
        )}
      </div>

      {/* งานเต็มทับขึ้นมา — ปิดแล้วกลับมาที่รายละเอียดแคมเปญ (ย้อนกลับได้) */}
      {taskId && <TaskDetailDrawer taskId={taskId} onClose={() => setTaskId(null)} onChanged={load} onMove={moveTask} onDelete={removeTask} pushToast={pushToast} />}
    </>
  );
}
