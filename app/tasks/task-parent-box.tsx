"use client";

/**
 * 📦 กล่อง Parent SKU ในคอลัมน์ซ้ายของ drawer งาน (เหนือ "สินค้าที่เกี่ยวข้อง") — เห็นทันทีไม่ต้องเลื่อนไปคอลัมน์ขวา
 *   - มี Parent แล้ว: รูป + รหัส + ชื่อ · กด = เปิดตัวแก้สินค้ากลาง (MasterRecordDrawer ของ drawer งาน)
 *   - ยังไม่มี: 💡 แนะนำจาก Parent ของ SKU ลูกที่ผูกกับงาน · 🔍 เลือก (ParentSkuPicker กลาง) · ＋ สร้างใหม่ (ParentSkuCreateModal กลาง)
 *   ผูก/เอาออก ผ่าน PATCH งานเดิม (parent_sku_ids · สิทธิ์ tasks.edit + audit ฝั่ง server)
 * โชว์เมื่อ: งานมี Parent อยู่แล้ว (ทุกประเภท) หรือเป็นประเภทงานสินค้า = ประเภทที่ตั้งไว้ใน
 *   /tasks/settings → ส่งงาน → "วิธีทำงานสินค้า" (ตอนนี้ สินค้าใหม่/เพิ่มสี/แก้ไขสี) — ไม่เขียนรหัสประเภทตายตัว
 * งานโหมดใหม่ที่แผง "แก้ที่สินค้า" ระดับงานโผล่อยู่ → แผงนั้นมีช่องเลือก/สร้าง Parent แล้ว กล่องนี้จึงไม่โชว์ช่องเลือกซ้ำ
 */
import { useMemo, useState } from "react";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { ParentSkuCreateModal } from "@/components/parent-sku-create-modal";
import { ConfirmDialog } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { r2ImageUrl } from "@/lib/r2-image";
import { useProductModeCfg } from "./product-edit-mode";
import { isTaskDirectPanelOn } from "./direct-edit-panel";
import type { TaskDetail, TaskParentRef } from "./data";
import { type PushToast } from "@/components/toast";

type ToastFn = PushToast;   // ชนิดกลาง (components/toast)

