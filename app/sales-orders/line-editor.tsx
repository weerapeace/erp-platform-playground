"use client";

import { SkuPicker, UnitPicker } from "@/components/pickers";
import type { SkuPickerValue, UnitPickerValue } from "@/components/pickers";
import { calculateDocument, type DocumentResult } from "@/lib/tax";
import { format as formatMoney } from "@/lib/money";

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

const skuLink = (line: EditorLine) => {
  const search = line.sku || line.product_name;
  return search ? `/master/skus?search=${encodeURIComponent(search)}` : "/master/skus";
};

export function calculateEditorTotals(
  lines: EditorLine[],
  opts: {
    vatRate: number;
    vatIncluded: boolean;
    whtRate: number;
    headerDiscountType: "percent" | "amount";
    headerDiscountValue: number;
    shippingFee: number;
  },
) {
  return calculateDocument({
    lines: lines
      .filter((l) => l.product_name.trim())
      .map((l) => ({
        qty: l.qty,
        unit_price: l.unit_price,
        discount: l.discount_value > 0
          ? { type: l.discount_type, value: l.discount_value }
          : undefined,
      })),
    header_discount: opts.headerDiscountValue > 0
      ? { type: opts.headerDiscountType, value: opts.headerDiscountValue }
      : undefined,
    shipping_fee: opts.shippingFee,
    tax: {
      vat_rate: opts.vatRate,
      vat_included: opts.vatIncluded,
      wht_rate: opts.whtRate,
    },
  });
}

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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase">
            <tr>
              <th className="text-left px-2 py-1.5 w-8">#</th>
              <th className="text-left px-2 py-1.5 min-w-[220px]">สินค้า</th>
              <th className="text-right px-2 py-1.5 w-20">จำนวน</th>
              <th className="text-left px-2 py-1.5 w-24">หน่วย</th>
              <th className="text-right px-2 py-1.5 w-28">ราคา/หน่วย</th>
              <th className="text-left px-2 py-1.5 w-32">ส่วนลด</th>
              <th className="text-right px-2 py-1.5 w-28">รวม<span className="font-normal text-[10px] text-slate-400"> (ก่อนภาษี)</span></th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.tempId} className="border-b border-slate-100">
              <td className="px-2 py-1 text-slate-400 font-mono">{i + 1}</td>
              <td className="px-2 py-1">
                <SkuPicker
                  value={l.product_name ? {
                    id: l.product_id ?? "", code: l.sku ?? "", name: l.product_name,
                    list_price: l.unit_price,
                  } as SkuPickerValue : null}
                  onChange={(p: SkuPickerValue | null) => {
                    if (!p) { update(i, { product_id: null, sku: null, product_name: "" }); return; }
                    update(i, {
                      product_id: p.id, sku: p.code, product_name: p.name,
                      unit_price: p.list_price ?? l.unit_price ?? 0,
                      unit: p.uom_name ?? l.unit,
                    });
                  }}
                  disabled={readonly}
                  placeholder="เลือกสินค้า..."
                />
                {(l.sku || l.product_name) && (
                  <a
                    href={skuLink(l)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 text-[11px] font-mono text-blue-600 hover:text-blue-700 hover:underline"
                    title="เปิดหน้า SKU"
                  >
                    <span className="truncate">{l.sku || l.product_name}</span>
                    <span className="shrink-0">↗</span>
                  </a>
                )}
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
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={l.discount_value > 0}
                    onChange={(e) => update(i, e.target.checked ? { discount_value: l.discount_value || 1 } : { discount_value: 0 })}
                    disabled={readonly}
                    className="rounded border-slate-300"
                  />
                  <span>มีส่วนลด</span>
                </label>
                {l.discount_value > 0 && (
                  <div className="mt-1 flex gap-0.5">
                    <input type="number" value={l.discount_value} onChange={e => update(i, { discount_value: parseFloat(e.target.value) || 0 })}
                      disabled={readonly}
                      className="w-full h-7 px-1 text-xs text-right border border-slate-200 rounded disabled:bg-slate-50" />
                    <select value={l.discount_type} onChange={e => update(i, { discount_type: e.target.value as "percent" | "amount" })}
                      disabled={readonly}
                      className="w-12 h-7 px-0.5 text-[10px] border border-slate-200 rounded bg-white disabled:bg-slate-50">
                      <option value="percent">%</option><option value="amount">฿</option>
                    </select>
                  </div>
                )}
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
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  {readonly ? "ไม่มีรายการ" : 'คลิก "+ เพิ่มรายการ" เพื่อเริ่ม'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SalesTotalsPreview({
  result,
  payerLabel = "ลูกค้าจ่ายจริง",
}: {
  result: DocumentResult;
  payerLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">สรุปรวม</span>
        <span className="text-[11px] text-slate-400">คำนวณจากรายการด้านบนทันที</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <PreviewRow label="ยอดก่อนลด" value={formatMoney(result.subtotal)} />
        <PreviewRow label="ลดรายบรรทัด" value={formatMoney(result.total_line_discount)} />
        <PreviewRow label="ลดท้ายบิล" value={formatMoney(result.header_discount)} />
        <PreviewRow label="ค่าจัดส่ง" value={formatMoney(result.shipping)} />
        <PreviewRow label="ฐานภาษี" value={formatMoney(result.taxable)} />
        <PreviewRow label="VAT" value={formatMoney(result.total_vat)} />
        <PreviewRow label="WHT" value={formatMoney(result.total_wht)} />
        <PreviewRow label="รวมทั้งสิ้น" value={formatMoney(result.grand_total)} strong />
        <PreviewRow label={payerLabel} value={formatMoney(result.amount_due)} strong accent />
      </div>
    </div>
  );
}

function PreviewRow({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <span className={accent ? "text-emerald-700" : "text-slate-500"}>{label}</span>
      <span className={`tabular-nums font-mono ${accent ? "text-emerald-700" : strong ? "text-blue-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
