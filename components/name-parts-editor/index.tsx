"use client";
/**
 * ⚙ ตั้ง "ชื่อประกอบจากอะไร" (ของกลาง) — ปุ่มข้างหัวข้อฟิลด์ computed ที่ตั้งได้ (เช่น Name Platform ของ Parent SKU)
 *   ติ๊กเลือกชิ้น (แบรนด์/คอลเลกชัน/ชื่อสินค้า/รหัส/หมวด/ข้อความพิมพ์เอง) · ลาก ⠿ สลับตำแหน่ง · ตัวคั่น · ไม่ใส่ซ้ำ
 *   ดูตัวอย่างสดจากสินค้าที่เปิดอยู่ (ไทย + อังกฤษ) ก่อนบันทึก
 * บันทึกลงทะเบียนฟิลด์ (relation_config.name_parts) ผ่าน PATCH /api/admin/field-registry-v2/[id]
 *   (สิทธิ์ admin.field_registry.edit + ประวัติใน erp_field_registry_audit) → มีผลกับทุกสินค้า ทุกคน
 *   ฝั่งไทย + คู่อังกฤษ (ui_style.lang_en) บันทึกพร้อมกัน ใช้ชุดเดียวกัน
 * กฎประกอบชื่อ: lib/name-parts.ts (มีเทสต์) · ใช้ใน MasterCRUD (components/master-crud)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { apiFetch } from "@/lib/api";
import {
  buildNameFromParts, cleanNameParts, DEFAULT_NAME_PARTS, NAME_PART_DEFS, NAME_SEPARATORS,
  type NamePartKey, type NamePartsConfig,
} from "@/lib/name-parts";

export type NamePartsFieldRef = { id: string; cfg?: Record<string, unknown> | null };
type Row = { key: NamePartKey; on: boolean; text: string; text_en: string };

const toRows = (cfg: NamePartsConfig): Row[] => {
  const on = cfg.parts.map((p) => ({ key: p.key, on: true, text: p.text ?? "", text_en: p.text_en ?? "" }));
  const off = NAME_PART_DEFS.filter((d) => !cfg.parts.some((p) => p.key === d.key)).map((d) => ({ key: d.key, on: false, text: "", text_en: "" }));
  return [...on, ...off];
};
const toCfg = (rows: Row[], sep: string, dedupe: boolean): NamePartsConfig => ({
  parts: rows.filter((r) => r.on).map((r) => (r.key === "text" ? { key: r.key, text: r.text.trim(), ...(r.text_en.trim() ? { text_en: r.text_en.trim() } : {}) } : { key: r.key })),
  sep, dedupe,
});

/** ปุ่ม ⚙ เล็ก ๆ ข้างหัวข้อ → เปิดป๊อปตั้งค่า (ผู้เรียกเช็กสิทธิ์ก่อนโชว์) */
export function NamePartsButton({ field, enField, sample, fieldLabel, onSaved }: {
  field: NamePartsFieldRef;
  /** ฟิลด์คู่ภาษาอังกฤษ (บันทึกค่าเดียวกัน) */
  enField?: NamePartsFieldRef;
  /** ข้อมูลสินค้าที่เปิดอยู่ — ใช้ทำตัวอย่าง */
  sample: Record<string, unknown>;
  fieldLabel: string;
  onSaved: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        title="ตั้งค่าว่าชื่อนี้ประกอบจากอะไร + สลับตำแหน่ง (มีผลกับทุกสินค้า)"
        className="ml-1 align-middle text-[12px] leading-none text-slate-300 hover:text-violet-600">⚙</button>
      {/* กันคลิก/ดับเบิลคลิกในป๊อปไหลกลับไปหาช่องในฟอร์ม (ป๊อปอยู่ใน portal แต่ event ยังไหลตามต้นไม้ React) */}
      {open && <span onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}><NamePartsModal field={field} enField={enField} sample={sample} fieldLabel={fieldLabel} onClose={() => setOpen(false)} onSaved={onSaved} /></span>}
    </>
  );
}

