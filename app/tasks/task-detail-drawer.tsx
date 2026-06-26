"use client";

// ============================================================
// TaskDetailDrawer (ของกลางในโมดูล) — งานเต็ม: สถานะ/คืบหน้า/ข้อมูล/subtask/คอมเมนต์/ไฟล์/เปลี่ยนสถานะ
// ใช้ที่: หน้า /tasks และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ERPInput, ERPSelect } from "@/components/form";
import { UserPicker, ParentSkuPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { ImageAttach } from "@/components/image-attach";
import { ImageInput } from "@/components/image-input";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
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

// QuickField — คลิกที่ค่า → แก้ตรงนั้นทันที (เซฟอัตโนมัติ) · ไม่ active = แสดงค่าอ่านอย่างเดียว + ✎ ตอน hover
function QuickField({ label, value, dot, highlight, active, onOpen, onClose, editor }: {
  label: string; value: string | null | undefined; dot?: string | null; highlight?: boolean;
  active: boolean; onOpen: () => void; onClose: () => void; editor: ReactNode;
}) {
  if (active) {
    return (
      <div className="min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <div className="flex items-start gap-1">
          <div className="flex-1 min-w-0">{editor}</div>
          <button type="button" onClick={onClose} title="ปิด" className="text-slate-300 hover:text-slate-600 text-xs shrink-0 mt-2">✕</button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} title="คลิกเพื่อแก้" className="min-w-0 text-left group rounded-md -mx-1 px-1 py-0.5 hover:bg-violet-50/60 transition-colors">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium flex items-center gap-1.5 ${highlight ? "text-red-600" : "text-slate-800"}`}>
        {dot && value && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: dot || "#cbd5e1" }} />}
        {highlight && "⚠ "}<span className="truncate">{value || "—"}</span>
        <span className="text-[10px] text-violet-400 opacity-0 group-hover:opacity-100 shrink-0">✎</span>
      </p>
    </button>
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
  const t = useT();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState<EditForm | null>(null);
  const [qf, setQf] = useState<string | null>(null); // ฟิลด์ที่กำลัง quick edit
  const [coverEdit, setCoverEdit] = useState(false); // เปิดช่องตั้งรูปปก
  const { width: drawerW, startResize } = useDrawerResize("taskDrawerWidth", 640); // ลากปรับความกว้าง (ของกลาง)

  const load = useCallback(async () => {
    try { setDetail(await getTask(taskId)); }
    catch (e) { pushToast("error", `${t("โหลดรายละเอียดไม่สำเร็จ", "Failed to load details")}: ${(e as Error).message}`); }
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
      setEditing(false); await refresh(); pushToast("success", t("บันทึกแล้ว", "Saved"));
    } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };

  if (!detail) {
    return (
      <>
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
        <div style={{ width: drawerW }} className="fixed right-0 top-0 h-full max-w-[97vw] bg-white shadow-2xl z-50 flex items-center justify-center"><span className="text-slate-400">{t("กำลังโหลด...", "Loading...")}</span></div>
      </>
    );
  }
  const d = detail;
  const isClosed = isTerminal(d.status);
  const actions = transitionsFrom(d.status);
  // สิทธิ์งานย่อย: ผจก./admin = จัดการได้หมด · ผู้ตรวจ = อนุมัติได้ · คนสร้างงาน = แก้ผู้รับผิดชอบได้
  const isManager = user?.role === "admin" || user?.role === "manager";
  const canApproveSub = isManager || (!!user?.id && user.id === d.reviewer_id);
  const canManageAssignees = isManager || (!!user?.id && user.id === d.created_by);

  const handleMove = async (toKey: string) => { setBusy(true); await onMove(d, toKey); await refresh(); setBusy(false); };
  const sendComment = async () => { if (!commentText.trim()) return; try { await addComment(d.id, commentText.trim()); setCommentText(""); await load(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(d.id, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim() }); setLinkLabel(""); setLinkUrl(""); await load(); } catch (e) { pushToast("error", (e as Error).message); } };

  const brandColor = brands.find((b) => b.id === d.brand_id)?.color ?? d.brand_color;
  const campaignName = campaigns.find((c) => c.id === d.campaign_id)?.name ?? d.campaign_label;
  // quick edit: เซฟทันที (keepOpen=true สำหรับ multi เช่น Parent SKU ที่เพิ่ม/ลบหลายรอบ)
  const saveQuick = async (patch: Record<string, unknown>, keepOpen = false) => {
    setBusy(true);
    try { await updateTask(d.id, patch); await refresh(); if (!keepOpen) setQf(null); pushToast("success", t("บันทึกแล้ว", "Saved")); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  const parentList = d.parent_skus ?? [];
  // รูปปก: Parent SKU มาก่อน (ถ้ามีรูป ใช้ทับรูปที่อัปเอง) · ไม่มีค่อยใช้รูปที่อัปเอง
  const parentImg = parentList.find((p) => p.image_key)?.image_key ?? null;
  const coverKey = parentImg || d.cover_image_r2_key;
  const coverFromParent = !!parentImg;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div style={{ width: drawerW }} className="fixed right-0 top-0 h-full max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {/* ที่จับลากปรับความกว้าง (ขอบซ้าย) */}
        <div onMouseDown={startResize} title={t("ลากเพื่อปรับความกว้าง", "Drag to resize")} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-violet-400/40 active:bg-violet-400/60 z-[60]" />
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0 flex-1 mr-2">
            <input defaultValue={d.title} title={t("คลิกเพื่อแก้ชื่องาน", "Click to edit task name")}
              onBlur={async (e) => { const v = e.target.value.trim(); if (v && v !== d.title) { try { await updateTask(d.id, { title: v }); await refresh(); } catch (err) { pushToast("error", (err as Error).message); } } }}
              className="text-base font-semibold text-slate-900 w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-violet-400 focus:outline-none" />
            <span className="font-mono text-xs text-slate-500">{d.task_no}</span>
          </div>
          <div className="flex items-center gap-1">
            {!editing && <button onClick={startEdit} className="h-8 px-2 text-xs text-violet-700 hover:bg-violet-50 rounded-md">✏️ {t("แก้ไข", "Edit")}</button>}
            <button onClick={() => onDelete(d.id)} className="h-8 px-2 text-xs text-red-500 hover:bg-red-50 rounded-md">{t("ลบ", "Delete")}</button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* รูปปกของงาน — ไม่มี = ใช้รูปจาก Parent SKU · กดเปลี่ยน/เพิ่มได้ */}
          <div>
            {coverKey ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200">
                <img src={`/api/r2-image?key=${encodeURIComponent(coverKey)}&w=900`} alt="" className="w-full max-h-56 object-cover" />
                {coverFromParent && <span className="absolute top-2 left-2 text-[10px] bg-black/55 text-white px-1.5 py-0.5 rounded">{t("รูปจาก Parent SKU", "From Parent SKU")}</span>}
                <button type="button" onClick={() => setCoverEdit((v) => !v)} className="absolute top-2 right-2 text-xs bg-white/90 hover:bg-white text-slate-700 border border-slate-200 rounded-md px-2 py-0.5">✎ {t("เปลี่ยนรูปปก", "Change cover")}</button>
              </div>
            ) : (
              <button type="button" onClick={() => setCoverEdit(true)} className="w-full h-20 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-colors">🖼️ {t("เพิ่มรูปปก", "Add cover image")}</button>
            )}
            {coverEdit && (
              <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/30 p-3 space-y-2">
                <p className="text-[11px] text-slate-500">{t("รูปปกสำรอง — ถ้า Parent SKU มีรูป จะใช้รูป Parent SKU แทน", "Fallback cover — Parent SKU image takes priority when it has one")}</p>
                <ImageInput value={d.cover_image_r2_key ?? null} onChange={(k) => saveQuick({ cover_image_r2_key: k })} folder="creative-tasks" />
                <div className="flex justify-end"><button type="button" onClick={() => setCoverEdit(false)} className="text-xs text-slate-500 hover:underline">{t("เสร็จ", "Done")}</button></div>
              </div>
            )}
          </div>
          {/* status row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={d.status} />
            <PriorityBadge priority={d.priority} />
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${APPROVAL_META[d.approval_status].cls}`}>{t("อนุมัติ", "Approval")}: {APPROVAL_META[d.approval_status].label}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ASSET_META[d.asset_status].cls}`}>{ASSET_META[d.asset_status].label}</span>
          </div>
          {/* progress */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1"><span>{t("ความคืบหน้า", "Progress")}</span><span>{d.progress_percent}%</span></div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-500" style={{ width: `${d.progress_percent}%` }} /></div>
            {d.blocker_status === "blocked" && d.blocker_reason && <p className="text-xs text-red-600 mt-1">⚠ {t("ติดปัญหา", "Blocked")}: {d.blocker_reason}</p>}
          </div>
          {/* meta / แก้ไข */}
          {editing && ef ? (
            <div className="border border-violet-200 rounded-lg p-3 bg-violet-50/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400">{t("ประเภทงาน", "Task Type")}</label><ERPSelect value={ef.task_type} options={taskTypes} onChange={(e) => setEf({ ...ef, task_type: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400">{t("ความสำคัญ", "Priority")}</label><ERPSelect value={ef.priority} options={PRIORITY_OPTIONS} onChange={(e) => setEf({ ...ef, priority: e.target.value as CreativePriority })} /></div>
                <div><label className="text-xs text-slate-400">{t("แบรนด์", "Brand")}</label><ERPSelect value={ef.brand_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setEf({ ...ef, brand_id: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400">{t("กำหนดส่ง", "Due Date")}</label><ERPInput type="date" value={ef.due_date} onChange={(e) => setEf({ ...ef, due_date: e.target.value })} /></div>
                <div><label className="text-xs text-slate-400">{t("ผู้รับผิดชอบ", "Assignee")}</label><UserPicker value={ef.assignee} onChange={(v) => setEf({ ...ef, assignee: v })} disableCreate /></div>
                <div><label className="text-xs text-slate-400">{t("ผู้ตรวจ/อนุมัติ", "Reviewer / Approver")}</label><UserPicker value={ef.reviewer} onChange={(v) => setEf({ ...ef, reviewer: v })} disableCreate /></div>
              </div>
              <div><label className="text-xs text-slate-400">{t("แพลตฟอร์ม", "Platform")}</label>
                <div className="flex flex-wrap gap-1.5 mt-1">{platformOpts.map((p) => { const on = ef.platforms.includes(p.value); return <button key={p.value} type="button" onClick={() => setEf({ ...ef, platforms: on ? ef.platforms.filter((x) => x !== p.value) : [...ef.platforms, p.value] })} className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>; })}</div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(false)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
                <button onClick={saveEdit} disabled={busy} className="h-8 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{busy ? "..." : t("บันทึก", "Save")}</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <QuickField label={t("ประเภทงาน", "Task Type")} value={d.task_type ? taskTypeLabel(d.task_type) : null}
                active={qf === "task_type"} onOpen={() => setQf("task_type")} onClose={() => setQf(null)}
                editor={<ERPSelect value={d.task_type ?? ""} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...taskTypes]} onChange={(e) => saveQuick({ task_type: e.target.value || null })} />} />
              <QuickField label={t("แบรนด์", "Brand")} value={d.brand_label} dot={brandColor}
                active={qf === "brand"} onOpen={() => setQf("brand")} onClose={() => setQf(null)}
                editor={<ERPSelect value={d.brand_id ?? ""} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => saveQuick({ brand_id: e.target.value || null })} />} />
              <QuickField label={t("ผู้รับผิดชอบ", "Assignee")} value={d.assignee_label}
                active={qf === "assignee"} onOpen={() => setQf("assignee")} onClose={() => setQf(null)}
                editor={<UserPicker value={d.assignee_id ? ({ id: d.assignee_id, name: d.assignee_label ?? "" } as UserPickerValue) : null} onChange={(v) => saveQuick({ assignee_id: v?.id ?? null })} disableCreate />} />
              <QuickField label={t("ผู้ตรวจ/อนุมัติ", "Reviewer / Approver")} value={d.reviewer_label || d.approver_label}
                active={qf === "reviewer"} onOpen={() => setQf("reviewer")} onClose={() => setQf(null)}
                editor={<UserPicker value={d.reviewer_id ? ({ id: d.reviewer_id, name: d.reviewer_label ?? "" } as UserPickerValue) : null} onChange={(v) => saveQuick({ reviewer_id: v?.id ?? null })} disableCreate />} />
              <QuickField label={t("กำหนดส่ง", "Due Date")} value={d.due_date} highlight={isOverdue(d)}
                active={qf === "due_date"} onOpen={() => setQf("due_date")} onClose={() => setQf(null)}
                editor={<ERPInput type="date" defaultValue={d.due_date ?? ""} onChange={(e) => saveQuick({ due_date: e.target.value || null })} />} />
              <QuickField label={t("แคมเปญ", "Campaign")} value={campaignName}
                active={qf === "campaign"} onOpen={() => setQf("campaign")} onClose={() => setQf(null)}
                editor={<ERPSelect value={d.campaign_id ?? ""} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => saveQuick({ campaign_id: e.target.value || null })} />} />
              <QuickField label="Parent SKU" value={parentList.length ? parentList.map((p) => p.code).filter(Boolean).join(", ") : (d.parent_sku_code || null)}
                active={qf === "parent_sku"} onOpen={() => setQf("parent_sku")} onClose={() => setQf(null)}
                editor={
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1">
                      {parentList.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{p.code || p.name}<button type="button" onClick={() => saveQuick({ parent_sku_ids: parentList.filter((x) => x.id !== p.id).map((x) => x.id) }, true)} className="text-slate-400 hover:text-red-500">✕</button></span>)}
                      {parentList.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มี", "None")}</span>}
                    </div>
                    <ParentSkuPicker value={null} onChange={(v) => { if (v && !parentList.some((p) => p.id === v.id)) saveQuick({ parent_sku_ids: [...parentList.map((p) => p.id), v.id] }, true); }} />
                  </div>
                } />
            </div>
          )}
          {/* SKU cards (m2m — ใส่ได้หลายรายการ) */}
          {(() => {
            const list = (d.skus && d.skus.length) ? d.skus : (d.sku_code ? [{ id: "_", code: d.sku_code, name: d.sku_name || d.product_name, color: d.sku_color, price: d.sku_price }] : []);
            return list.length > 0 ? (
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="text-xs text-slate-400 mb-1.5">{t("สินค้าที่เกี่ยวข้อง", "Related Products")} ({list.length})</p>
                <div className="space-y-1.5">
                  {list.map((s, i) => (
                    <div key={s.id || i} className="flex items-center gap-2 flex-wrap">
                      {s.code && <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded">{s.code}</span>}
                      <span className="text-slate-700">{s.name}</span>
                      {s.color && <span className="text-xs text-slate-400">{t("สี", "Color")}: {s.color}</span>}
                      {s.price != null && <span className="text-xs text-slate-400">{Number(s.price).toLocaleString()}฿</span>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
          {/* platforms */}
          {!editing && d.platforms && d.platforms.length > 0 && <div className="flex flex-wrap gap-1.5">{d.platforms.map((p) => <span key={p} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{platformLabel(p)}</span>)}</div>}
          {/* description */}
          {d.description && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><p className="text-xs text-slate-400 mb-1">{t("รายละเอียด", "Description")}</p>{d.description}</div>}
          {/* links */}
          {(d.drive_folder_url || d.final_asset_url || d.published_url) && (
            <div className="flex flex-wrap gap-2">
              {d.drive_folder_url && <a href={d.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">📁 {t("โฟลเดอร์ Drive", "Drive Folder")}</a>}
              {d.final_asset_url && <a href={d.final_asset_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🖼 {t("ไฟล์จริง", "Final Asset")}</a>}
              {d.published_url && <a href={d.published_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🔗 {t("ลิงก์ที่เผยแพร่", "Published Link")}</a>}
            </div>
          )}

          {/* subtasks — ใช้ของกลางจัดการสด */}
          <SubtaskManager taskId={d.id} pushToast={pushToast} canApprove={canApproveSub} canManageAssignees={canManageAssignees} />

          {/* รูปแนบ (อัปโหลด + ย่อ ≤800px) */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("รูปแนบ", "Images")}</p>
            <ImageAttach
              images={d.attachments.filter((a) => a.kind === "image" && a.r2_key).map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))}
              onAttach={async (r) => { await addAttachment(d.id, { kind: "image", ...r }); await load(); }}
              onDelete={async (aid) => { await deleteAttachment(d.id, aid); await load(); }}
              pushToast={pushToast} />
          </div>

          {/* attachments (ลิงก์) */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("ลิงก์แนบ", "Attachments")} ({d.attachments.filter((a) => a.kind !== "image").length})</p>
            <div className="space-y-1.5 mb-2">
              {d.attachments.filter((a) => a.kind !== "image").map((a) => (
                <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm text-violet-700 hover:bg-violet-50">
                  🔗 <span className="truncate">{a.label || a.url}</span>
                </a>
              ))}
              {d.attachments.filter((a) => a.kind !== "image").length === 0 && <p className="text-sm text-slate-400 italic">{t("ยังไม่มีลิงก์แนบ", "No attachments yet")}</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder={t("ชื่อ (ไม่บังคับ)", "Label (optional)")} />
              <ERPInput value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={t("วางลิงก์ Drive/URL", "Paste Drive/URL link")} />
              <button onClick={addLink} className="h-9 px-3 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 shrink-0">{t("แนบ", "Attach")}</button>
            </div>
          </div>

          {/* comments */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("ความคิดเห็น", "Comments")} ({d.comments.length})</p>
            <div className="space-y-2 mb-3">
              {d.comments.map((c) => (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-medium text-slate-700">{c.author_name || t("ผู้ใช้", "User")}</span><span className="text-xs text-slate-400">{c.created_at.slice(0, 16).replace("T", " ")}</span></div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {d.comments.length === 0 && <p className="text-sm text-slate-400 italic">{t("ยังไม่มีความคิดเห็น", "No comments yet")}</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={t("เขียนความคิดเห็น...", "Write a comment...")} />
              <button onClick={sendComment} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 shrink-0">{t("ส่ง", "Send")}</button>
            </div>
          </div>
        </div>

        {/* footer actions */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2 flex-wrap">
          {actions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center w-full">{isClosed ? `${t("งานปิดแล้ว", "Task closed")} (${statusMeta(d.status).label})` : t("ไม่มีการกระทำ", "No actions available")} — {t("ดูได้อย่างเดียว", "Read only")}</p>
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
