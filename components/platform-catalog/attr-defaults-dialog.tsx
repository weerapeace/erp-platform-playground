"use client";

/**
 * ป๊อป "ค่าเริ่มต้นของร้าน" — ตั้งค่าที่ใส่ให้ช่องคุณลักษณะของหมวดอัตโนมัติ (ของกลาง · ใช้ได้ทุกร้าน — Shopee ใช้แล้ว)
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-20 (ทดสอบ LY22): ประเทศ = ไทย · สภาพ = ใหม่ · ประเภทการประกัน = ประกันจากผู้ผลิต · ระยะรับประกัน/ขนาด เอาจากสินค้า
 *   <AttrDefaultsDialog open onClose platform="shopee" platformName="Shopee" brandId={…} rules={pv.attrs.rules} custom={pv.attrs.rulesCustom}
 *     fieldNames={pv.attrs.fields.map((f) => f.name)} canEdit onSaved={reload} />
 * เก็บ: ui_config key = listingAttrDefaultsKey(platform, brandId) → { rules } ผ่าน PATCH /api/ui-config (products.edit · บันทึกประวัติ setting_change)
 * กติกา (pure + เทสต์) = lib/listing-attr-defaults · ใส่ให้เฉพาะช่องที่ยังว่าง — ค่าที่บันทึกไว้ในร่างมาก่อนเสมอ
 * แก้ได้ทุกแถว · ลบแถวได้ · "กลับไปใช้ค่าเริ่มต้นของระบบ" · บันทึกแล้วกด "ย้อนกลับ" ในแจ้งผลได้ 5 วินาที
 * ของกลางที่ใช้: ERPModal · SearchableSelect (ชื่อช่อง พิมพ์เองได้) · Icon · toast
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { SearchableSelect } from "@/components/searchable-select";
import { ATTR_DEFAULT_SOURCE_LABEL, DEFAULT_ATTR_RULES, listingAttrDefaultsKey, type AttrDefaultRule, type AttrDefaultSource } from "@/lib/listing-attr-defaults";

const SOURCES: AttrDefaultSource[] = ["fixed", "warranty", "size", "weight"];
const same = (a: AttrDefaultRule[], b: AttrDefaultRule[]) => JSON.stringify(a) === JSON.stringify(b);
const clean = (rows: AttrDefaultRule[]): AttrDefaultRule[] => rows
  .map((r) => ({ field: r.field.trim(), source: r.source, ...(r.source === "fixed" ? { value: (r.value ?? "").trim() } : {}) }))
  .filter((r) => r.field && (r.source !== "fixed" || r.value));

export function AttrDefaultsDialog({ open, onClose, platform, platformName, brandId, brandName, rules, custom, fieldNames, canEdit, onSaved }: {
  open: boolean;
  onClose: () => void;
  /** รหัสร้าน (shopee / tiktok / lazada) — ใช้ทำ key ที่เก็บ */
  platform: string;
  platformName: string;
  brandId: string | null;
  brandName?: string | null;
  /** กติกาที่ใช้อยู่ตอนนี้ (ของร้าน หรือของระบบ) */
  rules: AttrDefaultRule[];
  /** ร้านตั้งเองแล้ว (false = ยังใช้ค่าเริ่มต้นของระบบ) */
  custom: boolean;
  /** ชื่อช่องของหมวดที่เปิดอยู่ — ให้เลือกง่าย (พิมพ์ชื่ออื่นเองได้) */
  fieldNames?: string[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<AttrDefaultRule[]>(rules);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setRows(rules); }, [open, rules]);
  const dirty = !same(clean(rows), clean(rules));
  const nameOpts = useMemo(() => [...new Set([...(fieldNames ?? []), ...rows.map((r) => r.field)].filter(Boolean))].map((n) => ({ value: n, label: n })), [fieldNames, rows]);
  const bad = rows.some((r) => !r.field.trim() || (r.source === "fixed" && !(r.value ?? "").trim()));

  const save = async (value: Record<string, unknown>, msg: string, undoTo: { value: Record<string, unknown> } | null) => {
    if (!brandId) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", body: JSON.stringify({ key: listingAttrDefaultsKey(platform, brandId), value }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      onSaved(); onClose();
      if (undoTo) toast.undo(msg, () => { void apiFetch("/api/ui-config", { method: "PATCH", body: JSON.stringify({ key: listingAttrDefaultsKey(platform, brandId), value: undoTo.value }) }).then(() => onSaved()); });
      else toast.success(msg);
    } catch (e) { toast.error((e as Error).message || "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const before = custom ? { value: { rules } } : { value: {} };
  const set = (i: number, patch: Partial<AttrDefaultRule>) => setRows((xs) => xs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <ERPModal open={open} onClose={onClose} size="lg" hasUnsavedChanges={dirty} storageKey="attr-defaults-dialog"
      title={`ค่าเริ่มต้นของร้าน — ${platformName}${brandName ? ` · ${brandName}` : ""}`}
      description="ช่องคุณลักษณะที่ชื่อตรงกับรายการนี้ จะใส่ค่าให้อัตโนมัติตอนลงสินค้าใหม่ (เฉพาะช่องที่ยังว่าง · แก้ทีละสินค้าได้เสมอ)"
      footer={canEdit ? (
        <div className="flex w-full flex-wrap items-center gap-2">
          {custom && <button type="button" disabled={saving} onClick={() => void save({}, "กลับไปใช้ค่าเริ่มต้นของระบบแล้ว", before)} className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">กลับไปใช้ค่าเริ่มต้นของระบบ</button>}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-slate-200 px-3 text-sm hover:bg-slate-50">ยกเลิก</button>
          <button type="button" disabled={saving || !dirty || bad || !brandId} onClick={() => void save({ rules: clean(rows) }, "บันทึกค่าเริ่มต้นของร้านแล้ว", before)}
            className="h-8 rounded-md bg-violet-600 px-3 text-sm text-white hover:bg-violet-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      ) : undefined}>
      <div className="space-y-2">
        <p className={`rounded-lg px-3 py-1.5 text-xs ${custom ? "bg-violet-50 text-violet-800" : "bg-slate-50 text-slate-600"}`}>
          {custom ? "ร้านนี้ตั้งค่าเองแล้ว" : "ตอนนี้ใช้ค่าเริ่มต้นของระบบ — แก้แล้วกดบันทึก = เป็นค่าของร้านนี้"}
          {!brandId && <span className="text-rose-600"> · สินค้ายังไม่มีแบรนด์ — บันทึกไม่ได้</span>}
        </p>
        {/* PC: ตาราง 4 ช่อง · มือถือ: การ์ดซ้อนกัน */}
        <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] gap-2 px-1 text-[11px] text-slate-500 sm:grid">
          <span>ชื่อช่องของร้าน</span><span>ใส่ค่าจาก</span><span>ค่า</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_2rem] sm:border-0 sm:p-0 sm:px-1">
            <div className="min-w-0">
              <span className="mb-0.5 block text-[11px] text-slate-500 sm:hidden">ชื่อช่องของร้าน</span>
              {canEdit ? <SearchableSelect value={r.field} options={nameOpts} onChange={(v) => set(i, { field: v })} onCreate={(q) => set(i, { field: q })} createLabel="ใช้ชื่อนี้" placeholder="เลือก หรือพิมพ์ชื่อช่อง" />
                : <div className="text-sm">{r.field}</div>}
              {r.field.trim().endsWith("*") && <span className="mt-0.5 block text-[10px] text-slate-400">ลงท้าย * = ช่องที่ชื่อขึ้นต้นด้วยคำนี้</span>}
            </div>
            <button type="button" disabled={!canEdit} onClick={() => setRows((xs) => xs.filter((_, k) => k !== i))} aria-label="ลบแถวนี้" title="ลบแถวนี้"
              className="row-span-3 self-start rounded-md p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30 sm:order-last sm:row-span-1"><Icon name="delete" /></button>
            <div className="min-w-0">
              <span className="mb-0.5 block text-[11px] text-slate-500 sm:hidden">ใส่ค่าจาก</span>
              <select value={r.source} disabled={!canEdit} onChange={(e) => set(i, { source: e.target.value as AttrDefaultSource })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                {SOURCES.map((s) => <option key={s} value={s}>{ATTR_DEFAULT_SOURCE_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <span className="mb-0.5 block text-[11px] text-slate-500 sm:hidden">ค่า</span>
              {r.source === "fixed"
                ? <input value={r.value ?? ""} disabled={!canEdit} onChange={(e) => set(i, { value: e.target.value })} placeholder="เช่น ไทย / ใหม่" className={`h-9 w-full rounded-md border px-2 text-sm ${!(r.value ?? "").trim() ? "border-rose-300" : "border-slate-200"}`} />
                : <div className="flex h-9 items-center text-xs text-slate-500">ดึงจากสินค้าแต่ละตัว (ไม่มีข้อมูล = เว้นว่าง)</div>}
            </div>
          </div>
        ))}
        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => setRows((xs) => [...xs, { field: "", source: "fixed", value: "" }])} className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-50"><Icon name="add" />เพิ่มช่อง</button>
            {!same(clean(rows), DEFAULT_ATTR_RULES) && <button type="button" onClick={() => setRows(DEFAULT_ATTR_RULES)} className="h-8 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-50">ใส่ชุดค่าเริ่มต้นของระบบ</button>}
          </div>
        )}
        <p className="text-[11px] text-slate-400">ช่องที่ให้เลือกจากรายการ: ค่าต้องตรงกับตัวเลือกของร้าน (ไม่ตรง = เว้นว่างให้เลือกเอง) · ช่องที่พิมพ์ได้ = ใส่ตามที่ตั้ง</p>
      </div>
    </ERPModal>
  );
}
