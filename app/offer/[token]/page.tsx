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
import { visibleColumns, type LineColumnConfig } from "@/components/line-item-columns";
import { OFFER_ITEM_COLUMNS, DEFAULT_OFFER_COLS, offerColAlign, offerGroupValue } from "@/lib/offer-columns";
import { getOfferTemplate, type OfferTemplateKey } from "@/lib/offer-templates";

type Item = {
  sku_code: string | null; name: string | null; image_r2_key: string | null;
  uom_name: string | null; color: string | null; category: string | null;
  unit_price: number; qty: number; note: string | null;
};
type Offer = {
  offer_no: string | null; title: string; customer_name: string | null;
  offer_date: string; note: string | null; status: string;
  template_key: OfferTemplateKey;
  items: Item[]; columns: LineColumnConfig | null;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const imgUrl = (key: string | null) => (key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null);

// เนื้อหาช่องตามคอลัมน์ (อ่านอย่างเดียว)
const cellOf = (key: string, it: Item) => {
  switch (key) {
    case "image":
      return imgUrl(it.image_r2_key)
        ? <img src={imgUrl(it.image_r2_key)!} alt="" className="w-12 h-12 rounded-lg object-cover border border-pink-100"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
        : <div className="w-12 h-12 rounded-lg bg-pink-50 flex items-center justify-center text-pink-200">🖼️</div>;
    case "product":
      return (<div><div className="font-medium text-slate-700">{it.name}</div>
        <div className="font-mono text-xs text-slate-400">{it.sku_code}</div></div>);
    case "color":      return it.color ?? "—";
    case "category":   return it.category ?? "—";
    case "uom":        return it.uom_name ?? "—";
    case "qty":        return it.qty;
    case "unit_price": return money(it.unit_price);
    case "total":      return <span className="font-semibold text-rose-600">{money(Number(it.unit_price || 0) * Number(it.qty || 0))}</span>;
    case "note":       return <span className="text-xs text-slate-500">{it.note ?? ""}</span>;
    default: return null;
  }
};

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
  const template = getOfferTemplate(offer.template_key);
  const cfg = offer.columns ?? DEFAULT_OFFER_COLS;
  const vis = visibleColumns(OFFER_ITEM_COLUMNS, cfg);
  const grouped = !!cfg.groupBy;
  const groups: [string, Item[]][] = grouped
    ? Array.from(offer.items.reduce((m, it) => {
        const g = offerGroupValue(it, cfg.groupBy!);
        m.set(g, [...(m.get(g) ?? []), it]); return m;
      }, new Map<string, Item[]>()).entries())
    : [];

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
          {template.publicView === "grid" ? (
            <ProductGrid items={offer.items} />
          ) : template.publicView === "mobile" ? (
            <MobileList items={offer.items} />
          ) : (
            <OfferTable items={offer.items} vis={vis} grouped={grouped} groups={groups} grand={grand} />
          )}

          {template.publicView !== "table" && (
            <div className="mt-5 rounded-xl border border-pink-100 bg-pink-50/60 p-4 text-right text-lg font-bold text-rose-600">
              <span className="mr-3 text-sm font-semibold text-slate-500">ยอดรวมทั้งหมด</span>{money(grand)}
            </div>
          )}

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

function PublicGroup({ name, colSpan, children }: { name: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-rose-50/70">
        <td colSpan={colSpan} className="px-3 py-1.5 text-xs font-semibold text-rose-500">📂 {name}</td>
      </tr>
      {children}
    </>
  );
}

function OfferTable({
  items,
  vis,
  grouped,
  groups,
  grand,
}: {
  items: Item[];
  vis: { key: string; label: string }[];
  grouped: boolean;
  groups: [string, Item[]][];
  grand: number;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-pink-50 text-rose-500 text-left">
          {vis.map((col) => (
            <th key={col.key} className={`px-3 py-2 font-semibold ${offerColAlign(col.key)}`}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grouped
          ? groups.map(([gName, rows]) => (
              <PublicGroup key={gName} name={gName} colSpan={vis.length}>
                {rows.map((it, i) => (
                  <tr key={i} className="border-t border-pink-50 align-top">
                    {vis.map((col) => (
                      <td key={col.key} className={`px-3 py-2.5 text-slate-600 ${offerColAlign(col.key)}`}>{cellOf(col.key, it)}</td>
                    ))}
                  </tr>
                ))}
              </PublicGroup>
            ))
          : items.map((it, i) => (
              <tr key={i} className="border-t border-pink-50 align-top">
                {vis.map((col) => (
                  <td key={col.key} className={`px-3 py-2.5 text-slate-600 ${offerColAlign(col.key)}`}>{cellOf(col.key, it)}</td>
                ))}
              </tr>
            ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-pink-100">
          <td colSpan={vis.length} className="px-3 py-3 text-right text-lg font-bold text-rose-600">
            <span className="font-semibold text-slate-500 text-sm mr-3">ยอดรวมทั้งหมด</span>{money(grand)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function ProductGrid({ items }: { items: Item[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((it, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm break-inside-avoid">
          <div className="aspect-[4/3] bg-pink-50">
            {imgUrl(it.image_r2_key) ? (
              <img src={imgUrl(it.image_r2_key)!} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl text-pink-200">🖼️</div>
            )}
          </div>
          <div className="p-4">
            <div className="text-base font-semibold text-slate-800">{it.name}</div>
            <div className="mt-1 font-mono text-xs text-slate-400">{it.sku_code}</div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="text-xs text-slate-500">
                {it.color && <div>สี: {it.color}</div>}
                <div>จำนวน: {it.qty} {it.uom_name ?? ""}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">ราคา</div>
                <div className="font-bold text-rose-600">{money(Number(it.unit_price || 0))}</div>
              </div>
            </div>
            {it.note && <div className="mt-3 rounded-lg bg-pink-50 px-3 py-2 text-xs text-slate-500">{it.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileList({ items }: { items: Item[] }) {
  return (
    <div className="space-y-3">
      {items.map((it, index) => (
        <div key={index} className="flex gap-3 rounded-2xl border border-pink-100 bg-white p-3 shadow-sm break-inside-avoid">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-pink-50">
            {imgUrl(it.image_r2_key) ? (
              <img src={imgUrl(it.image_r2_key)!} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-pink-200">🖼️</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-800">{it.name}</div>
            <div className="mt-0.5 font-mono text-xs text-slate-400">{it.sku_code}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">จำนวน {it.qty}</div>
              <div className="font-bold text-rose-600">{money(Number(it.unit_price || 0) * Number(it.qty || 0))}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm p-8 text-center">{children}</div>;
}