export function TaskParentBox({ task, canEdit, onSetParents, onOpen, pushToast }: {
  task: TaskDetail;
  /** ผูก/เอาออกได้ (งานยังไม่ปิด + มีสิทธิ์แก้งาน) */
  canEdit: boolean;
  /** บันทึกชุด Parent ของงาน (แทนทั้งชุด) */
  onSetParents: (ids: string[]) => Promise<void>;
  /** เปิดตัวแก้สินค้ากลางของ Parent ตัวนี้ */
  onOpen: (parentId: string) => void;
  pushToast: ToastFn;
}) {
  const t = useT();
  const { can } = useAuth();
  const cfg = useProductModeCfg();
  const [adding, setAdding] = useState(false);       // มี Parent แล้ว กด "＋ เพิ่ม" → โชว์ช่องเลือก
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unlink, setUnlink] = useState<TaskParentRef | null>(null);

  const parents = task.parent_skus ?? [];
  const ids = parents.map((p) => p.id);
  // Parent ของ SKU ลูกที่ผูกกับงาน (ยังไม่ได้ผูกเป็น Parent ของงาน) → ค่าแนะนำ
  const suggestions = useMemo(() => {
    const map = new Map<string, { parent: TaskParentRef; from: string[] }>();
    for (const s of task.skus ?? []) {
      const p = s.parent;
      if (!p?.id || ids.includes(p.id)) continue;
      const cur = map.get(p.id) ?? { parent: p, from: [] };
      if (s.code) cur.from.push(s.code);
      map.set(p.id, cur);
    }
    return [...map.values()];
  }, [task.skus, ids.join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (cfg === null && parents.length === 0) return null;   // รอตั้งค่าโหลดก่อน (กันกล่องกระพริบ)
  const isProductType = !!task.task_type && !!cfg?.types[task.task_type];
  const directOn = isTaskDirectPanelOn(cfg, task);
  if (parents.length === 0 && (!isProductType || directOn)) return null;
  const canPick = canEdit && !directOn;
  const canCreate = can("products.create");

  const link = async (p: ParentSkuPickerValue | TaskParentRef | null, openAfter = false) => {
    if (!p?.id) return;
    if (ids.includes(p.id)) { setAdding(false); if (openAfter) onOpen(p.id); return; }
    setBusy(true);
    try {
      await onSetParents([...ids, p.id]);
      setAdding(false);
      pushToast("success", t(`ผูก Parent SKU ${p.code ?? ""} เข้างานแล้ว`, `Linked Parent SKU ${p.code ?? ""} to this task`));
      if (openAfter) onOpen(p.id);
    } catch (e) { pushToast("error", e instanceof Error ? e.message : t("ผูก Parent SKU ไม่สำเร็จ", "Couldn't link the Parent SKU")); }
    finally { setBusy(false); }
  };
  const doUnlink = async () => {
    const p = unlink; if (!p) return;
    setBusy(true);
    try { await onSetParents(ids.filter((x) => x !== p.id)); setUnlink(null); }
    catch (e) { pushToast("error", e instanceof Error ? e.message : t("เอาออกไม่สำเร็จ", "Couldn't remove")); }
    finally { setBusy(false); }
  };

  const showPicker = canPick && (parents.length === 0 || adding);
  return (
    <div className={`bg-slate-50 rounded-lg p-3 text-sm ${busy ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs text-slate-400">📦 Parent SKU{parents.length > 0 ? ` (${parents.length})` : ""}</p>
        {canPick && parents.length > 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-[11px] text-violet-600 hover:underline">＋ {t("เพิ่ม Parent SKU", "Add Parent SKU")}</button>
        )}
      </div>

      {parents.length > 0 && (
        <div className="space-y-1.5">
          {parents.map((p) => (
            <div key={p.id} className="flex items-center gap-1 group">
              <button type="button" onClick={() => onOpen(p.id)} title={t("เปิดดู/แก้สินค้า", "Open product")}
                className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-white transition-colors">
                <HoverImage url={r2ImageUrl(p.image_key)} size={36} rounded="rounded-md" fallback="📦" />
                {p.code && <span className="font-mono text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">{p.code}</span>}
                <span className="text-slate-700 truncate">{p.name}</span>
                <span className="text-[11px] text-violet-500 opacity-0 group-hover:opacity-100 shrink-0">{t("เปิด", "Open")} ↗</span>
              </button>
              {canEdit && (
                <button type="button" onClick={() => setUnlink(p)} title={t("เอาออกจากงานนี้", "Remove from this task")} aria-label={t("เอาออกจากงานนี้", "Remove from this task")}
                  className="shrink-0 w-7 h-7 rounded text-slate-300 hover:text-red-600 hover:bg-red-50">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {parents.length === 0 && suggestions.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 mb-2 space-y-1.5">
          <p className="text-[11px] text-amber-800">💡 {t("แนะนำจาก SKU ที่ผูกกับงานนี้", "Suggested from the SKUs linked to this task")}</p>
          {suggestions.map(({ parent: p, from }) => (
            <div key={p.id} className="flex items-center gap-2 flex-wrap">
              <HoverImage url={r2ImageUrl(p.image_key)} size={30} rounded="rounded-md" fallback="📦" />
              {p.code && <span className="font-mono text-xs bg-white border border-amber-200 px-1.5 py-0.5 rounded">{p.code}</span>}
              <span className="text-slate-700 min-w-0 truncate">{p.name}</span>
              {from.length > 0 && <span className="text-[11px] text-slate-400">({t("จาก", "from")} {from.join(", ")})</span>}
              {canPick && (
                <button type="button" onClick={() => void link(p)} className="ml-auto h-7 px-2.5 rounded-md bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 shrink-0">{t("ใช้ตัวนี้", "Use this")}</button>
              )}
            </div>
          ))}
        </div>
      )}
      {parents.length === 0 && suggestions.length === 0 && (
        <p className="text-xs text-slate-400 mb-2">{t("งานนี้ยังไม่ได้ผูก Parent SKU", "No Parent SKU linked to this task yet")}</p>
      )}

      {showPicker && (
        <div className={`flex items-center gap-2 flex-wrap ${parents.length > 0 ? "mt-2" : ""}`}>
          <div className="min-w-[200px] flex-1">
            <ParentSkuPicker value={null} onChange={(v) => void link(v)} disableCreate
              placeholder={t("🔍 เลือก Parent SKU (ค้นหารหัส / ชื่อ)", "🔍 Pick a Parent SKU (search code / name)")} />
          </div>
          {canCreate && (
            <button type="button" onClick={() => setCreating(true)}
              className="h-9 px-3 rounded-lg border border-dashed border-violet-300 text-xs font-medium text-violet-700 hover:bg-white shrink-0">＋ {t("สร้าง Parent SKU ใหม่", "Create new Parent SKU")}</button>
          )}
          {adding && <button type="button" onClick={() => setAdding(false)} className="text-[11px] text-slate-500 hover:underline shrink-0">{t("ยกเลิก", "Cancel")}</button>}
        </div>
      )}
      {parents.length === 0 && !canPick && (
        <p className="text-[11px] text-slate-400">{t("ต้องมีสิทธิ์แก้งาน และงานยังไม่ปิด จึงจะผูก Parent SKU ได้", "You need task edit rights on an open task to link a Parent SKU")}</p>
      )}

      {creating && (
        <ParentSkuCreateModal defaultBrandId={task.brand_id} onClose={() => setCreating(false)}
          onCreated={(p) => { setCreating(false); void link(p, true); }} />
      )}
      <ConfirmDialog open={!!unlink} onClose={() => { if (!busy) setUnlink(null); }} onConfirm={() => void doUnlink()} loading={busy} variant="danger"
        title={t("เอา Parent SKU ออกจากงานนี้?", "Remove this Parent SKU from the task?")}
        message={t(`"${unlink?.code ?? unlink?.name ?? ""}" จะไม่ผูกกับงานนี้แล้ว (สินค้าไม่ถูกลบ)`, `"${unlink?.code ?? unlink?.name ?? ""}" will no longer be linked to this task (the product is not deleted)`)}
        confirmText={t("เอาออก", "Remove")} cancelText={t("ไม่เอาออก", "Keep")} />
    </div>
  );
}
