"use client";

// ============================================================
// SubtaskManager (ของกลางในโมดูล) — จัดการงานย่อยแบบสด (โหลด/ติ๊กเสร็จ/เพิ่ม/แก้ผู้รับผิดชอบ/ไฟล์แนบ)
// ใช้ที่: TaskDetailDrawer (/tasks) และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ERPInput, ERPTextarea } from "@/components/form";
import { ERPModal } from "@/components/modal";
import { ImageAttach, uploadResizedImage } from "@/components/image-attach";
import { UserPicker, ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import { cachedJson } from "@/lib/client-cache";
import { avatarSrc } from "@/lib/r2-image";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import type { UserPickerValue } from "@/components/pickers";
import {
  listSubtasks, addSubtask, updateSubtask, deleteSubtask, addAttachment, deleteAttachment, listSubtaskTypes,
  type CreativeSubtask, type SubtaskType, type SubtaskAssignee,
} from "./data";

// ตัวแก้สินค้ากลาง (ของกลาง) — เปิดแก้ Parent SKU จากป๊อปอัปส่งงาน · dynamic กัน import วน + ลด bundle
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

// อวตารผู้รับผิดชอบ (ของกลางในโมดูล) — รูปจริงที่พนักงานตั้งไว้ ไม่มี → วงกลมตัวอักษร+สีธีม
function AssigneeAvatar({ a, size = 20 }: { a: SubtaskAssignee; size?: number }) {
  const src = avatarSrc(a.avatar_url, size * 2);
  if (src) return <img src={src} alt={a.label} title={a.label} className="rounded-full object-cover border border-white shrink-0" style={{ width: size, height: size }} />;
  return <span title={a.label} className="rounded-full flex items-center justify-center border border-white font-medium shrink-0" style={{ width: size, height: size, fontSize: size * 0.5, background: a.color || "#ede9fe", color: a.color ? "#fff" : "#6d28d9" }}>{(a.label || "?").slice(0, 1)}</span>;
}
// ชิปผู้รับผิดชอบแบบอ่านอย่างเดียว (รูป + ชื่อ + ธีมสีจาง)
function AssigneeChip({ a }: { a: SubtaskAssignee }) {
  return <span className="inline-flex items-center gap-1 text-xs rounded-full pl-0.5 pr-2 py-0.5" style={{ background: (a.color || "#8b5cf6") + "1f" }}><AssigneeAvatar a={a} size={18} /><span className="text-slate-700">{a.label}</span></span>;
}

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
  { key: "todo",               label: "ยังไม่เริ่ม", dot: "bg-slate-400" },
  { key: "in_progress",        label: "กำลังทำ",     dot: "bg-blue-500" },
  { key: "submitted",          label: "รออนุมัติ",   dot: "bg-amber-500" },
  { key: "approved",           label: "อนุมัติแล้ว", dot: "bg-emerald-500" },
  { key: "revision_requested", label: "ขอแก้",       dot: "bg-orange-500" },
  { key: "canceled",           label: "ยกเลิก",      dot: "bg-slate-300" },
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
  const [workOpen, setWorkOpen] = useState(false); // ป๊อปอัปแนบงาน/ส่งงาน
  const [editOpen, setEditOpen] = useState(false); // ป๊อปอัปแก้ไขงานย่อย
  const [busy, setBusy] = useState(false);
  const attachCount = sub.attachments?.length ?? 0;
  const st = sub.status;
  // ชนิดงานย่อย + ความสามารถ (config ทับ registry · legacy ไม่มีค่า = อนุญาตหมด)
  const ty = sub.subtask_type ? typeMeta[sub.subtask_type] : undefined;
  const cfg = sub.config ?? {};
  const showImages = (cfg.accepts_image ?? ty?.accepts_image ?? true) !== false;
  const showLinks = (cfg.accepts_link ?? ty?.accepts_link ?? true) !== false;
  const approveTarget = cfg.approve_target ?? ty?.approve_target ?? "none";
  const approveHint = APPROVE_TARGET_HINT[approveTarget];
  // copy prompt: ให้ค่าจาก registry (ชนิดงาน) เป็นหลัก — งานรูปภาพ/รูปคำอธิบาย = ปิด (แม้ snapshot เก่าจะเปิดไว้)
  const hasPrompt = (ty?.has_copy_prompt ?? cfg.has_copy_prompt) === true;
  const imageAtts = (sub.attachments ?? []).filter((a) => a.kind === "image" && a.r2_key);
  const linkAtts = (sub.attachments ?? []).filter((a) => a.kind !== "image");
  const canSubmit = st === "in_progress"; // ส่งงานได้เฉพาะตอนกำลังทำ
  // งานที่ไม่รับรูป+ลิงก์ (เช่น เขียนคำอธิบาย) → ส่งงานโดยยืนยันรายละเอียด Platform แทนการแนบไฟล์
  const platformConfirm = !showImages && !showLinks;

  // คัดลอก prompt (เติมข้อมูลสินค้าฝั่ง server) ไปคลิปบอร์ด
  const copyPrompt = async () => {
    try {
      const j = await apiFetch(`/api/creative-tasks/${taskId}/subtasks?prompt_subtask_id=${sub.id}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      await navigator.clipboard.writeText(j.prompt || "");
      pushToast("success", t("คัดลอก prompt แล้ว — วางใน Codex/Claude ได้เลย", "Prompt copied"));
    } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };
  // คัดลอกลิงก์รูป (ลิงก์เต็ม) — ใช้แทนการ copy ไฟล์รูปจริง
  const copyImageLinks = async () => {
    if (!imageAtts.length) { pushToast("info", t("ยังไม่มีรูป", "No images yet")); return; }
    const urls = imageAtts.map((a) => `${location.origin}/api/r2-image?key=${encodeURIComponent(a.r2_key as string)}`);
    try { await navigator.clipboard.writeText(urls.join("\n")); pushToast("success", t("คัดลอกลิงก์รูปแล้ว", "Image links copied")); } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };

  const patch = async (p: Record<string, unknown>) => { setBusy(true); try { await updateSubtask(taskId, sub.id, p); await reload(); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); } };

  // ③ ส่งงาน/แนบงาน: เปิดป๊อปอัป (แนบรูป/ลิงก์ + กดส่ง) — การ์ดไม่ต้องโชว์ฟอร์มแนบเอง
  const openWork = () => setWorkOpen(true);

  return (
    <div className="border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${subStepDot(st)}`} title={subStepLabel(st)} />
        {/* ปุ่ม action ตามสถานะ */}
        {st === "todo" && <button disabled={busy} onClick={() => patch({ status: "in_progress" })} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 hover:bg-blue-100 disabled:opacity-50">▶ {t("เริ่มงาน", "Start")}</button>}
        {st === "in_progress" && <span className="shrink-0 inline-flex items-center gap-1">
          <button disabled={busy} onClick={openWork} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 hover:bg-amber-100 disabled:opacity-50">📤 {t("ส่งงาน", "Submit")}</button>
          <button disabled={busy} onClick={async () => { await patch({ status: "todo" }); pushToast("info", t("ยกเลิกการเริ่มงานแล้ว", "Start canceled")); }} title={t("กดผิด? ยกเลิกการเริ่มงาน (เอาตัวเองออกจากผู้รับผิดชอบ)", "Misclick? Cancel start (remove yourself from assignees)")} className="text-xs text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">↩︎ {t("ยกเลิกเริ่ม", "Un-start")}</button>
        </span>}
        {st === "submitted" && (canApprove
          ? <span className="shrink-0 inline-flex items-center gap-1">
              <button disabled={busy} onClick={() => patch({ status: "approved" })} className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 disabled:opacity-50">✓ {t("อนุมัติ", "Approve")}</button>
              <button disabled={busy} onClick={async () => { const r = window.prompt(t("เหตุผลที่ขอแก้ (ส่งให้ผู้ทำ)", "Reason for revision")); if (r === null) return; await patch({ status: "revision_requested", comment: r }); pushToast("info", t("ส่งกลับให้แก้แล้ว", "Sent back for revision")); }} title={t("ขอแก้", "Request revision")} className="text-xs text-orange-600 border border-orange-200 rounded-md px-1.5 py-0.5 hover:bg-orange-50 disabled:opacity-50">↩︎ {t("ขอแก้", "Revise")}</button>
              <button disabled={busy} onClick={async () => { const r = window.prompt(t("เหตุผลที่ยกเลิก", "Reason to cancel")); if (r === null) return; await patch({ status: "canceled", comment: r }); pushToast("info", t("ยกเลิกงานย่อยแล้ว", "Subtask canceled")); }} title={t("ยกเลิก", "Cancel")} className="text-xs text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">✕</button>
            </span>
          : <span className="shrink-0 text-xs font-medium text-amber-600">⏳ {t("รออนุมัติ", "Pending approval")}</span>)}
        {st === "revision_requested" && <button disabled={busy} onClick={() => patch({ status: "in_progress" })} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 hover:bg-blue-100 disabled:opacity-50">▶ {t("เริ่มแก้", "Start revision")}</button>}
        {st === "canceled" && <span className="shrink-0 text-xs font-medium text-slate-400">🚫 {t("ยกเลิก", "Canceled")}</span>}
        {isSubDone(st) && <span className="shrink-0 text-xs font-medium text-emerald-600">✓ {subStepLabel(st)}</span>}
        {ty && <span className="shrink-0 text-sm leading-none" title={ty.label_th}>{ty.icon ?? "🧩"}</span>}
        <button onClick={() => setOpen((o) => !o)} className={`text-sm flex-1 text-left ${isSubDone(st) ? "line-through text-slate-400" : "text-slate-700"}`}>{sub.title}</button>
        {sub.required_before_next && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">{t("ต้องเสร็จก่อน", "Must finish first")}</span>}
        <div className="flex -space-x-1">{sub.assignees.slice(0, 3).map((a) => <AssigneeAvatar key={a.id} a={a} size={20} />)}</div>
        {attachCount > 0 && <span className="text-[10px] text-slate-400">📎{attachCount}</span>}
        <button onClick={() => setOpen((o) => !o)} className="text-slate-300 text-xs">{open ? "▲" : "▼"}</button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-100">
          {approveHint && <p className="text-[11px] text-emerald-600">↗ {approveHint}</p>}
          {(st === "revision_requested" || st === "canceled") && ((sub.config as Record<string, unknown> | undefined)?.review_note as string | undefined) && (
            <p className="text-[11px] text-orange-600">📝 {st === "canceled" ? t("เหตุผลยกเลิก", "Cancel reason") : t("ขอแก้", "Revision")}: {(sub.config as Record<string, unknown>).review_note as string}</p>
          )}
          {(hasPrompt || imageAtts.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {hasPrompt && <button onClick={copyPrompt} className="text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2 py-1 hover:bg-violet-100">📋 {t("คัดลอก prompt", "Copy prompt")}</button>}
              {imageAtts.length > 0 && <button onClick={copyImageLinks} className="text-xs font-medium text-slate-600 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50">🔗 {t("คัดลอกลิงก์รูป", "Copy image links")}</button>}
            </div>
          )}
          {/* รายละเอียด (อ่านอย่างเดียว — ไม่มีไม่โชว์) */}
          {sub.description?.trim() && <p className="text-sm text-slate-600 whitespace-pre-wrap">{sub.description}</p>}
          {/* ผู้รับผิดชอบ (อ่านอย่างเดียว ธีม+รูปพนักงาน — ไม่มีไม่โชว์) */}
          {sub.assignees.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ", "Assignee")}:</span>
              {sub.assignees.map((a) => <AssigneeChip key={a.id} a={a} />)}
            </div>
          )}
          {/* ③ ไฟล์แนบ (compact) — โชว์เฉพาะที่มีอยู่ · ฟอร์มแนบ/ส่งงาน/ยืนยันไปอยู่ในป๊อปอัป */}
          <div className="space-y-2">
            {imageAtts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {imageAtts.slice(0, 8).map((a) => <img key={a.id} src={`/api/r2-image?key=${encodeURIComponent(a.r2_key as string)}&w=120`} alt={a.file_name ?? ""} className="h-12 w-12 rounded object-cover border border-slate-200" />)}
                {imageAtts.length > 8 && <span className="self-center text-[11px] text-slate-400">+{imageAtts.length - 8}</span>}
              </div>
            )}
            {linkAtts.length > 0 && (
              <div className="space-y-1">
                {linkAtts.map((a) => <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block text-xs text-violet-700 truncate">🔗 {a.label || a.url}</a>)}
              </div>
            )}
            <button onClick={openWork} className={`w-full h-9 rounded-lg text-sm font-medium ${canSubmit ? "bg-amber-500 text-white hover:bg-amber-600" : "text-violet-700 border border-violet-200 hover:bg-violet-50"}`}>
              {canSubmit
                ? (platformConfirm ? `📤 ${t("ตรวจ & ส่งงาน", "Review & submit")}` : `📤 ${t("ส่งงาน (แนบรูป/ลิงก์)", "Submit (attach files/links)")}`)
                : (platformConfirm ? `🔎 ${t("ดูรายละเอียด Platform", "View platform details")}` : `📎 ${attachCount > 0 ? t("จัดการไฟล์แนบ", "Manage attachments") : t("แนบงาน", "Attach work")}`)}
            </button>
          </div>
          {/* ปุ่มแก้ไขงานย่อย (รายละเอียด/ผู้รับผิดชอบ/ตั้งค่าต่างๆ ไปแก้ในป๊อปอัป) */}
          <div className="flex justify-end">
            <button onClick={() => setEditOpen(true)} className="text-xs text-slate-500 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50">✏️ {t("แก้ไขงานย่อย", "Edit subtask")}</button>
          </div>
        </div>
      )}
      {workOpen && <SubmitWorkModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} showImages={showImages} showLinks={showLinks} canSubmit={canSubmit} platformConfirm={platformConfirm} onClose={() => setWorkOpen(false)} />}
      {editOpen && <EditSubtaskModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} canManageAssignees={canManageAssignees} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

// ป๊อปอัปแก้ไขงานย่อย — ชื่อ/รายละเอียด/ผู้รับผิดชอบ/ต้องเสร็จก่อน + ลบ
// แยกจากการ์ดให้การ์ดเป็น readonly · ผู้รับผิดชอบ + ต้องเสร็จก่อน + ลบ = เฉพาะหัวหน้า/ผู้สร้างงาน
function EditSubtaskModal({ sub, taskId, reload, pushToast, canManageAssignees, onClose }: {
  sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: ToastFn; canManageAssignees: boolean; onClose: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(sub.title);
  const [desc, setDesc] = useState(sub.description ?? "");
  const [assignees, setAssignees] = useState<SubtaskAssignee[]>(sub.assignees);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [required, setRequired] = useState(sub.required_before_next);
  const [busy, setBusy] = useState(false);
  const idsKey = (xs: SubtaskAssignee[]) => xs.map((a) => a.id).join(",");
  const dirty = title.trim() !== sub.title || (desc.trim() || "") !== (sub.description || "") || required !== sub.required_before_next || idsKey(assignees) !== idsKey(sub.assignees);

  const save = async () => {
    if (!title.trim()) { pushToast("error", t("ใส่ชื่องานย่อยก่อน", "Title is required")); return; }
    setBusy(true);
    try {
      const p: Record<string, unknown> = { title: title.trim(), description: desc.trim() || null, required_before_next: required };
      if (canManageAssignees) p.assignee_ids = assignees.map((a) => a.id);
      await updateSubtask(taskId, sub.id, p);
      await reload();
      pushToast("success", t("บันทึกแล้ว", "Saved"));
      onClose();
    } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(t(`ลบงานย่อย "${sub.title}" ?`, `Delete subtask "${sub.title}"?`))) return;
    setBusy(true);
    try { await deleteSubtask(taskId, sub.id); await reload(); onClose(); }
    catch (e) { pushToast("error", (e as Error).message); setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="md" title={t("แก้ไขงานย่อย", "Edit subtask")} hasUnsavedChanges={dirty}
      footer={
        <div className="flex items-center justify-between gap-2">
          {canManageAssignees ? <button onClick={del} disabled={busy} className="text-xs text-red-500 hover:underline disabled:opacity-50">{t("ลบงานย่อย", "Delete subtask")}</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
            <button onClick={save} disabled={busy || !dirty} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{t("บันทึก", "Save")}</button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ชื่องานย่อย", "Title")}</p>
          <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ชื่องานย่อย", "Subtask title")} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("รายละเอียด", "Description")}</p>
          <ERPTextarea value={desc} rows={3} onChange={(e) => setDesc(e.target.value)} placeholder={t("รายละเอียดงานย่อย (ไม่บังคับ)", "Subtask description (optional)")} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ผู้รับผิดชอบ", "Assignee")}{canManageAssignees ? ` (${t("เลือกได้หลายคน", "multiple allowed")})` : ""}</p>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs rounded-full pl-0.5 pr-1.5 py-0.5" style={{ background: (a.color || "#8b5cf6") + "1f" }}><AssigneeAvatar a={a} size={18} /><span className="text-slate-700">{a.label}</span>{canManageAssignees && <button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button>}</span>)}
            {assignees.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มี", "None")}</span>}
          </div>
          {canManageAssignees
            ? <UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name, color: null, avatar_url: null }]); setAdding(null); }} disableCreate />
            : <p className="text-[11px] text-slate-400 italic">{t("เฉพาะหัวหน้า/ผู้สร้างงานเปลี่ยนผู้รับผิดชอบได้", "Only managers or task creators can change assignees")}</p>}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" disabled={!canManageAssignees} checked={required} onChange={(e) => setRequired(e.target.checked)} />{t("ต้องเสร็จก่อนขั้นถัดไป", "Must complete before next step")}</label>
      </div>
    </ERPModal>
  );
}

