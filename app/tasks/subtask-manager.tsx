"use client";

// ============================================================
// SubtaskManager (ของกลางในโมดูล) — จัดการงานย่อยแบบสด (โหลด/ติ๊กเสร็จ/เพิ่ม/แก้ผู้รับผิดชอบ/ไฟล์แนบ)
// ใช้ที่: TaskDetailDrawer (/tasks) และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { ERPInput, ERPTextarea } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import {
  listSubtasks, addSubtask, updateSubtask, deleteSubtask, addAttachment, deleteAttachment,
  type CreativeSubtask,
} from "./data";

type ToastFn = (type: "success" | "error" | "info", m: string) => void;

/** กล่องจัดการงานย่อยแบบครบ (โหลดเอง) — ใช้บน canvas/หน้าอื่นได้ */
export function SubtaskManager({ taskId, pushToast }: { taskId: string; pushToast: ToastFn }) {
  const [subs, setSubs] = useState<CreativeSubtask[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => { try { setSubs(await listSubtasks(taskId)); } catch (e) { pushToast("error", (e as Error).message); } finally { setLoading(false); } }, [taskId, pushToast]);
  useEffect(() => { reload(); }, [reload]);
  const done = subs.filter((s) => s.status === "done").length;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">งานย่อย {subs.length > 0 && `· ${done}/${subs.length}`}</p>
      {loading ? <p className="text-sm text-slate-400">กำลังโหลด...</p> : (
        <div className="space-y-2">
          {subs.map((s) => <SubtaskCard key={s.id} sub={s} taskId={taskId} reload={reload} pushToast={pushToast} />)}
        </div>
      )}
      <AddSubtaskForm onAdd={async (body) => { await addSubtask(taskId, body); await reload(); }} pushToast={pushToast} />
    </div>
  );
}

// ฟอร์มเพิ่มงานย่อย (รวยเหมือนเทมเพลต — ชื่อ + รายละเอียด + ผู้รับผิดชอบหลายคน)
export function AddSubtaskForm({ onAdd, pushToast }: { onAdd: (body: { title: string; description?: string | null; assignee_ids?: string[] }) => Promise<void>; pushToast: ToastFn }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignees, setAssignees] = useState<{ id: string; label: string }[]>([]);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await onAdd({ title: title.trim(), description: desc.trim() || null, assignee_ids: assignees.map((a) => a.id) }); setTitle(""); setDesc(""); setAssignees([]); setOpen(false); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-sm text-violet-700 hover:underline">＋ เพิ่มงานย่อย</button>;
  return (
    <div className="mt-2 border border-violet-200 rounded-lg p-3 space-y-2 bg-violet-50/30">
      <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่องานย่อย" />
      <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} placeholder="รายละเอียด (ไม่บังคับ)" />
      <div>
        <p className="text-[11px] text-slate-400 mb-1">ผู้รับผิดชอบ (เลือกได้หลายคน)</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        </div>
        <UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name }]); setAdding(null); }} disableCreate />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
        <button onClick={submit} disabled={busy} className="h-8 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : "เพิ่ม"}</button>
      </div>
    </div>
  );
}

// การ์ดงานย่อย — รายละเอียด + ผู้รับผิดชอบหลายคน (m2m) + ไฟล์แนบ
export function SubtaskCard({ sub, taskId, reload, pushToast }: { sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: ToastFn }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(sub.description ?? "");
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const ids = sub.assignees.map((a) => a.id);

  const patch = async (p: Record<string, unknown>) => { try { await updateSubtask(taskId, sub.id, p); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addAssignee = async (v: UserPickerValue | null) => { if (!v || ids.includes(v.id)) return; setAdding(null); await patch({ assignee_ids: [...ids, v.id] }); };
  const del = async () => { if (!window.confirm(`ลบงานย่อย "${sub.title}" ?`)) return; try { await deleteSubtask(taskId, sub.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(taskId, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim(), subtask_id: sub.id }); setLinkLabel(""); setLinkUrl(""); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };

  return (
    <div className="border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <input type="checkbox" checked={sub.status === "done"} onChange={() => patch({ status: sub.status === "done" ? "todo" : "done" })} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
        <button onClick={() => setOpen((o) => !o)} className={`text-sm flex-1 text-left ${sub.status === "done" ? "line-through text-slate-400" : "text-slate-700"}`}>{sub.title}</button>
        {sub.required_before_next && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">ต้องเสร็จก่อน</span>}
        <div className="flex -space-x-1">{sub.assignees.slice(0, 3).map((a) => <span key={a.id} title={a.label} className="h-5 w-5 rounded-full bg-violet-100 text-violet-700 text-[10px] flex items-center justify-center border border-white">{(a.label || "?").slice(0, 1)}</span>)}</div>
        {(sub.attachments?.length ?? 0) > 0 && <span className="text-[10px] text-slate-400">📎{sub.attachments!.length}</span>}
        <button onClick={() => setOpen((o) => !o)} className="text-slate-300 text-xs">{open ? "▲" : "▼"}</button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100">
          <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if ((desc.trim() || null) !== (sub.description || null)) patch({ description: desc.trim() || null }); }} placeholder="รายละเอียดงานย่อย..." />
          <div>
            <p className="text-[11px] text-slate-400 mb-1">ผู้รับผิดชอบ (เลือกได้หลายคน)</p>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {sub.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => patch({ assignee_ids: ids.filter((x) => x !== a.id) })} className="text-slate-400 hover:text-red-500">✕</button></span>)}
              {sub.assignees.length === 0 && <span className="text-xs text-slate-400">ยังไม่มี</span>}
            </div>
            <UserPicker value={adding} onChange={addAssignee} disableCreate />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">ไฟล์/ลิงก์ส่งงาน</p>
            <div className="space-y-1 mb-1.5">
              {(sub.attachments ?? []).map((a) => <div key={a.id} className="flex items-center gap-2 text-xs"><a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-violet-700 truncate flex-1">🔗 {a.label || a.url}</a><button onClick={async () => { try { await deleteAttachment(taskId, a.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }} className="text-slate-300 hover:text-red-500">✕</button></div>)}
            </div>
            <div className="flex gap-1.5">
              <ERPInput value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="ชื่อ" />
              <ERPInput value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="วางลิงก์" />
              <button onClick={addLink} className="h-9 px-2 text-xs text-violet-700 border border-violet-200 rounded-lg shrink-0">แนบ</button>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={sub.required_before_next} onChange={(e) => patch({ required_before_next: e.target.checked })} />ต้องเสร็จก่อนขั้นถัดไป</label>
            <button onClick={del} className="text-xs text-red-500 hover:underline">ลบงานย่อย</button>
          </div>
        </div>
      )}
    </div>
  );
}
