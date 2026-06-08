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
import { useState, useEffect, useRef, useLayoutEffect, useCallback, type RefObject, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import type { CuttingBlock } from "@/app/api/bom/cutting-blocks/route";
import type { BomComponent } from "@/app/api/bom/components/route";
import type { MaterialGroup } from "@/app/api/bom/material-groups/route";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import { ERPModal } from "@/components/modal";

export type EditorLine = {
  key:            string;
  component_id:   string | null;     // sku uuid (สำหรับติด tag)
  component_sku:  string;
  component_name: string;
  image_key:      string | null;     // รูปวัตถุดิบ (cover_image_r2_key)
  material_group_id: string | null;
  material_type:  string;            // ชื่อกลุ่ม เช่น "ผ้า"
  qty:            number;
  uom:            string;
  uom_id:         string | null;
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
    material_group_id: null, material_type: "", qty: 0, uom: "หลา", uom_id: null, waste_percent: 0, is_optional: false,
    cut_block_id: null, cut_block_code: "", pieces: 1, cut_width: 0, cut_length: 0, face_width_cm: 0, slot_code: null,
  };
}

// ---- helper คำนวณ (กฎมาจากตาราง material_groups; calc_method = area_face|area_100|length|count) ----
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const lineArea = (l: EditorLine) => (l.cut_width || 0) * (l.cut_length || 0) * (l.pieces || 1);
const dash = <span className="text-slate-300 text-xs">—</span>;
type GroupInfo = { calc_method: string; divisor: number };
/** คิดปริมาณ — คืน null ถ้าข้อมูลไม่พอ (เก็บปริมาณเดิมไว้ ไม่ทับด้วย 0) */
function calcLine(l: EditorLine, g: GroupInfo | undefined): number | null {
  const m = g?.calc_method ?? "manual";
  const d = g?.divisor || 90;
  const k = 1 + (l.waste_percent || 0) / 100;
  if (m === "count")     return l.pieces || 0;
  if (m === "length")    return l.cut_length ? r4(l.cut_length * k / d) : null;
  if (m === "area_100")  return (l.cut_width && l.cut_length) ? r4(lineArea(l) * k / d) : null;
  if (m === "area_face") return (l.cut_width && l.cut_length && l.face_width_cm) ? r4(lineArea(l) * k / l.face_width_cm / d) : null;
  return null; // manual → พิมพ์เอง
}

const inputCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400";

// dropdown ลอยผ่าน portal — ไม่โดนตาราง scroll บัง + เด้งขึ้นบนเมื่อพื้นที่ล่างไม่พอ
function FloatingPanel({ anchorRef, open, children }: { anchorRef: RefObject<HTMLDivElement | null>; open: boolean; children: ReactNode }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setStyle(null); return; }
    const r = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 300 && r.top > spaceBelow;
    const width = Math.min(Math.max(r.width, 340), window.innerWidth - 16);
    setStyle({
      position: "fixed",
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      zIndex: 60,
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open, anchorRef]);
  if (!open || !style) return null;
  return createPortal(<div style={style} onMouseDown={(e) => e.stopPropagation()}>{children}</div>, document.body);
}
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
export function ComponentPicker({ sku, name, imageKey, placeholder = "— เลือกวัตถุดิบ —", onPick }: { sku: string; name: string; imageKey?: string | null; placeholder?: string; onPick: (c: BomComponent) => void }) {
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
        {sku ? <><Thumb k={imageKey ?? null} /><span className="truncate"><code className="text-xs text-slate-500">{sku}</code> <span className="text-slate-700">{name}</span></span></> : <span className="text-slate-400">{placeholder}</span>}
      </button>
      <FloatingPanel anchorRef={boxRef} open={open}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อวัตถุดิบ..." className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="max-h-72 overflow-auto py-1">
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
      </FloatingPanel>
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
      <FloatingPanel anchorRef={boxRef} open={open}>
        <div className="bg-white border border-slate-200 rounded-lg shadow-xl">
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
      </FloatingPanel>
    </div>
  );
}

