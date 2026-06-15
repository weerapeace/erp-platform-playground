"use client";

// ============================================================
// TaskDetailDrawer (ของกลางในโมดูล) — งานเต็ม: สถานะ/คืบหน้า/ข้อมูล/subtask/คอมเมนต์/ไฟล์/เปลี่ยนสถานะ
// ใช้ที่: หน้า /tasks และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { ERPInput, ERPSelect } from "@/components/form";
import { UserPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { ImageAttach } from "@/components/image-attach";
import { useAuth } from "@/components/auth";
import { SubtaskManager } from "./subtask-manager";
import { taskTypeLabel, platformLabel, useCreativeOptions } from "./use-options";
import { statusMeta, transitionsFrom, isTerminal } from "./use-statuses";
import {
  PRIORITY_META, APPROVAL_META, ASSET_META, isOverdue,
  getTask, updateTask, addComment, addAttachment, deleteAttachment,
  type TaskDetail, type CreativeTask, type CreativePriority, type Campaign, type BrandOption,
} from "./data";

type ToastFn = (type: "success" | "error" | "info", m: string) => void;
const PRIORITY_OPTIONS = (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ value: k, label: PRIORITY_META[k].label }));
type EditForm = { task_type: string; priority: CreativePriority; brand_id: string; due_date: string; platforms: string[]; assignee: UserPickerValue | null; reviewer: UserPickerValue | null };

