"use client";
/**
 * ⚙ แก้สูตรคำอธิบายแบบบล็อก (ของกลาง) — ปุ่มข้างหัวข้อฟิลด์ computed ชนิด desc_blocks (เช่น Platform Description)
 *   ซ้าย: บล็อก ลาก ⠿ สลับ · ติ๊กเปิด/ปิด · เว้นบรรทัด/ติดบรรทัดบน · ✏️ แก้ข้อความไทย/อังกฤษ
 *         ＋ แทรกข้อมูล = เลือกได้ทุกฟิลด์ของโมดูล (ค้นหาได้ · โชว์ค่าตัวอย่าง) → ใส่ {คีย์ฟิลด์} ตรงเคอร์เซอร์
 *         ถ้า… = เงื่อนไขของบล็อก (ทุกข้อ/ข้อใดข้อหนึ่ง) · บล็อกข้อความตั้ง "ไม่ตรง → ข้อความแทน" ได้
 *         ＋ เพิ่มข้อความพิมพ์เอง (ลบได้) · คืนค่าตั้งต้น
 *   ขวา: ตัวอย่างสดจากสินค้าที่เปิดอยู่ (ไทย/อังกฤษ)
 * บันทึกลงทะเบียนฟิลด์ relation_config.desc_blocks ทั้งช่องไทย + คู่อังกฤษ (PATCH /api/admin/field-registry-v2/[id] · admin.field_registry.edit + ประวัติ)
 * กฎประกอบ/เงื่อนไข: lib/desc-blocks.ts (มีเทสต์) · รายชื่อฟิลด์มาจาก MasterCRUD (ทะเบียนฟิลด์ — ไม่ hardcode)
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Popover } from "@/components/popover";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { apiFetch } from "@/lib/api";
import {
  buildDescription, cleanDescBlocks, DEFAULT_DESC_BLOCKS, DESC_BLOCK_DEFS, DESC_OPS, DESC_PLACEHOLDERS,
  descFieldValue, descRuleTrue, descTokensIn, descWhenTrue,
  type DescBlock, type DescLang, type DescOp, type DescRule, type DescWhen,
} from "@/lib/desc-blocks";

export type DescBlocksFieldRef = { id: string; cfg?: Record<string, unknown> | null };
/** ฟิลด์ที่แทรก/ตั้งเงื่อนไขได้ (มาจากทะเบียนฟิลด์ของโมดูล) */
export type DescFieldOption = { key: string; label: string; type: string; options?: string[]; optionLabels?: Record<string, string>; hint?: string };

type TextProp = "text" | "text_en" | "else_text" | "else_text_en";

export function DescBlocksButton({ field, enField, sample, fields, fieldLabel, onSaved }: {
  field: DescBlocksFieldRef; enField?: DescBlocksFieldRef; sample: Record<string, unknown>; fields?: DescFieldOption[]; fieldLabel: string;
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        title="แก้สูตร — เลือกบล็อก เรียงลำดับ แก้ข้อความ ใส่ข้อมูล/เงื่อนไข (มีผลกับทุกสินค้า)"
        className="ml-1 align-middle text-[12px] leading-none text-slate-300 hover:text-violet-600">⚙</button>
      {/* กันคลิก/ดับเบิลคลิกในป๊อปไหลกลับไปหาช่องในฟอร์ม (ป๊อปอยู่ใน portal แต่ event ยังไหลตามต้นไม้ React) */}
      {open && <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <DescBlocksModal field={field} enField={enField} sample={sample} fields={fields} fieldLabel={fieldLabel} onClose={() => setOpen(false)} onSaved={onSaved} />
      </span>}
    </>
  );
}

/** ไม่ได้ส่งรายชื่อฟิลด์มา → ใช้คีย์ของแถวตัวอย่าง (ค่าธรรมดา) แทน */
function fieldsFromSample(sample: Record<string, unknown>): DescFieldOption[] {
  return Object.entries(sample)
    .filter(([k, v]) => /^[A-Za-z0-9_]+$/.test(k) && (v == null || typeof v !== "object"))
    .map(([k, v]) => ({ key: k, label: k, type: typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "text" }));
}