// ============================================================
// BomLineEditor
// ============================================================
export function BomLineEditor({
  lines, onChange, readonly,
}: { lines: EditorLine[]; onChange: (lines: EditorLine[]) => void; readonly?: boolean }) {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [uoms, setUoms] = useState<{ id: string; name: string }[]>([]);
  const [detail, setDetail] = useState<EditorLine | null>(null);
  const [editFace, setEditFace] = useState<Set<string>>(new Set());
  const [editUom, setEditUom] = useState<Set<string>>(new Set());
  useEffect(() => {
    apiFetch("/api/bom/material-groups").then((r) => r.json()).then((j) => setGroups((j.data ?? []) as MaterialGroup[])).catch(() => {});
    apiFetch("/api/admin/picker?table=uoms&label=name&limit=100").then((r) => r.json())
      .then((j) => setUoms(((j.data ?? []) as { id: string; label: string }[]).map((o) => ({ id: o.id, name: o.label })))).catch(() => {});
  }, []);
  const toggleSet = (set: Set<string>, key: string, on: boolean) => { const n = new Set(set); if (on) n.add(key); else n.delete(key); return n; };

  // กฎคำนวณของชนิด (จากตาราง material_groups)
  const groupOf = (name: string): GroupInfo | undefined => {
    const g = groups.find((x) => x.name === name);
    return g ? { calc_method: g.calc_method, divisor: g.divisor ?? 90 } : undefined;
  };
  const methodOf  = (l: EditorLine) => groupOf(l.material_type)?.calc_method ?? "manual";
  const lineCalc  = (l: EditorLine) => calcLine(l, groupOf(l.material_type));
  const isArea    = (l: EditorLine) => { const m = methodOf(l); return m === "area_face" || m === "area_100"; };
  const usesWidth  = (l: EditorLine) => isArea(l);
  const usesLength = (l: EditorLine) => { const m = methodOf(l); return m === "area_face" || m === "area_100" || m === "length"; };
  const usesFace   = (l: EditorLine) => methodOf(l) === "area_face";
  const showStatus = (l: EditorLine) => isArea(l);
  const needFace   = (l: EditorLine) => methodOf(l) === "area_face" && (l.cut_width > 0 || l.cut_length > 0) && !l.face_width_cm;

  // คิดปริมาณใหม่ทุกครั้งที่แก้ (เว้นกลุ่ม manual ที่พิมพ์เอง)
  const recalc = (l: EditorLine): EditorLine => { const c = lineCalc(l); return c == null ? l : { ...l, qty: c }; };

  // เลือกวัตถุดิบ → autofill ชนิด/หน้ากว้าง/เผื่อเสีย
  const pickComponent = (l: EditorLine, c: BomComponent): Partial<EditorLine> => ({
    component_id: c.id, component_sku: c.code, component_name: c.name, image_key: c.image_key ?? null,
    material_group_id: c.material_group_id, material_type: c.material_type ?? "",
    face_width_cm: c.fabric_width_cm ?? l.face_width_cm,
    waste_percent: c.loss_percent ?? l.waste_percent,
    uom: c.uom_name ?? l.uom, uom_id: c.uom_id ?? l.uom_id,
  });

  const resolveSkuId = async (l: EditorLine): Promise<string | null> => {
    if (l.component_id) return l.component_id;
    if (!l.component_sku) return null;
    try { const res = await apiFetch(`/api/bom/components?search=${encodeURIComponent(l.component_sku)}`); const j = await res.json();
      return ((j.data ?? []) as BomComponent[]).find((c) => c.code === l.component_sku)?.id ?? null; } catch { return null; }
  };

  // เขียนหน้ากว้างกลับไปที่ SKU (เพื่อครั้งหน้าใช้ซ้ำ)
  const saveFaceToSku = async (l: EditorLine) => {
    const skuId = await resolveSkuId(l);
    if (skuId) apiFetch("/api/bom/components", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_id: skuId, fabric_width_cm: l.face_width_cm || null }) }).catch(() => {});
    setEditFace((s) => toggleSet(s, l.key, false));
  };

  // เขียนหน่วยกลับไปที่ SKU
  const saveUomToSku = async (l: EditorLine, uomId: string, uomName: string, update: (p: Partial<EditorLine>) => void) => {
    update({ uom_id: uomId, uom: uomName });
    const skuId = await resolveSkuId(l);
    if (skuId) apiFetch("/api/bom/components", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_id: skuId, uom_id: uomId }) }).catch(() => {});
    setEditUom((s) => toggleSet(s, l.key, false));
  };

  // เลือกชนิดให้ SKU (บันทึก material_group_id ที่ SKU ด้วย เพื่อครั้งหน้าใช้ซ้ำ)
  const tagGroup = async (l: EditorLine, update: (p: Partial<EditorLine>) => void, groupId: string) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    update({ material_group_id: g.id, material_type: g.name, waste_percent: g.loss_percent ?? l.waste_percent });
    const skuId = await resolveSkuId(l);
    if (skuId) apiFetch("/api/bom/components", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_id: skuId, material_group_id: g.id }) }).catch(() => {});
  };

  const columns: LineColumn<EditorLine>[] = [
    {
      key: "component", header: "วัตถุดิบ", minWidth: 250, sortable: true,
      getValue: (l) => l.component_name || l.component_sku,
      render: (l, u) => (
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0"><ComponentPicker sku={l.component_sku} name={l.component_name} imageKey={l.image_key} onPick={(c) => u(pickComponent(l, c))} /></div>
          {l.component_sku && (
            <button type="button" title="รายละเอียดวัตถุดิบ" onClick={() => setDetail(l)}
              className="shrink-0 h-7 w-6 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">ℹ</button>
          )}
        </div>
      ),
    },
    {
      key: "material_type", header: "ชนิด", width: 130, sortable: true,
      getValue: (l) => l.material_type,
      groupLabel: (l) => l.material_type || "— ไม่ระบุชนิด —",
      render: (l, u, ro) =>
        l.material_type ? (
          <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 inline-block truncate max-w-full" title={l.material_type}>{l.material_type}</span>
        ) : ro ? <span className="text-slate-300 text-xs">—</span> : (
          <select value="" onChange={(e) => e.target.value && tagGroup(l, u, e.target.value)} className={`${inputCls} text-amber-700`} title="เลือกชนิดวัตถุดิบให้ SKU">
            <option value="">＋ เลือกชนิด</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        ),
    },
    {
      key: "status", header: "สถานะ", width: 92, align: "center",
      getValue: (l) => (l.cut_block_code ? "done" : "wait"),
      render: (l) => !showStatus(l)
        ? <span className="text-slate-300 text-xs">—</span>
        : l.cut_block_code
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
      render: (l, u, ro) => !usesWidth(l) ? dash : <input type="number" min={0} step="any" value={l.cut_width} disabled={ro || !!l.cut_block_code}
        title={l.cut_block_code ? "ดึงจากบล็อก" : ""} onChange={(e) => u({ cut_width: Number(e.target.value) })} className={`${inputCls} text-right`} />,
    },
    {
      key: "cut_length", header: "ยาว", width: 64, align: "right",
      render: (l, u, ro) => !usesLength(l) ? dash : <input type="number" min={0} step="any" value={l.cut_length} disabled={ro || !!l.cut_block_code}
        title={l.cut_block_code ? "ดึงจากบล็อก" : ""} onChange={(e) => u({ cut_length: Number(e.target.value) })} className={`${inputCls} text-right`} />,
    },
    {
      key: "face_width_cm", header: "หน้ากว้าง", width: 104, align: "right",
      render: (l, u, ro) => {
        if (!usesFace(l)) return dash;
        if (ro) return <span className="block px-2 text-sm text-right text-slate-700">{l.face_width_cm || "—"}</span>;
        const editing = editFace.has(l.key) || needFace(l);
        return editing ? (
          <div className="flex items-center gap-1">
            <input type="number" min={0} step="any" value={l.face_width_cm} autoFocus={editFace.has(l.key)}
              title="กรอกหน้ากว้าง แล้วกด 💾 บันทึกกลับ SKU"
              onChange={(e) => u({ face_width_cm: Number(e.target.value) })}
              className={`${inputCls} text-right ${needFace(l) ? "border-red-400 bg-red-50" : ""}`} />
            <button type="button" title="บันทึกกลับ SKU" onClick={() => saveFaceToSku(l)}
              className="shrink-0 h-7 w-6 flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded">💾</button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <span className="text-sm text-slate-700 tabular-nums">{l.face_width_cm}</span>
            <button type="button" title="แก้หน้ากว้าง (ของ SKU)" onClick={() => setEditFace((s) => toggleSet(s, l.key, true))}
              className="shrink-0 h-6 w-5 flex items-center justify-center text-slate-300 hover:text-blue-600 rounded">✏</button>
          </div>
        );
      },
    },
    {
      key: "waste_percent", header: "% เผื่อเสีย", width: 82, align: "right",
      render: (l) => !usesLength(l) ? dash
        : <span className="block px-2 text-sm text-right tabular-nums text-slate-600" title="แก้ที่ตารางกลุ่มวัตถุดิบ">{l.waste_percent}</span>,
    },
    {
      key: "area", header: "คำนวณพื้นที่", width: 92, align: "right",
      getValue: (l) => lineArea(l),
      render: (l) => !isArea(l)
        ? <span className="text-slate-300 text-xs">—</span>
        : <span className="block px-1 text-xs text-right tabular-nums text-slate-500">{r2(lineArea(l))}</span>,
    },
    {
      key: "calc", header: "คำนวณ", width: 84, align: "right",
      getValue: (l) => lineCalc(l) ?? 0,
      render: (l) => { const c = lineCalc(l); return c == null
        ? <span className="text-slate-300 text-xs">—</span>
        : <span className="block px-1 text-xs text-right tabular-nums text-slate-500">{c}</span>; },
    },
    {
      key: "qty", header: "ปริมาณ", width: 86, align: "right", sortable: true, summable: true,
      getValue: (l) => l.qty,
      render: (l, u, ro) =>
        lineCalc(l) == null ? (
          <input type="number" min={0} step="any" value={l.qty} disabled={ro}
            onChange={(e) => u({ qty: Number(e.target.value) })} className={`${inputCls} text-right`} />
        ) : (
          <span className="block px-2 text-sm text-right tabular-nums font-semibold text-emerald-700" title="คำนวณอัตโนมัติ">{r2(l.qty)}</span>
        ),
    },
    {
      key: "uom", header: "หน่วย", width: 96,
      getValue: (l) => l.uom,
      render: (l, u, ro) => {
        if (ro) return <span className="text-sm text-slate-700">{l.uom || "—"}</span>;
        const editing = editUom.has(l.key) || !l.uom;
        return editing ? (
          <select value={l.uom_id ?? ""} autoFocus={editUom.has(l.key)}
            onChange={(e) => { const o = uoms.find((x) => x.id === e.target.value); if (o) saveUomToSku(l, o.id, o.name, u); }}
            className={inputCls} title="เลือกหน่วย แล้วบันทึกกลับ SKU">
            <option value="">— เลือก —</option>
            {uoms.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-sm text-slate-700 flex-1 truncate">{l.uom}</span>
            <button type="button" title="แก้หน่วย (ของ SKU)" onClick={() => setEditUom((s) => toggleSet(s, l.key, true))}
              className="shrink-0 h-6 w-5 flex items-center justify-center text-slate-300 hover:text-blue-600 rounded">✏</button>
          </div>
        );
      },
    },
    {
      key: "is_optional", header: "ทางเลือก", width: 64, align: "center",
      render: (l, u, ro) => <input type="checkbox" checked={l.is_optional} disabled={ro}
        onChange={(e) => u({ is_optional: e.target.checked })} className="rounded border-slate-300" />,
    },
  ];

  return (
    <>
      <LineItemsGrid<EditorLine>
        rows={lines}
        columns={columns}
        onChange={(rows) => onChange(rows.map(recalc))}
        rowId={(l) => l.key}
        readonly={readonly}
        storageKey="bom-lines"
        stickyHeader
        maxHeight="56vh"
        onAdd={emptyLine}
        addLabel="＋ เพิ่มวัตถุดิบ"
        emptyText="ยังไม่มีวัตถุดิบในสูตรนี้"
        groupByOptions={[{ key: "material_type", label: "ชนิดวัตถุดิบ" }, { key: "uom", label: "หน่วย" }]}
        footer={<span className="text-sm text-slate-600">รวม <span className="font-bold text-slate-900">{lines.length}</span> รายการ</span>}
      />

      <ERPModal open={detail !== null} onClose={() => setDetail(null)} size="sm" title="รายละเอียดวัตถุดิบ">
        {detail && (
          <div className="flex gap-3 text-sm">
            <Thumb k={detail.image_key} size={96} />
            <div className="flex-1 space-y-1 min-w-0 select-text">
              <div><span className="text-slate-400">รหัส:</span> <code className="text-slate-700">{detail.component_sku || "—"}</code></div>
              <div><span className="text-slate-400">ชื่อ:</span> {detail.component_name || "—"}</div>
              <div><span className="text-slate-400">ชนิด:</span> {detail.material_type || "— ยังไม่ระบุ —"}</div>
              <div><span className="text-slate-400">หน้ากว้างผ้า:</span> {detail.face_width_cm || "—"} ซม.</div>
              <div><span className="text-slate-400">บล็อกตัด:</span> {detail.cut_block_code || "—"}</div>
              <div><span className="text-slate-400">กว้าง×ยาว×ชิ้น:</span> {detail.cut_width}×{detail.cut_length}×{detail.pieces}</div>
              <div><span className="text-slate-400">% เผื่อเสีย:</span> {detail.waste_percent}</div>
              <div><span className="text-slate-400">ปริมาณ:</span> <b className="text-emerald-700">{r2(detail.qty)}</b> {detail.uom}</div>
            </div>
          </div>
        )}
      </ERPModal>
    </>
  );
}
