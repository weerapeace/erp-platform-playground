"use client";

// ============================================================
// SubtaskManager (ของกลางในโมดูล) — จัดการงานย่อยแบบสด (โหลด/ติ๊กเสร็จ/เพิ่ม/แก้ผู้รับผิดชอบ/ไฟล์แนบ)
// ใช้ที่: TaskDetailDrawer (/tasks) และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPInput, ERPTextarea } from "@/components/form";
import { ImageAttach } from "@/components/image-attach";
import { UserPicker } from "@/components/pickers";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import type { UserPickerValue } from "@/components/pickers";
import {
  listSubtasks, addSubtask, updateSubtask, deleteSubtask, addAttachment, deleteAttachment, listSubtaskTypes,
  type CreativeSubtask, type SubtaskType,
} from "./data";

type ToastFn = (type: "success" | "error" | "info", m: string) => void;
type TypeMeta = Record<string, SubtaskType>;

// ป้ายปลายทางตอนอนุมัติ (อ่านง่าย)
const APPROVE_TARGET_HINT: Record<string, string> = {
  sku_media: "อนุมัติแล้ว → เพิ่มเข้าแกลเลอรีรูปสินค้า",
  cover: "อนุมัติแล้ว → ตั้งเป็นรูปปกสินค้า",
  sku_description: "อนุมัติแล้ว → บันทึกเข้า description สินค้า",
  description_media: "อนุมัติแล้ว → เพิ่มเข้า media คำอธิบาย",
};

// ④ สถานะงานย่อย: ยังไม่เริ่ม → กำลังทำ → ส่งงาน(รออนุมัติ) → อนุมัติ (ไม่มี "โพสต์แล้ว" แล้ว)
export const SUB_STEPS = [
  { key: "todo",        label: "ยังไม่เริ่ม", dot: "bg-slate-400" },
  { key: "in_progress", label: "กำลังทำ",     dot: "bg-blue-500" },
  { key: "submitted",   label: "รออนุมัติ",   dot: "bg-amber-500" },
  { key: "approved",    label: "อนุมัติแล้ว", dot: "bg-emerald-500" },
];
const subStepLabel = (st: string) => SUB_STEPS.find((s) => s.key === st)?.label ?? (st === "posted" || st === "done" ? "อนุมัติแล้ว" : "ยังไม่เริ่ม");
const subStepDot = (st: string) => (SUB_STEPS.find((s) => s.key === st)?.dot ?? ((st === "posted" || st === "done") ? "bg-emerald-500" : "bg-slate-400"));
const isSubDone = (st: string) => st === "approved" || st === "posted" || st === "done";

/** กล่องจัดการงานย่อยแบบครบ (โหลดเอง) — ใช้บน canvas/หน้าอื่นได้
 *  canApprove = เห็นปุ่มอนุมัติ (admin/ผจก./ผู้ตรวจ) · canManageAssignees = แก้ผู้รับผิดชอบได้ (admin/ผจก./คนสร้างงาน) */
export function SubtaskManager({ taskId, pushToast, canApprove = false, canManageAssignees = false }: { taskId: string; pushToast: ToastFn; canApprove?: boolean; canManageAssignees?: boolean }) {
  const { user } = useAuth();
  const t = useT();
  const [subs, setSubs] = useState<CreativeSubtask[]>([]);
  const [typeMeta, setTypeMeta] = useState<TypeMeta>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"mine" | "all">("mine"); // ② เปิดมาโชว์ "ของฉัน" ก่อน
  const reload = useCallback(async () => { try { setSubs(await listSubtasks(taskId)); } catch (e) { pushToast("error", (e as Error).message); } finally { setLoading(false); } }, [taskId, pushToast]);
  useEffect(() => { reload(); }, [reload]);
  // โหลด registry ชนิดงานย่อย (สำหรับ badge + fallback ค่าตั้ง legacy)
  useEffect(() => { listSubtaskTypes().then((ts) => setTypeMeta(Object.fromEntries(ts.map((x) => [x.key, x])))).catch(() => {}); }, []);
  const done = subs.filter((s) => isSubDone(s.status)).length;
  const mine = useMemo(() => subs.filter((s) => s.assignees.some((a) => a.id === user?.id)), [subs, user?.id]);
  // ถ้าไม่มีงานย่อยของฉันเลย → เด้งไปแท็บทั้งหมดให้อัตโนมัติ (ครั้งแรกที่โหลดเสร็จ)
  useEffect(() => { if (!loading && subs.length > 0 && mine.length === 0) setTab("all"); }, [loading, subs.length, mine.length]);
  const shown = tab === "mine" ? mine : subs;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("งานย่อย", "Subtasks")} {subs.length > 0 && `· ${done}/${subs.length}`}</p>
        {subs.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5 text-xs">
            <button onClick={() => setTab("mine")} className={`px-2 py-0.5 rounded ${tab === "mine" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>{t("ของฉัน", "Mine")} ({mine.length})</button>
            <button onClick={() => setTab("all")} className={`px-2 py-0.5 rounded ${tab === "all" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>{t("ทั้งหมด", "All")} ({subs.length})</button>
          </div>
        )}
      </div>
      {loading ? <p className="text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p> : (
        <div className="space-y-2">
          {shown.length === 0 ? <p className="text-sm text-slate-400 italic">{tab === "mine" ? t("ไม่มีงานย่อยที่มอบให้คุณ", "No subtasks assigned to you") : t("ยังไม่มีงานย่อย", "No subtasks yet")}</p> : shown.map((s) => <SubtaskCard key={s.id} sub={s} taskId={taskId} reload={reload} pushToast={pushToast} canApprove={canApprove} canManageAssignees={canManageAssignees} typeMeta={typeMeta} />)}
        </div>
      )}
      <AddSubtaskForm onAdd={async (body) => { await addSubtask(taskId, body); await reload(); }} pushToast={pushToast} />
    </div>
  );
}

