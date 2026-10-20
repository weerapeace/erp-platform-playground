"use client";
/**
 * ⚙ แก้สูตรคำอธิบายแบบบล็อก (ของกลาง) — ปุ่มข้างหัวข้อฟิลด์ computed ชนิด desc_blocks (เช่น Platform Description)
 *   ซ้าย: บล็อก ลาก ⠿ สลับ · ติ๊กเปิด/ปิด · เว้นบรรทัด/ติดบรรทัดบน · ✏️ แก้ข้อความไทย/อังกฤษ + ปุ่มแทรก {แบรนด์} {รับประกัน} …
 *         ＋ เพิ่มข้อความพิมพ์เอง (ลบได้) · คืนค่าตั้งต้น
 *   ขวา: ตัวอย่างสดจากสินค้าที่เปิดอยู่ (ไทย/อังกฤษ)
 * บันทึกลงทะเบียนฟิลด์ relation_config.desc_blocks ทั้งช่องไทย + คู่อังกฤษ (PATCH /api/admin/field-registry-v2/[id] · admin.field_registry.edit + ประวัติ)
 * กฎประกอบ: lib/desc-blocks.ts (มีเทสต์) · props เหมือน NamePartsButton (components/name-parts-editor) → MasterCRUD เลือกตามชนิดสูตร
 */
import { useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { apiFetch } from "@/lib/api";
import {
  buildDescription, cleanDescBlocks, DEFAULT_DESC_BLOCKS, DESC_BLOCK_DEFS, DESC_PLACEHOLDERS,
  type DescBlock, type DescLang,
} from "@/lib/desc-blocks";

export type DescBlocksFieldRef = { id: string; cfg?: Record<string, unknown> | null };

export function DescBlocksButton({ field, enField, sample, fieldLabel, onSaved }: {
  field: DescBlocksFieldRef; enField?: DescBlocksFieldRef; sample: Record<string, unknown>; fieldLabel: string;
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        title="แก้สูตร — เลือกบล็อก เรียงลำดับ แก้ข้อความ (มีผลกับทุกสินค้า)"
        className="ml-1 align-middle text-[12px] leading-none text-slate-300 hover:text-violet-600">⚙</button>
      {/* กันคลิก/ดับเบิลคลิกในป๊อปไหลกลับไปหาช่องในฟอร์ม (ป๊อปอยู่ใน portal แต่ event ยังไหลตามต้นไม้ React) */}
      {open && <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <DescBlocksModal field={field} enField={enField} sample={sample} fieldLabel={fieldLabel} onClose={() => setOpen(false)} onSaved={onSaved} />
      </span>}
    </>
  );
}

function DescBlocksModal({ field, enField, sample, fieldLabel, onClose, onSaved }: {
  field: DescBlocksFieldRef; enField?: DescBlocksFieldRef; sample: Record<string, unknown>; fieldLabel: string;
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const configured = !!field.cfg?.desc_blocks;
  const initial = useMemo(() => cleanDescBlocks(field.cfg?.desc_blocks).blocks, [field.cfg]);
  const [blocks, setBlocks] = useState<DescBlock[]>(() => initial.map((x) => ({ ...x })));
  const [editing, setEditing] = useState<string | null>(null);
  const [lang, setLang] = useState<DescLang>("th");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setBlocks((b) => moveItem(b, from, to)));

  const cfg = { blocks };
  const clean = cleanDescBlocks(cfg);
  const dirty = JSON.stringify(clean.blocks) !== JSON.stringify(cleanDescBlocks({ blocks: initial }).blocks);
  const preview = buildDescription(sample, cfg, lang);
  const set = (id: string, patch: Partial<DescBlock>) => { setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b))); setErr(null); };

  // แทรกตัวแทนตรงตำแหน่งเคอร์เซอร์ (ไม่มีเคอร์เซอร์ = ต่อท้าย)
  const insert = (b: DescBlock, l: DescLang, token: string) => {
    const def = DESC_BLOCK_DEFS[b.key];
    const cur = l === "en" ? (b.text_en ?? (b.key === "text" ? "" : def.en ?? "")) : (b.text ?? def.th ?? "");
    const el = areas.current[`${b.id}:${l}`];
    const at = el ? el.selectionStart ?? cur.length : cur.length;
    const next = cur.slice(0, at) + token + cur.slice(at);
    set(b.id, l === "en" ? { text_en: next } : { text: next });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + token.length, at + token.length); } });
  };
  const addText = () => {
    const id = `text_${Date.now().toString(36)}`;
    setBlocks((bs) => [...bs, { id, key: "text", on: true, gap: "blank", text: "", text_en: "" }]);
    setEditing(id);
  };

  const save = async () => {
    const emptyText = blocks.find((b) => b.key === "text" && !(b.text ?? "").trim() && !(b.text_en ?? "").trim());
    if (emptyText) { setErr("มีบล็อก “ข้อความพิมพ์เอง” ที่ยังว่าง — พิมพ์ข้อความ หรือลบทิ้ง"); setEditing(emptyText.id); return; }
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

  const textArea = (b: DescBlock, l: DescLang) => {
    const def = DESC_BLOCK_DEFS[b.key];
    const value = l === "en" ? (b.text_en ?? (b.key === "text" ? "" : def.en ?? "")) : (b.text ?? def.th ?? "");
    const isDefault = l === "en" ? b.text_en === undefined : b.text === undefined;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-semibold">{l === "en" ? "EN" : "ไทย"}</span>
          {b.key !== "details" && DESC_PLACEHOLDERS.map((p) => (
            <button key={p.token} type="button" onClick={() => insert(b, l, p.token)} title={`แทรก ${p.token}`}
              className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700 hover:bg-violet-100">＋{p.label}</button>
          ))}
          {!isDefault && b.key !== "text" && (
            <button type="button" onClick={() => set(b.id, l === "en" ? { text_en: undefined } : { text: undefined })} className="ml-auto text-[10px] text-slate-400 hover:text-slate-700 hover:underline">↺ ข้อความตั้งต้น</button>
          )}
        </div>
        <textarea ref={(el) => { areas.current[`${b.id}:${l}`] = el; }} value={value} rows={b.key === "ordering" || b.key === "follow" ? 5 : 2}
          onChange={(e) => set(b.id, l === "en" ? { text_en: e.target.value } : { text: e.target.value })}
          placeholder={l === "en" ? (b.key === "text" ? "ว่าง = ไม่ใส่ในฉบับอังกฤษ" : "") : "พิมพ์ข้อความ"}
          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-400" />
      </div>
    );
  };

  return (
    <ERPModal open onClose={onClose} title={`⚙ ${fieldLabel} — แก้สูตร`} size="xl" hasUnsavedChanges={dirty && !saving}
      description="ลาก ⠿ เพื่อสลับลำดับ · ติ๊กเปิด/ปิดบล็อก · ✏️ แก้ข้อความ · มีผลกับทุกสินค้า (ไทย + อังกฤษ)"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button type="button" onClick={() => { setBlocks(DEFAULT_DESC_BLOCKS.map((x) => ({ ...x }))); setEditing(null); }}
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
            return (
              <div key={b.id} {...rowProps(i)} className={`rounded-lg border px-2 py-1.5 ${b.on ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/60"} ${rowCls(i)}`}>
                <div className="flex items-center gap-2">
                  <DragHandle {...handleProps(i)} />
                  <input type="checkbox" checked={b.on} onChange={(e) => set(b.id, { on: e.target.checked })} className="h-4 w-4 accent-violet-600" aria-label={`เปิด ${def.label}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${b.on ? "font-medium text-slate-800" : "text-slate-400 line-through"}`}>
                      {b.key === "text" ? `📝 ${(b.text ?? "").split("\n")[0] || "ข้อความพิมพ์เอง"}` : def.label}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">{def.hint}</p>
                  </div>
                  {i > 0 && (
                    <select value={b.gap} onChange={(e) => set(b.id, { gap: e.target.value as DescBlock["gap"] })} title="ระยะห่างจากบล็อกด้านบน"
                      className="h-7 rounded-md border border-slate-200 bg-white px-1 text-[11px] text-slate-600">
                      <option value="blank">เว้นบรรทัด</option>
                      <option value="line">ติดบรรทัดบน</option>
                    </select>
                  )}
                  {canEdit && <button type="button" onClick={() => setEditing(open ? null : b.id)} title="แก้ข้อความ" className={`h-7 rounded-md px-1.5 text-xs ${open ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}>✏️</button>}
                  {b.key === "text" && <button type="button" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} title="ลบบล็อกนี้" className="h-7 rounded-md px-1.5 text-xs text-slate-300 hover:bg-red-50 hover:text-red-500">🗑</button>}
                </div>
                {open && canEdit && (
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    {b.key === "details" && <p className="text-[11px] text-slate-500">หัวข้อที่อยู่เหนือคำอธิบายสินค้า (ลบข้อความ = ไม่มีหัวข้อ)</p>}
                    {textArea(b, "th")}
                    {textArea(b, "en")}
                  </div>
                )}
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
