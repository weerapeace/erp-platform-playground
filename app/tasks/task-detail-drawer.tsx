"use client";

// ============================================================
// TaskDetailDrawer (ของกลางในโมดูล) — งานเต็ม: สถานะ/คืบหน้า/ข้อมูล/subtask/คอมเมนต์/ไฟล์/เปลี่ยนสถานะ
// ใช้ที่: หน้า /tasks และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ERPInput, ERPSelect } from "@/components/form";
import { UserPicker, ParentSkuPicker } from "@/components/pickers";
import type { UserPickerValue } from "@/components/pickers";
import { MultiUserPicker } from "./multi-user-picker";
import { ImageAttach, uploadResizedImage } from "@/components/image-attach";
import { RichTextEditor } from "@/components/rich-text";
import dynamic from "next/dynamic";
// คลังไฟล์กลาง (DAM) — เลือกรูปที่มีอยู่แล้วมาแนบ · dynamic กันลาก bundle ใหญ่
const AssetPicker = dynamic(() => import("@/components/asset-picker").then((m) => m.AssetPicker), { ssr: false });
// drawer สินค้ากลาง — กด Parent SKU แล้วเปิดดูได้ · dynamic กัน import วน
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
import { ImageInput } from "@/components/image-input";
import { ConfirmDialog } from "@/components/modal";
import { PublishModal } from "./publish-modal";
import { TeamFill } from "./team-picker";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { useMediaQuery } from "@/lib/use-media-query";
import { useDrawerTheme, DrawerThemeButton, drawerZoom, isHidden, densityCls, densityPad, densityGap, drawerBgStyle, orderedKeys, accentCss, btnBg, progressBg, dividerColorOf } from "./drawer-theme";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { SubtaskManager } from "./subtask-manager";
import { AssigneeAvatar, AssigneeChip } from "./assignee-avatar";
import { taskTypeLabel, useCreativeOptions } from "./use-options";
import { PlatformChip } from "./platform-chip";
import { TaskContentTab } from "./task-content-tab";
import { HoverImage } from "@/components/hover-image";
import { r2ImageUrl } from "@/lib/r2-image";
import { statusMeta, transitionsFrom, isTerminal, useCreativeStatuses } from "./use-statuses";
import {
  PRIORITY_META, APPROVAL_META, ASSET_META, isOverdue, priorityLabel, approvalLabel, assetLabel,
  getTask, updateTask, transitionTask, addComment, addAttachment, deleteAttachment,
  type TaskDetail, type CreativeTask, type CreativePriority, type Campaign, type BrandOption, type SubtaskAssignee,
} from "./data";

type ToastFn = (type: "success" | "error" | "info", m: string) => void;
const priorityOptions = () => (Object.keys(PRIORITY_META) as CreativePriority[]).map((k) => ({ value: k, label: priorityLabel(k) }));
// ผู้รับผิดชอบ (หลายคน) จัดการแยกที่ MultiAssigneeField ในโหมดดู — ฟอร์มแก้ไขเต็มไม่มี assignee แล้ว (กันรีเซ็ตหลายคน)
type EditForm = { task_type: string; priority: CreativePriority; brand_id: string; due_date: string; platforms: string[] };

