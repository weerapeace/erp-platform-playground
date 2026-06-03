"use client";

/**
 * BomLineEditor — ตารางรายการวัตถุดิบใน 1 สูตร (ใช้ตารางกลาง LineItemsGrid)
 *
 * ชั้น 2: 2 โหมดต่อบรรทัด
 *   - manual: พิมพ์ปริมาณตรง ๆ
 *   - block : เลือกบล็อกตัด (ดึงกว้าง×ยาว) + ชนิดวัตถุดิบ (auto-fill หน้ากว้าง/เผื่อเสีย/หน่วย)
 *             → ระบบคิดปริมาณให้: พื้นที่=กว้าง×ยาว×ชิ้น → ×(1+เผื่อเสีย) ÷ หน้ากว้าง ÷ ตัวแปลงหน่วย
 *   ตั้งค่ากลางต่อชนิด (bom_calc_settings) override ต่อบรรทัดได้
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { PickerOption } from "@/app/api/admin/picker/route";
import type { CuttingBlock } from "@/app/api/bom/cutting-blocks/route";
import type { CalcSetting } from "@/app/api/bom/calc-settings/route";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";

export type EditorLine = {
  key:            string;
  slot_code:      string | null;
  component_sku:  string;
  component_name: string;
  qty:            number;
  uom:            string;
  waste_percent:  number;
  is_optional:    boolean;
  source?:        string | null;
  odoo_bom_line_id?: number | null;
  // ชั้น 2
  calc_mode:      "manual" | "block";
  cut_block_id:   number | null;
  cut_block_code: string;
  pieces:         number;
  cut_width:      number;
  cut_length:     number;
  face_width_cm:  number;
  material_type:  string;
};

let _seq = 0;
function genKey() { return `l${Date.now()}_${_seq++}`; }
export function emptyLine(): EditorLine {
  return {
    key: genKey(), slot_code: null, component_sku: "", component_name: "", qty: 1, uom: "Units",
    waste_percent: 0, is_optional: false,
    calc_mode: "manual", cut_block_id: null, cut_block_code: "", pieces: 1,
    cut_width: 0, cut_length: 0, face_width_cm: 0, material_type: "",
  };
}

const uomToCm = (uom: string) =>
  /หลา|yard/i.test(uom) ? 91.44 : /เมตร|^m$|metre|meter/i.test(uom) ? 100 : 1;

/** คิดปริมาณจากบล็อกตัด (ปัดทศนิยม 4 ตำแหน่ง) — คืน qty เดิมถ้าโหมด manual หรือข้อมูลไม่พอ */
export function computeQty(l: EditorLine, cmPerUnit?: number): number {
  if (l.calc_mode !== "block") return l.qty;
  const face = l.face_width_cm;
  if (!face || !l.cut_width || !l.cut_length) return 0;
  const area = l.cut_width * l.cut_length * (l.pieces || 1);
  const usedCm = (area * (1 + (l.waste_percent || 0) / 100)) / face;
  const per = cmPerUnit || uomToCm(l.uom);
  return Math.round((usedCm / (per || 1)) * 10000) / 10000;
}

