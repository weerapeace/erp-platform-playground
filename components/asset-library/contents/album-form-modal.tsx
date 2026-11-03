"use client";

/**
 * ป๊อปสร้าง/แก้ข้อมูลอัลบั้ม Contents — ชื่อ · แบรนด์ · วันที่ต้องลง · ผู้รับผิดชอบ · แพลตฟอร์มที่ตั้งใจลง · แคปชั่นร่าง
 * ใช้ของกลาง: ERPModal · ERPForm* · BrandSelect · UserPicker · PlatformIcon · useCreativeOptions (แพลตฟอร์มจากหน้าแพลตฟอร์มกลาง)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPFormSection, ERPFormField, ERPInput, ERPTextarea } from "@/components/form";
import { BrandSelect } from "@/components/brand-select";
import { UserPicker, type UserPickerValue } from "@/components/pickers";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "@/app/tasks/use-options";
import type { BrandOption } from "@/app/tasks/data";
import { createContentAlbum, updateContentAlbum, type ContentAlbum } from "./data";

type Form = { name: string; description: string; brand_id: string; due_date: string; assignees: { id: string; name: string }[]; planned_platforms: string[]; caption_draft: string };
const fromAlbum = (a: ContentAlbum | null, brandId?: string | null): Form => ({
  name: a?.name ?? "", description: a?.description ?? "", brand_id: a?.brand_id ?? brandId ?? "", due_date: a?.due_date ?? "",
  assignees: a?.assignees ?? [], planned_platforms: a?.planned_platforms ?? [], caption_draft: a?.caption_draft ?? "",
});

export function AlbumFormModal({ open, album, brands, defaultBrandId, onClose, onSaved }: {
  open: boolean;
  album: ContentAlbum | null;          // null = สร้างใหม่
  brands: BrandOption[];
  defaultBrandId?: string | null;
  onClose: () => void;
  onSaved: (a: ContentAlbum) => void;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [form, setForm] = useState<Form>(fromAlbum(album, defaultBrandId));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setForm(fromAlbum(album, defaultBrandId)); setDirty(false); setErr(null); } }, [open, album, defaultBrandId]);
  const upd = (p: Partial<Form>) => { setForm((f) => ({ ...f, ...p })); setDirty(true); };
  const togglePlatform = (code: string) => upd({ planned_platforms: form.planned_platforms.includes(code) ? form.planned_platforms.filter((x) => x !== code) : [...form.planned_platforms, code] });
  const addPerson = (v: UserPickerValue | null) => { if (v && !form.assignees.some((a) => a.id === v.id)) upd({ assignees: [...form.assignees, { id: v.id, name: v.name }] }); };

  const save = async () => {
    if (!form.name.trim()) { setErr(t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name")); return; }
    setSaving(true); setErr(null);
    const fields = {
      name: form.name.trim(), description: form.description.trim() || null, brand_id: form.brand_id || null, due_date: form.due_date || null,
      assignee_ids: form.assignees.map((a) => a.id), planned_platforms: form.planned_platforms, caption_draft: form.caption_draft.trim() || null,
    };
    try {
      const saved = album ? await updateContentAlbum(album.id, fields) : await createContentAlbum(fields);
      setDirty(false); onSaved(saved);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" hasUnsavedChanges={dirty} storageKey="content-album-form"
      title={album ? t("แก้ข้อมูลอัลบั้ม", "Edit album") : t("สร้างอัลบั้มใหม่", "New album")}
      description={album ? undefined : t("ลงไฟล์จากการถ่าย 1 ครั้งไว้ที่นี่ ไฟล์ตัวจริงเก็บใน Google Drive ของแบรนด์", "One shoot per album · originals stay in the brand's Google Drive")}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? t("กำลังบันทึก...", "Saving...") : album ? t("บันทึก", "Save") : t("สร้างอัลบั้ม", "Create album")}
        </button>
      </>}>
      {err && <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><Icon name="warning" />{err}</div>}
      <ERPFormSection columns={2}>
        <ERPFormField label={t("ชื่ออัลบั้ม", "Album name")} required span={2}>
          <ERPInput autoFocus value={form.name} onChange={(e) => upd({ name: e.target.value })} placeholder={t("เช่น ถ่ายกระเป๋า Heart Bag คอลใหม่", "e.g. Heart Bag new collection shoot")} />
        </ERPFormField>
        <ERPFormField label={t("แบรนด์", "Brand")} hint={t("ใช้เลือกโฟลเดอร์ Drive ที่เก็บไฟล์", "Decides which Drive folder holds the files")}>
          <BrandSelect brands={brands} value={form.brand_id} onChange={(id) => upd({ brand_id: id })} emptyLabel={t("— เลือกแบรนด์ —", "— Pick a brand —")}
            disabled={!!album?.drive_folder_id} title={album?.drive_folder_id ? t("อัปไฟล์ไปแล้ว เปลี่ยนแบรนด์ไม่ได้ (ไฟล์อยู่ในโฟลเดอร์แบรนด์เดิม)", "Files already uploaded — brand is locked to keep them together") : undefined} />
        </ERPFormField>
        <ERPFormField label={t("วันที่ต้องลง", "Post by")}>
          <ERPInput type="date" value={form.due_date} onChange={(e) => upd({ due_date: e.target.value })} />
        </ERPFormField>
        <ERPFormField label={t("ผู้รับผิดชอบ", "Owners")} span={2}>
          <div className="space-y-2">
            {form.assignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.assignees.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-slate-100 text-sm text-slate-700">
                    {a.name || t("(ไม่มีชื่อ)", "(no name)")}
                    <button type="button" onClick={() => upd({ assignees: form.assignees.filter((x) => x.id !== a.id) })} className="w-5 h-5 grid place-items-center rounded-full hover:bg-slate-200" aria-label={t("เอาออก", "Remove")}><Icon name="cancel" size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <UserPicker value={null} onChange={addPerson} placeholder={t("+ เพิ่มคน", "+ Add person")} />
          </div>
        </ERPFormField>
        <ERPFormField label={t("ตั้งใจลงที่ไหน", "Planned platforms")} span={2} hint={t("ยังไม่เลือก = อัลบั้มอยู่สถานะ “รอจัดการ”", "None picked = album stays “To organise”")}>
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((p) => {
              const on = form.planned_platforms.includes(p.value);
              return (
                <button key={p.value} type="button" onClick={() => togglePlatform(p.value)} aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm ${on ? "border-violet-400 bg-violet-50 text-violet-800 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <PlatformIcon code={p.value} iconKey={p.icon_key} size={16} />{p.label}
                </button>
              );
            })}
          </div>
        </ERPFormField>
        <ERPFormField label={t("แคปชั่นร่าง", "Draft caption")} span={2} hint={t("ส่งเข้าโพสต์ให้อัตโนมัติตอนกด “ส่งเข้าปฏิทิน” · ว่าง = อัลบั้มอยู่ “รอหา Caption”", "Copied into posts made from this album · empty = “Needs caption”")}>
          <ERPTextarea rows={4} value={form.caption_draft} onChange={(e) => upd({ caption_draft: e.target.value })} />
        </ERPFormField>
        <ERPFormField label={t("หมายเหตุ", "Notes")} span={2}>
          <ERPTextarea rows={2} value={form.description} onChange={(e) => upd({ description: e.target.value })} placeholder={t("เช่น ถ่ายที่สตูดิโอ ใช้นางแบบ…", "e.g. studio shoot, model…")} />
        </ERPFormField>
      </ERPFormSection>
    </ERPModal>
  );
}
