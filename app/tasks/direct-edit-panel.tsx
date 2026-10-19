"use client";

/**
 * 🔁 โหมดใหม่ของงานสินค้า (แก้ที่สินค้าในงานเลย) — แผงในการ์ดงานย่อย รูปภาพ / รูปคำอธิบาย / เขียนคำอธิบาย
 *
 *   1) ปุ่ม "✏️ แก้ที่สินค้า" ต่อ Parent/SKU ของงาน → เปิดตัวแก้สินค้ากลางตัวจริง (MasterRecordDrawer)
 *      ระหว่างเปิด ตั้งบริบท "แก้จากงานนี้" (lib/edit-context) → server จดเวอร์ชันพร้อมเลขงาน/งานย่อย
 *   2) "สิ่งที่แก้ในงานนี้" — ดึงจาก /api/record-versions?task_id=&subtask_id= (ก่อน → หลัง · ย้อนกลับได้ทีละรายการ)
 *   3) ส่งงาน = ยืนยันรายการที่แก้ (ไม่ต้องอัปโหลดซ้ำ) → ผู้ตรวจเห็นรายการเดียวกัน อนุมัติ = จบ (ไม่ส่งซ้ำ: config.edit_mode=direct)
 * ของกลางที่ใช้: MasterRecordDrawer · ERPModal · ConfirmDialog · HoverImage · record-versions API
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { setEditContext, clearEditContext } from "@/lib/edit-context";
import type { TaskParentRef, TaskSkuRef } from "./data";
import { DEFAULT_SKIP_SUBTASKS, DIRECT_TARGETS, isDirectTask, useProductModeCfg, type ProductModeCfg } from "./product-edit-mode";

const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type ToastFn = (type: "success" | "error" | "info", m: string) => void;
export type TaskChange = {
  id: string; entity_type: string; entity_id: string; code: string | null; subtask_id: string | null;
  kind: "field" | "image"; field_key: string; old_value: unknown; new_value: unknown; r2_key: string | null; image_url: string | null;
  source: string | null; actor_name: string | null; changed_at: string;
  is_current: boolean; current_value: string | null; in_effect: boolean;
};

const FIELD_LABEL: Record<string, [string, string]> = {
  name_th: ["ชื่อ (ไทย)", "Name (TH)"], name_en: ["ชื่อ (EN)", "Name (EN)"],
  name_platform: ["ชื่อบนแพลตฟอร์ม", "Platform name"], name_platform_en: ["ชื่อบนแพลตฟอร์ม (EN)", "Platform name (EN)"],
  introduction: ["Introduction", "Introduction"], introduction_en: ["Introduction (EN)", "Introduction (EN)"],
  description: ["Description", "Description"], english_description: ["Description (EN)", "Description (EN)"],
  platform_description: ["รายละเอียด Platform", "Platform description"], platform_description_en: ["รายละเอียด Platform (EN)", "Platform description (EN)"],
  cover: ["รูปปก", "Cover image"], gallery: ["รูปสินค้า", "Product image"], description_images: ["รูป Description", "Description image"],
};
const textOf = (x: unknown): string | null => (x == null ? null : typeof x === "string" ? x : null);
const keyOf = (x: unknown): string | null => (x && typeof x === "object" && typeof (x as { r2_key?: unknown }).r2_key === "string" ? (x as { r2_key: string }).r2_key : null);
const isAdd = (c: TaskChange) => c.source === "gallery_add" || c.source === "description_image_add";

/** โหลดสิ่งที่แก้ในงานย่อยนี้ (ไม่นับรายการ "ย้อนกลับ" — ผลของมันโชว์เป็นป้าย "ย้อนแล้ว" บนรายการเดิม) */
/** subtaskId = null → ทุกอย่างที่แก้ในงานนี้ (ระดับงาน — งานโหมดใหม่ที่ไม่มีงานย่อยสินค้า) */
export function useTaskChanges(taskId: string, subtaskId: string | null, enabled = true) {
  const [changes, setChanges] = useState<TaskChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    try {
      const r = await apiFetch(`/api/record-versions?task_id=${taskId}${subtaskId ? `&subtask_id=${subtaskId}` : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setChanges(((j.changes ?? []) as TaskChange[]).filter((c) => c.source !== "restore"));
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  }, [taskId, subtaskId, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  const active = useMemo(() => (changes ?? []).filter((c) => c.in_effect), [changes]);
  return { changes, active, error, reload };
}

/** รายการ "สิ่งที่แก้" (ก่อน → หลัง) — ใช้ทั้งบนการ์ดและในป๊อปส่งงาน */
export function ChangeList({ changes, canUndo, onUndo, compact = false }: { changes: TaskChange[]; canUndo: boolean; onUndo?: (c: TaskChange) => void; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const label = (c: TaskChange) => { const l = FIELD_LABEL[c.field_key]; return l ? t(l[0], l[1]) : c.field_key; };
  return (
    <ul className="space-y-1.5">
      {changes.map((c) => {
        const expanded = open.has(c.id);
        const flip = () => setOpen((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
        const verb = isAdd(c) ? t("เพิ่ม", "Added") : c.source === "gallery_delete" || c.source === "description_image_remove" ? t("ลบออก", "Removed") : t("แก้", "Edited");
        return (
          <li key={c.id} className={`rounded-lg border px-2.5 py-2 ${c.in_effect ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70"}`}>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
              {c.code && <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c.code}</span>}
              <span className="font-medium text-slate-700">{verb} {label(c)}</span>
              {!c.in_effect && <span className="text-slate-400">· {t("ย้อนแล้ว", "Undone")}</span>}
              <span className="ml-auto text-slate-400">{c.actor_name ? c.actor_name.split("@")[0] : ""}</span>
            </div>
            {c.kind === "field" ? (
              <div className="mt-1 grid gap-1 text-xs leading-relaxed">
                <p className={`whitespace-pre-wrap break-words text-rose-700/80 line-through decoration-rose-300 ${expanded ? "" : (compact ? "line-clamp-1" : "line-clamp-2")}`}>{textOf(c.old_value) ?? t("(ว่าง)", "(empty)")}</p>
                <p className={`whitespace-pre-wrap break-words text-emerald-700 ${expanded ? "" : (compact ? "line-clamp-1" : "line-clamp-3")}`}>{textOf(c.new_value) ?? t("(ว่าง)", "(empty)")}</p>
                <button type="button" onClick={flip} className="justify-self-start text-[11px] text-violet-600 hover:underline">{expanded ? t("ย่อ", "Less") : t("ดูเต็ม", "Show all")}</button>
              </div>
            ) : (
              <div className="mt-1.5 flex items-center gap-2">
                {c.field_key === "cover" ? <>
                  <HoverImage url={c.image_url} size={44} previewSize={320} rounded="rounded-md" fallback="🖼" />
                  <span className="text-slate-300 text-xs">→</span>
                  <HoverImage url={r2ImageUrl(keyOf(c.new_value))} size={44} previewSize={320} rounded="rounded-md" fallback="—" />
                </> : <HoverImage url={c.image_url} size={44} previewSize={320} rounded="rounded-md" fallback="🖼" />}
              </div>
            )}
            {canUndo && c.in_effect && !isAdd(c) && onUndo && (
              <div className="mt-1.5 flex justify-end">
                <button type="button" onClick={() => onUndo(c)} className="h-7 px-2.5 rounded-md border border-orange-200 bg-white text-[11px] font-medium text-orange-700 hover:bg-orange-50">↩︎ {t("ย้อนกลับ", "Undo")}</button>
              </div>
            )}
            {isAdd(c) && c.in_effect && canUndo && <p className="mt-1 text-[10px] text-slate-400 text-right">{t("ไม่ใช้รูปนี้ → ลบในตัวแก้สินค้า", "Don't want it? Delete it in the product editor")}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function DirectEditPanel({ taskId, subId, approveTarget, parents, skus, canEdit, canUndo, onBeforeEdit, onAddParent, changes, error, reloadChanges, pushToast }: {
  taskId: string; subId: string | null; approveTarget: string;
  parents: TaskParentRef[]; skus: TaskSkuRef[];
  /** เลือก/สร้าง Parent SKU จากการ์ด → ผูกเข้างาน (การ์ดเปิดหน้า Parent ให้ต่อทันที) · ไม่ส่ง = ไม่มีช่องเลือก */
  onAddParent?: (p: ParentSkuPickerValue) => Promise<void>;
  /** แก้สินค้าได้ (ผู้รับผิดชอบ/ผู้ตรวจ ที่งานยังไม่ปิด) */
  canEdit: boolean;
  /** ย้อนรายการได้ (ผู้แก้เอง/ผู้ตรวจ) */
  canUndo: boolean;
  /** ก่อนเปิดตัวแก้ครั้งแรก — การ์ดตั้ง edit_mode=direct + เริ่มงานให้ */
  onBeforeEdit: () => Promise<void>;
  changes: TaskChange[] | null; error: string | null; reloadChanges: () => Promise<void>;
  pushToast: ToastFn;
}) {
  const t = useT();
  const [editing, setEditing] = useState<{ kind: "parent" | "sku"; id: string } | null>(null);
  const [undoTarget, setUndoTarget] = useState<TaskChange | null>(null);
  const [busy, setBusy] = useState(false);
  // งานรูปคำอธิบาย/เขียนคำอธิบาย → คำอธิบายอยู่ที่ Parent เท่านั้น · งานรูปภาพ → Parent + SKU ที่ผูกกับงาน
  const showSkus = approveTarget === "sku_media";
  const startInEdit = approveTarget === "sku_description";   // เขียนคำอธิบาย = เปิดมาในโหมดแก้เลย (รูปแก้ได้ในโหมดดูอยู่แล้ว)

  const open = async (kind: "parent" | "sku", id: string) => {
    try { await onBeforeEdit(); } catch { /* ตั้งค่าไม่ได้ก็เปิดตัวแก้ได้ */ }
    setEditContext({ taskId, subtaskId: subId });
    setEditing({ kind, id });
  };
  const close = () => { clearEditContext(); setEditing(null); void reloadChanges(); };
  useEffect(() => () => clearEditContext(), []);

  const doUndo = async () => {
    if (!undoTarget) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/record-versions", {
        method: "POST", body: JSON.stringify({ version_id: undoTarget.id }),
        headers: { "Content-Type": "application/json", "x-erp-task": taskId, ...(subId ? { "x-erp-subtask": subId } : {}) },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("ย้อนกลับไม่สำเร็จ", "Undo failed"));
      pushToast("success", t("ย้อนกลับแล้ว", "Undone"));
      setUndoTarget(null);
      await reloadChanges();
    } catch (e) { pushToast("error", e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Undo failed")); }
    finally { setBusy(false); }
  };

  const noProducts = parents.length === 0 && (!showSkus || skus.length === 0);
  // เลือก/สร้าง Parent จากการ์ด → ผูกเข้างาน แล้วเปิดหน้า Parent ตัวนั้นทันที (ไปลากรูปลง SKU ต่อได้เลย)
  const [adding, setAdding] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const pickParent = async (v: ParentSkuPickerValue | null) => {
    if (!v || !onAddParent) return;
    if (parents.some((p) => p.id === v.id)) { setPickOpen(false); void open("parent", v.id); return; }
    setAdding(true);
    try { await onAddParent(v); setPickOpen(false); await open("parent", v.id); }
    catch (e) { pushToast("error", e instanceof Error ? e.message : t("ผูก Parent SKU ไม่สำเร็จ", "Couldn't link the Parent SKU")); }
    finally { setAdding(false); }
  };
  const picker = onAddParent && canEdit ? (
    <div className={`flex items-center gap-2 ${adding ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="min-w-0 flex-1"><ParentSkuPicker value={null} onChange={(v) => void pickParent(v)} placeholder={t("ค้นหา Parent SKU (รหัส / ชื่อ) หรือสร้างใหม่…", "Search a Parent SKU (code / name) or create new…")} /></div>
      {adding && <span className="text-[11px] text-slate-400 shrink-0">{t("กำลังผูก…", "Linking…")}</span>}
    </div>
  ) : null;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2.5">
      <p className="text-[11px] text-violet-700">🔁 {t("โหมดใหม่ — แก้ที่สินค้าได้เลย ระบบเก็บเวอร์ชันเก่าและสรุปสิ่งที่แก้ให้ผู้ตรวจ ไม่ต้องอัปโหลดซ้ำ", "New mode — edit the product directly. Old versions are kept and changes summarised for the reviewer. No re-upload needed.")}</p>

      {noProducts ? (
        picker ?? <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">{t("งานนี้ยังไม่ได้ผูก Parent SKU — เพิ่มที่ช่อง \"Parent SKU\" ของงานก่อน", "No Parent SKU linked yet — add one in the task's \"Parent SKU\" field first")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {parents.map((p) => (
            <button key={p.id} type="button" disabled={!canEdit} onClick={() => void open("parent", p.id)}
              title={canEdit ? t("เปิดตัวแก้สินค้าตัวจริง", "Open the real product editor") : t("ต้องเป็นผู้รับผิดชอบ/ผู้ตรวจ และงานยังไม่ปิด", "Assignee/reviewer only, while the task is open")}
              className="inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-lg border border-violet-200 bg-white text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
              <HoverImage url={r2ImageUrl(p.image_key)} size={24} rounded="rounded" fallback="📦" />
              ✏️ {t("แก้ที่สินค้า", "Edit product")} <span className="font-mono text-slate-500">{p.code || p.name}</span>
            </button>
          ))}
          {showSkus && skus.filter((s) => s.id && s.id !== "_").map((s) => (
            <button key={s.id} type="button" disabled={!canEdit} onClick={() => void open("sku", s.id)}
              className="inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <HoverImage url={r2ImageUrl(s.image_key)} size={24} rounded="rounded" fallback="🎨" />
              ✏️ SKU <span className="font-mono text-slate-500">{s.code || s.name}</span>
            </button>
          ))}
          {picker && !pickOpen && (
            <button type="button" onClick={() => setPickOpen(true)} className="inline-flex items-center h-8 px-2.5 rounded-lg border border-dashed border-violet-300 text-xs text-violet-600 hover:bg-white">＋ {t("เพิ่ม Parent SKU", "Add Parent SKU")}</button>
          )}
        </div>
      )}
      {!noProducts && pickOpen && picker}

      <div>
        <p className="text-[11px] font-medium text-slate-500 mb-1">{t("สิ่งที่แก้ในงานนี้ (ระบบจดให้เอง)", "Changes made in this task (recorded automatically)")}</p>
        {error ? (
          <div className="flex items-center justify-between gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
            <span>⚠ {error}</span>
            <button type="button" onClick={() => void reloadChanges()} className="shrink-0 h-7 px-2 rounded border border-red-200 bg-white">{t("ลองใหม่", "Retry")}</button>
          </div>
        ) : changes === null ? (
          <div className="space-y-1.5" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-10 rounded-md bg-white/70 animate-pulse" />)}</div>
        ) : changes.length === 0 ? (
          <p className="text-xs text-slate-400">{t("ยังไม่มี — กด \"แก้ที่สินค้า\" แล้วแก้รูป/คำอธิบาย ระบบจะจดมาไว้ตรงนี้", "Nothing yet — press \"Edit product\", change images/description and they'll appear here")}</p>
        ) : (
          <ChangeList changes={changes} canUndo={canUndo} onUndo={setUndoTarget} />
        )}
      </div>

      {editing && (
        <MasterRecordDrawer
          moduleKey={editing.kind === "parent" ? "parent-skus-v2" : "skus-v2"}
          apiPath={editing.kind === "parent" ? "parent-skus" : "skus"}
          recordId={editing.id} startInEdit={startInEdit && editing.kind === "parent"}
          onClose={close} onChanged={() => { void reloadChanges(); }} />
      )}
      <ConfirmDialog open={!!undoTarget} onClose={() => { if (!busy) setUndoTarget(null); }} onConfirm={() => void doUndo()} loading={busy}
        title={t("ย้อนรายการนี้กลับ?", "Undo this change?")}
        message={t("สินค้าจะกลับเป็นค่าก่อนแก้ — ค่าตอนนี้ยังเก็บเป็นเวอร์ชันในสินค้า ย้อนกลับได้อีก", "The product goes back to its previous value — the current value stays in the product's version history")}
        confirmText={t("ย้อนกลับ", "Undo")} />
    </div>
  );
}

/** ป๊อปส่งงานโหมดใหม่ — ยืนยันรายการที่แก้ (ไม่มีอะไรแก้ ต้องติ๊กยืนยันเอง) */
export function DirectSubmitModal({ changes, onClose, onConfirm }: { changes: TaskChange[]; onClose: () => void; onConfirm: () => Promise<void> }) {
  const t = useT();
  const [none, setNone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = changes.filter((c) => c.in_effect);
  const submit = async () => {
    if (active.length === 0 && !none) { setErr(t("ยังไม่มีการแก้ในงานนี้ — ติ๊ก \"ไม่มีอะไรต้องแก้\" ถ้าตั้งใจส่งแบบนี้", "No changes yet — tick \"Nothing needed changing\" if that's intended")); return; }
    setBusy(true); setErr(null);
    try { await onConfirm(); } catch (e) { setErr(e instanceof Error ? e.message : t("ส่งงานไม่สำเร็จ", "Submit failed")); setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={t("ส่งงาน — ตรวจสิ่งที่แก้", "Submit — review changes")} size="md" defaultExpanded={false}
      footer={<>
        <button type="button" onClick={onClose} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => void submit()} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{busy ? "..." : `✅ ${t("ยืนยันส่งงาน", "Confirm submit")}`}</button>
      </>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{active.length > 0
          ? t(`มี ${active.length} การเปลี่ยนแปลง — ผู้ตรวจจะเห็นรายการนี้ ถ้าไม่ผ่านกดย้อนกลับได้ทีละรายการ`, `${active.length} change(s) — the reviewer sees this list and can undo each one`)
          : t("ยังไม่มีการแก้ในงานนี้", "No changes in this task yet")}</p>
        {active.length > 0 && <ChangeList changes={active} canUndo={false} compact />}
        {active.length === 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={none} onChange={(e) => { setNone(e.target.checked); setErr(null); }} />
            {t("ไม่มีอะไรต้องแก้ (ส่งงานโดยไม่เปลี่ยนสินค้า)", "Nothing needed changing (submit without product changes)")}
          </label>
        )}
        {err && <p className="text-xs text-red-600">⚠ {err}</p>}
      </div>
    </ERPModal>
  );
}

/**
 * 🔁 แผง "แก้ที่สินค้า" ระดับงาน — งานโหมดใหม่ที่ไม่มีงานย่อยรูป/รูปคำอธิบาย/เขียนคำอธิบาย (ตั้งค่า "ไม่ต้องมี")
 * ตัวงานคือที่ทำงานเลย: เลือก/สร้าง Parent → แก้ที่สินค้า → สรุปสิ่งที่แก้ทั้งงาน · ส่งตรวจ/อนุมัติใช้สถานะของงานตามปกติ
 * มีงานย่อยสินค้าอยู่แล้ว = ไม่โชว์ (การ์ดงานย่อยมีแผงของมันเอง)
 */
type DirectPanelTask = {
  id: string; task_type: string | null; created_at: string; parent_skus?: TaskParentRef[]; skus?: TaskSkuRef[];
  subtasks?: { subtask_type?: string | null; config?: { approve_target?: string } | null; status?: string }[];
};
/** แผงระดับงานโผล่ไหม (โหมดใหม่ + ไม่มีงานย่อยสินค้า) — ใช้ร่วมกับกล่อง Parent SKU ใน drawer กันช่องเลือก Parent ซ้ำ 2 ที่ */
export function isTaskDirectPanelOn(cfg: ProductModeCfg | null, task: DirectPanelTask): boolean {
  const hasProductSubs = (task.subtasks ?? []).some((s) => s.status !== "canceled"
    && (DEFAULT_SKIP_SUBTASKS.includes(String(s.subtask_type ?? "")) || DIRECT_TARGETS.has(String(s.config?.approve_target ?? ""))));
  return isDirectTask(cfg, task.task_type, task.created_at) && !hasProductSubs;
}

export function TaskDirectPanel({ task, canEdit, canUndo, onAddParent, pushToast }: {
  task: DirectPanelTask;
  canEdit: boolean; canUndo: boolean;
  onAddParent?: (p: ParentSkuPickerValue) => Promise<void>;
  pushToast: ToastFn;
}) {
  const modeCfg = useProductModeCfg();
  const on = isTaskDirectPanelOn(modeCfg, task);
  const { changes, error, reload } = useTaskChanges(task.id, null, on);
  if (!on) return null;
  return (
    <DirectEditPanel taskId={task.id} subId={null} approveTarget="sku_media"
      parents={task.parent_skus ?? []} skus={task.skus ?? []}
      canEdit={canEdit} canUndo={canUndo} onBeforeEdit={async () => { /* ระดับงาน: ใช้สถานะงานตามปกติ */ }}
      onAddParent={onAddParent} changes={changes} error={error} reloadChanges={reload} pushToast={pushToast} />
  );
}