export function StatusBadge({ status }: { status: string }) {
  useT();   // subscribe ภาษา → ป้ายสถานะสลับตามภาษา
  const m = statusMeta(status);
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>;
}
export function PriorityBadge({ priority }: { priority: CreativePriority }) {
  useT();   // subscribe ภาษา → ป้ายสลับตามภาษา
  const m = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{priorityLabel(priority)}</span>;
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

// ผู้รับผิดชอบงานหลัก "หลายคน" (m2m) = ตั้งเอง ∪ คนเริ่มงานย่อย · คลิกเพื่อแก้ (เฉพาะ ผจก./คนสร้างงาน)
function MultiAssigneeField({ list, canEdit, onSave }: { list: SubtaskAssignee[]; canEdit: boolean; onSave: (ids: string[]) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<UserPickerValue | null>(null);
  const ids = list.map((a) => a.id);
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400 mb-0.5">{t("ผู้รับผิดชอบ", "Assignees")}</p>
      {!editing ? (
        <button type="button" onClick={() => canEdit && setEditing(true)} title={canEdit ? t("คลิกเพื่อแก้", "Click to edit") : undefined}
          className={`min-w-0 text-left group rounded-md -mx-1 px-1 py-0.5 ${canEdit ? "hover:bg-violet-50/60" : "cursor-default"} transition-colors w-full`}>
          {list.length ? (
            <span className="flex flex-wrap items-center gap-1">{list.map((a) => <AssigneeChip key={a.id} a={a} />)}
              {canEdit && <span className="text-[10px] text-violet-400 opacity-0 group-hover:opacity-100">✎</span>}</span>
          ) : <span className="text-sm text-slate-300">— {canEdit && <span className="text-[10px] text-violet-400">✎</span>}</span>}
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {list.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1 text-xs rounded-full pl-0.5 pr-1.5 py-0.5" style={{ background: (a.color || "#8b5cf6") + "1f" }}>
                <AssigneeAvatar a={a} size={18} /><span className="text-slate-700">{a.label}</span>
                <button onClick={() => onSave(ids.filter((x) => x !== a.id))} className="text-slate-400 hover:text-red-500">✕</button>
              </span>
            ))}
            {list.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มี", "None")}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0"><UserPicker value={adding} onChange={(v) => { if (v && !ids.includes(v.id)) onSave([...ids, v.id]); setAdding(null); }} disableCreate /></div>
            <TeamFill onPick={(members) => { const fresh = members.map((m) => m.id).filter((mid) => !ids.includes(mid)); if (fresh.length) onSave([...ids, ...fresh]); }} />
          </div>
          <button onClick={() => setEditing(false)} className="text-[11px] text-slate-500 hover:underline">{t("เสร็จ", "Done")}</button>
        </div>
      )}
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
  const { statuses: allStatuses } = useCreativeStatuses();   // รายการสถานะทั้งหมด (สำหรับ admin ตั้งอิสระ)
  const t = useT();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [mentionUsers, setMentionUsers] = useState<UserPickerValue[]>([]);   // แจ้งเตือนถึงใครบ้างเมื่อส่งคอมเมนต์
  const [mentionAdding, setMentionAdding] = useState<UserPickerValue | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);   // เลือกรูปจากคลังไฟล์กลาง (DAM)
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState<EditForm | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);   // ยืนยันก่อนลบงาน
  const [publishToKey, setPublishToKey] = useState<string | null>(null);   // เปิด PublishModal เมื่อกด "เผยแพร่"
  const [qf, setQf] = useState<string | null>(null); // ฟิลด์ที่กำลัง quick edit
  const [openParentId, setOpenParentId] = useState<string | null>(null); // เปิด drawer Parent SKU
  const [tab, setTab] = useState<"task" | "content" | "reference">("task"); // แท็บ: งาน / คอนเทนต์ / อ้างอิง
  const [refHtml, setRefHtml] = useState("");     // เนื้อหาแท็บอ้างอิง (rich text)
  const [refSaving, setRefSaving] = useState(false);
  const [coverEdit, setCoverEdit] = useState(false); // เปิดช่องตั้งรูปปก
  const [submitNudge, setSubmitNudge] = useState(false); // เด้งเตือนเล็ก ๆ หลังแนบงาน (งานไม่มีงานย่อย) ให้ส่งงานเลย
  const { width: drawerW, startResize } = useDrawerResize("taskDrawerWidth", 900); // ลากปรับความกว้าง (ของกลาง) · กว้างพอโชว์ 2 คอลัมน์
  const { theme: dth, update: dthUpdate } = useDrawerTheme("task");   // ธีม drawer (ต่อคน)
  const DRAWER_SECTIONS = [
    { key: "cover", label: t("รูปปก", "Cover") }, { key: "due_date", label: t("กำหนดส่ง", "Due date") },
    { key: "brand", label: t("แบรนด์", "Brand") }, { key: "platform", label: "Platform" },
    { key: "task_type", label: t("ประเภทงาน", "Task type") }, { key: "assignee", label: t("ผู้รับผิดชอบ", "Assignee") },
    { key: "reviewer", label: t("ผู้ตรวจ", "Reviewer") }, { key: "assigned_by", label: t("ผู้มอบหมาย", "Assigned by") },
    { key: "campaign", label: t("แคมเปญ", "Campaign") }, { key: "parent", label: "Parent SKU" },
  ];
  const tSecOrder = orderedKeys(dth, DRAWER_SECTIONS.map((s) => s.key));
  const tOrderOf = (k: string) => tSecOrder.indexOf(k);   // ลำดับส่วนคอลัมน์ขวา (CSS order) ตามที่ผู้ใช้จัด
  const wideScreen = useMediaQuery("(min-width: 860px)");   // จอกว้างพอ (แท็บเล็ตแนวนอน/เดสก์ท็อป)
  const twoCol = drawerW >= 820 && wideScreen;   // กว้างพอ → ซ้าย/ขวาเรียงข้างกัน · มือถือ/แท็บเล็ตแคบ → เรียงบน-ล่าง

  const load = useCallback(async () => {
    setSubmitNudge(false);   // เคลียร์เด้งเตือนทุกครั้งที่โหลดใหม่ (เปลี่ยนงาน/รีเฟรช/หลังส่งงาน)
    try { setDetail(await getTask(taskId)); }
    catch (e) { pushToast("error", `${t("โหลดรายละเอียดไม่สำเร็จ", "Failed to load details")}: ${(e as Error).message}`); }
  }, [taskId, pushToast]);
  useEffect(() => { load(); }, [load]);
  // sync เนื้อหาอ้างอิงตอนเปลี่ยนงาน (ไม่ override ระหว่างพิมพ์)
  useEffect(() => { setRefHtml(detail?.reference_html ?? ""); }, [detail?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const saveRef = async () => { if (!detail) return; setRefSaving(true); try { await updateTask(detail.id, { reference_html: refHtml }); pushToast("success", t("บันทึกอ้างอิงแล้ว", "Reference saved")); await load(); } catch (e) { pushToast("error", (e as Error).message); } finally { setRefSaving(false); } };

  const refresh = async () => { await load(); await onChanged(); };
  const startEdit = () => {
    const d = detail; if (!d) return;
    setEf({ task_type: d.task_type ?? "", priority: d.priority, brand_id: d.brand_id ?? "", due_date: d.due_date ?? "", platforms: d.platforms ?? [] });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!ef || !detail) return; setBusy(true);
    try {
      await updateTask(detail.id, { task_type: ef.task_type || null, priority: ef.priority, brand_id: ef.brand_id || null, due_date: ef.due_date || null, platforms: ef.platforms });
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
  // ปุ่ม "ส่งงาน" = การเปลี่ยนสถานะไปข้างหน้า (ไม่ใช่ อนุมัติ/ตีกลับ/บล็อก) — ใช้กับเด้งเตือนหลังแนบงาน
  const forwardAction = actions.find((a) => !["approve", "reject", "revise", "block"].includes(a.kind));
  // สิทธิ์งานย่อย: ผจก./admin = จัดการได้หมด · ผู้ตรวจ = อนุมัติได้ · คนสร้างงาน = แก้ผู้รับผิดชอบได้
  const isManager = user?.role === "admin" || user?.role === "manager";
  const isAdmin = user?.role === "admin";   // ย้อน/ตั้งสถานะอิสระได้เฉพาะ admin
  const canApproveSub = isManager || (!!user?.id && (user.id === d.reviewer_id || (d.reviewers ?? []).some((r) => r.id === user.id)));
  const canManageAssignees = isManager || (!!user?.id && user.id === d.created_by);

  const handleMove = async (toKey: string) => { setBusy(true); await onMove(d, toKey); await refresh(); setBusy(false); };
  // admin: บังคับตั้งสถานะใดก็ได้ (force ข้ามกฎ workflow) — บันทึก audit ฝั่ง server
  const handleForceStatus = async (toKey: string) => { setBusy(true); try { await transitionTask(d.id, toKey, undefined, true); await refresh(); pushToast("success", t("เปลี่ยนสถานะแล้ว", "Status changed")); } catch (e) { pushToast("error", (e as Error).message); } finally { setBusy(false); } };
  const sendComment = async () => { if (!commentText.trim()) return; try { await addComment(d.id, commentText.trim(), mentionUsers.map((u) => u.id)); setCommentText(""); setMentionUsers([]); await load(); } catch (e) { pushToast("error", (e as Error).message); } };
  const addLink = async () => { if (!linkUrl.trim()) return; try { await addAttachment(d.id, { kind: "drive_link", label: linkLabel.trim() || undefined, url: linkUrl.trim() }); setLinkLabel(""); setLinkUrl(""); await load(); if ((detail?.subtasks?.length ?? 0) === 0) setSubmitNudge(true); } catch (e) { pushToast("error", (e as Error).message); } };

  const brandSel = brands.find((b) => b.id === d.brand_id);
  const brandColor = brandSel?.color ?? d.brand_color;
  const brandLogo = brandSel?.logo_url ?? null;   // R2 key ของโลโก้แบรนด์ (โชว์ผ่าน /api/r2-image)
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
  const hasSubtasks = (d.subtasks?.length ?? 0) > 0;   // มีงานย่อย → ซ่อนกล่องแนบระดับงานหลัก

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div style={{ width: drawerW }} className="fixed right-0 top-0 h-full max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        {/* แถบสีหลัก (ธีม) */}
        <div className="h-1 shrink-0" style={{ background: accentCss(dth) }} />
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
            <DrawerThemeButton theme={dth} update={dthUpdate} sections={DRAWER_SECTIONS} />
            {!editing && <button onClick={startEdit} className="h-8 px-2 text-xs text-violet-700 hover:bg-violet-50 rounded-md">✏️ {t("แก้ไข", "Edit")}</button>}
            <button onClick={() => setConfirmDel(true)} className="h-8 px-2 text-xs text-red-500 hover:bg-red-50 rounded-md">{t("ลบ", "Delete")}</button>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ ...drawerBgStyle(dth), zoom: drawerZoom(dth.size) }}>
          {/* บนสุด: สถานะ + ความคืบหน้า (รูปปกย้ายไปคอลัมน์ขวา) */}
          <div className="p-5 pb-4 space-y-4">
            {/* status row */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={d.status} />
              <PriorityBadge priority={d.priority} />
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${APPROVAL_META[d.approval_status].cls}`}>{t("อนุมัติ", "Approval")}: {approvalLabel(d.approval_status)}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ASSET_META[d.asset_status].cls}`}>{assetLabel(d.asset_status)}</span>
            </div>
            {/* progress */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1"><span>{t("ความคืบหน้า", "Progress")}</span><span>{d.progress_percent}%</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full" style={{ width: `${d.progress_percent}%`, background: progressBg(dth) }} /></div>
              {d.blocker_status === "blocked" && d.blocker_reason && <p className="text-xs text-red-600 mt-1">⚠ {t("ติดปัญหา", "Blocked")}: {d.blocker_reason}</p>}
            </div>
          </div>

          {/* แท็บ: งาน / คอนเทนต์ (โซเชียลพ่วงงาน) — โชว์จำนวนงานย่อย / คอนเทนต์ */}
          <div className="flex items-center gap-1 px-5 pt-1 pb-2 border-t border-slate-100" style={{ borderColor: dividerColorOf(dth) }}>
            {([["task", t("📋 งาน", "📋 Task"), d.subtasks?.length ?? 0], ["content", t("📱 คอนเทนต์", "📱 Content"), d.content_count ?? 0], ["reference", t("📎 อ้างอิง", "📎 Reference"), (d.reference_html ?? "").trim() ? 1 : 0]] as const).map(([k, label, count]) => (
              <button key={k} onClick={() => setTab(k)} style={tab === k ? { background: `${dth.accent}1f`, color: dth.accent } : undefined} className={`h-8 px-3 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${tab === k ? "" : "text-slate-500 hover:bg-slate-50"}`}>
                {label}{count > 0 && <span className="text-[11px] rounded-full px-1.5" style={tab === k ? { background: `${dth.accent}33`, color: dth.accent } : { background: "#e2e8f0", color: "#475569" }}>{count}</span>}
              </button>
            ))}
          </div>

          {/* 2 คอลัมน์: ซ้าย (เนื้องาน ~2/3) · ขวา (ข้อมูล ~1/3) — เรียงข้างกันเมื่อ drawer กว้างพอ */}
          {tab === "task" && (<>
          <div className={`flex ${twoCol ? (dth.swap ? "flex-row-reverse" : "flex-row") : "flex-col"} items-stretch`}>
            {/* ===== ซ้าย: รายละเอียดงาน + งานย่อย + ไฟล์ ===== */}
            <div className={`flex-1 min-w-0 w-full ${densityCls(dth.density)}`}>
              {/* รายละเอียดงาน (ถ้ามี) */}
              {d.description && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 whitespace-pre-wrap"><p className="text-xs text-slate-400 mb-1">{t("รายละเอียดงาน", "Description")}</p>{d.description}</div>}

              {/* งานย่อย (การ์ด) — ของกลางจัดการสด · ถ้าไม่มีจะมีปุ่มเพิ่มในตัว */}
              <SubtaskManager taskId={d.id} pushToast={pushToast} canApprove={canApproveSub} canManageAssignees={canManageAssignees} />

              {/* สินค้าที่เกี่ยวข้อง (SKU m2m) */}
              {(() => {
                const list = (d.skus && d.skus.length) ? d.skus : (d.sku_code ? [{ id: "_", code: d.sku_code, name: d.sku_name || d.product_name, color: d.sku_color, price: d.sku_price, image_key: d.sku_image_key }] : []);
                return list.length > 0 ? (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm">
                    <p className="text-xs text-slate-400 mb-1.5">{t("สินค้าที่เกี่ยวข้อง", "Related Products")} ({list.length})</p>
                    <div className="space-y-1.5">
                      {list.map((s, i) => (
                        <div key={s.id || i} className="flex items-center gap-2 flex-wrap">
                          <HoverImage url={r2ImageUrl(s.image_key)} size={36} rounded="rounded-md" />
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

              {/* ลิงก์ผลงาน */}
              {(d.drive_folder_url || d.final_asset_url || d.published_url) && (
                <div className="flex flex-wrap gap-2">
                  {d.drive_folder_url && <a href={d.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">📁 {t("โฟลเดอร์ Drive", "Drive Folder")}</a>}
                  {d.final_asset_url && <a href={d.final_asset_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🖼 {t("ไฟล์จริง", "Final Asset")}</a>}
                  {d.published_url && <a href={d.published_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50">🔗 {t("ลิงก์ที่เผยแพร่", "Published Link")}</a>}
                </div>
              )}

              {/* รูปแนบ + ลิงก์แนบ ระดับงาน — ซ่อนเมื่อมีงานย่อย (ไฟล์/งานไปอยู่ที่งานย่อยแทน) */}
              {!hasSubtasks && (<>
              {/* เด้งเตือนเล็ก ๆ (ไม่ใช่ popup) หลังแนบงาน → ถามว่าส่งงานเลยไหม */}
              {submitNudge && forwardAction && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                  <span className="flex-1">📤 {t("แนบงานแล้ว — ", "Work attached — ")}{forwardAction.label}{t("เลยไหม?", " now?")}</span>
                  <button disabled={busy} onClick={async () => { setSubmitNudge(false); await handleMove(forwardAction.to_key); }} className="h-7 px-3 text-xs font-medium text-white bg-amber-500 rounded-md hover:bg-amber-600 disabled:opacity-50 shrink-0">{forwardAction.label}</button>
                  <button onClick={() => setSubmitNudge(false)} className="h-7 px-2 text-xs text-amber-700 hover:underline shrink-0">{t("ไว้ก่อน", "Later")}</button>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("รูปแนบ", "Images")}</p>
                  <button onClick={() => setAssetPickerOpen(true)} className="text-xs font-medium text-violet-700 border border-violet-200 rounded-lg px-2 py-0.5 hover:bg-violet-50">📁 {t("เลือกจากคลังกลาง", "From asset library")}</button>
                </div>
                <ImageAttach
                  images={d.attachments.filter((a) => a.kind === "image" && a.r2_key).map((a) => ({ id: a.id, r2_key: a.r2_key, file_name: a.file_name }))}
                  onAttach={async (r) => { await addAttachment(d.id, { kind: "image", ...r }); await load(); if (!hasSubtasks) setSubmitNudge(true); }}
                  onDelete={async (aid) => { await deleteAttachment(d.id, aid); await load(); }}
                  pushToast={pushToast} />
              </div>

              {/* ลิงก์แนบ */}
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
              </>)}
            </div>

            {/* ===== ขวา: ข้อมูลงาน + ความคิดเห็น ===== */}
            <div className={`${twoCol ? "w-[340px] border-l" : "w-full border-t"} shrink-0 flex flex-col ${densityPad(dth.density)} ${densityGap(dth.density)} bg-slate-50/40 border-slate-100`} style={{ borderColor: dividerColorOf(dth) }}>
              {/* รูปปก (เล็ก) — โชว์ทั้งโหมดดู/แก้ */}
              {!isHidden(dth, "cover") && (
              <div style={{ order: tOrderOf("cover") }}>
                {coverKey ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200">
                    <img src={`/api/r2-image?key=${encodeURIComponent(coverKey)}&w=480`} alt="" className="w-full h-28 object-cover" />
                    {coverFromParent && <span className="absolute top-1.5 left-1.5 text-[9px] bg-black/55 text-white px-1 py-0.5 rounded">{t("รูปจาก Parent SKU", "From Parent SKU")}</span>}
                    <button type="button" onClick={() => setCoverEdit((v) => !v)} title={t("เปลี่ยนรูปปก", "Change cover")} className="absolute top-1.5 right-1.5 text-[10px] bg-white/90 hover:bg-white text-slate-700 border border-slate-200 rounded px-1.5 py-0.5">✎</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setCoverEdit(true)} className="w-full h-16 rounded-lg border-2 border-dashed border-slate-200 text-xs text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-colors">🖼️ {t("เพิ่มรูปปก", "Add cover")}</button>
                )}
                {coverEdit && (
                  <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/30 p-2 space-y-2">
                    <p className="text-[10px] text-slate-500">{t("รูปปกสำรอง — ถ้า Parent SKU มีรูป จะใช้รูป Parent SKU แทน", "Fallback cover — Parent SKU image takes priority")}</p>
                    <ImageInput value={d.cover_image_r2_key ?? null} onChange={(k) => saveQuick({ cover_image_r2_key: k })} folder="creative-tasks" />
                    <div className="flex justify-end"><button type="button" onClick={() => setCoverEdit(false)} className="text-[11px] text-slate-500 hover:underline">{t("เสร็จ", "Done")}</button></div>
                  </div>
                )}
              </div>
              )}
              {editing && ef ? (
                <div className="border border-violet-200 rounded-lg p-3 bg-violet-50/30 space-y-3" style={{ order: 1 }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-slate-400">{t("ประเภทงาน", "Task Type")}</label><ERPSelect value={ef.task_type} options={taskTypes} onChange={(e) => setEf({ ...ef, task_type: e.target.value })} /></div>
                    <div><label className="text-xs text-slate-400">{t("ความสำคัญ", "Priority")}</label><ERPSelect value={ef.priority} options={priorityOptions()} onChange={(e) => setEf({ ...ef, priority: e.target.value as CreativePriority })} /></div>
                    <div><label className="text-xs text-slate-400">{t("แบรนด์", "Brand")}</label><ERPSelect value={ef.brand_id} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => setEf({ ...ef, brand_id: e.target.value })} /></div>
                    <div><label className="text-xs text-slate-400">{t("กำหนดส่ง", "Due Date")}</label><ERPInput type="date" value={ef.due_date} onChange={(e) => setEf({ ...ef, due_date: e.target.value })} /></div>
                    <div className="col-span-2 text-[11px] text-slate-400">{t("ผู้รับผิดชอบ / ผู้ตรวจ (หลายคน) แก้ที่ช่องในโหมดดู", "Edit assignees / reviewers (multiple) in view mode")}</div>
                  </div>
                  <div><label className="text-xs text-slate-400">{t("แพลตฟอร์ม", "Platform")}</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">{platformOpts.map((p) => {
                      const on = ef.platforms.includes(p.value);
                      const img = p.icon_key ? r2ImageUrl(p.icon_key, 32) : null;
                      const hex = p.color && /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : null;
                      const offStyle = !on && hex ? { backgroundColor: `${hex}1a`, color: hex, borderColor: `${hex}55` } : undefined;
                      const cls = on ? "bg-violet-600 text-white border-violet-600" : hex ? "" : "bg-white text-slate-600 border-slate-200";
                      return <button key={p.value} type="button" onClick={() => setEf({ ...ef, platforms: on ? ef.platforms.filter((x) => x !== p.value) : [...ef.platforms, p.value] })} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${cls}`} style={offStyle}>
                        {img ? <img src={img} alt="" className="h-3.5 w-3.5 rounded-sm object-contain" /> : p.icon ? <span className="leading-none">{p.icon}</span> : null}
                        {p.label}
                      </button>;
                    })}</div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(false)} className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
                    <button onClick={saveEdit} disabled={busy} style={{ background: btnBg(dth) }} className="h-8 px-4 text-sm text-white rounded-lg disabled:opacity-50">{busy ? "..." : t("บันทึก", "Save")}</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* กำหนดส่ง — เด่น (ซ่อนถ้าไม่มี · กดแก้/เพิ่มได้) */}
                  {!isHidden(dth, "due_date") && (<div style={{ order: tOrderOf("due_date") }}>
                  {qf === "due_date" ? (
                    <div><p className="text-xs text-slate-400 mb-0.5">{t("กำหนดส่ง", "Due date")}</p>
                      <div className="flex items-start gap-1"><div className="flex-1"><ERPInput type="date" defaultValue={d.due_date ?? ""} onChange={(e) => saveQuick({ due_date: e.target.value || null })} /></div>
                        <button type="button" onClick={() => setQf(null)} className="text-slate-300 hover:text-slate-600 text-xs mt-2 shrink-0">✕</button></div>
                    </div>
                  ) : d.due_date ? (
                    <button type="button" onClick={() => setQf("due_date")} className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${isOverdue(d) ? "border-red-200 bg-red-50 hover:bg-red-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                      <p className="text-[10px] text-slate-400">{t("กำหนดส่ง", "Due date")}</p>
                      <p className={`text-base font-bold ${isOverdue(d) ? "text-red-600" : "text-slate-800"}`}>{isOverdue(d) && "⚠ "}{d.due_date}</p>
                    </button>
                  ) : (
                    <button type="button" onClick={() => setQf("due_date")} className="text-xs text-slate-400 hover:text-violet-600">＋ {t("เพิ่มกำหนดส่ง", "Add due date")}</button>
                  )}
                  </div>)}

                  {/* แบรนด์ — โลโก้เด่น */}
                  {!isHidden(dth, "brand") && (<div style={{ order: tOrderOf("brand") }}>{qf === "brand" ? (
                    <div><p className="text-xs text-slate-400 mb-0.5">{t("แบรนด์", "Brand")}</p>
                      <div className="flex items-start gap-1"><div className="flex-1"><ERPSelect value={d.brand_id ?? ""} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} onChange={(e) => saveQuick({ brand_id: e.target.value || null })} /></div>
                        <button type="button" onClick={() => setQf(null)} className="text-slate-300 hover:text-slate-600 text-xs mt-2 shrink-0">✕</button></div>
                    </div>
                  ) : d.brand_id ? (
                    <button type="button" onClick={() => setQf("brand")} className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
                      {brandLogo
                        ? <img src={`/api/r2-image?key=${encodeURIComponent(brandLogo)}&w=120`} alt="" className="h-10 w-10 rounded-lg object-contain bg-white border border-slate-100 shrink-0" />
                        : <span className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: brandColor || "#cbd5e1" }}>{(d.brand_label || "?").slice(0, 1)}</span>}
                      <div className="min-w-0 text-left"><p className="text-[10px] text-slate-400">{t("แบรนด์", "Brand")}</p><p className="text-sm font-semibold text-slate-800 truncate">{d.brand_label}</p></div>
                    </button>
                  ) : (
                    <button type="button" onClick={() => setQf("brand")} className="text-xs text-slate-400 hover:text-violet-600">＋ {t("เลือกแบรนด์", "Set brand")}</button>
                  )}</div>)}

                  {/* แพลตฟอร์มที่ลง */}
                  {!isHidden(dth, "platform") && d.platforms && d.platforms.length > 0 && (
                    <div style={{ order: tOrderOf("platform") }}><p className="text-[10px] text-slate-400 mb-1">Platform</p>
                      <div className="flex flex-wrap gap-1.5">{d.platforms.map((p) => <PlatformChip key={p} code={p} />)}</div>
                    </div>
                  )}

                  {/* ข้อมูลอื่น — แต่ละช่องเป็นส่วนเดี่ยว ซ่อน/จัดลำดับได้ (↑↓ ที่ 🎨) */}
                  {!isHidden(dth, "task_type") && (<div style={{ order: tOrderOf("task_type") }} className="pt-2 border-t border-slate-100">
                    <QuickField label={t("ประเภทงาน", "Task Type")} value={d.task_type ? taskTypeLabel(d.task_type) : null}
                      active={qf === "task_type"} onOpen={() => setQf("task_type")} onClose={() => setQf(null)}
                      editor={<ERPSelect value={d.task_type ?? ""} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...taskTypes]} onChange={(e) => saveQuick({ task_type: e.target.value || null })} />} />
                  </div>)}
                  {!isHidden(dth, "assignee") && (<div style={{ order: tOrderOf("assignee") }}><MultiAssigneeField list={d.assignees ?? []} canEdit={canManageAssignees}
                    onSave={(ids) => saveQuick({ assignee_ids: ids }, true)} /></div>)}
                  {!isHidden(dth, "reviewer") && (<div style={{ order: tOrderOf("reviewer") }}><QuickField label={t("ผู้ตรวจ/อนุมัติ", "Reviewer / Approver")} value={(d.reviewers ?? []).length ? (d.reviewers ?? []).map((r) => r.label).filter(Boolean).join(", ") : (d.reviewer_label || d.approver_label)}
                    active={qf === "reviewer"} onOpen={() => setQf("reviewer")} onClose={() => setQf(null)}
                    editor={<MultiUserPicker value={(d.reviewers ?? []).map((r) => ({ id: r.id, name: r.label } as UserPickerValue))} onChange={(v) => saveQuick({ reviewer_ids: v.map((x) => x.id) }, true)} disableCreate />} /></div>)}
                  {!isHidden(dth, "assigned_by") && (<div style={{ order: tOrderOf("assigned_by") }}><QuickField label={t("ผู้มอบหมาย", "Assigned by")} value={d.assigned_by_label}
                    active={qf === "assigned_by"} onOpen={() => setQf("assigned_by")} onClose={() => setQf(null)}
                    editor={<UserPicker value={d.assigned_by_id ? ({ id: d.assigned_by_id, name: d.assigned_by_label ?? "" } as UserPickerValue) : null} onChange={(v) => saveQuick({ assigned_by_id: v?.id ?? null })} disableCreate />} /></div>)}
                  {!isHidden(dth, "campaign") && (<div style={{ order: tOrderOf("campaign") }}><QuickField label={t("แคมเปญ", "Campaign")} value={campaignName}
                    active={qf === "campaign"} onOpen={() => setQf("campaign")} onClose={() => setQf(null)}
                    editor={<ERPSelect value={d.campaign_id ?? ""} options={[{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} onChange={(e) => saveQuick({ campaign_id: e.target.value || null })} />} /></div>)}
                  {!isHidden(dth, "parent") && (<div style={{ order: tOrderOf("parent") }}><QuickField label="Parent SKU" value={parentList.length ? parentList.map((p) => p.code).filter(Boolean).join(", ") : (d.parent_sku_code || null)}
                    active={qf === "parent_sku"} onOpen={() => setQf("parent_sku")} onClose={() => setQf(null)}
                    editor={
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {parentList.map((p) => <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full pl-2 pr-1 py-0.5"><button type="button" onClick={() => setOpenParentId(p.id)} title={t("เปิดดูสินค้า", "Open product")} className="hover:text-violet-700 hover:underline">{p.code || p.name}</button><button type="button" onClick={() => saveQuick({ parent_sku_ids: parentList.filter((x) => x.id !== p.id).map((x) => x.id) }, true)} className="text-slate-400 hover:text-red-500">✕</button></span>)}
                          {parentList.length === 0 && <span className="text-xs text-slate-400">{t("ยังไม่มี", "None")}</span>}
                        </div>
                        <ParentSkuPicker value={null} onChange={(v) => { if (v && !parentList.some((p) => p.id === v.id)) saveQuick({ parent_sku_ids: [...parentList.map((p) => p.id), v.id] }, true); }} />
                      </div>
                    } /></div>)}
                </>
              )}

            </div>
          </div>

          {/* ความคิดเห็น — section เต็มกว้างใต้ 2 คอลัมน์ */}
          <div className="border-t border-slate-100 px-5 py-4" style={{ borderColor: dividerColorOf(dth) }}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{t("ความคิดเห็น", "Comments")} ({d.comments.length})</p>
            <div className="space-y-2 mb-3">
              {d.comments.map((c) => (
                <div key={c.id} className="bg-white border border-slate-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-medium text-slate-700">{c.author_name || t("ผู้ใช้", "User")}</span><span className="text-xs text-slate-400">{c.created_at.slice(0, 16).replace("T", " ")}</span></div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {d.comments.length === 0 && <p className="text-sm text-slate-400 italic">{t("ยังไม่มีความคิดเห็น", "No comments yet")}</p>}
            </div>
            <div className="flex gap-2">
              <ERPInput value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder={t("เขียนความคิดเห็น...", "Write a comment...")} />
              <button onClick={sendComment} style={{ background: btnBg(dth) }} className="h-9 px-4 text-sm font-medium text-white rounded-lg shrink-0">{t("ส่ง", "Send")}</button>
            </div>
            {/* แจ้งเตือนถึง (@mention) — คนที่เลือกจะได้แจ้งเตือนเมื่อส่งคอมเมนต์ */}
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              <span className="text-[11px] text-slate-400">🔔 {t("แจ้งถึง", "Notify")}:</span>
              {mentionUsers.map((u) => (
                <span key={u.id} className="inline-flex items-center gap-1 text-[11px] bg-violet-50 text-violet-700 border border-violet-200 rounded-full pl-2 pr-1 py-0.5">{u.name}
                  <button onClick={() => setMentionUsers((xs) => xs.filter((x) => x.id !== u.id))} className="text-violet-300 hover:text-red-500">✕</button></span>
              ))}
              <div className="w-40"><UserPicker value={mentionAdding} onChange={(v) => { if (v && !mentionUsers.some((x) => x.id === v.id)) setMentionUsers((xs) => [...xs, v]); setMentionAdding(null); }} disableCreate /></div>
            </div>
          </div>
          </>)}

          {tab === "content" && (
            <TaskContentTab taskId={d.id} brandId={d.brand_id} brands={brands} pushToast={pushToast} />
          )}
          {tab === "reference" && (
            <div className="p-5 space-y-2">
              <p className="text-xs text-slate-400">{t("โน้ต/ข้อมูลอ้างอิงของงานนี้ — ใส่หัวข้อ/ลิสต์/ลิงก์/รูปได้ (วาง Ctrl+V)", "Notes / references for this task — headings, lists, links, images (paste Ctrl+V)")}</p>
              <RichTextEditor value={refHtml} onChange={setRefHtml} minHeight={320}
                placeholder={t("พิมพ์ข้อมูลอ้างอิง…", "Type reference notes…")}
                onUploadImage={async (f) => { const r = await uploadResizedImage(f, { folder: "creative-tasks", max: 1600 }); return r2ImageUrl(r.r2_key) ?? ""; }} />
              <div className="flex justify-end">
                <button onClick={saveRef} disabled={refSaving} style={{ background: btnBg(dth) }} className="h-9 px-5 text-sm font-medium text-white rounded-lg disabled:opacity-50">{refSaving ? t("กำลังบันทึก…", "Saving…") : t("บันทึกอ้างอิง", "Save reference")}</button>
              </div>
            </div>
          )}
        </div>

        {assetPickerOpen && (
          <AssetPicker open onClose={() => setAssetPickerOpen(false)} multiple typeFilter="image"
            title={t("เลือกรูปจากคลังไฟล์กลาง", "Pick images from asset library")}
            contextLabel={d.task_no ? `${d.task_no} ${d.title}` : d.title}
            onSelect={async (assets) => {
              setAssetPickerOpen(false);
              for (const a of assets) { try { await addAttachment(d.id, { kind: "image", r2_key: a.r2_key, file_name: a.file_name }); } catch { /* ข้ามรูปที่แนบไม่ได้ */ } }
              await load();
            }} />
        )}

        {/* admin: ย้อน/ตั้งสถานะอิสระ (เห็นเฉพาะ admin) */}
        {isAdmin && (
          <div className="border-t border-amber-100 bg-amber-50/50 px-6 py-2 shrink-0 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-amber-700">🔧 admin · {t("ย้อน/ตั้งสถานะ", "Set status")}:</span>
            <select value={d.status} disabled={busy} onChange={(e) => { const to = e.target.value; if (to && to !== d.status && window.confirm(`${t("เปลี่ยนสถานะเป็น", "Set status to")} "${statusMeta(to).label}"?`)) handleForceStatus(to); }} className="h-8 px-2 text-xs border border-amber-200 rounded-lg bg-white">
              {allStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <span className="text-[11px] text-amber-600">{t("(บังคับเปลี่ยน ข้ามกฎ workflow · บันทึกประวัติ)", "(force change, bypasses workflow · audited)")}</span>
          </div>
        )}
        {/* footer actions — งานที่มีงานย่อย: คนทั่วไปเห็นสถานะอ่านอย่างเดียว (สถานะมาจากงานย่อย) · แอดมิน/ผจก.ยังกดได้ */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2 flex-wrap">
          {hasSubtasks && !isManager ? (
            <div className="w-full flex items-center justify-center gap-2 flex-wrap">
              <span className="text-sm text-slate-400">{t("สถานะ", "Status")}:</span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${statusMeta(d.status).cls}`}><span className={`h-1.5 w-1.5 rounded-full ${statusMeta(d.status).dot}`} />{statusMeta(d.status).label}</span>
              <span className="text-xs text-slate-400">— {t("สถานะมาจากงานย่อย (ดูอย่างเดียว)", "driven by subtasks (view only)")}</span>
            </div>
          ) : actions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center w-full">{isClosed ? `${t("งานปิดแล้ว", "Task closed")} (${statusMeta(d.status).label})` : t("ไม่มีการกระทำ", "No actions available")} — {t("ดูได้อย่างเดียว", "Read only")}</p>
          ) : actions.map((a, i) => {
            const isPrimary = !["approve", "reject", "revise", "block"].includes(a.kind) && i === 0;
            const cls = a.kind === "approve" ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : a.kind === "reject" ? "text-red-600 border border-red-200 hover:bg-red-50"
              : a.kind === "revise" ? "text-orange-700 border border-orange-200 hover:bg-orange-50"
              : a.kind === "block" ? "text-red-600 border border-red-200 hover:bg-red-50"
              : isPrimary ? "flex-1 text-white" : "text-slate-600 border border-slate-200 hover:bg-slate-50";
            return <button key={a.to_key} disabled={busy} onClick={() => { if (a.to_key === "published") setPublishToKey(a.to_key); else handleMove(a.to_key); }} style={isPrimary ? { background: btnBg(dth) } : undefined} className={`h-9 px-4 text-sm font-medium rounded-lg disabled:opacity-50 ${cls}`}>{a.label}</button>;
          })}
        </div>
      </div>
      {openParentId && <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={openParentId} onClose={() => setOpenParentId(null)} onChanged={() => {}} />}
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); onDelete(d.id); }} variant="danger" title={t("ลบงานนี้?", "Delete this task?")} message={t(`ลบงาน "${d.title}" — รวมงานย่อย/คอนเทนต์ที่ผูกอยู่ และกู้คืนไม่ได้`, `Delete "${d.title}" including its subtasks/content. This cannot be undone.`)} confirmText={t("ลบ", "Delete")} cancelText={t("ยกเลิก", "Cancel")} />
      {publishToKey && <PublishModal taskId={d.id} parents={parentList} parentFallback={d.parent_sku_code} taskPlatforms={d.platforms ?? []} onClose={() => setPublishToKey(null)} onConfirm={async () => { const to = publishToKey; setPublishToKey(null); if (to) await handleMove(to); }} pushToast={pushToast} />}
    </>
  );
}
