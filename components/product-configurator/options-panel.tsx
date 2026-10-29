"use client";

/**
 * แท็บ "ตัวเลือก" — ช่อง (คำถามทีละขั้น) + ตัวเลือกในช่อง + ราคาเพิ่ม/วันผลิตเพิ่ม/สีตัวอย่าง
 * ลากจัดลำดับได้ทั้งช่องและตัวเลือก (= ลำดับที่ลูกค้าเห็น) · ลบช่อง = ลบตัวเลือกในช่องด้วย (ยืนยันก่อน)
 */
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect, ERPTextarea } from "@/components/form";
import { MoneyInput } from "@/components/money-input";
import { ColorInput } from "@/components/color-picker";
import { ToggleSwitch } from "@/components/toggle-switch";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { Icon } from "@/components/icon";
import {
  CONFIG_VIEWS, normCode, SLOT_KIND_LABEL, SLOT_KINDS, TEXT_STYLE_LABEL, TEXT_STYLES, validateOption, validateSlot, VIEW_LABEL,
  type CfgOption, type CfgSlot, type ConfigData, type SlotKind, type TextStyle,
} from "@/lib/product-configurator";
import { createRow, deleteRow, money, patchRow, runAction } from "./data";

const btn = "rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50";
const footer = (onCancel: () => void, onSave: () => void, busy: boolean, label = "บันทึก") => (
  <div className="flex justify-end gap-2">
    <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ยกเลิก</button>
    <button type="button" disabled={busy} onClick={onSave} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">{busy ? "กำลังบันทึก…" : label}</button>
  </div>
);

/** ใครอ้างถึงรหัสช่องนี้บ้าง (เตือนก่อนลบ/เปลี่ยนรหัส) */
function usageOf(d: ConfigData, code: string) {
  const layers = d.layers.filter((l) => l.depends_on.includes(code) || l.recolor_slot === code || l.text_slot === code || l.show_when.some((c) => c.slot === code) || l.config?.text?.style_slot === code);
  const rules = d.rules.filter((r) => r.if_slot === code || r.then_slot === code);
  return { layers, rules };
}

