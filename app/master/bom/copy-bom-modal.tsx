"use client";

/**
 * CopyBomModal — คัดลอกวัตถุดิบจากสูตรอื่น
 * เลือกสูตรต้นแบบ (ค้นจาก /api/bom) → โหลดวัตถุดิบ → ติ๊กเลือก (default ทั้งหมด) → คัดลอกเข้าสูตรปัจจุบัน
 */
import { useState, useEffect, useCallback } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { emptyLine, type EditorLine } from "./line-editor";

type BomRow = { id: string; bom_code: string; product_sku: string | null; product_name: string | null; version: string | null; line_count: number };
type SrcLine = {
  id: string; component_sku: string | null; component_name: string | null; material_type: string | null;
  qty: number; uom: string | null; waste_percent: number | null; is_optional: boolean;
  cut_block_id: number | null; cut_block_code: string | null; pieces: number | null;
  cut_width: number | null; cut_length: number | null; face_width_cm: number | null;
};

export function CopyBomModal({ open, onClose, onCopy }: { open: boolean; onClose: () => void; onCopy: (lines: EditorLine[]) => void }) {
  const [search, setSearch]   = useState("");
  const [boms, setBoms]       = useState<BomRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked]   = useState<BomRow | null>(null);
  const [lines, setLines]     = useState<SrcLine[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loadingLines, setLoadingLines] = useState(false);

  const loadBoms = useCallback(async (q: string) => {
    setLoading(true);
    try { const res = await apiFetch(`/api/bom${q ? `?search=${encodeURIComponent(q)}` : ""}`); const j = await res.json(); setBoms((j.data ?? []) as BomRow[]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!open) return; const t = setTimeout(() => loadBoms(search), 250); return () => clearTimeout(t); }, [open, search, loadBoms]);
  useEffect(() => { if (!open) { setPicked(null); setLines([]); setChecked(new Set()); setSearch(""); } }, [open]);

  const pickBom = async (b: BomRow) => {
    setPicked(b); setLoadingLines(true);
    try {
      const res = await apiFetch(`/api/bom/${b.id}`); const j = await res.json();
      const ls = ((j.data?.lines ?? []) as SrcLine[]);
      setLines(ls); setChecked(new Set(ls.map((l) => l.id)));
    } finally { setLoadingLines(false); }
  };

  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const doCopy = () => {
    const out: EditorLine[] = lines.filter((l) => checked.has(l.id)).map((l) => ({
      ...emptyLine(),
      component_sku: l.component_sku ?? "", component_name: l.component_name ?? "",
      material_type: l.material_type ?? "", qty: Number(l.qty) || 0, uom: l.uom ?? "หลา",
      waste_percent: Number(l.waste_percent) || 0, is_optional: !!l.is_optional,
      cut_block_id: l.cut_block_id ?? null, cut_block_code: l.cut_block_code ?? "",
      pieces: Number(l.pieces) || 1, cut_width: Number(l.cut_width) || 0, cut_length: Number(l.cut_length) || 0,
      face_width_cm: Number(l.face_width_cm) || 0,
    }));
    onCopy(out); onClose();
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title="📋 คัดลอก BOM จากสูตรอื่น"
      footer={
        <>
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
          {picked && <button onClick={doCopy} disabled={checked.size === 0}
            className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">คัดลอก {checked.size} รายการ</button>}
        </>
      }>
      {!picked ? (
        <div className="space-y-3">
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาสูตรต้นแบบ: รหัสสูตร / SKU / ชื่อสินค้า..."
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="max-h-80 overflow-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
            {loading && <div className="px-3 py-4 text-sm text-slate-400">กำลังค้นหา...</div>}
            {!loading && boms.length === 0 && <div className="px-3 py-4 text-sm text-slate-400">ไม่พบสูตร</div>}
            {boms.map((b) => (
              <button key={b.id} type="button" onClick={() => pickBom(b)} className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-3">
                <code className="text-xs text-slate-600 shrink-0 w-36 truncate">{b.bom_code}</code>
                <span className="text-sm text-slate-700 truncate flex-1">{b.product_name || b.product_sku}</span>
                <span className="text-xs text-slate-400 shrink-0">{b.line_count} วัตถุดิบ</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">จาก <code className="text-xs">{picked.bom_code}</code> — {picked.product_name || picked.product_sku}</div>
            <button onClick={() => setPicked(null)} className="text-xs text-blue-600 hover:underline">← เลือกสูตรอื่น</button>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <button onClick={() => setChecked(new Set(lines.map((l) => l.id)))} className="text-blue-600 hover:underline">เลือกทั้งหมด</button>
            <button onClick={() => setChecked(new Set())} className="text-blue-600 hover:underline">ไม่เลือก</button>
            <span>เลือก {checked.size}/{lines.length}</span>
          </div>
          <div className="max-h-80 overflow-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
            {loadingLines && <div className="px-3 py-4 text-sm text-slate-400">กำลังโหลด...</div>}
            {lines.map((l) => (
              <label key={l.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={checked.has(l.id)} onChange={() => toggle(l.id)} className="rounded border-slate-300" />
                <code className="text-xs text-slate-500 shrink-0 w-32 truncate">{l.component_sku}</code>
                <span className="text-sm text-slate-700 truncate flex-1">{l.component_name}</span>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{l.qty} {l.uom}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