// ฟอร์มเพิ่มงานย่อย (รวยเหมือนเทมเพลต — ชื่อ + รายละเอียด + ผู้รับผิดชอบหลายคน)
export function AddSubtaskForm({ onAdd, pushToast }: { onAdd: (body: { title: string; description?: string | null; assignee_ids?: string[] }) => Promise<void>; pushToast: ToastFn }) {
  const t = useT();
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
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-sm text-violet-700 hover:underline">＋ {t("เพิ่มงานย่อย", "Add Subtask")}</button>;
  return (
    <div className="mt-2 border border-violet-200 rounded-lg p-3 space-y-2 bg-violet-50/30">
      <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ชื่องานย่อย", "Subtask title")} />
      <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} placeholder={t("รายละเอียด (ไม่บังคับ)", "Description (optional)")} />
      <div>
        <p className="text-[11px] text-slate-400 mb-1">{t("ผู้รับผิดชอบ (เลือกได้หลายคน)", "Assignees (multiple allowed)")}</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        </div>
        <UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name }]); setAdding(null); }} disableCreate />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={submit} disabled={busy} className="h-8 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : t("เพิ่ม", "Add")}</button>
      </div>
    </div>
  );
}

// การ์ดงานย่อย — สถานะเป็นปุ่มกด (เริ่ม→ส่งงาน→อนุมัติ) + ผู้รับผิดชอบ + ไฟล์แนบ
export function SubtaskCard({ sub, taskId, reload, pushToast, canApprove = false, canManageAssignees = false, typeMeta = {} }: { sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: ToastFn; canApprove?: boolean; canManageAssignees?: boolean; typeMeta?: TypeMeta }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(sub.description ?? "");
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = sub.assignees.map((a) => a.id);
  const attachCount = sub.attachments?.length ?? 0;
  const st = sub.status;
  // ชนิดงานย่อย + ความสามารถ (config ทับ registry · legacy ไม่มีค่า = อนุญาตหมด)
  const ty = sub.subtask_type ? typeMeta[sub.subtask_type] : undefined;
  const cfg = sub.config ?? {};
  const showImages = (cfg.accepts_image ?? ty?.accepts_image ?? true) !== false;
  const showLinks = (cfg.accepts_link ?? ty?.accepts_link ?? true) !== false;
  const approveTarget = cfg.approve_target ?? ty?.approve_target ?? "none";
  const approveHint = APPROVE_TARGET_HINT[approveTarget];

  const patch = async (p: Record<string, unknown>) => { setBusy(true); try { await updateSubtask(taskId, sub.id, p); await reload(); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); } };
  const addAssignee = async (v: UserPickerValue | null) => { if (!v || ids.includes(v.id)) return; setAdding(null); await patch({ assignee_ids: [...ids, v.id] }); };
  const del = async () => { if (!window.confirm(t(`ลบงานย่อย "${sub.title}" ?`, `Delete subtask "${sub.title}"?`))) return; try { await deleteSubtask(taskId, sub.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(taskId, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim(), subtask_id: sub.id }); setLinkLabel(""); setLinkUrl(""); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };

  // ③ ส่งงาน: ต้องแนบอย่างน้อย 1 (link หรือรูป) → status submitted (server แจ้งเตือนผู้อนุมัติ)
  const submitWork = async () => {
    if (attachCount === 0) { pushToast("error", t("กรุณาแนบลิงก์หรือรูปงานอย่างน้อย 1 ก่อนส่ง", "Please attach at least one file or link before submitting")); setOpen(true); return; }
    await patch({ status: "submitted" });
    pushToast("success", t("ส่งงานแล้ว — รออนุมัติ", "Submitted — pending approval"));
  };

  return (
    <div className="border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${subStepDot(st)}`} title={subStepLabel(st)} />
        {/* ปุ่ม action ตามสถานะ */}
        {st === "todo" && <button disabled={busy} onClick={() => patch({ status: "in_progress" })} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 hover:bg-blue-100 disabled:opacity-50">▶ {t("เริ่มงาน", "Start")}</button>}
        {st === "in_progress" && <button disabled={busy} onClick={submitWork} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 hover:bg-amber-100 disabled:opacity-50">📤 {t("ส่งงาน", "Submit")}</button>}
        {st === "submitted" && (canApprove
          ? <span className="shrink-0 inline-flex items-center gap-1"><button disabled={busy} onClick={() => patch({ status: "approved" })} className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 disabled:opacity-50">✓ {t("อนุมัติ", "Approve")}</button><button disabled={busy} onClick={() => patch({ status: "in_progress" })} title={t("ตีกลับให้แก้", "Send back for revision")} className="text-xs text-slate-500 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50">↩︎</button></span>
          : <span className="shrink-0 text-xs font-medium text-amber-600">⏳ {t("รออนุมัติ", "Pending approval")}</span>)}
        {isSubDone(st) && <span className="shrink-0 text-xs font-medium text-emerald-600">✓ {subStepLabel(st)}</span>}
        {ty && <span className="shrink-0 text-sm leading-none" title={ty.label_th}>{ty.icon ?? "🧩"}</span>}
        <button onClick={() => setOpen((o) => !o)} className={`text-sm flex-1 text-left ${isSubDone(st) ? "line-through text-slate-400" : "text-slate-700"}`}>{sub.title}</button>
        {sub.required_before_next && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">{t("ต้องเสร็จก่อน", "Must finish first")}</span>}
        <div className="flex -space-x-1">{sub.assignees.slice(0, 3).map((a) => <span key={a.id} title={a.label} className="h-5 w-5 rounded-full text-[10px] flex items-center justify-center border border-white" style={a.color ? { background: a.color, color: "#fff" } : { background: "#ede9fe", color: "#6d28d9" }}>{(a.label || "?").slice(0, 1)}</span>)}</div>
        {attachCount > 0 && <span className="text-[10px] text-slate-400">📎{attachCount}</span>}
        <button onClick={() => setOpen((o) => !o)} className="text-slate-300 text-xs">{open ? "▲" : "▼"}</button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100">
          {approveHint && <p className="text-[11px] text-emerald-600">↗ {approveHint}</p>}
          <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if ((desc.trim() || null) !== (sub.description || null)) patch({ description: desc.trim() || null }); }} placeholder={t("รายละเอียดงานย่อย...", "Subtask description...")} />
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ผู้รับผิดชอบ", "Assignee")}{canManageAssignees ? ` (${t("เลือกได้หลายคน", "multiple allowed")})` : ""}</p>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {sub.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}{canManageAssignees && <button onClick={() => patch({ assignee_ids: ids.filter((x) => x !== a.id) })} className="text-slate-400 hover:text-red-500">✕</button>}</span>)}
              {sub.assignees.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มี", "None")}</span>}
            </div>
            {canManageAssignees
              ? <UserPicker value={adding} onChange={addAssignee} disableCreate />
              : <p className="text-[11px] text-slate-400 italic">{t("เฉพาะหัวหน้า/ผู้สร้างงานเปลี่ยนผู้รับผิดชอบได้", "Only managers or task creators can change assignees")}</p>}
          </div>
          {showImages && (
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("รูปแนบงาน (ย่อ ≤800px)", "Work images (resized ≤800px)")}</p>
            <ImageAttach
              images={(sub.attachments ?? []).filter((a) => a.kind === "image" && a.r2_key).map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))}
              onAttach={async (r) => { await addAttachment(taskId, { kind: "image", subtask_id: sub.id, ...r }); await reload(); }}
              onDelete={async (aid) => { try { await deleteAttachment(taskId, aid); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }}
              pushToast={pushToast} />
          </div>
          )}
          {showLinks && (
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ลิงก์ส่งงาน", "Work links")}</p>
            <div className="space-y-1 mb-1.5">
              {(sub.attachments ?? []).filter((a) => a.kind !== "image").map((a) => <div key={a.id} className="flex items-center gap-2 text-xs"><a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-violet-700 truncate flex-1">🔗 {a.label || a.url}</a><button onClick={async () => { try { await deleteAttachment(taskId, a.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }} className="text-slate-300 hover:text-red-500">✕</button></div>)}
            </div>
            <div className="flex gap-1.5">
              <ERPInput value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder={t("ชื่อ", "Label")} />
              <ERPInput value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={t("วางลิงก์", "Paste link")} />
              <button onClick={addLink} className="h-9 px-2 text-xs text-violet-700 border border-violet-200 rounded-lg shrink-0">{t("แนบ", "Attach")}</button>
            </div>
          </div>
          )}
          {/* ปุ่มส่งงานในกล่อง (เห็นง่ายตอนกำลังทำ) */}
          {st === "in_progress" && <button disabled={busy} onClick={submitWork} className="w-full h-9 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50">📤 {t("ส่งงาน (แนบงานก่อน → รออนุมัติ)", "Submit (attach files first → pending approval)")}</button>}
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" disabled={!canManageAssignees} checked={sub.required_before_next} onChange={(e) => patch({ required_before_next: e.target.checked })} />{t("ต้องเสร็จก่อนขั้นถัดไป", "Must complete before next step")}</label>
            {canManageAssignees && <button onClick={del} className="text-xs text-red-500 hover:underline">{t("ลบงานย่อย", "Delete Subtask")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
