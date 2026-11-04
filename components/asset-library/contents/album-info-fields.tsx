"use client";

/**
 * ชุดช่องข้อมูลอัลบั้ม Contents (ใช้ร่วม: ป๊อปสร้างอัลบั้มใหม่ + แก้ในหน้าอัลบั้มตรง ๆ แบบบันทึกเอง)
 *   ชื่อ · แบรนด์ · วันที่ต้องลง · ผู้รับผิดชอบ · แพลตฟอร์มที่ตั้งใจลง · สินค้าในรูป · แคปชั่นร่าง (เลือกโชว์) · หมายเหตุ
 * ใช้ของกลาง: ERPForm* · BrandSelect · UserPicker · ParentSkuPicker · PlatformIcon · useCreativeOptions
 * แท็กสินค้าแล้วยังไม่เลือกแบรนด์ → เดาแบรนด์จากสินค้าให้ (resolveBrandFromProduct ตัวเดียวกับป๊อปโพสต์)
 * ช่องข้อความ (ชื่อ/แคปชั่น/หมายเหตุ) แจ้ง onBlurText ตอนออกจากช่อง → หน้าอัลบั้มใช้บันทึกตอนนั้น (ไม่ยิงทุกตัวอักษร)
 */
import { ERPFormSection, ERPFormField, ERPInput, ERPTextarea } from "@/components/form";
import { BrandSelect } from "@/components/brand-select";
import { UserPicker, ParentSkuPicker, type UserPickerValue, type ParentSkuPickerValue } from "@/components/pickers";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useCreativeOptions } from "@/app/tasks/use-options";
import { resolveBrandFromProduct, type BrandOption } from "@/app/tasks/data";
import type { AlbumFields, ContentAlbum } from "./api";

type Product = { id: string; code: string; name: string };
export type AlbumInfoForm = { name: string; description: string; brand_id: string; due_date: string; assignees: { id: string; name: string }[]; planned_platforms: string[]; caption_draft: string; products: Product[] };

