"use client";

/**
 * ตารางวัตถุดิบของใบสั่งผลิต (ของกลาง) — ใช้ทั้งหน้าแก้ใบสั่งผลิตและป๊อปอัปบนบอร์ดจ่ายงาน
 * 2 แท็บ: "วัตถุดิบที่ต้องใช้" (สรุปต่อวัตถุดิบ) · "รายละเอียด (บล็อก)" (รายบล็อกตัด)
 * - editable: โชว์ช่อง จำนวนที่มี/ขอซื้อ + ติ๊กเตรียมครบ ให้แก้ได้
 * - parent ตัดสินใจวิธีบันทึก (batch ตอน save / บันทึกทันที) ผ่าน callback
 */
import { useState } from "react";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";

export type MoMatPreview = {
  key: string; id: string | null; component_sku: string | null; component_name: string | null; material_type: string | null;
  qty_per: number; uom: string | null; cut_block_code: string | null; cut_width: number | null; cut_length: number | null; pieces: number | null;
  on_hand_qty: number; is_ready: boolean; purchase_override: number | null; cut_done: boolean;
};
export type MoMatSummary = {
  key: string; id: string | null; component_sku: string | null; component_name: string | null; material_type: string | null;
  uom: string | null; qty_per: number; on_hand_qty: number; is_ready: boolean; purchase_override: number | null;
};
type MatRow = MoMatPreview & { required: number; to_purchase: number };

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toLocaleString("th-TH");
const numCls = "w-full h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";
const needsCutLine = (m: { cut_block_code: string | null; cut_length: number | null; pieces: number | null }) =>
  m.cut_block_code != null || m.cut_length != null || m.pieces != null;

