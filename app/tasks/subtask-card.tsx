"use client";
// การ์ดงานย่อย 1 ใบ (สถานะ · ผู้รับผิดชอบ · ส่งงาน/อนุมัติ/ขอแก้ · โหมดแก้ที่สินค้า · เรียงพิมพ์) — แยกจาก subtask-manager.tsx (Y1)
import { useEffect, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { type ParentSkuPickerValue } from "@/components/pickers";
import { ImageLightbox, type LightboxImage } from "@/components/image-lightbox";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { AssigneeAvatar, AssigneeChip } from "./assignee-avatar";
import { PlatformChip } from "./platform-chip";
import { platformLabel } from "./use-options";
import { updateSubtask, type CreativeSubtask, type SubtaskType, type ArrangePrintType, type TaskParentRef, type TaskSkuRef } from "./data";
import { DirectEditPanel, DirectSubmitModal, useTaskChanges } from "./direct-edit-panel";
import { DIRECT_TARGETS, isDirectTask, type ProductModeCfg } from "./product-edit-mode";
import { ArrangePrintEditor, itemsFromSpec, specFromItems, basesFromSpec, specBasesFrom, arrangeTotalText, arrangeSizeKey, type ArrangeItem, type ArrangeBase } from "./arrange-print-editor";
import type { AssetSize } from "@/app/api/assets/shared";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import type { PushToast } from "@/components/toast";
import { isSubDone, subStatusDot, subStatusLabel } from "./subtask-status";
import { ContentDetailsModal, ContentSubmitModal } from "./subtask-content-modals";
import { ReviseModal, EditSubtaskModal } from "./subtask-forms";
import { SubmitWorkModal } from "./subtask-submit-modal";

/** 🔁 ข้อมูลที่การ์ดงานย่อยต้องใช้ตัดสินว่าใช้โหมดใหม่ (แก้ที่สินค้า) ไหม + สินค้าของงาน */
export type DirectCtx = { modeCfg: ProductModeCfg | null; taskType: string | null; taskCreatedAt: string | null; parents: TaskParentRef[]; skus: TaskSkuRef[]; onAddParent?: (p: ParentSkuPickerValue) => Promise<void> };

// ContentDrawer (แก้คอนเทนต์) — dynamic กัน bundle · เปิดจากการ์ดงานย่อยชนิด content
export const ContentDrawer = dynamic(() => import("./content/content-drawer").then((m) => m.ContentDrawer), { ssr: false });

// งานเรียงพิมพ์ในหน้างาน — แสดง/แก้รายการ (รูป+ขนาด+จำนวน) + บันทึกลง subtask.config
export function ArrangePrintSubtaskPanel({ sub, taskId, reload, pushToast }: { sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: PushToast }) {
  const t = useT();
  const spec = sub.config?.arrange_print;
  const [items, setItems] = useState<ArrangeItem[]>(() => itemsFromSpec(spec));
  const [bases, setBases] = useState<ArrangeBase[]>(() => basesFromSpec(spec));   // รูปฐาน (DFT UV Printed) + เพิ่ม/ลบต่อรูป
  const [printType, setPrintType] = useState<ArrangePrintType | null>(() => spec?.print_type ?? null);   // ประเภทแผ่นพิมพ์ (DTF/UV)
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // โหลดขนาดจริงจากคลังของแต่ละรูป → เติมตัวเลือกขนาดให้ครบ (ครั้งเดียวตอนเปิด)
  useEffect(() => {
    let live = true;
    const ids = [...new Set((spec?.items ?? []).map((i) => i.asset_id))];
    if (ids.length === 0) return;
    (async () => {
      const map: Record<string, AssetSize[]> = {};
      const masterMap: Record<string, { path: string | null; url: string | null }> = {};
      await Promise.all(ids.map(async (id) => { try { const r = await apiFetch(`/api/assets/${id}`); const j = await r.json(); if (Array.isArray(j.data?.sizes)) map[id] = j.data.sizes as AssetSize[]; if (j.data) masterMap[id] = { path: j.data.master_path ?? null, url: j.data.master_url ?? null }; } catch { /* ข้าม */ } }));
      if (!live) return;
      setItems((prev) => prev.map((it) => {
        const avail = [...it.available]; const seen = new Set(avail.map(arrangeSizeKey));
        for (const s of (map[it.asset_id] ?? [])) { const k = arrangeSizeKey(s); if (!seen.has(k)) { seen.add(k); avail.push(s); } }
        const m = masterMap[it.asset_id];
        return { ...it, available: avail, ...(m ? { master_path: m.path, master_url: m.url } : {}) };
      }));
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = async () => {
    setSaving(true);
    try { await updateSubtask(taskId, sub.id, { config: { ...(sub.config ?? {}), arrange_print: { ...specFromItems(items), bases: specBasesFrom(bases), print_type: printType } } }); await reload(); setDirty(false); pushToast("success", t("บันทึกรายการเรียงพิมพ์แล้ว", "Arrange print saved")); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-700">🖨️ {t("รายการเรียงพิมพ์", "Arrange print")} <span className="text-slate-400">· {items.length} {t("รูป", "img")} · {arrangeTotalText(items, t)}{bases.length > 0 ? ` · ${bases.length} ${t("ฐาน", "base")}` : ""}</span>{printType && <span className="ml-1 inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-semibold">🖨 {printType.code}{printType.w != null && printType.h != null ? ` ${printType.w}×${printType.h} ${printType.unit}` : ""}</span>}</p>
        <button onClick={save} disabled={saving || !dirty} className="h-7 px-3 text-[11px] font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-40 shrink-0">{saving ? "⏳" : "💾"} {t("บันทึก", "Save")}</button>
      </div>
      <ArrangePrintEditor items={items} onChange={(it) => { setItems(it); setDirty(true); }} bases={bases} onBasesChange={(b) => { setBases(b); setDirty(true); }} printType={printType} onPrintTypeChange={(pt) => { setPrintType(pt); setDirty(true); }} pushToast={pushToast} contextLabel={sub.title} />
    </div>
  );
}

export type TypeMeta = Record<string, SubtaskType>;

// ป้ายปลายทางตอนอนุมัติ (อ่านง่าย)
export const APPROVE_TARGET_HINT: Record<string, () => string> = {
  sku_media: () => tr("อนุมัติแล้ว → เพิ่มเข้าแกลเลอรีรูปสินค้า", "Approved → added to product image gallery"),
  cover: () => tr("อนุมัติแล้ว → ตั้งเป็นรูปปกสินค้า", "Approved → set as product cover image"),
  sku_description: () => tr("อนุมัติแล้ว → บันทึกเข้า description สินค้า", "Approved → saved to product description"),
  description_media: () => tr("อนุมัติแล้ว → เพิ่มเข้า media คำอธิบาย", "Approved → added to description media"),
};

// สีแถบปลายทาง (แบบ A: คนละสีตามว่าอนุมัติแล้วไปไหน) — เหลือบตาก็รู้ว่างานย่อยนี้ทำอะไร
export const APPROVE_TARGET_STYLE: Record<string, { icon: string; cls: string }> = {
  sku_media:         { icon: "🖼️", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cover:             { icon: "⭐",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sku_description:   { icon: "📝", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  description_media: { icon: "🖼️", cls: "bg-purple-50 text-purple-700 border-purple-200" },
};

export const subStepLabel = subStatusLabel;

export const subStepDot = subStatusDot;

// การ์ดงานย่อย — สถานะเป็นปุ่มกด (เริ่ม→ส่งงาน→อนุมัติ) + ผู้รับผิดชอบ + ไฟล์แนบ
export function SubtaskCard({ sub, taskId, reload, pushToast, canApprove = false, canManageAssignees = false, typeMeta = {}, hasDescSibling = false, subCardStyle, direct: directCtx }: { sub: CreativeSubtask; taskId: string; reload: () => Promise<void>; pushToast: PushToast; canApprove?: boolean; canManageAssignees?: boolean; typeMeta?: TypeMeta; hasDescSibling?: boolean; subCardStyle?: CSSProperties; direct?: DirectCtx }) {
  const t = useT();
  const { user } = useAuth();
  const [open, setOpen] = useState(true);   // กาง (ขยาย) งานย่อยเป็นค่าเริ่มต้น
  const [workOpen, setWorkOpen] = useState(false); // ป๊อปอัปแนบงาน/ส่งงาน
  const [contentOpen, setContentOpen] = useState(false); // ContentDrawer (งานย่อยชนิด content)
  const [detailsOpen, setDetailsOpen] = useState(false); // ป๊อป "รายละเอียดงาน" ต่อแพลตฟอร์ม (content)
  const [editOpen, setEditOpen] = useState(false); // ป๊อปอัปแก้ไขงานย่อย
  const [cardLb, setCardLb] = useState(-1); // ดูรูปบนการ์ดเต็มจอ
  const [busy, setBusy] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false); // ป๊อปอัปขอแก้
  const [savedGalleries, setSavedGalleries] = useState<Record<string, { r2_key?: string; url?: string; slot_id?: string; slot?: number }[]>>({});  // แกลเลอรีรูปสินค้าจริง (save แล้ว) ต่อ SKU/Parent
  const attachCount = sub.attachments?.length ?? 0;
  const st = sub.status;
  // ชนิดงานย่อย + ความสามารถ (config ทับ registry · legacy ไม่มีค่า = อนุญาตหมด)
  const ty = sub.subtask_type ? typeMeta[sub.subtask_type] : undefined;
  const cfg = sub.config ?? {};
  const showImages = (cfg.accepts_image ?? ty?.accepts_image ?? true) !== false;
  const showLinks = (cfg.accepts_link ?? ty?.accepts_link ?? true) !== false;
  const approveTarget = cfg.approve_target ?? ty?.approve_target ?? "none";
  const approveHint = APPROVE_TARGET_HINT[approveTarget]?.();
  const approveStyle = APPROVE_TARGET_STYLE[approveTarget];
  // copy prompt: ให้ค่าจาก registry (ชนิดงาน) เป็นหลัก — งานรูปภาพ/รูปคำอธิบาย = ปิด (แม้ snapshot เก่าจะเปิดไว้)
  const hasPrompt = (ty?.has_copy_prompt ?? cfg.has_copy_prompt) === true;
  const imageAtts = (sub.attachments ?? []).filter((a) => a.kind === "image" && a.r2_key);
  const linkAtts = (sub.attachments ?? []).filter((a) => a.kind !== "image");
  // รูปที่เพิ่มเข้าสินค้า (โชว์บนการ์ด) — จัดกลุ่มตามสินค้า + ป้ายรหัส (product_labels) · รวม sku_images เดิม
  const ist = sub.image_sync_targets as { product_images?: Record<string, string[]>; product_labels?: Record<string, string>; sku_images?: Record<string, string[]>; parent_ids?: string[]; sku_ids?: string[] } | null;
  const istLabels = ist?.product_labels ?? {};   // route เติมรหัสจริงให้ทุก target แล้ว (parent + ลูก)
  // แถวสินค้า = "สินค้าปลายทางทั้งหมด" (parent + ลูกทุกตัว) — parent/ลูกที่ไม่มีรูปส่งรอบนี้ก็ยังโชว์แกลเลอรี save
  const productGroups: { key: string; label: string; keys: string[] }[] = [];
  const seenGroup = new Set<string>();
  const pushGroup = (key: string, fallback: string, keys: string[]) => { if (seenGroup.has(key)) return; seenGroup.add(key); productGroups.push({ key, label: (istLabels[key] || fallback).trim(), keys: (keys ?? []).filter(Boolean) }); };
  for (const pid of ist?.parent_ids ?? []) pushGroup(`parent:${pid}`, "Parent SKU", ist?.product_images?.[`parent:${pid}`] ?? []);   // parent ขึ้นก่อน
  for (const sid of ist?.sku_ids ?? []) pushGroup(`sku:${sid}`, "SKU", ist?.product_images?.[`sku:${sid}`] ?? []);
  for (const [tk, keys] of Object.entries(ist?.product_images ?? {})) pushGroup(tk, tk.startsWith("parent:") ? "Parent SKU" : "SKU", keys as string[]);   // เผื่อคีย์ที่ไม่อยู่ใน parent_ids/sku_ids (งานเก่า)
  for (const [sid, keys] of Object.entries(ist?.sku_images ?? {})) { if (!seenGroup.has(`sku:${sid}`)) pushGroup(`legacy:${sid}`, "SKU", keys as string[]); }
  const skuImgKeys = productGroups.flatMap((g) => g.keys);   // แบน ๆ ไว้ทำ lightbox/ดัชนี (เฉพาะรูปส่งรอบนี้)
  // ดึงแกลเลอรีรูปสินค้าจริง (ที่ save แล้ว) ของแต่ละ SKU/Parent มาโชว์คู่กับรูปที่ส่งรอบนี้ (ป้าย ✓ saved)
  useEffect(() => {
    const owners = new Set<string>();
    for (const g of productGroups) {
      if (g.key.startsWith("parent:")) owners.add(`parent_sku:${g.key.slice(7)}`);
      else if (g.key.startsWith("sku:")) owners.add(`product_sku:${g.key.slice(4)}`);
      else if (g.key.startsWith("legacy:")) owners.add(`product_sku:${g.key.slice(7)}`);
    }
    if (owners.size === 0) return;
    let live = true;
    owners.forEach((o) => {
      // งานย่อยชนิด "รูปคำอธิบาย" ปลายทางคือแกลเลอรีคำอธิบาย ไม่ใช่แกลเลอรีรูปสินค้า
      // เดิมดึงแกลเลอรีรูปสินค้ามาโชว์เสมอ → การ์ดขึ้นรูปสินค้าแทนรูปคำอธิบายที่ส่งไป
      const isDescMedia = approveTarget === "description_media" && o.startsWith("parent_sku:");
      const url = isDescMedia
        ? `/api/creative-tasks/${taskId}/subtasks?descgallery=parent:${encodeURIComponent(o.slice("parent_sku:".length))}`
        : `/api/creative-tasks/${taskId}/subtasks?gallery=${encodeURIComponent(o)}`;
      apiFetch(url).then((r) => r.json())
        .then((j) => {
          if (!live) return;
          if (isDescMedia && j?.desc_galleries) {
            // desc_galleries คีย์เป็น "parent:<id>" อยู่แล้ว แต่ให้มาเป็น url (/api/r2-image?key=…)
            // การ์ดใช้ r2_key ทั้งการเทียบรูปซ้ำและการแสดงผล → ถอด key ออกจาก url ให้เป็นรูปแบบเดียวกัน
            const mapped = Object.fromEntries(
              Object.entries(j.desc_galleries as Record<string, { slot_id?: string; slot?: number; url?: string }[]>)
                .map(([k, list]) => [k, (list ?? []).map((s) => {
                  const m = /[?&]key=([^&]+)/.exec(s.url ?? "");
                  return { ...s, r2_key: m ? decodeURIComponent(m[1]) : undefined };
                })]),
            );
            setSavedGalleries((prev) => ({ ...prev, ...mapped }));
          } else if (j?.galleries) {
            setSavedGalleries((prev) => ({ ...prev, ...(j.galleries as Record<string, { r2_key: string }[]>) }));
          }
        }).catch(() => { /* ข้าม */ });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, sub.id, approveTarget]);
  // รวมรูปทั้งหมดบนการ์ด (รูปงาน + รูปเข้าสินค้า) ไว้กดดูเต็มจอ/เลื่อน
  const cardImages: LightboxImage[] = [
    ...imageAtts.map((a) => ({ url: `/api/r2-image?key=${encodeURIComponent(a.r2_key as string)}&w=1600`, label: a.file_name ?? t("รูปแนบงาน", "Work image") })),
    ...productGroups.flatMap((g) => g.keys.map((k) => ({ url: `/api/r2-image?key=${encodeURIComponent(k)}&w=1600`, label: g.label }))),
  ];
  const canSubmit = st === "in_progress"; // ส่งงานได้เฉพาะตอนกำลังทำ
  // 🔁 โหมดใหม่ (แก้ที่สินค้าในงานเลย) — งานรูป/รูปคำอธิบาย/เขียนคำอธิบาย · ตามที่ตั้งต่อประเภทงาน (งานที่สร้างหลังเปิดโหมด)
  //    งานย่อยที่เริ่มแบบใหม่แล้ว (config.edit_mode=direct) อยู่แบบใหม่ตลอด · ที่เคยแนบรูปแบบเดิมไปแล้ว อยู่แบบเดิม
  const legacyUsed = imageAtts.length > 0 || productGroups.some((g) => g.keys.length > 0);
  const isDirect = DIRECT_TARGETS.has(String(approveTarget)) && (cfg.edit_mode === "direct"
    || (!legacyUsed && isDirectTask(directCtx?.modeCfg ?? null, directCtx?.taskType, directCtx?.taskCreatedAt)));
  const { changes: dChanges, active: dActive, error: dError, reload: reloadChanges } = useTaskChanges(taskId, sub.id, isDirect);
  const [directSubmitOpen, setDirectSubmitOpen] = useState(false);
  const canEditDirect = isDirect && !isSubDone(st) && st !== "canceled"
    && (canApprove || (st !== "submitted" && (sub.assignees.length === 0 || sub.assignees.some((a) => a.id === user?.id))));
  const canUndoDirect = isDirect && !isSubDone(st) && st !== "canceled" && (canApprove || sub.assignees.some((a) => a.id === user?.id));
  // เปิดตัวแก้ครั้งแรก → จำว่างานย่อยนี้ใช้แบบใหม่ (อนุมัติแล้วไม่ส่งซ้ำ) + เริ่มงานให้ถ้ายังไม่เริ่ม
  const beforeDirectEdit = async () => {
    const needStart = st === "todo" || st === "revision_requested";
    if (cfg.edit_mode === "direct" && !needStart) return;
    await updateSubtask(taskId, sub.id, { ...(needStart ? { status: "in_progress" } : {}), config: { ...cfg, edit_mode: "direct" } });
    await reload();
  };
  // งานที่ไม่รับรูป+ลิงก์ (เช่น เขียนคำอธิบาย) → ส่งงานโดยยืนยันรายละเอียด Platform แทนการแนบไฟล์
  const platformConfirm = !showImages && !showLinks;
  const contentApproved = sub.subtask_type === "content" && isSubDone(st); // คอนเทนต์อนุมัติแล้ว → โชว์ปุ่มโพสต์

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
  const selfLeave = async () => {
    const lastOne = sub.assignees.length === 1 && sub.status === "in_progress";
    await patch({ self_leave: true });
    pushToast("info", lastOne
      ? t("ออกจากงานแล้ว — งานกลับไปเป็น \"ยังไม่เริ่ม\" ให้คนอื่นมารับ", "You left — the task is back to \"not started\" for someone else")
      : t("เอาตัวเองออกจากผู้รับผิดชอบแล้ว", "You removed yourself from assignees"));
  };

  // ③ ส่งงาน/แนบงาน: เปิดป๊อปอัป (แนบรูป/ลิงก์ + กดส่ง) — การ์ดไม่ต้องโชว์ฟอร์มแนบเอง
  const openWork = () => setWorkOpen(true);

  return (
    <div className="border border-slate-200 rounded-lg" style={subCardStyle}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${subStepDot(st)}`} title={subStepLabel(st)} />
        {/* ปุ่ม action ตามสถานะ */}
        {st === "todo" && <button disabled={busy} onClick={() => patch({ status: "in_progress" })} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 hover:bg-blue-100 disabled:opacity-50">▶ {t("เริ่มงาน", "Start")}</button>}
        {st === "in_progress" && <span className="shrink-0 inline-flex items-center gap-1">
          <button disabled={busy} onClick={isDirect ? () => setDirectSubmitOpen(true) : openWork} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 hover:bg-amber-100 disabled:opacity-50">📤 {t("ส่งงาน", "Submit")}</button>
          <button disabled={busy} onClick={async () => { await patch({ status: "todo" }); pushToast("info", t("ยกเลิกการเริ่มงานแล้ว", "Start canceled")); }} title={t("กดผิด? ยกเลิกการเริ่มงาน (ล้างผู้รับผิดชอบ)", "Misclick? Cancel start (clears assignee)")} className="text-xs text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">↩︎ {t("ยกเลิกเริ่ม", "Un-start")}</button>
        </span>}
        {st === "submitted" && (canApprove
          ? <span className="shrink-0 inline-flex items-center gap-1">
              <button disabled={busy} onClick={() => patch({ status: "approved" })} className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5 hover:bg-emerald-100 disabled:opacity-50">✓ {t("อนุมัติ", "Approve")}</button>
              <button disabled={busy} onClick={() => setReviseOpen(true)} title={t("ขอแก้", "Request revision")} className="text-xs text-orange-600 border border-orange-200 rounded-md px-1.5 py-0.5 hover:bg-orange-50 disabled:opacity-50">↩︎ {t("ขอแก้", "Revise")}</button>
              <button disabled={busy} onClick={async () => { const r = (await askText({ title: t("เหตุผลที่ยกเลิก", "Reason to cancel"), variant: "danger", confirmText: t("ยกเลิกงานย่อย", "Cancel subtask") })); if (r === null) return; await patch({ status: "canceled", comment: r }); pushToast("info", t("ยกเลิกงานย่อยแล้ว", "Subtask canceled")); }} title={t("ยกเลิก", "Cancel")} className="text-xs text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">✕</button>
            </span>
          : <span className="shrink-0 text-xs font-medium text-amber-600">⏳ {t("รออนุมัติ", "Pending approval")}</span>)}
        {st === "revision_requested" && <button disabled={busy} onClick={() => patch({ status: "in_progress" })} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 hover:bg-blue-100 disabled:opacity-50">▶ {t("เริ่มแก้", "Start revision")}</button>}
        {st === "canceled" && <span className="shrink-0 text-xs font-medium text-slate-400">🚫 {t("ยกเลิก", "Canceled")}</span>}
        {isSubDone(st) && <span className="shrink-0 text-xs font-medium text-emerald-600">✓ {subStepLabel(st)}</span>}
        {isSubDone(st) && canApprove && <button disabled={busy} onClick={async () => { if (!(await askConfirm({ title: t("ย้อนสถานะงานย่อยนี้กลับเป็น \"รออนุมัติ\"? · รูป/ข้อมูลที่ส่งเข้าสินค้าตอนอนุมัติจะถูกถอดกลับ", "Revert this subtask to \"pending approval\"? · product images/data synced on approval will be rolled back"), variant: "danger" }))) return; await patch({ status: "submitted" }); pushToast("info", t("ย้อนสถานะแล้ว — กลับไปรออนุมัติ", "Reverted — pending approval")); }} title={t("ย้อนสถานะ (แอดมิน/ผู้ตรวจ)", "Revert status (admin/reviewer)")} className="shrink-0 text-[11px] text-slate-500 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">↩︎ {t("ย้อนสถานะ", "Revert")}</button>}
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
          {approveHint && !isDirect && (
            <div className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-md border px-2.5 py-1 ${approveStyle?.cls ?? "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
              <span aria-hidden>{approveStyle?.icon ?? "↗"}</span>{approveHint}
            </div>
          )}
          {sub.subtask_type === "content" && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2 space-y-1.5">
              {(sub.content_preview?.title || sub.content_preview?.status) && (
                <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                  📄 <span className="truncate">{sub.content_preview?.title || t("คอนเทนต์", "Content")}</span>
                  {sub.content_preview?.status === "published" && <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1 shrink-0">{t("เผยแพร่แล้ว", "Published")}</span>}
                  {sub.content_preview?.status === "scheduled" && <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 shrink-0">{t("ตั้งเวลา", "Scheduled")}</span>}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1 min-w-0">
                  {(sub.content_preview?.platforms ?? []).map((p) => <PlatformChip key={p} code={p} iconOnly />)}
                  {!(sub.content_preview?.platforms ?? []).length && <span className="text-[11px] text-slate-400">{t("ยังไม่ได้เลือกแพลตฟอร์ม", "No platforms yet")}</span>}
                </div>
                <button onClick={() => setContentOpen(true)} className="text-[11px] font-medium text-violet-700 hover:underline shrink-0">📱 {t("เปิด/แก้คอนเทนต์", "Open content")}</button>
              </div>
              {(sub.content_preview?.captions ?? []).filter((c) => c.caption?.trim()).slice(0, 4).map((c) => (
                <p key={c.platform} className="text-[11px] text-slate-500 leading-snug"><span className="font-medium text-slate-600">{platformLabel(c.platform)}:</span> <span className="line-clamp-2">{c.caption}</span></p>
              ))}
            </div>
          )}
          {sub.subtask_type === "arrange_print" && <ArrangePrintSubtaskPanel sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} />}
          {(st === "revision_requested" || st === "canceled") && ((sub.config as Record<string, unknown> | undefined)?.review_note as string | undefined) && (
            <p className="text-[11px] text-orange-600 whitespace-pre-wrap">📝 {st === "canceled" ? t("เหตุผลยกเลิก", "Cancel reason") : t("ขอแก้", "Revision")}: {(sub.config as Record<string, unknown>).review_note as string}</p>
          )}
          {/* รูปที่ผู้ตรวจชี้ว่าต้องแก้ — ช่างเห็นทันทีว่าต้องแก้รูปไหน เพราะอะไร */}
          {st === "revision_requested" && (() => {
            const ri = ((sub.config as Record<string, unknown> | undefined)?.review_images ?? null) as
              { r2_key: string; index?: number | null; reason?: string }[] | null;
            if (!ri?.length) return null;
            return (
              <div className="rounded-lg border border-orange-200 bg-orange-50/70 p-2">
                <p className="text-[11px] font-medium text-orange-700 mb-1.5">🖼 {t("รูปที่ต้องแก้", "Images to fix")} ({ri.length})</p>
                <div className="flex flex-wrap gap-2">
                  {ri.map((r) => (
                    <div key={r.r2_key} className="flex flex-col items-center gap-0.5 max-w-[92px]">
                      <div className="relative">
                        <img src={`/api/r2-image?key=${encodeURIComponent(r.r2_key)}&w=120`} alt=""
                          onClick={() => window.open(`/api/r2-image?key=${encodeURIComponent(r.r2_key)}`, "_blank")}
                          title={t("กดดูเต็มจอ", "Click to view full")}
                          className="h-14 w-14 rounded object-cover border-2 border-orange-400 cursor-zoom-in" />
                        {r.index != null && <span className="absolute top-0 left-0 px-1 text-[9px] font-semibold bg-orange-500 text-white">{r.index}</span>}
                      </div>
                      {r.reason && <span className="text-[10px] text-orange-700 text-center leading-tight break-words">{r.reason}</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
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
                ? <button disabled={busy} onClick={selfLeave}
                    title={sub.assignees.length === 1 && st === "in_progress"
                      ? t("ออกจากงานนี้ — ไม่เหลือผู้รับผิดชอบ งานจะกลับไปเป็น \"ยังไม่เริ่ม\" ให้คนอื่นมารับ", "Leave this task — no assignee left, it goes back to \"not started\"")
                      : t("เอาตัวเองออกจากผู้รับผิดชอบ (คนอื่นทำต่อได้)", "Remove yourself from assignees (others continue)")}
                    className="text-[11px] text-slate-500 border border-slate-200 rounded-md px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-50">
                    ↩︎ {sub.assignees.length === 1 && st === "in_progress" ? t("ออกจากงาน (กลับเป็นยังไม่เริ่ม)", "Leave (back to not started)") : t("ออกจากงาน", "Leave")}
                  </button>
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
                <p className="text-[11px] text-slate-400">
                  {approveTarget === "description_media"
                    ? <>🖼️ {t("รูปคำอธิบายสินค้า", "Description images")} <span className="text-emerald-600">· ✓ {t("= อยู่ในคำอธิบายแล้ว", "= already in the description")}</span></>
                    : <>📦 {t("รูปเข้าสินค้า", "Product images")} <span className="text-emerald-600">· ✓ {t("= บันทึกในแกลเลอรีแล้ว", "= saved in gallery")}</span></>}
                </p>
                {productGroups.map((g) => {
                  const lookup = g.key.startsWith("legacy:") ? `sku:${g.key.slice(7)}` : g.key;
                  const submitted = new Set(g.keys);
                  const savedList = (savedGalleries[lookup] ?? []).filter((s) => s.r2_key && !submitted.has(s.r2_key));
                  if (g.keys.length === 0 && savedList.length === 0) return null;   // ไม่มีทั้งรูปส่งใหม่และรูป save → ข้าม
                  const base = g.keys.length ? imageAtts.length + skuImgKeys.indexOf(g.keys[0]) : 0;   // ดัชนีเริ่มของกลุ่มนี้ใน cardImages
                  return (
                    <div key={g.key}>
                      <p className="text-[10px] font-mono text-slate-500 bg-slate-100 inline-block px-1.5 py-0.5 rounded mb-1">{g.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {g.keys.map((k, j) => (
                          <div key={k} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/r2-image?key=${encodeURIComponent(k)}&w=160`} alt="" onClick={() => setCardLb(base + j)} title={t("รูปที่ส่งรอบนี้ · กดดูเต็มจอ", "Submitted this round · click to view")} className="h-12 w-12 rounded object-cover border border-amber-200 cursor-zoom-in" />
                            <span className="absolute -top-1 -left-1 bg-slate-700 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center shadow">{j + 1}</span>
                          </div>
                        ))}
                        {/* รูปที่ save ในแกลเลอรีสินค้าจริงแล้ว — ป้าย ✓ เขียว (กดเปิดเต็มในแท็บใหม่) */}
                        {savedList.map((s) => (
                          <div key={`saved-${s.r2_key}`} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/r2-image?key=${encodeURIComponent(s.r2_key as string)}&w=160`} alt="" onClick={() => window.open(`/api/r2-image?key=${encodeURIComponent(s.r2_key as string)}`, "_blank")} title={t("บันทึกในแกลเลอรีแล้ว · กดดูเต็ม", "Saved in gallery · click to view")} className="h-12 w-12 rounded object-cover border-2 border-emerald-300 cursor-zoom-in" />
                            <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center shadow" title={t("บันทึกแล้ว", "Saved")}>✓</span>
                          </div>
                        ))}
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
            {/* 🔁 โหมดใหม่: แก้ที่สินค้า + สรุปสิ่งที่แก้ + ส่งงานแบบยืนยันรายการ (แทนป๊อปแนบรูปเดิม) */}
            {isDirect && (
              <>
                <DirectEditPanel taskId={taskId} subId={sub.id} approveTarget={String(approveTarget)}
                  parents={directCtx?.parents ?? []} skus={directCtx?.skus ?? []} onAddParent={directCtx?.onAddParent}
                  canEdit={canEditDirect} canUndo={canUndoDirect} onBeforeEdit={beforeDirectEdit}
                  changes={dChanges} error={dError} reloadChanges={reloadChanges} pushToast={pushToast} />
                {canSubmit && (
                  <button type="button" onClick={() => setDirectSubmitOpen(true)} className="w-full h-9 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600">
                    📤 {t("ส่งงาน", "Submit")}{dActive.length > 0 ? ` (${dActive.length} ${t("รายการที่แก้", "changes")})` : ""}
                  </button>
                )}
              </>
            )}
            <div className={`flex items-center gap-2 ${isDirect ? "hidden" : ""}`}>
              {sub.subtask_type === "content" && <button onClick={() => setDetailsOpen(true)} title={t("รายละเอียด/สิ่งที่ต้องแนบ ต่อแพลตฟอร์ม", "Details / requirements per platform")} className="h-9 px-3 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">📋 {t("รายละเอียดงาน", "Details")}</button>}
              {/* ปุ่มแนบ/ส่งงาน — เมื่อคอนเทนต์อนุมัติแล้ว จะย่อเป็นไอคอน+ชิดซ้าย ให้พื้นที่กับปุ่มโพสต์ */}
              <button onClick={openWork} title={t("จัดการไฟล์แนบ", "Manage attachments")} className={contentApproved
                ? "h-9 w-10 flex items-center justify-center text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"
                : `flex-1 h-9 rounded-lg text-sm font-medium ${canSubmit ? "bg-amber-500 text-white hover:bg-amber-600" : "text-violet-700 border border-violet-200 hover:bg-violet-50"}`}>
                {canSubmit
                  ? (platformConfirm ? `📤 ${t("ตรวจ & ส่งงาน", "Review & submit")}` : `📤 ${t("ส่งงาน (แนบรูป/ลิงก์)", "Submit (attach files/links)")}`)
                  : (contentApproved ? "📎" : (platformConfirm ? `🔎 ${t("ดูรายละเอียด Platform", "View platform details")}` : `📎 ${attachCount > 0 ? t("จัดการไฟล์แนบ", "Manage attachments") : t("แนบงาน", "Attach work")}`))}
              </button>
              {/* ปุ่มโพสต์ — เฉพาะคอนเทนต์ที่อนุมัติแล้ว · เปิดหน้าแก้คอนเทนต์ (แคปชั่น/ลิงก์โพสต์) */}
              {contentApproved && <button onClick={() => setContentOpen(true)} title={t("เปิดหน้าแก้คอนเทนต์เพื่อโพสต์ (ใส่แคปชั่น/ลิงก์โพสต์)", "Open content editor to post")} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700">🚀 {t("โพสต์", "Post")}</button>}
            </div>
          </div>
        </div>
      )}
      {/* ดูรูปบนการ์ดเต็มจอ + เลื่อน (รูปงาน + รูปเข้าสินค้า) */}
      <ImageLightbox images={cardImages} index={cardLb} onClose={() => setCardLb(-1)} onIndex={setCardLb} />
      {workOpen && (sub.subtask_type === "content"
        ? <ContentSubmitModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} canSubmit={canSubmit} onClose={() => setWorkOpen(false)} />
        : <SubmitWorkModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} showImages={showImages} showLinks={showLinks} canSubmit={canSubmit} platformConfirm={platformConfirm} canApprove={canApprove} approveTarget={String(approveTarget ?? "none")} hasDescSibling={hasDescSibling} onClose={() => setWorkOpen(false)} />)}
      {editOpen && <EditSubtaskModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} canManageAssignees={canManageAssignees} onClose={() => setEditOpen(false)} />}
      {directSubmitOpen && (
        <DirectSubmitModal changes={dChanges ?? []} onClose={() => setDirectSubmitOpen(false)}
          onConfirm={async () => {
            await updateSubtask(taskId, sub.id, { status: "submitted", config: { ...cfg, edit_mode: "direct" } });
            setDirectSubmitOpen(false);
            await reload();
            pushToast("success", t("ส่งงานแล้ว — รอผู้ตรวจ", "Submitted — awaiting review"));
          }} />
      )}
      {contentOpen && sub.config?.content_id && <ContentDrawer contentId={String(sub.config.content_id)} brands={[]} onClose={() => setContentOpen(false)} onChanged={() => { void reload(); }} pushToast={pushToast} />}
      {detailsOpen && <ContentDetailsModal sub={sub} taskId={taskId} reload={reload} pushToast={pushToast} onClose={() => setDetailsOpen(false)} />}
      {reviseOpen && <ReviseModal busy={busy} images={imageAtts.map((a) => ({ id: a.id, r2_key: a.r2_key as string, file_name: a.file_name }))}
        onCancel={() => setReviseOpen(false)}
        onConfirm={async (c, imgs) => { setReviseOpen(false); await patch({ status: "revision_requested", comment: c, revise_images: imgs }); pushToast("info", t("ส่งกลับให้แก้แล้ว", "Sent back for revision")); }} />}
    </div>
  );
}
