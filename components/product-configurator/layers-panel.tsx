"use client";

/**
 * แท็บ "ชั้นรูป" — ชั้นของแต่ละมุม เรียงล่าง→บน (ลากจัดลำดับ) · ตั้งว่า "เปลี่ยนตาม" ช่องไหน / โชว์เมื่อไร / ลงสีจากรูปกลาง / ชั้นตัวอักษร
 * แต่ละชั้นบอกว่ามีรูปครบกี่คอมโบ · ชี้ที่แถว = พรีวิวทางซ้ายโชว์เฉพาะชั้นนั้น · อัปโหลดหลายรูปจับคู่จากชื่อไฟล์
 */
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { ERPFormField, ERPInput, ERPSelect } from "@/components/form";
import { ToggleSwitch } from "@/components/toggle-switch";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import {
  activeSlots, imageFileName, layerCombos, normCode, optionsOf, validateLayer, VIEW_LABEL,
  type CfgLayer, type Condition, type ConfigData, type ConfigView,
} from "@/lib/product-configurator";
import { createRow, deleteRow, patchRow, runAction } from "./data";
import { BulkUploadModal } from "./bulk-upload";

const btn = "rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50";
const chip = "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600";

type LayerForm = Partial<CfgLayer> & { view: ConfigView; code: string; name_th: string };