function NamePartsModal({ field, enField, sample, fieldLabel, onClose, onSaved }: {
  field: NamePartsFieldRef; enField?: NamePartsFieldRef; sample: Record<string, unknown>; fieldLabel: string;
  onClose: () => void; onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const initial = useMemo(() => cleanNameParts(field.cfg?.name_parts), [field.cfg]);
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [sep, setSep] = useState(initial.sep);
  const [dedupe, setDedupe] = useState(initial.dedupe);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setErr(null), [rows, sep, dedupe]);

  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => setRows((r) => moveItem(r, from, to)));
  const cfg = toCfg(rows, sep, dedupe);
  const dirty = JSON.stringify(cleanNameParts(cfg)) !== JSON.stringify(initial);
  const onCount = rows.filter((r) => r.on).length;
  const textEmpty = rows.some((r) => r.key === "text" && r.on && !r.text.trim() && !r.text_en.trim());
  const previewTh = buildNameFromParts(sample, cfg, "th");
  const previewEn = buildNameFromParts(sample, cfg, "en");
  const set = (key: NamePartKey, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!onCount) { setErr("เลือกอย่างน้อย 1 อย่าง"); return; }
    if (textEmpty) { setErr("ใส่ “ข้อความพิมพ์เอง” ก่อน หรือเอาติ๊กออก"); return; }
    setSaving(true); setErr(null);
    try {
      const value = cleanNameParts(cfg);
      for (const f of [field, enField].filter((x): x is NamePartsFieldRef => !!x)) {
        const r = await apiFetch(`/api/admin/field-registry-v2/${f.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relation_config: { ...(f.cfg ?? {}), name_parts: value } }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.error) throw new Error(r.status === 401 || r.status === 403 ? "ไม่มีสิทธิ์แก้ทะเบียนฟิลด์ (ต้องเป็นแอดมิน)" : (j.error || "บันทึกไม่สำเร็จ"));
      }
      toast.success(`ตั้งค่า “${fieldLabel}” แล้ว — มีผลกับทุกสินค้า`);
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} title={`⚙ ${fieldLabel} — ประกอบจากอะไร`} size="md" hasUnsavedChanges={dirty && !saving}
      description="ติ๊กเลือกสิ่งที่จะอยู่ในชื่อ แล้วลาก ⠿ เพื่อสลับตำแหน่ง · มีผลกับทุกสินค้า (ภาษาไทย + อังกฤษ)"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button type="button" onClick={() => { setRows(toRows(DEFAULT_NAME_PARTS)); setSep(DEFAULT_NAME_PARTS.sep); setDedupe(true); }}
            className="text-xs text-slate-500 hover:text-slate-800 hover:underline">คืนค่าตั้งต้น (ชื่อ + รหัส)</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
            <button type="button" onClick={() => void save()} disabled={saving || !dirty}
              className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40">
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {/* ตัวอย่างสด */}
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-medium text-violet-700">ตัวอย่าง{sample.code ? ` (${String(sample.code)})` : ""}</p>
          <p className="text-sm text-slate-800 break-words">{previewTh || <span className="text-slate-400">— ว่าง —</span>}</p>
          <p className="mt-0.5 text-xs text-slate-500 break-words"><span className="mr-1 rounded bg-white px-1 text-[10px] font-semibold text-slate-400">EN</span>{previewEn || "—"}</p>
        </div>

        {/* ชิ้นส่วน: ติ๊ก + ลากสลับ */}
        <div className="space-y-1.5">
          {rows.map((r, i) => {
            const def = NAME_PART_DEFS.find((d) => d.key === r.key)!;
            return (
              <div key={r.key} {...rowProps(i)}
                className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 ${r.on ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/60"} ${rowCls(i)}`}>
                <DragHandle {...handleProps(i)} className="mt-1" />
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={r.on} onChange={(e) => set(r.key, { on: e.target.checked })} className="mt-1 h-4 w-4 accent-violet-600" />
                  <span className="min-w-0">
                    <span className={`block text-sm ${r.on ? "font-medium text-slate-800" : "text-slate-500"}`}>{def.label}</span>
                    <span className="block text-[11px] text-slate-400">{def.hint}</span>
                  </span>
                </label>
                {r.on && r.key === "text" && (
                  <div className="flex w-44 shrink-0 flex-col gap-1">
                    <input value={r.text} onChange={(e) => set(r.key, { text: e.target.value })} maxLength={60} placeholder="ข้อความ (ไทย)"
                      className="h-8 rounded-md border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                    <input value={r.text_en} onChange={(e) => set(r.key, { text_en: e.target.value })} maxLength={60} placeholder="English (ว่าง = ใช้ไทย)"
                      className="h-8 rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">ตัวคั่นระหว่างชิ้น</span>
            <select value={sep} onChange={(e) => setSep(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
              {NAME_SEPARATORS.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex cursor-pointer items-start gap-2 pt-5">
            <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-600" />
            <span className="text-xs text-slate-600">ไม่ใส่ซ้ำ — ถ้าชื่อสินค้ามีแบรนด์/รหัสอยู่แล้ว ดึงออกมาวางตามลำดับที่ตั้ง</span>
          </label>
        </div>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      </div>
    </ERPModal>
  );
}
