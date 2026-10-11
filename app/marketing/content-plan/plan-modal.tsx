"use client";

/**
 * การ์ดไอเดียคอนเทนต์ — สร้าง/แก้ (ฝั่งวางแผน) บนข้อมูลชุดเดียวกับปฏิทินคอนเทนต์เดิม
 *   หัวข้อ · แบรนด์ · แนวคอนเทนต์ · เป้าหมาย · รูปแบบ · ลงที่ไหน · วัน/เวลา · สินค้า · บรีฟ · รูปอ้างอิง
 *   ปุ่ม: บันทึก · 🎬 ส่งเป็นงานให้ทีม Creative (สร้างงาน + ผูก) · 📝 รายละเอียดเต็ม/แคปชั่น (ContentDrawer เดิม) · 🗑 ลบ
 * ของกลาง: ERPModal · ConfirmDialog · ParentSkuPicker · FileMultiInput · ERPDateTime24 (เวลา 24 ชม.) · PlatformIcon · Toast
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { FileMultiInput } from "@/components/file-multi-input";
import { ERPDateTime24 } from "@/components/form";
import { PlatformIcon } from "@/components/platform-icon";
import { useToast } from "@/components/toast";
import { createContent, updateContent, deleteContent, createTask, POST_TYPES, splitPostTypes, joinPostTypes, type ContentItem, type BrandOption } from "@/app/tasks/data";
import type { MarketingSkuLabel } from "@/lib/marketing/sku-list";
import { CONTENT_GOALS, dateKeyOf, timeOf, toScheduledIso, stageOf, STAGE_META } from "@/lib/marketing/content-plan";

export type PlatformOpt = { value: string; label: string; color?: string | null; icon?: string | null; icon_key?: string | null };

type Draft = {
  title: string; brand_id: string; pillar_id: string; goal: string; post_types: string[]; platforms: string[];
  date: string; time: string; parent: ParentSkuPickerValue | null; brief: string; ref_image_keys: string[];
};

const chip = (on: boolean) => `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`;

function toDraft(c: ContentItem | null, defaults: { brandId?: string | null; date?: string | null; platform?: string | null }): Draft {
  if (!c) return {
    title: "", brand_id: defaults.brandId ?? "", pillar_id: "", goal: "", post_types: [], platforms: defaults.platform ? [defaults.platform] : [],
    date: defaults.date ?? "", time: "10:00", parent: null, brief: "", ref_image_keys: [],
  };
  return {
    title: c.title ?? "", brand_id: c.brand_id ?? "", pillar_id: c.pillar_id ?? "", goal: c.goal ?? "",
    post_types: splitPostTypes(c.post_type), platforms: c.platforms ?? [],
    date: dateKeyOf(c.scheduled_at) ?? "", time: timeOf(c.scheduled_at),
    parent: c.parent_sku_id ? { id: c.parent_sku_id, code: c.parent_sku_code ?? "", name: c.parent_sku_name ?? "", image_url: c.parent_sku_image_url ?? null } : null,
    brief: c.brief ?? "", ref_image_keys: c.ref_image_keys ?? [],
  };
}

export function PlanModal({ open, item, defaults, brands, pillars, platforms, canEdit, onClose, onSaved, onOpenDetail }: {
  open: boolean;
  /** null = สร้างใหม่ */
  item: ContentItem | null;
  defaults: { brandId?: string | null; date?: string | null; platform?: string | null };
  brands: BrandOption[];
  pillars: MarketingSkuLabel[];
  platforms: PlatformOpt[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onOpenDetail: (id: string) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => toDraft(item, defaults));
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [askTask, setAskTask] = useState(false);

  useEffect(() => { if (open) setD(toDraft(item, defaults)); }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps

  const initial = useMemo(() => JSON.stringify(toDraft(item, defaults)), [item, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = open && JSON.stringify(d) !== initial;
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const stage = item ? stageOf(item) : "idea";
  const locked = item?.status === "published";   // โพสต์แล้ว = ระบบเดิมล็อกเนื้อหาหลัก

  const payload = () => ({
    title: d.title.trim(), brand_id: d.brand_id || null, pillar_id: d.pillar_id || null, goal: d.goal || null,
    post_type: d.post_types.length ? joinPostTypes(d.post_types) : null, platforms: d.platforms,
    scheduled_at: d.date ? toScheduledIso(d.date, d.time || "10:00") : null,
    parent_sku_id: d.parent?.id ?? null, brief: d.brief.trim() || null, ref_image_keys: d.ref_image_keys,
  });

  const save = async (): Promise<string | null> => {
    if (!d.title.trim()) { toast.warning("ใส่หัวข้อคอนเทนต์ก่อน"); return null; }
    setBusy(true);
    try {
      let id = item?.id ?? null;
      if (id) {
        const p: Record<string, unknown> = payload();
        if (locked) for (const k of ["title", "brand_id", "post_type", "platforms", "parent_sku_id"]) delete p[k];
        await updateContent(id, p);
      } else {
        id = (await createContent({ ...payload(), status: "draft" })).id;
      }
      toast.success(item ? "บันทึกแล้ว" : "เพิ่มไอเดียแล้ว");
      onSaved();
      return id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return null;
    } finally { setBusy(false); }
  };

  const saveAndClose = async () => { if (await save()) onClose(); };

  // 🎬 ส่งเป็นงานให้ทีม Creative: สร้างงาน (เติมจากไอเดีย) แล้วผูก task_id → ขั้น "กำลังทำ"
  const sendAsTask = async () => {
    setAskTask(false);
    const id = await save();
    if (!id) return;
    setBusy(true);
    try {
      const t = await createTask({
        title: d.title.trim(), brand_id: d.brand_id || null, parent_sku_id: d.parent?.id ?? null, platforms: d.platforms,
        description: d.brief.trim() || null, reference_images: d.ref_image_keys, due_date: d.date || null,
      });
      await updateContent(id, { task_id: t.id });
      toast.success(`ส่งเป็นงาน ${t.task_no} ให้ทีม Creative แล้ว`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างงานไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await deleteContent(item.id);
      toast.success("ลบไอเดียแล้ว");
      setAskDelete(false);
      onSaved();
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const input = "h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";
  const label = "mb-1 block text-xs font-medium text-slate-500";
  const ro = !canEdit;

  return (
    <>
      <ERPModal open={open} onClose={onClose} size="lg" hasUnsavedChanges={dirty && canEdit}
        title={item ? `${item.content_no ?? ""} ${item.title}`.trim() : "💡 ไอเดียคอนเทนต์ใหม่"}
        description={item && stage ? `${STAGE_META[stage].icon} ${STAGE_META[stage].label}${item.task_no ? ` · งาน ${item.task_no}` : ""}` : "วางแผนก่อน รายละเอียดแคปชั่นค่อยเติมทีหลังได้"}
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {item && canEdit && (
              <button type="button" onClick={() => setAskDelete(true)} disabled={busy}
                className="h-9 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50">🗑 ลบ</button>
            )}
            {item && (
              <button type="button" onClick={() => onOpenDetail(item.id)} disabled={busy}
                className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">📝 รายละเอียด/แคปชั่น</button>
            )}
            <div className="ml-auto flex gap-2">
              {canEdit && stage === "idea" && (
                <button type="button" onClick={() => setAskTask(true)} disabled={busy || !d.title.trim()}
                  className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">🎬 ส่งเป็นงาน</button>
              )}
              <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{canEdit ? "ยกเลิก" : "ปิด"}</button>
              {canEdit && (
                <button type="button" onClick={() => void saveAndClose()} disabled={busy}
                  className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
              )}
            </div>
          </div>
        }>
        <div className="space-y-4">
          {locked && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">โพสต์แล้ว — แก้ได้เฉพาะแนว/เป้าหมาย/บรีฟ/วัน (เนื้อหาหลักล็อกตามระบบเดิม)</div>}
          <div>
            <label className={label}>หัวข้อ *</label>
            <input value={d.title} onChange={(e) => set({ title: e.target.value })} disabled={ro || locked} maxLength={200} autoFocus={!item}
              placeholder="เช่น BBP08 แมตช์ชุดไปเที่ยว" className={input} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>แบรนด์</label>
              <select value={d.brand_id} onChange={(e) => set({ brand_id: e.target.value })} disabled={ro || locked} className={input}>
                <option value="">— ไม่ระบุ —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>วันที่จะลง (เว้นว่าง = เก็บเป็นไอเดียไว้ก่อน)</label>
              <div className="flex items-center gap-2">
                <ERPDateTime24 value={d.date ? `${d.date}T${d.time || "10:00"}` : ""} disabled={ro} className="flex-1"
                  onChange={(v) => set({ date: (v ?? "").slice(0, 10), time: (v ?? "").slice(11, 16) || d.time || "10:00" })} />
                {d.date && !ro && (
                  <button type="button" onClick={() => set({ date: "" })} title="เอาวันออก (เก็บเป็นไอเดีย)"
                    className="h-9 flex-shrink-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-50">ไม่ลงวัน</button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className={label}>แนวคอนเทนต์</label>
            <div className="flex flex-wrap gap-1.5">
              {pillars.filter((p) => p.is_active || p.id === d.pillar_id).map((p) => (
                <button key={p.id} type="button" disabled={ro} onClick={() => set({ pillar_id: d.pillar_id === p.id ? "" : p.id })}
                  className={chip(d.pillar_id === p.id)} style={d.pillar_id === p.id ? { background: p.color, borderColor: p.color } : undefined}>
                  {p.icon && <span>{p.icon}</span>}{p.name}
                </button>
              ))}
              {pillars.length === 0 && <span className="text-xs text-slate-400">ยังไม่มีแนวคอนเทนต์ — ตั้งได้ที่ "🧭 ตั้งค่าแนว"</span>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>เป้าหมาย</label>
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_GOALS.map((g) => (
                  <button key={g.key} type="button" disabled={ro} onClick={() => set({ goal: d.goal === g.key ? "" : g.key })} className={chip(d.goal === g.key)}>
                    {g.icon} {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={label}>รูปแบบ (เลือกได้หลายอย่าง)</label>
              <div className="flex flex-wrap gap-1.5">
                {POST_TYPES.map((t) => (
                  <button key={t.value} type="button" disabled={ro || locked} onClick={() => set({ post_types: toggle(d.post_types, t.value) })} className={chip(d.post_types.includes(t.value))}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={label}>ลงที่ไหน</label>
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((p) => (
                <button key={p.value} type="button" disabled={ro || locked} onClick={() => set({ platforms: toggle(d.platforms, p.value) })} className={chip(d.platforms.includes(p.value))}>
                  <PlatformIcon code={p.value} iconKey={p.icon_key ?? p.icon} size={14} />{p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={label}>สินค้า (รุ่น)</label>
            <ParentSkuPicker value={d.parent} onChange={(v) => set({ parent: v })} disabled={ro || locked} disableCreate placeholder="เลือกรุ่นสินค้า (ไม่บังคับ)" />
          </div>

          <div>
            <label className={label}>บรีฟ — อยากได้รูป/คลิปแนวไหน</label>
            <textarea value={d.brief} onChange={(e) => set({ brief: e.target.value })} disabled={ro} rows={4} maxLength={3000}
              placeholder="เช่น ถ่ายกลางแจ้ง โทนอุ่น นางแบบสะพายไปคาเฟ่ · เปิดคลิปด้วยฉากเทของออกจากกระเป๋า 3 วิแรก"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>

          <div>
            <label className={label}>รูปอ้างอิง (สูงสุด 12 รูป)</label>
            <FileMultiInput value={d.ref_image_keys} onChange={(keys) => set({ ref_image_keys: keys })} folder="content-plan" max={12} disabled={ro} />
          </div>
        </div>
      </ERPModal>

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={() => void remove()} loading={busy} variant="danger"
        title="ลบไอเดียนี้?" confirmText="ลบ"
        message={item?.task_id ? `ไอเดียนี้ผูกกับงาน ${item.task_no ?? ""} อยู่ — ลบแล้วงานยังอยู่ แต่จะไม่มีคอนเทนต์ผูก` : "ลบออกจากแผนและปฏิทินคอนเทนต์ (ย้อนดูได้จากประวัติ)"} />
      <ConfirmDialog open={askTask} onClose={() => setAskTask(false)} onConfirm={() => void sendAsTask()} loading={busy}
        title="ส่งเป็นงานให้ทีม Creative?" confirmText="สร้างงาน"
        message={`จะสร้างงาน "${d.title.trim()}" ในแอปจัดการงาน (แนบบรีฟ + รูปอ้างอิง${d.date ? ` · กำหนดส่ง ${d.date}` : ""}) แล้วไอเดียนี้จะย้ายไปขั้น "กำลังทำ"`} />
    </>
  );
}
