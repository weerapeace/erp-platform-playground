"use client";

/** แท็บ "ข้อมูลทรง" — ชื่อ รหัส ราคาเริ่มต้น วันผลิต มุมที่เปิด ผืนผ้าใบ + เปิดให้ลูกค้าใช้ / สำเนา / ลบ */
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ERPFormField, ERPFormSection, ERPInput, ERPTextarea } from "@/components/form";
import { MoneyInput } from "@/components/money-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import { CONFIG_VIEWS, normCode, validateModel, VIEW_LABEL, type CfgModel, type ConfigData, type ConfigView } from "@/lib/product-configurator";
import { deleteRow, patchRow, runAction } from "./data";

type Form = Pick<CfgModel, "code" | "name_th" | "name_en" | "description" | "size_text" | "base_price" | "lead_days" | "views" | "canvas" | "is_active">;
const KEYS: (keyof Form)[] = ["code", "name_th", "name_en", "description", "size_text", "base_price", "lead_days", "views", "canvas", "is_active"];
const pick = (m: CfgModel): Form => ({ code: m.code, name_th: m.name_th, name_en: m.name_en, description: m.description, size_text: m.size_text, base_price: m.base_price, lead_days: m.lead_days, views: m.views, canvas: m.canvas, is_active: m.is_active });

