"use client";

/**
 * ภาพรวมการตลาด (/marketing/dashboard · หน้าแรกของแอปการตลาด) — ข้อมูลจาก /api/marketing/overview
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-23 (widget รอบ 1 แบบ A + แจ้งเตือน · เป้าแยกช่องทาง · กดเจาะลึก · ตัวกรองแบรนด์ · ส่งออก Excel):
 *   แท็บ ภาพรวม · ยอดขาย & ช่องทาง · สินค้า (80/20 + ดาวรุ่ง/ตก) · ยกเลิก · แคมเปญวันพิเศษ · ไฟล์ Shopee (หน้าเดิม ไม่แก้)
 *   ยอดขาย = มูลค่าสินค้า ชุดเดียวกับแดชบอร์ดช่องทางขาย (ตรงกับ Shopee) · เป้าเก็บที่เดียวกัน (ตั้ง/แก้/ลบ + ย้อนกลับได้ + audit)
 *   กดเจาะลึก: การ์ด → แท็บ · แถวช่องทาง → กรองช่องทางนั้น · แถวสินค้า → ออเดอร์ที่มีสินค้านั้น → หน้าออเดอร์
 *   แท็บอยู่ใน URL (?tab=) — ลิงก์จากกระดิ่งแจ้งเตือนเปิดแท็บที่เกี่ยวข้องได้
 * ของกลาง: PlaygroundShell · PeriodPicker · CountUp · SimpleBarChart · DataTable (ค้นหา/เรียง/มุมมอง/ส่งออก Excel/ลิ้นชัก)
 *   · ScrollTabs · ERPModal · MoneyInput · HoverImage · PlatformIcon · Icon · LoadingState/ErrorState/EmptyState · useToast
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { HoverImage } from "@/components/hover-image";
import { CountUp } from "@/components/count-up";
import { SimpleBarChart } from "@/components/bar-chart";
import { ScrollTabs } from "@/components/scroll-tabs";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { PeriodPicker, type Period } from "@/components/date-input/period-picker";
import { TH_MONTHS } from "@/lib/date-range";
import { WEEKDAYS_TH, type MarketingAlert, type Pace, type CancelRow, type CampaignResult } from "@/lib/marketing-overview-calc";

const ShopeeFileView = dynamic(() => import("./shopee-file-view"), { ssr: false, loading: () => <LoadingState label="กำลังโหลดข้อมูลไฟล์ Shopee…" /> });

// ── รูปแบบตัวเลข ──
const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 10_000 ? `฿${(n / 1_000).toFixed(1)}K` : baht(n));
const pct = (n: number | null | undefined, d = 0) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const signPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`);
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;
const shortMonth = (ym: string) => `${TH_MONTHS[+ym.slice(5, 7) - 1]} ${String(+ym.slice(0, 4) + 543).slice(2)}`;
const changeCls = (n: number | null | undefined) => (n == null ? "text-slate-400" : n >= 0 ? "text-emerald-600" : "text-rose-600");

const pad = (n: number) => String(n).padStart(2, "0");
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const thisMonth = (): Period => { const now = new Date(); return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: localYmd(now) }; };

type Tab = "overview" | "sales" | "products" | "cancel" | "campaign" | "shopee_file";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "ภาพรวม", icon: "chart" },
  { key: "sales", label: "ยอดขาย & ช่องทาง", icon: "store" },
  { key: "products", label: "สินค้า", icon: "package" },
  { key: "cancel", label: "ยกเลิก", icon: "cancel" },
  { key: "campaign", label: "แคมเปญวันพิเศษ", icon: "campaign" },
  { key: "shopee_file", label: "ไฟล์ Shopee", icon: "import" },
];
const isTab = (s: string | null): s is Tab => !!s && TABS.some((t) => t.key === s);

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type PlatformRow = { id: string; code: string; name_th: string; icon_key: string | null; sales: number; paid: number; orders: number; prevSales: number; change: number | null; share: number; cancelled: number; allOrders: number; noValue: number; target: number | null };
type ProductRow = { key: string; matched: boolean; code: string; name: string; image: string | null; sales: number; qty: number; orders: number; prevSales: number; change: number | null; abc: "A" | "B" | "C"; share: number; trend: "rising" | "falling" | "new" | "steady" | "gone"; trendChange: number | null; last14: number; prev14: number; platforms: string };
type Period3 = { from: string; to: string; sales: number; orders: number };
type Overview = {
  filters: { platforms: Platform[]; brands: { id: string; name: string }[] };
  range: { from: string; to: string; days: number };
  today: string;
  kpi: { sales: number; paid: number; orders: number; aov: number; allOrders: number; cancelled: number; cancelRate: number; noValueOrders: number };
  compare: { prev: Period3; lastMonth: Period3; lastYear: Period3 };
  pace: Pace & { ym: string; scope: "platform" | "all" };
  targets: { ym: string; total: number | null; byPlatform: Record<string, number | null> };
  monthDaily: { date: string; sales: number }[];
  byPlatform: PlatformRow[];
  daily: { unit: "day" | "month"; points: { date: string; sales: number; orders: number; byPlatform: Record<string, number> }[] };
  heatmap: { grid: number[][]; top: { day: number; hour: number; value: number }[] };
  products: ProductRow[];
  abcSummary: { abc: "A" | "B" | "C"; count: number; sales: number }[];
  trendWindow: { curFrom: string; to: string; prevFrom: string; prevTo: string };
  cancel: { total: number; rate: number; storeFault7d: number; groups: CancelRow[]; byPlatform: { code: string; name_th: string; cancelled: number; allOrders: number; rate: number }[] };
  campaign: { days: { date: string; label: string; sales: number; orders: number }[]; selected: (CampaignResult & { label: string }) | null };
  alerts: MarketingAlert[];
  notes: string[];
  error: string | null;
};

const TREND_META: Record<ProductRow["trend"], { label: string; cls: string; icon?: string }> = {
  rising: { label: "ดาวรุ่ง", cls: "bg-emerald-50 text-emerald-700", icon: "trend-up" },
  new: { label: "ขายใหม่", cls: "bg-sky-50 text-sky-700", icon: "new" },
  falling: { label: "กำลังตก", cls: "bg-rose-50 text-rose-700", icon: "trend-down" },
  gone: { label: "หยุดขาย", cls: "bg-slate-100 text-slate-600", icon: "trend-down" },
  steady: { label: "ทรงตัว", cls: "bg-slate-50 text-slate-500" },
};
const ABC_CLS: Record<string, string> = { A: "bg-orange-100 text-orange-800", B: "bg-amber-50 text-amber-700", C: "bg-slate-100 text-slate-500" };
const ALERT_CLS: Record<string, string> = { danger: "text-rose-600", warning: "text-amber-600", info: "text-sky-600" };

// ═════════════════════════════════════════════════════════════════

export default function MarketingOverviewPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canTarget = can("products.platforms.edit");
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>(thisMonth);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [d, setD] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);

  // แท็บจาก URL (?tab=) — ลิงก์จากกระดิ่งแจ้งเตือน
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tab"); if (isTab(t)) setTab(t); }, []);
  const go = useCallback((t: Tab) => {
    setTab(t);
    try { const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u.toString()); } catch { /* ไม่เป็นไร */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const q = new URLSearchParams({ from: period.from, to: period.to });
    if (platformId) q.set("platform_id", platformId);
    if (brandId) q.set("brand_id", brandId);
    if (eventDate) q.set("event", eventDate);
    try {
      const res = await apiFetch(`/api/marketing/overview?${q}`);
      const j = (await res.json()) as Overview;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ");
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [period, platformId, brandId, eventDate]);
  useEffect(() => { if (tab !== "shopee_file") void load(); }, [load, tab]);

  const pfName = d?.filters.platforms.find((p) => p.id === platformId)?.name_th;

  return (
    <PlaygroundShell>
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        {/* หัวหน้า */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">ภาพรวมการตลาด</h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">ยอดขายจริงจากทุกช่องทาง (มูลค่าสินค้า — ตรงกับที่ Shopee แสดง) · เทียบเป้า · สินค้า · ยกเลิก · วันพิเศษ</p>
          </div>
          {tab !== "shopee_file" && (
            <div className="flex flex-wrap items-center gap-2">
              <PeriodPicker value={period} onChange={setPeriod} />
              <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" aria-label="ช่องทาง">
                <option value="">ทุกช่องทาง</option>
                {d?.filters.platforms.map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
              </select>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" aria-label="แบรนด์">
                <option value="">ทุกแบรนด์</option>
                {d?.filters.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {canTarget && (
                <button type="button" onClick={() => setTargetOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
                  <Icon name="target" /> ตั้งเป้า
                </button>
              )}
              <button type="button" onClick={() => void load()} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="โหลดใหม่" title="โหลดใหม่">
                <Icon name="refresh" />
              </button>
            </div>
          )}
        </div>

        <ScrollTabs activeKey={tab} className="mt-4 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t.key} type="button" data-tab-key={t.key} onClick={() => go(t.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-orange-500 font-medium text-orange-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </ScrollTabs>

        <div className="mt-4">
          {tab === "shopee_file" ? <ShopeeFileView /> : loading && !d ? <LoadingState label="กำลังรวมยอดจากทุกช่องทาง…" /> : err && !d ? <ErrorState title="โหลดข้อมูลการตลาดไม่สำเร็จ" hint={err} onRetry={() => void load()} /> : d ? (
            <div className={loading ? "opacity-60 transition-opacity" : ""}>
              {(platformId || brandId) && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  กำลังดู: {pfName ?? "ทุกช่องทาง"} · {d.filters.brands.find((b) => b.id === brandId)?.name ?? "ทุกแบรนด์"}
                  <button type="button" onClick={() => { setPlatformId(""); setBrandId(""); }} className="rounded-full border border-slate-200 px-2 py-0.5 hover:bg-slate-50">ล้างตัวกรอง</button>
                </div>
              )}
              {tab === "overview" && <OverviewTab d={d} go={go} canTarget={canTarget} openTarget={() => setTargetOpen(true)} />}
              {tab === "sales" && <SalesTab d={d} pickPlatform={(id) => { setPlatformId(id); go("products"); }} />}
              {tab === "products" && <ProductsTab d={d} period={period} platformId={platformId} brandId={brandId} />}
              {tab === "cancel" && <CancelTab d={d} />}
              {tab === "campaign" && <CampaignTab d={d} pick={setEventDate} />}
              {d.notes.length > 0 && (
                <ul className="mt-6 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {d.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {targetOpen && d && <TargetModal d={d} brandId={brandId} onClose={() => setTargetOpen(false)} onSaved={() => void load()} toast={toast} />}
    </PlaygroundShell>
  );
}

// ═════════════════════════ แท็บ ภาพรวม ═════════════════════════

function Kpi({ label, children, sub, subCls = "text-slate-500", onClick }: { label: string; children: React.ReactNode; sub?: React.ReactNode; subCls?: string; onClick?: () => void }) {
  const Cmp = onClick ? "button" : "div";
  return (
    <Cmp type={onClick ? "button" : undefined} onClick={onClick} className={`rounded-xl border border-slate-200 bg-white p-3 text-left sm:p-4 ${onClick ? "transition hover:border-orange-300 hover:shadow-sm" : ""}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{children}</div>
      {sub != null && <div className={`mt-0.5 text-xs ${subCls}`}>{sub}</div>}
    </Cmp>
  );
}

function OverviewTab({ d, go, canTarget, openTarget }: { d: Overview; go: (t: Tab) => void; canTarget: boolean; openTarget: () => void }) {
  const p = d.pace;
  const chg = d.compare.lastMonth.sales > 0 ? (d.kpi.sales - d.compare.lastMonth.sales) / d.compare.lastMonth.sales : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`ยอดขาย ${shortDate(d.range.from)}–${shortDate(d.range.to)}`} onClick={() => go("sales")}
          sub={<>{signPct(chg)} เทียบช่วงเดียวกันเดือนก่อน</>} subCls={changeCls(chg)}>
          <CountUp value={d.kpi.sales} format={bahtShort} />
        </Kpi>
        <Kpi label={p.target != null ? `เป้า ${shortMonth(p.ym)} ${bahtShort(p.target)}${p.scope === "platform" ? " (ช่องทางนี้)" : ""}` : `เป้า ${shortMonth(p.ym)}`} onClick={!p.target && canTarget ? openTarget : undefined}
          sub={p.target != null ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.min(100, (p.pct ?? 0) * 100)}%` }} /></div> : canTarget ? "กดเพื่อตั้งเป้า" : "ยังไม่ได้ตั้งเป้า"}>
          {p.target != null ? pct(p.pct) : "—"}
        </Kpi>
        <Kpi label="ต้องขายต่อวันถึงเป้า" sub={`ตอนนี้เฉลี่ย ${bahtShort(p.avgPerDay)}/วัน · เหลือ ${p.daysLeft} วัน`} subCls={p.needPerDay != null && p.needPerDay > p.avgPerDay ? "text-amber-600" : "text-slate-500"}>
          {p.needPerDay != null ? bahtShort(p.needPerDay) : "—"}
        </Kpi>
        <Kpi label="ออเดอร์ · เฉลี่ยต่อใบ" onClick={() => go("cancel")} sub={`ยกเลิก ${pct(d.kpi.cancelRate, 1)} (${num(d.kpi.cancelled)} ใบ)`}>
          <CountUp value={d.kpi.orders} format={num} /> <span className="text-sm font-normal text-slate-500">· {bahtShort(d.kpi.aov)}</span>
        </Kpi>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-800">ยอดสะสมเดือนนี้ เทียบเป้า</h2>
            <span className="text-xs text-slate-500">คาดการณ์สิ้นเดือน {bahtShort(p.forecast)}{p.target ? ` (${pct(p.forecast / p.target)} ของเป้า)` : ""}</span>
          </div>
          <PaceChart points={d.monthDaily} target={p.target} daysInMonth={p.daysInMonth} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-medium text-slate-800">ต้องจัดการ</h2>
          {d.alerts.length === 0 ? <p className="mt-3 text-sm text-emerald-600">ไม่มีเรื่องต้องจัดการตอนนี้</p> : (
            <ul className="mt-2 space-y-2">
              {d.alerts.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => go((isTab(a.tab) ? a.tab : "overview"))} className="w-full rounded-lg p-2 text-left hover:bg-slate-50">
                    <div className={`flex items-center gap-1.5 text-sm font-medium ${ALERT_CLS[a.level]}`}><Icon name={a.level === "info" ? "info" : "warning"} /> {a.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{a.body}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ComparePanel d={d} />
    </div>
  );
}

/** ยอดสะสมรายวันเทียบเส้นเป้า (SVG เล็ก ๆ) */
function PaceChart({ points, target, daysInMonth }: { points: { date: string; sales: number }[]; target: number | null; daysInMonth: number }) {
  const cum: number[] = []; points.reduce((s, x) => { const v = s + x.sales; cum.push(v); return v; }, 0);
  const W = 600, H = 160, L = 4, R = 4, T = 8, B = 18;
  const top = Math.max(target ?? 0, cum[cum.length - 1] ?? 0, 1) * 1.05;
  const x = (i: number) => L + ((W - L - R) * i) / Math.max(1, daysInMonth - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  if (!points.length) return <p className="py-8 text-center text-sm text-slate-400">ยังไม่มียอดเดือนนี้</p>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-40 w-full" role="img" aria-label="กราฟยอดสะสมเทียบเป้า">
      {target != null && <line x1={x(0)} y1={y(target / daysInMonth)} x2={x(daysInMonth - 1)} y2={y(target)} stroke="#94a3b8" strokeDasharray="5 4" />}
      <polyline fill="none" stroke="#f97316" strokeWidth={2.5} points={cum.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
      <circle cx={x(cum.length - 1)} cy={y(cum[cum.length - 1])} r={4} fill="#f97316" />
      {[0, Math.floor((daysInMonth - 1) / 2), daysInMonth - 1].map((i) => <text key={i} x={x(i)} y={H - 4} fontSize={11} fill="#94a3b8" textAnchor={i === 0 ? "start" : i === daysInMonth - 1 ? "end" : "middle"}>{i + 1}</text>)}
    </svg>
  );
}

function ComparePanel({ d }: { d: Overview }) {
  const rows = [
    { label: "ช่วงที่เลือก", p: { from: d.range.from, to: d.range.to, sales: d.kpi.sales, orders: d.kpi.orders }, base: true },
    { label: "ช่วงก่อนหน้า (ยาวเท่ากัน)", p: d.compare.prev },
    { label: "ช่วงเดียวกันเดือนก่อน", p: d.compare.lastMonth },
    { label: "ช่วงเดียวกันปีก่อน", p: d.compare.lastYear },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-800">เทียบช่วงเวลา</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => {
          const c = r.base ? null : r.p.sales > 0 ? (d.kpi.sales - r.p.sales) / r.p.sales : null;
          return (
            <div key={r.label} className={`rounded-lg p-3 ${r.base ? "bg-orange-50" : "bg-slate-50"}`}>
              <div className="text-xs text-slate-500">{r.label}</div>
              <div className="text-[11px] text-slate-400">{shortDate(r.p.from)} – {shortDate(r.p.to)}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{r.p.sales > 0 ? bahtShort(r.p.sales) : "—"}</div>
              <div className="text-xs text-slate-500">{num(r.p.orders)} ออเดอร์{!r.base && <> · <span className={changeCls(c)}>ตอนนี้ {signPct(c)}</span></>}{!r.base && r.p.sales === 0 && " (ยังไม่มีข้อมูลช่วงนั้น)"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════ แท็บ ยอดขาย & ช่องทาง ═════════════════════════

function SalesTab({ d, pickPlatform }: { d: Overview; pickPlatform: (id: string) => void }) {
  const bars = d.daily.points.map((p) => ({ key: p.date, label: d.daily.unit === "month" ? shortMonth(p.date) : shortDate(p.date), value: p.sales, hint: `${num(p.orders)} ออเดอร์` }));
  const cols = useMemo<ColumnDef<PlatformRow>[]>(() => [
    { id: "name_th", accessorKey: "name_th", header: "ช่องทาง", size: 150, cell: ({ row }) => <span className="inline-flex items-center gap-1.5"><PlatformIcon code={row.original.code} iconKey={row.original.icon_key} size={16} /> {row.original.name_th}</span> },
    { id: "sales", accessorKey: "sales", header: "ยอดขาย", size: 120, cell: ({ getValue }) => baht(getValue() as number) },
    { id: "share", accessorKey: "share", header: "ส่วนแบ่ง", size: 90, cell: ({ getValue }) => pct(getValue() as number, 1) },
    { id: "orders", accessorKey: "orders", header: "ออเดอร์", size: 90, cell: ({ getValue }) => num(getValue() as number) },
    { id: "change", accessorKey: "change", header: "เทียบช่วงก่อน", size: 110, cell: ({ getValue }) => <span className={changeCls(getValue() as number | null)}>{signPct(getValue() as number | null)}</span> },
    { id: "target", accessorKey: "target", header: "เป้าเดือนนี้", size: 110, cell: ({ getValue }) => (getValue() == null ? <span className="text-slate-400">—</span> : baht(getValue() as number)) },
    { id: "noValue", accessorKey: "noValue", header: "ใบไม่มียอดเงิน", size: 110, cell: ({ getValue }) => ((getValue() as number) > 0 ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{num(getValue() as number)} ใบ</span> : "") },
  ], []);
  const max = Math.max(...d.heatmap.grid.flat(), 1);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-800">ยอดขาย{d.daily.unit === "month" ? "รายเดือน" : "รายวัน"}</h2>
        <SimpleBarChart data={bars} format={bahtShort} height={200} barColor="#fb923c" barHoverColor="#ea580c" ariaLabel="ยอดขายรายวัน" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <p className="mb-2 px-2 text-xs text-slate-500">กดแถวเพื่อดูเฉพาะช่องทางนั้น (เปิดแท็บสินค้า)</p>
        <DataTable<PlatformRow> tableId="marketing-overview-platforms" data={d.byPlatform} columns={cols} pageSize={20}
          exportFilename="marketing-channels" exportEntityType="marketing_overview" onRowClick={(r) => pickPlatform(r.id)} emptyMessage="ไม่มียอดในช่วงนี้" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-800">ขายดีวันไหน กี่โมง</h2>
          {d.heatmap.top.length > 0 && <span className="text-xs text-slate-500">ขายดีสุด: {d.heatmap.top.map((t) => `${WEEKDAYS_TH[t.day]} ${pad(t.hour)}:00`).join(" · ")}</span>}
        </div>
        <div className="mt-3 overflow-x-auto">
          <div className="grid min-w-[560px] gap-[2px] text-[10px] text-slate-400" style={{ gridTemplateColumns: "28px repeat(24, minmax(0, 1fr))" }}>
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{h % 3 === 0 ? h : ""}</span>)}
            {d.heatmap.grid.map((row, di) => (
              <div key={di} className="contents">
                <span className="leading-5">{WEEKDAYS_TH[di]}</span>
                {row.map((v, h) => <span key={h} title={`${WEEKDAYS_TH[di]} ${pad(h)}:00 · ${baht(v)}`} className="h-5 rounded-sm" style={{ background: v > 0 ? `rgba(249,115,22,${0.12 + 0.88 * (v / max)})` : "#f1f5f9" }} />)}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">ใช้ตั้งเวลายิงโฆษณา / ไลฟ์ / ปล่อยโปร ให้ตรงช่วงที่ลูกค้าซื้อจริง</p>
      </div>
    </div>
  );
}

// ═════════════════════════ แท็บ สินค้า ═════════════════════════

function ProductsTab({ d, period, platformId, brandId }: { d: Overview; period: Period; platformId: string; brandId: string }) {
  const rising = d.products.filter((p) => p.trend === "rising" || p.trend === "new").sort((a, b) => b.last14 - a.last14).slice(0, 5);
  const falling = d.products.filter((p) => (p.trend === "falling" || p.trend === "gone") && p.abc !== "C").sort((a, b) => b.prev14 - a.prev14).slice(0, 5);
  const totalSales = d.abcSummary.reduce((s, x) => s + x.sales, 0);
  const cols = useMemo<ColumnDef<ProductRow>[]>(() => [
    { id: "image", accessorKey: "image", header: "", size: 48, enableSorting: false, cell: ({ row }) => <HoverImage url={row.original.image} size={36} previewSize={260} alt={row.original.name} fallback={<Icon name="package" />} /> },
    { id: "code", accessorKey: "code", header: "รหัส", size: 120, cell: ({ row }) => <span>{row.original.code || "—"}{!row.original.matched && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700" title="ยังไม่จับคู่ SKU ในระบบ">รหัสบนร้าน</span>}</span> },
    { id: "name", accessorKey: "name", header: "ชื่อสินค้า", size: 260 },
    { id: "abc", accessorKey: "abc", header: "กลุ่ม", size: 70, cell: ({ getValue }) => <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ABC_CLS[getValue() as string]}`}>{getValue() as string}</span> },
    { id: "sales", accessorKey: "sales", header: "ยอดขาย", size: 110, cell: ({ getValue }) => baht(getValue() as number) },
    { id: "share", accessorKey: "share", header: "ส่วนแบ่ง", size: 80, cell: ({ getValue }) => pct(getValue() as number, 1) },
    { id: "qty", accessorKey: "qty", header: "ชิ้น", size: 70, cell: ({ getValue }) => num(getValue() as number) },
    { id: "orders", accessorKey: "orders", header: "ออเดอร์", size: 80, cell: ({ getValue }) => num(getValue() as number) },
    { id: "change", accessorKey: "change", header: "เทียบช่วงก่อน", size: 100, cell: ({ getValue }) => <span className={changeCls(getValue() as number | null)}>{signPct(getValue() as number | null)}</span> },
    { id: "trend", accessorKey: "trend", header: "14 วันล่าสุด", size: 110, cell: ({ row }) => { const m = TREND_META[row.original.trend]; return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${m.cls}`}>{m.icon && <Icon name={m.icon} />}{m.label}{row.original.trendChange != null && row.original.trend !== "steady" ? ` ${signPct(row.original.trendChange)}` : ""}</span>; } },
    { id: "platforms", accessorKey: "platforms", header: "ขายที่", size: 150 },
  ], []);
  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "a", label: "กลุ่ม A (ทำยอด 80%)", filter: (r) => (r as unknown as ProductRow).abc === "A" },
    { id: "rising", label: "ดาวรุ่ง / ขายใหม่", filter: (r) => ["rising", "new"].includes((r as unknown as ProductRow).trend) },
    { id: "falling", label: "กำลังตก / หยุดขาย", filter: (r) => ["falling", "gone"].includes((r as unknown as ProductRow).trend) },
    { id: "c", label: "กลุ่ม C (ขายน้อย)", filter: (r) => (r as unknown as ProductRow).abc === "C" },
    { id: "unmatched", label: "ยังไม่จับคู่ SKU", filter: (r) => !(r as unknown as ProductRow).matched },
  ], []);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-medium text-slate-800">สินค้า 80/20</h2>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {d.abcSummary.map((x) => <div key={x.abc} title={`กลุ่ม ${x.abc}`} className={x.abc === "A" ? "bg-orange-500" : x.abc === "B" ? "bg-amber-300" : "bg-slate-300"} style={{ width: `${totalSales ? (x.sales / totalSales) * 100 : 0}%` }} />)}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-600">
            {d.abcSummary.map((x) => <li key={x.abc}><span className={`mr-1.5 rounded px-1.5 py-0.5 font-medium ${ABC_CLS[x.abc]}`}>{x.abc}</span>{num(x.count)} ตัว · {bahtShort(x.sales)} ({pct(totalSales ? x.sales / totalSales : 0)})</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">A = ตัวทำเงินหลัก ห้ามขาดสต็อก · C = ขายน้อย พิจารณาจัดโปรหรือหยุดยิงแอด</p>
        </div>
        <MoverCard title="ดาวรุ่ง (14 วันล่าสุด)" rows={rising} tone="up" />
        <MoverCard title="กำลังตก (14 วันล่าสุด)" rows={falling} tone="down" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <p className="mb-2 px-2 text-xs text-slate-500">กดแถวเพื่อดูออเดอร์ที่มีสินค้านั้น · 14 วันล่าสุด = {shortDate(d.trendWindow.curFrom)}–{shortDate(d.trendWindow.to)} เทียบ {shortDate(d.trendWindow.prevFrom)}–{shortDate(d.trendWindow.prevTo)}</p>
        <DataTable<ProductRow> tableId="marketing-overview-products" data={d.products} columns={cols} views={views} pageSize={25}
          searchableKeys={["code", "name", "platforms"]} searchPlaceholder="ค้นหา รหัส / ชื่อสินค้า…"
          exportFilename="marketing-products" exportEntityType="marketing_overview" emptyMessage="ไม่มีสินค้าขายในช่วงนี้"
          drawerTitle={(r) => `${r.code || ""} ${r.name}`.trim()}
          drawerContent={(r) => <ProductOrders productKey={r.key} period={period} platformId={platformId} brandId={brandId} />} />
      </div>
    </div>
  );
}

function MoverCard({ title, rows, tone }: { title: string; rows: ProductRow[]; tone: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-800">{title}</h2>
      {rows.length === 0 ? <p className="mt-3 text-xs text-slate-400">ไม่มีตัวที่เปลี่ยนแรงในช่วงนี้</p> : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((p) => (
            <li key={p.key} className="flex items-center gap-2 text-sm">
              <HoverImage url={p.image} size={28} previewSize={240} alt={p.name} fallback={<Icon name="package" />} />
              <span className="min-w-0 flex-1 truncate" title={p.name}>{p.code || p.name}</span>
              <span className={`shrink-0 text-xs ${tone === "up" ? "text-emerald-600" : "text-rose-600"}`}>{p.trend === "new" ? "ใหม่" : signPct(p.trendChange)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductOrders({ productKey, period, platformId, brandId }: { productKey: string; period: Period; platformId: string; brandId: string }) {
  const [rows, setRows] = useState<{ id: string; ordered_at: string | null; order_no: string | null; platform: string | null; qty: number; value: number }[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ orders_for: productKey, from: period.from, to: period.to });
    if (platformId) q.set("platform_id", platformId);
    if (brandId) q.set("brand_id", brandId);
    apiFetch(`/api/marketing/overview?${q}`).then((r) => r.json()).then((j) => { if (j.error) throw new Error(j.error); setRows(j.orders); setTotal(j.total); }).catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, [productKey, period, platformId, brandId]);
  if (err) return <ErrorState title="โหลดออเดอร์ไม่สำเร็จ" hint={err} />;
  if (!rows) return <LoadingState label="กำลังหาออเดอร์…" />;
  if (!rows.length) return <EmptyState title="ไม่พบออเดอร์ในช่วงนี้" />;
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">{num(total)} ออเดอร์{total > rows.length ? ` (แสดงล่าสุด ${rows.length})` : ""} · กดเพื่อเปิดออเดอร์</p>
      <ul className="divide-y divide-slate-100 text-sm">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/master/platform-orders/${o.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50">
              <span className="min-w-0"><span className="font-medium text-slate-800">{o.order_no ?? "—"}</span> <span className="text-xs text-slate-500">{o.platform} · {o.ordered_at ? shortDate(new Date(Date.parse(o.ordered_at) + 7 * 3600_000).toISOString().slice(0, 10)) : ""}</span></span>
              <span className="shrink-0 text-xs text-slate-600">{num(o.qty)} ชิ้น · {baht(o.value)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═════════════════════════ แท็บ ยกเลิก ═════════════════════════

function CancelTab({ d }: { d: Overview }) {
  const c = d.cancel;
  const total = c.groups.reduce((s, g) => s + g.count, 0);
  const cols = useMemo<ColumnDef<CancelRow>[]>(() => [
    { id: "label", accessorKey: "label", header: "กลุ่มเหตุผล", size: 240, cell: ({ row }) => <span className="inline-flex items-center gap-1.5">{row.original.storeFault && <Icon name="warning" className="text-rose-600" />}{row.original.label}{row.original.storeFault && <span className="rounded bg-rose-50 px-1.5 text-[11px] text-rose-700">ความผิดฝั่งร้าน</span>}</span> },
    { id: "count", accessorKey: "count", header: "ใบ", size: 70, cell: ({ getValue }) => num(getValue() as number) },
    { id: "share", accessorFn: (r) => (total ? r.count / total : 0), header: "สัดส่วน", size: 80, cell: ({ getValue }) => pct(getValue() as number) },
    { id: "hint", accessorKey: "hint", header: "ความหมาย", size: 280 },
  ], [total]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ยกเลิกในช่วงนี้" sub={`จาก ${num(d.kpi.allOrders)} ออเดอร์`}>{num(c.total)}</Kpi>
        <Kpi label="อัตรายกเลิก">{pct(c.rate, 1)}</Kpi>
        <Kpi label="ฝั่งร้าน 7 วันล่าสุด" sub="ร้านไม่ส่ง / ของหมด / ไม่ตอบ" subCls={c.storeFault7d ? "text-rose-600" : "text-slate-500"}>{num(c.storeFault7d)}</Kpi>
        <Kpi label="มีเหตุผลระบุ" sub="Lazada ไม่ส่งเหตุผลมา">{num(c.groups.filter((g) => g.key !== "other").reduce((s, g) => s + g.count, 0))}</Kpi>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <p className="mb-2 px-2 text-xs text-slate-500">กดแถวเพื่อดูเหตุผลจริงที่ลูกค้าเลือก</p>
        <DataTable<CancelRow> tableId="marketing-overview-cancel" data={c.groups} columns={cols} pageSize={20}
          exportFilename="marketing-cancel-reasons" exportEntityType="marketing_overview" emptyMessage="ไม่มีออเดอร์ยกเลิกในช่วงนี้"
          drawerTitle={(r) => r.label}
          drawerContent={(r) => (
            <ul className="divide-y divide-slate-100 text-sm">
              {r.reasons.map((x) => <li key={x.reason} className="flex justify-between gap-2 py-2"><span>{x.reason}</span><span className="shrink-0 text-slate-500">{num(x.count)} ใบ</span></li>)}
            </ul>
          )} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-800">ยกเลิกแยกช่องทาง</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {c.byPlatform.filter((p) => p.allOrders > 0).map((p) => (
            <li key={p.code} className="flex items-center gap-2">
              <span className="w-24 shrink-0">{p.name_th}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-rose-400" style={{ width: `${Math.min(100, p.rate * 100 * 3)}%` }} /></span>
              <span className="w-28 shrink-0 text-right text-xs text-slate-600">{pct(p.rate, 1)} · {num(p.cancelled)} ใบ</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ═════════════════════════ แท็บ แคมเปญวันพิเศษ ═════════════════════════

function CampaignTab({ d, pick }: { d: Overview; pick: (date: string) => void }) {
  const s = d.campaign.selected;
  const doubles = d.campaign.days.filter((x) => /^\d+\.\d+$/.test(x.label));
  const others = d.campaign.days.filter((x) => !/^\d+\.\d+$/.test(x.label)).slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {[...doubles, ...others].map((x) => (
          <button key={x.date} type="button" onClick={() => pick(x.date)}
            className={`rounded-full border px-3 py-1 text-xs ${s?.date === x.date ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {x.label}{x.sales > 0 ? ` · ${bahtShort(x.sales)}` : ""}
          </button>
        ))}
      </div>
      {!s ? <EmptyState title="ยังไม่มีวันพิเศษในช่วงที่มีข้อมูล" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`${s.label} ยอดวันงาน`} sub={s.lift != null ? `${s.lift.toFixed(1)} เท่าของวันปกติ` : "ไม่มีข้อมูลวันปกติไว้เทียบ"} subCls="text-emerald-600">{bahtShort(s.day)}</Kpi>
            <Kpi label="ออเดอร์วันงาน" sub={`วันปกติเฉลี่ย ${bahtShort(s.baseline)}/วัน`}>{num(s.orders)}</Kpi>
            <Kpi label="3 วันก่อนงาน" sub={s.preChange != null && s.preChange < 0 ? "ลูกค้ารอซื้อวันงาน" : "เทียบวันปกติ"} subCls="text-slate-500">
              <span className={changeCls(s.preChange)}>{signPct(s.preChange)}</span>
            </Kpi>
            <Kpi label="3 วันหลังงาน" sub="เทียบวันปกติ"><span className={changeCls(s.postChange)}>{signPct(s.postChange)}</span></Kpi>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-medium text-slate-800">ยอดรายวัน 7 วันก่อน · วันงาน · 7 วันหลัง</h2>
            <SimpleBarChart data={s.series.map((x) => ({ key: x.date, label: x.offset === 0 ? s.label : shortDate(x.date), value: x.sales, hint: `${num(x.orders)} ออเดอร์` }))} format={bahtShort} height={200} barColor="#fb923c" barHoverColor="#ea580c" ariaLabel="ยอดรอบวันพิเศษ" />
            <p className="mt-2 text-xs text-slate-400">วันปกติ = เฉลี่ยวันที่ 8–14 ก่อนงาน · ถ้าก่อนงานตกมาก แปลว่ายอดวันงานส่วนหนึ่ง &quot;ยืม&quot; มาจากวันอื่น</p>
          </div>
        </>
      )}
    </div>
  );
}

// ═════════════════════════ ตั้งเป้า (รวม + แยกช่องทาง) ═════════════════════════

function TargetModal({ d, brandId, onClose, onSaved, toast }: { d: Overview; brandId: string; onClose: () => void; onSaved: () => void; toast: ReturnType<typeof useToast> }) {
  const init = useMemo(() => {
    const m: Record<string, string> = { "": d.targets.total != null ? String(d.targets.total) : "" };
    for (const p of d.filters.platforms) m[p.code] = d.targets.byPlatform[p.code] != null ? String(d.targets.byPlatform[p.code]) : "";
    return m;
  }, [d]);
  const [vals, setVals] = useState<Record<string, string>>(init);
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(vals).some((k) => (vals[k] ?? "") !== (init[k] ?? ""));
  const sumChannels = d.filters.platforms.reduce((s, p) => s + (Number(vals[p.code]) || 0), 0);
  const brandName = brandId ? d.filters.brands.find((b) => b.id === brandId)?.name ?? "" : "ทุกแบรนด์";

  const send = async (code: string, amount: string) => {
    const j = await apiFetch("/api/platform-dashboard", { method: "PATCH", body: JSON.stringify({ set_target: true, month: d.targets.ym, brand_id: brandId || null, platform_code: code || null, amount: amount ? Number(amount) : null }) }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
  };
  const save = async () => {
    const changed = Object.keys(vals).filter((k) => (vals[k] ?? "") !== (init[k] ?? ""));
    setSaving(true);
    try {
      for (const k of changed) await send(k, vals[k]);
      onClose(); onSaved();
      toast.undo(`บันทึกเป้า ${shortMonth(d.targets.ym)} แล้ว`, async () => {
        try { for (const k of changed) await send(k, init[k] ?? ""); toast.success("ย้อนเป้ากลับแล้ว"); onSaved(); } catch (e) { toast.error(`ย้อนกลับไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
      }, { ms: 8000 });
    } catch (e) { toast.error(`บันทึกเป้าไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} size="sm" title={`ตั้งเป้ายอดขาย ${shortMonth(d.targets.ym)} · ${brandName}`} hasUnsavedChanges={dirty} loading={saving}
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm">ยกเลิก</button><button type="button" disabled={saving || !dirty} onClick={() => void save()} className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">บันทึก</button></div>}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-700">เป้ารวมทุกช่องทาง</span>
          <MoneyInput value={vals[""]} onChange={(v) => setVals((s) => ({ ...s, "": v }))} placeholder="เช่น 1,300,000" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3" />
        </label>
        <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">เป้าแยกช่องทาง (ไม่ตั้ง = ไม่แสดงเป้าเมื่อกรองช่องทางนั้น)</div>
        {d.filters.platforms.map((p) => (
          <label key={p.code} className="flex items-center gap-2 text-sm">
            <span className="inline-flex w-32 shrink-0 items-center gap-1.5"><PlatformIcon code={p.code} iconKey={p.icon_key} size={16} /> {p.name_th}</span>
            <MoneyInput value={vals[p.code]} onChange={(v) => setVals((s) => ({ ...s, [p.code]: v }))} placeholder="—" className="h-9 w-full rounded-lg border border-slate-200 px-3" />
          </label>
        ))}
        {sumChannels > 0 && <p className="text-xs text-slate-500">รวมเป้าช่องทาง {baht(sumChannels)}{Number(vals[""]) > 0 && Math.abs(sumChannels - Number(vals[""])) > 1 ? ` · ต่างจากเป้ารวม ${baht(sumChannels - Number(vals[""]))}` : ""}</p>}
        <p className="text-[11px] text-slate-400">ลบเป้า = เว้นช่องว่างแล้วบันทึก · เป้ารวมเป็นตัวเดียวกับหน้าแดชบอร์ดช่องทางขาย · ทุกการแก้ลงประวัติ</p>
      </div>
    </ERPModal>
  );
}
