"use client";

// แดชบอร์ดรวมผู้บริหาร (หลายแพลตฟอร์ม) — ยอดขาย/ออเดอร์/สินค้าบนแพลตฟอร์ม/สต๊อก
// ข้อมูลจาก /api/platform-dashboard · ส่วนที่ยังไม่มีข้อมูลจะขึ้นข้อความบอกวิธีเติม

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", youtube: "▶️", pinterest: "📌", x: "✖️" };
const ST: Record<string, { label: string; cls: string }> = {
  new: { label: "ใหม่", cls: "bg-blue-50 text-blue-700" },
  confirmed: { label: "ยืนยันแล้ว", cls: "bg-violet-50 text-violet-700" },
  packed: { label: "แพ็คแล้ว", cls: "bg-amber-50 text-amber-700" },
  shipped: { label: "ส่งแล้ว", cls: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-500" },
};

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type Dash = {
  filters: { platforms: Platform[]; brands: Brand[] };
  kpi: { salesTotal: number; ordersCount: number; ordersPending: number; ordersToShip: number; catalogTotal: number; catalogMatched: number; catalogUnmatched: number };
  byPlatform: { code: string; name_th: string; icon_key: string | null; orders: number; sales: number; catalog: number; matched: number }[];
  byStatus: { status: string; count: number }[];
  topProducts: { key: string; name: string; sku: string | null; qty: number; sales: number }[];
  lowStock: { code: string; name: string; available: number; warehouse: string | null }[];
};

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");

function Card({ label, value, sub, tone = "slate" }: { label: string; value: string; sub?: string; tone?: string }) {
  const toneCls: Record<string, string> = { slate: "text-slate-900", emerald: "text-emerald-600", amber: "text-amber-600", violet: "text-violet-600", rose: "text-rose-600" };
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls[tone] ?? toneCls.slate}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (platformId) q.set("platform_id", platformId);
      if (brandId) q.set("brand_id", brandId);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const j = (await apiFetch(`/api/platform-dashboard?${q}`).then((r) => r.json())) as Dash;
      setD(j);
      setPlatforms(j.filters?.platforms ?? []);
      setBrands(j.filters?.brands ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [platformId, brandId, from, to]);
  useEffect(() => { load(); }, [load]);

  const kpi = d?.kpi;
  const matchPct = kpi && kpi.catalogTotal > 0 ? Math.round((kpi.catalogMatched / kpi.catalogTotal) * 100) : 0;
  const maxSales = Math.max(1, ...(d?.byPlatform ?? []).map((p) => p.sales));
  const maxTopQty = Math.max(1, ...(d?.topProducts ?? []).map((p) => p.qty));

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">📊 แดชบอร์ดรวม (หลายแพลตฟอร์ม)</h1>
      <p className="text-sm text-slate-500 mb-4">ภาพรวมยอดขาย ออเดอร์ สินค้าบนแพลตฟอร์ม และสต๊อก — รวมทุกช่องทางไว้ที่เดียว</p>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          <option value="">ทุกแพลตฟอร์ม</option>
          {platforms.map((p) => <option key={p.id} value={p.id}>{(p.icon_key || PLATFORM_ICON[p.code] || "🏬") + " " + p.name_th}</option>)}
        </select>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white">
          <option value="">ทุกแบรนด์/ร้าน</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="text-sm text-slate-400">ช่วง</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white" />
        <span className="text-slate-300">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 border border-slate-200 rounded-md px-2 text-sm bg-white" />
        {(from || to || platformId || brandId) && <button onClick={() => { setFrom(""); setTo(""); setPlatformId(""); setBrandId(""); }} className="h-9 px-2 text-xs text-slate-400 hover:text-slate-600 underline">ล้างตัวกรอง</button>}
      </div>

      {loading ? <p className="text-slate-400 text-sm py-10 text-center">กำลังโหลด...</p> : !kpi ? <p className="text-slate-400 text-sm py-10 text-center">โหลดข้อมูลไม่สำเร็จ</p> : (
        <div className="space-y-5">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="ยอดขายรวม" value={baht(kpi.salesTotal)} sub="ไม่รวมออเดอร์ที่ยกเลิก" tone="emerald" />
            <Card label="ออเดอร์ทั้งหมด" value={kpi.ordersCount.toLocaleString("th-TH")} sub={`รอแพ็ค/ยืนยัน ${kpi.ordersPending} · รอส่ง ${kpi.ordersToShip}`} tone="violet" />
            <Card label="สินค้าบนแพลตฟอร์ม" value={kpi.catalogTotal.toLocaleString("th-TH")} sub={`จับคู่ ERP แล้ว ${kpi.catalogMatched} (${matchPct}%)`} />
            <Card label="ยังไม่จับคู่ ERP" value={kpi.catalogUnmatched.toLocaleString("th-TH")} sub={kpi.catalogUnmatched > 0 ? "ควรไล่จับคู่ให้ครบ" : "ครบแล้ว 🎉"} tone={kpi.catalogUnmatched > 0 ? "amber" : "emerald"} />
          </div>

          {/* ยอดขายแยกแพลตฟอร์ม */}
          <section className="border border-slate-200 rounded-xl p-4 bg-white">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">ยอดขาย & สินค้า แยกตามแพลตฟอร์ม</h2>
            {d.byPlatform.length === 0 ? <p className="text-sm text-slate-400 py-3">ยังไม่มีข้อมูล</p> : (
              <div className="space-y-2.5">
                {d.byPlatform.map((p) => (
                  <div key={p.code} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm text-slate-600 truncate">{(p.icon_key || PLATFORM_ICON[p.code] || "🏬")} {p.name_th}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div className="h-full bg-emerald-400/80 rounded-full" style={{ width: `${Math.max(2, (p.sales / maxSales) * 100)}%` }} />
                    </div>
                    <span className="w-24 text-right text-sm text-slate-700">{baht(p.sales)}</span>
                    <span className="w-32 text-right text-[11px] text-slate-400">{p.orders} ออเดอร์ · {p.catalog} สินค้า</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ออเดอร์ตามสถานะ */}
          <section className="border border-slate-200 rounded-xl p-4 bg-white">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">ออเดอร์ตามสถานะ</h2>
            {kpi.ordersCount === 0 ? (
              <p className="text-sm text-slate-400 py-2">ยังไม่มีออเดอร์ — อัปไฟล์ออเดอร์ได้ที่หน้า <Link href="/master/platform-orders" className="text-violet-600 underline">📥 รับออเดอร์จากแพลตฟอร์ม</Link></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {d.byStatus.map((s) => (
                  <div key={s.status} className={`px-3 py-2 rounded-lg ${ST[s.status]?.cls ?? "bg-slate-50 text-slate-600"}`}>
                    <div className="text-xs">{ST[s.status]?.label ?? s.status}</div>
                    <div className="text-lg font-semibold">{s.count}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* สินค้าขายดี + สต๊อกใกล้หมด */}
          <div className="grid md:grid-cols-2 gap-5">
            <section className="border border-slate-200 rounded-xl p-4 bg-white">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">สินค้าขายดี (ตามจำนวน)</h2>
              {d.topProducts.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">ยังไม่มีข้อมูลการขาย — จะแสดงเมื่อมีออเดอร์เข้ามา</p>
              ) : (
                <div className="space-y-2">
                  {d.topProducts.map((p) => (
                    <div key={p.key} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate" title={p.name}>{p.name}</span>
                      <div className="w-24 bg-slate-100 rounded-full h-4 overflow-hidden"><div className="h-full bg-violet-400/80" style={{ width: `${(p.qty / maxTopQty) * 100}%` }} /></div>
                      <span className="w-12 text-right text-sm text-slate-700">{p.qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="border border-slate-200 rounded-xl p-4 bg-white">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">สต๊อกใกล้หมด (พร้อมขาย ≤ 5)</h2>
              {d.lowStock.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">ไม่มีสินค้าสต๊อกต่ำ (หรือระบบสต๊อกยังไม่มีข้อมูล)</p>
              ) : (
                <div className="space-y-1.5">
                  {d.lowStock.map((s, i) => (
                    <div key={`${s.code}-${i}`} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-slate-500 w-24 shrink-0 truncate">{s.code}</span>
                      <span className="flex-1 min-w-0 text-slate-700 truncate" title={s.name}>{s.name}</span>
                      <span className={`w-14 text-right font-medium ${s.available <= 0 ? "text-rose-600" : "text-amber-600"}`}>{s.available}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* health: ยังไม่จับคู่ */}
          {kpi.catalogUnmatched > 0 && (
            <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-4 text-sm text-slate-700">
              มีสินค้าบนแพลตฟอร์ม <b>{kpi.catalogUnmatched}</b> รายการที่ยังไม่จับคู่กับสินค้าใน ERP —
              ไปไล่จับคู่/นำเข้าเพิ่มได้ที่ <Link href="/master/platform-catalog" className="text-violet-600 underline">🛒 สินค้าบนแพลตฟอร์ม</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
