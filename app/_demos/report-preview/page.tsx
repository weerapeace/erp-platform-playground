"use client";

import { useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";

// ---- Mock PO data ----

const MOCK_PO = {
  number: "PO-2026-00032",
  date: "29 พฤษภาคม 2569",
  dueDate: "15 มิถุนายน 2569",
  supplier: { code: "SUP-001", name: "บริษัท ออฟฟิศซัพพลาย จำกัด", address: "123/45 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110", contact: "02-111-2222" },
  company: { name: "บริษัท ERP Demo จำกัด", address: "456/78 ถ.พระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310", tax: "0-1234-56789-01-2" },
  items: [
    { sku: "SKU-001", name: "กระดาษ A4 80gsm", qty: 20, unit: "รีม",  price: 120,  discount: 0 },
    { sku: "SKU-005", name: "หมึกปริ้นเตอร์ HP 680", qty: 10, unit: "ชิ้น", price: 650,  discount: 5 },
    { sku: "SKU-009", name: "เมาส์ USB Optical",    qty: 5,  unit: "ชิ้น", price: 199,  discount: 0 },
    { sku: "SKU-012", name: "คีย์บอร์ด USB ไทย-อังกฤษ", qty: 3, unit: "ชิ้น", price: 350, discount: 0 },
  ],
  paymentTerms: "Net 30 วัน",
  note: "กรุณาส่งสินค้าพร้อม Invoice และ Packing List",
  approvedBy: "วิชัย มั่นคง",
  approvedPosition: "ผู้จัดการจัดซื้อ",
};

type Template = "purchase-order" | "quotation" | "invoice";

const TEMPLATE_CONFIG: Record<Template, { label: string; icon: string; titleTH: string; accentColor: string; accentBg: string }> = {
  "purchase-order": { label: "Purchase Order", icon: "📋", titleTH: "ใบสั่งซื้อ",     accentColor: "text-blue-700",    accentBg: "bg-blue-700"    },
  "quotation":      { label: "Quotation",       icon: "💬", titleTH: "ใบเสนอราคา",   accentColor: "text-emerald-700", accentBg: "bg-emerald-700" },
  "invoice":        { label: "Invoice",         icon: "🧾", titleTH: "ใบแจ้งหนี้",   accentColor: "text-purple-700",  accentBg: "bg-purple-700"  },
};

export default function ReportPreviewPage() {
  const [template, setTemplate] = useState<Template>("purchase-order");

  const cfg = TEMPLATE_CONFIG[template];
  const subtotal = MOCK_PO.items.reduce((sum, i) => sum + i.qty * i.price * (1 - i.discount / 100), 0);
  const vat = Math.round(subtotal * 0.07);
  const total = subtotal + vat;

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 8 — Report Preview
        </div>
        <h1 className="text-2xl font-bold text-slate-900">🖨️ Report & Print Preview</h1>
        <p className="text-slate-500 mt-1">ตัวอย่าง PDF Template — เลือก Template แล้วกด Print</p>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* Template selector + print */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(TEMPLATE_CONFIG) as Template[]).map((t) => {
              const c = TEMPLATE_CONFIG[t];
              return (
                <button
                  key={t}
                  onClick={() => setTemplate(t)}
                  className={`h-9 px-4 text-sm font-medium rounded-lg border flex items-center gap-1.5 transition-colors ${
                    template === t
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                  }`}
                >
                  <span>{c.icon}</span> {c.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => window.print()}
            className="h-9 px-5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg flex items-center gap-2"
          >
            🖨️ พิมพ์ / Export PDF
          </button>
        </div>

        {/* Document preview */}
        <div className="bg-white shadow-xl rounded-xl border border-slate-200 max-w-3xl mx-auto">
          {/* Document header bar */}
          <div className={`${cfg.accentBg} text-white px-8 py-4 rounded-t-xl flex items-center justify-between`}>
            <div>
              <div className="text-xs opacity-75 mb-0.5">{MOCK_PO.company.name}</div>
              <div className="text-xl font-bold">{cfg.titleTH}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-mono font-bold">{MOCK_PO.number}</div>
              <div className="text-xs opacity-75 mt-0.5">วันที่: {MOCK_PO.date}</div>
            </div>
          </div>

          <div className="px-8 py-6 space-y-6">
            {/* Company + Supplier info */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">จาก (From)</p>
                <p className="font-semibold text-slate-900">{MOCK_PO.company.name}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{MOCK_PO.company.address}</p>
                <p className="text-xs text-slate-500 mt-1">เลขภาษี: {MOCK_PO.company.tax}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ถึง (To)</p>
                <p className="text-xs text-slate-400 font-mono">{MOCK_PO.supplier.code}</p>
                <p className="font-semibold text-slate-900">{MOCK_PO.supplier.name}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{MOCK_PO.supplier.address}</p>
                <p className="text-xs text-slate-500 mt-1">โทร: {MOCK_PO.supplier.contact}</p>
              </div>
            </div>

            {/* PO Meta */}
            <div className="grid grid-cols-3 gap-4 bg-slate-50 rounded-xl px-4 py-3">
              <div><p className="text-xs text-slate-400">วันที่เอกสาร</p><p className="text-sm font-medium text-slate-800 mt-0.5">{MOCK_PO.date}</p></div>
              <div><p className="text-xs text-slate-400">กำหนดส่ง</p><p className="text-sm font-medium text-slate-800 mt-0.5">{MOCK_PO.dueDate}</p></div>
              <div><p className="text-xs text-slate-400">เงื่อนไขชำระ</p><p className="text-sm font-medium text-slate-800 mt-0.5">{MOCK_PO.paymentTerms}</p></div>
            </div>

            {/* Line items */}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-8">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">รายการสินค้า</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-20">จำนวน</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-16">หน่วย</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-28">ราคา/หน่วย</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-16">ส่วนลด%</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-28">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {MOCK_PO.items.map((item, i) => {
                    const lineTotal = item.qty * item.price * (1 - item.discount / 100);
                    return (
                      <tr key={item.sku} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-400 text-center">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{item.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{item.qty}</td>
                        <td className="px-4 py-3 text-slate-500">{item.unit}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{item.price.toLocaleString("th-TH")}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{item.discount > 0 ? `${item.discount}%` : "-"}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">{lineTotal.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 text-sm">
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right text-xs text-slate-500">ยอดก่อนภาษี</td>
                    <td className="px-4 py-2 text-right text-slate-700">{subtotal.toLocaleString("th-TH")}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right text-xs text-slate-500">ภาษีมูลค่าเพิ่ม 7%</td>
                    <td className="px-4 py-2 text-right text-slate-700">{vat.toLocaleString("th-TH")}</td>
                  </tr>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={6} className="px-4 py-3 text-right font-bold text-slate-700">ยอดรวมสุทธิ</td>
                    <td className={`px-4 py-3 text-right font-bold text-lg ${cfg.accentColor}`}>
                      ฿{total.toLocaleString("th-TH")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Note */}
            {MOCK_PO.note && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">หมายเหตุ</p>
                <p className="text-xs text-amber-700">{MOCK_PO.note}</p>
              </div>
            )}

            {/* Signature block */}
            <div className="grid grid-cols-2 gap-12 pt-4 border-t border-slate-200">
              <div className="text-center">
                <div className="h-14 border-b border-slate-300 mb-2" />
                <p className="text-xs text-slate-500">ผู้สั่งซื้อ</p>
                <p className="text-xs text-slate-400 mt-0.5">วันที่: _______________</p>
              </div>
              <div className="text-center">
                <div className="h-14 border-b border-slate-300 mb-2 flex items-end justify-center">
                  <p className="text-sm font-medium text-slate-700 pb-1">{MOCK_PO.approvedBy}</p>
                </div>
                <p className="text-xs text-slate-500">{MOCK_PO.approvedPosition}</p>
                <p className="text-xs text-slate-400 mt-0.5">วันที่: {MOCK_PO.date}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-300">{MOCK_PO.company.name}</p>
              <p className="text-xs text-slate-300">หน้า 1/1</p>
            </div>
          </div>
        </div>

        {/* Feature checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-3xl mx-auto">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { done: true,  label: "Document preview (mock)" },
              { done: true,  label: "Template selector (PO / Quotation / Invoice)" },
              { done: true,  label: "Line items + ส่วนลด" },
              { done: true,  label: "VAT calculation" },
              { done: true,  label: "Signature block" },
              { done: true,  label: "Print via browser" },
              { done: false, label: "PDF export (จริง)" },
              { done: false, label: "Template builder UI" },
              { done: false, label: "Company logo upload" },
              { done: false, label: "Thai / English toggle" },
              { done: false, label: "Email report" },
              { done: false, label: "Barcode / QR code" },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}>
                <span>{item.done ? "✅" : "⬜"}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

      </div>
    </PlaygroundShell>
  );
}