type SlotForm = Partial<CfgSlot> & { code: string; name_th: string; kind: SlotKind };
function SlotEditor({ data, slot, onClose, onSaved }: { data: ConfigData; slot: SlotForm | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<SlotForm | null>(slot);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(slot), [slot]);
  if (!f) return null;
  const isNew = !f.id;
  const set = (patch: Partial<SlotForm>) => setF({ ...f, ...patch });
  const cfg = (f.config ?? {}) as Record<string, unknown>;
  const save = async () => {
    const body: Record<string, unknown> = { code: normCode(f.code), name_th: f.name_th, name_en: f.name_en ?? null, help_th: f.help_th ?? null, kind: f.kind, required: f.kind === "single" ? f.required !== false : false, step_view: f.step_view ?? null, config: f.config ?? {} };
    const v = validateSlot(body);
    if (!v.ok) { toast.error(v.errors.join(" · ")); return; }
    if (!isNew && slot?.code && body.code !== slot.code && (usageOf(data, slot.code).layers.length || usageOf(data, slot.code).rules.length)) {
      toast.warning("เปลี่ยนรหัสช่องแล้ว ชั้นรูป/กติกาที่อ้างรหัสเดิมต้องแก้ตามด้วย");
    }
    setBusy(true);
    try {
      if (isNew) await createRow("slots", { ...body, model_id: data.model.id, sort_order: (data.slots.length + 1) * 10 });
      else await patchRow("slots", f.id!, body);
      toast.success(isNew ? "เพิ่มช่องแล้ว — เพิ่มตัวเลือกต่อได้เลย" : "บันทึกช่องแล้ว");
      onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={isNew ? "เพิ่มช่องตัวเลือก" : `แก้ช่อง ${slot?.name_th}`} size="md" footer={footer(onClose, () => void save(), busy)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ERPFormField label="ชื่อช่อง (ที่ลูกค้าเห็น)" required><ERPInput value={f.name_th} onChange={(e) => set({ name_th: e.target.value })} placeholder="เช่น สีโลหะ" /></ERPFormField>
        <ERPFormField label="รหัสช่อง" required hint="ใช้ในชื่อไฟล์รูปและกติกา เช่น METAL"><ERPInput value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></ERPFormField>
        <ERPFormField label="ชนิด">
          <ERPSelect value={f.kind} onChange={(e) => set({ kind: e.target.value as SlotKind })} options={SLOT_KINDS.map((k) => ({ value: k, label: SLOT_KIND_LABEL[k] }))} />
        </ERPFormField>
        <ERPFormField label="มุมที่โชว์ตอนลูกค้าอยู่ขั้นนี้">
          <ERPSelect value={f.step_view ?? ""} onChange={(e) => set({ step_view: (e.target.value || null) as CfgSlot["step_view"] })} placeholder="— ไม่เปลี่ยนมุม —" options={CONFIG_VIEWS.filter((v) => data.model.views.includes(v)).map((v) => ({ value: v, label: VIEW_LABEL[v].th }))} />
        </ERPFormField>
        <ERPFormField label="คำอธิบายใต้หัวข้อ" span={2}><ERPTextarea rows={2} value={f.help_th ?? ""} onChange={(e) => set({ help_th: e.target.value || null })} /></ERPFormField>
        {f.kind === "single" && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.required !== false} onChange={(e) => set({ required: e.target.checked })} /> ต้องเลือก (ไม่เลือก = ไม่ได้)</label>}
        {f.kind === "text" && (
          <>
            <ERPFormField label="พิมพ์ได้สูงสุด (ตัว)"><ERPInput type="number" min={1} max={40} value={Number(cfg.max_chars) || 10} onChange={(e) => set({ config: { ...cfg, max_chars: Number(e.target.value) || 10 } })} /></ERPFormField>
            <ERPFormField label="ตัวอักษรที่ปั๊มได้">
              <ERPSelect value={String(cfg.charset ?? "latin")} onChange={(e) => set({ config: { ...cfg, charset: e.target.value as "latin" | "latin_thai" } })} options={[{ value: "latin", label: "อังกฤษ ตัวเลข . & '" }, { value: "latin_thai", label: "อังกฤษ + ไทย" }]} />
            </ERPFormField>
            <ERPFormField label="ข้อความตัวอย่างในช่อง"><ERPInput value={String(cfg.placeholder ?? "")} onChange={(e) => set({ config: { ...cfg, placeholder: e.target.value } })} placeholder="เช่น P.K" /></ERPFormField>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.auto_upper !== false} onChange={(e) => set({ config: { ...cfg, auto_upper: e.target.checked } })} /> เปลี่ยนเป็นตัวใหญ่อัตโนมัติ</label>
          </>
        )}
      </div>
    </ERPModal>
  );
}