const opsFor = (type: string): DescOp[] => DESC_OPS
  .filter((o) => type === "boolean" ? o.for === "boolean" : o.for === "any" || o.for === (type === "number" ? "number" : "text"))
  .map((o) => o.op);
const opDef = (op: DescOp) => DESC_OPS.find((o) => o.op === op)!;

/** ตัวเลือกฟิลด์แบบค้นหาได้ (ตัวแทนพิเศษอยู่บนสุด) — ใช้ทั้ง "แทรกข้อมูล" และ "เลือกฟิลด์ของเงื่อนไข" */
function FieldMenu({ fields, sample, lang, onPick, trigger }: {
  fields: DescFieldOption[]; sample: Record<string, unknown>; lang: DescLang;
  onPick: (f: DescFieldOption) => void; trigger: (toggle: () => void, open: boolean) => ReactNode;
}) {
  return (
    <Popover panelClassName="w-72 p-2" trigger={trigger}>
      {(close) => <FieldMenuPanel fields={fields} sample={sample} lang={lang} onPick={(f) => { onPick(f); close(); }} />}
    </Popover>
  );
}

function FieldMenuPanel({ fields, sample, lang, onPick }: {
  fields: DescFieldOption[]; sample: Record<string, unknown>; lang: DescLang; onPick: (f: DescFieldOption) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // แผงลอยซ่อนอยู่จนวางตำแหน่งเสร็จ → autoFocus ตอนเกิดไม่ติด · โฟกัสหลังเฟรมแรกแทน
  useEffect(() => { const t = requestAnimationFrame(() => inputRef.current?.focus()); return () => cancelAnimationFrame(t); }, []);
  const ql = q.trim().toLowerCase();
  const list = fields.filter((f) => !ql || f.label.toLowerCase().includes(ql) || f.key.toLowerCase().includes(ql));
  return (
    <div>
      <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาฟิลด์ (ชื่อ หรือ คีย์)"
        onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { e.preventDefault(); onPick(list[0]); } }}
        className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
      <div className="mt-1 max-h-72 overflow-y-auto">
        {list.map((f) => {
          const v = descFieldValue(sample, f.key, lang);
          return (
            <button key={f.key} type="button" onClick={() => onPick(f)}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-violet-50">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm text-slate-800">{f.label}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">{`{${f.key}}`}</span>
              </span>
              <span className="block truncate text-[11px] text-slate-400">{f.hint ?? (v ? `ตัวอย่าง: ${v}` : "— ว่างในสินค้านี้ —")}</span>
            </button>
          );
        })}
        {!list.length && <p className="px-2 py-3 text-center text-xs text-slate-400">ไม่พบฟิลด์</p>}
      </div>
    </div>
  );
}

