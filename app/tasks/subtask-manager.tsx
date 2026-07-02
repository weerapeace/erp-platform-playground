"use client";

// ============================================================
// SubtaskManager (ของกลางในโมดูล) — จัดการงานย่อยแบบสด (โหลด/ติ๊กเสร็จ/เพิ่ม/แก้ผู้รับผิดชอบ/ไฟล์แนบ)
// ใช้ที่: TaskDetailDrawer (/tasks) และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ERPInput, ERPTextarea } from "@/components/form";
import { ERPModal } from "@/components/modal";
import { ImageAttach, uploadResizedImage } from "@/components/image-attach";
import { UserPicker, ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { HoverImage } from "@/components/hover-image";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { apiFetch } from "@/lib/api";
import { cachedJson } from "@/lib/client-cache";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { TeamFill } from "./team-picker";
import { tr } from "@/lib/lang";
import type { UserPickerValue } from "@/components/pickers";
import { AssigneeAvatar, AssigneeChip } from "./assignee-avatar";
import {
  listSubtasks, addSubtask, updateSubtask, deleteSubtask, addAttachment, deleteAttachment, listSubtaskTypes,
  type CreativeSubtask, type SubtaskType, type SubtaskAssignee,
} from "./data";

// ตัวแก้สินค้ากลาง (ของกลาง) — เปิดแก้ Parent SKU จากป๊อปอัปส่งงาน · dynamic กัน import วน + ลด bundle
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

// อวตาร/ชิปผู้รับผิดชอบ — ของกลาง (แยกไฟล์เบา) · re-export กันโค้ดเดิมที่เคยอ้างจากไฟล์นี้
export { AssigneeAvatar, AssigneeChip };

type ToastFn = (type: "success" | "error" | "info", m: string) => void;
type TypeMeta = Record<string, SubtaskType>;

// ป้ายปลายทางตอนอนุมัติ (อ่านง่าย)
const APPROVE_TARGET_HINT: Record<string, () => string> = {
  sku_media: () => tr("อนุมัติแล้ว → เพิ่มเข้าแกลเลอรีรูปสินค้า", "Approved → added to product image gallery"),
  cover: () => tr("อนุมัติแล้ว → ตั้งเป็นรูปปกสินค้า", "Approved → set as product cover image"),
  sku_description: () => tr("อนุมัติแล้ว → บันทึกเข้า description สินค้า", "Approved → saved to product description"),
  description_media: () => tr("อนุมัติแล้ว → เพิ่มเข้า media คำอธิบาย", "Approved → added to description media"),
};

// ④ สถานะงานย่อย: ยังไม่เริ่ม → กำลังทำ → ส่งงาน(รออนุมัติ) → อนุมัติ (ไม่มี "โพสต์แล้ว" แล้ว)
export const SUB_STEPS = [
  { key: "todo",               label: () => tr("ยังไม่เริ่ม", "Not started"), dot: "bg-slate-400" },
  { key: "in_progress",        label: () => tr("กำลังทำ", "In progress"),     dot: "bg-blue-500" },
  { key: "submitted",          label: () => tr("รออนุมัติ", "Pending approval"),   dot: "bg-amber-500" },
  { key: "approved",           label: () => tr("อนุมัติแล้ว", "Approved"), dot: "bg-emerald-500" },
  { key: "revision_requested", label: () => tr("ขอแก้", "Revision requested"),       dot: "bg-orange-500" },
  { key: "canceled",           label: () => tr("ยกเลิก", "Canceled"),      dot: "bg-slate-300" },
];
const subStepLabel = (st: string) => SUB_STEPS.find((s) => s.key === st)?.label() ?? (st === "posted" || st === "done" ? tr("อนุมัติแล้ว", "Approved") : tr("ยังไม่เริ่ม", "Not started"));
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
  // มีงานย่อยชนิด "รูปคำอธิบาย" (จัดการ Description) อยู่แล้วไหม → งานอื่นจะได้ไม่โชว์ตัวเลือก Description ซ้ำ
  const hasDescSubtask = useMemo(() => subs.some((s) => {
    const cfg = (s.config ?? {}) as Record<string, unknown>;
    const tgt = cfg.approve_target ?? (s.subtask_type ? typeMeta[s.subtask_type]?.approve_target : undefined) ?? "none";
    return tgt === "description_media";
  }), [subs, typeMeta]);

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
          {shown.length === 0 ? <p className="text-sm text-slate-400 italic">{tab === "mine" ? t("ไม่มีงานย่อยที่มอบให้คุณ", "No subtasks assigned to you") : t("ยังไม่มีงานย่อย", "No subtasks yet")}</p> : shown.map((s) => <SubtaskCard key={s.id} sub={s} taskId={taskId} reload={reload} pushToast={pushToast} canApprove={canApprove} canManageAssignees={canManageAssignees} typeMeta={typeMeta} hasDescSibling={hasDescSubtask} />)}
        </div>
      )}
      <AddSubtaskForm onAdd={async (body) => { await addSubtask(taskId, body); await reload(); }} pushToast={pushToast} />
    </div>
  );
}

// ฟอร์มเพิ่มงานย่อย (รวยเหมือนเทมเพลต — ชื่อ + รายละเอียด + ผู้รับผิดชอบหลายคน)
export function AddSubtaskForm({ onAdd, pushToast }: { onAdd: (body: { title: string; title_en?: string | null; description?: string | null; assignee_ids?: string[] }) => Promise<void>; pushToast: ToastFn }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [desc, setDesc] = useState("");
  const [assignees, setAssignees] = useState<{ id: string; label: string }[]>([]);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await onAdd({ title: title.trim(), title_en: titleEn.trim() || null, description: desc.trim() || null, assignee_ids: assignees.map((a) => a.id) }); setTitle(""); setTitleEn(""); setDesc(""); setAssignees([]); setOpen(false); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setBusy(false); }
  };
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-sm text-violet-700 hover:underline">＋ {t("เพิ่มงานย่อย", "Add Subtask")}</button>;
  return (
    <div className="mt-2 border border-violet-200 rounded-lg p-3 space-y-2 bg-violet-50/30">
      <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ชื่องานย่อย (ไทย)", "Subtask title (Thai)")} />
      <ERPInput value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder={t("ชื่ออังกฤษ (ไม่บังคับ — โชว์ตอนสลับภาษา EN)", "English title (optional — shown in EN mode)")} />
      <ERPTextarea value={desc} rows={2} onChange={(e) => setDesc(e.target.value)} placeholder={t("รายละเอียด (ไม่บังคับ)", "Description (optional)")} />
      <div>
        <p className="text-[11px] text-slate-400 mb-1">{t("ผู้รับผิดชอบ (เลือกได้หลายคน)", "Assignees (multiple allowed)")}</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5">{a.label}<button onClick={() => setAssignees((xs) => xs.filter((x) => x.id !== a.id))} className="text-slate-400 hover:text-red-500">✕</button></span>)}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name }]); setAdding(null); }} disableCreate /></div>
          <TeamFill onPick={(members) => setAssignees((xs) => { const fresh = members.filter((m) => !xs.some((a) => a.id === m.id)).map((m) => ({ id: m.id, label: m.name })); return fresh.length ? [...xs, ...fresh] : xs; })} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={submit} disabled={busy} className="h-8 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? "..." : t("เพิ่ม", "Add")}</button>
      </div>
    </div>
  );
}

