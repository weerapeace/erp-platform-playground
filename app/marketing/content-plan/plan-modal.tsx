"use client";

/**
 * การ์ดไอเดียคอนเทนต์ — สร้าง/แก้ (ฝั่งวางแผน) บนข้อมูลชุดเดียวกับปฏิทินคอนเทนต์เดิม
 *   หัวข้อ · แบรนด์ · แนวคอนเทนต์ · เป้าหมาย · รูปแบบ · ลงที่ไหน · วัน/เวลา · สินค้า · บรีฟ · รูปอ้างอิง
 *   ปุ่ม: บันทึก · 🎬 ส่งเป็นงานให้ทีม Creative (สร้างงาน + ผูก) · 📝 รายละเอียดเต็ม/แคปชั่น (ContentDrawer เดิม) · 🗑 ลบ
 * หน้าตา (2026-10-12 เจ้าของบอก "ตาลาย"): บนสุด = หัวข้อตัวใหญ่ + บรีฟ · ล่าง = รายการ "ป้ายซ้าย : ค่าขวา" ทีละบรรทัด
 *   แนว/เป้าหมาย/แบรนด์ = dropdown (โชว์แค่ค่าที่เลือก) · ช่องทาง/รูปแบบ = ปุ่มเรียบ (ไม่มีกรอบ ตัวที่เลือกถึงเข้ม)
 * ของกลาง: ERPModal · ConfirmDialog · ParentSkuPicker · FileMultiInput · ERPDateTime24 (เวลา 24 ชม.) · SearchableSelect · PlatformIcon · Toast
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang, useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { FileMultiInput } from "@/components/file-multi-input";
import { ERPDateTime24 } from "@/components/form";
import { PlatformIcon } from "@/components/platform-icon";
import { SearchableSelect } from "@/components/searchable-select";
import { useToast } from "@/components/toast";
import { createContent, updateContent, deleteContent, createTask, POST_TYPES, splitPostTypes, joinPostTypes, type ContentItem, type BrandOption } from "@/app/tasks/data";
import { labelName, type MarketingSkuLabel } from "@/lib/marketing/sku-list";
import { CONTENT_GOALS, dateKeyOf, timeOf, toScheduledIso, stageOf, STAGE_META, placementId, parsePlacement, platformsFromPlacements, type PlacementType } from "@/lib/marketing/content-plan";

/** is_active = เปิดอยู่ในหน้าแพลตฟอร์มกลาง (ปิดอยู่ก็ยังเลือกในแผนได้ ถ้าติ๊กไว้ในตั้งค่าหน้าแผน) */
export type PlatformOpt = { value: string; label: string; color?: string | null; icon?: string | null; icon_key?: string | null; is_active?: boolean };

type Draft = {
  title: string; brand_id: string; pillar_id: string; goal: string; post_types: string[];
  /** ลงที่ไหน แบบแบ่งประเภท "ประเภท:ช่องทาง" */
  placements: string[];
  /** ช่องทางที่เลือกแบบไม่ระบุประเภท (ข้อมูลเดิม / ยังไม่ตั้งประเภท) */
  platforms: string[];
  date: string; time: string; parent: ParentSkuPickerValue | null; brief: string; ref_image_keys: string[];
};

/** ปุ่มเลือกแบบเรียบ (ช่องทาง/รูปแบบ) — ไม่มีกรอบ · ตัวที่เลือก = พื้นเข้ม */
const toggleCls = (on: boolean) => `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors disabled:cursor-default ${on ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`;

type PlanDefaults = { brandId?: string | null; date?: string | null; platform?: string | null; title?: string | null; placements?: string[] | null };

