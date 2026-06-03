"use client";

/**
 * BomLineEditor — ตารางรายการวัตถุดิบใน 1 สูตร
 * - เลือกวัตถุดิบจาก skus_v2 ผ่าน /api/admin/picker (ของกลาง) → autofill รหัส+ชื่อ
 * - แก้ จำนวน / หน่วย / % เผื่อเสีย / ทางเลือก ได้
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { PickerOption } from "@/app/api/admin/picker/route";

export type EditorLine = {
  key:            string;   // local-only id สำหรับ React
  slot_code:      string | null;
  component_sku:  string;
  component_name: string;
  qty:            number;
  uom:            string;
  waste_percent:  number;
  is_optional:    boolean;
  source?:        string | null;
  odoo_bom_line_id?: number | null;
};

let _seq = 0;
function genKey() { return `l${Date.now()}_${_seq++}`; }
export function emptyLine(): EditorLine {
  return { key: genKey(), slot_code: null, component_sku: "", component_name: "", qty: 1, uom: "Units", waste_percent: 0, is_optional: false };
}

// ============================================================
// SkuPicker — ค้นหา SKU จาก skus_v2 (ของกลาง /api/admin/picker)
// ใช้ซ้ำได้ทั้งเลือกวัตถุดิบ (component) และสินค้าหัวสูตร (product)
// ============================================================
export function SkuPicker({
  sku, name, onPick, placeholder = "— เลือก SKU —",
}: {
  sku: string;
  name: string;
  onPick: (sku: string, name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ table: "skus_v2", label: "code", secondary: "name_th", search_in: "code,name_th", limit: "30" });
      if (q) params.set("search", q);
      const res = await apiFetch(`/api/admin/picker?${params}`);
      const json = await res.json();
      setOptions((json.data ?? []) as PickerOption[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [open, search, load]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 truncate">
        {sku
          ? <span><code className="text-xs text-slate-500">{sku}</code> <span className="text-slate-700">{name}</span></span>
          : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[420px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา รหัส / ชื่อวัตถุดิบ..."
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา...</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">ไม่พบวัตถุดิบ</div>}
            {options.map((o) => (
              <button key={o.id} type="button"
                onClick={() => { onPick(o.label, o.secondary ?? ""); setOpen(false); }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center gap-2">
                <code className="text-xs text-slate-500 shrink-0">{o.label}</code>
                <span className="text-sm text-slate-700 truncate">{o.secondary}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BomLineEditor
// ============================================================
export function BomLineEditor({
  lines, onChange, readonly,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  readonly?: boolean;
}) {
  const add    = () => onChange([...lines, emptyLine()]);
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));
  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      <div className="hidden sm:grid grid-cols-[36px_1fr_90px_90px_90px_70px_36px] gap-2 px-1 text-xs font-medium text-slate-400">
        <span>#</span><span>วัตถุดิบ</span><span className="text-right">จำนวน</span><span>หน่วย</span>
        <span className="text-right">% เผื่อเสีย</span><span className="text-center">ทางเลือก</span><span />
      </div>

      {lines.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-400 mb-2">ยังไม่มีวัตถุดิบในสูตรนี้</p>
          {!readonly && <button type="button" onClick={add} className="text-sm text-blue-600 hover:text-blue-800 font-medium">＋ เพิ่มวัตถุดิบรายการแรก</button>}
        </div>
      ) : (
        <>
          {lines.map((line, idx) => (
            <div key={line.key} className="grid grid-cols-[36px_1fr_90px_90px_90px_70px_36px] gap-2 items-center">
              <span className="text-xs text-slate-400 text-center tabular-nums">{idx + 1}</span>
              <SkuPicker sku={line.component_sku} name={line.component_name} placeholder="— เลือกวัตถุดิบ —"
                onPick={(sku, name) => update(line.key, { component_sku: sku, component_name: name })} />
              <input type="number" min={0} step="any" value={line.qty} disabled={readonly}
                onChange={(e) => update(line.key, { qty: Number(e.target.value) })}
                className="h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
              <input type="text" value={line.uom} disabled={readonly}
                onChange={(e) => update(line.key, { uom: e.target.value })}
                className="h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
              <input type="number" min={0} step="any" value={line.waste_percent} disabled={readonly}
                onChange={(e) => update(line.key, { waste_percent: Number(e.target.value) })}
                className="h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
              <div className="flex justify-center">
                <input type="checkbox" checked={line.is_optional} disabled={readonly}
                  onChange={(e) => update(line.key, { is_optional: e.target.checked })}
                  className="rounded border-slate-300" />
              </div>
              {!readonly ? (
                <button type="button" onClick={() => remove(line.key)}
                  className="h-9 w-9 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">✕</button>
              ) : <span />}
            </div>
          ))}
          {!readonly && (
            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={add} className="text-sm text-blue-600 hover:text-blue-800 font-medium">＋ เพิ่มวัตถุดิบ</button>
              <div className="text-sm text-slate-600">รวม <span className="font-bold text-slate-900">{lines.length}</span> รายการ</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
