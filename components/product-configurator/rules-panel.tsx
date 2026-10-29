"use client";

/** แท็บ "กติกา" — ถ้าเลือก A ในช่อง X → ช่อง Y "เลือกไม่ได้" หรือ "เลือกได้เฉพาะ" ตัวที่ติ๊ก + เหตุผลที่ลูกค้าเห็น */
import { useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect } from "@/components/form";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { activeSlots, optionsOf, RULE_KIND_LABEL, RULE_KINDS, validateRule, type CfgRule, type ConfigData, type RuleKind } from "@/lib/product-configurator";
import { createRow, deleteRow, patchRow } from "./data";

type RuleForm = Partial<CfgRule> & { kind: RuleKind; if_slot: string; if_options: string[]; then_slot: string; then_options: string[] };

function Picks({ data, slot, value, onChange }: { data: ConfigData; slot: string; value: string[]; onChange: (v: string[]) => void }) {
  const opts = optionsOf(data, data.slots.find((s) => s.code === slot));
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map((o) => {
        const on = value.includes(o.code);
        return <button key={o.id} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o.code) : [...value, o.code])} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}>{o.name_th}</button>;
      })}
      {opts.length === 0 && <span className="text-xs text-slate-400">ช่องนี้ยังไม่มีตัวเลือก</span>}
    </div>
  );
}

export function RulesPanel({ data, canEdit, onChanged }: { data: ConfigData; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const slots = activeSlots(data).filter((s) => s.kind !== "text");
  const [edit, setEdit] = useState<RuleForm | null>(null);
  const [del, setDel] = useState<CfgRule | null>(null);
  const [busy, setBusy] = useState(false);
  const slotName = (c: string) => data.slots.find((s) => s.code === c)?.name_th ?? c;
  const optNames = (slot: string, codes: string[]) => codes.map((c) => optionsOf(data, data.slots.find((s) => s.code === slot)).find((o) => o.code === c)?.name_th ?? c).join(" / ");

  const save = async () => {
    if (!edit) return;
    const body = { kind: edit.kind, if_slot: edit.if_slot, if_options: edit.if_options, then_slot: edit.then_slot, then_options: edit.then_options, reason_th: edit.reason_th?.trim() || null };
    const v = validateRule(body);
    if (!v.ok) { toast.error(v.errors.join(" · ")); return; }
    setBusy(true);
    try {
      if (edit.id) await patchRow("rules", edit.id, body);
      else await createRow("rules", { ...body, model_id: data.model.id, sort_order: (data.rules.length + 1) * 10 });
      toast.success("บันทึกกติกาแล้ว"); setEdit(null); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const toggle = async (r: CfgRule, v: boolean) => { try { await patchRow("rules", r.id, { is_active: v }); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } };
  const remove = async () => {
    if (!del) return;
    try { await deleteRow("rules", del.id, true); toast.success("ลบกติกาแล้ว"); setDel(null); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">กติกาทำให้ปุ่มที่ใช้ไม่ได้เป็นสีจาง พร้อมเหตุผล · ถ้าลูกค้าเปลี่ยนแล้วตัวเดิมใช้ไม่ได้ ระบบเปลี่ยนให้เองและแจ้งลูกค้า</p>
        {canEdit && slots.length >= 2 && <button type="button" onClick={() => setEdit({ kind: "block", if_slot: slots[0].code, if_options: [], then_slot: slots[1].code, then_options: [] })} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white"><Icon name="add" /> เพิ่มกติกา</button>}
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {data.rules.map((r) => (
          <div key={r.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${r.is_active ? "" : "opacity-50"}`}>
            <div className="min-w-0 flex-1">
              <div>ถ้าเลือก <b>{slotName(r.if_slot)}</b>{r.if_options.length ? <> = <b>{optNames(r.if_slot, r.if_options)}</b></> : " (อะไรก็ได้)"} → <b>{slotName(r.then_slot)}</b> {RULE_KIND_LABEL[r.kind]} <b>{optNames(r.then_slot, r.then_options)}</b></div>
              {r.reason_th && <div className="text-xs text-slate-500">ลูกค้าเห็น: {r.reason_th}</div>}
            </div>
            {canEdit && <ToggleSwitch size="sm" on={r.is_active} onChange={(v) => void toggle(r, v)} title={r.is_active ? "ปิดกติกานี้" : "เปิดกติกานี้"} />}
            {canEdit && <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setEdit({ ...r })} aria-label="แก้กติกา"><Icon name="edit" /></button>}
            {canEdit && <button type="button" className="text-slate-300 hover:text-red-600" onClick={() => setDel(r)} aria-label="ลบกติกา"><Icon name="delete" /></button>}
          </div>
        ))}
        {data.rules.length === 0 && <p className="p-4 text-center text-sm text-slate-500">ยังไม่มีกติกา — ทุกตัวเลือกจับคู่กันได้หมด</p>}
      </div>

      <ERPModal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "แก้กติกา" : "เพิ่มกติกา"} size="lg"
        footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ยกเลิก</button><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">บันทึก</button></div>}>
        {edit && (
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3">
              <ERPFormField label="ถ้าลูกค้าเลือกในช่อง">
                <ERPSelect value={edit.if_slot} onChange={(e) => setEdit({ ...edit, if_slot: e.target.value, if_options: [], then_slot: edit.then_slot === e.target.value ? slots.find((s) => s.code !== e.target.value)?.code ?? "" : edit.then_slot })} options={slots.map((s) => ({ value: s.code, label: s.name_th }))} />
              </ERPFormField>
              <Picks data={data} slot={edit.if_slot} value={edit.if_options} onChange={(v) => setEdit({ ...edit, if_options: v })} />
              <p className="text-xs text-slate-500">ไม่ติ๊กเลย = เลือกอะไรก็ได้ในช่องนี้</p>
            </div>
            <div className="grid gap-2 rounded-lg bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <ERPFormField label="ช่องที่ได้รับผล"><ERPSelect value={edit.then_slot} onChange={(e) => setEdit({ ...edit, then_slot: e.target.value, then_options: [] })} options={slots.filter((s) => s.code !== edit.if_slot).map((s) => ({ value: s.code, label: s.name_th }))} /></ERPFormField>
                <ERPFormField label="ผล"><ERPSelect value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as RuleKind })} options={RULE_KINDS.map((k) => ({ value: k, label: RULE_KIND_LABEL[k] }))} /></ERPFormField>
              </div>
              <Picks data={data} slot={edit.then_slot} value={edit.then_options} onChange={(v) => setEdit({ ...edit, then_options: v })} />
            </div>
            <ERPFormField label="เหตุผลที่ลูกค้าเห็น" hint="เช่น หนังกลับมี 5 สี · สายโซ่รับน้ำหนักทรงนี้ไม่ไหว"><ERPInput value={edit.reason_th ?? ""} onChange={(e) => setEdit({ ...edit, reason_th: e.target.value })} /></ERPFormField>
          </div>
        )}
      </ERPModal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => void remove()} variant="danger" confirmText="ลบกติกา" title="ลบกติกานี้?" message="ตัวเลือกที่กติกานี้ห้ามไว้จะกลับมาเลือกได้" />
    </div>
  );
}