export const albumInfoFrom = (a: ContentAlbum | null, brandId?: string | null): AlbumInfoForm => ({
  name: a?.name ?? "", description: a?.description ?? "", brand_id: a?.brand_id ?? brandId ?? "", due_date: a?.due_date ?? "",
  assignees: a?.assignees ?? [], planned_platforms: a?.planned_platforms ?? [], caption_draft: a?.caption_draft ?? "",
  products: (a?.products ?? []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
});

/** แปลงช่องที่เปลี่ยน → ค่าที่ส่ง API (ส่งแค่ช่องที่อยู่ใน patch) */
export function albumInfoPayload(p: Partial<AlbumInfoForm>): AlbumFields {
  const out: AlbumFields = {};
  if (p.name !== undefined) out.name = p.name.trim();
  if (p.description !== undefined) out.description = p.description.trim() || null;
  if (p.brand_id !== undefined) out.brand_id = p.brand_id || null;
  if (p.due_date !== undefined) out.due_date = p.due_date || null;
  if (p.assignees !== undefined) out.assignee_ids = p.assignees.map((a) => a.id);
  if (p.planned_platforms !== undefined) out.planned_platforms = p.planned_platforms;
  if (p.caption_draft !== undefined) out.caption_draft = p.caption_draft.trim() || null;
  if (p.products !== undefined) out.parent_sku_codes = p.products.map((x) => x.code).filter(Boolean);
  return out;
}

export function AlbumInfoFields({ form, onChange, onBlurText, brands, brandLocked = false, disabled = false, showName = true, showCaption = true, autoFocusName = false }: {
  form: AlbumInfoForm;
  onChange: (p: Partial<AlbumInfoForm>) => void;
  /** ออกจากช่องข้อความ (ชื่อ/แคปชั่น/หมายเหตุ) */
  onBlurText?: () => void;
  brands: BrandOption[];
  /** อัปไฟล์ขึ้น Drive แล้ว = เปลี่ยนแบรนด์ไม่ได้ */
  brandLocked?: boolean;
  disabled?: boolean;
  showName?: boolean;
  showCaption?: boolean;
  autoFocusName?: boolean;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const togglePlatform = (code: string) => onChange({ planned_platforms: form.planned_platforms.includes(code) ? form.planned_platforms.filter((x) => x !== code) : [...form.planned_platforms, code] });
  const addPerson = (v: UserPickerValue | null) => { if (v && !form.assignees.some((a) => a.id === v.id)) onChange({ assignees: [...form.assignees, { id: v.id, name: v.name }] }); };
  const addProduct = (v: ParentSkuPickerValue | null) => {
    if (!v || form.products.some((p) => p.id === v.id)) return;
    onChange({ products: [...form.products, { id: v.id, code: v.code, name: v.name }] });
    if (!form.brand_id && !brandLocked) resolveBrandFromProduct({ parentSkuId: v.id }).then((bid) => { if (bid) onChange({ brand_id: bid }); }).catch(() => {});
  };

  return (
    <ERPFormSection columns={2}>
      {showName && (
        <ERPFormField label={t("ชื่ออัลบั้ม", "Album name")} required span={2}>
          <ERPInput autoFocus={autoFocusName} disabled={disabled} value={form.name} onChange={(e) => onChange({ name: e.target.value })} onBlur={onBlurText} placeholder={t("เช่น ถ่ายกระเป๋า Heart Bag คอลใหม่", "e.g. Heart Bag new collection shoot")} />
        </ERPFormField>
      )}
      <ERPFormField label={t("แบรนด์", "Brand")} hint={t("ใช้เลือกโฟลเดอร์ Drive ที่เก็บไฟล์", "Decides which Drive folder holds the files")}>
        <BrandSelect brands={brands} value={form.brand_id} onChange={(id) => onChange({ brand_id: id })} emptyLabel={t("— เลือกแบรนด์ —", "— Pick a brand —")}
          disabled={disabled || brandLocked} title={brandLocked ? t("อัปไฟล์ไปแล้ว เปลี่ยนแบรนด์ไม่ได้ (ไฟล์อยู่ในโฟลเดอร์แบรนด์เดิม)", "Files already uploaded — brand is locked to keep them together") : undefined} />
      </ERPFormField>
      <ERPFormField label={t("วันที่ต้องลง", "Post by")}>
        <ERPInput type="date" disabled={disabled} value={form.due_date} onChange={(e) => onChange({ due_date: e.target.value })} />
      </ERPFormField>
      <ERPFormField label={t("ผู้รับผิดชอบ", "Owners")} span={2}>
        <div className="space-y-2">
          {form.assignees.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.assignees.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-slate-100 text-sm text-slate-700">
                  {a.name || t("(ไม่มีชื่อ)", "(no name)")}
                  {!disabled && <button type="button" onClick={() => onChange({ assignees: form.assignees.filter((x) => x.id !== a.id) })} className="w-5 h-5 grid place-items-center rounded-full hover:bg-slate-200" aria-label={t("เอาออก", "Remove")}><Icon name="cancel" size={12} /></button>}
                </span>
              ))}
            </div>
          )}
          {!disabled && <UserPicker value={null} onChange={addPerson} placeholder={t("+ เพิ่มคน", "+ Add person")} />}
        </div>
      </ERPFormField>
      <ERPFormField label={t("ตั้งใจลงที่ไหน", "Planned platforms")} span={2} hint={t("ยังไม่เลือก = อัลบั้มอยู่สถานะ “รอจัดการ”", "None picked = album stays “To organise”")}>
        <div className="flex flex-wrap gap-1.5">
          {platforms.map((p) => {
            const on = form.planned_platforms.includes(p.value);
            return (
              <button key={p.value} type="button" disabled={disabled} onClick={() => togglePlatform(p.value)} aria-pressed={on}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm disabled:cursor-default ${on ? "border-violet-400 bg-violet-50 text-violet-800 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <PlatformIcon code={p.value} iconKey={p.icon_key} size={16} />{p.label}
              </button>
            );
          })}
        </div>
      </ERPFormField>
      <ERPFormField label={t("สินค้าในรูป", "Products in the shoot")} span={2} hint={t("ตัวแรก = สินค้าหลักของโพสต์ที่สร้างจากอัลบั้ม · ยังไม่เลือกแบรนด์ ระบบเดาแบรนด์จากสินค้าให้", "First one becomes the post's main product · picks the brand if empty")}>
        <div className="space-y-2">
          {form.products.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {form.products.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-slate-100 text-sm text-slate-700">
                  <span className="font-mono text-xs">{p.code}</span>{p.name ? <span className="text-slate-500 truncate max-w-[160px]">{p.name}</span> : null}
                  {!disabled && <button type="button" onClick={() => onChange({ products: form.products.filter((x) => x.id !== p.id) })} className="w-5 h-5 grid place-items-center rounded-full hover:bg-slate-200" aria-label={t("เอาออก", "Remove")}><Icon name="cancel" size={12} /></button>}
                </span>
              ))}
            </div>
          )}
          {!disabled && <ParentSkuPicker value={null} onChange={addProduct} placeholder={t("+ แท็กสินค้า (Parent SKU)", "+ Tag a product (Parent SKU)")} disableCreate />}
        </div>
      </ERPFormField>
      {showCaption && (
        <ERPFormField label={t("แคปชั่นร่าง", "Draft caption")} span={2} hint={t("ส่งเข้าโพสต์ให้อัตโนมัติตอนกด “ส่งเข้าปฏิทิน” · ว่าง = อัลบั้มอยู่ “รอหา Caption”", "Copied into posts made from this album · empty = “Needs caption”")}>
          <ERPTextarea rows={4} disabled={disabled} value={form.caption_draft} onChange={(e) => onChange({ caption_draft: e.target.value })} onBlur={onBlurText} />
        </ERPFormField>
      )}
      <ERPFormField label={t("หมายเหตุ", "Notes")} span={2}>
        <ERPTextarea rows={2} disabled={disabled} value={form.description} onChange={(e) => onChange({ description: e.target.value })} onBlur={onBlurText} placeholder={t("เช่น ถ่ายที่สตูดิโอ ใช้นางแบบ…", "e.g. studio shoot, model…")} />
      </ERPFormField>
    </ERPFormSection>
  );
}
