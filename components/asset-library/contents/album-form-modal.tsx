"use client";

/**
 * ป๊อปสร้าง/แก้ข้อมูลอัลบั้ม Contents — ชื่อ · แบรนด์ · วันที่ต้องลง · ผู้รับผิดชอบ · แพลตฟอร์มที่ตั้งใจลง · สินค้าในรูป · แคปชั่นร่าง
 * ช่องทั้งหมด = ชุดกลาง AlbumInfoFields (./album-info-fields — ตัวเดียวกับที่แก้ในหน้าอัลบั้ม) · ใช้ของกลาง: ERPModal
 * phase="wish" = ฟอร์ม "รายการที่อยากได้" (ประเภท Content · อยากได้ภายใน · ใครถ่าย · ไม่มีแคปชั่น) · แก้ของเดิม = ตามขั้นของรายการนั้น
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import type { BrandOption } from "@/app/tasks/data";
import { createContentAlbum, updateContentAlbum, type ContentAlbum } from "./api";
import { AlbumInfoFields, albumInfoFrom, albumInfoPayload, type AlbumInfoForm } from "./album-info-fields";

export function AlbumFormModal({ open, album, brands, defaultBrandId, phase = "album", onClose, onSaved }: {
  open: boolean;
  album: ContentAlbum | null;          // null = สร้างใหม่
  phase?: "wish" | "album";
  brands: BrandOption[];
  defaultBrandId?: string | null;
  onClose: () => void;
  onSaved: (a: ContentAlbum) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<AlbumInfoForm>(albumInfoFrom(album, defaultBrandId));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setForm(albumInfoFrom(album, defaultBrandId)); setDirty(false); setErr(null); } }, [open, album, defaultBrandId]);
  const upd = (p: Partial<AlbumInfoForm>) => { setForm((f) => ({ ...f, ...p })); setDirty(true); };
  const brandLocked = !!album?.drive_folder_id;
  const wish = (album?.phase ?? phase) === "wish";

  const save = async () => {
    if (!form.name.trim()) { setErr(wish ? t("ใส่ชื่อรายการก่อน", "Enter a name") : t("ใส่ชื่ออัลบั้มก่อน", "Enter an album name")); return; }
    setSaving(true); setErr(null);
    const fields = albumInfoPayload(form);
    try {
      const saved = album ? await updateContentAlbum(album.id, fields) : await createContentAlbum({ ...fields, name: form.name.trim(), phase: wish ? "wish" : "album" });
      setDirty(false); onSaved(saved);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" hasUnsavedChanges={dirty} storageKey="content-album-form"
      title={wish ? (album ? t("แก้รายการที่อยากได้", "Edit wish") : t("เพิ่มรายการที่อยากได้", "New wish")) : album ? t("แก้ข้อมูลอัลบั้ม", "Edit album") : t("สร้างอัลบั้มใหม่", "New album")}
      description={album ? undefined : wish ? t("บอกทีมถ่ายว่าอยากได้คอนเทนต์แบบไหน · แนบ Reference ได้ในหน้าถัดไป", "Tell the shoot team what you want · add references next") : t("ลงไฟล์จากการถ่าย 1 ครั้งไว้ที่นี่ ไฟล์ตัวจริงเก็บใน Google Drive ของแบรนด์", "One shoot per album · originals stay in the brand's Google Drive")}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
          {saving ? t("กำลังบันทึก...", "Saving...") : album ? t("บันทึก", "Save") : wish ? t("บันทึก แล้วไปเพิ่ม Reference", "Save and add references") : t("สร้างอัลบั้ม", "Create album")}
        </button>
      </>}>
      {err && <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><Icon name="warning" />{err}</div>}
      <AlbumInfoFields form={form} onChange={upd} brands={brands} brandLocked={brandLocked} autoFocusName wish={wish} />
    </ERPModal>
  );
}
