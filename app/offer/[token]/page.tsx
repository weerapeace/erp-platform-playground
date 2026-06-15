"use client";

/**
 * /offer/[token] — หน้าใบเสนอสาธารณะ (ลูกค้าเปิดดูได้ไม่ต้องล็อกอิน) + พิมพ์ PDF
 *
 * - ดึงข้อมูลผ่าน /api/offer-sheets/public/[token] (อ่านอย่างเดียว)
 * - ?print=1 → สั่งพิมพ์อัตโนมัติ (บันทึกเป็น PDF ได้)
 * - ธีมชมพู + print CSS สะอาด
 */

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Item = {
  sku_code: string | null; name: string | null; image_r2_key: string | null;
  uom_name: string | null; unit_price: number; qty: number; note: string | null;
};
type Offer = {
  offer_no: string | null; title: string; customer_name: string | null;
  offer_date: string; note: string | null; status: string; items: Item[];
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const imgUrl = (key: string | null) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null);

export default function PublicOfferPage() {
  return (
    <Suspense fallback={<Center>กำลังโหลด…</Center>}>
      <PublicOfferInner />
    </Suspense>
  );
}

function PublicOfferInner() {
  const token = String(useParams().token ?? "");
  const wantPrint = useSearchParams().get("print") === "1";
  const [offer, setOffer] = useState<Offer | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/offer-sheets/public/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.data) { setOffer(j.data); setState("ok"); } else setState("error");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    if (state === "ok" && wantPrint) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [state, wantPrint]);

  if (state === "loading") return <Center>กำลังโหลด…</Center>;
  if (state === "error" || !offer) return <Center>🔍 ไม่พบใบเสนอนี้ (ลิงก์อาจหมดอายุหรือถูกลบ)</Center>;

  const grand = offer.items.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.qty || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-rose-50/40 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-pink-100 shadow-sm overflow-hidden print:border-0 print:shadow-none">
        {/* หัว */}
        <div className="bg-gradient-to-r from-pink-400 to-rose-400 text-white px-6 py-5 print:bg-rose-500">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xl font-bold flex items-center gap-2">🌸 ใบเสนอสินค้า</div>
              {offer.title && <div className="text-pink-50 text-sm mt-0.5">{offer.title}</div>}
            </div>
            <div className="text-right text-sm">
              <div className="font-mono">{offer.offer_no ?? ""}</div>
              <div className="text-pink-50">{offer.offer_date}</div>
            </div>
          </div>
          {offer.customer_name && <div className="mt-3 text-sm text-pink-50">เรียน: <span className="font-medium text-white">{offer.customer_name}</span></div>}
        </div>

        {/* รายการ */}
        <div className="p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-pink-50 text-rose-500 text-left">
                <th className="px-3 py-2 font-semibold">สินค้า</th>
                <th className="px-3 py-2 font-semibold text-center w-16">หน่วย</th>
                <th className="px-3 py-2 font-semibold text-center w-16">จำนวน</th>
                <th className="px-3 py-2 font-semibold text-right w-28">ราคา/หน่วย</th>
                <th className="px-3 py-2 font-semibold text-right w-28">รวม</th>
              </tr>
            </thead>
            <tbody>
              {offer.items.map((it, i) => (
                <tr key={i} className="border-t border-pink-50 align-top">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {imgUrl(it.image_r2_key)
                        ? <img src={imgUrl(it.image_r2_key)!} alt="" className="w-12 h-12 rounded-lg object-cover border border-pink-100 flex-shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                        : <div className="w-12 h-12 rounded-lg bg-pink-50 flex items-center justify-center text-pink-200 flex-shrink-0">🖼️</div>}
                      <div className="min-w-0">
                        <div className="font-medium text-slate-700">{it.name}</div>
                        <div className="font-mono text-xs text-slate-400">{it.sku_code}</div>
                        {it.note && <div className="text-xs text-slate-500 mt-0.5">{it.note}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-slate-500">{it.uom_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-center text-slate-600">{it.qty}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{money(it.unit_price)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-rose-600">{money(Number(it.unit_price || 0) * Number(it.qty || 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-pink-100">
                <td colSpan={4} className="px-3 py-3 text-right font-semibold text-slate-500">ยอดรวมทั้งหมด</td>
                <td className="px-3 py-3 text-right text-lg font-bold text-rose-600">{money(grand)}</td>
              </tr>
            </tfoot>
          </table>

          {offer.note && (
            <div className="mt-5 p-4 rounded-xl bg-pink-50/60 text-sm text-slate-600 whitespace-pre-wrap">{offer.note}</div>
          )}
        </div>
      </div>

      {/* ปุ่มพิมพ์ (ซ่อนตอนพิมพ์) */}
      <div className="max-w-3xl mx-auto mt-5 text-center print:hidden">
        <button onClick={() => window.print()}
          className="h-11 px-6 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold shadow-lg shadow-pink-200 hover:from-pink-600 hover:to-rose-600">
          🖨️ พิมพ์ / บันทึก PDF
        </button>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm p-8 text-center">{children}</div>;
}