type OptForm = Partial<CfgOption> & { slot_id: string; code: string; name_th: string };
function OptionEditor({ data, opt, onClose, onSaved }: { data: ConfigData; opt: OptForm | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<OptForm | null>(opt);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(opt), [opt]);
  if (!f) return null;
  const isNew = !f.id;
  const slot = data.slots.find((s) => s.id === f.slot_id);
  const usedForText = data.layers.some((l) => l.config?.text?.style_slot === slot?.code);
  const set = (patch: Partial<OptForm>) => setF({ ...f, ...patch });
  const save = async () => {
    const body: Record<string, unknown> = {
      code: normCode(f.code), name_th: f.name_th, name_en: f.name_en ?? null, note_th: f.note_th ?? null,
      price_delta: Number(f.price_delta) || 0, lead_days: Number(f.lead_days) || 0, swatch_hex: f.swatch_hex || null, attrs: f.attrs ?? {}, is_default: !!f.is_default,
    };
    const v = validateOption(body);
    if (!v.ok) { toast.error(v.errors.join(" · ")); return; }
    setBusy(true);
    try {
      // ค่าเริ่มต้นมีได้ตัวเดียวต่อช่อง → ปลดตัวเดิมก่อน
      if (body.is_default && slot?.kind === "single") {
        for (const o of data.options.filter((x) => x.slot_id === f.slot_id && x.is_default && x.id !== f.id)) await patchRow("options", o.id, { is_default: false });
      }
      if (isNew) await createRow("options", { ...body, model_id: data.model.id, slot_id: f.slot_id, sort_order: (data.options.filter((o) => o.slot_id === f.slot_id).length + 1) * 10 });
      else await patchRow("options", f.id!, body);
      toast.success(isNew ? "เพิ่มตัวเลือกแล้ว" : "บันทึกตัวเลือกแล้ว");
      onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  return (
    <ERPModal open onClose={onClose} title={isNew ? `เพิ่มตัวเลือกใน "${slot?.name_th ?? ""}"` : `แก้ตัวเลือก ${opt?.name_th}`} size="md" footer={footer(onClose, () => void save(), busy)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ERPFormField label="ชื่อตัวเลือก (ที่ลูกค้าเห็น)" required><ERPInput value={f.name_th} onChange={(e) => set({ name_th: e.target.value })} placeholder="เช่น หนังวัวลายเม็ด" /></ERPFormField>
        <ERPFormField label="รหัสตัวเลือก" required hint="ใช้ในชื่อไฟล์รูป เช่น PEBBLE"><ERPInput value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></ERPFormField>
        <ERPFormField label="ราคาเพิ่ม (บาท)"><MoneyInput value={f.price_delta ?? 0} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(raw) => set({ price_delta: Number(raw) || 0 })} /></ERPFormField>
        <ERPFormField label="วันผลิตเพิ่ม"><ERPInput type="number" min={0} value={f.lead_days ?? 0} onChange={(e) => set({ lead_days: Math.max(0, Number(e.target.value) || 0) })} /></ERPFormField>
        <ERPFormField label="สีตัวอย่าง" hint="ใช้วาดจุดสีให้ลูกค้าเลือก และใช้ลงสีรูปกลาง (ชั้นที่ตั้งลงสี)">
          <div className="flex items-center gap-2"><ColorInput value={f.swatch_hex ?? ""} onChange={(hex) => set({ swatch_hex: hex || null })} />{f.swatch_hex && <button type="button" className="text-xs text-slate-500 underline" onClick={() => set({ swatch_hex: null })}>ไม่ใช้สี</button>}</div>
        </ERPFormField>
        {usedForText && (
          <ERPFormField label="หน้าตาตัวอักษรปั๊ม">
            <ERPSelect value={String(f.attrs?.text_style ?? "deboss")} onChange={(e) => set({ attrs: { ...(f.attrs ?? {}), text_style: e.target.value as TextStyle } })} options={TEXT_STYLES.map((s) => ({ value: s, label: TEXT_STYLE_LABEL[s] }))} />
          </ERPFormField>
        )}
        <ERPFormField label="คำอธิบายสั้น" span={2}><ERPInput value={f.note_th ?? ""} onChange={(e) => set({ note_th: e.target.value || null })} placeholder="เช่น ทนรอยขีดข่วน ใช้ได้ทุกวัน" /></ERPFormField>
        {slot?.kind === "single" && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!f.is_default} onChange={(e) => set({ is_default: e.target.checked })} /> เป็นตัวเลือกเริ่มต้น (ลูกค้าเปิดมาเห็นตัวนี้ก่อน)</label>}
      </div>
    </ERPModal>
  );
}

function SlotCard({ data, slot, canEdit, onEdit, onEditOption, onAddOption, onDelete, onDeleteOption, onChanged, dragHandle }: {
  data: ConfigData; slot: CfgSlot; canEdit: boolean; onEdit: () => void; onEditOption: (o: CfgOption) => void; onAddOption: () => void;
  onDelete: () => void; onDeleteOption: (o: CfgOption) => void; onChanged: () => void; dragHandle?: Record<string, unknown>;
}) {
  const toast = useToast();
  const opts = data.options.filter((o) => o.slot_id === slot.id).sort((a, b) => a.sort_order - b.sort_order);
  const [order, setOrder] = useState(opts);
  useEffect(() => setOrder(opts), [data.options]); // eslint-disable-line react-hooks/exhaustive-deps
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => {
    const next = moveItem(order, from, to);
    setOrder(next);
    runAction({ action: "reorder", kind: "options", scope_id: slot.id, ids: next.map((o) => o.id) }).then(onChanged).catch((e) => { toast.error(e instanceof Error ? e.message : "จัดลำดับไม่สำเร็จ"); setOrder(opts); });
  }, { group: `opt-${slot.id}` });
  const toggle = async (patch: Record<string, unknown>, id: string, kind: "slots" | "options") => {
    try { await patchRow(kind, id, patch); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  return (
    <div className={`rounded-xl border ${slot.is_active ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"} bg-white`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        {canEdit && dragHandle && <DragHandle {...dragHandle} />}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800">{slot.name_th} <span className="font-mono text-xs text-slate-400">{slot.code}</span></div>
          <div className="text-xs text-slate-500">{SLOT_KIND_LABEL[slot.kind]}{slot.step_view ? ` · โชว์${VIEW_LABEL[slot.step_view].th}` : ""}{slot.kind === "single" && !slot.required ? " · ไม่บังคับ" : ""}</div>
        </div>
        {canEdit && <ToggleSwitch size="sm" on={slot.is_active} onChange={(v) => void toggle({ is_active: v }, slot.id, "slots")} title={slot.is_active ? "ซ่อนช่องนี้จากลูกค้า" : "แสดงช่องนี้"} />}
        {canEdit && <button type="button" className={btn} onClick={onEdit}><Icon name="edit" /> แก้</button>}
        {canEdit && <button type="button" className={`${btn} border-red-200 text-red-600`} onClick={onDelete}><Icon name="delete" /></button>}
      </div>
      {slot.kind === "text" ? (
        <p className="px-3 py-2 text-xs text-slate-500">ลูกค้าพิมพ์เองได้สูงสุด {Number(slot.config?.max_chars) || 10} ตัว · ตำแหน่งและขนาดตั้งที่ชั้นรูปแบบตัวอักษร (แท็บชั้นรูป)</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {order.map((o, i) => (
            <div key={o.id} {...rowProps(i)} className={`flex items-center gap-2 px-3 py-1.5 text-sm ${o.is_active ? "" : "opacity-50"} ${rowCls(i)}`}>
              {canEdit && <DragHandle {...handleProps(i)} />}
              <span className="h-5 w-5 shrink-0 rounded-full border border-slate-200" style={{ background: o.swatch_hex || "transparent" }} />
              <span className="min-w-0 flex-1 truncate">{o.name_th} <span className="font-mono text-[11px] text-slate-400">{o.code}</span>{o.is_default && <span className="ml-1 rounded bg-violet-50 px-1 text-[11px] text-violet-700">เริ่มต้น</span>}</span>
              <span className="w-20 text-right text-xs tabular-nums text-slate-500">{o.price_delta ? `+${money(o.price_delta)}` : "—"}</span>
              <span className="w-16 text-right text-xs tabular-nums text-slate-400">{o.lead_days ? `+${o.lead_days} วัน` : ""}</span>
              {canEdit && <ToggleSwitch size="sm" on={o.is_active} onChange={(v) => void toggle({ is_active: v }, o.id, "options")} title={o.is_active ? "ซ่อนตัวเลือกนี้" : "แสดงตัวเลือกนี้"} />}
              {canEdit && <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => onEditOption(o)} aria-label={`แก้ ${o.name_th}`}><Icon name="edit" /></button>}
              {canEdit && <button type="button" className="text-slate-300 hover:text-red-600" onClick={() => onDeleteOption(o)} aria-label={`ลบ ${o.name_th}`}><Icon name="delete" /></button>}
            </div>
          ))}
          {order.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">ยังไม่มีตัวเลือก</p>}
          {canEdit && <div className="px-3 py-2"><button type="button" className={btn} onClick={onAddOption}><Icon name="add" /> เพิ่มตัวเลือก</button></div>}
        </div>
      )}
    </div>
  );
}

export function OptionsPanel({ data, canEdit, onChanged }: { data: ConfigData; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const slots = [...data.slots].sort((a, b) => a.sort_order - b.sort_order);
  const [order, setOrder] = useState(slots);
  useEffect(() => setOrder([...data.slots].sort((a, b) => a.sort_order - b.sort_order)), [data.slots]);
  const [editSlot, setEditSlot] = useState<SlotForm | null>(null);
  const [editOpt, setEditOpt] = useState<OptForm | null>(null);
  const [delSlot, setDelSlot] = useState<CfgSlot | null>(null);
  const [delOpt, setDelOpt] = useState<CfgOption | null>(null);
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => {
    const next = moveItem(order, from, to);
    setOrder(next);
    runAction({ action: "reorder", kind: "slots", scope_id: data.model.id, ids: next.map((s) => s.id) }).then(onChanged).catch((e) => toast.error(e instanceof Error ? e.message : "จัดลำดับไม่สำเร็จ"));
  }, { group: "slots" });

  const removeSlot = async () => {
    if (!delSlot) return;
    try { await deleteRow("slots", delSlot.id, true); toast.success(`ลบช่อง ${delSlot.name_th} แล้ว`); setDelSlot(null); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const removeOpt = async () => {
    if (!delOpt) return;
    try { await deleteRow("options", delOpt.id); toast.success(`ลบตัวเลือก ${delOpt.name_th} แล้ว`); setDelOpt(null); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  const delUse = delSlot ? usageOf(data, delSlot.code) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">แต่ละช่อง = 1 ขั้นที่ลูกค้าเลือก เรียงตามลำดับนี้ · ลาก ⠿ เพื่อจัดลำดับ</p>
        {canEdit && <button type="button" onClick={() => setEditSlot({ code: "", name_th: "", kind: "single", required: true })} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white"><Icon name="add" /> เพิ่มช่อง</button>}
      </div>
      {order.map((slot, i) => (
        <div key={slot.id} {...rowProps(i)} className={rowCls(i)}>
          <SlotCard data={data} slot={slot} canEdit={canEdit} dragHandle={handleProps(i)} onChanged={onChanged}
            onEdit={() => setEditSlot({ ...slot })} onDelete={() => setDelSlot(slot)}
            onAddOption={() => setEditOpt({ slot_id: slot.id, code: "", name_th: "", price_delta: 0, lead_days: 0 })}
            onEditOption={(o) => setEditOpt({ ...o })} onDeleteOption={setDelOpt} />
        </div>
      ))}
      {order.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">ยังไม่มีช่องตัวเลือก — กด &quot;เพิ่มช่อง&quot; เช่น วัสดุ · สี · ซิป · สาย</div>}

      {editSlot && <SlotEditor data={data} slot={editSlot} onClose={() => setEditSlot(null)} onSaved={onChanged} />}
      {editOpt && <OptionEditor data={data} opt={editOpt} onClose={() => setEditOpt(null)} onSaved={onChanged} />}
      <ConfirmDialog open={!!delSlot} onClose={() => setDelSlot(null)} onConfirm={() => void removeSlot()} variant="danger" confirmText="ลบช่อง" requireTyped={delSlot?.code}
        title={`ลบช่อง ${delSlot?.name_th ?? ""}?`}
        message={<div className="space-y-1 text-sm"><p>ตัวเลือกในช่องนี้ {data.options.filter((o) => o.slot_id === delSlot?.id).length} ตัวจะถูกลบด้วย</p>{delUse && (delUse.layers.length > 0 || delUse.rules.length > 0) && <p className="text-amber-700">มีชั้นรูป {delUse.layers.length} ชั้น และกติกา {delUse.rules.length} ข้อที่อ้างช่องนี้ — ต้องแก้ตามหลังลบ</p>}<p>พิมพ์รหัส {delSlot?.code} เพื่อยืนยัน</p></div>} />
      <ConfirmDialog open={!!delOpt} onClose={() => setDelOpt(null)} onConfirm={() => void removeOpt()} variant="danger" confirmText="ลบตัวเลือก"
        title={`ลบตัวเลือก ${delOpt?.name_th ?? ""}?`} message="ลูกค้าจะเลือกตัวนี้ไม่ได้อีก รูปที่อัปไว้ของตัวเลือกนี้ยังเก็บไว้ (กู้คืนได้ภายหลัง)" />
    </div>
  );
}
