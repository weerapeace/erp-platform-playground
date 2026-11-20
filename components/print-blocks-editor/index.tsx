"use client";

/**
 * ตัวจัดหน้าเอกสารพิมพ์ (ของกลาง · เจ้าของขอ 2026-11-20) — เพิ่ม/ลากเรียง/แก้/ลบ ช่องในการ์ด + กล่องบนหน้า · กติกา/ค่า: lib/print-blocks
 *
 *   const blocks = usePrintBlocksEditor({ cardFields, cardOrder, pageBlocks, onChange: (patch) => update({ ...layout, ...patch }) });
 *   <ReportLayoutControls cardFieldsPanel={blocks.cardPanel} … />
 *   usePrintPartEditor({ …, parts: [...BASE, ...printBlockPartDefs(…)], onSlot: blocks.onSlot, extra: blocks.extra })
 *   {blocks.modal}
 *
 * - ช่องในการ์ด: แผงรายการ (ลากเรียงด้วยหูจับ · แก้ป้าย · ลบ) + ปุ่มเพิ่ม (ข้อมูลจาก SKU / บรรทัด / ข้อความเอง)
 * - กล่องบนหน้า: กด "+ เพิ่มกล่องตรงนี้" ในใบ → เลือก ข้อความ / รูป / เส้นคั่น / ข้อมูลจากใบ · กดกล่องแล้วแผงแก้หน้าตามีแก้ข้อความ/เปลี่ยนรูป/แก้ช่อง/ลบ
 * - ส่ง pageFields (+ pageValues ไว้โชว์ค่าจริง) = มี "ข้อมูลจากใบ" + ปุ่มแทรกช่อง {ลูกค้า} ในกล่องข้อความ
 * - ลบช่อง/กล่อง → แจ้งผลมีปุ่ม "ย้อนกลับ" (คืนตำแหน่งเดิม)
 * ของกลางที่ใช้: Popover · ERPModal · ImageAttachKeys · askText · useToast · useDragReorder/DragHandle
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "@/components/popover";
import { ERPModal } from "@/components/modal";
import { ImageAttachKeys } from "@/components/image-attach";
import { askText } from "@/components/modal/ask-dialog";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import {
  BASE_CARD_SLOTS, cardFieldDefaultLabel, fillPagePlaceholders, PAGE_FIELD_LAYOUTS, pageFieldRows,
  type PageFieldLayout, type PageFieldOption, type PageFieldRef, LINE_FIELD_OPTIONS, newBlockId, normalizeCardOrder, PAGE_SLOTS, SKU_FIELD_OPTIONS,
  type CardField, type CardFieldKind, type PageBlock, type PageBlockKind, type PageBlockSlot,
} from "@/lib/print-blocks";

type Patch = Partial<{ cardFields: CardField[]; cardOrder: string[]; pageBlocks: PageBlock[] }>;

type FieldsDraft = { slot: PageBlockSlot; id?: string; fields: PageFieldRef[]; layout: PageFieldLayout; hideLabels: boolean };

export function usePrintBlocksEditor({ cardFields, cardOrder, pageBlocks, onChange, pageFields = [], pageValues = {} }: {
  cardFields: CardField[];
  cardOrder: string[];
  pageBlocks: PageBlock[];
  onChange: (patch: Patch) => void;
  /** ช่องของเอกสาร (เช่น QUOTE_PAGE_FIELDS) — ส่งมา = มี "ข้อมูลจากใบ" + แทรกช่องในข้อความ */
  pageFields?: PageFieldOption[];
  /** ค่าจริงของช่องในใบนี้ (โชว์ข้างชื่อช่อง + ตัวอย่าง) */
  pageValues?: Record<string, string | null>;
}) {
  const toast = useToast();
  const order = normalizeCardOrder(cardOrder, cardFields);
  const [imageFor, setImageFor] = useState<{ slot: PageBlockSlot; id?: string } | null>(null);
  const [imageKeys, setImageKeys] = useState<string[]>([]);

  // ---- ช่องในการ์ด ----
  const addField = async (kind: CardFieldKind, key?: string) => {
    let text: string | undefined;
    if (kind === "text") {
      const t = await askText({ title: "ข้อความในการ์ด (ทุกการ์ด)", placeholder: "เช่น ผลิต 30-45 วัน / สกรีนโลโก้ 1 สี", required: true, rows: 3, confirmText: "เพิ่ม" });
      if (!t) return;
      text = t.slice(0, 300);
    }
    const f: CardField = { id: newBlockId(), kind, label: cardFieldDefaultLabel(kind, key), ...(key ? { key } : {}), ...(text ? { text } : {}) };
    const fields = [...cardFields, f];
    onChange({ cardFields: fields, cardOrder: normalizeCardOrder(order, fields) });
  };
  const removeField = (id: string) => {
    const before = { cardFields, cardOrder: order };
    const f = cardFields.find((x) => x.id === id);
    const fields = cardFields.filter((x) => x.id !== id);
    onChange({ cardFields: fields, cardOrder: order.filter((k) => k !== `f:${id}`) });
    toast.undo(`ลบช่อง "${f?.label || f?.text?.slice(0, 20) || ""}" แล้ว`, () => onChange(before), { ms: 10000 });
  };
  const patchField = (id: string, p: Partial<CardField>) =>
    onChange({ cardFields: cardFields.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const editFieldText = async (f: CardField) => {
    const t = await askText({ title: "แก้ข้อความในการ์ด", initial: f.text ?? "", required: true, rows: 3, confirmText: "บันทึก" });
    if (t) patchField(f.id, { text: t.slice(0, 300) });
  };
  const drag = useDragReorder((from, to) => onChange({ cardOrder: moveItem(order, from, to) }));

  const labelOf = (k: string) => {
    if (k.startsWith("base:")) return BASE_CARD_SLOTS.find((b) => b.key === k.slice(5))?.label ?? k;
    const f = cardFields.find((x) => x.id === k.slice(2));
    return f ? (f.kind === "text" ? `“${(f.text ?? "").slice(0, 30)}”` : f.label || cardFieldDefaultLabel(f.kind, f.key)) : k;
  };
  const kindTag = (k: string) => {
    if (k.startsWith("base:")) return null;
    const f = cardFields.find((x) => x.id === k.slice(2));
    const t = f?.kind === "sku" ? ["SKU", "bg-violet-50 text-violet-700"] : f?.kind === "line" ? ["รายการ", "bg-emerald-50 text-emerald-700"] : ["ข้อความ", "bg-amber-50 text-amber-700"];
    return <span className={`rounded px-1.5 text-[10px] font-medium ${t[1]}`}>{t[0]}</span>;
  };
  const used = new Set(cardFields.map((f) => `${f.kind}:${f.key ?? ""}`));
  const menuRow = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-40";

  const cardPanel: ReactNode = (
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>ช่องในการ์ด — ลากที่หูจับ ⠿ เพื่อเรียง · ทุกการ์ดเหมือนกัน · SKU ไหนไม่มีค่า แถวนั้นไม่ขึ้น · รูปอยู่บนสุดเสมอ</span>
        <span className="flex-1" />
        <Popover align="right" panelClassName="w-64 py-1 max-h-[60vh] overflow-auto"
          trigger={(toggle) => (
            <button type="button" onClick={toggle} className="inline-flex h-7 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 font-medium text-sky-700 hover:bg-sky-100">
              <Icon value="i:plus" className="text-[13px]" />เพิ่มช่อง
            </button>
          )}>
          {(close) => (
            <>
              <div className="px-3 pb-0.5 pt-1 text-[11px] text-slate-400">ข้อมูลจาก SKU ที่ผูก</div>
              {SKU_FIELD_OPTIONS.map((o) => (
                <button key={o.key} type="button" disabled={used.has(`sku:${o.key}`)} className={menuRow} onClick={() => { close(); void addField("sku", o.key); }}>{o.label}</button>
              ))}
              <div className="px-3 pb-0.5 pt-1.5 text-[11px] text-slate-400">ข้อมูลจากบรรทัดใบเสนอราคา</div>
              {LINE_FIELD_OPTIONS.map((o) => (
                <button key={o.key} type="button" disabled={used.has(`line:${o.key}`)} className={menuRow} onClick={() => { close(); void addField("line", o.key); }}>{o.label}</button>
              ))}
              <div className="px-3 pb-0.5 pt-1.5 text-[11px] text-slate-400">ทำเอง</div>
              <button type="button" className={menuRow} onClick={() => { close(); void addField("text"); }}>ข้อความที่พิมพ์เอง…</button>
            </>
          )}
        </Popover>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((k, i) => {
          const f = k.startsWith("f:") ? cardFields.find((x) => x.id === k.slice(2)) : null;
          return (
            <div key={k} {...drag.rowProps(i)} className={`flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm ${drag.rowCls(i)}`}>
              <DragHandle {...drag.handleProps(i)} title="ลากเพื่อเรียง" />
              {f && f.kind !== "text" ? (
                <input value={f.label} onChange={(e) => patchField(f.id, { label: e.target.value.slice(0, 40) })} placeholder="(ไม่มีป้าย)"
                  title="ป้ายหน้าค่า — ลบให้ว่าง = ไม่มีป้าย" className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-sky-300 focus:outline-none" />
              ) : (
                <span className={`min-w-0 flex-1 truncate ${f ? "" : "text-slate-500"}`}>{labelOf(k)}</span>
              )}
              {kindTag(k)}
              {f?.kind === "text" && (
                <button type="button" onClick={() => void editFieldText(f)} aria-label="แก้ข้อความ" className="text-slate-400 hover:text-slate-700"><Icon value="i:pencil" className="text-[14px]" /></button>
              )}
              {f && (
                <button type="button" onClick={() => removeField(f.id)} aria-label="ลบช่อง" className="text-slate-400 hover:text-red-600"><Icon value="i:x" className="text-[14px]" /></button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ---- กล่องบนหน้า ----
  const addBlock = (slot: PageBlockSlot, kind: PageBlockKind, extra: Partial<PageBlock> = {}) =>
    onChange({ pageBlocks: [...pageBlocks, { id: newBlockId(), slot, kind, ...extra }] });
  const onSlot = async (slotRaw: string) => {
    const slot = PAGE_SLOTS.find((s) => s.key === slotRaw)?.key;
    if (slot) setPicker(slot);
  };
  const [picker, setPicker] = useState<PageBlockSlot | null>(null);
  const pickKind = async (kind: PageBlockKind) => {
    const slot = picker; setPicker(null);
    if (!slot) return;
    if (kind === "divider") { addBlock(slot, "divider"); return; }
    if (kind === "image") { setImageKeys([]); setImageFor({ slot }); return; }
    if (kind === "fields") { setFieldsFor({ slot, fields: [], layout: "inline", hideLabels: false }); return; }
    setTextFor({ slot, text: "", initial: "" });
  };
  // กล่องข้อความ (แทรกช่อง {ลูกค้า} ได้)
  const [textFor, setTextFor] = useState<{ slot: PageBlockSlot; id?: string; text: string; initial: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = caretRef.current, ta = taRef.current;
    if (at == null || !ta) return;
    caretRef.current = null;
    ta.focus();
    ta.setSelectionRange(at, at);
  }, [textFor?.text]);
  const insertToken = (label: string) => {
    if (!textFor) return;
    const ta = taRef.current, tok = `{${label}}`;
    const a = ta?.selectionStart ?? textFor.text.length, z = ta?.selectionEnd ?? a;
    const text = (textFor.text.slice(0, a) + tok + textFor.text.slice(z)).slice(0, 2000);
    caretRef.current = a + tok.length;
    setTextFor({ ...textFor, text });
  };
  const saveText = () => {
    if (!textFor || !textFor.text.trim()) return;
    if (textFor.id) patchBlock(textFor.id, { text: textFor.text.slice(0, 2000) }); else addBlock(textFor.slot, "text", { text: textFor.text.slice(0, 2000) });
    setTextFor(null);
  };
  // กล่องข้อมูลจากใบ
  const [fieldsFor, setFieldsFor] = useState<FieldsDraft | null>(null);
  const [fieldsInitial, setFieldsInitial] = useState("");
  const openFields = (d: FieldsDraft) => { setFieldsFor(d); setFieldsInitial(JSON.stringify(d)); };
  const toggleField = (key: string) => {
    if (!fieldsFor) return;
    const has = fieldsFor.fields.some((f) => f.key === key);
    setFieldsFor({ ...fieldsFor, fields: has ? fieldsFor.fields.filter((f) => f.key !== key) : [...fieldsFor.fields, { key, label: "" }] });
  };
  const saveFields = () => {
    if (!fieldsFor || !fieldsFor.fields.length) return;
    const p = { fields: fieldsFor.fields, layout: fieldsFor.layout, hideLabels: fieldsFor.hideLabels || undefined };
    if (fieldsFor.id) patchBlock(fieldsFor.id, p); else addBlock(fieldsFor.slot, "fields", p);
    setFieldsFor(null);
  };
  const removeBlock = (id: string) => {
    const before = pageBlocks;
    onChange({ pageBlocks: pageBlocks.filter((b) => b.id !== id) });
    toast.undo("ลบกล่องแล้ว", () => onChange({ pageBlocks: before }), { ms: 10000 });
  };
  const patchBlock = (id: string, p: Partial<PageBlock>) => onChange({ pageBlocks: pageBlocks.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  const moveBlock = (id: string, dir: -1 | 1) => {
    const b = pageBlocks.find((x) => x.id === id); if (!b) return;
    const same = pageBlocks.filter((x) => x.slot === b.slot);
    const i = same.findIndex((x) => x.id === id), j = i + dir;
    if (j < 0 || j >= same.length) return;
    const ai = pageBlocks.indexOf(same[i]), aj = pageBlocks.indexOf(same[j]);
    const next = [...pageBlocks]; [next[ai], next[aj]] = [next[aj], next[ai]];
    onChange({ pageBlocks: next });
  };

  // ส่วนบนของแผงแก้หน้าตา เมื่อกดช่อง/กล่องที่ผู้ใช้เพิ่ม
  const btn = "inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-600 hover:bg-slate-50";
  const extra = (key: string, _ci: number | null, close: () => void): ReactNode => {
    if (key.startsWith("f-")) {
      const f = cardFields.find((x) => x.id === key.slice(2)); if (!f) return null;
      return (
        <div className="flex flex-wrap gap-1.5">
          {f.kind === "text" && <button type="button" className={btn} onClick={() => void editFieldText(f)}><Icon value="i:pencil" className="text-[13px]" />แก้ข้อความ</button>}
          {f.kind !== "text" && <span className="self-center text-[12px] text-slate-500">ช่อง {f.label || cardFieldDefaultLabel(f.kind, f.key)} (แก้ป้าย/ลำดับที่ หน้าตา ▾ › ช่องในการ์ด)</span>}
          <button type="button" className={`${btn} text-red-600`} onClick={() => { close(); removeField(f.id); }}><Icon value="i:trash" className="text-[13px]" />ลบช่องนี้</button>
        </div>
      );
    }
    if (key.startsWith("b-")) {
      const b = pageBlocks.find((x) => x.id === key.slice(2)); if (!b) return null;
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {b.kind === "text" && (
              <button type="button" className={btn} onClick={() => setTextFor({ slot: b.slot, id: b.id, text: b.text ?? "", initial: b.text ?? "" })}><Icon value="i:pencil" className="text-[13px]" />แก้ข้อความ</button>
            )}
            {b.kind === "fields" && (
              <button type="button" className={btn} onClick={() => openFields({ slot: b.slot, id: b.id, fields: b.fields ?? [], layout: b.layout ?? "inline", hideLabels: !!b.hideLabels })}><Icon value="i:pencil" className="text-[13px]" />แก้ช่อง</button>
            )}
            {b.kind === "image" && <button type="button" className={btn} onClick={() => { setImageKeys(b.imageKey ? [b.imageKey] : []); setImageFor({ slot: b.slot, id: b.id }); }}><Icon value="i:photo" className="text-[13px]" />เปลี่ยนรูป</button>}
            <button type="button" className={btn} onClick={() => moveBlock(b.id, -1)} aria-label="เลื่อนขึ้น"><Icon value="i:chevron-up" className="text-[13px]" />ขึ้น</button>
            <button type="button" className={btn} onClick={() => moveBlock(b.id, 1)} aria-label="เลื่อนลง"><Icon value="i:chevron-down" className="text-[13px]" />ลง</button>
            <button type="button" className={`${btn} text-red-600`} onClick={() => { close(); removeBlock(b.id); }}><Icon value="i:trash" className="text-[13px]" />ลบกล่อง</button>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-500">ย้ายไปวางที่
            <select value={b.slot} onChange={(e) => patchBlock(b.id, { slot: e.target.value as PageBlockSlot })} className="h-7 rounded border border-slate-200 bg-white px-1 text-[12px]">
              {PAGE_SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          {b.kind === "image" && (
            <label className="flex items-center gap-2 text-[12px] text-slate-500">สูง
              <input type="number" min={8} max={150} value={b.imageMm ?? 24} onChange={(e) => patchBlock(b.id, { imageMm: Number(e.target.value) || 24 })} className="h-7 w-16 rounded border border-slate-200 px-1 text-[12px]" /> mm
            </label>
          )}
        </div>
      );
    }
    return null;
  };

  const modal: ReactNode = (
    <>
      <ERPModal open={!!picker} onClose={() => setPicker(null)} size="sm" title={`เพิ่มกล่อง (${PAGE_SLOTS.find((s) => s.key === picker)?.label ?? ""})`}>
        <div className={`grid gap-2 ${pageFields.length ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          {([["text", "i:file-text", "ข้อความ"], ["image", "i:photo", "รูป"], ["divider", "i:minus", "เส้นคั่น"], ...(pageFields.length ? [["fields", "i:database", "ข้อมูลจากใบ"]] : [])] as [PageBlockKind, string, string][]).map(([k, ic, l]) => (
            <button key={k} type="button" onClick={() => void pickKind(k)} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 py-4 text-sm text-slate-700 hover:border-sky-300 hover:bg-sky-50">
              <Icon value={ic} className="text-[22px] text-slate-500" />{l}
            </button>
          ))}
        </div>
      </ERPModal>
      <ERPModal open={!!textFor} onClose={() => setTextFor(null)} size="md" hasUnsavedChanges={!!textFor && textFor.text !== textFor.initial}
        title={textFor?.id ? "แก้กล่องข้อความ" : `กล่องข้อความ (${PAGE_SLOTS.find((s) => s.key === textFor?.slot)?.label ?? ""})`}
        footer={(
          <>
            <button type="button" onClick={() => setTextFor(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm">ยกเลิก</button>
            <button type="button" disabled={!textFor?.text.trim()} onClick={saveText} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white disabled:opacity-50">{textFor?.id ? "บันทึก" : "เพิ่ม"}</button>
          </>
        )}>
        {textFor && (
          <div className="space-y-2">
            <textarea ref={taRef} value={textFor.text} rows={4} autoFocus onChange={(e) => setTextFor({ ...textFor, text: e.target.value.slice(0, 2000) })}
              placeholder={pageFields.length ? "เช่น เรียน {ลูกค้า} ขอเสนอราคาตามรายละเอียดด้านล่าง" : "เช่น ขอเสนอราคาตามรายละเอียดด้านล่าง"}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-300 focus:outline-none" />
            {pageFields.length > 0 && (
              <>
                <div className="text-[11px] text-slate-400">แทรกข้อมูลจากใบ (พิมพ์ออกมาเป็นค่าจริง)</div>
                <div className="flex flex-wrap gap-1">
                  {pageFields.map((o) => (
                    <button key={o.key} type="button" onClick={() => insertToken(o.label)} className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[12px] text-sky-700 hover:bg-sky-100">+ {o.label}</button>
                  ))}
                </div>
                {/\{[^{}]+\}/.test(textFor.text) && (
                  <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[13px] text-slate-700">
                    <div className="mb-0.5 text-[11px] text-slate-400">ตัวอย่างบนใบนี้</div>
                    <div className="whitespace-pre-wrap">{fillPagePlaceholders(textFor.text, pageValues, pageFields)}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ERPModal>
      <ERPModal open={!!fieldsFor} onClose={() => setFieldsFor(null)} size="md" hasUnsavedChanges={!!fieldsFor && JSON.stringify(fieldsFor) !== fieldsInitial}
        title={fieldsFor?.id ? "แก้กล่องข้อมูลจากใบ" : `กล่องข้อมูลจากใบ (${PAGE_SLOTS.find((s) => s.key === fieldsFor?.slot)?.label ?? ""})`}
        footer={(
          <>
            <button type="button" onClick={() => setFieldsFor(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm">ยกเลิก</button>
            <button type="button" disabled={!fieldsFor?.fields.length} onClick={saveFields} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white disabled:opacity-50">{fieldsFor?.id ? "บันทึก" : "เพิ่มกล่อง"}</button>
          </>
        )}>
        {fieldsFor && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500">ติ๊กได้หลายช่อง · ช่องที่ว่างจะไม่พิมพ์ · ลำดับตามที่ติ๊ก</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {pageFields.map((o) => {
                const on = fieldsFor.fields.some((f) => f.key === o.key);
                const v = pageValues[o.key];
                return (
                  <button key={o.key} type="button" onClick={() => toggleField(o.key)} aria-pressed={on}
                    className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] ${on ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                    <Icon value={on ? "i:circle-check" : "i:square"} className="shrink-0 text-[15px]" />
                    <span className="shrink-0">{o.label}</span>
                    <span className="ml-auto min-w-0 truncate text-[11px] text-slate-400">{v || "—"}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
              <span>จัดวาง</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                {PAGE_FIELD_LAYOUTS.map((l) => (
                  <button key={l.key} type="button" onClick={() => setFieldsFor({ ...fieldsFor, layout: l.key })}
                    className={`px-2.5 py-1 ${fieldsFor.layout === l.key ? "bg-sky-600 text-white" : "bg-white hover:bg-slate-50"}`}>{l.label}</button>
                ))}
              </div>
              <label className="ml-auto inline-flex items-center gap-1.5">
                <input type="checkbox" checked={fieldsFor.hideLabels} onChange={(e) => setFieldsFor({ ...fieldsFor, hideLabels: e.target.checked })} />ซ่อนป้าย เหลือแค่ค่า
              </label>
            </div>
            {fieldsFor.fields.length > 0 && !fieldsFor.hideLabels && (
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400">ป้ายหน้าค่า (เว้นว่าง = ใช้ชื่อช่อง)</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {fieldsFor.fields.map((f) => (
                    <input key={f.key} value={f.label} placeholder={pageFields.find((o) => o.key === f.key)?.label}
                      onChange={(e) => setFieldsFor({ ...fieldsFor, fields: fieldsFor.fields.map((x) => (x.key === f.key ? { ...x, label: e.target.value.slice(0, 40) } : x)) })}
                      className="h-8 min-w-0 rounded-lg border border-slate-200 px-2 text-[13px] focus:border-sky-300 focus:outline-none" />
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[13px]">
              <div className="mb-0.5 text-[11px] text-slate-400">ตัวอย่างบนใบนี้</div>
              {(() => {
                const rows = pageFieldRows({ ...fieldsFor, id: "x", kind: "fields" }, pageValues, pageFields);
                if (!rows.length) return <span className="text-slate-400">ยังไม่ได้เลือกช่อง หรือช่องที่เลือกว่างในใบนี้</span>;
                const cell = (r: { label: string; value: string }, i: number) => (
                  <span key={i} className={fieldsFor.layout === "inline" ? "" : "block"}>{r.label && <span className="text-slate-500">{r.label}: </span>}<span className="whitespace-pre-wrap">{r.value}</span>{fieldsFor.layout === "inline" && i < rows.length - 1 ? " · " : ""}</span>
                );
                return <div className={fieldsFor.layout === "cols2" ? "grid grid-cols-2 gap-x-4" : ""}>{rows.map(cell)}</div>;
              })()}
            </div>
          </div>
        )}
      </ERPModal>
      <ERPModal open={!!imageFor} onClose={() => setImageFor(null)} size="sm" title={imageFor?.id ? "เปลี่ยนรูปในกล่อง" : "เพิ่มกล่องรูป (โลโก้ / แบนเนอร์)"}
        footer={(
          <>
            <button type="button" onClick={() => setImageFor(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm">ยกเลิก</button>
            <button type="button" disabled={!imageKeys.length} onClick={() => {
              const key = imageKeys[imageKeys.length - 1];
              if (imageFor?.id) patchBlock(imageFor.id, { imageKey: key }); else if (imageFor) addBlock(imageFor.slot, "image", { imageKey: key, imageMm: 24 });
              setImageFor(null);
            }} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white disabled:opacity-50">ใช้รูปนี้</button>
          </>
        )}>
        <p className="mb-2 text-xs text-slate-500">ลากวาง / วางจากคลิปบอร์ด / เลือกไฟล์ — ใช้รูปล่าสุดที่ใส่</p>
        <ImageAttachKeys value={imageKeys} onChange={setImageKeys} folder="print-blocks" />
      </ERPModal>
    </>
  );

  return { cardPanel, onSlot, extra, modal };
}
