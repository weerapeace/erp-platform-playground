"use client";

import { ProductPicker, type ProductPickerValue } from "@/components/pickers";

// ---- Editor line type ----

export type EditorLine = {
  id:           string;
  product_id:   string | null;
  sku:          string;
  product_name: string;
  qty:          number;
  unit:         string;
  unit_price:   number;
  note:         string;
};

function genId() { return Math.random().toString(36).slice(2, 9); }
function emptyLine(): EditorLine {
  return { id: genId(), product_id: null, sku: "", product_name: "", qty: 1, unit: "ชิ้น", unit_price: 0, note: "" };
}

// ============================================================
// PRLineEditor — รายการสินค้าใน PR (ใช้ ProductPicker กลาง)
// ============================================================

export function PRLineEditor({
  lines, onChange,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
}) {
  const addLine    = () => onChange([...lines, emptyLine()]);
  const removeLine = (id: string) => onChange(lines.filter(l => l.id !== id));
  const updateLine = (id: string, patch: Partial<EditorLine>) =>
    onChange(lines.map(l => l.id === id ? { ...l, ...patch } : l));

  // เลือกสินค้าจาก ProductPicker → autofill
  const pickProduct = (id: string, p: ProductPickerValue | null) => {
    if (!p) { updateLine(id, { product_id: null, sku: "", product_name: "" }); return; }
    updateLine(id, {
      product_id: p.id, sku: p.sku ?? "", product_name: p.name,
      unit: p.uom_name ?? "ชิ้น", unit_price: Number(p.list_price) || 0,
    });
  };

  const grandTotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);

  return (
    <div className="space-y-2">
      {lines.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-400 mb-2">ยังไม่มีรายการสินค้า</p>
          <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:text-blue-800 font-medium">＋ เพิ่มรายการแรก</button>
        </div>
      ) : (
        <>
          <div className="hidden sm:grid grid-cols-[1fr_80px_90px_110px_36px] gap-2 px-1 text-xs font-medium text-slate-400">
            <span>สินค้า</span><span className="text-right">จำนวน</span><span>หน่วย</span><span className="text-right">ราคา/หน่วย</span><span />
          </div>
          {lines.map(line => {
            const pickerValue: ProductPickerValue | null = line.product_id
              ? { id: line.product_id, sku: line.sku, name: line.product_name, uom_name: line.unit, list_price: line.unit_price }
              : (line.product_name ? { id: "", sku: line.sku, name: line.product_name } : null);
            const lineTotal = line.qty * line.unit_price;
            return (
              <div key={line.id} className="grid grid-cols-[1fr_80px_90px_110px_36px] gap-2 items-start">
                <div>
                  <ProductPicker value={pickerValue} onChange={p => pickProduct(line.id, p)} />
                  {lineTotal > 0 && <p className="text-xs text-slate-400 mt-0.5 sm:hidden">รวม ฿{lineTotal.toLocaleString("th-TH")}</p>}
                </div>
                <input type="number" min={0} value={line.qty}
                  onChange={e => updateLine(line.id, { qty: Number(e.target.value) })}
                  className="h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" value={line.unit}
                  onChange={e => updateLine(line.id, { unit: e.target.value })}
                  className="h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="number" min={0} value={line.unit_price}
                  onChange={e => updateLine(line.id, { unit_price: Number(e.target.value) })}
                  className="h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={() => removeLine(line.id)}
                  className="h-9 w-9 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">✕</button>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:text-blue-800 font-medium">＋ เพิ่มรายการ</button>
            <div className="text-sm text-slate-600">รวม <span className="font-bold text-slate-900">฿{grandTotal.toLocaleString("th-TH")}</span></div>
          </div>
        </>
      )}
    </div>
  );
}
