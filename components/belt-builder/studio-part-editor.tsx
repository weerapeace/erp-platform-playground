"use client";

/**
 * แผงแก้ไขชิ้นส่วน (สตูดิโอ) — เปิดใน Drawer ด้านขวาทุกขนาดจอ (เจ้าของขอ 2026-10-17: "อยากได้หน้าแก้ไขเป็น drawer")
 *   บน   = BeltPreview ซ้อนรูปชิ้นนี้บนชิ้นอ้างอิง + AnchorEditor ลากกรอบ / ช่อง x,y,w,h / ปุ่มค่ามาตรฐานของประเภท (ของกลางเดิม)
 *          ความกว้างพรีวิวย่อตามความกว้าง drawer (วัดด้วย ResizeObserver) — ลากขอบ drawer ให้กว้างขึ้น พรีวิวก็ใหญ่ตาม
 *   ล่าง = ช่องอัปโหลด PNG (ลากวาง/เลือกไฟล์/คลังไฟล์ · เตือนถ้าไม่ใช่ PNG โปร่ง หรือ > 2 MB) · ชื่อไทย/อังกฤษ · code · ประเภท
 *          · คุณสมบัติ (AttrsEditor) · สีจุดเลือก (ColorInput) · ราคาเพิ่ม (MoneyInput) · เปิดใช้
 *   บันทึก = ส่งเฉพาะฟิลด์ที่แก้ (diffPatch) → PATCH /api/belt-builder/parts/:id (server เขียน audit changes)
 *   แจ้ง dirty ออกไป (onDirtyChange) ให้ Drawer ถามก่อนปิด/ข้ามชิ้น
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnchorEditor, invalidateRefParts } from "./anchor-editor";
import { AttrsEditor } from "./attrs-editor";
import { AssetPicker } from "@/components/asset-picker";
import { ColorInput } from "@/components/color-picker";
import { MoneyInput } from "@/components/money-input";
import { useToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import { DEFAULT_ANCHOR, PART_TYPES, PART_TYPE_LABEL, parseAnchor, validatePart, type Anchor, type PartType } from "@/lib/belt-builder";
import { diffPatch, partColor, patchPart, type BeltPart } from "./studio-data";
import { uploadBeltPartPng } from "./upload-png";

const EDIT_KEYS: (keyof BeltPart)[] = ["part_type", "code", "name_th", "name_en", "image_key", "image_url", "anchor", "attrs", "price_delta", "is_active"];

const PHOTO_HINT: Record<PartType, string> = {
  strap: "ถ่ายทั้งเส้นแนวนอน หัวอยู่ซ้าย หางอยู่ขวา — ให้เห็นหาง (ปลายแหลม + รู) ในรูปเดียวกัน · กว้าง ~1600px",
  buckle: "ถ่ายด้านหน้าตรง ไดคัทเฉพาะตัวหัว (ไม่เอาสาย)",
  keeper: "ถ่ายด้านหน้าตรง ไดคัทเฉพาะตัวหู",
};

export function PartEditor({ part, shopId, canEdit, onSaved, onRequestClose, onDuplicate, onDelete, onDirtyChange }: {
  part: BeltPart;
  shopId: string;
  canEdit: boolean;
  onSaved: (p: BeltPart) => void;
  /** กดปุ่ม "ปิด" ในแผง (ผู้เรียกจะถามก่อนถ้ายังไม่บันทึก) */
  onRequestClose: () => void;
  onDuplicate: (p: BeltPart) => void;
  onDelete: (p: BeltPart) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<BeltPart>(part);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(640);

  // สลับการ์ด → โหลดค่าชิ้นใหม่เข้าฟอร์ม (ผู้เรียกถามก่อนสลับถ้ามีของค้าง)
  useEffect(() => { setForm(part); setErrors([]); }, [part]);

  // พรีวิวกว้างตาม drawer (ลากขอบ drawer แล้วพรีวิวขยายตาม) · เผื่อขอบ 8px · ไม่เกิน 960
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const apply = () => setPreviewWidth(Math.max(280, Math.min(960, Math.floor(el.clientWidth) - 8)));
    apply();
    const ro = new ResizeObserver(apply); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const patch = useMemo(() => diffPatch(part as unknown as Record<string, unknown>, form as unknown as Record<string, unknown>, EDIT_KEYS as string[]) as Partial<BeltPart>, [part, form]);
  const dirty = Object.keys(patch).length > 0;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);   // ถอดแผง (สลับชิ้น/ปิด) → ล้างสถานะค้าง

  const set = <K extends keyof BeltPart>(k: K, v: BeltPart[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pt: PartType = PART_TYPES.includes(form.part_type) ? form.part_type : "strap";
  const colorKey = pt === "buckle" ? "metal_hex" : "color_hex";
  const color = partColor(form) ?? "";

  const handleFile = async (file: File) => {
    if (!canEdit) return;
    setUploading(true);
    try {
      const r = await uploadBeltPartPng(file);
      set("image_key", r.r2_key); set("image_url", null);
      r.warnings.forEach((w) => toast.warning(w));
      toast.success("อัปโหลดรูปแล้ว — กด \"บันทึก\" เพื่อใช้จริง");
    } catch (e) { toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!dirty || saving) return;
    const v = validatePart({ ...form, anchor: form.anchor ?? undefined } as unknown as Record<string, unknown>);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors([]);
    setSaving(true);
    try {
      const saved = await patchPart(part.id, patch);
      invalidateRefParts(shopId);
      toast.success("บันทึกแล้ว");
      onSaved(saved);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const inp = "w-full rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50";
  const lab = "mb-0.5 block text-xs font-medium text-slate-600";
  const img = form.image_url || r2ImageUrl(form.image_key, 600);

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {/* บน: พรีวิว + จุดยึด */}
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">{PART_TYPE_LABEL[pt].icon} {form.name_th || "(ไม่มีชื่อ)"} <span className="ml-1 text-xs font-normal text-slate-400">{form.code}</span></div>
          {dirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">ยังไม่ได้บันทึก</span>}
        </div>
        <AnchorEditor value={form.anchor} onChange={(a: Anchor) => set("anchor", a)} disabled={!canEdit} partType={pt}
          imageKey={form.image_key} imageUrl={form.image_url} colorHex={color || null} label={form.name_th || undefined}
          shopId={shopId} currentId={part.id} width={previewWidth} />
      </div>

      {/* ล่าง: รูป + ข้อมูล */}
      <div className="space-y-3">
        <div>
          <span className={lab}>รูป PNG พื้นโปร่ง</span>
          <div
            onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOver(true); } }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
            className={`flex items-center gap-3 rounded-lg border-2 border-dashed p-2 ${dragOver ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
            <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-white">
              {img ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-slate-400">ไม่มีรูป</span>}
            </div>
            <div className="min-w-0 flex-1 text-[11px] text-slate-600">
              <div>ลากไฟล์มาวาง หรือ</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <label className={`cursor-pointer rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700 hover:bg-indigo-100 ${!canEdit || uploading ? "pointer-events-none opacity-50" : ""}`}>
                  {uploading ? "กำลังอัป…" : "เลือกไฟล์"}
                  <input type="file" accept="image/png" className="hidden" disabled={!canEdit || uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.currentTarget.value = ""; }} />
                </label>
                <button type="button" disabled={!canEdit} onClick={() => setPickerOpen(true)} className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100 disabled:opacity-50">📁 คลังไฟล์</button>
                {(form.image_key || form.image_url) && canEdit && (
                  <button type="button" onClick={() => { set("image_key", null); set("image_url", null); }} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-red-600 hover:bg-red-50">ลบรูป</button>
                )}
              </div>
              <div className="mt-1 text-slate-400">PNG ไดคัทพื้นออก · {PHOTO_HINT[pt]} · ไม่เกิน 2 MB</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="col-span-2"><label className={lab}>ชื่อ (ไทย) *</label><input className={inp} value={form.name_th ?? ""} disabled={!canEdit} onChange={(e) => set("name_th", e.target.value)} /></div>
          <div className="col-span-2"><label className={lab}>ชื่อ (อังกฤษ)</label><input className={inp} value={form.name_en ?? ""} disabled={!canEdit} onChange={(e) => set("name_en", e.target.value || null)} /></div>
          <div><label className={lab}>รหัส (code)</label><input className={`${inp} font-mono`} value={form.code ?? ""} disabled={!canEdit} placeholder="strap-black-35" onChange={(e) => set("code", e.target.value || null)} /></div>
          <div>
            <label className={lab}>ประเภท</label>
            <select className={inp} value={pt} disabled={!canEdit} onChange={(e) => set("part_type", e.target.value as PartType)}>
              {PART_TYPES.map((t) => <option key={t} value={t}>{PART_TYPE_LABEL[t].icon} {PART_TYPE_LABEL[t].th}</option>)}
            </select>
          </div>
          <div>
            <label className={lab}>ราคาเพิ่ม (฿)</label>
            <MoneyInput value={form.price_delta} disabled={!canEdit} className={inp} onChange={(raw) => set("price_delta", Number(raw) || 0)} />
          </div>
          <div>
            <label className={lab}>สีจุดเลือก / กล่องแทนรูป</label>
            <div className="flex items-center gap-2">
              {canEdit ? <ColorInput value={color} onChange={(hex) => set("attrs", { ...form.attrs, [colorKey]: hex })} /> : <span className="h-6 w-6 rounded border" style={{ background: color || "#e2e8f0" }} />}
              <span className="text-[11px] text-slate-500">{colorKey}</span>
            </div>
          </div>
          <div className="col-span-2 md:col-span-4">
            <label className={lab}>คุณสมบัติ (ทำตัวกรองบนเว็บ: สี / กว้างสาย / ทรง / สีโลหะ)</label>
            <AttrsEditor value={form.attrs} onChange={(v) => set("attrs", v)} disabled={!canEdit} partType={pt} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 md:col-span-4">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!!form.is_active} disabled={!canEdit} onChange={(e) => set("is_active", e.target.checked)} />
            เปิดให้ลูกค้าเลือกบนเว็บ
          </label>
        </div>

        {errors.length > 0 && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errors.map((e) => <div key={e}>• {e}</div>)}</div>}

        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-1 pb-1 pt-3">
          {canEdit && (
            <>
              <button type="button" onClick={save} disabled={!dirty || saving} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
              <button type="button" onClick={() => setForm(part)} disabled={!dirty || saving} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">ยกเลิกที่แก้</button>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <button type="button" onClick={() => onDuplicate(part)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50" title="สร้างชิ้นใหม่โดยคัดลอกค่าทุกอย่าง (รหัสเติม -copy)">📑 ทำสำเนา</button>
              <button type="button" onClick={() => onDelete(part)} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">🗑 ลบ</button>
            </>
          )}
          <button type="button" onClick={onRequestClose} className="ml-auto rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">ปิด</button>
        </div>
        {!canEdit && <div className="text-[11px] text-slate-400">คุณมีสิทธิ์ดูอย่างเดียว (ต้องมีสิทธิ์ belt_builder.edit จึงจะแก้ได้)</div>}
      </div>

      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} typeFilter="image" title="เลือกรูป PNG จากคลังไฟล์กลาง"
        onSelect={(assets) => { const a = assets[0]; if (a?.r2_key) { set("image_key", a.r2_key); set("image_url", null); } setPickerOpen(false); }} />
    </div>
  );
}

/** ค่าเริ่มต้นสำหรับชิ้นใหม่ของประเภทนี้ (ใช้ตอนกด + เพิ่ม) */
export function blankPart(shopId: string, partType: PartType, sortOrder: number): Partial<BeltPart> {
  return { shop_id: shopId, part_type: partType, name_th: `${PART_TYPE_LABEL[partType].th}ใหม่`, code: null, anchor: DEFAULT_ANCHOR[partType], attrs: {}, price_delta: 0, sort_order: sortOrder, is_active: false };
}

/** สำเนา: คัดลอกทุกค่า เติม -copy ที่รหัส/ชื่อ และปิดไว้ก่อน (กันโผล่บนเว็บซ้ำ) */
export function duplicateBody(p: BeltPart, sortOrder: number): Partial<BeltPart> {
  return {
    shop_id: p.shop_id, part_type: p.part_type, code: p.code ? `${p.code}-copy` : null, name_th: `${p.name_th} (สำเนา)`, name_en: p.name_en,
    image_key: p.image_key, image_url: p.image_url, anchor: parseAnchor(p.anchor) ?? DEFAULT_ANCHOR[p.part_type], attrs: { ...p.attrs },
    price_delta: p.price_delta, sort_order: sortOrder, is_active: false,
  };
}