function LayerEditor({ data, layer, onClose, onSaved }: { data: ConfigData; layer: LayerForm; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<LayerForm>(layer);
  const [busy, setBusy] = useState(false);
  const isNew = !f.id;
  const slots = activeSlots(data);
  const choice = slots.filter((s) => s.kind !== "text");
  const singles = slots.filter((s) => s.kind === "single");
  const texts = slots.filter((s) => s.kind === "text");
  const set = (p: Partial<LayerForm>) => setF((cur) => ({ ...cur, ...p }));
  const deps = f.depends_on ?? [];
  const conds = f.show_when ?? [];
  const isText = !!f.text_slot;
  const box = f.config?.text ?? { x: 0.5, y: 0.7, size: 0.045, letter_spacing: 0.16 };
  const setBox = (p: Partial<typeof box>) => set({ config: { ...(f.config ?? {}), text: { ...box, ...p } } });
  const combos = useMemo(() => (isText ? 0 : layerCombos(data, { ...(f as CfgLayer), depends_on: deps, is_active: true }).length), [data, f, deps, isText]);

  const save = async () => {
    const body: Record<string, unknown> = {
      view: f.view, code: normCode(f.code), name_th: f.name_th, z_index: f.z_index ?? 100,
      depends_on: isText ? [] : deps, show_when: conds.filter((c) => c.slot), recolor_slot: isText ? null : f.recolor_slot || null,
      text_slot: f.text_slot || null, config: f.config ?? {},
    };
    const v = validateLayer(body);
    if (!v.ok) { toast.error(v.errors.join(" · ")); return; }
    setBusy(true);
    try {
      if (isNew) await createRow("layers", { ...body, model_id: data.model.id });
      else await patchRow("layers", f.id!, body);
      toast.success(isNew ? "เพิ่มชั้นแล้ว" : "บันทึกชั้นแล้ว"); onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={isNew ? `เพิ่มชั้นใน${VIEW_LABEL[f.view].th}` : `แก้ชั้น ${layer.name_th}`} size="lg"
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ยกเลิก</button><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <ERPFormField label="ชื่อชั้น" required><ERPInput value={f.name_th} onChange={(e) => set({ name_th: e.target.value })} placeholder="เช่น ตัวกระเป๋า" /></ERPFormField>
          <ERPFormField label="รหัสชั้น (ในชื่อไฟล์)" required><ERPInput value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="BODY" /></ERPFormField>
          <ERPFormField label="ชนิด">
            <ERPSelect value={isText ? "text" : "image"} onChange={(e) => set({ text_slot: e.target.value === "text" ? texts[0]?.code ?? "" : null })}
              options={[{ value: "image", label: "รูปถ่าย" }, ...(texts.length ? [{ value: "text", label: "ตัวอักษรพิมพ์สด" }] : [])]} />
          </ERPFormField>
        </div>

        {!isText && (
          <>
            <ERPFormField label="รูปเปลี่ยนตามช่องไหน" hint={deps.length ? `ต้องถ่าย ${combos.toLocaleString("th-TH")} รูป · ชื่อไฟล์ ${imageFileName(data.model.code, f.view, normCode(f.code) || "ชั้น", deps.join("_"))}` : "ไม่เลือก = ใช้รูปเดียวทุกแบบ (เช่น เงาพื้น)"}>
              <div className="flex flex-wrap gap-1.5">
                {choice.filter((s) => s.kind === "single").map((s) => {
                  const on = deps.includes(s.code);
                  return <button key={s.id} type="button" disabled={f.recolor_slot === s.code} onClick={() => set({ depends_on: on ? deps.filter((x) => x !== s.code) : [...deps, s.code] })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-600"} disabled:opacity-40`}>{on ? `${deps.indexOf(s.code) + 1}. ` : ""}{s.name_th}</button>;
                })}
              </div>
            </ERPFormField>
            <ERPFormField label="ลงสีจากรูปกลาง (แทนการถ่ายทุกสี)" hint="ถ่ายสีกลาง (เทาอ่อน) รูปเดียว ระบบลงสีตามสีตัวอย่างของตัวเลือก · ลายพิเศษ เช่น จระเข้ ควรถ่ายจริง">
              <ERPSelect value={f.recolor_slot ?? ""} onChange={(e) => set({ recolor_slot: e.target.value || null, depends_on: deps.filter((x) => x !== e.target.value) })} placeholder="— ไม่ลงสี (ถ่ายจริงทุกสี) —"
                options={singles.filter((s) => optionsOf(data, s).some((o) => o.swatch_hex)).map((s) => ({ value: s.code, label: `ลงสีตาม "${s.name_th}"` }))} />
            </ERPFormField>
          </>
        )}

        {isText && (
          <div className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
            <ERPFormField label="ข้อความจากช่อง"><ERPSelect value={f.text_slot ?? ""} onChange={(e) => set({ text_slot: e.target.value })} options={texts.map((s) => ({ value: s.code, label: s.name_th }))} /></ERPFormField>
            <ERPFormField label="แบบการปั๊มจากช่อง"><ERPSelect value={box.style_slot ?? ""} onChange={(e) => setBox({ style_slot: e.target.value || undefined })} placeholder="— ปั๊มจมเสมอ —" options={singles.map((s) => ({ value: s.code, label: s.name_th }))} /></ERPFormField>
            <div />
            <ERPFormField label="ตำแหน่งแนวนอน (% กว้าง)"><ERPInput type="number" step="0.5" value={Math.round(box.x * 1000) / 10} onChange={(e) => setBox({ x: Number(e.target.value) / 100 })} /></ERPFormField>
            <ERPFormField label="ตำแหน่งแนวตั้ง (% สูง)"><ERPInput type="number" step="0.5" value={Math.round(box.y * 1000) / 10} onChange={(e) => setBox({ y: Number(e.target.value) / 100 })} /></ERPFormField>
            <ERPFormField label="ขนาดตัวอักษร (% กว้าง)"><ERPInput type="number" step="0.1" value={Math.round(box.size * 1000) / 10} onChange={(e) => setBox({ size: Number(e.target.value) / 100 })} /></ERPFormField>
          </div>
        )}

        <ERPFormField label="โชว์ชั้นนี้เมื่อ" hint="ไม่ใส่ = โชว์ตลอด · ใส่หลายข้อ = ต้องตรงทุกข้อ">
          <div className="space-y-2">
            {conds.map((c, i) => {
              const slot = slots.find((s) => s.code === c.slot);
              const opts = optionsOf(data, slot);
              const upd = (p: Partial<Condition>) => set({ show_when: conds.map((x, j) => (j === i ? { ...x, ...p } : x)) });
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
                  <select className="h-8 rounded-lg border border-slate-200 px-2 text-sm" value={c.slot} onChange={(e) => upd({ slot: e.target.value, options: [] })}>
                    {choice.map((s) => <option key={s.id} value={s.code}>{s.name_th}</option>)}
                  </select>
                  <span className="text-xs text-slate-500">เลือก</span>
                  <div className="flex flex-wrap gap-1">
                    {opts.map((o) => {
                      const on = c.options.includes(o.code);
                      return <button key={o.id} type="button" onClick={() => upd({ options: on ? c.options.filter((x) => x !== o.code) : [...c.options, o.code] })} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-violet-400 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`}>{o.name_th}</button>;
                    })}
                  </div>
                  <button type="button" className="ml-auto text-slate-400 hover:text-red-600" onClick={() => set({ show_when: conds.filter((_, j) => j !== i) })} aria-label="ลบเงื่อนไข"><Icon name="delete" /></button>
                </div>
              );
            })}
            {choice.length > 0 && <button type="button" className={btn} onClick={() => set({ show_when: [...conds, { slot: choice[0].code, options: [] }] })}><Icon name="add" /> เพิ่มเงื่อนไข</button>}
          </div>
        </ERPFormField>
      </div>
    </ERPModal>
  );
}

function LayerImages({ data, layer, canEdit, onChanged }: { data: ConfigData; layer: CfgLayer; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const combos = layerCombos(data, layer);
  const imgs = data.images.filter((im) => im.layer_id === layer.id);
  const remove = async (id: string) => {
    try { await deleteRow("images", id, true); toast.success("ลบรูปแล้ว"); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };
  return (
    <div className="grid max-h-80 gap-1 overflow-auto border-t border-slate-100 bg-slate-50/60 p-2 sm:grid-cols-2">
      {combos.map((c) => {
        const im = imgs.find((x) => x.combo_key === c.key);
        return (
          <div key={c.key || "_"} className="flex items-center gap-2 rounded-lg bg-white p-1.5 text-xs">
            {im ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r2ImageUrl(im.image_key, 96)!} alt="" className="h-10 w-10 rounded bg-[conic-gradient(#e2e8f0_25%,#fff_0_50%,#e2e8f0_0_75%,#fff_0)] bg-[length:10px_10px] object-contain" />
            ) : <span className="grid h-10 w-10 place-items-center rounded border border-dashed border-slate-300 text-slate-300"><Icon name="image" /></span>}
            <div className="min-w-0 flex-1">
              <div className="truncate text-slate-700">{c.label}</div>
              <div className="truncate font-mono text-[10px] text-slate-400">{imageFileName(data.model.code, layer.view, layer.code, c.key)}</div>
            </div>
            {im && canEdit && <button type="button" className="text-slate-300 hover:text-red-600" onClick={() => void remove(im.id)} aria-label="ลบรูปนี้"><Icon name="delete" /></button>}
          </div>
        );
      })}
    </div>
  );
}

export function LayersPanel({ data, canEdit, view, onView, onChanged, onFocusLayer }: {
  data: ConfigData; canEdit: boolean; view: ConfigView; onView: (v: ConfigView) => void; onChanged: () => void; onFocusLayer: (id: string | null) => void;
}) {
  const toast = useToast();
  const list = useMemo(() => data.layers.filter((l) => l.view === view).sort((a, b) => a.z_index - b.z_index), [data.layers, view]);
  const [order, setOrder] = useState(list);
  useEffect(() => setOrder(list), [list]);
  const [edit, setEdit] = useState<LayerForm | null>(null);
  const [del, setDel] = useState<CfgLayer | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => {
    const next = moveItem(order, from, to);
    setOrder(next);
    runAction({ action: "reorder", kind: "layers", scope_id: data.model.id, ids: next.map((l) => l.id) }).then(onChanged).catch((e) => toast.error(e instanceof Error ? e.message : "จัดลำดับไม่สำเร็จ"));
  }, { group: `layers-${view}` });

  const slotName = (code: string) => data.slots.find((s) => s.code === code)?.name_th ?? code;
  const optName = (slot: string, code: string) => optionsOf(data, data.slots.find((s) => s.code === slot)).find((o) => o.code === code)?.name_th ?? code;
  const toggle = async (l: CfgLayer, v: boolean) => { try { await patchRow("layers", l.id, { is_active: v }); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); } };
  const remove = async () => {
    if (!del) return;
    try { await deleteRow("layers", del.id, true); toast.success(`ลบชั้น ${del.name_th} แล้ว`); setDel(null); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {data.model.views.map((v) => (
          <button key={v} type="button" onClick={() => onView(v)} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600"}`}>{VIEW_LABEL[v].th} · {data.layers.filter((l) => l.view === v).length}</button>
        ))}
        <div className="ml-auto flex gap-2">
          {canEdit && <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm text-violet-700" onClick={() => setUpload(true)}><Icon name="upload" /> อัปโหลดหลายรูป</button>}
          {canEdit && <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white" onClick={() => setEdit({ view, code: "", name_th: "", z_index: (order.length + 1) * 10, depends_on: [], show_when: [] })}><Icon name="add" /> เพิ่มชั้น</button>}
        </div>
      </div>
      <p className="text-xs text-slate-500">เรียงจากชั้นล่างสุด (บน) ไปชั้นบนสุด (ล่าง) · ลาก ⠿ เพื่อสลับชั้น · ชี้ที่แถวเพื่อดูชั้นนั้นในพรีวิว</p>

      <div className="space-y-2">
        {order.map((l, i) => {
          const combos = l.text_slot ? [] : layerCombos(data, l);
          const have = l.text_slot ? 0 : data.images.filter((im) => im.layer_id === l.id && combos.some((c) => c.key === im.combo_key)).length;
          const full = !l.text_slot && combos.length > 0 && have >= combos.length;
          return (
            <div key={l.id} {...rowProps(i)} onMouseEnter={() => onFocusLayer(l.id)} onMouseLeave={() => onFocusLayer(null)}
              className={`overflow-hidden rounded-xl border ${l.is_active ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"} bg-white ${rowCls(i)}`}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                {canEdit && <DragHandle {...handleProps(i)} />}
                <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{l.name_th} <span className="font-mono text-xs text-slate-400">{l.code}</span></div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {l.text_slot ? <span className={chip}>ตัวอักษรจาก &quot;{slotName(l.text_slot)}&quot;</span>
                      : l.depends_on.length ? l.depends_on.map((d) => <span key={d} className={chip}>เปลี่ยนตาม{slotName(d)}</span>) : <span className={chip}>รูปเดียว</span>}
                    {l.recolor_slot && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">ลงสีตาม{slotName(l.recolor_slot)}</span>}
                    {l.show_when.map((c, j) => <span key={j} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">โชว์เมื่อ{slotName(c.slot)}{c.options.length ? ` = ${c.options.map((o) => optName(c.slot, o)).join("/")}` : ""}</span>)}
                  </div>
                </div>
                {!l.text_slot && (
                  <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${full ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                    รูป {have}/{combos.length} {open === l.id ? "▴" : "▾"}
                  </button>
                )}
                {canEdit && <ToggleSwitch size="sm" on={l.is_active} onChange={(v) => void toggle(l, v)} title={l.is_active ? "ปิดชั้นนี้" : "เปิดชั้นนี้"} />}
                {canEdit && <button type="button" className={btn} onClick={() => setEdit({ ...l })}><Icon name="edit" /> แก้</button>}
                {canEdit && <button type="button" className={`${btn} border-red-200 text-red-600`} onClick={() => setDel(l)} aria-label={`ลบชั้น ${l.name_th}`}><Icon name="delete" /></button>}
              </div>
              {open === l.id && <LayerImages data={data} layer={l} canEdit={canEdit} onChanged={onChanged} />}
            </div>
          );
        })}
        {order.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{VIEW_LABEL[view].th}ยังไม่มีชั้นรูป — กด &quot;เพิ่มชั้น&quot; เริ่มจาก เงาพื้น · ตัวสินค้า · อะไหล่</div>}
      </div>

      {edit && <LayerEditor data={data} layer={edit} onClose={() => setEdit(null)} onSaved={onChanged} />}
      <BulkUploadModal data={data} open={upload} onClose={() => setUpload(false)} onDone={onChanged} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => void remove()} variant="danger" confirmText="ลบชั้น"
        title={`ลบชั้น ${del?.name_th ?? ""}?`} message={`รูปของชั้นนี้ ${data.images.filter((im) => im.layer_id === del?.id).length} ไฟล์จะถูกถอดออกจากทรงนี้ด้วย (ไฟล์ยังอยู่ในคลังไฟล์กลาง)`} />
    </div>
  );
}