// ============================================================
// SkuPicker — ค้นหา SKU จาก skus_v2 (ของกลาง /api/admin/picker)
// ============================================================
export function SkuPicker({
  sku, name, onPick, placeholder = "— เลือก SKU —",
}: {
  sku: string; name: string; onPick: (sku: string, name: string) => void; placeholder?: string;
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

  useEffect(() => { if (!open) return; const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [open, search, load]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 truncate">
        {sku ? <span><code className="text-xs text-slate-500">{sku}</code> <span className="text-slate-700">{name}</span></span>
             : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[420px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อวัตถุดิบ..."
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา...</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">ไม่พบวัตถุดิบ</div>}
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => { onPick(o.label, o.secondary ?? ""); setOpen(false); }}
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
// CutBlockPicker — ค้นหาบล็อกตัดจาก odoo_cutting_blocks (/api/bom/cutting-blocks)
// ============================================================
function CutBlockPicker({
  code, disabled, onPick,
}: {
  code: string; disabled?: boolean; onPick: (b: CuttingBlock) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const [options, setOptions] = useState<CuttingBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/bom/cutting-blocks${q ? `?search=${encodeURIComponent(q)}` : ""}`);
      const json = await res.json();
      setOptions((json.data ?? []) as CuttingBlock[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!open) return; const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [open, search, load]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <button type="button" disabled={disabled} onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 truncate disabled:bg-slate-50 disabled:text-slate-300">
        {code ? <code className="text-xs text-slate-700">{code}</code> : <span className="text-slate-400">— เลือกบล็อก —</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[360px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัสบล็อก เช่น A-4-18..."
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา...</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">ไม่พบบล็อก</div>}
            {options.map((b) => (
              <button key={b.id} type="button" onClick={() => { onPick(b); setOpen(false); }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <code className="text-xs text-slate-700 shrink-0">{b.code}</code>
                  <span className="text-[11px] text-slate-400 truncate">{b.type}</span>
                </span>
                <span className="text-xs text-slate-500 shrink-0 tabular-nums">{b.width}×{b.length} ซม.</span>
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
const inputCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400";

export function BomLineEditor({
  lines, onChange, readonly,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  readonly?: boolean;
}) {
  const [settings, setSettings] = useState<CalcSetting[]>([]);
  useEffect(() => {
    apiFetch("/api/bom/calc-settings").then((r) => r.json()).then((j) => setSettings((j.data ?? []) as CalcSetting[])).catch(() => {});
  }, []);
  const settingOf = (type: string) => settings.find((s) => s.material_type === type);
  const cmPerUnitOf = (l: EditorLine) => settingOf(l.material_type)?.cm_per_unit ?? uomToCm(l.uom);

  // recompute qty ของบรรทัดโหมด block ทุกครั้งที่แก้ (manual ไม่แตะ)
  const recalc = (l: EditorLine): EditorLine =>
    l.calc_mode === "block" ? { ...l, qty: computeQty(l, cmPerUnitOf(l)) } : l;

  const pickType = (l: EditorLine, type: string): Partial<EditorLine> => {
    const s = settingOf(type);
    return {
      material_type: type,
      // auto-fill (override ต่อบรรทัดได้ภายหลัง)
      face_width_cm: s?.default_face_width_cm ?? l.face_width_cm,
      waste_percent: s?.loss_percent ?? l.waste_percent,
      uom: s?.uom ?? l.uom,
    };
  };

  const columns: LineColumn<EditorLine>[] = [
    {
      key: "component", header: "วัตถุดิบ", minWidth: 240, sortable: true,
      getValue: (l) => l.component_name || l.component_sku,
      render: (l, u) => (
        <SkuPicker sku={l.component_sku} name={l.component_name} placeholder="— เลือกวัตถุดิบ —"
          onPick={(sku, name) => u({ component_sku: sku, component_name: name })} />
      ),
    },
    {
      key: "calc_mode", header: "โหมด", width: 92, sortable: true,
      getValue: (l) => l.calc_mode,
      render: (l, u, ro) => (
        <select value={l.calc_mode} disabled={ro} onChange={(e) => u({ calc_mode: e.target.value as EditorLine["calc_mode"] })} className={inputCls}>
          <option value="manual">พิมพ์เอง</option>
          <option value="block">คำนวณ</option>
        </select>
      ),
    },
    {
      key: "material_type", header: "ชนิด", width: 120, sortable: true,
      getValue: (l) => l.material_type,
      groupLabel: (l) => l.material_type || "— ไม่ระบุชนิด —",
      render: (l, u, ro) => (
        <select value={l.material_type} disabled={ro} onChange={(e) => u(pickType(l, e.target.value))} className={inputCls}>
          <option value="">—</option>
          {settings.map((s) => <option key={s.material_type} value={s.material_type}>{s.material_type}</option>)}
        </select>
      ),
    },
    {
      key: "cut_block", header: "บล็อกตัด", width: 150,
      render: (l, u, ro) => (
        <CutBlockPicker code={l.cut_block_code} disabled={ro || l.calc_mode !== "block"}
          onPick={(b) => u({ cut_block_id: b.id, cut_block_code: b.code, cut_width: b.width ?? 0, cut_length: b.length ?? 0 })} />
      ),
    },
    {
      key: "pieces", header: "ชิ้น", width: 58, align: "right",
      render: (l, u, ro) => (
        <input type="number" min={0} step="any" value={l.pieces} disabled={ro || l.calc_mode !== "block"}
          onChange={(e) => u({ pieces: Number(e.target.value) })} className={`${inputCls} text-right`} />
      ),
    },
    {
      key: "cut_width", header: "กว้าง", width: 66, align: "right",
      render: (l, u, ro) => (
        <input type="number" min={0} step="any" value={l.cut_width} disabled={ro || l.calc_mode !== "block"}
          onChange={(e) => u({ cut_width: Number(e.target.value) })} className={`${inputCls} text-right`} />
      ),
    },
    {
      key: "cut_length", header: "ยาว", width: 66, align: "right",
      render: (l, u, ro) => (
        <input type="number" min={0} step="any" value={l.cut_length} disabled={ro || l.calc_mode !== "block"}
          onChange={(e) => u({ cut_length: Number(e.target.value) })} className={`${inputCls} text-right`} />
      ),
    },
    {
      key: "face_width_cm", header: "หน้ากว้าง", width: 80, align: "right",
      render: (l, u, ro) => (
        <input type="number" min={0} step="any" value={l.face_width_cm} disabled={ro || l.calc_mode !== "block"}
          onChange={(e) => u({ face_width_cm: Number(e.target.value) })} className={`${inputCls} text-right`} />
      ),
    },
    {
      key: "waste_percent", header: "% เผื่อเสีย", width: 86, align: "right",
      render: (l, u, ro) => (
        <input type="number" min={0} step="any" value={l.waste_percent} disabled={ro}
          onChange={(e) => u({ waste_percent: Number(e.target.value) })} className={`${inputCls} text-right`} />
      ),
    },
    {
      key: "qty", header: "ปริมาณ", width: 90, align: "right", sortable: true,
      getValue: (l) => l.qty,
      render: (l, u, ro) =>
        l.calc_mode === "block" ? (
          <span className="block px-2 text-sm text-right tabular-nums font-medium text-emerald-700" title="คำนวณอัตโนมัติ">{l.qty}</span>
        ) : (
          <input type="number" min={0} step="any" value={l.qty} disabled={ro}
            onChange={(e) => u({ qty: Number(e.target.value) })} className={`${inputCls} text-right`} />
        ),
    },
    {
      key: "uom", header: "หน่วย", width: 80,
      getValue: (l) => l.uom,
      render: (l, u, ro) => (
        <input type="text" value={l.uom} disabled={ro}
          onChange={(e) => u({ uom: e.target.value })} className={inputCls} />
      ),
    },
    {
      key: "is_optional", header: "ทางเลือก", width: 70, align: "center",
      render: (l, u, ro) => (
        <input type="checkbox" checked={l.is_optional} disabled={ro}
          onChange={(e) => u({ is_optional: e.target.checked })} className="rounded border-slate-300" />
      ),
    },
  ];

  return (
    <LineItemsGrid<EditorLine>
      rows={lines}
      columns={columns}
      onChange={(rows) => onChange(rows.map(recalc))}
      rowId={(l) => l.key}
      readonly={readonly}
      onAdd={emptyLine}
      addLabel="＋ เพิ่มวัตถุดิบ"
      emptyText="ยังไม่มีวัตถุดิบในสูตรนี้"
      groupByOptions={[{ key: "material_type", label: "ชนิดวัตถุดิบ" }, { key: "uom", label: "หน่วย" }]}
      footer={<span className="text-sm text-slate-600">รวม <span className="font-bold text-slate-900">{lines.length}</span> รายการ</span>}
    />
  );
}
