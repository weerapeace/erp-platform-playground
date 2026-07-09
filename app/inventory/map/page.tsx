"use client";

/**
 * ผังคลัง (/inventory/map) — ภาพรวมการไหลของสต๊อกตามโซน + ยอดสด + คลิกเจาะดูรายการ
 * ซัพพลายเออร์ → RAW → (จ่ายงาน) WIP → (รับเข้า QC) FG → ขาย · ของเสีย → SCRAP · โกดังขาย
 */
import { useState, useEffect, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ERPModal } from "@/components/modal";
import { usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import type { ZoneSummary, ZonesResponse } from "@/app/api/inventory/zones/route";
import type { StockBalance, BalancesResponse } from "@/app/api/inventory/balances/route";

const fmtQty = (n: number) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const fmtMoney = (n: number) => "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// สไตล์ต่อประเภทโซน (kind)
const KIND: Record<string, { emoji: string; bg: string; ring: string; text: string }> = {
  raw:     { emoji: "🟠", bg: "bg-amber-50",   ring: "border-amber-300",   text: "text-amber-800" },
  wip:     { emoji: "🔵", bg: "bg-blue-50",    ring: "border-blue-300",    text: "text-blue-800" },
  fg:      { emoji: "🟢", bg: "bg-emerald-50", ring: "border-emerald-300", text: "text-emerald-800" },
  scrap:   { emoji: "🔴", bg: "bg-red-50",     ring: "border-red-300",     text: "text-red-800" },
  sales:   { emoji: "🏬", bg: "bg-indigo-50",  ring: "border-indigo-300",  text: "text-indigo-800" },
  general: { emoji: "📦", bg: "bg-slate-50",   ring: "border-slate-300",   text: "text-slate-700" },
};

export default function InventoryMapPage() {
  const canView = usePermission("stock.view");
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // drill: คลิกโซน → ดูรายการสินค้าในโซนนั้น
  const [drill, setDrill] = useState<ZoneSummary | null>(null);
  const [drillRows, setDrillRows] = useState<StockBalance[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/inventory/zones");
      const json: ZonesResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setZones(json.data);
    } catch (e) { setError(e instanceof Error ? e.message : "โหลดไม่ได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (canView) load(); }, [canView, load]);

  const openDrill = useCallback(async (z: ZoneSummary) => {
    setDrill(z); setDrillRows([]); setDrillLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/balances?warehouse_id=${z.id}`);
      const json: BalancesResponse = await res.json();
      setDrillRows(json.error ? [] : json.data);
    } catch { setDrillRows([]); }
    finally { setDrillLoading(false); }
  }, []);

  const byKind = (kind: string) => zones.find((z) => z.kind === kind) ?? null;
  const salesZones = zones.filter((z) => z.kind === "sales");
  const totalValue = zones.filter((z) => z.kind !== "general").reduce((s, z) => s + z.total_value, 0);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  // การ์ดโซน (คลิกเจาะได้)
  const ZoneCard = ({ z, sub }: { z: ZoneSummary | null; sub?: string }) => {
    const st = KIND[z?.kind ?? "general"] ?? KIND.general;
    const neg = (z?.total_qty ?? 0) < 0;
    return (
      <button
        onClick={() => z && openDrill(z)}
        disabled={!z}
        className={`min-w-[132px] flex-1 text-left rounded-2xl border ${st.ring} ${st.bg} p-3 transition-transform hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60`}
      >
        <div className="flex items-center justify-between">
          <span className="text-lg" aria-hidden>{st.emoji}</span>
          <span className="text-[10px] text-slate-400 font-mono">{z?.code}</span>
        </div>
        <div className={`text-sm font-semibold mt-1 ${st.text} leading-tight`}>{z?.name ?? "—"}</div>
        {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
        <div className="mt-2 flex items-baseline gap-1">
          <span className={`text-xl font-bold tabular-nums ${neg ? "text-red-600" : st.text}`}>{fmtQty(z?.total_qty ?? 0)}</span>
          <span className="text-[10px] text-slate-400">ชิ้น</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-slate-500">{z?.sku_count ?? 0} SKU</span>
          {(z?.total_value ?? 0) > 0 && <span className="text-[11px] text-slate-500 font-mono">{fmtMoney(z!.total_value)}</span>}
        </div>
        {neg && <div className="mt-1 text-[10px] text-red-600">🔔 ติดลบ = ต้องซื้อ/รับของ</div>}
      </button>
    );
  };

  // ลูกศรเชื่อม + จุดวิ่ง (animation)
  const Flow = ({ label, effect, color }: { label: string; effect: string; color: string }) => (
    <div className="flex flex-col items-center justify-center min-w-[68px] px-1 self-center">
      <span className="text-[11px] text-slate-600 whitespace-nowrap">{label}</span>
      <div className="relative w-full h-[3px] my-1.5 rounded bg-slate-200">
        <span className="wh-dot absolute -top-[3.5px] h-[9px] w-[9px] rounded-full" style={{ background: color }} />
      </div>
      <span className="text-[10px] text-slate-400 whitespace-nowrap">{effect}</span>
    </div>
  );

  const Endpoint = ({ icon, label }: { icon: string; label: string }) => (
    <div className="flex flex-col items-center justify-center gap-1 min-w-[76px] self-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-2xl">{icon}</div>
      <span className="text-[11px] text-slate-500">{label}</span>
    </div>
  );

  return (
    <PlaygroundShell>
      <style>{`@keyframes whflow{0%{left:0;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:calc(100% - 9px);opacity:0}} .wh-dot{animation:whflow 2.6s linear infinite}`}</style>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-slate-800">🗺️ ผังคลัง</h1>
          <div className="flex items-center gap-2">
            <a href="/inventory" className="h-9 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">📦 รายการสต๊อก</a>
            <button onClick={load} className="h-9 px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">🔄 รีเฟรช</button>
          </div>
        </div>
        <p className="text-sm text-slate-500 mb-1">ภาพรวมการไหลของสต๊อกตามโซน — คลิกโซนเพื่อดูรายการสินค้าข้างใน</p>
        <p className="text-xs text-slate-400 mb-5">มูลค่ารวมทุกโซน: <span className="font-mono font-semibold text-slate-600">{fmtMoney(totalValue)}</span></p>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {error}</div>}

        {loading ? (
          <div className="py-16 text-center text-slate-400">กำลังโหลดผังคลัง…</div>
        ) : (
          <>
            {/* วงจรผลิตหลัก */}
            <div className="overflow-x-auto pb-2">
              <div className="flex items-stretch gap-1 min-w-[860px]">
                <Endpoint icon="🚚" label="ซัพพลายเออร์" />
                <Flow label="รับของ" effect="+ วัตถุดิบ" color="#1D9E75" />
                <ZoneCard z={byKind("raw")} />
                <Flow label="จ่ายงาน" effect="RAW → WIP" color="#1D9E75" />
                <ZoneCard z={byKind("wip")} />
                <Flow label="รับเข้า QC" effect="WIP → FG" color="#1D9E75" />
                <ZoneCard z={byKind("fg")} sub="= โกดัง QC" />
                <Flow label="ขาย" effect="− ตัดออก" color="#D85A30" />
                <Endpoint icon="🛒" label="ลูกค้า" />
              </div>
            </div>

            {/* โซนรอง: ของเสีย + โกดังขาย */}
            <div className="mt-6">
              <div className="text-xs text-slate-400 mb-2">โซนปลายทางอื่น ๆ</div>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-[150px] flex-1 max-w-[220px]"><ZoneCard z={byKind("scrap")} sub="ของเสียจาก QC" /></div>
                {salesZones.map((z) => (
                  <div key={z.id} className="min-w-[150px] flex-1 max-w-[220px]"><ZoneCard z={z} sub="ส่งออกจาก QC" /></div>
                ))}
                {salesZones.length === 0 && <div className="text-xs text-slate-300 self-center">— ยังไม่มีคลังขาย —</div>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* drill: รายการสินค้าในโซน */}
      <ERPModal open={drill !== null} onClose={() => setDrill(null)} size="lg"
        title={drill ? `${KIND[drill.kind]?.emoji ?? "📦"} ${drill.name}` : ""}
        description={drill ? `${drill.sku_count} SKU · ${fmtQty(drill.total_qty)} ชิ้น` : undefined}>
        {drillLoading ? (
          <div className="py-8 text-center text-slate-400">กำลังโหลด…</div>
        ) : drillRows.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">ไม่มีสินค้าในโซนนี้</div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 border-b border-slate-100">
                  <th className="text-left font-medium px-2 py-1.5">SKU</th>
                  <th className="text-left font-medium px-2 py-1.5">สินค้า</th>
                  <th className="text-right font-medium px-2 py-1.5">คงเหลือ</th>
                  <th className="text-right font-medium px-2 py-1.5">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {drillRows.map((b) => (
                  <tr key={b.product_id} className="border-b border-slate-50">
                    <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">{b.product_sku}</td>
                    <td className="px-2 py-1.5">{b.product_name}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-mono ${b.qty_on_hand < 0 ? "text-red-600" : "text-slate-700"}`}>{fmtQty(b.qty_on_hand)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-mono text-xs text-slate-500">{fmtMoney(b.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ERPModal>
    </PlaygroundShell>
  );
}
