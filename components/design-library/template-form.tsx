"use client";

/**
 * 📚 Design Library — ฟอร์มแม่แบบ (สร้าง/แก้) ใน ERPModal กลาง
 * ประเภทกระเป๋า (รายการ bag_type ใน ⚙️ ตัวเลือก) → รหัสขึ้นเอง HANB-001 (แก้ได้ · ซ้ำ = บันทึกไม่ผ่าน) · ชื่อเติมคำนำให้
 * รูปจริง = ของกลาง MediaUploadField (ลากวาง / Ctrl+V / เลือกไฟล์ / เลือกจากคลัง) · รูปลายเส้นตั้งทีหลังจากหน้าสูตร (prompt ลายเส้น)
 * ขนาด + หูกระเป๋า ตั้งต้นของสูตรใหม่ (ไม่บังคับ · ว่าง = ใส่ตอนทำสูตร · รอบ 6) · สลับ ซม./นิ้ว (จำต่อคน) · สิทธิ์ design_library.manage
 * หน้าตา (รอบ 6): รูปจริงซ้าย · ข้อมูลขวา · ขนาด/หูเป็นการ์ดแยก ป้าย "ไม่บังคับ"
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { MediaUploadField } from "@/components/media-upload-field";
import { bagTypeOf, cleanHandle, cleanSize, DEFAULT_HANDLE, DEFAULT_SIZE, HANDLE_UNSET, handleCountText, nextTemplateCode, type Choice, type Handle, type Size } from "@/lib/design-library";
import { api, img, type Template } from "./shared";
import { LenInput, UnitToggle, useLenUnit } from "./units";

function readSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => resolve({ w: 0, h: 0 });
    im.src = url;
  });
}

type Form = { type: string; code: string; name: string; description: string; image_key: string | null; image_w: number | null; image_h: number | null; size: Size; handle: Handle };
const blank: Form = { type: "", code: "", name: "", description: "", image_key: null, image_w: null, image_h: null, size: DEFAULT_SIZE, handle: DEFAULT_HANDLE };

export function TemplateFormModal({ open, initial, onClose, onSaved }: {
  open: boolean; initial: Template | null; onClose: () => void; onSaved: (t: Template) => void;
}) {
  const toast = useToast();
  const unit = useLenUnit();
  const [f, setF] = useState<Form>(blank);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [types, setTypes] = useState<Choice[] | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [touched, setTouched] = useState({ code: false, name: false });

  useEffect(() => {
    if (!open) return;
    setErrors([]); setDirty(false); setTouched({ code: !!initial, name: !!initial });
    Promise.all([
      api<Choice[]>(`/api/design-library/choices?list_key=bag_type&limit=500`),
      api<{ code: string }[]>(`/api/design-library/templates?include_inactive=true&limit=5000`),
    ]).then(([t, rows]) => { setTypes(t); setCodes(rows.map((r) => r.code)); }).catch(() => { setTypes([]); setCodes([]); });
    setF(initial ? {
      type: initial.category ?? "", code: initial.code, name: initial.name, description: initial.description ?? "",
      image_key: initial.image_key, image_w: initial.image_w, image_h: initial.image_h,
      size: cleanSize(initial.default_spec?.size), handle: cleanHandle(initial.default_spec?.handle),
    } : blank);
  }, [open, initial]);

  const set = (patch: Partial<Form>) => { setF((p) => ({ ...p, ...patch })); setDirty(true); };
  const pickType = (code: string) => {
    const t = (types ?? []).find((x) => x.code === code);
    const patch: Partial<Form> = { type: code };
    if (t && !touched.code) patch.code = nextTemplateCode(t.code, codes);
    if (t && !touched.name) patch.name = `${t.name} `;
    set(patch);
  };

  const save = async () => {
    const e: string[] = [];
    if (!f.type && (types ?? []).length) e.push("เลือกประเภทกระเป๋า");
    if (!f.code.trim()) e.push("ใส่รหัสแม่แบบ");
    else if (!/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(f.code.trim().toUpperCase())) e.push("รหัสใช้ได้เฉพาะตัวอังกฤษ ตัวเลข และ - (เช่น HANB-001)");
    else if (codes.some((c) => c.toUpperCase() === f.code.trim().toUpperCase()) && f.code.trim().toUpperCase() !== initial?.code) e.push(`รหัส ${f.code.trim().toUpperCase()} มีแม่แบบใช้แล้ว — เปลี่ยนเลขใหม่`);
    if (!f.name.trim()) e.push("ใส่ชื่อแม่แบบ");
    if (!f.image_key) e.push("ใส่รูปจริงของแม่แบบ");
    setErrors(e);
    if (e.length) return;
    setBusy(true);
    try {
      const payload = {
        code: f.code.trim().toUpperCase(), name: f.name.trim(), category: f.type || null, description: f.description.trim() || null,
        image_key: f.image_key, image_w: f.image_w, image_h: f.image_h,
        default_spec: { ...(initial?.default_spec ?? {}), size: cleanSize(f.size), handle: cleanHandle(f.handle) },
      };
      const row = initial
        ? await api<Template>(`/api/design-library/templates/${initial.id}`, { method: "PATCH", json: payload })
        : await api<Template>(`/api/design-library/templates`, { json: payload });
      toast.success(initial ? "บันทึกแม่แบบแล้ว" : "สร้างแม่แบบแล้ว");
      setDirty(false);
      onSaved(row);
    } catch (err) { setErrors([(err as Error).message]); }
    finally { setBusy(false); }
  };

  const u = unit.unit;
  const lbl = "block text-[12px] font-medium text-slate-600";
  const field = "mt-1 w-full h-9 px-3 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300";
  const lenField = (label: string, v: number, onCm: (cm: number) => void) => (
    <label className={lbl}>{label}<LenInput optional cm={v} unit={u} onChange={onCm} className="mt-1" /></label>
  );
  const oldType = f.type && types && !bagTypeOf(types, f.type) ? f.type : null;   // แม่แบบเก่าที่พิมพ์ทรงเอง

  return (
    <ERPModal open={open} onClose={onClose} title={initial ? `แก้แม่แบบ ${initial.code}` : "เพิ่มแม่แบบกระเป๋า"} size="lg" hasUnsavedChanges={dirty} defaultExpanded={false}
      footer={<div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>}>
      <div className="space-y-4">
        {errors.length > 0 && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[13px] text-rose-700">{errors.map((e) => <div key={e}>{e}</div>)}</div>}

        {/* ── รูปจริง (ซ้าย · รูปเต็มกว้าง ปุ่มใต้รูป) + ข้อมูลแม่แบบ (ขวา) ── */}
        <div className="grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)]">
          <MediaUploadField layout="stack" label="รูปจริง *" hint="พื้นขาวดีที่สุด · รูปลายเส้นตั้งทีหลังได้จากหน้าสูตร" allowVideo={false} folder="design-library" previewRatio="1 / 1"
            value={f.image_key ? { kind: "image", key: f.image_key } : null}
            onChange={async (m) => {
              if (!m) { set({ image_key: null, image_w: null, image_h: null }); return; }
              const s = await readSize(img(m.key, 0));
              set({ image_key: m.key, image_w: s.w || null, image_h: s.h || null });
            }} />
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
              <label className={lbl}>ประเภทกระเป๋า <span className="text-rose-500">*</span>
                <select value={f.type} onChange={(e) => pickType(e.target.value)} className={`${field} bg-white`}>
                  <option value="">{types === null ? "กำลังโหลด…" : "— เลือกประเภท —"}</option>
                  {oldType && <option value={oldType}>{oldType} (เดิม)</option>}
                  {(types ?? []).map((t) => <option key={t.id} value={t.code}>{t.name}{t.name_en ? ` · ${t.name_en}` : ""}</option>)}
                </select>
                {types && types.length === 0 && <span className="block mt-1 text-[11px] text-amber-700">ยังไม่มีประเภท — ผู้ดูแลเพิ่มได้ที่ “ตัวเลือก” → ประเภทกระเป๋า</span>}
              </label>
              <label className={lbl}>รหัส <span className="text-rose-500">*</span>{!touched.code && <span className="ml-1 font-normal text-slate-400">ขึ้นเองตามประเภท</span>}
                <input value={f.code} onChange={(e) => { setTouched((t) => ({ ...t, code: true })); set({ code: e.target.value.toUpperCase() }); }} placeholder="HANB-001"
                  className={`${field} font-mono`} />
              </label>
            </div>
            <label className={lbl}>ชื่อแม่แบบ <span className="text-rose-500">*</span>
              <input value={f.name} onChange={(e) => { setTouched((t) => ({ ...t, name: true })); set({ name: e.target.value }); }} placeholder="กระเป๋าถือทรงถัง"
                className={field} />
            </label>
            <label className={lbl}>รายละเอียด <span className="font-normal text-slate-400">ไม่บังคับ</span>
              <textarea rows={4} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="เช่น ทรงถังปากกว้าง ใช้กับผ้าหนา"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300" />
            </label>
          </div>
        </div>

        {/* ── ขนาด + หู ตั้งต้น (ไม่บังคับ) ── */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-slate-800">ขนาดตั้งต้นของสูตรใหม่</div>
              <div className="text-[11.5px] text-slate-500">ไม่บังคับ — เว้นว่างไว้ แล้วไปใส่ตอนทำสูตรได้</div>
            </div>
            <span className="ml-auto"><UnitToggle unit={u} set={unit.set} /></span>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {lenField("กว้าง", f.size.w, (v) => set({ size: { ...f.size, w: v } }))}
              {lenField("สูง", f.size.h, (v) => set({ size: { ...f.size, h: v } }))}
              {lenField("หนา", f.size.d, (v) => set({ size: { ...f.size, d: v } }))}
              {lenField("สายยาว", f.size.strap, (v) => set({ size: { ...f.size, strap: v } }))}
            </div>
            <div className="border-t border-slate-100 pt-4"><HandleFields handle={f.handle} unit={u} onChange={(h) => set({ handle: h })} /></div>
          </div>
        </div>
      </div>
    </ERPModal>
  );
}