export function MoMaterialsTable({
  summary, materials, qty, requested = {}, editable, canEdit,
  onChangeSummary, onToggleCut, onCreatePR, emptyText,
}: {
  summary: MoMatSummary[];
  materials: MoMatPreview[];
  qty: number;
  requested?: Record<string, number>;
  editable: boolean;
  canEdit: boolean;
  onChangeSummary?: (rows: MoMatSummary[]) => void;
  onToggleCut?: (line: MoMatPreview, next: boolean) => void;
  onCreatePR?: (count: number) => void;
  emptyText?: string;
}) {
  const [matTab, setMatTab] = useState<"sum" | "block">("sum");
  const [editBuy, setEditBuy] = useState<Set<string>>(new Set());

  const sumRows: MatRow[] = summary.map((s) => {
    const required = Math.round(s.qty_per * (qty || 0) * 10000) / 10000;
    const base = Math.max(0, Math.round((required - (s.on_hand_qty || 0)) * 10000) / 10000);
    return { key: s.key, id: s.id, component_sku: s.component_sku, component_name: s.component_name, material_type: s.material_type, uom: s.uom,
      qty_per: s.qty_per, cut_block_code: null, cut_width: null, cut_length: null, pieces: null,
      on_hand_qty: s.on_hand_qty, is_ready: s.is_ready, purchase_override: s.purchase_override, cut_done: false,
      required, to_purchase: s.purchase_override != null ? s.purchase_override : base };
  });
  const blockRows: MatRow[] = materials.map((m) => ({ ...m, required: Math.round(m.qty_per * (qty || 0) * 10000) / 10000, to_purchase: 0 }));

  const codeCol: LineColumn<MatRow> = {
    key: "component", header: "วัตถุดิบ", minWidth: 220, sortable: true,
    getValue: (r) => r.component_name || r.component_sku, groupLabel: (r) => r.component_sku ? `${r.component_sku} ${r.component_name}` : "— ไม่ระบุ —",
    render: (r) => <span className="block truncate"><code className="text-[10px] text-slate-400">{r.component_sku}</code> <span className="text-slate-700">{r.component_name}</span></span>,
  };
  const typeCol: LineColumn<MatRow> = { key: "material_type", header: "ประเภท", width: 110, sortable: true, getValue: (r) => r.material_type, groupLabel: (r) => r.material_type || "— ไม่ระบุ —" };
  const reqCol: LineColumn<MatRow> = { key: "required", header: "รวมต้องใช้", width: 96, align: "right", sortable: true, summable: true, getValue: (r) => r.required, render: (r) => <span className="block px-1 text-right tabular-nums font-semibold text-emerald-700">{fmt(r.required)}</span> };
  const uomCol: LineColumn<MatRow> = { key: "uom", header: "หน่วย", width: 60, getValue: (r) => r.uom };
  const onhandCol: LineColumn<MatRow> = { key: "on_hand_qty", header: "จำนวนที่มี", width: 92, align: "right", getValue: (r) => r.on_hand_qty,
    render: (r, u) => <input type="number" min={0} step="any" value={r.on_hand_qty} onChange={(e) => u({ on_hand_qty: Number(e.target.value) })} className={numCls} /> };
  const buyCol: LineColumn<MatRow> = { key: "to_purchase", header: "ต้องขอซื้อ", width: 112, align: "right", summable: true, getValue: (r) => r.to_purchase,
    render: (r, u) => editBuy.has(r.key)
      ? <input type="number" min={0} step="any" value={r.to_purchase} autoFocus onChange={(e) => u({ purchase_override: Number(e.target.value) })} className={numCls} />
      : (
        <div className="flex items-center justify-end gap-1">
          <span className={`tabular-nums ${r.to_purchase > 0 ? "text-rose-600 font-semibold" : "text-slate-300"}`}>{r.to_purchase > 0 ? fmt(r.to_purchase) : "—"}</span>
          <button type="button" title="แก้จำนวนที่ขอซื้อ" onClick={() => setEditBuy((s) => { const n = new Set(s); n.add(r.key); return n; })}
            className="shrink-0 h-6 w-5 flex items-center justify-center text-slate-300 hover:text-blue-600 rounded">✏</button>
        </div>
      ) };
  const readyCol: LineColumn<MatRow> = { key: "is_ready", header: "เตรียมครบ", width: 80, align: "center", getValue: (r) => (r.is_ready ? 1 : 0),
    render: (r, u) => <input type="checkbox" checked={r.is_ready}
      onChange={(e) => e.target.checked ? u({ is_ready: true, on_hand_qty: r.required, purchase_override: null }) : u({ is_ready: false })}
      className="rounded border-slate-300" /> };
  const orderedCol: LineColumn<MatRow> = { key: "ordered", header: "สถานะสั่งซื้อ", width: 124, align: "center", sortable: true,
    getValue: (r) => (r.component_sku ? (requested[r.component_sku] ?? 0) : 0),
    render: (r) => {
      const got = r.component_sku ? (requested[r.component_sku] ?? 0) : 0;
      if (got <= 0) return <span className="text-slate-300 text-xs">— ยังไม่ขอ</span>;
      const full = got >= r.to_purchase - 0.0001;
      return <span className={`text-[11px] px-2 py-0.5 rounded whitespace-nowrap ${full ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>🛒 ขอแล้ว {fmt(got)}{full ? "" : " (บางส่วน)"}</span>;
    } };
  const sumCols: LineColumn<MatRow>[] = editable
    ? [codeCol, typeCol, reqCol, uomCol, onhandCol, buyCol, readyCol, orderedCol]
    : [codeCol, typeCol, { key: "qty_per", header: "ต่อชิ้น", width: 76, align: "right", getValue: (r) => r.qty_per }, reqCol, uomCol];

  const totalPcsCol: LineColumn<MatRow> = { key: "total_pieces", header: "ยอดรวมชิ้น", width: 92, align: "right", summable: true,
    getValue: (r) => (r.pieces ?? 0) * (qty || 0),
    render: (r) => <span className="block px-1 text-right tabular-nums font-semibold text-slate-700">{r.pieces ? fmt((r.pieces ?? 0) * (qty || 0)) : "—"}</span> };
  const cutDoneCol: LineColumn<MatRow> = { key: "cut_done", header: "ตัดครบแล้ว", width: 84, align: "center",
    getValue: (r) => (r.cut_done ? 1 : 0),
    render: (r) => needsCutLine(r)
      ? <input type="checkbox" checked={r.cut_done} disabled={!canEdit || !onToggleCut} onChange={() => onToggleCut?.(r, !r.cut_done)} className="rounded border-slate-300 cursor-pointer disabled:cursor-not-allowed" />
      : <span className="text-slate-300 text-xs">—</span> };
  const blockCols: LineColumn<MatRow>[] = [codeCol, typeCol,
    { key: "cut_block_code", header: "บล็อกตัด", width: 130, getValue: (r) => r.cut_block_code },
    { key: "cut_width", header: "กว้าง", width: 60, align: "right", getValue: (r) => r.cut_width ?? "" },
    { key: "cut_length", header: "ยาว", width: 60, align: "right", getValue: (r) => r.cut_length ?? "" },
    { key: "pieces", header: "ชิ้น", width: 54, align: "right", getValue: (r) => r.pieces ?? "" },
    totalPcsCol, reqCol, uomCol, cutDoneCol];

  const needCount = sumRows.filter((r) => { const got = r.component_sku ? (requested[r.component_sku] ?? 0) : 0; return r.to_purchase - got > 0.0001; }).length;

  // ติ๊กครบทั้งหมด (เตรียม/ตัด)
  const cutLines = blockRows.filter((r) => needsCutLine(r));
  const allCut = cutLines.length > 0 && cutLines.every((r) => r.cut_done);
  const allReady = summary.length > 0 && summary.every((s) => s.is_ready);
  const markAllReady = (target: boolean) => {
    onChangeSummary?.(summary.map((s) => target
      ? { ...s, is_ready: true, on_hand_qty: Math.round(s.qty_per * (qty || 0) * 10000) / 10000, purchase_override: null }
      : { ...s, is_ready: false }));
  };
  const markAllCut = (target: boolean) => {
    if (!onToggleCut) return;
    for (const m of materials) if (needsCutLine(m) && m.cut_done !== target) onToggleCut(m, target);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex border border-slate-200 rounded-lg overflow-hidden text-sm">
          <button type="button" onClick={() => setMatTab("sum")} className={`h-7 px-3 ${matTab === "sum" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>วัตถุดิบที่ต้องใช้</button>
          <button type="button" onClick={() => setMatTab("block")} className={`h-7 px-3 border-l border-slate-200 ${matTab === "block" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}>รายละเอียด (บล็อก)</button>
        </div>
        <div className="flex items-center gap-1.5">
          {matTab === "sum" && editable && canEdit && onChangeSummary && summary.length > 0 && (
            <button type="button" onClick={() => markAllReady(!allReady)} className="h-7 px-3 text-xs font-medium border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 whitespace-nowrap">{allReady ? "ยกเลิกเตรียมทั้งหมด" : "✓ เตรียมครบทั้งหมด"}</button>
          )}
          {matTab === "block" && canEdit && onToggleCut && cutLines.length > 0 && (
            <button type="button" onClick={() => markAllCut(!allCut)} className="h-7 px-3 text-xs font-medium border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 whitespace-nowrap">{allCut ? "ยกเลิกตัดทั้งหมด" : "✓ ตัดครบทั้งหมด"}</button>
          )}
          {editable && matTab === "sum" && needCount > 0 && canEdit && onCreatePR && (
            <button type="button" onClick={() => onCreatePR(needCount)} className="h-7 px-3 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 whitespace-nowrap">🛒 สร้างใบขอซื้อ ({needCount})</button>
          )}
        </div>
      </div>
      {materials.length === 0 && summary.length === 0 ? (
        <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">{emptyText ?? "ยังไม่มีวัตถุดิบ"}</div>
      ) : (
        <LineItemsGrid<MatRow>
          key={matTab}
          rows={matTab === "sum" ? sumRows : blockRows} columns={matTab === "sum" ? sumCols : blockCols}
          onChange={(rows) => { if (matTab === "sum" && editable && onChangeSummary) onChangeSummary(rows.map((r) => ({ key: r.key, id: r.id, component_sku: r.component_sku, component_name: r.component_name, material_type: r.material_type, uom: r.uom, qty_per: r.qty_per, on_hand_qty: r.on_hand_qty, is_ready: r.is_ready, purchase_override: r.purchase_override }))); }}
          rowId={(r) => r.key} readonly={!editable || matTab === "block"} stickyHeader maxHeight="42vh"
          dense={matTab === "block"} defaultSort={matTab === "block" ? { key: "component", dir: "asc" } : null}
          groupByOptions={[{ key: "material_type", label: "ประเภท" }, { key: "component", label: "วัตถุดิบ" }]}
        />
      )}
    </div>
  );
}
