"use client";

// แดชบอร์ดรวมผู้บริหาร (หลายแพลตฟอร์ม) — ยอดขาย/ออเดอร์/สินค้าบนแพลตฟอร์ม/สต๊อก
// ข้อมูลจาก /api/platform-dashboard · ส่วนที่ยังไม่มีข้อมูลจะขึ้นข้อความบอกวิธีเติม
// หน้าตา (2026-11-20 เจ้าของเลือกแบบ C "ดัชนีเรียบหรู" สไตล์ Fashion Editorial):
//   หัวกลางตัว serif · ตัวเลข 4 ช่องคั่นเส้น · ดัชนีช่องทางขายแบบเส้นจุด + แท่งสัดส่วน % · ยอดรายวัน · ขายดีมีรูป
//   กดช่องทางขาย = กรองทั้งหน้า (กดซ้ำ = เลิกกรอง) · กดสถานะ = เปิดศูนย์ออเดอร์ · ปุ่มช่วงเวลาลัด + เทียบช่วงก่อนหน้า
// ของกลาง: DateRangeInput (+ rangePresets) · SimpleBarChart · HoverImage · PlatformIcon · Icon · LoadingState/ErrorState
// สูตรตัวเลขทั้งหมดอยู่ที่ API (ไม่คำนวณใหม่ในหน้านี้)

import { ErrorState, LoadingState } from "@/components/state-views";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { SimpleBarChart } from "@/components/bar-chart";
import { DateRangeInput } from "@/components/date-input/range";
import { rangePresets, TH_MONTHS } from "@/lib/date-range";

// ตัวอักษรแบบนิตยสาร: Playfair Display (ตัวเลข/อังกฤษ) + Noto Serif Thai (ไทย) — โหลดเฉพาะหน้านี้
const FONT_URL = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Noto+Serif+Thai:wght@400;500&display=swap";
const SERIF: CSSProperties = { fontFamily: "'Playfair Display','Noto Serif Thai',Georgia,serif" };
const INK = "#1e293b";      // slate-800 — สีแท่งกราฟ
const ACCENT = "#9f1239";   // rose-800 — สีเน้นจุดเดียวของหน้า

const ST: Record<string, string> = { new: "ใหม่", confirmed: "ยืนยันแล้ว", packed: "แพ็คแล้ว", shipped: "ส่งแล้ว", cancelled: "ยกเลิก" };
// สีแท่งสัดส่วน: อันดับ 1 = สีเน้น ที่เหลือไล่เทา
const SHARE_CLS = ["bg-rose-800", "bg-slate-600", "bg-slate-400", "bg-slate-300", "bg-slate-200", "bg-slate-100"];
const shareCls = (i: number) => SHARE_CLS[Math.min(i, SHARE_CLS.length - 1)];

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type Dash = {
  filters: { platforms: Platform[]; brands: Brand[] };
  kpi: { salesTotal: number; ordersCount: number; ordersPending: number; ordersToShip: number; catalogTotal: number; catalogMatched: number; catalogUnmatched: number };
  byPlatform: { id?: string; code: string; name_th: string; icon_key: string | null; orders: number; sales: number; catalog: number; matched: number }[];
  byStatus: { status: string; count: number }[];
  topProducts: { key: string; name: string; sku: string | null; qty: number; sales: number; image?: string | null }[];
  lowStock: { code: string; name: string; available: number; warehouse: string | null }[];
  byDay?: { unit: "day" | "month"; from: string; to: string; points: { date: string; sales: number; orders: number }[] };
  prev?: { from: string; to: string; salesTotal: number; ordersCount: number } | null;
};

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => n.toLocaleString("th-TH");
const bahtShort = (n: number) => n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `฿${Math.round(n / 1_000)}k` : `฿${Math.round(n)}`;
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;
const shortMonth = (ym: string) => `${TH_MONTHS[+ym.slice(5, 7) - 1]} ${String(+ym.slice(0, 4) + 543).slice(2)}`;

