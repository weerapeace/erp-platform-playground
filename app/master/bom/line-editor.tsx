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
import { ComponentPicker } from "@/components/material-picker";
import { fabricQty } from "@/lib/bom-calc";

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
  // เฟส 4: ผันตามไซส์
  size_variant:   boolean;
  size_dim:       string;                     // cut_length | cut_width | pieces | qty
  size_values:    Record<string, number>;     // { "40\"": 100 } คีย์ = ชื่อไซส์
};
export const SIZE_DIMS: [string, string][] = [["cut_length", "ยาว"], ["cut_width", "กว้าง"], ["pieces", "ชิ้น"], ["qty", "จำนวน"]];
// คอลัมน์ที่โชว์ในมุมมอง BASIC (ที่เหลือซ่อน: ช่อง/สถานะ/บล็อกตัด/หน้ากว้าง/%เผื่อเสีย/พื้นที่/ทางเลือก/ผันไซส์)
const BASIC_COLS = new Set(["component", "material_type", "pieces", "cut_width", "cut_length", "calc", "qty", "uom"]);

let _seq = 0;
const genKey = () => `l${Date.now()}_${_seq++}`;
export function emptyLine(): EditorLine {
  return {
    key: genKey(), component_id: null, component_sku: "", component_name: "", image_key: null,
    material_group_id: null, material_type: "", qty: 0, uom: "หลา", uom_id: null, waste_percent: 0, is_optional: false,
    cut_block_id: null, cut_block_code: "", pieces: 1, cut_width: 0, cut_length: 0, face_width_cm: 0, slot_code: null,
    size_variant: false, size_dim: "cut_length", size_values: {},
  };
}

// ช่องวัตถุดิบ (บทบาทในสินค้า) — เก็บใน bom_lines.slot_code · ใช้จัดกลุ่ม "รายละเอียดสั่งงาน"
export const SLOT_ROLES: [string, string][] = [
  ["MATERIALS", "วัตถุดิบหลัก"], ["LINING", "ซับใน"], ["ZIPPER", "ซิป"], ["LOGO", "โลโก้/พิมพ์"],
  ["STRAP", "สาย"], ["THREAD", "ด้าย"], ["HARDWARE", "อะไหล่"], ["OTHER", "อื่นๆ"],
];
// ช่อง → กลุ่มวัตถุดิบ (code) ที่อนุญาตให้เลือก (ปรับได้) · [] = ไม่จำกัด
export const SLOT_GROUP_CODES: Record<string, string[]> = {
  MATERIALS: ["leather", "fabric", "fabric_piece", "pu", "reinforce"],
  LINING:    ["fabric", "fabric_piece", "pu"],
  ZIPPER:    ["zip"],
  LOGO:      ["print", "accessory"],
  STRAP:     ["tape", "leather"],
  THREAD:    ["accessory"],
  HARDWARE:  ["accessory", "reinforce"],
  OTHER:     [],
};

// ---- helper คำนวณ (กฎมาจากตาราง material_groups; calc_method = area_face|area_100|length|count) ----
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const lineArea = (l: EditorLine) => (l.cut_width || 0) * (l.cut_length || 0) * (l.pieces || 1);
const dash = <span className="text-slate-300 text-xs">—</span>;
type GroupInfo = { calc_method: string; divisor: number };
/** คิดปริมาณ — คืน null ถ้าข้อมูลไม่พอ (เก็บปริมาณเดิมไว้ ไม่ทับด้วย 0) */
function calcLine(l: EditorLine, g: GroupInfo | undefined): number | null {
  // กฎคำนวณกลาง (lib/bom-calc) — ใช้ร่วมกับเครื่องคิดเลขผ้า /fabric-calc
  return fabricQty({
    calc_method:   g?.calc_method ?? "manual",
    divisor:       g?.divisor,
    waste_percent: l.waste_percent,
    pieces:        l.pieces,
    cut_width:     l.cut_width,
    cut_length:    l.cut_length,
    face_width_cm: l.face_width_cm,
  });
}

const inputCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400";

// dropdown ลอยผ่าน portal — ไม่โดนตาราง scroll บัง + เด้งขึ้นบนเมื่อพื้นที่ล่างไม่พอ
function FloatingPanel({ anchorRef, open, children, minWidth = 340 }: { anchorRef: RefObject<HTMLDivElement | null>; open: boolean; children: ReactNode; minWidth?: number }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setStyle(null); return; }
    const r = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 300 && r.top > spaceBelow;
    const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 16);
    setStyle({
      position: "fixed",
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      zIndex: 60,
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open, anchorRef, minWidth]);
  if (!open || !style) return null;
  return createPortal(<div style={style} onMouseDown={(e) => e.stopPropagation()}>{children}</div>, document.body);
}
const thumbUrl = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;
function Thumb({ k, size = 22 }: { k: string | null; size?: number }) {
  if (!k) return <span className="inline-block rounded bg-slate-100 shrink-0" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbUrl(k)} alt="" loading="lazy" className="rounded object-cover bg-slate-50 shrink-0" style={{ width: size, height: size }} />;
}

