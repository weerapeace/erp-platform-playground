"use client";

/**
 * 📚 Design Library — ฟอร์มแม่แบบ (สร้าง/แก้) ใน ERPModal กลาง
 * รูปจริง + รูปลายเส้น (vector) อัปผ่านของกลาง uploadImagesWithDupCheck (ถามรูปซ้ำ) · ขนาดตั้งต้นของสูตรใหม่
 * สิทธิ์ design_library.manage (หน้าแม่ซ่อนปุ่มถ้าไม่มี + API ตรวจซ้ำ)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { cleanSize, DEFAULT_SIZE, type Size } from "@/lib/design-library";
import { api, img, type Template } from "./shared";

function readSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { resolve({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(url); };
    im.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
    im.src = url;
  });
}

type Form = { code: string; name: string; category: string; description: string; image_key: string | null; image_w: number | null; image_h: number | null; vector_image_key: string | null; size: Size };
const blank: Form = { code: "", name: "", category: "", description: "", image_key: null, image_w: null, image_h: null, vector_image_key: null, size: DEFAULT_SIZE };

export function TemplateFormModal({ open, initial, onClose, onSaved }: {
  open: boolean; initial: Template | null; onClose: () => void; onSaved: (t: Template) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(blank);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "photo" | "vector" | "save">("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setErrors([]); setDirty(false);
    setF(initial ? {
      code: initial.code, name: initial.name, category: initial.category ?? "", description: initial.description ?? "",
      image_key: initial.image_key, image_w: initial.image_w, image_h: initial.image_h, vector_image_key: initial.vector_image_key,
      size: cleanSize(initial.default_spec?.size),
    } : blank);
  }, [open, initial]);

  const set = (patch: Partial<Form>) => { setF((p) => ({ ...p, ...patch })); setDirty(true); };

  const upload = async (file: File | undefined, which: "photo" | "vector") => {
    if (!file) return;
    setBusy(which);
    try {
      const [size, up] = await Promise.all([readSize(file), uploadImagesWithDupCheck([file], { folder: "design-library", max: 2400, onError: (_, e) => toast.error(e.message) })]);
      const key = up?.keys[0];
      if (!key) return;
      if (which === "photo") set({ image_key: key, image_w: size.w || null, image_h: size.h || null });
      else set({ vector_image_key: key });
    } catch { toast.error("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(""); }
  };

  const save = async () => {
    const e: string[] = [];
    if (!f.code.trim()) e.push("ใส่รหัสแม่แบบ เช่น TOTE-01");
    if (!f.name.trim()) e.push("ใส่ชื่อแม่แบบ");
    if (!f.image_key) e.push("อัปโหลดรูปจริงของแม่แบบ");
    setErrors(e);
    if (e.length) return;
    setBusy("save");
    try {
      const payload = {
        code: f.code.trim().toUpperCase(), name: f.name.trim(), category: f.category.trim() || null, description: f.description.trim() || null,
        image_key: f.image_key, image_w: f.image_w, image_h: f.image_h, vector_image_key: f.vector_image_key,
        default_spec: { ...(initial?.default_spec ?? {}), size: cleanSize(f.size) },
      };
      const row = initial
        ? await api<Template>(`/api/design-library/templates/${initial.id}`, { method: "PATCH", json: payload })
        : await api<Template>(`/api/design-library/templates`, { json: payload });
      toast.success(initial ? "บันทึกแม่แบบแล้ว" : "สร้างแม่แบบแล้ว");
      setDirty(false);
      onSaved(row);
    } catch (err) { setErrors([(err as Error).message]); }
    finally { setBusy(""); }
  };

  const sizeField = (k: keyof Size, label: string) => (
    <label className="text-[12px] text-slate-500">{label}
      <input type="number" min={0} step={0.5} value={f.size[k]} onChange={(e) => set({ size: { ...f.size, [k]: Number(e.target.value) } })}
        className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800" />
    </label>
  );
  const imgBox = (key: string | null, which: "photo" | "vector", label: string, hint: string) => (
    <div>
      <div className="text-[12px] text-slate-500 mb-1">{label}</div>
      <label className="block h-44 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:border-indigo-300 cursor-pointer overflow-hidden relative">
        {key
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img(key, 600)} alt="" className="w-full h-full object-contain bg-white" />
          : <span className="absolute inset-0 flex flex-col items-center justify-center text-[12px] text-slate-400 px-3 text-center">{busy === which ? "กำลังอัปโหลด…" : hint}</span>}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(e.target.files?.[0], which); e.target.value = ""; }} />
      </label>
      {key && <button type="button" onClick={() => set(which === "photo" ? { image_key: null, image_w: null, image_h: null } : { vector_image_key: null })} className="mt-1 text-[11px] text-rose-600 hover:underline">เอารูปออก</button>}
    </div>
  );

  return (
    <ERPModal open={open} onClose={onClose} title={initial ? `แก้แม่แบบ ${initial.code}` : "เพิ่มแม่แบบกระเป๋า"} size="lg" hasUnsavedChanges={dirty} defaultExpanded={false}
      footer={<div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => void save()} disabled={!!busy} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{busy === "save" ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>}>
      <div className="space-y-4">
        {errors.length > 0 && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[13px] text-rose-700">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-[12px] text-slate-500">รหัสแม่แบบ *
            <input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="TOTE-01" className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800 font-mono" />
          </label>
          <label className="text-[12px] text-slate-500 sm:col-span-2">ชื่อ *
            <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="กระเป๋าถือทรงถัง" className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800" />
          </label>
          <label className="text-[12px] text-slate-500">ทรง / ประเภท
            <input value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="tote bag" className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800" />
          </label>
          <label className="text-[12px] text-slate-500 sm:col-span-2">รายละเอียด
            <input value={f.description} onChange={(e) => set({ description: e.target.value })} className="mt-1 w-full h-9 px-2 border border-slate-200 rounded-lg text-sm text-slate-800" />
          </label>
        </div>
        <p className="text-[11px] text-slate-400 -mt-2">ทรง/ประเภท เขียนเป็นภาษาอังกฤษจะดีที่สุด (เช่น tote bag, crossbody bag) — ระบบใช้คำนี้ใน prompt ให้ GPT</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {imgBox(f.image_key, "photo", "รูปจริง *", "กดเพื่ออัปโหลดรูปถ่ายกระเป๋า (พื้นขาวจะดีที่สุด)")}
          {imgBox(f.vector_image_key, "vector", "รูปลายเส้น / Vector (ไม่บังคับ)", "กดเพื่ออัปโหลดรูปลายเส้นมุมเดียวกัน — สลับดูกับรูปจริงได้")}
        </div>
        <div>
          <div className="text-[12px] text-slate-500 mb-1">ขนาดตั้งต้นของสูตรใหม่ (ซม.)</div>
          <div className="grid grid-cols-4 gap-2">{sizeField("w", "กว้าง")}{sizeField("h", "สูง")}{sizeField("d", "หนา")}{sizeField("strap", "สายยาว (0 = ไม่มี)")}</div>
        </div>
      </div>
    </ERPModal>
  );
}
