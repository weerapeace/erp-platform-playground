"use client";

import { useState, useEffect } from "react";
import { ProductPicker, TaxPicker, UnitPicker } from "@/components/pickers";
import type { ProductPickerValue, TaxPickerValue, UnitPickerValue } from "@/components/pickers";

// ---- Local line type for editor (ปรับตามไฟล์ที่ใช้) ----
export type EditorLine = {
  tempId:         string;
  product_id?:    string | null;
  sku:            string | null;
  product_name:   string;
  qty:            number;
  unit:           string;
  unit_price:     number;
  discount_type:  "percent" | "amount";
  discount_value: number;
  tax_code?:      string | null;
  note?:          string;
};

export type LineDraft = EditorLine;

export const emptyLine = (): EditorLine => ({
  tempId: String(Math.random()).slice(2),
  product_id: null, sku: null, product_name: "",
  qty: 1, unit: "ชิ้น", unit_price: 0,
  discount_type: "percent", discount_value: 0,
  tax_code: null,
});

// ============================================================
// SO Line Editor (table-style)
// ============================================================
export function SOLineEditor({
  lines, onChange, readonly,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  readonly?: boolean;
}) {
  const update = (i: number, patch: Partial<EditorLine>) => {
    onChange(lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  };
  const add = () => onChange([...lines, emptyLine()]);
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));

  // running totals for preview
  const lineTotal = (l: EditorLine) => {
    const sub = l.qty * l.unit_price;
    const disc = l.discount_type === "percent"
      ? sub * (l.discount_value / 100)
      : l.discount_value;
    return sub - disc;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          รายการสินค้า <span className="text-xs font-normal text-slate-400">({lines.length})</span>
        </h3>
        {!readonly && (
          <button onClick={add} className="h-7 px-3 text-xs font-medium border border-slate-200 rounded hover:bg-white text-slate-700">
            + เพิ่มรายการ
          </button>
        )}
      </div>

      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase">
          <tr>
            <th className="text-left px-2 py-1.5 w-8">#</th>
            <th className="text-left px-2 py-1.5 min-w-[200px]">สินค้า</th>
            <th className="text-right px-2 py-1.5 w-16">จำนวน</th>
            <th className="text-left px-2 py-1.5 w-20">หน่วย</th>
            <th className="text-right px-2 py-1.5 w-24">ราคา/หน่วย</th>
            <th className="text-right px-2 py-1.5 w-20">ส่วนลด</th>
            <th className="text-left px-2 py-1.5 w-20">ภาษี</th>
            <th className="text-right px-2 py-1.5 w-24">รวม</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.tempId} className="border-b border-slate-100">
              <td className="px-2 py-1 text-slate-400 font-mono">{i + 1}</td>
              <td className="px-2 py-1">
                <ProductPicker
                  value={l.product_name ? {
                    id: l.product_id ?? "", sku: l.sku, name: l.product_name,
                    list_price: l.unit_price,
                  } as ProductPickerValue : null}
                  onChange={(p: ProductPickerValue | null) => {
                    if (!p) { update(i, { product_id: null, sku: null, product_name: "" }); return; }
                    update(i, {
                      product_id: p.id, sku: p.sku, product_name: p.name,
                      unit_price: p.list_price ?? l.unit_price ?? 0,
                      unit: p.uom_name ?? l.unit,
                    });
                  }}
                  disabled={readonly}
                  placeholder="เลือกสินค้า..."
                />
              </td>
              <td className="px-2 py-1">
                <input type="number" value={l.qty} onChange={e => update(i, { qty: parseFloat(e.target.value) || 0 })}
                  disabled={readonly}
                  className="w-full h-7 px-1.5 text-xs text-right border border-slate-200 rounded disabled:bg-slate-50" />
              </td>
              <td className="px-2 py-1 w-24">
                <UnitPicker
                  value={l.unit ? { id: "", code: null, name: l.unit, symbol: l.unit } as UnitPickerValue : null}
                  onChange={(u: UnitPickerValue | null) => update(i, { unit: u?.name ?? "ชิ้น" })}
                  disabled={readonly}
                />
              </td>
              <td className="px-2 py-1">
                <input type="number" value={l.unit_price} onChange={e => update(i, { unit_price: parseFloat(e.target.value) || 0 })}
                  disabled={readonly}
                  className="w-full h-7 px-1.5 text-xs text-right border border-slate-200 rounded disabled:bg-slate-50" />
              </td>
              <td className="px-2 py-1">
                <div className="flex gap-0.5">
                  <input type="number" value={l.discount_value} onChange={e => update(i, { discount_value: parseFloat(e.target.value) || 0 })}
                    disabled={readonly}
                    className="w-full h-7 px-1 text-xs text-right border border-slate-200 rounded disabled:bg-slate-50" />
                  <select value={l.discount_type} onChange={e => update(i, { discount_type: e.target.value as "percent" | "amount" })}
                    disabled={readonly}
                    className="w-12 h-7 px-0.5 text-[10px] border border-slate-200 rounded bg-white disabled:bg-slate-50">
                    <option value="percent">%</option><option value="amount">฿</option>
                  </select>
                </div>
              </td>
              <td className="px-2 py-1">
                <TaxPicker
                  value={l.tax_code ? { id: "", code: l.tax_code, name: l.tax_code } as TaxPickerValue : null}
                  onChange={(t: TaxPickerValue | null) => update(i, { tax_code: t?.code ?? null })}
                  disabled={readonly}
                />
              </td>
              <td className="px-2 py-1 text-right tabular-nums font-mono">
                ฿{lineTotal(l).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-2 py-1">
                {!readonly && (
                  <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600">×</button>
                )}
              </td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                {readonly ? "ไม่มีรายการ" : 'คลิก "+ เพิ่มรายการ" เพื่อเริ่ม'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