export function ModelPanel({ data, canEdit, onSaved, onDeleted, onDuplicated }: {
  data: ConfigData; canEdit: boolean; onSaved: () => Promise<void> | void; onDeleted: () => void; onDuplicated: (id: string) => void;
}) {
  const toast = useToast();
  const m = data.model;
  const [form, setForm] = useState<Form>(() => pick(m));
  const [saving, setSaving] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [dup, setDup] = useState<{ code: string; name_th: string; with_images: boolean } | null>(null);
  useEffect(() => { setForm(pick(m)); }, [m]);

  const patch = useMemo(() => {
    const out: Record<string, unknown> = {};
    const before = pick(m);
    for (const k of KEYS) if (JSON.stringify(before[k] ?? null) !== JSON.stringify(form[k] ?? null)) out[k] = form[k];
    return out;
  }, [form, m]);
  const dirty = Object.keys(patch).length > 0;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const layersIn = (v: ConfigView) => data.layers.filter((l) => l.view === v).length;

  const save = async () => {
    const v = validateModel(patch, { partial: true });
    if (!v.ok) { toast.error(v.errors.join(" · ")); return; }
    setSaving(true);
    try { await patchRow("models", m.id, patch); toast.success(patch.is_active === true ? "เปิดทรงนี้ให้ลูกค้าใช้แล้ว" : "บันทึกแล้ว"); await onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const duplicate = async () => {
    if (!dup) return;
    setSaving(true);
    try {
      const r = await runAction({ action: "duplicate", model_id: m.id, code: normCode(dup.code), name_th: dup.name_th, with_images: dup.with_images });
      toast.success("สำเนาทรงแล้ว (ปิดไว้ก่อน)"); setDup(null); if (r.model_id) onDuplicated(r.model_id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สำเนาไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    try { await deleteRow("models", m.id); toast.success(`ลบทรง ${m.name_th} แล้ว (กู้คืนได้จากประวัติ)`); setAskDelete(false); onDeleted(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <ToggleSwitch on={form.is_active} disabled={!canEdit} onChange={(v) => set("is_active", v)} label={form.is_active ? "เปิดให้ลูกค้าออกแบบทรงนี้" : "ปิดอยู่ — ลูกค้ายังไม่เห็น"} />
        <p className="text-xs text-slate-500">หน้าเว็บร้านจะต่อในก้อนถัดไป ตอนนี้เปิดไว้ก็ยังไม่โผล่บนเว็บ</p>
      </div>

      <ERPFormSection title="ข้อมูลทรง" columns={2}>
        <ERPFormField label="ชื่อทรง (ไทย)" required><ERPInput value={form.name_th} disabled={!canEdit} onChange={(e) => set("name_th", e.target.value)} /></ERPFormField>
        <ERPFormField label="ชื่อทรง (อังกฤษ)"><ERPInput value={form.name_en ?? ""} disabled={!canEdit} onChange={(e) => set("name_en", e.target.value || null)} placeholder="Tote" /></ERPFormField>
        <ERPFormField label="รหัสทรง" required hint="ใช้นำหน้าชื่อไฟล์รูปทุกไฟล์ — เปลี่ยนแล้วรูปเดิมยังใช้ได้ แต่ไฟล์ใหม่ต้องตั้งชื่อตามรหัสใหม่">
          <ERPInput value={form.code} disabled={!canEdit} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </ERPFormField>
        <ERPFormField label="ขนาด (โชว์ลูกค้า)"><ERPInput value={form.size_text ?? ""} disabled={!canEdit} onChange={(e) => set("size_text", e.target.value || null)} placeholder="38 × 30 × 14 ซม." /></ERPFormField>
        <ERPFormField label="คำอธิบายสั้น" span={2}><ERPTextarea rows={2} value={form.description ?? ""} disabled={!canEdit} onChange={(e) => set("description", e.target.value || null)} /></ERPFormField>
      </ERPFormSection>

      <ERPFormSection title="ราคาและเวลาผลิต" description="ราคาเริ่มต้น + ราคาเพิ่มของแต่ละตัวเลือก = ราคาที่ลูกค้าเห็น · ใส่ 0 = ขึ้นว่า &quot;สอบถามราคา&quot;" columns={2}>
        <ERPFormField label="ราคาเริ่มต้น (บาท)"><MoneyInput value={form.base_price} disabled={!canEdit} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(raw) => set("base_price", Number(raw) || 0)} /></ERPFormField>
        <ERPFormField label="วันผลิตพื้นฐาน (วันทำการ)"><ERPInput type="number" min={0} value={form.lead_days} disabled={!canEdit} onChange={(e) => set("lead_days", Math.max(0, Number(e.target.value) || 0))} /></ERPFormField>
      </ERPFormSection>

      <ERPFormSection title="มุมที่ลูกค้าดูได้" description="แต่ละมุมต้องถ่ายรูปชุดของตัวเอง — เปิดเฉพาะมุมที่ลูกค้าอยากเห็นจริง">
        <div className="flex flex-wrap gap-2">
          {CONFIG_VIEWS.map((v) => {
            const on = form.views.includes(v);
            return (
              <button key={v} type="button" disabled={!canEdit} onClick={() => set("views", on ? form.views.filter((x) => x !== v) : CONFIG_VIEWS.filter((x) => x === v || form.views.includes(x)))}
                className={`rounded-lg border px-3 py-2 text-sm ${on ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500"} disabled:opacity-60`}>
                {VIEW_LABEL[v].th} <span className="text-xs opacity-70">· {layersIn(v)} ชั้น</span>
              </button>
            );
          })}
        </div>
        {form.views.length === 0 && <p className="text-xs text-red-600">ต้องเปิดอย่างน้อย 1 มุม</p>}
        {data.model.views.some((v) => !form.views.includes(v) && layersIn(v) > 0) && <p className="text-xs text-amber-700">มุมที่ปิดยังเก็บชั้นรูปไว้ เปิดกลับมาได้ภายหลัง</p>}
      </ERPFormSection>

      <ERPFormSection title="ผืนผ้าใบ" description="ทุกรูปของทรงนี้ต้องกว้าง × สูงเท่านี้ (พื้นใส) จึงซ้อนตรงกันโดยไม่ต้องตั้งจุดวาง" columns={2}>
        <ERPFormField label="กว้าง (px)"><ERPInput type="number" value={form.canvas.w} disabled={!canEdit} onChange={(e) => set("canvas", { ...form.canvas, w: Math.round(Number(e.target.value) || 0) })} /></ERPFormField>
        <ERPFormField label="สูง (px)"><ERPInput type="number" value={form.canvas.h} disabled={!canEdit} onChange={(e) => set("canvas", { ...form.canvas, h: Math.round(Number(e.target.value) || 0) })} /></ERPFormField>
      </ERPFormSection>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setDup({ code: `${m.code}-2`, name_th: `${m.name_th} (สำเนา)`, with_images: true })} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">สำเนาทรงนี้</button>
            <button type="button" onClick={() => setAskDelete(true)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">ลบทรง</button>
          </div>
          <div className="flex gap-2">
            {dirty && <button type="button" onClick={() => setForm(pick(m))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ยกเลิกที่แก้</button>}
            <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </div>
      )}

      <ConfirmDialog open={askDelete} onClose={() => setAskDelete(false)} onConfirm={() => void remove()} variant="danger" confirmText="ลบทรง"
        title={`ลบทรง ${m.name_th}?`} requireTyped={m.code}
        message={`ช่องตัวเลือก ${data.slots.length} ช่อง · ชั้นรูป ${data.layers.length} ชั้น · รูป ${data.images.length} ไฟล์ จะหายจากสตูดิโอ (ข้อมูลยังเก็บไว้ กู้คืนได้จากผู้ดูแลระบบ) — พิมพ์รหัสทรง ${m.code} เพื่อยืนยัน`} />

      <ERPModal open={!!dup} onClose={() => setDup(null)} title="สำเนาทรงนี้" size="sm"
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setDup(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ยกเลิก</button><button type="button" disabled={saving} onClick={() => void duplicate()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">สำเนา</button></div>}>
        {dup && (
          <div className="grid gap-3">
            <ERPFormField label="ชื่อทรงใหม่"><ERPInput value={dup.name_th} onChange={(e) => setDup({ ...dup, name_th: e.target.value })} /></ERPFormField>
            <ERPFormField label="รหัสทรงใหม่"><ERPInput value={dup.code} onChange={(e) => setDup({ ...dup, code: e.target.value.toUpperCase() })} /></ERPFormField>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dup.with_images} onChange={(e) => setDup({ ...dup, with_images: e.target.checked })} /> คัดลอกรูปที่อัปโหลดแล้วไปด้วย</label>
            <p className="text-xs text-slate-500">คัดลอกช่องตัวเลือก ราคา ชั้นรูป และกติกาครบชุด · ทรงใหม่ปิดไว้ก่อน</p>
          </div>
        )}
      </ERPModal>
    </div>
  );
}