/** สัดส่วนเป็นข้อความ: 0% · <0.1% · 97.6% */
function shareText(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  const v = (part / total) * 100;
  return v < 0.1 ? "<0.1%" : `${v.toFixed(1)}%`;
}

/** ป้ายเทียบช่วงก่อนหน้า (เขียวขึ้น / แดงลง) — ช่วงก่อนเป็น 0 หรือไม่ได้เลือกช่วง = ไม่โชว์ */
function Delta({ cur, prev }: { cur: number; prev: number | undefined }) {
  if (prev === undefined || prev <= 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-rose-600"}`} title="เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน">
      <Icon value={up ? "i:trending-up" : "i:trending-down"} /> {up ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

/** แถวดัชนี: ชื่อ ······· ค่า */
function LeaderRow({ left, right, extra, onClick, active, title }: { left: ReactNode; right: ReactNode; extra?: ReactNode; onClick?: () => void; active?: boolean; title?: string }) {
  const inner = (
    <>
      <span className="min-w-0 truncate inline-flex items-center gap-1.5">{left}</span>
      <span className="flex-1 min-w-[16px] -translate-y-1 border-b border-dotted border-slate-300" />
      <span className="shrink-0 tabular-nums text-slate-900" style={SERIF}>{right}</span>
      {extra}
    </>
  );
  const cls = `w-full flex items-baseline gap-2 py-1.5 text-sm text-left ${active ? "text-rose-800 font-medium" : "text-slate-700"}`;
  return onClick
    ? <button type="button" onClick={onClick} title={title} className={`${cls} -mx-1 rounded px-1 hover:bg-slate-50`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-xl text-slate-900">
      <span className="italic" style={SERIF}>{children}</span>
      {note && <span className="text-xs text-slate-400">{note}</span>}
    </h2>
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
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const q = new URLSearchParams();
      if (platformId) q.set("platform_id", platformId);
      if (brandId) q.set("brand_id", brandId);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const res = await apiFetch(`/api/platform-dashboard?${q}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as Dash;
      setD(j);
      setPlatforms(j.filters?.platforms ?? []);
      setBrands(j.filters?.brands ?? []);
    } catch { setFailed(true); } finally { setLoading(false); }
  }, [platformId, brandId, from, to]);
  useEffect(() => { load(); }, [load]);

  const presets = useMemo(() => rangePresets().filter((p) => p.key !== "prev"), []);
  const activePreset = !from && !to ? "all" : presets.find((p) => p.range.from === from && p.range.to === to)?.key ?? null;
  const hasFilter = !!(from || to || platformId || brandId);

  const kpi = d?.kpi;
  const prev = d?.prev ?? null;
  const matchPct = kpi && kpi.catalogTotal > 0 ? Math.round((kpi.catalogMatched / kpi.catalogTotal) * 100) : 0;
  const ranked = useMemo(() => [...(d?.byPlatform ?? [])].sort((a, b) => b.sales - a.sales || b.orders - a.orders), [d]);
  const sellers = ranked.filter((p) => p.sales > 0);
  const salesTotal = kpi?.salesTotal ?? 0;
  const byDay = d?.byDay;
  const chartData = (byDay?.points ?? []).map((p) => ({
    key: p.date,
    label: byDay?.unit === "month" ? shortMonth(p.date) : shortDate(p.date),
    value: Math.round(p.sales),
    hint: `${num(p.orders)} ออเดอร์`,
  }));
  const ordersHref = brandId ? `/master/platform-orders?brand=${encodeURIComponent(brandId)}` : "/master/platform-orders";
  const togglePlatform = (id: string) => setPlatformId((cur) => (cur === id ? "" : id));
  const chipCls = (on: boolean) => `h-7 rounded-full border px-3 text-xs transition-colors ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:border-slate-500"}`;
  const selectCls = "h-9 min-w-0 max-w-[46%] sm:max-w-none border-0 border-b border-slate-900 bg-transparent px-1 text-sm text-slate-700 focus:outline-none focus:ring-0";

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6">
      <link rel="stylesheet" href={FONT_URL} precedence="default" />
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 sm:px-10 sm:py-9">
        {/* หัวหน้า */}
        <header className="text-center">
          <div className="text-[11px] tracking-[0.2em] text-slate-400">ภาพรวมทุกช่องทาง</div>
          <h1 className="mt-1 text-3xl leading-tight text-slate-900 sm:text-5xl" style={SERIF}>แดชบอร์ดรวม</h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">ยอดขาย ออเดอร์ สินค้าบนแพลตฟอร์ม และสต๊อก — รวมทุกช่องทางไว้ที่เดียว</p>

          {/* ตัวกรอง */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} aria-label="แพลตฟอร์ม" className={selectCls}>
              <option value="">ทุกแพลตฟอร์ม</option>
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
            </select>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="แบรนด์/ร้าน" className={selectCls}>
              <option value="">ทุกแบรนด์/ร้าน</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <DateRangeInput value={{ from, to }} onChange={(r) => { setFrom(r.from); setTo(r.to); }} placeholder="ช่วงวันที่ทั้งหมด" className="w-full sm:w-auto" />
          </div>
          {/* ปุ่มช่วงเวลาลัด */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {presets.map((p) => (
              <button key={p.key} type="button" onClick={() => { setFrom(p.range.from); setTo(p.range.to); }} className={chipCls(activePreset === p.key)}>{p.label}</button>
            ))}
            <button type="button" onClick={() => { setFrom(""); setTo(""); }} className={chipCls(activePreset === "all")}>ทั้งหมด</button>
            {hasFilter && (
              <button type="button" onClick={() => { setFrom(""); setTo(""); setPlatformId(""); setBrandId(""); }}
                className="inline-flex h-7 items-center gap-1 px-2 text-xs text-slate-400 hover:text-slate-700">
                <Icon value="i:x" /> ล้างตัวกรอง
              </button>
            )}
          </div>
        </header>

        <div className="mt-6 border-t border-slate-900" />
        <div className="mb-6 mt-[3px] border-t border-slate-900" />

        {loading && !d ? <LoadingState /> : failed && !d ? <ErrorState title="โหลดข้อมูลไม่สำเร็จ" onRetry={load} /> : !kpi || !d ? null : (
          <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
            {failed && <p className="mb-4 text-center text-xs text-rose-600">โหลดข้อมูลล่าสุดไม่สำเร็จ — ตัวเลขด้านล่างเป็นของรอบก่อน <button type="button" onClick={load} className="underline">ลองใหม่</button></p>}

            {/* ตัวเลขหลัก 4 ช่อง */}
            <div className="grid grid-cols-2 gap-y-6 text-center lg:grid-cols-4">
              <div className="px-2">
                <div className="text-[11px] tracking-[0.15em] text-slate-400">ยอดขายรวม</div>
                <div className="mt-1 break-all text-2xl tabular-nums text-slate-900 sm:text-4xl" style={SERIF}>{baht(kpi.salesTotal)}</div>
                <div className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] text-slate-400">ไม่รวมออเดอร์ที่ยกเลิก <Delta cur={kpi.salesTotal} prev={prev?.salesTotal} /></div>
              </div>
              <div className="border-l border-slate-200 px-2">
                <div className="text-[11px] tracking-[0.15em] text-slate-400">ออเดอร์ทั้งหมด</div>
                <div className="mt-1 text-2xl tabular-nums text-slate-900 sm:text-4xl" style={SERIF}>{num(kpi.ordersCount)}</div>
                <div className="flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] text-slate-400">รอแพ็ค/ยืนยัน {kpi.ordersPending} · รอส่ง {kpi.ordersToShip} <Delta cur={kpi.ordersCount} prev={prev?.ordersCount} /></div>
              </div>
              <div className="border-t border-slate-200 px-2 pt-5 lg:border-l lg:border-t-0 lg:pt-0">
                <div className="text-[11px] tracking-[0.15em] text-slate-400">สินค้าบนแพลตฟอร์ม</div>
                <div className="mt-1 text-2xl tabular-nums text-slate-900 sm:text-4xl" style={SERIF}>{num(kpi.catalogTotal)}</div>
                <div className="text-[11px] text-slate-400">จับคู่ ERP แล้ว {num(kpi.catalogMatched)} ({matchPct}%)</div>
              </div>
              <Link href="/master/platform-catalog" className="group border-l border-t border-slate-200 px-2 pt-5 lg:border-t-0 lg:pt-0">
                <div className="text-[11px] tracking-[0.15em] text-slate-400" style={kpi.catalogUnmatched > 0 ? { color: ACCENT } : undefined}>ยังไม่จับคู่ ERP</div>
                <div className="mt-1 text-2xl tabular-nums sm:text-4xl" style={{ ...SERIF, color: kpi.catalogUnmatched > 0 ? ACCENT : "#059669" }}>{num(kpi.catalogUnmatched)}</div>
                <div className="inline-flex items-center gap-1 text-[11px] text-slate-400 group-hover:text-slate-700">
                  {kpi.catalogUnmatched > 0 ? "ไปไล่จับคู่ให้ครบ" : "ครบแล้ว"} <Icon value="i:external-link" />
                </div>
              </Link>
            </div>
            {prev && <p className="mt-4 text-center text-[11px] text-slate-400">ตัวเลขสีเขียว/แดง = เทียบกับช่วงก่อนหน้า {shortDate(prev.from)} – {shortDate(prev.to)} (ยาวเท่ากัน)</p>}

            <div className="my-7 border-t border-slate-200" />

            {/* ดัชนีช่องทางขาย + สถานะออเดอร์ */}
            <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
              <section>
                <SectionTitle note="กดชื่อช่องทาง = ดูเฉพาะช่องทางนั้น">ดัชนีช่องทางขาย</SectionTitle>
                {ranked.length === 0 ? <p className="py-3 text-sm text-slate-400">ยังไม่มีข้อมูล</p> : (
                  <>
                    {sellers.length > 0 && (
                      <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-sm bg-slate-100" role="img" aria-label="สัดส่วนยอดขายแต่ละช่องทาง">
                        {sellers.map((p, i) => (
                          <div key={p.code} className={shareCls(i)} title={`${p.name_th} ${shareText(p.sales, salesTotal)}`}
                            style={{ width: `${Math.max((p.sales / Math.max(1, salesTotal)) * 100, 0.8)}%` }} />
                        ))}
                      </div>
                    )}
                    {ranked.map((p, i) => {
                      const si = sellers.indexOf(p);
                      const pid = p.id;
                      return (
                        <div key={p.code}>
                          <LeaderRow
                            onClick={pid ? () => togglePlatform(pid) : undefined}
                            active={!!pid && pid === platformId}
                            title={pid && pid === platformId ? "กดอีกครั้ง = ดูทุกแพลตฟอร์ม" : `ดูเฉพาะ ${p.name_th}`}
                            left={<>
                              <span className="w-5 text-xs tabular-nums text-slate-400" style={SERIF}>{String(i + 1).padStart(2, "0")}</span>
                              <span className={`h-2 w-2 shrink-0 ${si >= 0 ? shareCls(si) : "border border-slate-300"}`} />
                              <PlatformIcon code={p.code} iconKey={p.icon_key} size={14} />
                              <span className="truncate">{p.name_th}</span>
                            </>}
                            right={baht(p.sales)}
                            extra={<span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{shareText(p.sales, salesTotal)}</span>}
                          />
                          <div className="-mt-1 mb-1 pl-7 text-[11px] text-slate-400">{num(p.orders)} ออเดอร์ · {num(p.catalog)} สินค้า · จับคู่แล้ว {num(p.matched)}</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </section>

              <section>
                <SectionTitle note="กด = เปิดศูนย์ออเดอร์">สถานะออเดอร์</SectionTitle>
                {kpi.ordersCount === 0 ? (
                  <p className="py-2 text-sm text-slate-400">ยังไม่มีออเดอร์ — รับออเดอร์ได้ที่ <Link href="/master/platform-orders" className="text-rose-800 underline">ศูนย์ออเดอร์</Link></p>
                ) : (
                  <div>
                    {d.byStatus.map((s) => (
                      <Link key={s.status} href={ordersHref} className="-mx-1 block rounded px-1 hover:bg-slate-50">
                        <LeaderRow left={ST[s.status] ?? s.status} right={num(s.count)} />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="my-7 border-t border-slate-200" />

            {/* ยอดขายรายวัน */}
            <section>
              <SectionTitle note={byDay ? `${shortDate(byDay.from)} – ${shortDate(byDay.to)}${!from && !to ? " · 30 วันล่าสุด" : ""}` : undefined}>
                ยอดขาย{byDay?.unit === "month" ? "รายเดือน" : "รายวัน"}
              </SectionTitle>
              <SimpleBarChart data={chartData} format={bahtShort} height={190} barColor={INK} barHoverColor={ACCENT}
                emptyText="ยังไม่มียอดขายในช่วงนี้" ariaLabel="กราฟยอดขายตามวัน" />
            </section>

            <div className="my-7 border-t border-slate-200" />

            {/* ขายดี + ใกล้หมด */}
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
              <section>
                <SectionTitle note="ตามจำนวนชิ้น">ขายดี</SectionTitle>
                {d.topProducts.length === 0 ? (
                  <p className="py-2 text-sm text-slate-400">ยังไม่มีข้อมูลการขาย — จะแสดงเมื่อมีออเดอร์เข้ามา</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {d.topProducts.map((p, i) => (
                      <div key={p.key} className="flex items-center gap-3 py-2">
                        <span className={`w-6 shrink-0 text-lg tabular-nums ${i === 0 ? "" : "text-slate-400"}`} style={{ ...SERIF, color: i === 0 ? ACCENT : undefined }}>{i + 1}</span>
                        {p.image
                          ? <HoverImage url={p.image} size={40} previewSize={280} alt={p.name} rounded="rounded-sm" fallback="" />
                          : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-slate-50 text-slate-300" title="ยังไม่จับคู่ ERP หรือยังไม่มีรูป"><Icon value="i:photo" /></span>}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-slate-800" title={p.name}>{p.name}</div>
                          {p.sku && <div className="truncate font-mono text-[11px] text-slate-400">{p.sku}</div>}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-base tabular-nums text-slate-900" style={SERIF}>{num(p.qty)} <span className="text-[11px] text-slate-400" style={{ fontFamily: "inherit" }}>ชิ้น</span></div>
                          <div className="text-[11px] tabular-nums text-slate-400">{baht(p.sales)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionTitle note="พร้อมขาย ≤ 5">สต๊อกใกล้หมด</SectionTitle>
                {d.lowStock.length === 0 ? (
                  <p className="py-2 text-sm text-slate-400">ไม่มีสินค้าสต๊อกต่ำ (หรือระบบสต๊อกยังไม่มีข้อมูล)</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {d.lowStock.map((s, i) => (
                      <div key={`${s.code}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                        <span className="w-24 shrink-0 truncate font-mono text-[11px] text-slate-400">{s.code}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-700" title={s.name}>{s.name}</span>
                        <span className={`w-12 shrink-0 text-right text-base tabular-nums ${s.available <= 0 ? "text-rose-700" : "text-amber-600"}`} style={SERIF}>{s.available}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* เตือน: ยังไม่จับคู่ */}
            {kpi.catalogUnmatched > 0 && (
              <div className="mt-8 flex items-start gap-2 border-t border-slate-900 pt-4 text-sm text-slate-600">
                <Icon value="i:alert-triangle" className="mt-0.5 text-amber-500" />
                <span>
                  มีสินค้าบนแพลตฟอร์ม <b className="font-medium text-slate-900">{num(kpi.catalogUnmatched)}</b> รายการที่ยังไม่จับคู่กับสินค้าใน ERP —
                  ไปไล่จับคู่/นำเข้าเพิ่มได้ที่ <Link href="/master/platform-catalog" className="text-rose-800 underline">สินค้าบนแพลตฟอร์ม</Link>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
