"use client";

/**
 * BomLineEditor — ตารางวัตถุดิบใน 1 สูตร (ใช้ตารางกลาง LineItemsGrid)  [เฟส 1]
 *
 * บรรทัดปรับตัวเองตามข้อมูล (ไม่มีโหมด):
 *   - เลือกวัตถุดิบ → ดึง "ชนิด" (กลุ่มวัตถุดิบของ SKU) + หน้ากว้าง (fabric_width_cm) + %เผื่อเสีย (ตามกลุ่ม) อัตโนมัติ
 *   - ใส่บล็อกตัด → กว้าง/ยาว ดึงจากบล็อก (ล็อกช่อง) · ไม่ใส่บล็อก → พิมพ์กว้าง/ยาวเองได้
 *   - คิดปริมาณตามชนิด:
 *       ผ้า/PU/ผ้า(ชิ้น)/ลายพิมพ์/ตัวเสริม : พื้นที่×(1+เผื่อเสีย) ÷ หน้ากว้าง ÷ 90
 *       หนัง                               : พื้นที่×(1+เผื่อเสีย) ÷ 100
 *       ซิป/สาย-เทป                        : ยาว×(1+เผื่อเสีย) ÷ 90
 *       อะไหล่                             : = ชิ้น
 *   - ไม่มีกลุ่ม → พิมพ์ปริมาณเองได้ + มีปุ่มติด tag กลุ่มให้ SKU
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { CuttingBlock } from "@/app/api/bom/cutting-blocks/route";
import type { BomComponent } from "@/app/api/bom/components/route";
import type { MaterialFamily } from "@/app/api/bom/material-families/route";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";

export type EditorLine = {
  key:            string;
  component_id:   string | null;     // sku uuid (สำหรับติด tag)
  component_sku:  string;
  component_name: string;
  image_key:      string | null;     // รูปวัตถุดิบ (cover_image_r2_key)
  material_family_id: string | null;
  material_type:  string;            // ชื่อกลุ่ม เช่น "ผ้า"
  qty:            number;
  uom:            string;
  waste_percent:  number;
  is_optional:    boolean;
  cut_block_id:   number | null;
  cut_block_code: string;
  pieces:         number;
  cut_width:      number;
  cut_length:     number;
  face_width_cm:  number;
  slot_code:      string | null;
  source?:        string | null;
  odoo_bom_line_id?: number | null;
};

let _seq = 0;
const genKey = () => `l${Date.now()}_${_seq++}`;
export function emptyLine(): EditorLine {
  return {
    key: genKey(), component_id: null, component_sku: "", component_name: "", image_key: null,
    material_family_id: null, material_type: "", qty: 0, uom: "หลา", waste_percent: 0, is_optional: false,
    cut_block_id: null, cut_block_code: "", pieces: 1, cut_width: 0, cut_length: 0, face_width_cm: 0, slot_code: null,
  };
}

// ---- สูตรตามชนิด ----
const AREA_FACE = ["ผ้า", "ผ้า (ชิ้น)", "PU", "ลายพิมพ์", "ตัวเสริม"];
const AREA_100  = ["หนัง"];
const LENGTH_90 = ["ซิป", "สาย/เทป"];
const COUNT     = ["อะไหล่"];
export type CalcClass = "area_face" | "area_100" | "length_90" | "count" | "manual";
export function calcClass(materialType: string): CalcClass {
  if (AREA_FACE.includes(materialType)) return "area_face";
  if (AREA_100.includes(materialType))  return "area_100";
  if (LENGTH_90.includes(materialType)) return "length_90";
  if (COUNT.includes(materialType))     return "count";
  return "manual";
}
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const lineArea = (l: EditorLine) => (l.cut_width || 0) * (l.cut_length || 0) * (l.pieces || 1);
export function lineCalc(l: EditorLine): number {
  const cls = calcClass(l.material_type);
  const k = 1 + (l.waste_percent || 0) / 100;
  if (cls === "count")     return l.pieces || 0;
  if (cls === "length_90") return r4((l.cut_length || 0) * k / 90);
  if (cls === "area_100")  return r4(lineArea(l) * k / 100);
  if (cls === "area_face") return l.face_width_cm ? r4(lineArea(l) * k / l.face_width_cm / 90) : 0;
  return l.qty; // manual
}
const needFace = (l: EditorLine) => calcClass(l.material_type) === "area_face" && !l.face_width_cm;

const inputCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400";
const thumbUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
function Thumb({ k, size = 22 }: { k: string | null; size?: number }) {
  if (!k) return <span className="inline-block rounded bg-slate-100 shrink-0" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbUrl(k)} alt="" loading="lazy" className="rounded object-cover bg-slate-50 shrink-0" style={{ width: size, height: size }} />;
}

// ============================================================
// SkuPicker — เลือก SKU ทั่วไป (หัวสูตร product) ผ่าน /api/admin/picker
// ============================================================
export function SkuPicker({
  sku, name, onPick, placeholder = "— เลือก SKU —",
}: { sku: string; name: string; onPick: (sku: string, name: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; label: string; secondary?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ table: "skus_v2", label: "code", secondary: "name_th", search_in: "code,name_th", limit: "30" });
      if (q) params.set("search", q);
      const res = await apiFetch(`/api/admin/picker?${params}`); const json = await res.json();
      setOptions((json.data ?? []) as Array<{ id: string; label: string; secondary?: string }>);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [open, search, load]);
  useEffect(() => { const f = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 truncate">
        {sku ? <span><code className="text-xs text-slate-500">{sku}</code> <span className="text-slate-700">{name}</span></span> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[420px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อ..." className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา...</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">ไม่พบ</div>}
            {options.map((o) => (
              <button key={o.id} type="button" onClick={() => { onPick(o.label, o.secondary ?? ""); setOpen(false); }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center gap-2">
                <code className="text-xs text-slate-500 shrink-0">{o.label}</code><span className="text-sm text-slate-700 truncate">{o.secondary}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ComponentPicker — เลือกวัตถุดิบ (คืนกลุ่ม+หน้ากว้าง+loss) ผ่าน /api/bom/components
// ============================================================
function ComponentPicker({ sku, name, imageKey, onPick }: { sku: string; name: string; imageKey?: string | null; onPick: (c: BomComponent) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<BomComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async (q: string) => {
    setLoading(true);
    try { const res = await apiFetch(`/api/bom/components${q ? `?search=${encodeURIComponent(q)}` : ""}`); const json = await res.json(); setOptions((json.data ?? []) as BomComponent[]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [open, search, load]);
  useEffect(() => { const f = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-1.5 overflow-hidden">
        {sku ? <><Thumb k={imageKey ?? null} /><span className="truncate"><code className="text-xs text-slate-500">{sku}</code> <span className="text-slate-700">{name}</span></span></> : <span className="text-slate-400">— เลือกวัตถุดิบ —</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[440px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อวัตถุดิบ..." className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">กำลังค้นหา...</div>}
            {!loading && options.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">ไม่พบวัตถุดิบ</div>}
            {options.map((c) => (
              <button key={c.id} type="button" onClick={() => { onPick(c); setOpen(false); }}
                className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center gap-2">
                <Thumb k={c.image_key} size={26} />
                <code className="text-xs text-slate-500 shrink-0">{c.code}</code>
                <span className="text-sm text-slate-700 truncate flex-1">{c.name}</span>
                {c.material_type && <span className="text-[10px] px-1.5 rounded bg-slate-100 text-slate-500 shrink-0">{c.material_type}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CutBlockPicker — เลือกบล็อกตัด (/api/bom/cutting-blocks)
// ============================================================
function CutBlockPicker({ code, disabled, width, length, onPick }: { code: string; disabled?: boolean; width: number; length: number; onPick: (b: CuttingBlock) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<CuttingBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const createBlock = async () => {
    const newCode = search.trim();
    if (!newCode || !(width > 0) || !(length > 0)) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/bom/cutting-blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: newCode, width, length }) });
      const j = await res.json();
      if (j.data) { onPick(j.data as CuttingBlock); setOpen(false); }
    } finally { setCreating(false); }
  };
  const load = useCallback(async (q: string) => {
    setLoading(true);
    try { const res = await apiFetch(`/api/bom/cutting-blocks${q ? `?search=${encodeURIComponent(q)}` : ""}`); const json = await res.json(); setOptions((json.data ?? []) as CuttingBlock[]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!open) return; const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [open, search, load]);
  useEffect(() => { const f = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, []);
  return (
    <div ref={boxRef} className="relative">
      <button type="button" disabled={disabled} onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-9 px-2 text-left text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 truncate disabled:bg-slate-50 disabled:text-slate-300">
        {code ? <code className="text-xs text-slate-700">{code}</code> : <span className="text-slate-400">— เลือกบล็อก —</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[360px] max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัสบล็อก เช่น A-4-18..." className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                  {b.source === "manual" && <span className="text-[9px] px-1 rounded bg-blue-50 text-blue-600 shrink-0">ใหม่</span>}
                </span>
                <span className="text-xs text-slate-500 shrink-0 tabular-nums">{b.width}×{b.length}</span>
              </button>
            ))}
          </div>
          {/* สร้างบล็อกใหม่จากกว้าง/ยาวที่พิมพ์ */}
          {search.trim() && !options.some((o) => o.code === search.trim()) && (
            <div className="border-t border-slate-100 p-2">
              {width > 0 && length > 0 ? (
                <button type="button" disabled={creating} onClick={createBlock}
                  className="w-full text-left text-xs px-2 py-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                  ＋ สร้างบล็อก &ldquo;{search.trim()}&rdquo; ({width}×{length} ซม.)
                </button>
              ) : (
                <p className="text-[11px] text-slate-400 px-1">พิมพ์ กว้าง/ยาว ในบรรทัดก่อน จึงจะสร้างบล็อกใหม่ได้</p>
              )}
            </div>
          )}
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
}: { lines: EditorLine[]; onChange: (lines: EditorLine[]) => void; readonly?: boolean }) {
  const [families, setFamilies] = useState<MaterialFamily[]>([]);
  useEffect(() => {
    apiFetch("/api/bom/material-families").then((r) => r.json()).then((j) => setFamilies((j.data ?? []) as MaterialFamily[])).catch(() => {});
  }, []);

  // คิดปริมาณใหม่ทุกครั้งที่แก้ (เว้นกลุ่ม manual ที่พิมพ์เอง)
  const recalc = (l: EditorLine): EditorLine =>
    calcClass(l.material_type) === "manual" ? l : { ...l, qty: lineCalc(l) };

  // เลือกวัตถุดิบ → autofill ชนิด/หน้ากว้าง/เผื่อเสีย
  const pickComponent = (l: EditorLine, c: BomComponent): Partial<EditorLine> => ({
    component_id: c.id, component_sku: c.code, component_name: c.name, image_key: c.image_key ?? null,
    material_family_id: c.material_family_id, material_type: c.material_type ?? "",
    face_width_cm: c.fabric_width_cm ?? l.face_width_cm,
    waste_percent: c.loss_percent ?? l.waste_percent,
  });

  // เขียนหน้ากว้างกลับไปที่ SKU (เพื่อครั้งหน้าใช้ซ้ำ)
  const saveFaceToSku = async (l: EditorLine) => {
    let skuId = l.component_id;
    if (!skuId && l.component_sku) {
      try { const res = await apiFetch(`/api/bom/components?search=${encodeURIComponent(l.component_sku)}`); const j = await res.json();
        skuId = ((j.data ?? []) as BomComponent[]).find((c) => c.code === l.component_sku)?.id ?? null; } catch { /* ignore */ }
    }
    if (skuId) apiFetch("/api/bom/components", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_id: skuId, fabric_width_cm: l.face_width_cm || null }) }).catch(() => {});
  };

  // ติด tag กลุ่มให้ SKU (บันทึกที่ SKU ด้วย เพื่อครั้งหน้าใช้ซ้ำ)
  const tagFamily = async (l: EditorLine, update: (p: Partial<EditorLine>) => void, familyId: string) => {
    const fam = families.find((f) => f.id === familyId);
    if (!fam) return;
    update({ material_family_id: fam.id, material_type: fam.name, waste_percent: fam.loss_percentage ?? l.waste_percent });
    let skuId = l.component_id;
    if (!skuId && l.component_sku) {
      try { const res = await apiFetch(`/api/bom/components?search=${encodeURIComponent(l.component_sku)}`); const j = await res.json();
        skuId = ((j.data ?? []) as BomComponent[]).find((c) => c.code === l.component_sku)?.id ?? null; } catch { /* ignore */ }
    }
    if (skuId) apiFetch("/api/bom/components", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_id: skuId, material_family_id: fam.id }) }).catch(() => {});
  };

  const columns: LineColumn<EditorLine>[] = [
    {
      key: "component", header: "วัตถุดิบ", minWidth: 230, sortable: true,
      getValue: (l) => l.component_name || l.component_sku,
      render: (l, u) => <ComponentPicker sku={l.component_sku} name={l.component_name} imageKey={l.image_key} onPick={(c) => u(pickComponent(l, c))} />,
    },
    {
      key: "material_type", header: "ชนิด", width: 130, sortable: true,
      getValue: (l) => l.material_type,
      groupLabel: (l) => l.material_type || "— ไม่ระบุชนิด —",
      render: (l, u, ro) =>
        l.material_type ? (
          <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 inline-block truncate max-w-full" title={l.material_type}>{l.material_type}</span>
        ) : ro ? <span className="text-slate-300 text-xs">—</span> : (
          <select value="" onChange={(e) => e.target.value && tagFamily(l, u, e.target.value)} className={`${inputCls} text-amber-700`} title="ติด tag กลุ่มวัตถุดิบให้ SKU">
            <option value="">＋ ติด tag</option>
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        ),
    },
    {
      key: "status", header: "สถานะ", width: 92, align: "center",
      getValue: (l) => (l.cut_block_code ? "done" : "wait"),
      render: (l) => l.cut_block_code
        ? <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">✓ done</span>
        : <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700">รอ block</span>,
    },
    {
      key: "cut_block", header: "บล็อกตัด", width: 150,
      render: (l, u, ro) => ro ? <span className="text-xs text-slate-500">{l.cut_block_code || "—"}</span> : (
        <CutBlockPicker code={l.cut_block_code} width={l.cut_width} length={l.cut_length}
          onPick={(b) => u({
            cut_block_id: b.source === "odoo" && /^\d+$/.test(b.id) ? Number(b.id) : null,
            cut_block_code: b.code, cut_width: b.width ?? l.cut_width, cut_length: b.length ?? l.cut_length,
          })} />
      ),
    },
    {
      key: "pieces", header: "ชิ้น", width: 56, align: "right",
      render: (l, u, ro) => <input type="number" min={0} step="any" value={l.pieces} disabled={ro}
        onChange={(e) => u({ pieces: Number(e.target.value) })} className={`${inputCls} text-right`} />,
    },
    {
      key: "cut_width", header: "กว้าง", width: 64, align: "right",
      render: (l, u, ro) => <input type="number" min={0} step="any" value={l.cut_width} disabled={ro || !!l.cut_block_code}
        title={l.cut_block_code ? "ดึงจากบล็อก" : ""} onChange={(e) => u({ cut_width: Number(e.target.value) })} className={`${inputCls} text-right`} />,
    },
    {
      key: "cut_length", header: "ยาว", width: 64, align: "right",
      render: (l, u, ro) => <input type="number" min={0} step="any" value={l.cut_length} disabled={ro || !!l.cut_block_code}
        title={l.cut_block_code ? "ดึงจากบล็อก" : ""} onChange={(e) => u({ cut_length: Number(e.target.value) })} className={`${inputCls} text-right`} />,
    },
    {
      key: "face_width_cm", header: "หน้ากว้าง", width: 104, align: "right",
      render: (l, u, ro) => (
        <div className="flex items-center gap-1">
          <input type="number" min={0} step="any" value={l.face_width_cm} disabled={ro}
            title={needFace(l) ? "กลุ่มนี้ต้องมีหน้ากว้างจึงคำนวณได้ — เพิ่มที่นี่" : ""}
            onChange={(e) => u({ face_width_cm: Number(e.target.value) })}
            className={`${inputCls} text-right ${needFace(l) ? "border-red-400 bg-red-50" : ""}`} />
          {!ro && l.face_width_cm > 0 && l.component_sku && (
            <button type="button" title="บันทึกหน้ากว้างนี้กลับไปที่ SKU (ใช้ซ้ำครั้งหน้า)" onClick={() => saveFaceToSku(l)}
              className="shrink-0 h-7 w-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">💾</button>
          )}
        </div>
      ),
    },
    {
      key: "waste_percent", header: "% เผื่อเสีย", width: 82, align: "right",
      render: (l, u, ro) => <input type="number" min={0} step="any" value={l.waste_percent} disabled={ro}
        onChange={(e) => u({ waste_percent: Number(e.target.value) })} className={`${inputCls} text-right`} />,
    },
    {
      key: "area", header: "คำนวณพื้นที่", width: 92, align: "right",
      getValue: (l) => lineArea(l),
      render: (l) => {
        const cls = calcClass(l.material_type);
        if (cls !== "area_face" && cls !== "area_100") return <span className="text-slate-300 text-xs">—</span>;
        return <span className="block px-1 text-xs text-right tabular-nums text-slate-500">{r2(lineArea(l))}</span>;
      },
    },
    {
      key: "calc", header: "คำนวณ", width: 84, align: "right",
      getValue: (l) => lineCalc(l),
      render: (l) => calcClass(l.material_type) === "manual"
        ? <span className="text-slate-300 text-xs">—</span>
        : <span className="block px-1 text-xs text-right tabular-nums text-slate-500">{lineCalc(l)}</span>,
    },
    {
      key: "qty", header: "ปริมาณ", width: 86, align: "right", sortable: true, summable: true,
      getValue: (l) => l.qty,
      render: (l, u, ro) =>
        calcClass(l.material_type) === "manual" ? (
          <input type="number" min={0} step="any" value={l.qty} disabled={ro}
            onChange={(e) => u({ qty: Number(e.target.value) })} className={`${inputCls} text-right`} />
        ) : (
          <span className="block px-2 text-sm text-right tabular-nums font-semibold text-emerald-700" title="คำนวณอัตโนมัติ">{r2(l.qty)}</span>
        ),
    },
    {
      key: "uom", header: "หน่วย", width: 70,
      getValue: (l) => l.uom,
      setValue: (_l, v) => ({ uom: v }),
      render: (l, u, ro) => <input type="text" value={l.uom} disabled={ro}
        onChange={(e) => u({ uom: e.target.value })} className={inputCls} />,
    },
    {
      key: "is_optional", header: "ทางเลือก", width: 64, align: "center",
      render: (l, u, ro) => <input type="checkbox" checked={l.is_optional} disabled={ro}
        onChange={(e) => u({ is_optional: e.target.checked })} className="rounded border-slate-300" />,
    },
  ];

  return (
    <LineItemsGrid<EditorLine>
      rows={lines}
      columns={columns}
      onChange={(rows) => onChange(rows.map(recalc))}
      rowId={(l) => l.key}
      readonly={readonly}
      storageKey="bom-lines"
      onAdd={emptyLine}
      addLabel="＋ เพิ่มวัตถุดิบ"
      emptyText="ยังไม่มีวัตถุดิบในสูตรนี้"
      groupByOptions={[{ key: "material_type", label: "ชนิดวัตถุดิบ" }, { key: "uom", label: "หน่วย" }]}
      footer={<span className="text-sm text-slate-600">รวม <span className="font-bold text-slate-900">{lines.length}</span> รายการ</span>}
    />
  );
}
