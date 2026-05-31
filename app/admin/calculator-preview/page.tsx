"use client";

import { useState, useMemo } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { calculateDocument, type LineInput, type DiscountInput, type TaxConfig } from "@/lib/tax";
import { format as fmtMoney, type CurrencyCode, CURRENCIES } from "@/lib/money";

type RowDraft = {
  product: string;
  qty:     string;
  price:   string;
  discPct: string;
};

const SAMPLE: RowDraft[] = [
  { product: "กระดาษ A4 80gsm",  qty: "10", price: "120", discPct: "0" },
  { product: "ปากกาเจล สีน้ำเงิน", qty: "20", price: "25",  discPct: "5" },
  { product: "หมึกพิมพ์ HP 680",   qty: "3",  price: "750", discPct: "0" },
];

export default function CalculatorPreviewPage() {
  const [currency, setCurrency] = useState<CurrencyCode>("THB");
  const [rows,     setRows]     = useState<RowDraft[]>(SAMPLE);
  const [vatRate,  setVatRate]  = useState("7");
  const [vatIncluded, setVatIncluded] = useState(false);
  const [whtRate,  setWhtRate]  = useState("3");
  const [headerDiscPct, setHeaderDiscPct] = useState("0");
  const [shipping, setShipping] = useState("0");

  const updateRow = (i: number, patch: Partial<RowDraft>) => {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };
  const addRow    = () => setRows(rs => [...rs, { product: "", qty: "1", price: "0", discPct: "0" }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const result = useMemo(() => {
    const lines: LineInput[] = rows.map(r => ({
      qty:        parseFloat(r.qty) || 0,
      unit_price: parseFloat(r.price) || 0,
      discount:   parseFloat(r.discPct) > 0
        ? { type: "percent" as const, value: parseFloat(r.discPct) }
        : undefined,
    }));

    const tax: TaxConfig = {
      vat_rate:     parseFloat(vatRate) || 0,
      vat_included: vatIncluded,
      wht_rate:     parseFloat(whtRate) || 0,
    };
    const headerDisc: DiscountInput | undefined = parseFloat(headerDiscPct) > 0
      ? { type: "percent", value: parseFloat(headerDiscPct) }
      : undefined;

    return calculateDocument({
      currency, lines, tax,
      header_discount: headerDisc,
      shipping_fee:    parseFloat(shipping) || 0,
    });
  }, [rows, vatRate, vatIncluded, whtRate, headerDiscPct, shipping, currency]);

  const fmt = (m: typeof result.subtotal) => fmtMoney(m, { symbol: true });

  return (
    <PlaygroundShell>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">💰 Calculator Preview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ทดสอบ Money / Tax service ก่อนเอาไปใช้ใน PR / PO / Invoice — แก้ค่าได้สด
          </p>
        </div>

        {/* Config bar */}
        <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">สกุลเงิน</span>
            <select value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded bg-white">
              {Object.values(CURRENCIES).map(c => (
                <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">VAT %</span>
            <input value={vatRate} onChange={e => setVatRate(e.target.value)} type="number"
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">รวม VAT</span>
            <div className="h-9 mt-0.5 flex items-center">
              <input type="checkbox" checked={vatIncluded} onChange={e => setVatIncluded(e.target.checked)}
                className="rounded border-slate-300" />
              <span className="ml-2 text-xs text-slate-500">{vatIncluded ? "Included" : "Excluded"}</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">WHT %</span>
            <input value={whtRate} onChange={e => setWhtRate(e.target.value)} type="number"
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ลดท้ายบิล %</span>
            <input value={headerDiscPct} onChange={e => setHeaderDiscPct(e.target.value)} type="number"
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">ค่าจัดส่ง</span>
            <input value={shipping} onChange={e => setShipping(e.target.value)} type="number"
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded" />
          </label>
        </div>

        {/* Lines */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">รายการสินค้า ({rows.length})</h2>
            <button onClick={addRow}
              className="h-7 px-3 text-xs font-medium border border-slate-200 rounded hover:bg-white text-slate-700">
              + เพิ่มรายการ
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium w-8">#</th>
                <th className="text-left px-3 py-1.5 font-medium">สินค้า</th>
                <th className="text-right px-3 py-1.5 font-medium w-20">จำนวน</th>
                <th className="text-right px-3 py-1.5 font-medium w-28">ราคา/หน่วย</th>
                <th className="text-right px-3 py-1.5 font-medium w-16">ส่วนลด%</th>
                <th className="text-right px-3 py-1.5 font-medium w-32">ก่อน VAT</th>
                <th className="text-right px-3 py-1.5 font-medium w-32">VAT</th>
                <th className="text-right px-3 py-1.5 font-medium w-32">รวม</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const calc = result.lines[i];
                return (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1 text-slate-400 font-mono">{i + 1}</td>
                    <td className="px-3 py-1">
                      <input value={r.product} onChange={e => updateRow(i, { product: e.target.value })}
                        className="w-full h-7 px-2 text-xs border border-slate-200 rounded" />
                    </td>
                    <td className="px-3 py-1">
                      <input value={r.qty} onChange={e => updateRow(i, { qty: e.target.value })} type="number"
                        className="w-full h-7 px-2 text-xs text-right border border-slate-200 rounded" />
                    </td>
                    <td className="px-3 py-1">
                      <input value={r.price} onChange={e => updateRow(i, { price: e.target.value })} type="number"
                        className="w-full h-7 px-2 text-xs text-right border border-slate-200 rounded" />
                    </td>
                    <td className="px-3 py-1">
                      <input value={r.discPct} onChange={e => updateRow(i, { discPct: e.target.value })} type="number"
                        className="w-full h-7 px-2 text-xs text-right border border-slate-200 rounded" />
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-slate-700">{fmt(calc.net)}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-slate-500">{fmt(calc.vat_amount)}</td>
                    <td className="px-3 py-1 text-right tabular-nums font-semibold text-slate-800">{fmt(calc.line_total)}</td>
                    <td className="px-3 py-1">
                      <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-12 gap-4">
          <aside className="col-span-12 md:col-span-7 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-2">📐 รายละเอียดการคำนวณ</h3>
            <div className="space-y-1 text-xs text-amber-900">
              <Row label="Subtotal (qty × price)"               value={fmt(result.subtotal)} />
              <Row label="− Line discount"                       value={fmt(result.total_line_discount)} />
              <Row label="= Net before header discount"          value={fmt(result.net_before_header_disc)} bold />
              <Row label={`− Header discount (${headerDiscPct}%)`} value={fmt(result.header_discount)} />
              <Row label="+ Shipping"                            value={fmt(result.shipping)} />
              <Row label="= Taxable amount"                      value={fmt(result.taxable)} bold />
              <Row label={`+ VAT ${vatIncluded ? "(แกะออก)" : `${vatRate}%`}`} value={fmt(result.total_vat)} />
              <Row label="= Grand Total"                         value={fmt(result.grand_total)} highlight />
              <Row label={`− WHT ${whtRate}%`}                  value={fmt(result.total_wht)} />
              <Row label="= Amount Due (ผู้ขายได้รับ)"          value={fmt(result.amount_due)} highlight emerald />
            </div>
          </aside>

          <div className="col-span-12 md:col-span-5 bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">💵 สรุปบนเอกสาร</h3>
            <div className="space-y-2">
              <Big label="ยอดสุทธิ"     value={fmt(result.taxable)} />
              <Big label="VAT"           value={fmt(result.total_vat)} />
              <Big label="รวมทั้งสิ้น"   value={fmt(result.grand_total)} primary />
              <Big label="ลูกค้าจ่ายจริง" value={fmt(result.amount_due)} emerald />
            </div>
            <details className="mt-4">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">🔬 ดู raw output (debug)</summary>
              <pre className="mt-2 p-2 bg-slate-50 rounded text-[10px] font-mono overflow-auto max-h-48">
                {JSON.stringify({
                  subtotal: result.subtotal,
                  total_vat: result.total_vat,
                  grand_total: result.grand_total,
                  amount_due: result.amount_due,
                }, null, 2)}
              </pre>
            </details>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
          💡 <strong>Service นี้ใช้ที่ไหน:</strong> ทุกเอกสารที่มียอด (PR, PO, Invoice, Sales Order, QC return)
          ต้องเรียก <code className="bg-white px-1 rounded">calculateDocument(...)</code> แทนคำนวณเอง —
          กัน floating-point error + รองรับ multi-currency + VAT included/excluded + WHT
        </div>
      </div>
    </PlaygroundShell>
  );
}

function Row({ label, value, bold, highlight, emerald }: { label: string; value: string; bold?: boolean; highlight?: boolean; emerald?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${highlight ? "pt-1 mt-1 border-t border-amber-200" : ""} ${emerald ? "text-emerald-800" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums font-mono">{value}</span>
    </div>
  );
}

function Big({ label, value, primary, emerald }: { label: string; value: string; primary?: boolean; emerald?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-base tabular-nums font-mono ${primary ? "text-2xl font-bold text-blue-700" : emerald ? "text-xl font-bold text-emerald-700" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}