// recently used (วัตถุดิบที่เลือกล่าสุด) — เหมือน ProductPicker ของกลาง
const RECENT_MAT_KEY = "erp-recent-materials";
function loadRecentMat(): BomComponent[] { try { return JSON.parse(localStorage.getItem(RECENT_MAT_KEY) ?? "[]") as BomComponent[]; } catch { return []; } }
function pushRecentMat(c: BomComponent) {
  try { const list = loadRecentMat().filter((x) => x.id !== c.id); localStorage.setItem(RECENT_MAT_KEY, JSON.stringify([c, ...list].slice(0, 8))); } catch { /* ignore */ }
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


// ComponentPicker / MaterialSearchModal ย้ายไปของกลาง @/components/material-picker — re-export ให้ของเดิมที่ import จากไฟล์นี้ยังใช้ได้
export { ComponentPicker };

// patch สำหรับ "เปลี่ยนวัตถุดิบทั้งกลุ่ม" (คงบล็อก/กว้าง/ยาว/จำนวนเดิม เปลี่ยนแค่ตัววัตถุดิบ)
function replacePatch(c: BomComponent): Partial<EditorLine> {
  return {
    component_id: c.id, component_sku: c.code, component_name: c.name, image_key: c.image_key ?? null,
    material_group_id: c.material_group_id, material_type: c.material_type ?? "",
    face_width_cm: c.fabric_width_cm ?? 0, waste_percent: c.loss_percent ?? 0,
    uom: c.uom_name ?? "", uom_id: c.uom_id ?? null,
  };
}
// ปุ่มเปลี่ยนวัตถุดิบทั้งกลุ่ม (โผล่ที่หัวกลุ่มเมื่อจัดกลุ่มตามวัตถุดิบ)
function GroupReplacePicker({ onPick }: { onPick: (c: BomComponent) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">🔁 เปลี่ยนทั้งกลุ่ม</button>;
  return <span className="inline-block w-64 align-middle"><ComponentPicker sku="" name="" placeholder="เลือกวัตถุดิบใหม่..." onPick={(c) => { onPick(c); setOpen(false); }} /></span>;
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
  const [cCode, setCCode] = useState("");
  const [cW, setCW] = useState(0);
  const [cL, setCL] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // เปิดตัวเลือก → เติมกว้าง/ยาวจากบรรทัดให้ (กดสร้างได้เลย)
  useEffect(() => { if (open) { setCCode(""); setCW(width); setCL(length); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const createBlock = async () => {
    const code = cCode.trim();
    if (!code || !(cW > 0) || !(cL > 0)) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/bom/cutting-blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, width: cW, length: cL }) });
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
          {/* เพิ่มบล็อกใหม่ — จากขนาดในบรรทัด หรือกรอกเอง */}
          <div className="border-t border-slate-100 p-2 space-y-1.5">
            <div className="text-[10px] font-medium text-slate-400">เพิ่มบล็อกใหม่</div>
            <div className="flex items-center gap-1">
              <input value={cCode} onChange={(e) => setCCode(e.target.value)} placeholder="รหัสบล็อก เช่น A-4-18"
                className="flex-1 h-8 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" min={0} step="any" value={cW || ""} onChange={(e) => setCW(Number(e.target.value))} placeholder="กว้าง"
                className="w-14 h-8 px-1.5 text-xs text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-slate-300 text-xs">×</span>
              <input type="number" min={0} step="any" value={cL || ""} onChange={(e) => setCL(Number(e.target.value))} placeholder="ยาว"
                className="w-14 h-8 px-1.5 text-xs text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-1">
              {width > 0 && length > 0 && (
                <button type="button" onClick={() => { setCW(width); setCL(length); }} title="ดึงกว้าง/ยาวจากบรรทัด"
                  className="h-7 px-2 text-[11px] rounded bg-slate-100 text-slate-600 hover:bg-slate-200 whitespace-nowrap">↧ ใช้ขนาดในบรรทัด ({width}×{length})</button>
              )}
              <button type="button" disabled={creating || !cCode.trim() || !(cW > 0) || !(cL > 0)} onClick={createBlock}
                className="flex-1 h-7 px-2 text-[11px] rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                {creating ? "กำลังสร้าง…" : "＋ สร้างบล็อก"}
              </button>
            </div>
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
}

// ตัวช่วย "สูตร" ค่าต่อไซส์ — ฐาน(ซม.) + เพิ่ม/ไซส์ (กรอกเป็นนิ้วได้ ระบบ ×2.54 → ซม.) → เติมทุกไซส์
// default: ฐาน = ค่าไซส์เล็กสุดของบรรทัด · /ไซส์ = +4 นิ้ว (= 10.16 ซม.)
const IN_TO_CM = 2.54;
function SizeFormula({ base0, onApply }: { base0?: number; onApply: (base: number, step: number) => void }) {
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const [base, setBase] = useState(base0 != null && base0 > 0 ? String(base0) : "");
  const [unit, setUnit] = useState<"in" | "cm">("in");   // /ไซส์ คิดเป็นนิ้วก่อน (ตามมาตรฐานเข็มขัด)
  const [step, setStep] = useState("4");                  // default +4 นิ้ว = 10.16 ซม.
  const stepCm = unit === "in" ? round4((Number(step) || 0) * IN_TO_CM) : (Number(step) || 0);
  const apply = () => { if (base.trim() === "") return; onApply(Number(base) || 0, stepCm); };
  return (
    <div className="flex items-center gap-0.5">
      <input type="number" step="any" value={base} onChange={(e) => setBase(e.target.value)} title="ค่าที่ไซส์เล็กสุด (ซม.)" placeholder="ฐาน"
        className="w-12 h-7 px-1 text-right border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      <span className="text-slate-300 text-[10px]">+</span>
      <input type="number" step="any" value={step} onChange={(e) => setStep(e.target.value)} title="เพิ่ม/ลด ต่อ 1 ไซส์" placeholder="/ไซส์"
        className="w-12 h-7 px-1 text-right border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      <button type="button" onClick={() => setUnit((u) => (u === "in" ? "cm" : "in"))}
        title={unit === "in" ? `กำลังคิดเป็นนิ้ว (×2.54 → ${round4(stepCm)} ซม.) — กดสลับเป็น ซม.` : "กำลังคิดเป็น ซม. — กดสลับเป็นนิ้ว"}
        className="h-7 w-9 text-[10px] border border-slate-200 rounded text-slate-500 hover:bg-slate-50">{unit === "in" ? "นิ้ว" : "ซม."}</button>
      <button type="button" onClick={apply} title={`เติมทุกไซส์: ฐาน + ลำดับ × ${round4(stepCm)} ซม.`} className="h-7 px-1.5 text-[11px] bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">เติม</button>
    </div>
  );
}

// ============================================================
// BomLineEditor
// ============================================================
export function BomLineEditor({
  lines, onChange, readonly, sizes = [],
}: { lines: EditorLine[]; onChange: (lines: EditorLine[]) => void; readonly?: boolean; sizes?: string[] }) {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [uoms, setUoms] = useState<{ id: string; name: string }[]>([]);
  const [detail, setDetail] = useState<EditorLine | null>(null);
  const [view, setView] = useState<"basic" | "pro">("basic");   // มุมมองตาราง: BASIC (ย่อ, ค่าเริ่มต้น) / PRO (เต็ม)
  const [editFace, setEditFace] = useState<Set<string>>(new Set());
  const [editUom, setEditUom] = useState<Set<string>>(new Set());
  useEffect(() => {
    apiFetch("/api/bom/material-groups").then((r) => r.json()).then((j) => setGroups((j.data ?? []) as MaterialGroup[])).catch(() => {});
    apiFetch("/api/admin/picker?table=uoms&label=name&limit=100").then((r) => r.json())
      .then((j) => setUoms(((j.data ?? []) as { id: string; label: string }[]).map((o) => ({ id: o.id, name: o.label })))).catch(() => {});
  }, []);
  const toggleSet = (set: Set<string>, key: string, on: boolean) => { const n = new Set(set); if (on) n.add(key); else n.delete(key); return n; };

  // ---- undo / redo (เฉพาะตารางวัตถุดิบ) ----
  const [undoStack, setUndoStack] = useState<EditorLine[][]>([]);
  const [redoStack, setRedoStack] = useState<EditorLine[][]>([]);
  const undo = () => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [lines, ...r].slice(0, 50));
    setUndoStack((u) => u.slice(0, -1));
    onChange(prev);
  };
  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setUndoStack((u) => [...u, lines].slice(-50));
    setRedoStack((r) => r.slice(1));
    onChange(next);
  };
  const undoRef = useRef(undo); undoRef.current = undo;
  const redoRef = useRef(redo); redoRef.current = redo;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return; // ไม่แย่ง undo ของช่องพิมพ์
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redoRef.current(); else undoRef.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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
  // ทุกการเปลี่ยนผ่านตาราง → บันทึก undo + คิดปริมาณใหม่
  const handleGridChange = (rows: EditorLine[]) => {
    setUndoStack((u) => [...u, lines].slice(-50));
    setRedoStack([]);
    onChange(rows.map(recalc));
  };

  // เลือกวัตถุดิบ → autofill ชนิด/หน้ากว้าง/เผื่อเสีย
  const pickComponent = (l: EditorLine, c: BomComponent): Partial<EditorLine> => ({
    component_id: c.id, component_sku: c.code, component_name: c.name, image_key: c.image_key ?? null,
    material_group_id: c.material_group_id, material_type: c.material_type ?? "",
    face_width_cm: c.fabric_width_cm ?? l.face_width_cm,
    waste_percent: c.loss_percent ?? l.waste_percent,
    uom: c.uom_name ?? l.uom, uom_id: c.uom_id ?? l.uom_id,
  });

  // เพิ่มวัตถุดิบใหม่จากปุ่ม "+ เพิ่มวัตถุดิบ" (เลือกจาก dropdown ได้เลย) → เพิ่มแถวที่ตั้งค่าครบ + คิดปริมาณ
  const addComponent = (c: BomComponent) => {
    const base = emptyLine();
    const line = recalc({ ...base, ...pickComponent(base, c) });
    setUndoStack((u) => [...u, lines].slice(-50));
    setRedoStack([]);
    onChange([...lines, line]);
  };

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
      key: "slot_code", header: "ช่อง", width: 116, sortable: true,
      getValue: (l) => l.slot_code ?? "",
      groupLabel: (l) => SLOT_ROLES.find((s) => s[0] === l.slot_code)?.[1] || "— ไม่ระบุช่อง —",
      render: (l, u, ro) => ro
        ? <span className="text-xs text-slate-600">{SLOT_ROLES.find((s) => s[0] === l.slot_code)?.[1] ?? <span className="text-slate-300">—</span>}</span>
        : <select value={l.slot_code ?? ""} onChange={(e) => u({ slot_code: e.target.value || null })} className={inputCls} title="บทบาทวัตถุดิบในสินค้า">
            <option value="">— ช่อง —</option>
            {SLOT_ROLES.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
          </select>,
    },
    {
      key: "component", header: "วัตถุดิบ", minWidth: 250, sortable: true,
      getValue: (l) => l.component_name || l.component_sku,
      groupLabel: (l) => l.component_sku ? `${l.component_sku} ${l.component_name}` : "— ไม่ระบุวัตถุดิบ —",
      groupEditNode: (apply) => <GroupReplacePicker onPick={(c) => apply(replacePatch(c))} />,
      render: (l, u) => (
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0"><ComponentPicker sku={l.component_sku} name={l.component_name} imageKey={l.image_key} onPick={(c) => u(pickComponent(l, c))} allowedGroupCodes={l.slot_code ? SLOT_GROUP_CODES[l.slot_code] : undefined} /></div>
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
    ...(sizes.length > 0 ? [{
      key: "size_variant", header: "ผันไซส์", width: 92, align: "center" as const,
      render: (l: EditorLine, u: (p: Partial<EditorLine>) => void, ro: boolean) => ro
        ? <span className="text-xs text-slate-500">{l.size_variant ? (SIZE_DIMS.find((d) => d[0] === l.size_dim)?.[1] ?? "✓") : "—"}</span>
        : <select value={l.size_variant ? l.size_dim : ""} onChange={(e) => u(e.target.value ? { size_variant: true, size_dim: e.target.value } : { size_variant: false })} className={inputCls} title="บรรทัดนี้เปลี่ยนตามไซส์ไหม + ค่าไหน">
            <option value="">—</option>
            {SIZE_DIMS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
          </select>,
    } as LineColumn<EditorLine>] : []),
  ];

  const shownColumns = view === "pro" ? columns : columns.filter((c) => BASIC_COLS.has(c.key));

  return (
    <>
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
            <button type="button" onClick={() => setView("basic")} title="โชว์เฉพาะคอลัมน์หลัก"
              className={`h-7 px-3 ${view === "basic" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>BASIC</button>
            <button type="button" onClick={() => setView("pro")} title="โชว์ทุกคอลัมน์"
              className={`h-7 px-3 border-l border-slate-200 ${view === "pro" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>PRO</button>
          </div>
          {!readonly && (
            // ปุ่มเพิ่มวัตถุดิบแบบเลือกจาก dropdown ได้เลย (มี ⭐ ใช้ล่าสุด บนสุด) → เลือกเสร็จเพิ่มแถวอัตโนมัติ
            <span className="inline-block w-64">
              <ComponentPicker sku="" name="" placeholder="＋ เพิ่มวัตถุดิบ (เลือกได้เลย)" onPick={addComponent} />
            </span>
          )}
        </div>
        {!readonly && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={undo} disabled={!undoStack.length} title="ย้อนกลับ (Ctrl+Z)"
              className="h-7 px-2 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">↶ ย้อน</button>
            <button type="button" onClick={redo} disabled={!redoStack.length} title="ทำซ้ำ (Ctrl+Shift+Z)"
              className="h-7 px-2 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">↷ ทำซ้ำ</button>
          </div>
        )}
      </div>
      <LineItemsGrid<EditorLine>
        rows={lines}
        columns={shownColumns}
        onChange={handleGridChange}
        rowId={(l) => l.key}
        readonly={readonly}
        storageKey="bom-lines"
        stickyHeader
        maxHeight="56vh"
        onAdd={emptyLine}
        addLabel="＋ เพิ่มวัตถุดิบ"
        emptyText="ยังไม่มีวัตถุดิบในสูตรนี้"
        groupByOptions={[{ key: "material_type", label: "ชนิดวัตถุดิบ" }, { key: "component", label: "วัตถุดิบ (เปลี่ยนทั้งกลุ่มได้)" }, { key: "uom", label: "หน่วย" }]}
        footer={<span className="text-sm text-slate-600">รวม <span className="font-bold text-slate-900">{lines.length}</span> รายการ</span>}
      />

      {/* ตารางค่าต่อไซส์ — เฉพาะบรรทัดที่ผันตามไซส์ (เฟส 4) */}
      {sizes.length > 0 && lines.some((l) => l.size_variant) && (
        <div className="mt-3 border border-slate-200 rounded-lg overflow-auto">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-600">📐 ค่าต่อไซส์ (เฉพาะบรรทัดที่ผันตามไซส์)</div>
          <table className="w-full text-xs">
            <thead><tr className="text-slate-400 border-b border-slate-100">
              <th className="text-left px-3 py-1.5 font-medium">วัตถุดิบ</th>
              <th className="text-center px-2 py-1.5 font-medium">ค่าที่ผัน</th>
              {!readonly && <th className="text-center px-2 py-1.5 font-medium whitespace-nowrap">สูตร (ฐาน + เพิ่ม/ไซส์)</th>}
              {sizes.map((s) => <th key={s} className="text-right px-2 py-1.5 font-medium">{s}</th>)}
            </tr></thead>
            <tbody>
              {lines.filter((l) => l.size_variant).map((l) => (
                <tr key={l.key} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1 text-slate-700"><code className="text-[10px] text-slate-400">{l.component_sku}</code> {l.component_name}</td>
                  <td className="px-2 py-1 text-center text-slate-500">{SIZE_DIMS.find((d) => d[0] === l.size_dim)?.[1] ?? l.size_dim}</td>
                  {!readonly && <td className="px-2 py-1"><SizeFormula
                    base0={l.size_values?.[sizes[0]] || (l.size_dim === "cut_width" ? l.cut_width : l.size_dim === "pieces" ? l.pieces : l.size_dim === "qty" ? l.qty : l.cut_length) || undefined}
                    onApply={(base, step) => onChange(lines.map((x) => x.key === l.key ? { ...x, size_values: Object.fromEntries(sizes.map((sz, i) => [sz, r4(base + i * step)])) } : x))} /></td>}
                  {sizes.map((s) => (
                    <td key={s} className="px-2 py-1">
                      <input type="number" step="any" disabled={readonly} value={l.size_values?.[s] ?? ""}
                        onChange={(e) => { const v = e.target.value; onChange(lines.map((x) => x.key === l.key ? { ...x, size_values: { ...x.size_values, [s]: v === "" ? 0 : Number(v) } } : x)); }}
                        className="w-16 h-7 px-1.5 text-right border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-400 px-3 py-1.5">ค่าที่กรอกจะแทนค่าตามช่องที่เลือก (ยาว/กว้าง/ชิ้น/จำนวน) เมื่อเลือกไซส์นั้นตอนสั่งผลิต · <b>สูตร:</b> ใส่ค่าฐาน (ไซส์เล็กสุด) + เพิ่ม/ลดต่อไซส์ แล้วกด “เติม” ระบบจะเติมทุกไซส์ให้ (แก้รายตัวต่อได้)</p>
        </div>
      )}

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
