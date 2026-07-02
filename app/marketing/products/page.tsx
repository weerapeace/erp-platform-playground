"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

const nf = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const baht = (v: number) => "฿" + v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
function thaiDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}
const PLATFORM: Record<string, { label: string; dot: string }> = {
  shopee: { label: "Shopee", dot: "bg-orange-500" },
  lazada: { label: "Lazada", dot: "bg-blue-600" },
  tiktok: { label: "TikTok", dot: "bg-slate-800" },
};
const platLabel = (k: string) => PLATFORM[k]?.label ?? k;
const platDot = (k: string) => PLATFORM[k]?.dot ?? "bg-slate-400";

interface Product {
  internal_sku: string | null;
  display_name: string;
  mapped: boolean;
  marketplace_item_id: string;
  total_sales: number;
  total_orders: number;
  total_units: number;
  by_platform: Record<string, number>;
  channel_count: number;
}
interface RollupData {
  products: Product[];
  platforms: string[];
  date_min: string | null;
  date_max: string | null;
}

export default function MarketingProductsPage() {
  const [data, setData] = useState<RollupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/marketing/products");
      const j = await r.json();
      if (!r.ok || j.error) {
        setErr(j.error || "โหลดข้อมูลไม่สำเร็จ");
        setData(null);
      } else setData(j.data as RollupData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const products = data?.products ?? [];
  const hasData = products.length > 0;
  const totalSales = products.reduce((a, p) => a + p.total_sales, 0);
  const totalOrders = products.reduce((a, p) => a + p.total_orders, 0);
  const mappedCount = products.filter((p) => p.mapped).length;
  const maxSales = Math.max(1, ...products.map((p) => p.total_sales));

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">🧺 สินค้า (รวมทุกช่องทาง)</h1>
            <p className="text-sm text-slate-500 mt-1">
              รวมยอดขายรายสินค้าจากทุก marketplace {data?.date_min ? `· ${thaiDate(data.date_min)} – ${thaiDate(data.date_max)}` : ""} · ยอด &quot;ชำระเงินแล้ว&quot;
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/marketing/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
              ← Dashboard
            </Link>
            <Link href="/marketing/import" className="rounded-lg bg-blue-600 text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700">
              ⬆️ อัปไฟล์
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 space-y-6 max-w-6xl mx-auto">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="text-sm text-red-700">{err}</div>
            <button onClick={() => load()} className="mt-3 rounded-lg border border-red-200 bg-white text-red-700 px-4 py-1.5 text-sm font-medium hover:bg-red-50">
              ลองใหม่
            </button>
          </div>
        ) : !hasData ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <div className="text-4xl mb-3">🧺</div>
            <h2 className="text-lg font-semibold text-slate-800">ยังไม่มีข้อมูลสินค้า</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              อัปไฟล์ยอดขายจาก marketplace แล้วผูกรหัสสินค้า สินค้าจะถูกรวมยอดข้ามช่องทางที่นี่
            </p>
            <Link href="/marketing/import" className="inline-flex items-center gap-1.5 mt-4 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">
              ⬆️ อัปไฟล์
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="ยอดขายรวม" value={baht(totalSales)} sub="ทุกสินค้า ทุกช่องทาง" accent />
              <StatCard label="ออเดอร์รวม" value={nf(totalOrders)} />
              <StatCard label="จำนวนสินค้า" value={nf(products.length)} sub={`ผูก SKU แล้ว ${mappedCount}`} />
              <StatCard label="ช่องทาง" value={(data?.platforms ?? []).map(platLabel).join(", ") || "-"} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">รวมยอดรายสินค้า</h2>
                <p className="text-xs text-slate-400 mt-0.5">สินค้าที่ผูก SKU เดียวกันจะถูกรวมข้ามช่องทางให้อัตโนมัติ</p>
              </div>
              <div className="divide-y divide-slate-100">
                {products.map((p, i) => (
                  <div key={p.internal_sku ?? p.marketplace_item_id} className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-700 truncate" title={p.display_name}>
                          {p.display_name || "(ไม่มีชื่อ)"}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {p.mapped ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium">
                              🔗 {p.internal_sku}
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[10px]" title={`รหัส ${p.marketplace_item_id}`}>
                              ยังไม่ผูก SKU
                            </span>
                          )}
                          {Object.keys(p.by_platform).map((pl) => (
                            <span key={pl} className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                              <span className={`w-1.5 h-1.5 rounded-full ${platDot(pl)}`} />
                              {platLabel(pl)} {baht(p.by_platform[pl])}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right w-28">
                        <div className="text-sm font-semibold text-slate-800 tabular-nums">{baht(p.total_sales)}</div>
                        <div className="text-[10px] text-slate-400 tabular-nums">
                          {nf(p.total_orders)} ออเดอร์ · {nf(p.total_units)} ชิ้น
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 ml-9 h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-md">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(p.total_sales / maxSales) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              หมายเหตุ: ยอดที่รวมคือยอด &quot;ชำระเงินแล้ว&quot; ของทุกวันที่นำเข้า · สินค้าที่ยังไม่ผูก SKU จะแยกตามช่องทาง
              (ผูกได้ที่หน้า Dashboard) · เมื่อผูก SKU เดียวกันข้ามช่องทาง ระบบจะรวมให้เป็นสินค้าเดียว
            </p>
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums ${accent ? "text-blue-700" : "text-slate-800"}`}>{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-400 leading-snug">{sub}</div> : null}
    </div>
  );
}