type PlatformParent = { id: string; code: string; name_th: string; name_platform: string; introduction: string; description: string; english_description: string; has_description: boolean };

// ป๊อปอัปแนบงาน/ส่งงาน
// - งานปกติ (รับรูป/ลิงก์): แนบ ≥1 ก่อนส่ง
// - งานเขียนคำอธิบาย (ไม่รับรูป/ลิงก์ = platformConfirm): ไม่ต้องแนบ แต่โชว์รายละเอียด Platform ของ
//   Parent SKU ให้ตรวจ + ต้องมีรายละเอียด (description) ครบทุกตัวก่อนถึงส่งได้
function SubmitWorkModal({ sub, taskId, reload, pushToast, showImages, showLinks, canSubmit, platformConfirm, onClose }: {
  sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: ToastFn;
  showImages: boolean; showLinks: boolean; canSubmit: boolean; platformConfirm: boolean; onClose: () => void;
}) {
  const t = useT();
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [parents, setParents] = useState<PlatformParent[] | null>(null);
  const [skusByParent, setSkusByParent] = useState<Record<string, { id: string; code: string; name: string; image_key: string | null }[]>>({});
  const [editParentId, setEditParentId] = useState<string | null>(null);                       // เปิดตัวแก้ Parent SKU กลาง
  const [skuEditor, setSkuEditor] = useState<{ recordId: string | null; parentId: string } | null>(null); // เปิดตัวแก้ SKU กลาง (recordId null = สร้างใหม่)
  // ── ปลายทางรูป (โหมดแนบรูป): ติ๊กเลือก Parent/SKU ที่จะดันรูปเข้าตอนอนุมัติ ──
  const [syncParentIds, setSyncParentIds] = useState<Set<string>>(new Set());
  const [syncSkuIds, setSyncSkuIds] = useState<Set<string>>(new Set());
  const [extraParents, setExtraParents] = useState<PlatformParent[]>([]);  // Parent ที่เลือกเพิ่มเอง (นอกเหนือที่ผูกกับงาน)
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [linkedSkuIds, setLinkedSkuIds] = useState<string[]>([]);          // SKU ที่ผูกกับงาน (ใช้ติ๊กล่วงหน้า)
  const [skuDraftImages, setSkuDraftImages] = useState<Record<string, { r2_key: string; file_name: string }[]>>({}); // รูปร่างต่อ SKU (เข้าตอนอนุมัติ)
  const syncInit = useRef(false);
  const imageAtts = (sub.attachments ?? []).filter((a) => a.kind === "image" && a.r2_key);
  const linkAtts = (sub.attachments ?? []).filter((a) => a.kind !== "image");
  const attachCount = sub.attachments?.length ?? 0;

  // โหลดรายละเอียด Platform ของ Parent SKU + SKU ลูก — ใช้ทั้งโหมดยืนยันคำอธิบาย และโหมดแนบรูป (เลือกปลายทาง)
  const loadPlatform = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/creative-tasks/${taskId}/subtasks?platform=1`).then((r) => r.json());
      const ps = (j.parents as PlatformParent[]) ?? [];
      setParents(ps);
      setLinkedSkuIds((j.linked_sku_ids as string[]) ?? []);
      const entries = await Promise.all(ps.map(async (p) => {
        try {
          const sj = await apiFetch(`/api/pickers/skus?parent_sku_id=${encodeURIComponent(p.id)}&limit=50`).then((r) => r.json());
          return [p.id, ((sj.data ?? []) as Record<string, unknown>[]).map((s) => ({ id: String(s.id), code: String(s.code ?? ""), name: String(s.name ?? s.name_th ?? ""), image_key: s.image_key ? String(s.image_key) : null }))] as const;
        } catch { return [p.id, [] as { id: string; code: string; name: string; image_key: string | null }[]] as const; }
      }));
      setSkusByParent((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    } catch { setParents([]); }
  }, [taskId]);
  useEffect(() => { if (platformConfirm || showImages) loadPlatform(); }, [platformConfirm, showImages, loadPlatform]);

  // อุ่นแคชตัวแก้สินค้า (Parent/SKU) ล่วงหน้าตั้งแต่เปิดป๊อปอัป — drawer "กรอกรายละเอียดสินค้า"/"แก้สินค้า"
  // ต้องรอ schema(field-registry) + relations โหลดก่อนถึงจะเปิด · prefetch ระหว่างผู้ใช้อ่านป๊อป → กดแล้วเปิดเร็ว
  useEffect(() => {
    if (!platformConfirm && !showImages) return;
    void cachedJson("/api/admin/field-registry-v2?module=parent-skus-v2").catch(() => {});
    void cachedJson("/api/admin/field-registry-v2?module=skus-v2").catch(() => {});
    void cachedJson("/api/master-v2/product_families?limit=500&include_inactive=true").catch(() => {});
    void cachedJson("/api/admin/reverse-relations?module=parent-skus-v2").catch(() => {});
    void cachedJson("/api/admin/reverse-relations?module=skus-v2").catch(() => {});
    // อุ่น "ตัว drawer" (โค้ดก้อนใหญ่ ~270KB) ล่วงหน้าด้วย — วัดจริงพบว่ากดครั้งแรกเสียเวลา ~430ms
    // ไปกับการโหลด+แปลงโค้ดก้อนนี้ พอ prefetch ระหว่างผู้ใช้อ่านป๊อป → กด "แก้สินค้า" เปิดเร็วทันที
    void import("@/components/master-crud").catch(() => {});
    void import("@/components/parent-description-images").catch(() => {});
  }, [platformConfirm, showImages]);

  // โหลด SKU ลูกของ parent เดียว (ใช้รีเฟรชหลังสร้าง/แก้ SKU — ครอบ parent ที่เลือกเพิ่มด้วย)
  const reloadSkusFor = useCallback(async (pid: string) => {
    try {
      const sj = await apiFetch(`/api/pickers/skus?parent_sku_id=${encodeURIComponent(pid)}&limit=50`).then((r) => r.json());
      setSkusByParent((m) => ({ ...m, [pid]: ((sj.data ?? []) as Record<string, unknown>[]).map((s) => ({ id: String(s.id), code: String(s.code ?? ""), name: String(s.name ?? s.name_th ?? ""), image_key: s.image_key ? String(s.image_key) : null })) }));
    } catch { /* noop */ }
  }, []);

  // ติ๊กล่วงหน้า: ใช้ค่าที่เคยเลือกถ้ามี ไม่งั้น prefill ด้วย Parent/SKU ที่ผูกกับงาน
  useEffect(() => {
    if (!showImages || syncInit.current || parents === null) return;
    const ex = sub.image_sync_targets;
    if (ex && ((ex.parent_ids?.length ?? 0) > 0 || (ex.sku_ids?.length ?? 0) > 0 || Object.keys(ex.sku_images ?? {}).length > 0)) {
      setSyncParentIds(new Set(ex.parent_ids ?? []));
      setSyncSkuIds(new Set(ex.sku_ids ?? []));
      setSkuDraftImages(Object.fromEntries(Object.entries(ex.sku_images ?? {}).map(([k, keys]) => [k, (keys as string[]).map((r) => ({ r2_key: r, file_name: "" }))])));
    } else {
      setSyncParentIds(new Set(parents.map((p) => p.id).filter(Boolean)));
      setSyncSkuIds(new Set(linkedSkuIds));
    }
    syncInit.current = true;
  }, [showImages, parents, linkedSkuIds, sub.image_sync_targets]);

  // เซฟปลายทาง + รูปร่างต่อ SKU ลงงานย่อย (best-effort) — ทั้งผู้ส่งและผู้ตรวจปรับได้ก่อนอนุมัติ
  const persistTargets = useCallback((pids: Set<string>, sids: Set<string>, skuImgs: Record<string, { r2_key: string; file_name: string }[]> = skuDraftImages) => {
    const sku_images = Object.fromEntries(Object.entries(skuImgs).map(([k, arr]) => [k, arr.map((x) => x.r2_key)]).filter(([, ks]) => (ks as string[]).length));
    updateSubtask(taskId, sub.id, { image_sync_targets: { parent_ids: [...pids], sku_ids: [...sids], sku_images } }).catch(() => {});
  }, [taskId, sub.id, skuDraftImages]);
  const toggleSyncParent = (pid: string) => { const n = new Set(syncParentIds); n.has(pid) ? n.delete(pid) : n.add(pid); setSyncParentIds(n); persistTargets(n, syncSkuIds); };
  const toggleSyncSku = (sid: string) => { const n = new Set(syncSkuIds); n.has(sid) ? n.delete(sid) : n.add(sid); setSyncSkuIds(n); persistTargets(syncParentIds, n); };
  const addSyncParent = async (p: ParentSkuPickerValue) => {
    if (!p) return;
    const exists = (parents ?? []).some((x) => x.id === p.id) || extraParents.some((x) => x.id === p.id);
    if (!exists) {
      setExtraParents((prev) => [...prev, { id: p.id, code: p.code, name_th: p.name, name_platform: "", introduction: "", description: "", english_description: "", has_description: false }]);
      await reloadSkusFor(p.id);
    }
    const n = new Set(syncParentIds); n.add(p.id); setSyncParentIds(n); persistTargets(n, syncSkuIds);
    setAddParentOpen(false);
  };
  const displayParents = useMemo(() => [...(parents ?? []), ...extraParents], [parents, extraParents]);

  // image-sync section: กล่องร่างรูปต่อ SKU — ลากเข้า = เก็บร่าง (เข้าแกลเลอรีตอนอนุมัติ)
  const [uploadingSku, setUploadingSku] = useState<string | null>(null);
  const addSkuDraftImages = async (skuId: string, files: FileList | File[]) => {
    const imgs = Array.from(files).filter((x) => x.type.startsWith("image/"));
    if (!imgs.length) return;
    setUploadingSku(skuId);
    try {
      const ups: { r2_key: string; file_name: string }[] = [];
      for (const f of imgs) { const up = await uploadResizedImage(f, { folder: "skus", max: 1200 }); ups.push({ r2_key: up.r2_key, file_name: up.file_name }); }
      setSkuDraftImages((prev) => { const next = { ...prev, [skuId]: [...(prev[skuId] ?? []), ...ups] }; persistTargets(syncParentIds, syncSkuIds, next); return next; });
    } catch (e) { pushToast("error", t("อัปรูปไม่สำเร็จ: ", "Upload failed: ") + (e as Error).message); } finally { setUploadingSku(null); }
  };
  const removeSkuDraftImage = (skuId: string, idx: number) => {
    setSkuDraftImages((prev) => { const next = { ...prev, [skuId]: (prev[skuId] ?? []).filter((_, i) => i !== idx) }; persistTargets(syncParentIds, syncSkuIds, next); return next; });
  };

  const platformReady = parents !== null && parents.length > 0 && parents.every((p) => p.has_description);
  const canPressSubmit = canSubmit && !busy && (platformConfirm ? platformReady : attachCount > 0);

  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(taskId, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim(), subtask_id: sub.id }); setLinkLabel(""); setLinkUrl(""); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };
  const submit = async () => {
    if (platformConfirm) {
      if (!platformReady) { pushToast("error", parents && parents.length === 0 ? t("งานนี้ยังไม่ได้ผูก Parent SKU", "No Parent SKU linked to this task") : t("ยังไม่มีรายละเอียด Platform ครบ — กรอกในสินค้าก่อนส่ง", "Platform details incomplete — fill them in the product first")); return; }
    } else if (attachCount === 0) {
      pushToast("error", t("กรุณาแนบลิงก์หรือรูปงานอย่างน้อย 1 ก่อนส่ง", "Please attach at least one file or link before submitting")); return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { status: "submitted" };
      if (showImages) {
        const sku_images = Object.fromEntries(Object.entries(skuDraftImages).map(([k, arr]) => [k, arr.map((x) => x.r2_key)]).filter(([, ks]) => (ks as string[]).length));
        body.image_sync_targets = { parent_ids: [...syncParentIds], sku_ids: [...syncSkuIds], sku_images }; // บันทึกปลายทาง + รูปร่างต่อ SKU ตอนส่ง
      }
      await updateSubtask(taskId, sub.id, body); await reload(); pushToast("success", t("ส่งงานแล้ว — รออนุมัติ", "Submitted — pending approval")); onClose();
    }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
    <ERPModal open onClose={onClose} size="md"
      title={platformConfirm ? t("ส่งงาน — ตรวจรายละเอียด Platform", "Submit — review platform details") : canSubmit ? t("ส่งงาน — แนบรูป/ลิงก์", "Submit work — attach files/links") : t("แนบไฟล์งาน", "Attach work files")}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {canSubmit && <button onClick={submit} disabled={!canPressSubmit} className="h-9 px-4 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50">📤 {t("ส่งงาน (รออนุมัติ)", "Submit (pending approval)")}</button>}
        </div>
      }>
      <div className="space-y-4">
        {/* โหมดยืนยันรายละเอียด Platform (งานเขียนคำอธิบาย — ไม่ต้องแนบไฟล์) */}
        {platformConfirm ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{t("ตรวจรายละเอียด Platform ของสินค้าให้ครบก่อนส่ง (ไม่ต้องแนบไฟล์)", "Review the product platform details before submitting (no file needed)")}</p>
            {parents === null ? <p className="text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p>
              : parents.length === 0 ? <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("งานนี้ยังไม่ได้ผูก Parent SKU — ผูกสินค้าก่อนส่งงาน", "No Parent SKU linked — link a product first")}</p>
              : parents.map((p) => (
                <div key={p.id || p.code} className={`rounded-lg border p-3 space-y-1.5 ${p.has_description ? "border-slate-200" : "border-rose-200 bg-rose-50/40"}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded">{p.code}</span>
                    <span className="text-sm font-medium text-slate-700">{p.name_platform || p.name_th || "—"}</span>
                    {p.has_description ? <span className="text-[10px] text-emerald-600 ml-auto">✓ {t("มีรายละเอียด", "Has details")}</span> : <span className="text-[10px] text-rose-600 ml-auto">⚠ {t("ยังไม่มีรายละเอียด", "Missing details")}</span>}
                  </div>
                  {p.introduction && <p className="text-xs text-slate-500 whitespace-pre-wrap line-clamp-3">{p.introduction}</p>}
                  {p.description
                    ? <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-6 border-t border-slate-100 pt-1.5">{p.description}</p>
                    : <p className="text-xs text-rose-600 border-t border-rose-100 pt-1.5">{t("ยังไม่มี Description — กดปุ่มด้านล่างกรอกได้เลย", "No Description yet — use the button below to fill it")}</p>}
                  <button onClick={() => setEditParentId(p.id)} disabled={!p.id} className={`w-full mt-1 h-8 rounded-md text-xs font-medium border disabled:opacity-50 ${p.has_description ? "text-violet-700 border-violet-200 hover:bg-violet-50" : "text-white bg-violet-600 border-violet-600 hover:bg-violet-700"}`}>
                    ✏️ {p.has_description ? t("แก้รายละเอียดสินค้า", "Edit product details") : t("กรอกรายละเอียดสินค้า (รายละเอียด Platform)", "Fill product details (Platform)")}
                  </button>
                  {/* สร้าง/แก้ SKU ทำในตัวแก้สินค้า (ปุ่มด้านบน) — ที่นี่แค่ตรวจคำอธิบาย */}
                  <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2 mt-1">💡 {t('ถ้าต้องการสร้าง/แก้ SKU ของสินค้านี้ ให้กดปุ่ม "กรอกรายละเอียดสินค้า" ด้านบนได้เลย', 'To create/edit SKUs for this product, use the "Fill product details" button above')}</p>
                </div>
              ))}
            {parents !== null && parents.length > 0 && !platformReady && <p className="text-xs text-rose-600">{t("ต้องมีรายละเอียด (Description) ครบทุกสินค้าก่อนถึงจะส่งงานได้", "All products need a Description before you can submit")}</p>}
          </div>
        ) : (
          <>
            {canSubmit && attachCount === 0 && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("แนบรูปหรือลิงก์อย่างน้อย 1 ก่อนกดส่งงาน", "Attach at least one image or link before submitting")}</p>}
            {showImages && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">{t("รูปแนบงาน (ย่อ ≤1200px)", "Work images (resized ≤1200px)")}</p>
                <ImageAttach
                  images={imageAtts.map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))}
                  onAttach={async (r) => { await addAttachment(taskId, { kind: "image", subtask_id: sub.id, ...r }); await reload(); }}
                  onDelete={async (aid) => { try { await deleteAttachment(taskId, aid); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }}
                  pushToast={pushToast} maxSize={1200} />
              </div>
            )}
            {/* ── ส่งรูปเข้าสินค้า (เลือกได้) — ติ๊ก Parent/SKU ที่จะให้รูปเข้าแกลเลอรีตอนอนุมัติ ── */}
            {showImages && (
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[11px] font-medium text-slate-500">📤 {t("ส่งรูปเข้าสินค้า (เลือกได้)", "Send images to products (optional)")}</p>
                  <span className="text-[10px] text-slate-400 shrink-0">{(syncParentIds.size + syncSkuIds.size) > 0 ? t(`เลือก ${syncParentIds.size} Parent · ${syncSkuIds.size} SKU`, `${syncParentIds.size} Parent · ${syncSkuIds.size} SKU`) : t("ไม่เลือก = แนบรูปเฉย ๆ", "None = attach only")}</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2">{t("ติ๊กสินค้าที่จะให้รูปเข้าแกลเลอรีตอนอนุมัติ · ไม่ติ๊ก = ไม่ส่งเข้าสินค้า", "Tick products to add the images to their gallery on approval · none = attach only")}</p>
                {displayParents.length === 0 && parents !== null ? (
                  <p className="text-xs text-slate-400 italic mb-2">{t("งานนี้ยังไม่ผูก Parent SKU — กดเลือกด้านล่างได้", "No Parent SKU linked — add one below")}</p>
                ) : displayParents.map((p) => {
                  const pon = syncParentIds.has(p.id);
                  return (
                    <div key={p.id} className={`rounded-lg border p-2.5 mb-1.5 ${pon ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={pon} onChange={() => toggleSyncParent(p.id)} className="h-4 w-4 rounded border-slate-300 text-amber-600 cursor-pointer" />
                        <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">{p.code}</span>
                        <span className="text-sm text-slate-700 truncate flex-1">{p.name_platform || p.name_th || "—"}</span>
                        <button type="button" onClick={() => setEditParentId(p.id)} title={t("แก้/เพิ่ม SKU ในตัวแก้สินค้า", "Manage SKUs in product editor")} className="text-[11px] text-violet-600 hover:underline shrink-0">✏️ {t("แก้สินค้า", "Edit product")}</button>
                      </div>
                      <div className="pl-6 mt-1.5 space-y-1">
                        {(skusByParent[p.id] ?? []).map((s) => { const son = syncSkuIds.has(s.id); const thumb = s.image_key ? `/api/r2-image?key=${encodeURIComponent(s.image_key)}` : null; const drafts = skuDraftImages[s.id] ?? []; return (
                          <div key={s.id} className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={son} onChange={() => toggleSyncSku(s.id)} className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 cursor-pointer" />
                              <HoverImage url={thumb} size={26} rounded="rounded" fallback="📦" />
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{s.code}</span>
                              <span className="text-slate-700 truncate flex-1">{s.name}</span>
                              <button type="button" onClick={() => setSkuEditor({ recordId: s.id, parentId: p.id })} className="text-violet-600 hover:underline shrink-0">✏️</button>
                            </div>
                            {/* กล่องร่างรูปของ SKU นี้ — ลากรูปมาใส่ (เข้าแกลเลอรีตอนอนุมัติ) */}
                            <div className="ml-6" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) void addSkuDraftImages(s.id, e.dataTransfer.files); }}>
                              <div className="rounded-md border border-dashed border-amber-200 bg-amber-50/30 px-2 py-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {drafts.map((im, j) => (
                                    <div key={j} className="relative group">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={`/api/r2-image?key=${encodeURIComponent(im.r2_key)}&w=64`} alt="" className="h-10 w-10 object-cover rounded border border-slate-200" />
                                      <button type="button" onClick={() => removeSkuDraftImage(s.id, j)} className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center bg-white rounded-full text-red-500 text-[9px] shadow opacity-0 group-hover:opacity-100">✕</button>
                                    </div>
                                  ))}
                                  <label className="h-10 px-2 inline-flex items-center gap-1 rounded border border-dashed border-amber-300 text-amber-700 text-[11px] cursor-pointer hover:bg-amber-50">
                                    {uploadingSku === s.id ? "⏳" : <>📥 {t("ลากรูปมาใส่ / เลือกไฟล์", "Drop or pick images")}</>}
                                    <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addSkuDraftImages(s.id, e.target.files); e.target.value = ""; }} />
                                  </label>
                                </div>
                                {drafts.length > 0 && <p className="text-[10px] text-amber-600 mt-0.5">{t(`ร่าง ${drafts.length} รูป — เข้าแกลเลอรี SKU ตอนอนุมัติ`, `${drafts.length} draft — added on approval`)}</p>}
                              </div>
                            </div>
                          </div>
                        ); })}
                        {(skusByParent[p.id] ?? []).length === 0 && <p className="text-[11px] text-slate-400 italic">{t("ยังไม่มี SKU", "No SKUs yet")}</p>}
                        <p className="text-[10px] text-slate-400 pt-0.5">💡 {t('สร้าง/เพิ่ม SKU กดปุ่ม "แก้สินค้า" ด้านบน (ตัวแก้สินค้ามีตารางเพิ่ม SKU)', 'Create/add SKUs via "Edit product" above')}</p>
                      </div>
                    </div>
                  );
                })}
                {addParentOpen ? (
                  <div className="flex items-start gap-1.5">
                    <div className="flex-1"><ParentSkuPicker value={null} onChange={(v) => { if (v) addSyncParent(v); }} /></div>
                    <button type="button" onClick={() => setAddParentOpen(false)} className="text-xs text-slate-400 mt-2 shrink-0">{t("ยกเลิก", "Cancel")}</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAddParentOpen(true)} className="text-xs text-amber-700 border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-50">➕ {t("เลือก Parent SKU เพิ่ม", "Add Parent SKU")}</button>
                )}
              </div>
            )}
            {showLinks && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">{t("ลิงก์ส่งงาน", "Work links")}</p>
                <div className="space-y-1 mb-1.5">
                  {linkAtts.map((a) => <div key={a.id} className="flex items-center gap-2 text-xs"><a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-violet-700 truncate flex-1">🔗 {a.label || a.url}</a><button onClick={async () => { try { await deleteAttachment(taskId, a.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }} className="text-slate-300 hover:text-red-500">✕</button></div>)}
                  {linkAtts.length === 0 && <p className="text-xs text-slate-400 italic">{t("ยังไม่มีลิงก์", "No links yet")}</p>}
                </div>
                <div className="flex gap-1.5">
                  <ERPInput value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder={t("ชื่อ", "Label")} />
                  <ERPInput value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={t("วางลิงก์", "Paste link")} />
                  <button onClick={addLink} className="h-9 px-2 text-xs text-violet-700 border border-violet-200 rounded-lg shrink-0">{t("แนบ", "Attach")}</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ERPModal>
      {/* overlay ต่อไปนี้อยู่ "นอก" ERPModal — กันเลย์เอาต์เด้งตอนเปิด drawer ซ้อนบนป๊อปอัป */}
      {/* ตัวแก้สินค้ากลาง — กรอก/แก้รายละเอียด Platform ของ Parent SKU แล้วเซฟกลับ · ปิดแล้วเช็ครายละเอียดใหม่ */}
      {editParentId && (
        <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={editParentId} startInEdit
          onClose={() => { setEditParentId(null); loadPlatform(); }} onChanged={loadPlatform} />
      )}
      {/* ตัวแก้ SKU กลาง — สร้าง/แก้ SKU ลูก (recordId null = สร้างใหม่ ใต้ parent ที่เลือก) */}
      {skuEditor && (
        <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" recordId={skuEditor.recordId} startInEdit
          createTitle={t("สร้าง SKU ใหม่", "New SKU")}
          createDefaults={skuEditor.recordId ? undefined : { parent_sku_id: skuEditor.parentId }}
          onClose={() => { const pid = skuEditor.parentId; setSkuEditor(null); reloadSkusFor(pid); }}
          onChanged={() => { reloadSkusFor(skuEditor.parentId); }} />
      )}
    </>
  );
}