function toDraft(c: ContentItem | null, defaults: PlanDefaults): Draft {
  if (!c) return {
    title: defaults.title ?? "", brand_id: defaults.brandId ?? "", pillar_id: "", goal: "", post_types: [], placements: defaults.placements ?? [], platforms: defaults.platform ? [defaults.platform] : [],
    date: defaults.date ?? "", time: "10:00", parent: null, brief: "", ref_image_keys: [],
  };
  return {
    title: c.title ?? "", brand_id: c.brand_id ?? "", pillar_id: c.pillar_id ?? "", goal: c.goal ?? "",
    post_types: splitPostTypes(c.post_type), placements: c.placements ?? [],
    // ช่องทางที่ไม่ได้มาจากประเภทการลง = ช่องทางเดิมที่เลือกแบบไม่ระบุประเภท
    platforms: (c.platforms ?? []).filter((p) => !(c.placements ?? []).some((x) => parsePlacement(x)?.platform === p)),
    date: dateKeyOf(c.scheduled_at) ?? "", time: timeOf(c.scheduled_at),
    parent: c.parent_sku_id ? { id: c.parent_sku_id, code: c.parent_sku_code ?? "", name: c.parent_sku_name ?? "", image_url: c.parent_sku_image_url ?? null } : null,
    brief: c.brief ?? "", ref_image_keys: c.ref_image_keys ?? [],
  };
}

