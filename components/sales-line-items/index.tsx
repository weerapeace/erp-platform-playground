"use client";

import type { ReactNode } from "react";
import { SkuPicker, UnitPicker } from "@/components/pickers";
import type { SkuPickerValue, UnitPickerValue } from "@/components/pickers";
import { ImageThumbnail } from "@/components/image-manager";
import { calculateDocument, type DocumentResult } from "@/lib/tax";
import { format as formatMoney, money } from "@/lib/money";

export type EditorLine = {
  tempId: string;
  product_id?: string | null;
  sku: string | null;
  product_name: string;
  image_url?: string | null;
  image_key?: string | null;
  qty: number;
  unit: string;
  unit_price: number;
  discount_type: "percent" | "amount";
  discount_value: number;
  tax_code?: string | null;
  note?: string;
};

export type LineDraft = EditorLine;

export const emptyLine = (): EditorLine => ({
  tempId: String(Math.random()).slice(2),
  product_id: null,
  sku: null,
  product_name: "",
  image_url: null,
  image_key: null,
  qty: 1,
  unit: "ชิ้น",
  unit_price: 0,
  discount_type: "percent",
  discount_value: 0,
  tax_code: null,
});

const lineImageUrl = (line: Pick<EditorLine, "image_url" | "image_key">) => {
  if (line.image_url) return line.image_url;
  return line.image_key ? `/api/r2-image?key=${encodeURIComponent(line.image_key)}` : null;
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

export function SOLineEditor({
  lines,
  onChange,
  readonly,
  layout = "card",
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  readonly?: boolean;
  /** "card" (default) = การ์ดต่อรายการ · "table" = ตารางแก้ไขในแถว */
  layout?: "card" | "table";
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
    return Math.max(0, sub - disc);
  };

  const applyPick = (i: number, p: SkuPickerValue | null, current: EditorLine) => {
    if (!p) {
      update(i, { product_id: null, sku: null, product_name: "", image_url: null, image_key: null });
      return;
    }
    update(i, {
      product_id: p.id, sku: p.code, product_name: p.name,
      image_url: p.image_url ?? null, image_key: p.image_key ?? null,
      unit_price: p.list_price ?? current.unit_price ?? 0,
      unit: p.uom_name ?? current.unit,
    });
  };

  const pickerValueOf = (l: EditorLine): SkuPickerValue | null =>
    l.product_name
      ? ({ id: l.product_id ?? "", code: l.sku ?? "", name: l.product_name,
           list_price: l.unit_price, uom_name: l.unit,
           image_url: lineImageUrl(l), image_key: l.image_key ?? null } satisfies SkuPickerValue)
      : null;

  // ===== โหมดตาราง (แก้ไขในแถว) =====
  if (layout === "table") {
    return (
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
          <h3 className="text-sm font-semibold text-slate-800">
            รายการสินค้า <span className="text-xs font-normal text-slate-400">({lines.length})</span>
          </h3>
          {!readonly && (
            <button type="button" onClick={add}
              className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
              + เพิ่มรายการ
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="w-8 px-2 py-2 text-center font-semibold">#</th>
                <th className="min-w-[240px] px-2 py-2 text-left font-semibold">สินค้า</th>
                <th className="w-20 px-2 py-2 text-right font-semibold">จำนวน</th>
                <th className="w-28 px-2 py-2 text-left font-semibold">หน่วย</th>
                <th className="w-28 px-2 py-2 text-right font-semibold">ราคา/หน่วย</th>
                <th className="w-36 px-2 py-2 text-left font-semibold">ส่วนลด</th>
                <th className="w-28 px-2 py-2 text-right font-semibold">รวมก่อนภาษี</th>
                {!readonly && <th className="w-9 px-1 py-2"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <tr key={l.tempId} className="align-top">
                  <td className="px-2 py-2 text-center font-mono text-xs text-slate-400">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-start gap-2">
                      <div className="pt-0.5"><ImageThumbnail url={lineImageUrl(l)} size={36} alt={l.product_name || "สินค้า"} /></div>
                      <div className="min-w-0 flex-1">
                        <SkuPicker value={pickerValueOf(l)} onChange={(p) => applyPick(i, p, l)} disabled={readonly} placeholder="เลือก SKU / ชื่อสินค้า..." />
                        {l.sku && (
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <code className="rounded bg-orange-50 px-1.5 py-0.5 font-mono text-orange-700">{l.sku}</code>
                            <span className="truncate">{l.product_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" value={l.qty} disabled={readonly}
                      onChange={(e) => update(i, { qty: parseFloat(e.target.value) || 0 })}
                      className="h-9 w-full rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums disabled:bg-slate-50" />
                  </td>
                  <td className="px-2 py-2">
                    <UnitPicker
                      value={l.unit ? ({ id: "", code: null, name: l.unit, symbol: l.unit } satisfies UnitPickerValue) : null}
                      onChange={(u: UnitPickerValue | null) => update(i, { unit: u?.name ?? "ชิ้น" })}
                      disabled={readonly} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" value={l.unit_price} disabled={readonly}
                      onChange={(e) => update(i, { unit_price: parseFloat(e.target.value) || 0 })}
                      className="h-9 w-full rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums disabled:bg-slate-50" />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <input type="number" value={l.discount_value} disabled={readonly}
                        onChange={(e) => update(i, { discount_value: parseFloat(e.target.value) || 0 })}
                        className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums disabled:bg-slate-50" />
                      <select value={l.discount_type} disabled={readonly}
                        onChange={(e) => update(i, { discount_type: e.target.value as "percent" | "amount" })}
                        className="h-9 w-14 rounded-lg border border-slate-200 bg-white px-1 text-sm disabled:bg-slate-50">
                        <option value="percent">%</option>
                        <option value="amount">฿</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {formatMoney(money(lineTotal(l)))}
                  </td>
                  {!readonly && (
                    <td className="px-1 py-2 text-center">
                      <button type="button" onClick={() => remove(i)} aria-label="ลบรายการ"
                        className="h-8 w-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500">x</button>
                    </td>
                  )}
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={readonly ? 7 : 8} className="px-4 py-8 text-center text-sm text-slate-400">
                  {readonly ? "ไม่มีรายการสินค้า" : 'กด "+ เพิ่มรายการ" เพื่อเริ่มเลือกสินค้า'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            รายการสินค้า <span className="text-xs font-normal text-slate-400">({lines.length})</span>
          </h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
            เลือก SKU แล้วระบบจะดึงรูป หน่วย และราคาขายมาให้ แก้จำนวน/ราคาได้ในแถวนี้
          </p>
        </div>
        {!readonly && (
          <button
            type="button"
            onClick={add}
            className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            + เพิ่มรายการ
          </button>
        )}
      </div>

      <div className="space-y-3 bg-slate-50/40 p-3">
        {lines.map((l, i) => {
          const hasDiscount = l.discount_value > 0;
          const pickerValue = l.product_name
            ? ({
                id: l.product_id ?? "",
                code: l.sku ?? "",
                name: l.product_name,
                list_price: l.unit_price,
                uom_name: l.unit,
                image_url: lineImageUrl(l),
                image_key: l.image_key ?? null,
              } satisfies SkuPickerValue)
            : null;

          return (
            <article key={l.tempId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-[28px_64px_minmax(0,1fr)_auto] items-start gap-3">
                <div className="pt-3 text-center font-mono text-xs text-slate-400">{i + 1}</div>
                <div className="pt-1">
                  <ImageThumbnail url={lineImageUrl(l)} size={56} alt={l.product_name || "สินค้า"} />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-xs font-medium text-slate-500">สินค้า</label>
                  <SkuPicker
                    value={pickerValue}
                    onChange={(p: SkuPickerValue | null) => {
                      if (!p) {
                        update(i, {
                          product_id: null,
                          sku: null,
                          product_name: "",
                          image_url: null,
                          image_key: null,
                        });
                        return;
                      }
                      update(i, {
                        product_id: p.id,
                        sku: p.code,
                        product_name: p.name,
                        image_url: p.image_url ?? null,
                        image_key: p.image_key ?? null,
                        unit_price: p.list_price ?? l.unit_price ?? 0,
                        unit: p.uom_name ?? l.unit,
                      });
                    }}
                    disabled={readonly}
                    placeholder="เลือก SKU / ชื่อสินค้า..."
                  />
                  {l.sku && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <code className="rounded bg-orange-50 px-1.5 py-0.5 font-mono text-orange-700">{l.sku}</code>
                      <span className="truncate">{l.product_name}</span>
                    </div>
                  )}
                </div>
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="mt-7 h-8 w-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500"
                    aria-label="ลบรายการ"
                  >
                    x
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 md:grid-cols-[96px_150px_130px_minmax(160px,1fr)_150px]">
                <Field label="จำนวน">
                  <input
                    type="number"
                    value={l.qty}
                    onChange={(e) => update(i, { qty: parseFloat(e.target.value) || 0 })}
                    disabled={readonly}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-right text-sm tabular-nums disabled:bg-slate-50"
                  />
                </Field>

                <Field label="หน่วย">
                  <UnitPicker
                    value={l.unit ? ({ id: "", code: null, name: l.unit, symbol: l.unit } satisfies UnitPickerValue) : null}
                    onChange={(u: UnitPickerValue | null) => update(i, { unit: u?.name ?? "ชิ้น" })}
                    disabled={readonly}
                  />
                </Field>

                <Field label="ราคา/หน่วย">
                  <input
                    type="number"
                    value={l.unit_price}
                    onChange={(e) => update(i, { unit_price: parseFloat(e.target.value) || 0 })}
                    disabled={readonly}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-right text-sm tabular-nums disabled:bg-slate-50"
                  />
                </Field>

                <Field label="ส่วนลด">
                  <div className="flex min-h-10 flex-wrap items-center gap-2">
                    <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={hasDiscount}
                        onChange={(e) => update(i, e.target.checked ? { discount_value: l.discount_value || 1 } : { discount_value: 0 })}
                        disabled={readonly}
                        className="rounded border-slate-300"
                      />
                      มีส่วนลด
                    </label>
                    {hasDiscount && (
                      <div className="grid grid-cols-[minmax(76px,1fr)_58px] gap-1">
                        <input
                          type="number"
                          value={l.discount_value}
                          onChange={(e) => update(i, { discount_value: parseFloat(e.target.value) || 0 })}
                          disabled={readonly}
                          className="h-9 rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums disabled:bg-slate-50"
                        />
                        <select
                          value={l.discount_type}
                          onChange={(e) => update(i, { discount_type: e.target.value as "percent" | "amount" })}
                          disabled={readonly}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50"
                        >
                          <option value="percent">%</option>
                          <option value="amount">บาท</option>
                        </select>
                      </div>
                    )}
                  </div>
                </Field>

                <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-right md:col-span-1">
                  <div className="text-[11px] font-medium text-slate-400">รวมก่อนภาษี</div>
                  <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900">
                    {formatMoney(money(lineTotal(l)))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {lines.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
            {readonly ? "ไม่มีรายการสินค้า" : 'กด "+ เพิ่มรายการ" เพื่อเริ่มเลือกสินค้า'}
          </div>
        )}
      </div>
    </section>
  );
}

const compactLineTotal = (line: EditorLine) => {
  const subtotal = Number(line.qty ?? 0) * Number(line.unit_price ?? 0);
  const discount = Number(line.discount_value ?? 0) <= 0
    ? 0
    : line.discount_type === "percent"
      ? subtotal * (Number(line.discount_value ?? 0) / 100)
      : Number(line.discount_value ?? 0);
  return Math.max(0, subtotal - discount);
};

const compactDiscountLabel = (line: EditorLine) => {
  const value = Number(line.discount_value ?? 0);
  if (value <= 0) return "-";
  return line.discount_type === "percent"
    ? `${value.toLocaleString("th-TH")}%`
    : formatMoney(money(value));
};

export function SalesLineCompactTable({
  lines,
  maxHeight = 360,
}: {
  lines: EditorLine[];
  maxHeight?: number;
}) {
  const total = lines.reduce((sum, line) => sum + compactLineTotal(line), 0);

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
        ไม่มีรายการสินค้า
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="min-w-[960px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="w-12 px-3 py-2 text-center font-semibold">#</th>
              <th className="w-16 px-2 py-2 text-left font-semibold">รูป</th>
              <th className="min-w-[320px] px-3 py-2 text-left font-semibold">สินค้า</th>
              <th className="w-24 px-3 py-2 text-right font-semibold">จำนวน</th>
              <th className="w-24 px-3 py-2 text-left font-semibold">หน่วย</th>
              <th className="w-32 px-3 py-2 text-right font-semibold">ราคา/หน่วย</th>
              <th className="w-28 px-3 py-2 text-right font-semibold">ส่วนลด</th>
              <th className="w-36 px-3 py-2 text-right font-semibold">รวม</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, index) => (
              <tr key={line.tempId} className="bg-white hover:bg-slate-50/80">
                <td className="px-3 py-2 text-center font-mono text-xs text-slate-400">{index + 1}</td>
                <td className="px-2 py-2">
                  <ImageThumbnail url={lineImageUrl(line)} size={44} alt={line.product_name || "สินค้า"} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="truncate font-medium text-slate-800">{line.product_name || "-"}</div>
                    <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-400">
                      {line.sku ? (
                        <code className="shrink-0 rounded bg-orange-50 px-1.5 py-0.5 font-mono text-orange-700">
                          {line.sku}
                        </code>
                      ) : (
                        <span className="shrink-0">ไม่มี SKU</span>
                      )}
                      {line.note ? <span className="truncate">{line.note}</span> : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                  {Number(line.qty ?? 0).toLocaleString("th-TH")}
                </td>
                <td className="px-3 py-2 text-slate-600">{line.unit || "-"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                  {formatMoney(money(Number(line.unit_price ?? 0)))}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-500">
                  {compactDiscountLabel(line)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
                  {formatMoney(money(compactLineTotal(line)))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-50">
            <tr className="border-t border-slate-200">
              <td colSpan={7} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                รวมรายการสินค้า
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                {formatMoney(money(total))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
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
      <span className={`font-mono tabular-nums ${accent ? "text-emerald-700" : strong ? "text-blue-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
