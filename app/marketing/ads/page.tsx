"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";

const nf = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const baht = (v: number) => "฿" + v.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const pct = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 }) + "%";
const roasFmt = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 }) + "x";
function thaiDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}
const roasColor = (v: number) => (v >= 4 ? "text-emerald-600" : v >= 2 ? "text-amber-600" : "text-red-600");

interface Campaign {
  campaign_name: string;
  status: string;
  ad_type: string;
  impressions: number;
  clicks: number;
  ctr: number;
  orders: number;
  conversion_rate: number;
  cpa: number;
  items_sold: number;
  sales: number;
  spend: number;
  roas: number;
  acos: number;
}
interface AdsData {
  platform: string;
  shop: string;
  period_start: string | null;
  period_end: string | null;
  campaigns: Campaign[];
  totals: { spend: number; sales: number; orders: number; clicks: number; impressions: number; roas: number; acos: number; cpc: number; ctr: number } | null;
  meta: { periods: { key: string; start: string; end: string }[]; shops: string[] };
}

export default function MarketingAdsPage() {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (opts?: { period?: string; shop?: string }) => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (opts?.period) qs.set("period", opts.period);
      if (opts?.shop) qs.set("shop", opts.shop);
      const r = await apiFetch("/api/marketing/ads?" + qs.toString());
      const j = await r.json();
      if (!r.ok || j.error) {
        setErr(j.error || "โหลดข้อมูลไม่สำเร็จ");
        setData(null);
      } else setData(j.data as AdsData);
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

  const t = data?.totals;
  const hasData = !!data && data.campaigns.length > 0;
  const curPeriodKey = data ? `${data.period_start}|${data.period_end}` : "";

  return (
    <PlaygroundShell>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">📢 โฆษณา Shopee (ROAS)</h1>
            <p className="text-sm text-slate-500 mt-1">
              {data?.shop ? (
                <>
                  ร้าน <span className="font-medium text-slate-700">{data.shop}</span>
                  {data.period_start ? (
                    <>
                      {" "}
                      · ช่วง <span className="font-medium text-slate-700">{thaiDate(data.period_start)} – {thaiDate(data.period_end ?? "")}</span>
                    </>
                  ) : null}
                </>
              ) : (
                "ผลโฆษณาราย Campaign"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data && data.meta.periods.length > 0 && (
              <select
                value={curPeriodKey}
                onChange={(e) => load({ period: e.target.value, shop: data.shop })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {data.meta.periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {thaiDate(p.start)} – {thaiDate(p.end)}
                  </option>
                ))}
              </select>
            )}
            {data && data.meta.shops.length > 1 && (
              <select
                value={data.shop}
                onChange={(e) => load({ shop: e.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {data.meta.shops.map((sh) => (
                  <option key={sh} value={sh}>
                    {sh || "(ไม่ระบุร้าน)"}
                  </option>
                ))}
              </select>
            )}
            <Link href="/marketing/import" className="rounded-lg bg-blue-600 text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700">
              ⬆️ อัปไฟล์
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 space-y-6 max-w-6xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
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
            <div className="text-4xl mb-3">📢</div>
            <h2 className="text-lg font-semibold text-slate-800">ยังไม่มีข้อมูลโฆษณา</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              อัปโหลดไฟล์ &quot;รายงานโฆษณา CPC&quot; จาก Shopee (ศูนย์การตลาด → Shopee Ads → Export) แล้วผลจะสรุปที่นี่
            </p>
            <Link href="/marketing/import" className="inline-flex items-center gap-1.5 mt-4 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">
              ⬆️ อัปไฟล์ Ads
            </Link>
          </div>
        ) : t ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="ค่าโฆษณารวม" value={baht(t.spend)} sub={`CPC เฉลี่ย ${baht(t.cpc)}`} />
              <StatCard label="ยอดขายจากโฆษณา" value={baht(t.sales)} sub={`${nf(t.orders)} ออเดอร์`} />
              <StatCard accent label="ROAS รวม" value={roasFmt(t.roas)} sub="ยอดขาย ÷ ค่าโฆษณา (ยิ่งสูงยิ่งคุ้ม)" />
              <StatCard label="ACOS" value={pct(t.acos)} sub={`ค่าโฆษณาคิดเป็น % ของยอดขาย · CTR ${pct(t.ctr)}`} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">แคมเปญโฆษณา</h2>
                <p className="text-xs text-slate-400 mt-0.5">เรียงตามค่าโฆษณา — ROAS ต่ำ = ควรตรวจ</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">แคมเปญ</th>
                      <th className="text-right px-4 py-2.5 font-medium">ค่าโฆษณา</th>
                      <th className="text-right px-4 py-2.5 font-medium">ยอดขาย</th>
                      <th className="text-right px-4 py-2.5 font-medium">ROAS</th>
                      <th className="text-right px-4 py-2.5 font-medium">ACOS</th>
                      <th className="text-right px-4 py-2.5 font-medium">ออเดอร์</th>
                      <th className="text-right px-4 py-2.5 font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data!.campaigns.map((c) => (
                      <tr key={c.campaign_name} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">
                          <div className="text-slate-700 font-medium truncate max-w-[220px]" title={c.campaign_name}>
                            {c.campaign_name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {c.ad_type || "—"}
                            {c.status ? ` · ${c.status}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{baht(c.spend)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{baht(c.sales)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${roasColor(c.roas)}`}>{roasFmt(c.roas)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{pct(c.acos)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{nf(c.orders)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{pct(c.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              หมายเหตุ: ROAS = ยอดขายจากโฆษณา ÷ ค่าโฆษณา (เช่น 8.69 = จ่ายโฆษณา 1 บาท ได้ยอดขาย 8.69 บาท) · ACOS =
              ค่าโฆษณาเป็น % ของยอดขาย (ยิ่งต่ำยิ่งดี) · ตัวเลขเป็นยอดรวมทั้งช่วงตามไฟล์ที่อัป
            </p>
          </>
        ) : null}
      </div>
    </PlaygroundShell>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl sm:text-3xl font-bold tabular-nums ${accent ? "text-blue-700" : "text-slate-800"}`}>{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-400 leading-snug">{sub}</div> : null}
    </div>
  );
}