function DescBlocksModal({ field, enField, sample, fields, fieldLabel, onClose, onSaved }: {
  field: DescBlocksFieldRef; enField?: DescBlocksFieldRef; sample: Record<string, unknown>; fields?: DescFieldOption[]; fieldLabel: string;
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const configured = !!field.cfg?.desc_blocks;
  const initial = useMemo(() => cleanDescBlocks(field.cfg?.desc_blocks).blocks, [field.cfg]);
  const [blocks, setBlocks] = useState<DescBlock[]>(() => initial.map((x) => ({ ...x })));
  const [editing, setEditing] = useState<string | null>(null);
  const [condFor, setCondFor] = useState<string | null>(null);
  const [lang, setLang] = useState<DescLang>("th");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setBlocks((b) => moveItem(b, from, to)));

  // ตัวแทนพิเศษ + ทุกฟิลด์ของโมดูล (ไม่ซ้ำคีย์)
  const allFields = useMemo<DescFieldOption[]>(() => {
    const special = DESC_PLACEHOLDERS.map((p) => ({ key: p.token.slice(1, -1), label: `✨ ${p.label}`, type: "text", hint: p.hint }));
    const base = (fields?.length ? fields : fieldsFromSample(sample)).filter((f) => /^[A-Za-z0-9_]+$/.test(f.key));
    const seen = new Set<string>();
    return [...special, ...base].filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  }, [fields, sample]);
  const fieldMap = useMemo(() => new Map(allFields.map((f) => [f.key, f])), [allFields]);

  const cfg = { blocks };
  const clean = cleanDescBlocks(cfg);
  const dirty = JSON.stringify(clean.blocks) !== JSON.stringify(cleanDescBlocks({ blocks: initial }).blocks);
  const preview = buildDescription(sample, cfg, lang);
  const set = (id: string, patch: Partial<DescBlock>) => { setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b))); setErr(null); };

  const textOf = (b: DescBlock, prop: TextProp): string => {
    const def = DESC_BLOCK_DEFS[b.key];
    if (prop === "text") return b.text ?? def.th ?? "";
    if (prop === "text_en") return b.text_en ?? (b.key === "text" ? "" : def.en ?? "");
    return b[prop] ?? "";
  };
  // แทรก {คีย์} ตรงตำแหน่งเคอร์เซอร์ (ไม่มีเคอร์เซอร์ = ต่อท้าย)
  const insert = (b: DescBlock, prop: TextProp, key: string) => {
    const token = `{${key}}`;
    const cur = textOf(b, prop);
    const el = areas.current[`${b.id}:${prop}`];
    const at = el ? el.selectionStart ?? cur.length : cur.length;
    set(b.id, { [prop]: cur.slice(0, at) + token + cur.slice(at) });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + token.length, at + token.length); } });
  };
  const addText = () => {
    const id = `text_${Date.now().toString(36)}`;
    setBlocks((bs) => [...bs, { id, key: "text", on: true, gap: "blank", text: "", text_en: "" }]);
    setEditing(id);
  };

  const fieldName = (k: string) => fieldMap.get(k)?.label ?? k;
  const ruleText = (r: DescRule) => `${fieldName(r.field)} ${opDef(r.op).label}${opDef(r.op).value ? ` “${r.value ?? ""}”` : ""}`;
  const whenText = (w: DescWhen) => w.rules.map(ruleText).join(w.match === "any" ? " หรือ " : " และ ");

  const save = async () => {
    const emptyText = blocks.find((b) => b.key === "text" && !(b.text ?? "").trim() && !(b.text_en ?? "").trim());
    if (emptyText) { setErr("มีบล็อก “ข้อความพิมพ์เอง” ที่ยังว่าง — พิมพ์ข้อความ หรือลบทิ้ง"); setEditing(emptyText.id); return; }
    const noValue = blocks.find((b) => b.when?.rules.some((r) => opDef(r.op).value && !(r.value ?? "").trim()));
    if (noValue) { setErr("มีเงื่อนไขที่ยังไม่ใส่ค่า (เช่น “เท่ากับ …”) — ใส่ค่า หรือเปลี่ยนเป็น “มีค่า/ว่าง”"); setCondFor(noValue.id); return; }
    if (!clean.blocks.some((b) => b.on)) { setErr("เปิดอย่างน้อย 1 บล็อก"); return; }
    setSaving(true); setErr(null);
    try {
      for (const f of [field, enField].filter((x): x is DescBlocksFieldRef => !!x)) {
        const r = await apiFetch(`/api/admin/field-registry-v2/${f.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relation_config: { ...(f.cfg ?? {}), desc_blocks: clean } }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(r.status === 401 || r.status === 403 ? "ไม่มีสิทธิ์แก้ทะเบียนฟิลด์ (ต้องเป็นแอดมิน)" : (j.error || "บันทึกไม่สำเร็จ"));
      }
      toast.success(`บันทึกสูตร “${fieldLabel}” แล้ว — มีผลกับทุกสินค้า`);
      await onSaved();
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setSaving(false); }
  };

  const textArea = (b: DescBlock, prop: TextProp, title: string, placeholder = "พิมพ์ข้อความ") => {
    const l: DescLang = prop.endsWith("_en") ? "en" : "th";
    const value = textOf(b, prop);
    const canReset = (prop === "text" || prop === "text_en") && b.key !== "text" && b[prop] !== undefined;
    const tokens = descTokensIn(value);
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-semibold">{title}</span>
          <FieldMenu fields={allFields} sample={sample} lang={l} onPick={(f) => insert(b, prop, f.key)}
            trigger={(toggle) => (
              <button type="button" onClick={toggle} className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100">＋ แทรกข้อมูล ▾</button>
            )} />
          {canReset && (
            <button type="button" onClick={() => set(b.id, { [prop]: undefined })} className="ml-auto text-[10px] text-slate-400 hover:text-slate-700 hover:underline">↺ ข้อความตั้งต้น</button>
          )}
        </div>
        <textarea ref={(el) => { areas.current[`${b.id}:${prop}`] = el; }} value={value} rows={b.key === "ordering" || b.key === "follow" ? 5 : 2}
          onChange={(e) => set(b.id, { [prop]: e.target.value })} placeholder={placeholder}
          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-400" />
        {tokens.length > 0 && (
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
            {tokens.map((k) => {
              const known = fieldMap.has(k);
              const v = descFieldValue(sample, k, l);
              return (
                <span key={k} className={known ? "" : "text-red-600"}>
                  <code className="font-mono">{`{${k}}`}</code> = {known ? fieldName(k) : "ไม่พบฟิลด์นี้ (จะว่าง)"}{known && (v ? ` → ${v.length > 40 ? `${v.slice(0, 40)}…` : v}` : " (ว่างในสินค้านี้)")}
                </span>
              );
            })}
          </p>
        )}
      </div>
    );
  };

  const whenEditor = (b: DescBlock) => {
    const when: DescWhen = b.when ?? { match: "all", rules: [] };
    const setWhen = (w: DescWhen | undefined) => set(b.id, { when: w });
    const setRule = (i: number, patch: Partial<DescRule>) => setWhen({ ...when, rules: when.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    const addRule = (f: DescFieldOption) => setWhen({ ...when, rules: [...when.rules, { field: f.key, op: f.type === "boolean" ? "true" : "filled" }] });
    const isText = DESC_BLOCK_DEFS[b.key].kind === "text";
    return (
      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-violet-700">แสดงบล็อกนี้เมื่อ</span>
          {when.rules.length > 1 && (
            <select value={when.match} onChange={(e) => setWhen({ ...when, match: e.target.value === "any" ? "any" : "all" })}
              className="h-7 rounded-md border border-slate-200 bg-white px-1 text-[11px]">
              <option value="all">ตรงทุกข้อ (และ)</option>
              <option value="any">ตรงข้อใดข้อหนึ่ง (หรือ)</option>
            </select>
          )}
          {when.rules.length > 0 && (
            <button type="button" onClick={() => setWhen(undefined)} className="ml-auto text-[10px] text-slate-400 hover:text-red-600 hover:underline">ลบเงื่อนไขทั้งหมด</button>
          )}
        </div>
        {when.rules.map((r, i) => {
          const f = fieldMap.get(r.field);
          const ops = opsFor(f?.type ?? "text");
          const od = opDef(r.op);
          const ok = descRuleTrue(r, sample);
          const listId = `dl-${b.id}-${i}`;
          const suggest = [...new Set([...(f?.options ?? []), descFieldValue(sample, r.field, "th")].filter(Boolean))];
          return (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <span className="w-6 text-right text-[10px] text-slate-400">{i === 0 ? "ถ้า" : when.match === "any" ? "หรือ" : "และ"}</span>
              <FieldMenu fields={allFields} sample={sample} lang="th"
                onPick={(nf) => setRule(i, { field: nf.key, ...(opsFor(nf.type).includes(r.op) ? {} : { op: nf.type === "boolean" ? "true" : "filled" }) })}
                trigger={(toggle) => (
                  <button type="button" onClick={toggle} className={`h-7 max-w-[11rem] truncate rounded-md border px-2 text-xs ${f ? "border-slate-200 bg-white text-slate-800" : "border-red-300 bg-red-50 text-red-700"}`}>
                    {f ? f.label : `${r.field} (ไม่พบ)`} ▾
                  </button>
                )} />
              <select value={r.op} onChange={(e) => {
                const op = e.target.value as DescOp;
                setRule(i, opDef(op).value ? { op } : { op, value: undefined });
              }} className="h-7 rounded-md border border-slate-200 bg-white px-1 text-xs">
                {ops.map((op) => <option key={op} value={op}>{opDef(op).label}</option>)}
              </select>
              {od.value && (
                <>
                  <input value={r.value ?? ""} onChange={(e) => setRule(i, { value: e.target.value })} list={listId}
                    inputMode={r.op === "gt" || r.op === "lt" ? "decimal" : undefined} placeholder="ค่า"
                    className="h-7 w-36 rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <datalist id={listId}>{suggest.map((o) => <option key={o} value={o}>{f?.optionLabels?.[o] ?? o}</option>)}</datalist>
                </>
              )}
              <span title="ผลกับสินค้าที่เปิดอยู่" className={`text-[10px] ${ok ? "text-emerald-600" : "text-slate-400"}`}>{ok ? "✓ ตรง" : "✗ ไม่ตรง"}</span>
              <button type="button" onClick={() => setWhen(when.rules.length > 1 ? { ...when, rules: when.rules.filter((_, j) => j !== i) } : undefined)}
                title="ลบเงื่อนไขนี้" className="h-7 rounded-md px-1.5 text-xs text-slate-300 hover:bg-red-50 hover:text-red-500">✕</button>
            </div>
          );
        })}
        <FieldMenu fields={allFields} sample={sample} lang="th" onPick={addRule}
          trigger={(toggle) => (
            <button type="button" onClick={toggle} className="rounded-md border border-dashed border-violet-300 px-2 py-1 text-[11px] text-violet-700 hover:bg-violet-50">
              ＋ {when.rules.length ? "เพิ่มเงื่อนไข" : "เลือกฟิลด์ที่ใช้เป็นเงื่อนไข"}
            </button>
          )} />
        {isText && when.rules.length > 0 && (
          <div className="space-y-2 rounded-md bg-slate-50 p-2">
            <p className="text-[11px] text-slate-500">ถ้า<b>ไม่ตรง</b>เงื่อนไข ใช้ข้อความนี้แทน (เว้นว่าง = ไม่แสดงบล็อกนี้)</p>
            {textArea(b, "else_text", "ไทย", "เว้นว่าง = ไม่แสดง")}
            {textArea(b, "else_text_en", "EN", "เว้นว่าง = ไม่แสดงในฉบับอังกฤษ")}
          </div>
        )}
      </div>
    );
  };

  return (
    <ERPModal open onClose={onClose} title={`⚙ ${fieldLabel} — แก้สูตร`} size="xl" hasUnsavedChanges={dirty && !saving}
      description="ลาก ⠿ สลับลำดับ · ติ๊กเปิด/ปิด · ✏️ แก้ข้อความ + แทรกข้อมูลจากฟิลด์ใดก็ได้ · ถ้า… ตั้งเงื่อนไข · มีผลกับทุกสินค้า (ไทย + อังกฤษ)"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button type="button" onClick={() => { setBlocks(DEFAULT_DESC_BLOCKS.map((x) => ({ ...x }))); setEditing(null); setCondFor(null); }}
            className="text-xs text-slate-500 hover:text-slate-800 hover:underline">คืนค่าตั้งต้น (เหมือนสูตรเดิม)</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving || (!dirty && configured)}
              className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
          </div>
        </div>
      }>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* บล็อก */}
        <div className="space-y-1.5">
          {!configured && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">ตอนนี้ใช้สูตรเดิม — แก้แล้วกดบันทึก จะเปลี่ยนเป็นสูตรแบบบล็อกนี้ (ค่าตั้งต้นได้ข้อความเหมือนเดิม)</p>}
          {blocks.map((b, i) => {
            const def = DESC_BLOCK_DEFS[b.key];
            const canEdit = def.kind === "text" || b.key === "details";
            const open = editing === b.id;
            const condOpen = condFor === b.id;
            const hasWhen = !!b.when?.rules.length;
            const pass = descWhenTrue(b.when, sample);
            return (
              <div key={b.id} {...rowProps(i)} className={`rounded-lg border px-2 py-1.5 ${b.on ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/60"} ${rowCls(i)}`}>
                <div className="flex items-center gap-2">
                  <DragHandle {...handleProps(i)} />
                  <input type="checkbox" checked={b.on} onChange={(e) => set(b.id, { on: e.target.checked })} className="h-4 w-4 accent-violet-600" aria-label={`เปิด ${def.label}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${b.on ? "font-medium text-slate-800" : "text-slate-400 line-through"}`}>
                      {b.key === "text" ? `📝 ${(b.text ?? "").split("\n")[0] || "ข้อความพิมพ์เอง"}` : def.label}
                    </p>
                    {hasWhen && b.when
                      ? <p className="truncate text-[10px] text-violet-700" title={whenText(b.when)}>ถ้า {whenText(b.when)} · <span className={pass ? "text-emerald-600" : "text-slate-400"}>{pass ? "สินค้านี้: แสดง" : "สินค้านี้: ไม่แสดง"}</span></p>
                      : <p className="truncate text-[10px] text-slate-400">{def.hint}</p>}
                  </div>
                  {i > 0 && (
                    <select value={b.gap} onChange={(e) => set(b.id, { gap: e.target.value as DescBlock["gap"] })} title="ระยะห่างจากบล็อกด้านบน"
                      className="h-7 rounded-md border border-slate-200 bg-white px-1 text-[11px] text-slate-600">
                      <option value="blank">เว้นบรรทัด</option>
                      <option value="line">ติดบรรทัดบน</option>
                    </select>
                  )}
                  <button type="button" onClick={() => setCondFor(condOpen ? null : b.id)} title="ตั้งเงื่อนไข — แสดงบล็อกนี้เมื่อ…"
                    className={`h-7 rounded-md px-1.5 text-[11px] font-medium ${condOpen || hasWhen ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>ถ้า…</button>
                  {canEdit && <button type="button" onClick={() => setEditing(open ? null : b.id)} title="แก้ข้อความ" className={`h-7 rounded-md px-1.5 text-xs ${open ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>✏️</button>}
                  {b.key === "text" && <button type="button" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} title="ลบบล็อกนี้" className="h-7 rounded-md px-1.5 text-xs text-slate-300 hover:bg-red-50 hover:text-red-500">🗑</button>}
                </div>
                {open && canEdit && (
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    {b.key === "details" && <p className="text-[11px] text-slate-500">หัวข้อที่อยู่เหนือคำอธิบายสินค้า (ลบข้อความ = ไม่มีหัวข้อ)</p>}
                    {textArea(b, "text", "ไทย")}
                    {textArea(b, "text_en", "EN", b.key === "text" ? "ว่าง = ไม่ใส่ในฉบับอังกฤษ" : "")}
                  </div>
                )}
                {condOpen && whenEditor(b)}
              </div>
            );
          })}
          <button type="button" onClick={addText} className="w-full rounded-lg border border-dashed border-violet-300 py-2 text-sm text-violet-700 hover:bg-violet-50">＋ เพิ่มข้อความพิมพ์เอง</button>
        </div>

        {/* ตัวอย่างสด */}
        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-medium text-violet-700">ตัวอย่าง{sample.code ? ` (${String(sample.code)})` : ""}</span>
            <span className="inline-flex overflow-hidden rounded border border-slate-200 text-[11px] font-semibold">
              {(["th", "en"] as const).map((l) => (
                <button key={l} type="button" onClick={() => setLang(l)} className={`px-2 py-0.5 ${lang === l ? "bg-violet-600 text-white" : "bg-white text-slate-500"}`}>{l.toUpperCase()}</button>
              ))}
            </span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-violet-100 bg-violet-50/40 p-3 text-xs leading-relaxed text-slate-800">
            {preview || <span className="text-slate-400">— ว่าง —</span>}
          </div>
        </div>
      </div>
      {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
    </ERPModal>
  );
}