/** ช่องหูกระเป๋า (ใช้ทั้งฟอร์มแม่แบบ + หน้าสูตร) · ยังไม่ระบุ / ไม่มีหู = ซ่อนช่องขนาดหู · ทุกช่องไม่บังคับ */
export function HandleFields({ handle: h, unit, onChange, disabled }: { handle: Handle; unit: "cm" | "in"; onChange: (h: Handle) => void; disabled?: boolean }) {
  const f = (label: string, k: "drop" | "w" | "gap" | "total") => (
    <label className="block text-[12px] font-medium text-slate-600">{label}<LenInput optional cm={h[k]} unit={unit} disabled={disabled} onChange={(v) => onChange({ ...h, [k]: v })} className="mt-1" /></label>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[13.5px] font-medium text-slate-800 mr-1">หูกระเป๋า</span>
        <span className="flex flex-wrap gap-1">{[HANDLE_UNSET, 0, 1, 2].map((n) => (
          <button key={n} type="button" disabled={disabled} onClick={() => onChange({ ...h, count: n })}
            className={`h-7 px-2.5 text-[12px] rounded-full border ${h.count === n ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 bg-white"}`}>{handleCountText(n)}</button>
        ))}</span>
        {h.count > 0 && <span className="text-[11px] text-slate-400">ช่องว่าง = ไม่ระบุ · ความยาวรวมว่าง = ระบบประมาณให้</span>}
      </div>
      {h.count > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          {f("ความสูงหู", "drop")}{f("ความกว้างหู", "w")}{f("ระยะห่างโคนหู", "gap")}{f("ความยาวรวม", "total")}
        </div>
      )}
    </div>
  );
}