export function PlanModal({ open, item, defaults, brands, pillars, platforms, planPlatforms, brandPlatforms, placementTypes, canEdit, onClose, onSaved, onOpenDetail, onOpenSettings }: {
  open: boolean;
  /** null = สร้างใหม่ */
  item: ContentItem | null;
  /** ค่าตั้งต้นของการ์ดใหม่ (title/placements มาจาก "🔔 ＋ เตรียมเลย") */
  defaults: PlanDefaults;
  brands: BrandOption[];
  pillars: MarketingSkuLabel[];
  /** ช่องทางทั้งหมดจากรายการกลาง */
  platforms: PlatformOpt[];
  /** ช่องทางที่ตั้งให้โชว์ในหน้าวางแผน (เรียงแล้ว) · null = ทั้งหมด */
  planPlatforms: string[] | null;
  /** แบรนด์ → ช่องทางที่ลง (ไม่มีคีย์ = ทุกช่องทาง) */
  brandPlatforms: Record<string, string[]>;
  /** ประเภทการลง (แต่งร้าน / ในสินค้า / Story …) แต่ละประเภทมีช่องทางของตัวเอง */
  placementTypes: PlacementType[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  onOpenDetail: (id: string) => void;
  /** ⚙️ เปิดตั้งค่าหน้าวางแผน (ซ้อนบนการ์ดนี้) */
  onOpenSettings: () => void;
}) {
  useLang();   // ฟังการสลับภาษา → ชื่อป้าย/แนว (labelName) เปลี่ยนตาม (หน้าแรกวาดเป็นไทยก่อน แล้วค่อยสลับ)
  const t = useT();
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
  // ตัวเลือกช่องทาง = ที่ตั้งไว้ในหน้าวางแผน ∩ ช่องทางของแบรนด์ที่เลือก (ถ้าแบรนด์ตั้งไว้) · ที่เลือกอยู่แล้วโชว์เสมอ
  const platformChoices = useMemo(() => {
    const byKey = new Map(platforms.map((p) => [p.value, p]));
    let keys = planPlatforms ? planPlatforms.filter((k) => byKey.has(k)) : platforms.filter((p) => p.is_active !== false).map((p) => p.value);
    const brandList = d.brand_id ? brandPlatforms[d.brand_id] : undefined;
    if (brandList) keys = keys.filter((k) => brandList.includes(k));
    for (const k of d.platforms) if (!keys.includes(k) && byKey.has(k)) keys.push(k);
    return keys.map((k) => byKey.get(k)!).filter(Boolean);
  }, [platforms, planPlatforms, brandPlatforms, d.brand_id, d.platforms]);
  // ประเภทการลง → ช่องทางของแต่ละประเภทที่ใช้ได้ (∩ ช่องทางที่ตั้งให้โชว์/ของแบรนด์) · ที่เลือกไว้แล้วโชว์เสมอ
  const placementRows = useMemo(() => {
    const allowed = new Set(platformChoices.map((p) => p.value));
    const byKey = new Map(platforms.map((p) => [p.value, p]));
    return placementTypes.map((t) => ({
      t,
      opts: t.platforms.filter((k) => byKey.has(k) && (allowed.has(k) || d.placements.includes(placementId(t.key, k)))).map((k) => byKey.get(k)!),
    })).filter((r) => r.opts.length > 0);
  }, [placementTypes, platforms, platformChoices, d.placements]);
  // แถว "ไม่ระบุประเภท": โชว์เมื่อยังไม่มีประเภทเลย หรือมีช่องทางเดิมที่เลือกแบบไม่ระบุประเภทค้างอยู่
  const showLoose = placementRows.length === 0 || d.platforms.length > 0;
  const locked = item?.status === "published";   // โพสต์แล้ว = ระบบเดิมล็อกเนื้อหาหลัก

  const payload = () => ({
    title: d.title.trim(), brand_id: d.brand_id || null, pillar_id: d.pillar_id || null, goal: d.goal || null,
    post_type: d.post_types.length ? joinPostTypes(d.post_types) : null,
    placements: d.placements, platforms: platformsFromPlacements(d.placements, d.platforms),   // ช่องทางรวม (ปฏิทิน/เป้า/แคปชั่นเดิมใช้)
    scheduled_at: d.date ? toScheduledIso(d.date, d.time || "10:00") : null,
    parent_sku_id: d.parent?.id ?? null, brief: d.brief.trim() || null, ref_image_keys: d.ref_image_keys,
  });

  const save = async (): Promise<string | null> => {
    if (!d.title.trim()) { toast.warning(t("ใส่หัวข้อคอนเทนต์ก่อน", "Enter a content title first")); return null; }
    setBusy(true);
    try {
      let id = item?.id ?? null;
      if (id) {
        const p: Record<string, unknown> = payload();
        if (locked) for (const k of ["title", "brand_id", "post_type", "platforms", "placements", "parent_sku_id"]) delete p[k];
        await updateContent(id, p);
      } else {
        id = (await createContent({ ...payload(), status: "draft" })).id;
      }
      toast.success(item ? t("บันทึกแล้ว", "Saved") : t("เพิ่มไอเดียแล้ว", "Idea added"));
      onSaved();
      return id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Couldn't save"));
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
        title: d.title.trim(), brand_id: d.brand_id || null, parent_sku_id: d.parent?.id ?? null, platforms: platformsFromPlacements(d.placements, d.platforms),
        description: d.brief.trim() || null, reference_images: d.ref_image_keys, due_date: d.date || null,
      });
      await updateContent(id, { task_id: t.id });
      toast.success(tr(`ส่งเป็นงาน ${t.task_no} ให้ทีม Creative แล้ว`, `Sent as task ${t.task_no} to the Creative team`));
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("สร้างงานไม่สำเร็จ", "Couldn't create the task"));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!item) return;
    setBusy(true);
    try {
      await deleteContent(item.id);
      toast.success(t("ลบไอเดียแล้ว", "Idea deleted"));
      setAskDelete(false);
      onSaved();
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Couldn't delete")); }
    finally { setBusy(false); }
  };

  const ro = !canEdit;
  // บรรทัดคุณสมบัติ "ป้ายซ้าย : ค่าขวา" (เป็นฟังก์ชันเรียกตรง ไม่ใช่ component — กันช่องพิมพ์หลุดโฟกัส)
  const row = (icon: string, labelText: string, body: ReactNode, hint?: string) => (
    <div className="grid gap-1 py-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start sm:gap-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 sm:pt-2"><span className="w-4 text-center">{icon}</span>{labelText}</div>
      <div className="min-w-0">{body}{hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}</div>
    </div>
  );
  const pillarOptions = [{ value: "", label: t("— ไม่ระบุแนว —", "— No pillar —") }, ...pillars.filter((p) => p.is_active || p.id === d.pillar_id).map((p) => ({ value: p.id, label: labelName(p), badge: p.icon ?? undefined }))];
  const goalOptions = [{ value: "", label: t("— ไม่ระบุ —", "— None —") }, ...CONTENT_GOALS.map((g) => ({ value: g.key, label: g.label, badge: g.icon }))];
  const brandOptions = [{ value: "", label: t("— ไม่ระบุแบรนด์ —", "— No brand —") }, ...brands.map((b) => ({ value: b.id, label: b.name }))];
  const pillar = d.pillar_id ? pillars.find((p) => p.id === d.pillar_id) : undefined;

  return (
    <>
      <ERPModal open={open} onClose={onClose} size="lg" defaultExpanded={false} hasUnsavedChanges={dirty && canEdit}
        title={item ? `${item.content_no ?? ""} ${item.title}`.trim() : t("💡 ไอเดียคอนเทนต์ใหม่", "💡 New content idea")}
        description={item && stage ? `${STAGE_META[stage].icon} ${STAGE_META[stage].label}${item.task_no ? ` · ${t("งาน", "Task")} ${item.task_no}` : ""}` : undefined}
        footer={
          <div className="flex w-full flex-wrap items-center gap-1.5">
            <button type="button" onClick={onOpenSettings} title={t("ตั้งค่าหน้านี้ (ช่องทาง / แนว / เป้า / สล็อต)", "Page settings (channels / pillars / targets / slots)")}
              className="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">⚙️</button>
            {item && canEdit && (
              <button type="button" onClick={() => setAskDelete(true)} disabled={busy} title={t("ลบไอเดีย", "Delete idea")}
                className="h-9 w-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">🗑</button>
            )}
            {item && (
              <button type="button" onClick={() => onOpenDetail(item.id)} disabled={busy}
                className="h-9 rounded-lg px-2.5 text-sm text-slate-600 hover:bg-slate-100">📝 {t("แคปชั่น/รายละเอียด", "Caption/details")}</button>
            )}
            <div className="ml-auto flex gap-2">
              {canEdit && stage === "idea" && (
                <button type="button" onClick={() => setAskTask(true)} disabled={busy || !d.title.trim()}
                  className="h-9 rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40">🎬 {t("ส่งเป็นงาน", "Send as task")}</button>
              )}
              <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{canEdit ? t("ยกเลิก", "Cancel") : t("ปิด", "Close")}</button>
              {canEdit && (
                <button type="button" onClick={() => void saveAndClose()} disabled={busy}
                  className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
              )}
            </div>
          </div>
        }>
        {locked && <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{t("โพสต์แล้ว — แก้ได้เฉพาะแนว/เป้าหมาย/บรีฟ/วัน (เนื้อหาหลักล็อกตามระบบเดิม)", "Posted — only pillar/goal/brief/date can be edited (main content is locked)")}</div>}

        {/* ── ตัวไอเดีย: หัวข้อ + บรีฟ ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {pillar && <span className="h-6 w-1.5 flex-shrink-0 rounded-full" style={{ background: pillar.color }} title={labelName(pillar)} />}
            <input value={d.title} onChange={(e) => set({ title: e.target.value })} disabled={ro || locked} maxLength={200} autoFocus={!item}
              placeholder={t("ไอเดียคืออะไร? เช่น BBP08 แมตช์ชุดไปเที่ยว", "What's the idea? e.g. BBP08 travel outfit match")}
              className="w-full border-0 border-b border-transparent bg-transparent px-0 py-1 text-lg font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-300 hover:border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-0 disabled:text-slate-700" />
          </div>
          <textarea value={d.brief} onChange={(e) => set({ brief: e.target.value })} disabled={ro} rows={3} maxLength={3000}
            placeholder={t("บรีฟ: อยากได้รูป/คลิปแนวไหน (ไม่บังคับ) — เช่น ถ่ายกลางแจ้ง โทนอุ่น · เปิดคลิปด้วยฉากเทของออกจากกระเป๋า 3 วิแรก", "Brief: what kind of photo/clip (optional) — e.g. outdoor shoot, warm tone · open with emptying the bag in the first 3 seconds")}
            className="w-full resize-y rounded-lg border-0 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:text-slate-600" />
        </div>

        {/* ── คุณสมบัติ: ป้ายซ้าย : ค่าขวา ── */}
        <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {row("📅", t("วันที่ลง", "Post date"), (
            <div className="flex items-center gap-2">
              <ERPDateTime24 value={d.date ? `${d.date}T${d.time || "10:00"}` : ""} disabled={ro} className="w-full max-w-xs"
                onChange={(v) => set({ date: (v ?? "").slice(0, 10), time: (v ?? "").slice(11, 16) || d.time || "10:00" })} />
              {d.date && !ro && <button type="button" onClick={() => set({ date: "" })} className="text-xs text-slate-400 hover:text-slate-700 hover:underline">{t("ไม่ลงวัน", "No date")}</button>}
            </div>
          ), d.date ? undefined : t("เว้นว่าง = เก็บเป็นไอเดียไว้ก่อน (อยู่ในกล่องไอเดียยังไม่ลงวัน)", "Leave empty = keep as an idea for now (stays in the unscheduled idea box)"))}

          {row("📱", t("ลงที่ไหน", "Where"), (
            <div className="space-y-1">
              {placementRows.map(({ t, opts }) => (
                <div key={t.key} className="flex flex-wrap items-center gap-1">
                  {(() => {
                    // กดชื่อประเภท = เลือกทุกช่องทางของประเภทนั้น · ถ้าเลือกครบอยู่แล้ว = เอาออกทั้งหมด
                    const ids = opts.map((p) => placementId(t.key, p.value));
                    const n = ids.filter((id) => d.placements.includes(id)).length;
                    const all = n === ids.length;
                    return (
                      <button type="button" disabled={ro || locked} title={all ? tr(`เอา ${t.label} ออกทั้งหมด`, `Remove all ${t.label}`) : tr(`เลือก ${t.label} ทุกช่องทาง`, `Select ${t.label} on every channel`)}
                        onClick={() => setD((x) => ({ ...x, placements: all ? x.placements.filter((id) => !ids.includes(id)) : [...x.placements, ...ids.filter((id) => !x.placements.includes(id))] }))}
                        className={`w-24 flex-shrink-0 truncate rounded-md px-1.5 py-1 text-left text-xs transition-colors enabled:hover:bg-slate-100 ${all ? "font-semibold text-slate-900" : n > 0 ? "font-medium text-slate-700" : "text-slate-500"}`}>
                        <span className={`mr-1 inline-block h-3 w-3 rounded-[3px] border align-[-1px] ${all ? "border-slate-900 bg-slate-900" : n > 0 ? "border-slate-500 bg-slate-300" : "border-slate-300"}`} />
                        {t.icon ? `${t.icon} ` : ""}{t.label}
                      </button>
                    );
                  })()}
                  {opts.map((p) => {
                    const id = placementId(t.key, p.value);
                    return (
                      <button key={id} type="button" disabled={ro || locked} onClick={() => set({ placements: toggle(d.placements, id) })} className={toggleCls(d.placements.includes(id))}>
                        <PlatformIcon code={p.value} iconKey={p.icon_key ?? p.icon} size={14} />{p.label}
                      </button>
                    );
                  })}
                </div>
              ))}
              {showLoose && (
                <div className="flex flex-wrap items-center gap-1">
                  {placementRows.length > 0 && <span className="w-24 flex-shrink-0 px-1.5 text-xs text-slate-400" title={t("ช่องทางที่เลือกไว้แบบไม่ระบุประเภท (ข้อมูลเดิม)", "Channels selected without a type (old data)")}>{t("ไม่ระบุประเภท", "No type")}</span>}
                  {(placementRows.length > 0 ? platformChoices.filter((p) => d.platforms.includes(p.value)) : platformChoices).map((p) => (
                    <button key={p.value} type="button" disabled={ro || locked} onClick={() => set({ platforms: toggle(d.platforms, p.value) })} className={toggleCls(d.platforms.includes(p.value))}>
                      <PlatformIcon code={p.value} iconKey={p.icon_key ?? p.icon} size={14} />{p.label}
                    </button>
                  ))}
                </div>
              )}
              {placementRows.length === 0 && platformChoices.length === 0 && <span className="pt-1 text-xs text-slate-400">{t("ยังไม่มีช่องทาง — ตั้งได้ที่ ⚙️", "No channels yet — set them up in ⚙️")}</span>}
            </div>
          ))}

          {row("🎞️", t("รูปแบบ", "Format"), (
            <div className="flex flex-wrap gap-1">
              {POST_TYPES.map((t) => (
                <button key={t.value} type="button" disabled={ro || locked} onClick={() => set({ post_types: toggle(d.post_types, t.value) })} className={toggleCls(d.post_types.includes(t.value))}>
                  <span className="text-[13px] leading-none">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          ))}

          {row("🧭", t("แนวคอนเทนต์", "Content pillar"), (
            <div className="max-w-xs"><SearchableSelect value={d.pillar_id} options={pillarOptions} onChange={(v) => set({ pillar_id: v })} disabled={ro} placeholder={t("— ไม่ระบุแนว —", "— No pillar —")} /></div>
          ))}

          {row("🎯", t("เป้าหมาย", "Goal"), (
            <div className="max-w-xs"><SearchableSelect value={d.goal} options={goalOptions} onChange={(v) => set({ goal: v })} disabled={ro} placeholder={t("— ไม่ระบุ —", "— None —")} /></div>
          ))}

          {row("🏷️", t("แบรนด์", "Brand"), (
            <div className="max-w-xs"><SearchableSelect value={d.brand_id} options={brandOptions} onChange={(v) => set({ brand_id: v })} disabled={ro || locked} placeholder={t("— ไม่ระบุแบรนด์ —", "— No brand —")} /></div>
          ))}

          {row("📦", t("สินค้า", "Product"), (
            <ParentSkuPicker value={d.parent} onChange={(v) => set({ parent: v })} disabled={ro || locked} disableCreate placeholder={t("เลือกรุ่นสินค้า (ไม่บังคับ)", "Pick a product model (optional)")} />
          ))}

          {row("🖼️", t("รูปอ้างอิง", "Reference images"), (
            <FileMultiInput value={d.ref_image_keys} onChange={(keys) => set({ ref_image_keys: keys })} folder="content-plan" max={12} disabled={ro} />
          ), t("สูงสุด 12 รูป", "Up to 12 images"))}
        </div>
      </ERPModal>

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={() => void remove()} loading={busy} variant="danger"
        title={t("ลบไอเดียนี้?", "Delete this idea?")} confirmText={t("ลบ", "Delete")}
        message={item?.task_id ? t(`ไอเดียนี้ผูกกับงาน ${item.task_no ?? ""} อยู่ — ลบแล้วงานยังอยู่ แต่จะไม่มีคอนเทนต์ผูก`, `This idea is linked to task ${item.task_no ?? ""} — the task stays after deleting, but without linked content`) : t("ลบออกจากแผนและปฏิทินคอนเทนต์ (ย้อนดูได้จากประวัติ)", "Removes it from the plan and content calendar (still visible in history)")} />
      <ConfirmDialog open={askTask} onClose={() => setAskTask(false)} onConfirm={() => void sendAsTask()} loading={busy}
        title={t("ส่งเป็นงานให้ทีม Creative?", "Send as a task to the Creative team?")} confirmText={t("สร้างงาน", "Create task")}
        message={t(`จะสร้างงาน "${d.title.trim()}" ในแอปจัดการงาน (แนบบรีฟ + รูปอ้างอิง${d.date ? ` · กำหนดส่ง ${d.date}` : ""}) แล้วไอเดียนี้จะย้ายไปขั้น "กำลังทำ"`, `This creates task "${d.title.trim()}" in the task app (with brief + reference images${d.date ? ` · due ${d.date}` : ""}) and moves this idea to "Making"`)} />
    </>
  );
}