export function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>;
}
export function PriorityBadge({ priority }: { priority: CreativePriority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{m.label}</span>;
}

function Field({ label, value, highlight, dot }: { label: string; value: string | null | undefined; highlight?: boolean; dot?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium flex items-center gap-1.5 ${highlight ? "text-red-600" : "text-slate-800"}`}>
        {dot && value && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: dot || "#cbd5e1" }} />}
        {highlight && "⚠ "}{value || "—"}
      </p>
    </div>
  );
}

export function TaskDetailDrawer({ taskId, brands = [], campaigns = [], onClose, onChanged, onMove, onDelete, pushToast }: {
  taskId: string; brands?: BrandOption[]; campaigns?: Campaign[];
  onClose: () => void; onChanged: () => Promise<void> | void;
  onMove: (t: CreativeTask, toKey: string) => Promise<void>;
  onDelete: (id: string) => void;
  pushToast: ToastFn;
}) {
  const { taskTypes, platforms: platformOpts } = useCreativeOptions();
  const { user } = useAuth();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState<EditForm | null>(null);

  const load = useCallback(async () => {
    try { setDetail(await getTask(taskId)); }
    catch (e) { pushToast("error", `โหลดรายละเอียดไม่สำเร็จ: ${(e as Error).message}`); }
  }, [taskId, pushToast]);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => { await load(); await onChanged(); };
  const startEdit = () => {
    const d = detail; if (!d) return;
    setEf({ task_type: d.task_type ?? "", priority: d.priority, brand_id: d.brand_id ?? "", due_date: d.due_date ?? "", platforms: d.platforms ?? [],
      assignee: d.assignee_id ? ({ id: d.assignee_id, name: d.assignee_label ?? "" } as UserPickerValue) : null,
      reviewer: d.reviewer_id ? ({ id: d.reviewer_id, name: d.reviewer_label ?? "" } as UserPickerValue) : null });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!ef || !detail) return; setBusy(true);
    try {
      await updateTask(detail.id, { task_type: ef.task_type || null, priority: ef.priority, brand_id: ef.brand_id || null, due_date: ef.due_date || null, platforms: ef.platforms, assignee_id: ef.assignee?.id ?? null, reviewer_id: ef.reviewer?.id ?? null });
      setEditing(false); await refresh(); pushToast("success", "บันทึกแล้ว");
    } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };

  if (!detail) {
    return (
      <>
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
        <div className="fixed right-0 top-0 h-full w-[600px] max-w-[95vw] bg-white shadow-2xl z-50 flex items-center justify-center"><span className="text-slate-400">กำลังโหลด...</span></div>
      </>
    );
  }
  const t = detail;
  const isClosed = isTerminal(t.status);
  const actions = transitionsFrom(t.status);
  // สิทธิ์งานย่อย: ผจก./admin = จัดการได้หมด · ผู้ตรวจ = อนุมัติได้ · คนสร้างงาน = แก้ผู้รับผิดชอบได้
  const isManager = user?.role === "admin" || user?.role === "manager";
  const canApproveSub = isManager || (!!user?.id && user.id === t.reviewer_id);
  const canManageAssignees = isManager || (!!user?.id && user.id === t.created_by);

  const handleMove = async (toKey: string) => { setBusy(true); await onMove(t, toKey); await refresh(); setBusy(false); };
  const sendComment = async () => { if (!commentText.trim()) return; try { await addComment(t.id, commentText.trim()); setCommentText(""); await load(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(t.id, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim() }); setLinkLabel(""); setLinkUrl(""); await load(); } catch (e) { pushToast("error", (e as Error).message); } };

  const brandColor = brands.find((b) => b.id === t.brand_id)?.color ?? t.brand_color;
  const campaignName = campaigns.find((c) => c.id === t.campaign_id)?.name ?? t.campaign_label;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0 flex-1 mr-2">
            <input defaultValue={t.title} title="คลิกเพื่อแก้ชื่องาน"
              onBlur={async (e) => { const v = e.target.value.trim(); if (v && v !== t.title) { try { await updateTask(t.id, { title: v }); await refresh(); } catch (err) { pushToast("error", (err as Error).message); } } }}
              className="text-base font-semibold text-slate-900 w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-violet-400 focus:outline-none" />
            <span className="font-mono text-xs text-slate-500">{t.task_no}</span>
          </div>
          <div className="flex items-center gap-1">
            {!editing && <button onClick={startEdit} className="h-8 px-2 text-xs text-violet-700 hover:bg-violet-50 rounded-md">✏️ แก้ไข</button>}
            <button onClick={() => onDelete(t.id)} className="h-8 px-2 text-xs text-red-500 hover:bg-red-50 rounded-md">ลบ</button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* status row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${APPROVAL_META[t.approval_status].cls}`}>อนุมัติ: {APPROVAL_META[t.approval_status].label}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ASSET_META[t.asset_status].cls}`}>{ASSET_META[t.asset_status].label}</span>
          </div>
          {/* progress */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1"><span>ความคืบหน้า</span><span>{t.progress_percent}%</span></div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${t.progress_percent}%` }} /></div>
            {t.blocker_status === "blocked" && t.blocker_reason && <p className="text-xs text-red-600 mt-1">⚠ ติดปัญหา: {t.blocker_reason}</p>}
          </div>
          {/* meta / แก้ไข */}
          {editing && ef ? (
            <div className="border border-violet-200 rounded-lg p-3 bg-violet-50/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400">ประเภทงาน</label><ERPSelect value={ef.task_type} options={taskTypes} onChange={(e) => setEf({ ...ef, task_type: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400">ความสำคัญ</label><ERPSelect value={ef.priority} options={PRIORITY_OPTIONS} onChange={(e) => setEf({ ...ef, priority: e.target.value as CreativePriority })} /></div>
                <div><label className="text-xs text-slate-400">แบรนด์</label><ERPSelect value={ef.brand_id} options={[{ value: "", label: "— ไม่ระบุ —" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setEf({ ...ef, brand_id: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400">กำหนดส่ง</label><ERPInput type="date" value={ef.due_date} onChange={(e) => setEf({ ...ef, due_date: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400">ผู้รับผิดชอบ</label><UserPicker value={ef.assignee} onChange={(v) => setEf({ ...ef, assignee: v })} disableCreate /></div>
                <div><label className="text-xs text-slate-400">ผู้ตรวจ/อนุมัติ</label><UserPicker value={ef.reviewer} onChange={(v) => setEf({ ...ef, reviewer: v })} disableCreate /></div>
              </div>
              <div><label className="text-xs text-slate-400">แพลตฟอร์ม</label>
                <div className="flex flex-wrap gap-1.5 mt-1">{platformOpts.map((p) => { const on = ef.platforms.includes(p.value); return <button key={p.value} type="button" onClick={() => setEf({ ...ef, platforms: on ? ef.platforms.filter((x) => x !== p.value) : [...ef.platforms, p.value] })} className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>; })}</div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(false)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg">ยกเลิก</button>
                <button onClick={saveEdit} disabled={busy} className="h-8 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{busy ? "..." : "บันทึก"}</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="ประเภทงาน" value={t.task_type ? taskTypeLabel(t.task_type) : null} />
              <Field label="แบรนด์" value={t.brand_label} dot={brandColor} />
              <Field label="ผู้รับผิดชอบ" value={t.assignee_label} />
              <Field label="ผู้ตรวจ/อนุมัติ" value={t.reviewer_label || t.approver_label} />
              <Field label="กำหนดส่ง" value={t.due_date} highlight={isOverdue(t)} />
              <Field label="แคมเปญ" value={campaignName} />
              <Field label="Parent SKU" value={(t.parent_skus && t.parent_skus.length) ? t.parent_skus.map((p) => p.code).filter(Boolean).join(", ") : (t.parent_sku_code || null)} />
            </div>
          )}
          {/* SKU cards (m2m — ใส่ได้หลายรายการ) */}
          {(() => {
            const list = (t.skus && t.skus.length) ? t.skus : (t.sku_code ? [{ id: "_", code: t.sku_code, name: t.sku_name || t.product_name, color: t.sku_color, price: t.sku_price }] : []);
            return list.length > 0 ? (
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="text-xs text-slate-400 mb-1.5">สินค้าที่เกี่ยวข้อง ({list.length})</p>
                <div className="space-y-1.5">
                  {list.map((s, i) => (
                    <div key={s.id || i} className="flex items-center gap-2 flex-wrap">
                      {s.code && <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded">{s.code}</span>}
                      <span className="text-slate-700">{s.name}</span>
                      {s.color && <span className="text-xs text-slate-400">สี: {s.color}</span>}
                      {s.price != null && <span className="text-xs text-slate-400">{Number(s.price).toLocaleString()}฿</span>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
          {/* platforms */}
          {!editing && t.platforms && t.platforms.length > 0 && <div className="flex flex-wrap gap-1.5">{t.platforms.map((p) => <span key={p} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{platformLabel(p)}</span>)}</div>}
          {/* description */}
          {t.description && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><p className="text-xs text-slate-400 mb-1">รายละเอียด</p>{t.description}</div>}
          {/* links */}
          {(t.drive_folder_url || t.final_asset_url || t.published_url) && (
            <div className="flex flex-wrap gap-2">
              {t.drive_folder_url && <a href={t.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">📁 โฟลเดอร์ Drive</a>}
              {t.final_asset_url && <a href={t.final_asset_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🖼 ไฟล์จริง</a>}
              {t.published_url && <a href={t.published_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🔗 ลิงก์ที่เผยแพร่</a>}
            </div>
          )}

          {/* subtasks — ใช้ของกลางจัดการสด */}
          <SubtaskManager taskId={t.id} pushToast={pushToast} canApprove={canApproveSub} canManageAssignees={canManageAssignees} />

          {/* รูปแนบ (อัปโหลด + ย่อ ≤800px) */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">รูปแนบ</p>
            <ImageAttach
              images={t.attachments.filter((a) => a.kind === "image" && a.r2_key).map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))}
              onAttach={async (r) => { await addAttachment(t.id, { kind: "image", ...r }); await load(); }}
              onDelete={async (aid) => { await deleteAttachment(t.id, aid); await load(); }}
              pushToast={pushToast} />
          </div>

          {/* attachments (ลิงก์) */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ลิงก์แนบ ({t.attachments.filter((a) => a.kind !== "image").length})</p>
            <div className="space-y-1.5 mb-2">
              {t.attachments.filter((a) => a.kind !== "image").map((a) => (
                <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm text-violet-700 hover:bg-violet-50">
                  🔗 <span className="truncate">{a.label || a.url}</span>
                </a>
              ))}
              {t.attachments.filter((a) => a.kind !== "image").length === 0 && <p className="text-sm text-slate-400 italic">ยังไม่มีลิงก์แนบ</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="ชื่อ (ไม่บังคับ)" />
              <ERPInput value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="วางลิงก์ Drive/URL" />
              <button onClick={addLink} className="h-9 px-3 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 shrink-0">แนบ</button>
            </div>
          </div>

          {/* comments */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ความคิดเห็น ({t.comments.length})</p>
            <div className="space-y-2 mb-3">
              {t.comments.map((c) => (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-medium text-slate-700">{c.author_name || "ผู้ใช้"}</span><span className="text-xs text-slate-400">{c.created_at.slice(0, 16).replace("T", " ")}</span></div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {t.comments.length === 0 && <p className="text-sm text-slate-400 italic">ยังไม่มีความคิดเห็น</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="เขียนความคิดเห็น..." />
              <button onClick={sendComment} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 shrink-0">ส่ง</button>
            </div>
          </div>
        </div>

        {/* footer actions */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2 flex-wrap">
          {actions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center w-full">{isClosed ? `งานปิดแล้ว (${statusMeta(t.status).label})` : "ไม่มีการกระทำ"} — ดูได้อย่างเดียว</p>
          ) : actions.map((a, i) => {
            const cls = a.kind === "approve" ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : a.kind === "reject" ? "text-red-600 border border-red-200 hover:bg-red-50"
              : a.kind === "revise" ? "text-orange-700 border border-orange-200 hover:bg-orange-50"
              : a.kind === "block" ? "text-red-600 border border-red-200 hover:bg-red-50"
              : i === 0 ? "flex-1 bg-violet-600 text-white hover:bg-violet-700" : "text-slate-600 border border-slate-200 hover:bg-slate-50";
            return <button key={a.to_key} disabled={busy} onClick={() => handleMove(a.to_key)} className={`h-9 px-4 text-sm font-medium rounded-lg disabled:opacity-50 ${cls}`}>{a.label}</button>;
          })}
        </div>
      </div>
    </>
  );
}