// ป๊อปอัป "ขอแก้" — เหตุผล + เลือกช่องที่ต้องแก้ (แทน window.prompt) · ลอยทับด้วย portal
function ReviseModal({ fields, busy, onCancel, onConfirm }: {
  fields?: { key: string; label: string }[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setChecked((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const picked = (fields ?? []).filter((f) => checked.has(f.key));
  const submit = () => {
    const parts: string[] = [];
    if (picked.length) parts.push(`${t("ต้องแก้", "Fix")}: ${picked.map((f) => f.label).join(", ")}`);
    if (reason.trim()) parts.push(reason.trim());
    onConfirm(parts.join("\n"));
  };
  const node = (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-slate-800">↩︎ {t("ขอแก้งานย่อย", "Request revision")}</p>
        {fields && fields.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">{t("เลือกช่องที่ต้องแก้ (ถ้ามี)", "Pick fields to fix (optional)")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-auto border border-slate-100 rounded-lg p-2">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={checked.has(f.key)} onChange={() => toggle(f.key)} className="h-3.5 w-3.5 rounded border-slate-300 text-orange-500" />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500 mb-1">{t("เหตุผล/รายละเอียดที่ต้องแก้", "Reason / details")}</p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus placeholder={t("เช่น รูปเบลอ, คำอธิบายยังไม่ครบ...", "e.g. blurry image, incomplete description...")} className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-orange-300 outline-none resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={submit} disabled={busy || (!reason.trim() && picked.length === 0)} className="h-9 px-4 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50">↩︎ {t("ส่งขอแก้", "Send")}</button>
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

// การ์ดงานย่อย — สถานะเป็นปุ่มกด (เริ่ม→ส่งงาน→อนุมัติ) + ผู้รับผิดชอบ + ไฟล์แนบ
export function SubtaskCard({ sub, taskId, reload, pushToast, canApprove = false, canManageAssignees = false, typeMeta = {}, hasDescSibling = false }: { sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: ToastFn; canApprove?: boolean; canManageAssignees?: boolean; typeMeta?: TypeMeta; hasDescSibling?: boolean }) {
  const t = useT();
  const { user } = useAuth();
  const [open, setOpen] = useState(true);   // กาง (ขยาย) งานย่อยเป็นค่าเริ่มต้น
  const [workOpen, setWorkOpen] = useState(false); // ป๊อปอัปแนบงาน/ส่งงาน
  const [editOpen, setEditOpen] = useState(false); // ป๊อปอัปแก้ไขงานย่อย
  const [cardLb, setCardLb] = useState(-1); // ดูรูปบนการ์ดเต็มจอ
  const [busy, setBusy] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false); // ป๊อปอัปขอแก้
  const attachCount = sub.attachments?.length ?? 0;
  const st = sub.status;
  // ชนิดงานย่อย + ความสามารถ (config ทับ registry · legacy ไม่มีค่า = อนุญาตหมด)
  const ty = sub.subtask_type ? typeMeta[sub.subtask_type] : undefined;
  const cfg = sub.config ?? {};
  const showImages = (cfg.accepts_image ?? ty?.accepts_image ?? true) !== false;
  const showLinks = (cfg.accepts_link ?? ty?.accepts_link ?? true) !== false;
  const approveTarget = cfg.approve_target ?? ty?.approve_target ?? "none";
  const approveHint = APPROVE_TARGET_HINT[approveTarget]?.();
  // copy prompt: ให้ค่าจาก registry (ชนิดงาน) เป็นหลัก — งานรูปภาพ/รูปคำอธิบาย = ปิด (แม้ snapshot เก่าจะเปิดไว้)
  const hasPrompt = (ty?.has_copy_prompt ?? cfg.has_copy_prompt) === true;
  const imageAtts = (sub.attachments ?? []).filter((a) => a.kind === "image" && a.r2_key);
  const linkAtts = (sub.attachments ?? []).filter((a) => a.kind !== "image");
  // รูปที่เพิ่มเข้าสินค้า (โชว์บนการ์ด) — จัดกลุ่มตามสินค้า + ป้ายรหัส (product_labels) · รวม sku_images เดิม
  const ist = sub.image_sync_targets as { product_images?: Record<string, string[]>; product_labels?: Record<string, string>; sku_images?: Record<string, string[]> } | null;
  const productGroups: { key: string; label: string; keys: string[] }[] = [];
  for (const [tk, keys] of Object.entries(ist?.product_images ?? {})) {
    const ks = (keys as string[]).filter(Boolean); if (!ks.length) continue;
    productGroups.push({ key: tk, label: ist?.product_labels?.[tk] || (tk.startsWith("parent:") ? "Parent SKU" : "SKU"), keys: ks });
  }
  for (const [sid, keys] of Object.entries(ist?.sku_images ?? {})) { const ks = (keys as string[]).filter(Boolean); if (ks.length) productGroups.push({ key: `legacy:${sid}`, label: ist?.product_labels?.[`sku:${sid}`] || "SKU", keys: ks }); }
  // เรียง Parent ก่อน แล้วตามด้วย SKU (รูปในกลุ่มเรียงตามลำดับที่จัดไว้อยู่แล้ว)
  productGroups.sort((a, b) => (a.key.startsWith("parent:") ? 0 : 1) - (b.key.startsWith("parent:") ? 0 : 1));
  const skuImgKeys = productGroups.flatMap((g) => g.keys);   // แบน ๆ ไว้ทำ lightbox/ดัชนี
  // รวมรูปทั้งหมดบนการ์ด (รูปงาน + รูปเข้าสินค้า) ไว้กดดูเต็มจอ/เลื่อน
  const cardImages: LightboxImage[] = [
    ...imageAtts.map((a) => ({ url: `/api/r2-image?key=${encodeURIComponent(a.r2_key as string)}&w=1600`, label: a.file_name ?? t("รูปแนบงาน", "Work image") })),
    ...productGroups.flatMap((g) => g.keys.map((k) => ({ url: `/api/r2-image?key=${encodeURIComponent(k)}&w=1600`, label: g.label }))),
  ];
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
  // พนักงานเพิ่ม/เอาตัวเองออกเป็นผู้ช่วย (self-join · เฉพาะงานยังไม่จบ)
  const isAssignee = !!user?.id && sub.assignees.some((a) => a.id === user.id);
  const canSelfJoin = !!user?.id && !isSubDone(st) && st !== "canceled";
  const selfJoin = async () => { await patch({ self_join: true }); pushToast("success", t("เพิ่มตัวเองเป็นผู้ช่วยแล้ว", "You joined as a helper")); };
  const selfLeave = async () => { await patch({ self_leave: true }); pushToast("info", t("เอาตัวเองออกจากผู้ช่วยแล้ว", "You left as a helper")); };

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
          <button disabled={busy} onClick={async () => { await patch({ status: "todo" }); pushToast("info", t("ยกเลิกการเริ่มงานแล้ว", "Start canceled")); }} title={t("กดผิด? ยกเลิกการเริ่มงาน (ล้างผู้รับผิดชอบ)", "Misclick? Cancel start (clears assignee)")} className="text-xs text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">↩︎ {t("ยกเลิกเริ่ม", "Un-start")}</button>
        </span>}
        {st === "submitted" && (canApprove
          ? <span className="shrink-0 inline-flex items-center gap-1">
              <button disabled={busy} onClick={() => patch({ status: "approved" })} className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 disabled:opacity-50">✓ {t("อนุมัติ", "Approve")}</button>
              <button disabled={busy} onClick={() => setReviseOpen(true)} title={t("ขอแก้", "Request revision")} className="text-xs text-orange-600 border border-orange-200 rounded-md px-1.5 py-0.5 hover:bg-orange-50 disabled:opacity-50">↩︎ {t("ขอแก้", "Revise")}</button>
              <button disabled={busy} onClick={async () => { const r = window.prompt(t("เหตุผลที่ยกเลิก", "Reason to cancel")); if (r === null) return; await patch({ status: "canceled", comment: r }); pushToast("info", t("ยกเลิกงานย่อยแล้ว", "Subtask canceled")); }} title={t("ยกเลิก", "Cancel")} className="text-xs text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">✕</button>
            </span>
          : <span className="shrink-0 text-xs font-medium text-amber-600">⏳ {t("รออนุมัติ", "Pending approval")}</span>)}
        {st === "revision_requested" && <button disabled={busy} onClick={() => patch({ status: "in_progress" })} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 hover:bg-blue-100 disabled:opacity-50">▶ {t("เริ่มแก้", "Start revision")}</button>}
        {st === "canceled" && <span className="shrink-0 text-xs font-medium text-slate-400">🚫 {t("ยกเลิก", "Canceled")}</span>}
        {isSubDone(st) && <span className="shrink-0 text-xs font-medium text-emerald-600">✓ {subStepLabel(st)}</span>}
        {isSubDone(st) && canApprove && <button disabled={busy} onClick={async () => { if (!window.confirm(t("ย้อนสถานะงานย่อยนี้กลับเป็น \"รออนุมัติ\"? · รูป/ข้อมูลที่ส่งเข้าสินค้าตอนอนุมัติจะถูกถอดกลับ", "Revert this subtask to \"pending approval\"? · product images/data synced on approval will be rolled back"))) return; await patch({ status: "submitted" }); pushToast("info", t("ย้อนสถานะแล้ว — กลับไปรออนุมัติ", "Reverted — pending approval")); }} title={t("ย้อนสถานะ (แอดมิน/ผู้ตรวจ)", "Revert status (admin/reviewer)")} className="shrink-0 text-[11px] text-slate-500 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">↩︎ {t("ย้อนสถานะ", "Revert")}</button>}
        {ty && <span className="shrink-0 text-sm leading-none" title={ty.label_th}>{ty.icon ?? "🧩"}</span>}
        <button onClick={() => setOpen((o) => !o)} className={`text-sm flex-1 text-left ${isSubDone(st) ? "line-through text-slate-400" : "text-slate-700"}`}>{t(sub.title, sub.title_en || sub.title)}</button>
        {sub.required_before_next && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1">{t("ต้องเสร็จก่อน", "Must finish first")}</span>}
        <div className="flex -space-x-1">{sub.assignees.slice(0, 3).map((a) => <AssigneeAvatar key={a.id} a={a} size={20} />)}</div>
        {attachCount > 0 && <span className="text-[10px] text-slate-400">📎{attachCount}</span>}
        <button onClick={() => setEditOpen(true)} title={t("แก้ไขงานย่อย", "Edit subtask")} className="shrink-0 text-slate-300 hover:text-violet-600 text-xs">✏️</button>
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
          {/* ผู้รับผิดชอบ (ธีม+รูปพนักงาน) + ปุ่มพนักงานเพิ่ม/เอาตัวเองออกเป็นผู้ช่วย */}
          {(sub.assignees.length > 0 || canSelfJoin) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {sub.assignees.length > 0 && <>
                <span className="text-[11px] text-slate-400">{t("ผู้รับผิดชอบ", "Assignee")}:</span>
                {sub.assignees.map((a) => <AssigneeChip key={a.id} a={a} />)}
              </>}
              {canSelfJoin && (isAssignee
                ? <button disabled={busy} onClick={selfLeave} title={t("เอาตัวเองออกจากผู้ช่วย", "Leave as helper")} className="text-[11px] text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">↩︎ {t("ออกจากผู้ช่วย", "Leave")}</button>
                : <button disabled={busy} onClick={selfJoin} title={t("ไปช่วยทำงานนี้ (เพิ่มตัวเองเป็นผู้ช่วย)", "Help with this (add yourself)")} className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 disabled:opacity-50">✋ {t("ช่วยทำงานนี้", "Help with this")}</button>)}
            </div>
          )}
          {/* ③ ไฟล์แนบ (compact) — โชว์เฉพาะที่มีอยู่ · ฟอร์มแนบ/ส่งงาน/ยืนยันไปอยู่ในป๊อปอัป */}
          <div className="space-y-2">
            {imageAtts.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">{t("รูปแนบงาน", "Work images")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {imageAtts.map((a, i) => <img key={a.id} src={`/api/r2-image?key=${encodeURIComponent(a.r2_key as string)}&w=160`} alt={a.file_name ?? ""} onClick={() => setCardLb(i)} title={t("กดดูเต็มจอ", "Click to view full")} className="h-12 w-12 rounded object-cover border border-slate-200 cursor-zoom-in" />)}
                </div>
              </div>
            )}
            {/* รูปเข้าสินค้า — จัดกลุ่มตามสินค้า + ป้ายรหัส (เช่น BSAC007) · กดดูเต็มจอ */}
            {productGroups.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400">📦 {t("รูปเข้าสินค้า", "Product images")}</p>
                {productGroups.map((g) => {
                  const base = imageAtts.length + skuImgKeys.indexOf(g.keys[0]);   // ดัชนีเริ่มของกลุ่มนี้ใน cardImages
                  return (
                    <div key={g.key}>
                      <p className="text-[10px] font-mono text-slate-500 bg-slate-100 inline-block px-1.5 py-0.5 rounded mb-1">{g.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {g.keys.map((k, j) => <img key={k} src={`/api/r2-image?key=${encodeURIComponent(k)}&w=160`} alt="" onClick={() => setCardLb(base + j)} title={t("กดดูเต็มจอ", "Click to view full")} className="h-12 w-12 rounded object-cover border border-amber-200 cursor-zoom-in" />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {linkAtts.length > 0 && (
              <div className="space-y-1">
                {linkAtts.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5">
                    <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block text-xs text-violet-700 truncate flex-1">🔗 {a.label || a.url}</a>
                    <button type="button" title={t("คัดลอกที่อยู่", "Copy path")}
                      onClick={async () => { try { await navigator.clipboard.writeText(a.url || a.label || ""); pushToast("success", t("คัดลอกที่อยู่แล้ว", "Path copied")); } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); } }}
                      className="shrink-0 text-[11px] text-slate-400 hover:text-violet-700 border border-slate-200 rounded px-1.5 py-0.5">📋</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={openWork} className={`w-full h-9 rounded-lg text-sm font-medium ${canSubmit ? "bg-amber-500 text-white hover:bg-amber-600" : "text-violet-700 border border-violet-200 hover:bg-violet-50"}`}>
              {canSubmit
                ? (platformConfirm ? `📤 ${t("ตรวจ & ส่งงาน", "Review & submit")}` : `📤 ${t("ส่งงาน (แนบรูป/ลิงก์)", "Submit (attach files/links)")}`)
                : (platformConfirm ? `🔎 ${t("ดูรายละเอียด Platform", "View platform details")}` : `📎 ${attachCount > 0 ? t("จัดการไฟล์แนบ", "Manage attachments") : t("แนบงาน", "Attach work")}`)}
            </button>
          </div>
        </div>
      )}
      {/* ดูรูปบนการ์ดเต็มจอ + เลื่อน (รูปงาน + รูปเข้าสินค้า) */}
      <ImageLightbox images={cardImages} index={cardLb} onClose={() => setCardLb(-1)} onIndex={setCardLb} />
      {workOpen && <SubmitWorkModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} showImages={showImages} showLinks={showLinks} canSubmit={canSubmit} platformConfirm={platformConfirm} canApprove={canApprove} approveTarget={String(approveTarget ?? "none")} hasDescSibling={hasDescSibling} onClose={() => setWorkOpen(false)} />}
      {editOpen && <EditSubtaskModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} canManageAssignees={canManageAssignees} onClose={() => setEditOpen(false)} />}
      {reviseOpen && <ReviseModal busy={busy} onCancel={() => setReviseOpen(false)} onConfirm={async (c) => { setReviseOpen(false); await patch({ status: "revision_requested", comment: c }); pushToast("info", t("ส่งกลับให้แก้แล้ว", "Sent back for revision")); }} />}
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
  const [titleEn, setTitleEn] = useState(sub.title_en ?? "");
  const [desc, setDesc] = useState(sub.description ?? "");
  const [assignees, setAssignees] = useState<SubtaskAssignee[]>(sub.assignees);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const [required, setRequired] = useState(sub.required_before_next);
  const [busy, setBusy] = useState(false);
  const idsKey = (xs: SubtaskAssignee[]) => xs.map((a) => a.id).join(",");
  const dirty = title.trim() !== sub.title || (titleEn.trim() || "") !== (sub.title_en || "") || (desc.trim() || "") !== (sub.description || "") || required !== sub.required_before_next || idsKey(assignees) !== idsKey(sub.assignees);

  const save = async () => {
    if (!title.trim()) { pushToast("error", t("ใส่ชื่องานย่อยก่อน", "Title is required")); return; }
    setBusy(true);
    try {
      const p: Record<string, unknown> = { title: title.trim(), title_en: titleEn.trim() || null, description: desc.trim() || null, required_before_next: required };
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
          <p className="text-[11px] text-slate-400 mb-1">{t("ชื่องานย่อย (ไทย)", "Title (Thai)")}</p>
          <ERPInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ชื่องานย่อย", "Subtask title")} />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 mb-1">{t("ชื่ออังกฤษ (โชว์ตอนสลับภาษา EN)", "English title (shown in EN mode)")}</p>
          <ERPInput value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder={t("เช่น Photo Editing", "e.g. Photo Editing")} />
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
            ? <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0"><UserPicker value={adding} onChange={(v) => { if (v && !assignees.some((a) => a.id === v.id)) setAssignees((xs) => [...xs, { id: v.id, label: v.name, color: null, avatar_url: null }]); setAdding(null); }} disableCreate /></div>
                <TeamFill onPick={(members) => setAssignees((xs) => { const fresh = members.filter((m) => !xs.some((a) => a.id === m.id)).map((m) => ({ id: m.id, label: m.name, color: null, avatar_url: null })); return fresh.length ? [...xs, ...fresh] : xs; })} />
              </div>
            : <p className="text-[11px] text-slate-400 italic">{t("เฉพาะหัวหน้า/ผู้สร้างงานเปลี่ยนผู้รับผิดชอบได้", "Only managers or task creators can change assignees")}</p>}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" disabled={!canManageAssignees} checked={required} onChange={(e) => setRequired(e.target.checked)} />{t("ต้องเสร็จก่อนขั้นถัดไป", "Must complete before next step")}</label>
      </div>
    </ERPModal>
  );
}

type PlatformParent = { id: string; code: string; name_th: string; name_platform: string; introduction: string; description: string; english_description: string; has_description: boolean; missing: string[]; fields?: { key: string; label: string; value: string; empty: boolean }[] };

// ป๊อปอัปแนบงาน/ส่งงาน
// - งานปกติ (รับรูป/ลิงก์): แนบ ≥1 ก่อนส่ง
// - งานเขียนคำอธิบาย (ไม่รับรูป/ลิงก์ = platformConfirm): ไม่ต้องแนบ แต่โชว์รายละเอียด Platform ของ
//   Parent SKU ให้ตรวจ + ต้องมีรายละเอียด (description) ครบทุกตัวก่อนถึงส่งได้
const withW = (url: string, w: number) => `${url}${url.includes("?") ? "&" : "?"}w=${w}`;

// กล่องจัดการรูปของ "สินค้าหนึ่งตัว" ปลายทางเดียว (แกลเลอรี หรือ Description) — ของกลาง
// โชว์รูปเดิม (มีเลข, กดซูมได้) + ลากรูปเข้า + เลือกต่อรูป "เพิ่มใหม่/แทน #N" + ปุ่ม "ใส่เข้าสินค้าเลย" + ดู/กู้เวอร์ชันเก่า (เฉพาะแกลเลอรี)
function ProductImageBox({ tk, label, mode, refSlots, draft, uploading, onAddDraft, onRemoveDraft, onReorder, replaceMap, setReplace, canApplyNow, applying, onApplyNow, tt, onRestored, onZoom }: {
  tk: string;
  label: string;
  mode: "gallery" | "description";
  refSlots: { slot_id: string; slot: number; url: string }[];   // รูปเดิมของปลายทางนี้ (มีเลข)
  draft: { r2_key: string; file_name: string }[];               // รูปร่าง (กรองเฉพาะปลายทางนี้แล้ว)
  uploading: boolean;
  onAddDraft: (files: FileList | File[]) => void;
  onRemoveDraft: (key: string) => void;
  onReorder: (fromKey: string, toKey: string) => void;
  replaceMap: Record<string, Record<string, string>>;
  setReplace: (tk: string, imgKey: string, val: string) => void;
  canApplyNow: boolean;
  applying: boolean;
  onApplyNow: () => void;
  tt: (th: string, en: string) => string;
  onRestored: () => void;
  onZoom?: (images: LightboxImage[], index: number) => void;
}) {
  const dragKey = useRef<string | null>(null);   // คีย์รูปที่กำลังลากสลับลำดับ
  const [verOpen, setVerOpen] = useState(false);
  const [versions, setVersions] = useState<{ slot_id: string; slot: number | null; old_r2_key: string }[] | null>(null);
  const pfx = tk.split(":")[0]; const ownerType = pfx === "parent" ? "parent_sku" : "product_sku"; const ownerId = tk.split(":")[1];
  const isDesc = mode === "description";
  const addNewVal = isDesc ? "desc:new" : "new";
  const replaceVal = (slotId: string) => isDesc ? `desc:${slotId}` : slotId;
  const loadVersions = async () => {
    setVerOpen((o) => !o);
    if (versions !== null) return;
    try { const j = await apiFetch(`/api/product-images?owner_type=${ownerType}&owner_id=${encodeURIComponent(ownerId)}&versions=1`).then((r) => r.json()); setVersions((j.versions as { slot_id: string; slot: number | null; old_r2_key: string }[]) ?? []); } catch { setVersions([]); }
  };
  const restore = async (slotId: string, key: string) => {
    try { await apiFetch("/api/product-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", slot_id: slotId, r2_key: key }) });
      setVersions((v) => (v ?? []).filter((x) => !(x.slot_id === slotId && x.old_r2_key === key))); onRestored(); } catch { /* noop */ }
  };
  const refImages: LightboxImage[] = refSlots.map((s) => ({ url: withW(s.url, 1600), label }));
  return (
    <div className={`mt-2 border-t pt-2 ${isDesc ? "border-indigo-100" : "border-amber-100"}`}>
      <p className="text-[11px] text-slate-500 mb-1 flex items-center gap-1">
        {isDesc ? `📂 ${tt("ใส่รูปเข้า Description", "Add to Description")}` : `🖼 ${tt("ใส่รูปเข้าแกลเลอรีสินค้า", "Add to product gallery")}`}
        <span className="cursor-help text-slate-400 hover:text-violet-600"
          title={isDesc
            ? tt(`รูปที่ลากลงกล่องนี้จะเข้า "รูป Description" ของ ${label}\nต่อรูปเลือก: เพิ่มใหม่ หรือ แทน #N (แถวด้านบนมีเลขกำกับ)\nปุ่ม 'ใส่เข้าสินค้าเลย' = ใส่ทันที · ถ้าไม่กด เข้าตอน 'อนุมัติ'`, `Images here go to ${label}'s Description.\nPer image: add new or replace #N.\n'Add now' applies immediately; otherwise on approval.`)
            : tt(`รูปที่ลากลงกล่องนี้จะเข้า "แกลเลอรีสินค้า" ของ ${label}\nต่อรูปเลือก: เพิ่มใหม่ หรือ แทน #N (แถวด้านบนมีเลขกำกับ)\nรูปเดิมที่ถูกแทนเก็บเป็นเวอร์ชันเก่า กด 🕘 ดู/กู้คืน\nปุ่ม 'ใส่เข้าสินค้าเลย' = ใส่ทันที · ถ้าไม่กด เข้าตอน 'อนุมัติ'`, `Images here go to ${label}'s gallery.\nPer image: add new or replace #N.\nReplaced images kept as versions — tap 🕘.\n'Add now' applies immediately; otherwise on approval.`)}
        >ⓘ</span>
      </p>

      {/* รูปเดิมของปลายทางนี้ (มีเลขกำกับ · กดซูมได้) — กล่องพื้นหลังเทาอ่อน แยกจากรูปใหม่ */}
      <div className="flex flex-wrap items-center gap-1 mb-2 bg-slate-100 rounded-md px-2 py-1.5">
        <span className="text-[10px] text-slate-400">{isDesc ? tt("รูป Description เดิม:", "Current Description:") : tt("รูปเดิมในสินค้า:", "Current gallery:")}</span>
        {refSlots.length === 0 ? <span className="text-[10px] text-slate-400 italic">{tt("ยังไม่มีรูป", "none yet")}</span>
          : refSlots.map((s, i) => (
            <div key={s.slot_id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={withW(s.url, 64)} alt="" title={tt("กดดูเต็มจอ", "Click to view full")} onClick={() => onZoom?.(refImages, i)} className={`h-9 w-9 object-cover rounded border cursor-zoom-in ${isDesc ? "border-indigo-200" : "border-slate-200"}`} />
              <span className={`absolute -top-1 -left-1 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center ${isDesc ? "bg-indigo-600" : "bg-slate-700"}`}>{i + 1}</span>
            </div>
          ))}
      </div>

      {/* กล่องลากรูป + รูปร่างที่จะใส่ (แทน/เพิ่ม ต่อรูป) */}
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) onAddDraft(e.dataTransfer.files); }}
        className={`rounded-md border border-dashed px-2 py-1.5 ${isDesc ? "border-indigo-300 bg-indigo-50/30" : "border-amber-300 bg-amber-50/30"}`}>
        <div className="flex flex-wrap items-start gap-2">
          {draft.map((d, j) => { const curVal = replaceMap[tk]?.[d.r2_key] ?? addNewVal; const isReplace = curVal !== addNewVal; return (
            <div key={d.r2_key} className="flex flex-col items-center gap-0.5"
              draggable onDragStart={() => { dragKey.current = d.r2_key; }} onDragEnd={() => { dragKey.current = null; }}
              onDragOver={(e) => { if (dragKey.current) e.preventDefault(); }}
              onDrop={(e) => { if (dragKey.current) { e.preventDefault(); e.stopPropagation(); const from = dragKey.current; dragKey.current = null; if (from !== d.r2_key) onReorder(from, d.r2_key); } }}>
              <div className="relative group cursor-grab active:cursor-grabbing" title={tt("ลากเพื่อสลับลำดับ", "Drag to reorder")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/r2-image?key=${encodeURIComponent(d.r2_key)}&w=64`} alt="" title={tt("กดเพื่อดูเต็มจอ · ลากเพื่อสลับลำดับ", "Click to view · drag to reorder")} onClick={() => onZoom?.(draft.map((x) => ({ url: `/api/r2-image?key=${encodeURIComponent(x.r2_key)}&w=1600`, label })), j)} className={`h-12 w-12 object-cover rounded border-2 cursor-zoom-in ${isReplace ? (isDesc ? "border-indigo-400" : "border-amber-400") : "border-slate-200"}`} />
                {/* เลขตำแหน่ง (ลำดับที่จะเข้าสินค้า) */}
                <span className={`absolute -top-1 -left-1 text-white text-[8px] font-medium rounded-full w-4 h-4 flex items-center justify-center ${isDesc ? "bg-indigo-600" : "bg-amber-500"}`}>{j + 1}</span>
                <button type="button" onClick={() => onRemoveDraft(d.r2_key)} className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center bg-white rounded-full text-red-500 text-[9px] shadow opacity-0 group-hover:opacity-100">✕</button>
              </div>
              <select value={curVal} onChange={(e) => setReplace(tk, d.r2_key, e.target.value)} className="text-[10px] border border-slate-200 rounded px-0.5 py-0.5 w-[76px]">
                <option value={addNewVal}>➕ {tt("เพิ่มใหม่", "Add new")}</option>
                {refSlots.map((s, i) => <option key={s.slot_id} value={replaceVal(s.slot_id)}>{tt(`แทน #${i + 1}`, `→ #${i + 1}`)}</option>)}
              </select>
            </div>
          ); })}
          <label className={`h-12 px-2 inline-flex items-center gap-1 rounded border border-dashed text-[11px] cursor-pointer ${isDesc ? "border-indigo-300 text-indigo-700 hover:bg-indigo-50" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}>
            {uploading ? "⏳" : <>📥 {tt("ลากรูปมาใส่ / เลือกไฟล์", "Drop or pick images")}</>}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) onAddDraft(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {draft.length > 0 && (
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <p className={`text-[10px] ${isDesc ? "text-indigo-600" : "text-amber-600"}`}>{tt(`${draft.length} รูป — เข้าสินค้าตอนอนุมัติ (หรือกดใส่เลย)`, `${draft.length} image(s) — on approval, or add now`)}</p>
            {canApplyNow && (
              <button type="button" onClick={onApplyNow} disabled={applying}
                className="h-7 px-2.5 text-[11px] font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 shrink-0">
                {applying ? "⏳ " : "✅ "}{tt("ใส่เข้าสินค้าเลย (ไม่รออนุมัติ)", "Add to product now")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* รูปเก่าที่เคยถูกแทน — ดู/กู้คืน (เฉพาะแกลเลอรี · Description ยังไม่มีกู้คืน) */}
      {!isDesc && <>
        <button type="button" onClick={loadVersions} className="mt-1.5 text-[10px] text-slate-500 hover:text-violet-700">🕘 {tt("รูปเก่าที่เคยถูกแทน", "Replaced versions")} {verOpen ? "▲" : "▼"}</button>
        {verOpen && (versions === null ? <p className="text-[10px] text-slate-400 mt-0.5">{tt("กำลังโหลด…", "Loading…")}</p>
          : versions.length === 0 ? <p className="text-[10px] text-slate-400 italic mt-0.5">{tt("ยังไม่มีรูปที่ถูกแทน", "No replaced versions yet")}</p>
          : (
            <div className="flex flex-wrap gap-2 mt-1">
              {versions.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/r2-image?key=${encodeURIComponent(v.old_r2_key)}&w=64`} alt="" onClick={() => onZoom?.(versions.map((x) => ({ url: `/api/r2-image?key=${encodeURIComponent(x.old_r2_key)}&w=1600`, label })), i)} className="h-10 w-10 object-cover rounded border border-slate-200 opacity-80 cursor-zoom-in" />
                  <button type="button" onClick={() => restore(v.slot_id, v.old_r2_key)} className="text-[9px] text-violet-600 hover:underline">↩ {tt(`กู้คืน #${(v.slot ?? 0) + 1}`, `restore #${(v.slot ?? 0) + 1}`)}</button>
                </div>
              ))}
            </div>
          ))}
      </>}
    </div>
  );
}

function SubmitWorkModal({ sub, taskId, reload, pushToast, showImages, showLinks, canSubmit, platformConfirm, canApprove = false, approveTarget = "none", hasDescSibling = false, onClose }: {
  sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: ToastFn;
  showImages: boolean; showLinks: boolean; canSubmit: boolean; platformConfirm: boolean; canApprove?: boolean; approveTarget?: string; hasDescSibling?: boolean; onClose: () => void;
}) {
  const t = useT();
  const { can } = useAuth();
  // ปุ่ม "ใส่เข้าสินค้าเลย (ไม่รออนุมัติ)" — เฉพาะผู้มีสิทธิ์อนุมัติ (admin/ผจก./ผู้ตรวจ) ที่แก้สินค้าได้ด้วย
  const canEditProduct = canApprove && can("products.edit");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyingTk, setApplyingTk] = useState<string | null>(null);   // กำลังใส่รูปเข้าสินค้าตัวไหน
  const [parents, setParents] = useState<PlatformParent[] | null>(null);
  const [skusByParent, setSkusByParent] = useState<Record<string, { id: string; code: string; name: string; image_key: string | null }[]>>({});
  const [editParentId, setEditParentId] = useState<string | null>(null);                       // เปิดตัวแก้ Parent SKU กลาง
  const [skuEditor, setSkuEditor] = useState<{ recordId: string | null; parentId: string } | null>(null); // เปิดตัวแก้ SKU กลาง (recordId null = สร้างใหม่)
  // ── ปลายทางรูป (โหมดแนบรูป): ติ๊กเลือก Parent/SKU ที่จะดันรูปเข้าตอนอนุมัติ ──
  const [syncParentIds, setSyncParentIds] = useState<Set<string>>(new Set());
  const [syncSkuIds, setSyncSkuIds] = useState<Set<string>>(new Set());
  const [extraParents, setExtraParents] = useState<PlatformParent[]>([]);  // Parent ที่เลือกเพิ่มเอง (นอกเหนือที่ผูกกับงาน)
  const [addParentOpen, setAddParentOpen] = useState(false);
  const [noParent, setNoParent] = useState(false);   // ติ๊ก "ไม่ต้องแนบ Parent SKU" → ข้ามการบังคับเลือกสินค้าปลายทาง
  // เฟส 2: แกลเลอรีปัจจุบันของสินค้า (โชว์ preview) + จับคู่ "รูปส่ง → แทนช่องไหน"
  type GallerySlot = { slot_id: string; slot: number; r2_key: string };
  type DescSlot = { slot_id: string; slot: number; url: string };
  const [galleries, setGalleries] = useState<Record<string, GallerySlot[]>>({});
  const [descGalleries, setDescGalleries] = useState<Record<string, DescSlot[]>>({});   // รูป Description ต่อ Parent "parent:<id>"
  const [replaceMap, setReplaceMap] = useState<Record<string, Record<string, string>>>({});   // targetKey → { workR2Key → "new"|attId|"desc:new"|"desc:<assetId>" }
  const [linkedSkuIds, setLinkedSkuIds] = useState<string[]>([]);          // SKU ที่ผูกกับงาน (ใช้ติ๊กล่วงหน้า)
  const [requiredFields, setRequiredFields] = useState<{ key: string; label: string }[]>([]);   // ฟิลด์บังคับก่อนส่ง (ค่ากลาง)
  const [draftImages, setDraftImages] = useState<Record<string, { r2_key: string; file_name: string }[]>>({}); // รูปร่างต่อสินค้า key="parent:<id>"/"sku:<id>" (เข้าตอนอนุมัติ หรือกด "ใส่เลย")
  const syncInit = useRef(false);
  const [skuLb, setSkuLb] = useState<{ images: LightboxImage[]; index: number }>({ images: [], index: -1 }); // ดูรูปต่อ SKU เต็มจอ
  const imageAtts = (sub.attachments ?? []).filter((a) => a.kind === "image" && a.r2_key);
  const linkAtts = (sub.attachments ?? []).filter((a) => a.kind !== "image");
  const attachCount = sub.attachments?.length ?? 0;

  // โหลดรายละเอียด Platform ของ Parent SKU + SKU ลูก — ใช้ทั้งโหมดยืนยันคำอธิบาย และโหมดแนบรูป (เลือกปลายทาง)
  const loadPlatform = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/creative-tasks/${taskId}/subtasks?platform=1`).then((r) => r.json());
      const ps = (j.parents as PlatformParent[]) ?? [];
      setParents(ps);
      setRequiredFields((j.required as { key: string; label: string }[]) ?? []);
      setLinkedSkuIds((j.linked_sku_ids as string[]) ?? []);
      if (j.galleries) setGalleries((prev) => ({ ...prev, ...(j.galleries as Record<string, GallerySlot[]>) }));
      if (j.desc_galleries) setDescGalleries((prev) => ({ ...prev, ...(j.desc_galleries as Record<string, DescSlot[]>) }));
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
  // รีเฟรชแกลเลอรีของสินค้าตัวเดียว (หลังกู้คืนเวอร์ชันเก่า) — tk = "parent:<id>" / "sku:<id>"
  const refreshGallery = useCallback(async (tk: string) => {
    const [pfx, id] = tk.split(":"); const ot = pfx === "parent" ? "parent_sku" : "product_sku";
    try { const gj = await apiFetch(`/api/creative-tasks/${taskId}/subtasks?gallery=${ot}:${encodeURIComponent(id)}`).then((r) => r.json()); if (gj.galleries) setGalleries((prev) => ({ ...prev, ...(gj.galleries as Record<string, GallerySlot[]>) })); } catch { /* noop */ }
    if (pfx === "parent") await refreshDescGallery(id);
  }, [taskId]);   // eslint-disable-line react-hooks/exhaustive-deps
  // รีเฟรชรูป Description ของ Parent ตัวเดียว
  const refreshDescGallery = useCallback(async (parentId: string) => {
    try { const gj = await apiFetch(`/api/creative-tasks/${taskId}/subtasks?descgallery=parent:${encodeURIComponent(parentId)}`).then((r) => r.json()); if (gj.desc_galleries) setDescGalleries((prev) => ({ ...prev, ...(gj.desc_galleries as Record<string, DescSlot[]>) })); } catch { /* noop */ }
  }, [taskId]);

  // ติ๊กล่วงหน้า: ใช้ค่าที่เคยเลือกถ้ามี ไม่งั้น prefill ด้วย Parent/SKU ที่ผูกกับงาน
  useEffect(() => {
    if (!showImages || syncInit.current || parents === null) return;
    const ex = sub.image_sync_targets;
    if (ex && ((ex.parent_ids?.length ?? 0) > 0 || (ex.sku_ids?.length ?? 0) > 0 || Object.keys(ex.sku_images ?? {}).length > 0 || Object.keys((ex as { product_images?: Record<string, string[]> }).product_images ?? {}).length > 0)) {
      setSyncParentIds(new Set(ex.parent_ids ?? []));
      setSyncSkuIds(new Set(ex.sku_ids ?? []));
      // รูปร่างต่อสินค้า: product_images (แบบใหม่ key=tk) + แปลง sku_images เดิม (key=skuId) → "sku:<id>"
      const pim = (ex as { product_images?: Record<string, string[]> }).product_images ?? {};
      setDraftImages(Object.fromEntries([
        ...Object.entries(pim).map(([tk, keys]) => [tk, (keys as string[]).map((r) => ({ r2_key: r, file_name: "" }))]),
        ...Object.entries(ex.sku_images ?? {}).map(([sid, keys]) => [`sku:${sid}`, (keys as string[]).map((r) => ({ r2_key: r, file_name: "" }))]),
      ]));
      if (ex.replace_map) setReplaceMap(ex.replace_map as Record<string, Record<string, string>>);
    } else {
      setSyncParentIds(new Set(parents.map((p) => p.id).filter(Boolean)));
      setSyncSkuIds(new Set(linkedSkuIds));
    }
    syncInit.current = true;
  }, [showImages, parents, linkedSkuIds, sub.image_sync_targets]);

  // ให้แน่ใจว่าแกลเลอรีของ SKU ที่ติ๊กไว้ (prefill) ถูกโหลดมาโชว์ในกล่อง (parent โหลดใน loadPlatform แล้ว)
  useEffect(() => {
    syncSkuIds.forEach((sid) => {
      if (galleries[`sku:${sid}`]) return;
      apiFetch(`/api/creative-tasks/${taskId}/subtasks?gallery=product_sku:${encodeURIComponent(sid)}`).then((r) => r.json()).then((gj) => { if (gj.galleries) setGalleries((prev) => ({ ...prev, ...(gj.galleries as Record<string, GallerySlot[]>) })); }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncSkuIds, taskId]);

  // เซฟปลายทาง + รูปร่างต่อสินค้า ลงงานย่อย (best-effort) — ทั้งผู้ส่งและผู้ตรวจปรับได้ก่อนอนุมัติ
  const persistTargets = useCallback((pids: Set<string>, sids: Set<string>, drafts: Record<string, { r2_key: string; file_name: string }[]> = draftImages, rmap: Record<string, Record<string, string>> = replaceMap) => {
    const product_images = Object.fromEntries(Object.entries(drafts).map(([tk, arr]) => [tk, arr.map((x) => x.r2_key)]).filter(([, ks]) => (ks as string[]).length));
    const product_labels = Object.fromEntries(Object.keys(product_images).map((tk) => [tk, labelMapRef.current[tk]]).filter(([, c]) => c));
    updateSubtask(taskId, sub.id, { image_sync_targets: { parent_ids: [...pids], sku_ids: [...sids], product_images, product_labels, replace_map: rmap } }).catch(() => {});
  }, [taskId, sub.id, draftImages, replaceMap]);
  const toggleSyncParent = (pid: string) => { const n = new Set(syncParentIds); n.has(pid) ? n.delete(pid) : n.add(pid); setSyncParentIds(n); persistTargets(n, syncSkuIds); };
  const toggleSyncSku = (sid: string) => {
    const n = new Set(syncSkuIds); const adding = !n.has(sid); adding ? n.add(sid) : n.delete(sid); setSyncSkuIds(n); persistTargets(syncParentIds, n);
    // ติ๊ก SKU → ดึงแกลเลอรีของ SKU มาโชว์ preview + จับคู่แทนรูป (ครั้งแรกครั้งเดียว)
    if (adding && !galleries[`sku:${sid}`]) apiFetch(`/api/creative-tasks/${taskId}/subtasks?gallery=product_sku:${encodeURIComponent(sid)}`).then((r) => r.json()).then((gj) => { if (gj.galleries) setGalleries((prev) => ({ ...prev, ...(gj.galleries as Record<string, GallerySlot[]>) })); }).catch(() => {});
  };
  // จับคู่ "รูปส่ง → แทนช่องไหน" ของสินค้า (val = slot_id หรือ "new" = เพิ่มรูปใหม่)
  const setReplace = (tk: string, imgKey: string, val: string) => {
    setReplaceMap((prev) => {
      const inner = { ...(prev[tk] ?? {}) };
      if (val === "new") delete inner[imgKey]; else inner[imgKey] = val;
      const next = { ...prev, [tk]: inner };
      persistTargets(syncParentIds, syncSkuIds, draftImages, next);
      return next;
    });
  };
  const addSyncParent = async (p: ParentSkuPickerValue) => {
    if (!p) return;
    const exists = (parents ?? []).some((x) => x.id === p.id) || extraParents.some((x) => x.id === p.id);
    if (!exists) {
      setExtraParents((prev) => [...prev, { id: p.id, code: p.code, name_th: p.name, name_platform: "", introduction: "", description: "", english_description: "", has_description: false, missing: [] }]);
      await reloadSkusFor(p.id);
    }
    const n = new Set(syncParentIds); n.add(p.id); setSyncParentIds(n); persistTargets(n, syncSkuIds);
    // ดึงแกลเลอรี + รูป Description ของ Parent ที่เพิ่งเลือก มาโชว์ preview + ให้จับคู่แทนรูปได้
    try { const gj = await apiFetch(`/api/creative-tasks/${taskId}/subtasks?gallery=parent_sku:${encodeURIComponent(p.id)}`).then((r) => r.json()); if (gj.galleries) setGalleries((prev) => ({ ...prev, ...(gj.galleries as Record<string, GallerySlot[]>) })); } catch { /* noop */ }
    await refreshDescGallery(p.id);
    setAddParentOpen(false);
  };
  const displayParents = useMemo(() => [...(parents ?? []), ...extraParents], [parents, extraParents]);
  // map tk → รหัสสินค้า (อัปเดตทุก render) — เก็บเป็นป้ายกำกับบนการ์ดตอน persist (ref กัน stale/ordering)
  const labelMapRef = useRef<Record<string, string>>({});
  { const m: Record<string, string> = {}; for (const p of displayParents) if (p.id) m[`parent:${p.id}`] = p.code; for (const arr of Object.values(skusByParent)) for (const s of arr) m[`sku:${s.id}`] = s.code; labelMapRef.current = m; }

  // image-sync section: กล่องร่างรูปต่อสินค้า (tk="parent:<id>"/"sku:<id>") — ลากเข้า = เก็บร่าง (เข้าแกลเลอรีตอนอนุมัติ หรือกด "ใส่เลย")
  const [uploadingTk, setUploadingTk] = useState<string | null>(null);
  const [descBoxOpen, setDescBoxOpen] = useState<Record<string, boolean>>({});   // ติ๊ก "ส่งเข้า Description ด้วย" ต่อ Parent (tk)
  // แปลงแกลเลอรี → refSlots ให้ ProductImageBox (url สำหรับโชว์/ซูม)
  const galleryRef = (tk: string) => (galleries[tk] ?? []).map((s) => ({ slot_id: s.slot_id, slot: s.slot, url: `/api/r2-image?key=${encodeURIComponent(s.r2_key)}` }));
  const draftFor = (tk: string, dest: "gallery" | "description") => (draftImages[tk] ?? []).filter((d) => (dest === "description") === (replaceMap[tk]?.[d.r2_key] ?? "").startsWith("desc"));
  // dest: "gallery" (ค่าเริ่มต้น) หรือ "description" (Parent เท่านั้น) — description จะตั้ง replaceMap เป็น "desc:new"
  const isDescVal = (v: string | undefined) => (v ?? "").startsWith("desc");
  const addDraftImages = async (tk: string, files: FileList | File[], dest: "gallery" | "description" = "gallery") => {
    const imgs = Array.from(files).filter((x) => x.type.startsWith("image/"));
    if (!imgs.length) return;
    const folder = tk.startsWith("parent:") ? "parent_skus" : "skus";
    setUploadingTk(`${dest}#${tk}`);
    try {
      const ups: { r2_key: string; file_name: string }[] = [];
      for (const f of imgs) { const up = await uploadResizedImage(f, { folder, max: 1500 }); ups.push({ r2_key: up.r2_key, file_name: up.file_name }); }
      const nextDrafts = { ...draftImages, [tk]: [...(draftImages[tk] ?? []), ...ups] };
      const nextRm = dest === "description"
        ? { ...replaceMap, [tk]: { ...(replaceMap[tk] ?? {}), ...Object.fromEntries(ups.map((u) => [u.r2_key, "desc:new"])) } }
        : replaceMap;
      setDraftImages(nextDrafts);
      if (dest === "description") setReplaceMap(nextRm);
      persistTargets(syncParentIds, syncSkuIds, nextDrafts, nextRm);
    } catch (e) { pushToast("error", t("อัปรูปไม่สำเร็จ: ", "Upload failed: ") + (e as Error).message); } finally { setUploadingTk(null); }
  };
  const removeDraftImage = (tk: string, key: string) => {
    const nextDrafts = { ...draftImages, [tk]: (draftImages[tk] ?? []).filter((d) => d.r2_key !== key) };
    const inner = { ...(replaceMap[tk] ?? {}) }; delete inner[key];
    const nextRm = { ...replaceMap, [tk]: inner };
    setDraftImages(nextDrafts); setReplaceMap(nextRm);
    persistTargets(syncParentIds, syncSkuIds, nextDrafts, nextRm);
  };
  // ลากสลับลำดับรูปร่าง (ย้าย fromKey ไปตำแหน่งของ toKey) — ลำดับนี้ = ลำดับที่รูปจะเข้าสินค้า
  const reorderDraft = (tk: string, fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const arr = [...(draftImages[tk] ?? [])];
    const fi = arr.findIndex((d) => d.r2_key === fromKey), ti = arr.findIndex((d) => d.r2_key === toKey);
    if (fi < 0 || ti < 0) return;
    const [m] = arr.splice(fi, 1); arr.splice(ti, 0, m);
    const nextDrafts = { ...draftImages, [tk]: arr };
    setDraftImages(nextDrafts);
    persistTargets(syncParentIds, syncSkuIds, nextDrafts);
  };
  // ปุ่ม "ใส่เข้าสินค้าเลย (ไม่รออนุมัติ)" — ดันเฉพาะรูปของปลายทาง dest นั้นเข้าสินค้าทันที (guard products.edit ฝั่ง server)
  const applyNow = async (tk: string, dest: "gallery" | "description") => {
    const all = draftImages[tk] ?? [];
    const arr = all.filter((d) => (dest === "description") === isDescVal(replaceMap[tk]?.[d.r2_key]));
    if (!arr.length) return;
    const [pfx, id] = tk.split(":"); const ownerType = pfx === "parent" ? "parent_sku" : "product_sku";
    const items = arr.map((d) => ({ r2_key: d.r2_key, slot: replaceMap[tk]?.[d.r2_key] ?? "new" }));
    setApplyingTk(`${dest}#${tk}`);
    try {
      const r = await apiFetch("/api/product-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", owner_type: ownerType, owner_id: id, subtask_id: sub.id, task_id: taskId, items }) }).then((x) => x.json());
      if (r?.error) throw new Error(r.error);
      // ล้างเฉพาะรูปของปลายทางนี้ แล้วรีเฟรช (โชว์ผลทันที)
      const appliedKeys = new Set(arr.map((d) => d.r2_key));
      const nextDrafts = { ...draftImages, [tk]: (draftImages[tk] ?? []).filter((d) => !appliedKeys.has(d.r2_key)) };
      const inner = { ...(replaceMap[tk] ?? {}) }; appliedKeys.forEach((k) => delete inner[k]);
      const nextRm = { ...replaceMap, [tk]: inner };
      setDraftImages(nextDrafts); setReplaceMap(nextRm);
      persistTargets(syncParentIds, syncSkuIds, nextDrafts, nextRm);
      if (dest === "description") await refreshDescGallery(id); else await refreshGallery(tk);
      pushToast("success", t("ใส่รูปเข้าสินค้าแล้ว", "Images added to the product"));
    } catch (e) { pushToast("error", t("ใส่รูปไม่สำเร็จ: ", "Failed: ") + (e as Error).message); } finally { setApplyingTk(null); }
  };

  // ส่งงานได้เมื่อ Parent SKU ทุกตัวกรอกฟิลด์บังคับ ("*") ครบ (ค่ากลางตั้งที่ /tasks/settings)
  const platformReady = parents !== null && parents.length > 0 && parents.every((p) => (p.missing?.length ?? 0) === 0);
  // โหมดแนบรูป: ต้องเลือกสินค้าปลายทาง (Parent SKU/SKU) อย่างน้อย 1 ก่อนส่ง — เว้นแต่ติ๊ก "ไม่ต้องแนบ"
  const hasProductTarget = syncParentIds.size > 0 || syncSkuIds.size > 0;
  const needProductTarget = showImages && !platformConfirm && !noParent;
  const isDescTask = approveTarget === "description_media";                 // งานรูปคำอธิบาย → โชว์แค่ Description
  const hideDescOption = hasDescSibling && !isDescTask;                     // มีงานย่อยรูปคำอธิบายแยกอยู่แล้ว → งานนี้ไม่ต้องโชว์ตัวเลือก Description ซ้ำ
  const hasParentTarget = !noParent && displayParents.length > 0;           // มีสินค้าปลายทาง → ซ่อนกล่อง "รูปแนบงาน" บน
  const anyDraft = Object.values(draftImages).some((a) => a.length > 0);    // มีรูปในกล่องสินค้าไหม
  const hasWork = attachCount > 0 || anyDraft;                              // แนบรูป/ลิงก์ หรือหย่อนรูปในกล่องสินค้าก็นับ
  const canPressSubmit = canSubmit && !busy && (platformConfirm ? platformReady : (hasWork && (!needProductTarget || hasProductTarget)));

  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(taskId, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim(), subtask_id: sub.id }); setLinkLabel(""); setLinkUrl(""); await reload(); } catch (e) { pushToast("error", (e as Error).message); } };
  const submit = async () => {
    if (platformConfirm) {
      if (!platformReady) { pushToast("error", parents && parents.length === 0 ? t("งานนี้ยังไม่ได้ผูก Parent SKU", "No Parent SKU linked to this task") : t("ยังไม่มีรายละเอียด Platform ครบ — กรอกในสินค้าก่อนส่ง", "Platform details incomplete — fill them in the product first")); return; }
    } else if (!hasWork) {
      pushToast("error", t("กรุณาแนบรูป/ลิงก์ หรือใส่รูปในกล่องสินค้าอย่างน้อย 1 ก่อนส่ง", "Please attach at least one image/link before submitting")); return;
    } else if (needProductTarget && !hasProductTarget) {
      pushToast("error", t('เลือก Parent SKU ปลายทางอย่างน้อย 1 หรือติ๊ก "ไม่ต้องแนบ Parent SKU"', 'Pick at least one target Parent SKU, or tick "No Parent SKU needed"')); return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { status: "submitted" };
      if (showImages) {
        const product_images = Object.fromEntries(Object.entries(draftImages).map(([tk, arr]) => [tk, arr.map((x) => x.r2_key)]).filter(([, ks]) => (ks as string[]).length));
        const product_labels = Object.fromEntries(Object.keys(product_images).map((tk) => [tk, labelMapRef.current[tk]]).filter(([, c]) => c));
        body.image_sync_targets = { parent_ids: [...syncParentIds], sku_ids: [...syncSkuIds], product_images, product_labels, replace_map: replaceMap }; // บันทึกปลายทาง + รูปร่างต่อสินค้า + ป้ายกำกับ + การจับคู่แทนรูป ตอนส่ง
      }
      await updateSubtask(taskId, sub.id, body); await reload(); pushToast("success", t("ส่งงานแล้ว — รออนุมัติ", "Submitted — pending approval")); onClose();
    }
    catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); }
  };

  // อนุมัติ/ขอแก้ ในป๊อปอัป (เฉพาะผู้มีสิทธิ์อนุมัติ + งานย่อยรออนุมัติ)
  const canReview = canApprove && sub.status === "submitted";
  const [reviseOpen, setReviseOpen] = useState(false);
  const doApprove = async () => { setBusy(true); try { await updateSubtask(taskId, sub.id, { status: "approved" }); await reload(); pushToast("success", t("อนุมัติแล้ว", "Approved")); onClose(); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); } };
  const doRevise = async (comment: string) => { setReviseOpen(false); setBusy(true); try { await updateSubtask(taskId, sub.id, { status: "revision_requested", comment }); await reload(); pushToast("info", t("ส่งกลับให้แก้แล้ว", "Sent back for revision")); onClose(); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); } };

  return (
    <>
    <ERPModal open onClose={onClose} size="md"
      title={platformConfirm ? t("ส่งงาน — ตรวจรายละเอียด Platform", "Submit — review platform details") : canSubmit ? t("ส่งงาน — แนบรูป/ลิงก์", "Submit work — attach files/links") : t("แนบไฟล์งาน", "Attach work files")}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
          {canReview && <>
            <button onClick={() => setReviseOpen(true)} disabled={busy} className="h-9 px-4 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50">↩︎ {t("ขอแก้", "Revise")}</button>
            <button onClick={doApprove} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ {t("อนุมัติ", "Approve")}</button>
          </>}
          {canSubmit && <button onClick={submit} disabled={!canPressSubmit} className="h-9 px-4 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50">📤 {t("ส่งงาน (รออนุมัติ)", "Submit (pending approval)")}</button>}
        </div>
      }>
      <div className="space-y-4">
        {/* โหมดยืนยันรายละเอียด Platform (งานเขียนคำอธิบาย — ไม่ต้องแนบไฟล์) */}
        {platformConfirm ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{t("ตรวจรายละเอียด Platform ของสินค้าให้ครบก่อนส่ง (ไม่ต้องแนบไฟล์)", "Review the product platform details before submitting (no file needed)")}</p>
            {requiredFields.length > 0 && <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">{t("ช่องบังคับก่อนส่ง", "Required before submit")}: {requiredFields.map((f) => <span key={f.key} className="text-rose-600 font-medium">{f.label}*</span>).reduce((a, b, i) => i ? [...a, ", ", b] : [b], [] as React.ReactNode[])}</p>}
            {parents === null ? <p className="text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p>
              : parents.length === 0 ? <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("งานนี้ยังไม่ได้ผูก Parent SKU — ผูกสินค้าก่อนส่งงาน", "No Parent SKU linked — link a product first")}</p>
              : parents.map((p) => { const ok = (p.missing?.length ?? 0) === 0; return (
                <div key={p.id || p.code} className={`rounded-lg border p-3 space-y-1.5 ${ok ? "border-slate-200" : "border-rose-200 bg-rose-50/40"}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded">{p.code}</span>
                    <span className="text-sm font-medium text-slate-700">{p.name_platform || p.name_th || "—"}</span>
                    {ok ? <span className="text-[10px] text-emerald-600 ml-auto">✓ {t("ครบ", "Complete")}</span> : <span className="text-[10px] text-rose-600 ml-auto">⚠ {t("ยังไม่ครบ", "Incomplete")}</span>}
                  </div>
                  {!ok && <p className="text-xs text-rose-600">{t("ต้องกรอก", "Required")}: {p.missing.map((m) => `${m}*`).join(", ")}</p>}
                  {p.introduction && <p className="text-xs text-slate-500 whitespace-pre-wrap">{p.introduction}</p>}
                  {/* ทุกช่องบังคับ + ค่าจริง (โชว์เต็ม ไม่ตัด) + ปุ่มคัดลอก */}
                  {(p.fields && p.fields.length > 0
                    ? p.fields
                    : (p.description ? [{ key: "description", label: t("รายละเอียด", "Description"), value: p.description, empty: false }] : [])
                  ).map((f) => (
                    <div key={f.key} className="border-t border-slate-100 pt-1.5">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-[11px] font-medium text-slate-500">{f.label}{f.empty && <span className="text-rose-500">*</span>}</span>
                        {!f.empty && f.value && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(f.value); pushToast("success", t(`คัดลอก ${f.label} แล้ว`, `Copied ${f.label}`)); } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); } }} className="shrink-0 text-[10px] text-violet-600 hover:text-violet-800 border border-violet-200 rounded px-1.5 py-0.5">📋 {t("คัดลอก", "Copy")}</button>}
                      </div>
                      {f.empty
                        ? <p className="text-[11px] text-rose-500 italic">— {t("ยังไม่กรอก", "not filled")}</p>
                        : <p className="text-xs text-slate-600 whitespace-pre-wrap">{f.value}</p>}
                    </div>
                  ))}
                  <button onClick={() => setEditParentId(p.id)} disabled={!p.id} className={`w-full mt-1 h-8 rounded-md text-xs font-medium border disabled:opacity-50 ${ok ? "text-violet-700 border-violet-200 hover:bg-violet-50" : "text-white bg-violet-600 border-violet-600 hover:bg-violet-700"}`}>
                    ✏️ {ok ? t("แก้รายละเอียดสินค้า", "Edit product details") : t("กรอกข้อมูลสินค้าที่ขาด", "Fill missing product details")}
                  </button>
                  <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-2 mt-1">💡 {t('ถ้าต้องการสร้าง/แก้ SKU ของสินค้านี้ ให้กดปุ่ม "แก้รายละเอียดสินค้า" ด้านบนได้เลย', 'To create/edit SKUs for this product, use the button above')}</p>
                </div>
              ); })}
            {parents !== null && parents.length > 0 && !platformReady && <p className="text-xs text-rose-600">{t("กรอกช่องบังคับ (*) ให้ครบทุกสินค้าก่อนถึงจะส่งงานได้", "Fill all required (*) fields on every product before you can submit")}</p>}
          </div>
        ) : (
          <>
            {canSubmit && !hasWork && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{hasParentTarget ? t("ใส่รูปในกล่องสินค้าอย่างน้อย 1 ก่อนกดส่งงาน", "Add at least one image to a product box before submitting") : t("แนบรูปหรือลิงก์อย่างน้อย 1 ก่อนกดส่งงาน", "Attach at least one image or link before submitting")}</p>}
            {/* กล่อง "รูปแนบงาน" บน — ซ่อนเมื่อมีสินค้าปลายทาง (หย่อนรูปในกล่องสินค้าด้านล่างแทน) */}
            {showImages && !hasParentTarget && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">{t("รูปแนบงาน (ย่อ ≤1500px)", "Work images (resized ≤1500px)")}</p>
                <ImageAttach
                  images={imageAtts.map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))}
                  onAttach={async (r) => { await addAttachment(taskId, { kind: "image", subtask_id: sub.id, ...r }); await reload(); }}
                  onDelete={async (aid) => { try { await deleteAttachment(taskId, aid); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }}
                  pushToast={pushToast} maxSize={1500} />
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
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 mb-2 cursor-pointer">
                  <input type="checkbox" checked={noParent} onChange={(e) => setNoParent(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 cursor-pointer" />
                  {t("ไม่ต้องแนบ Parent SKU (งานนี้ไม่ส่งเข้าสินค้า)", "No Parent SKU needed (don't send to products)")}
                </label>
                {needProductTarget && !hasProductTarget && <p className="text-[11px] text-rose-600 mb-2">⚠ {t("ต้องเลือก Parent SKU อย่างน้อย 1 ก่อนส่งงาน", "Pick at least one Parent SKU before submitting")}</p>}
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
                      {/* กล่องรูปของ Parent SKU นี้ — แกลเลอรี + (ติ๊ก) Description · งานรูปคำอธิบาย = โชว์แค่ Description */}
                      {pon && (() => { const ptk = `parent:${p.id}`; const descOpen = isDescTask || (!hideDescOption && (descBoxOpen[ptk] ?? (draftFor(ptk, "description").length > 0))); return (
                        <div className="pl-6 space-y-1.5">
                          {!isDescTask && <ProductImageBox tk={ptk} label={p.code} mode="gallery" refSlots={galleryRef(ptk)} draft={draftFor(ptk, "gallery")} uploading={uploadingTk === `gallery#${ptk}`} onAddDraft={(f) => void addDraftImages(ptk, f, "gallery")} onRemoveDraft={(k) => removeDraftImage(ptk, k)} onReorder={(a, b) => reorderDraft(ptk, a, b)} replaceMap={replaceMap} setReplace={setReplace} canApplyNow={canEditProduct} applying={applyingTk === `gallery#${ptk}`} onApplyNow={() => void applyNow(ptk, "gallery")} tt={t} onRestored={() => refreshGallery(ptk)} onZoom={(imgs, i) => setSkuLb({ images: imgs, index: i })} />}
                          {!isDescTask && !hideDescOption && <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={descOpen} onChange={(e) => setDescBoxOpen((m) => ({ ...m, [ptk]: e.target.checked }))} className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer" />
                            📂 {t("ส่งเข้า Description ด้วย", "Also send to Description")}
                          </label>}
                          {!isDescTask && hideDescOption && <p className="text-[10px] text-slate-400 italic">📂 {t("Description จัดการที่งานย่อย \"รูปคำอธิบาย\" แยกแล้ว", "Description handled by the separate description-image subtask")}</p>}
                          {descOpen && <ProductImageBox tk={ptk} label={p.code} mode="description" refSlots={descGalleries[ptk] ?? []} draft={draftFor(ptk, "description")} uploading={uploadingTk === `description#${ptk}`} onAddDraft={(f) => void addDraftImages(ptk, f, "description")} onRemoveDraft={(k) => removeDraftImage(ptk, k)} onReorder={(a, b) => reorderDraft(ptk, a, b)} replaceMap={replaceMap} setReplace={setReplace} canApplyNow={canEditProduct} applying={applyingTk === `description#${ptk}`} onApplyNow={() => void applyNow(ptk, "description")} tt={t} onRestored={() => refreshDescGallery(p.id)} onZoom={(imgs, i) => setSkuLb({ images: imgs, index: i })} />}
                        </div>
                      ); })()}
                      {!isDescTask && <div className="pl-6 mt-1.5 space-y-1.5">
                        {(skusByParent[p.id] ?? []).map((s) => { const son = syncSkuIds.has(s.id); const thumb = s.image_key ? `/api/r2-image?key=${encodeURIComponent(s.image_key)}` : null; return (
                          <div key={s.id} className="space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <input type="checkbox" checked={son} onChange={() => toggleSyncSku(s.id)} className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 cursor-pointer" />
                              <HoverImage url={thumb} size={26} rounded="rounded" fallback="📦" />
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{s.code}</span>
                              <span className="text-slate-700 truncate flex-1">{s.name}</span>
                              <button type="button" onClick={() => setSkuEditor({ recordId: s.id, parentId: p.id })} className="text-violet-600 hover:underline shrink-0">✏️</button>
                            </div>
                            {son
                              ? <ProductImageBox tk={`sku:${s.id}`} label={s.code} mode="gallery" refSlots={galleryRef(`sku:${s.id}`)} draft={draftFor(`sku:${s.id}`, "gallery")} uploading={uploadingTk === `gallery#sku:${s.id}`} onAddDraft={(f) => void addDraftImages(`sku:${s.id}`, f, "gallery")} onRemoveDraft={(k) => removeDraftImage(`sku:${s.id}`, k)} onReorder={(a, b) => reorderDraft(`sku:${s.id}`, a, b)} replaceMap={replaceMap} setReplace={setReplace} canApplyNow={canEditProduct} applying={applyingTk === `gallery#sku:${s.id}`} onApplyNow={() => void applyNow(`sku:${s.id}`, "gallery")} tt={t} onRestored={() => refreshGallery(`sku:${s.id}`)} onZoom={(imgs, i) => setSkuLb({ images: imgs, index: i })} />
                              : <p className="ml-6 text-[10px] text-slate-400 italic">{t("ติ๊กเพื่อใส่/แทนรูปของ SKU นี้", "Tick to add/replace this SKU's images")}</p>}
                          </div>
                        ); })}
                        {(skusByParent[p.id] ?? []).length === 0 && <p className="text-[11px] text-slate-400 italic">{t("ยังไม่มี SKU", "No SKUs yet")}</p>}
                        <p className="text-[10px] text-slate-400 pt-0.5">💡 {t('สร้าง/เพิ่ม SKU กดปุ่ม "แก้สินค้า" ด้านบน (ตัวแก้สินค้ามีตารางเพิ่ม SKU)', 'Create/add SKUs via "Edit product" above')}</p>
                      </div>}
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
                  {linkAtts.map((a) => <div key={a.id} className="flex items-center gap-2 text-xs"><a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-violet-700 truncate flex-1">🔗 {a.label || a.url}</a><button type="button" title={t("คัดลอกที่อยู่", "Copy path")} onClick={async () => { try { await navigator.clipboard.writeText(a.url || a.label || ""); pushToast("success", t("คัดลอกที่อยู่แล้ว", "Path copied")); } catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); } }} className="text-slate-400 hover:text-violet-700 border border-slate-200 rounded px-1 shrink-0">📋</button><button onClick={async () => { try { await deleteAttachment(taskId, a.id); await reload(); } catch (e) { pushToast("error", (e as Error).message); } }} className="text-slate-300 hover:text-red-500">✕</button></div>)}
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
      {/* ดูรูปต่อ SKU เต็มจอ + เลื่อนดูได้ */}
      <ImageLightbox images={skuLb.images} index={skuLb.index} onClose={() => setSkuLb((s) => ({ ...s, index: -1 }))} onIndex={(i) => setSkuLb((s) => ({ ...s, index: i }))} />
      {reviseOpen && <ReviseModal fields={requiredFields} busy={busy} onCancel={() => setReviseOpen(false)} onConfirm={doRevise} />}
    </>
  );
}

