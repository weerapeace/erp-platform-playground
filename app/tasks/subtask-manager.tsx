"use client";

// ============================================================
// SubtaskManager (ของกลางในโมดูล) — จัดการงานย่อยแบบสด (โหลด/ติ๊กเสร็จ/เพิ่ม/แก้ผู้รับผิดชอบ/ไฟล์แนบ)
// ใช้ที่: TaskDetailDrawer (/tasks) และ drawer การ์ดงานบน Campaign Canvas
// ============================================================

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { type ParentSkuPickerValue } from "@/components/pickers";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { AssigneeAvatar, AssigneeChip } from "./assignee-avatar";
import { listSubtasks, addSubtask, listSubtaskTypes, type CreativeSubtask, type TaskParentRef, type TaskSkuRef } from "./data";
import { useProductModeCfg } from "./product-edit-mode";
import type { PushToast } from "@/components/toast";
import { SUBTASK_STATUS, SUBTASK_STATUS_STEPS, isSubDone, subStatusLabel } from "./subtask-status";
import { AddSubtaskForm, ReviseModal } from "./subtask-forms";
import { SubtaskCard, type TypeMeta, type DirectCtx } from "./subtask-card";
export { SubtaskCard } from "./subtask-card";   // ย้ายไป subtask-card.tsx — re-export กันโค้ดเดิมที่อ้างจากไฟล์นี้
export { AddSubtaskForm, ReviseModal } from "./subtask-forms";   // ย้ายไป subtask-forms.tsx — re-export กันโค้ดเดิมที่อ้างจากไฟล์นี้

// อวตาร/ชิปผู้รับผิดชอบ — ของกลาง (แยกไฟล์เบา) · re-export กันโค้ดเดิมที่เคยอ้างจากไฟล์นี้
export { AssigneeAvatar, AssigneeChip };

// ④ สถานะงานย่อย: ยังไม่เริ่ม → กำลังทำ → ส่งงาน(รออนุมัติ) → อนุมัติ — ป้าย/สีมาจากของกลาง ./subtask-status
export const SUB_STEPS = SUBTASK_STATUS_STEPS.map((key) => ({ key, label: () => subStatusLabel(key), dot: SUBTASK_STATUS[key].dot }));

/** กล่องจัดการงานย่อยแบบครบ (โหลดเอง) — ใช้บน canvas/หน้าอื่นได้
 *  canApprove = เห็นปุ่มอนุมัติ (admin/ผจก./ผู้ตรวจ) · canManageAssignees = แก้ผู้รับผิดชอบได้ (admin/ผจก./คนสร้างงาน) */
export function SubtaskManager({ taskId, subCardStyle, pushToast, canApprove = false, canManageAssignees = false, taskType = null, taskCreatedAt = null, parents = [], skus = [], onAddParent }: { taskId: string; brandId?: string | null; subCardStyle?: CSSProperties; pushToast: PushToast; canApprove?: boolean; canManageAssignees?: boolean;
  /** 🔁 โหมดใหม่ (แก้ที่สินค้าในงาน) — ประเภทงาน + วันสร้าง (เทียบวันที่เปิดโหมด) + สินค้าของงาน */
  taskType?: string | null; taskCreatedAt?: string | null; parents?: TaskParentRef[]; skus?: TaskSkuRef[];
  /** เลือก/สร้าง Parent SKU จากการ์ดงานย่อย → ผูกเข้างาน (หน้างานบันทึก + โหลดใหม่) */
  onAddParent?: (p: ParentSkuPickerValue) => Promise<void> }) {
  const { user } = useAuth();
  const t = useT();
  const modeCfg = useProductModeCfg();
  const direct: DirectCtx = { modeCfg, taskType, taskCreatedAt, parents, skus, onAddParent };
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
          {shown.length === 0 ? <p className="text-sm text-slate-400 italic">{tab === "mine" ? t("ไม่มีงานย่อยที่มอบให้คุณ", "No subtasks assigned to you") : t("ยังไม่มีงานย่อย", "No subtasks yet")}</p> : shown.map((s) => <SubtaskCard key={s.id} sub={s} taskId={taskId} reload={reload} pushToast={pushToast} canApprove={canApprove} canManageAssignees={canManageAssignees} typeMeta={typeMeta} hasDescSibling={hasDescSubtask} subCardStyle={subCardStyle} direct={direct} />)}
        </div>
      )}
      <AddSubtaskForm
        onAdd={async (body) => { await addSubtask(taskId, body); await reload(); }}
        onAddType={async (ty, opts) => {
          // เพิ่ม 1 งานย่อยของชนิดที่เลือก + ก๊อปค่าตั้ง (config) จาก registry · content: ใส่ประเภทคอนเทนต์ + ผู้รับผิดชอบจากมินิฟอร์ม
          const isDescText = ty.approve_target === "sku_description";
          await addSubtask(taskId, {
            title: ty.label_th, type: ty.key, required_before_next: false,
            assignee_ids: opts?.assignee_ids ?? [],
            config: {
              required: ty.default_required, due_offset_days: ty.default_due_offset_days,
              requires_approval: ty.requires_approval, approve_target: ty.approve_target,
              accepts_text: ty.accepts_text, accepts_image: ty.accepts_image, accepts_multi_image: ty.accepts_multi_image, accepts_link: ty.accepts_link, accepts_file: ty.accepts_file,
              applies_to: (ty.applies_to as ("parent" | "sku")[]) ?? ["parent", "sku"],
              has_copy_prompt: ty.has_copy_prompt, prompt_template: ty.prompt_template,
              description_field: isDescText ? "description" : undefined, desc_mode: isDescText ? "append" : undefined,
              ...(opts?.post_type ? { post_type: opts.post_type } : {}),
              ...(opts?.content_template_id ? { content_template_id: opts.content_template_id } : {}),
            },
          });
          await reload();
          pushToast("success", t("เพิ่มงานย่อยแล้ว", "Subtask added"));
        }}
        pushToast={pushToast}
      />
    </div>
  );
}

