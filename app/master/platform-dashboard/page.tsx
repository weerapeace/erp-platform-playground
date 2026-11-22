"use client";

// แดชบอร์ดรวมผู้บริหาร (หลายแพลตฟอร์ม) — ยอดขาย/ออเดอร์/สินค้าบนแพลตฟอร์ม/สต๊อก · ข้อมูลจาก /api/platform-dashboard (สูตรทั้งหมดอยู่ที่ API)
// หน้าตา (เจ้าของขอ 2026-11-22 · เลือกใน widget "8 ข้อ + ข้อเสริม 1-7"):
//   ดีไซน์ปกติ (การ์ด) + แอนิเมชัน (ตัวเลขวิ่ง CountUp · แท่งค่อย ๆ ยืด) · ค่าเริ่ม = วันนี้ · ยอดเดือนนี้ + เป้า (แก้/ลบได้)
//   สถานะการเชื่อมต่อทุกร้าน (กด = หน้าสถานะดึงออเดอร์) · เลือกวัน/เดือน/ปี/ช่วง (PeriodPicker) · ปุ่ม "อัปเดตตอนนี้" (ดึงออเดอร์ทุกร้านที่ต่อ API)
//   ยอดหลัก = ราคาสินค้าแบบหน้าร้าน (ตรงกับ Shopee) + บรรทัดรอง "ลูกค้าจ่ายจริง" · ต้องส่งวันนี้/เลยกำหนด · ยกเลิก % · เฉลี่ยต่อออเดอร์
//   รายการในออเดอร์ที่ยังไม่จับคู่ SKU · ยอดตามชั่วโมงเทียบวันก่อน (เลือกวันเดียว) · ออเดอร์ล่าสุด · ขายดี (สลับตามยอด/ชิ้น)
//   สต๊อกใกล้หมดเฉพาะที่ขายได้ใน 30 วัน · รีเฟรชเองทุก 5 นาที (ตอนเปิดหน้าอยู่)
// ของกลาง: PeriodPicker · CountUp · SimpleBarChart · HoverImage · PlatformIcon · Icon · ERPModal · MoneyInput · LoadingState/ErrorState · useToast

import { ErrorState, LoadingState } from "@/components/state-views";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { SimpleBarChart } from "@/components/bar-chart";
import { CountUp } from "@/components/count-up";
import { PeriodPicker, todayPeriod, type Period } from "@/components/date-input/period-picker";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { TH_MONTHS } from "@/lib/date-range";

const ST: Record<string, string> = { new: "ใหม่", confirmed: "ยืนยันแล้ว", packed: "แพ็คแล้ว", shipped: "ส่งแล้ว", cancelled: "ยกเลิก" };
const ST_CLS: Record<string, string> = { new: "bg-sky-50 text-sky-700", confirmed: "bg-sky-50 text-sky-700", packed: "bg-amber-50 text-amber-700", shipped: "bg-emerald-50 text-emerald-700", cancelled: "bg-rose-50 text-rose-700" };
const PF_COLOR: Record<string, string> = { shopee: "#ee4d2d", tiktok: "#111827", lazada: "#1a3cc8", line_shopping: "#06c755", website: "#7c3aed" };
const STATE_CLS: Record<string, string> = { ok: "text-emerald-600", slow: "text-amber-600", token: "text-amber-600", stale: "text-rose-600", error: "text-rose-600", off: "text-slate-400" };
const REFRESH_MS = 5 * 60_000;

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type Dash = {
  filters: { platforms: Platform[]; brands: Brand[] };
  kpi: { salesTotal: number; salesPaid: number; salesOrders: number; aov: number; ordersCount: number; ordersPending: number; ordersToShip: number; cancelled: number; cancelRate: number; unpaid: number; catalogTotal: number; catalogMatched: number; catalogUnmatched: number };
  month: { ym: string; from: string; to: string; sales: number; paid: number; orders: number; prev: { from: string; to: string; sales: number; orders: number }; target: number | null };
  byPlatform: { id: string; code: string; name_th: string; icon_key: string | null; orders: number; sales: number; paid: number; catalog: number; matched: number }[];
  byStatus: { status: string; count: number }[];
  topProducts: { key: string; name: string; sku: string | null; qty: number; sales: number; image?: string | null }[];
  lowStock: { sku_id: string; code: string; name: string; available: number; sold30: number; cover_days: number | null; image?: string | null }[];
  byDay: { unit: "day" | "month"; from: string; to: string; points: { date: string; sales: number; orders: number }[] };
  hourly: { day: string; prevDay: string; cur: number[]; prev: number[] } | null;
  prev: { from: string; to: string; salesPaid: number; ordersCount: number } | null;
  shipDue: { late: number; today: number; tomorrow: number };
  unmatched: { lines: number; codes: number; top: { code: string; qty: number }[] };
  latest: { id: string; ordered_at: string | null; platform_code: string | null; platform_name: string | null; icon_key: string | null; order_no: string | null; total: number; status: string; unpaid: boolean }[];
  connection: { shops: { platform: string; brand_id: string | null; label: string; mode: string; state: string; headline: string; fix: string | null; last_run_at: string | null; catalog: { ok: boolean; at: string | null; error: string | null } | null }[]; last_pull_at: string | null };
  today: string;
};

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `฿${Math.round(n / 1_000)}k` : `฿${Math.round(n)}`;
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;
const shortMonth = (ym: string) => `${TH_MONTHS[+ym.slice(5, 7) - 1]} ${String(+ym.slice(0, 4) + 543).slice(2)}`;
const hhmm = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const agoText = (iso: string | null) => {
  if (!iso) return "ยังไม่มีข้อมูล";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 2 ? "เมื่อสักครู่" : m < 60 ? `${m} นาทีก่อน` : m < 48 * 60 ? `${Math.round(m / 60)} ชม.ก่อน` : `${Math.round(m / 1440)} วันก่อน`;
};
const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

function Delta({ cur, prev, title }: { cur: number; prev: number | undefined | null; title: string }) {
  const p = prev == null ? null : pct(cur, prev);
  if (p == null) return null;
  const up = p >= 0;
  return <span title={title} className={`inline-flex items-center gap-0.5 font-medium ${up ? "text-emerald-600" : "text-rose-600"}`}><Icon value={up ? "i:trending-up" : "i:trending-down"} />{up ? "+" : ""}{p.toFixed(1)}%</span>;
}

/** แท่งแนวนอนที่ค่อย ๆ ยืดตอนแสดง */
function GrowBar({ pct: p, color, ready }: { pct: number; color: string; ready: boolean }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: ready ? `${Math.max(p, p > 0 ? 1.5 : 0)}%` : "0%", background: color }} />
    </div>
  );
}

function Card({ title, icon, right, children, className = "" }: { title: string; icon: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-800"><Icon value={icon} />{title}<span className="ml-auto" />{right}</h2>
      {children}
    </section>
  );
}

export default function PlatformDashboardPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canPull = can("platform_orders.manage");
  const canTarget = can("products.platforms.edit");
  const [d, setD] = useState<Dash | null>(null);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [period, setPeriod] = useState<Period>(() => todayPeriod());   // ค่าเริ่ม = วันนี้ (เจ้าของขอ)
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);          // แท่งเริ่มยืดหลังโหลดเสร็จ
  const [topBy, setTopBy] = useState<"sales" | "qty">("sales");
  const [pulling, setPulling] = useState<string | null>(null);
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetVal, setTargetVal] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);
  const seqRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const seq = ++seqRef.current;
    if (!silent) { setLoading(true); setFailed(false); }
    try {
      const q = new URLSearchParams();
      if (platformId) q.set("platform_id", platformId);
      if (brandId) q.set("brand_id", brandId);
      q.set("from", period.from); q.set("to", period.to);
      const res = await apiFetch(`/api/platform-dashboard?${q}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as Dash;
      if (seq !== seqRef.current) return;
      setD(j); setFailed(false);
      requestAnimationFrame(() => setReady(true));
    } catch { if (seq === seqRef.current && !silent) setFailed(true); }
    finally { if (seq === seqRef.current) setLoading(false); }
  }, [platformId, brandId, period]);
  useEffect(() => { setReady(false); void load(); }, [load]);

  // รีเฟรชเองทุก 5 นาที (เฉพาะตอนหน้าเปิดอยู่) — อ่านจากระบบ ไม่ถามร้าน
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // อัปเดตตอนนี้ = ดึงออเดอร์ทุกร้านที่ต่อ API ทันที (ตัวกลางเดียวกับปุ่ม "ดึงตอนนี้" หน้าสถานะ) แล้วโหลดใหม่
  const pullNow = useCallback(async () => {
    const shops = (d?.connection.shops ?? []).filter((s) => s.mode === "api" || s.mode === "direct");
    if (!shops.length) { toast.warning("ยังไม่มีร้านที่ดึงออเดอร์ผ่าน API ได้"); return; }
    let fail = 0;
    for (const s of shops) {
      setPulling(s.label);
      try {
        const j = await apiFetch("/api/platform-orders/pull", { method: "POST", body: JSON.stringify({ platform: s.platform, brand_id: s.brand_id }) }).then((r) => r.json());
        if (!j.ok) fail++;
      } catch { fail++; }
    }
    setPulling(null);
    if (fail) toast.warning(`อัปเดตแล้ว แต่ ${fail} ร้านดึงไม่สำเร็จ — ดูที่หน้าสถานะการเชื่อมต่อ`); else toast.success("อัปเดตยอดล่าสุดจากทุกร้านแล้ว");
    void load(true);
  }, [d, load, toast]);

  const saveTarget = useCallback(async (clear = false) => {
    if (!d) return;
    setSavingTarget(true);
    try {
      const j = await apiFetch("/api/platform-dashboard", { method: "PATCH", body: JSON.stringify({ set_target: true, month: d.month.ym, brand_id: brandId || null, amount: clear ? null : (Number(targetVal) || null) }) }).then((r) => r.json());
      if (j.error) { toast.error(`บันทึกเป้าไม่สำเร็จ: ${j.error}`); return; }
      toast.success(clear || !j.target ? "ลบเป้ายอดขายแล้ว" : "บันทึกเป้ายอดขายแล้ว");
      setTargetOpen(false); void load(true);
    } finally { setSavingTarget(false); }
  }, [d, brandId, targetVal, load, toast]);

  const kpi = d?.kpi;
  const singleDay = period.from === period.to;
  const isToday = singleDay && d && period.from === d.today;
  const rangeLabel = isToday ? "วันนี้" : singleDay ? shortDate(period.from) : `${shortDate(period.from)} – ${shortDate(period.to)}`;
  const ranked = useMemo(() => [...(d?.byPlatform ?? [])].sort((a, b) => b.sales - a.sales || b.orders - a.orders), [d]);
  const maxPf = Math.max(1, ...ranked.map((p) => p.sales));
  const top = useMemo(() => [...(d?.topProducts ?? [])].sort((a, b) => (topBy === "sales" ? b.sales - a.sales || b.qty - a.qty : b.qty - a.qty || b.sales - a.sales)).slice(0, 10), [d, topBy]);
  const chartData = (d?.byDay.points ?? []).map((p) => ({ key: p.date, label: d?.byDay.unit === "month" ? shortMonth(p.date) : shortDate(p.date), value: Math.round(p.sales), hint: `${num(p.orders)} ออเดอร์` }));
  const ordersHref = brandId ? `/master/platform-orders?brand=${encodeURIComponent(brandId)}` : "/master/platform-orders";
  const conn = d?.connection.shops ?? [];
  const connBad = conn.filter((s) => s.state !== "ok" && s.state !== "off").length + conn.filter((s) => s.catalog && !s.catalog.ok).length;
  const target = d?.month.target ?? null;
  const targetPct = target && d ? Math.min(100, (d.month.sales / target) * 100) : 0;
  const hourMax = d?.hourly ? Math.max(1, ...d.hourly.cur, ...d.hourly.prev) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-6">
      {/* หัวหน้า + ตัวกรอง */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-900">แดชบอร์ดช่องทางขาย</h1>
            <p className="text-sm text-slate-500">ยอดขาย ออเดอร์ สินค้าบนแพลตฟอร์ม และสต๊อก — รวมทุกช่องทางไว้ที่เดียว</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span title="เวลาที่ดึงออเดอร์จากร้านครั้งล่าสุด (ดึงเองทุก 15 นาที)">อัปเดตล่าสุด {agoText(d?.connection.last_pull_at ?? null)}</span>
            {canPull && (
              <button type="button" onClick={() => void pullNow()} disabled={!!pulling || !d}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                <span className={pulling ? "inline-flex animate-spin" : "inline-flex"}><Icon value="i:refresh" /></span>{pulling ? `กำลังดึง ${pulling}…` : "อัปเดตตอนนี้"}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} aria-label="แพลตฟอร์ม" className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            <option value="">ทุกแพลตฟอร์ม</option>
            {(d?.filters.platforms ?? []).map((p) => <option key={p.id} value={p.id}>{p.name_th}</option>)}
          </select>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="แบรนด์/ร้าน" className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            <option value="">ทุกแบรนด์/ร้าน</option>
            {(d?.filters.brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        {/* สถานะการเชื่อมต่อ (ดึงออเดอร์ + ดึงสินค้า) — กด = หน้าสถานะ */}
        {conn.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500">การเชื่อมต่อ</span>
            {conn.map((s) => {
              const catBad = s.catalog && !s.catalog.ok;
              const bad = s.state !== "ok" || catBad;
              return (
                <Link key={`${s.platform}:${s.brand_id}`} href="/master/platform-orders/pull-status"
                  title={[s.headline, s.fix, s.catalog ? `ดึงสินค้า: ${s.catalog.ok ? `ปกติ (${agoText(s.catalog.at)})` : s.catalog.error ?? "มีปัญหา"}` : null].filter(Boolean).join("\n")}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${bad ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}>
                  <span className={STATE_CLS[catBad ? "slow" : s.state] ?? "text-slate-400"}><Icon value={bad ? "i:alert-triangle" : "i:circle-check"} /></span>
                  {s.label}{bad && <span className="max-w-[12rem] truncate"> · {catBad ? "ดึงสินค้าไม่สำเร็จ" : s.headline}</span>}
                </Link>
              );
            })}
            <Link href="/master/platform-orders/pull-status" className="text-violet-700 hover:underline">{connBad ? `มีปัญหา ${connBad} จุด — ดูหน้าสถานะ →` : "ดูหน้าสถานะ →"}</Link>
          </div>
        )}
      </header>

      {loading && !d ? <LoadingState /> : failed && !d ? <ErrorState title="โหลดข้อมูลไม่สำเร็จ" onRetry={() => void load()} /> : !kpi || !d ? null : (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {failed && <p className="text-xs text-rose-600">โหลดข้อมูลล่าสุดไม่สำเร็จ — ตัวเลขเป็นของรอบก่อน <button type="button" onClick={() => void load()} className="underline">ลองใหม่</button></p>}

          {/* การ์ดตัวเลขหลัก */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">ยอดขาย{rangeLabel === "วันนี้" ? "วันนี้" : ` · ${rangeLabel}`}</div>
              <CountUp value={kpi.salesTotal} format={baht} className="mt-1 block text-2xl font-semibold text-slate-900 sm:text-3xl" />
              <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500" title="ยอดหลัก = ราคาสินค้าแบบหน้าร้าน (ตรงกับ Shopee) · ลูกค้าจ่ายจริง = หลังโค้ดส่วนลดของแพลตฟอร์ม/Coins">
                <span>ลูกค้าจ่ายจริง {baht(kpi.salesPaid)}</span>
                {d.prev && <Delta cur={kpi.salesPaid} prev={d.prev.salesPaid} title={`เทียบช่วงก่อนหน้า ${shortDate(d.prev.from)} – ${shortDate(d.prev.to)}`} />}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center text-xs text-slate-500">ยอดเดือนนี้ ({shortMonth(d.month.ym)})
                {canTarget && <button type="button" onClick={() => { setTargetVal(target ? String(target) : ""); setTargetOpen(true); }} title={target ? "แก้/ลบเป้ายอดขายเดือนนี้" : "ตั้งเป้ายอดขายเดือนนี้"} className="ml-auto text-slate-400 hover:text-violet-700"><Icon value="i:target" /></button>}
              </div>
              <CountUp value={d.month.sales} format={baht} className="mt-1 block text-2xl font-semibold text-slate-900 sm:text-3xl" />
              {target ? (
                <div className="mt-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: ready ? `${targetPct}%` : "0%" }} /></div>
                  <div className="mt-0.5 text-[11px] text-slate-500">เป้า {baht(target)} · ได้ {targetPct.toFixed(0)}%</div>
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                  <span>เดือนก่อนช่วงเดียวกัน {baht(d.month.prev.sales)}</span>
                  <Delta cur={d.month.sales} prev={d.month.prev.sales} title={`เทียบ ${shortDate(d.month.prev.from)} – ${shortDate(d.month.prev.to)}`} />
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">ออเดอร์ · {rangeLabel}</div>
              <CountUp value={kpi.ordersCount} format={num} className="mt-1 block text-2xl font-semibold text-slate-900 sm:text-3xl" />
              <div className="mt-1 text-[11px] text-slate-500">เฉลี่ย {baht(kpi.aov)}/ออเดอร์ · ยกเลิก {num(kpi.cancelled)} ({(kpi.cancelRate * 100).toFixed(0)}%){kpi.unpaid ? ` · ยังไม่จ่าย ${num(kpi.unpaid)}` : ""}</div>
            </div>
            <Link href={ordersHref} className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-violet-300">
              <div className="text-xs text-slate-500">ต้องส่งวันนี้</div>
              <CountUp value={d.shipDue.today} format={num} className={`mt-1 block text-2xl font-semibold sm:text-3xl ${d.shipDue.today ? "text-amber-600" : "text-slate-900"}`} />
              <div className="mt-1 text-[11px] text-slate-500">
                {d.shipDue.late > 0 && <span className="font-medium text-rose-600">เลยกำหนด {num(d.shipDue.late)} · </span>}
                พรุ่งนี้ {num(d.shipDue.tomorrow)} · รอแพ็ค {num(kpi.ordersPending)} · รอส่ง {num(kpi.ordersToShip)}
                <span className="ml-1 text-violet-700 group-hover:underline">→</span>
              </div>
            </Link>
          </div>

          {/* เตือน: รายการในออเดอร์ยังไม่จับคู่ SKU */}
          {d.unmatched.lines > 0 && (
            <Link href={ordersHref} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 hover:bg-amber-100">
              <Icon value="i:alert-triangle" />
              <span>มีสินค้าในออเดอร์ {num(d.unmatched.lines)} รายการ ({num(d.unmatched.codes)} รหัส) ที่ยังไม่จับคู่ SKU — ตัดสต๊อกและนับขายดีไม่ได้</span>
              <span className="text-amber-700">{d.unmatched.top.map((t) => t.code).join(" · ")}</span>
              <span className="ml-auto font-medium">ไปจับคู่ →</span>
            </Link>
          )}

          {/* กราฟ: วันเดียว = ตามชั่วโมงเทียบวันก่อน · หลายวัน = รายวัน/รายเดือน */}
          <Card title={d.hourly ? `ยอดตามชั่วโมง · ${shortDate(d.hourly.day)} เทียบ ${shortDate(d.hourly.prevDay)}` : `ยอดขาย${d.byDay.unit === "month" ? "รายเดือน" : "รายวัน"} · ${shortDate(d.byDay.from)} – ${shortDate(d.byDay.to)}`} icon="i:chart-bar"
            right={d.hourly ? <span className="flex items-center gap-2 text-[11px] font-normal text-slate-500"><span className="inline-block h-2 w-3 rounded-sm bg-violet-500" />{shortDate(d.hourly.day)}<span className="inline-block h-2 w-3 rounded-sm bg-slate-300" />{shortDate(d.hourly.prevDay)}</span> : undefined}>
            {d.hourly ? (
              <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="กราฟยอดขายตามชั่วโมง">
                {d.hourly.cur.map((v, h) => (
                  <div key={h} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${String(h).padStart(2, "0")}:00 — ${baht(v)} (วันก่อน ${baht(d.hourly!.prev[h])})`}>
                    <div className="flex flex-1 items-end gap-px">
                      <div className="w-1/2 rounded-t-sm bg-slate-300 transition-[height] duration-700 ease-out motion-reduce:transition-none" style={{ height: ready ? `${(d.hourly!.prev[h] / hourMax) * 100}%` : "0%" }} />
                      <div className="w-1/2 rounded-t-sm bg-violet-500 transition-[height] duration-700 ease-out motion-reduce:transition-none" style={{ height: ready ? `${(v / hourMax) * 100}%` : "0%" }} />
                    </div>
                    <div className="mt-1 h-3 text-center text-[9px] text-slate-400">{h % 3 === 0 ? h : ""}</div>
                  </div>
                ))}
              </div>
            ) : (
              <SimpleBarChart data={chartData} format={bahtShort} height={190} barColor="#8b5cf6" barHoverColor="#6d28d9" emptyText="ยังไม่มียอดขายในช่วงนี้" ariaLabel="กราฟยอดขายตามวัน" />
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-4">
              <Card title="ยอดขายแยกช่องทาง" icon="i:building-store" right={<span className="text-[11px] font-normal text-slate-400">กด = ดูเฉพาะช่องทางนั้น</span>}>
                {ranked.length === 0 ? <p className="py-3 text-sm text-slate-400">ยังไม่มีข้อมูล</p> : ranked.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPlatformId((c) => (c === p.id ? "" : p.id))}
                    className={`flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-slate-50 ${platformId === p.id ? "bg-violet-50" : ""}`}>
                    <span className="inline-flex w-28 shrink-0 items-center gap-1.5 truncate"><PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />{p.name_th}</span>
                    <GrowBar pct={(p.sales / maxPf) * 100} color={PF_COLOR[p.code] ?? "#64748b"} ready={ready} />
                    <span className="w-24 shrink-0 text-right tabular-nums text-slate-800">{baht(p.sales)}</span>
                    <span className="hidden w-20 shrink-0 text-right text-[11px] text-slate-400 sm:block">{num(p.orders)} ออเดอร์</span>
                  </button>
                ))}
              </Card>

              <Card title="ออเดอร์ล่าสุด" icon="i:receipt" right={<Link href={ordersHref} className="text-[11px] font-normal text-violet-700 hover:underline">ศูนย์ออเดอร์ →</Link>}>
                {d.latest.length === 0 ? <p className="py-2 text-sm text-slate-400">ยังไม่มีออเดอร์</p> : (
                  <div className="divide-y divide-slate-100">
                    {d.latest.map((o) => (
                      <div key={o.id} className="flex items-center gap-2 py-2 text-sm">
                        <span className="w-11 shrink-0 text-xs tabular-nums text-slate-400">{hhmm(o.ordered_at)}</span>
                        {o.platform_code && <PlatformIcon code={o.platform_code} iconKey={o.icon_key} size={14} />}
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">{o.order_no ?? "—"}</span>
                        <span className="tabular-nums text-slate-800">{baht(o.total)}</span>
                        <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] ${o.unpaid ? "bg-slate-100 text-slate-500" : ST_CLS[o.status] ?? "bg-slate-100 text-slate-600"}`}>{o.unpaid ? "ยังไม่จ่าย" : ST[o.status] ?? o.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-4">
              <Card title="ขายดี" icon="i:flame" right={
                <span className="inline-flex overflow-hidden rounded-md border border-slate-200 text-[11px] font-normal">
                  <button type="button" onClick={() => setTopBy("sales")} className={`px-2 py-0.5 ${topBy === "sales" ? "bg-violet-600 text-white" : "text-slate-600"}`}>ตามยอด ฿</button>
                  <button type="button" onClick={() => setTopBy("qty")} className={`px-2 py-0.5 ${topBy === "qty" ? "bg-violet-600 text-white" : "text-slate-600"}`}>ตามจำนวนชิ้น</button>
                </span>}>
                {top.length === 0 ? <p className="py-2 text-sm text-slate-400">ยังไม่มีข้อมูลการขายในช่วงนี้</p> : (
                  <div className="divide-y divide-slate-100">
                    {top.map((p, i) => (
                      <div key={p.key} className="flex items-center gap-2.5 py-1.5">
                        <span className={`w-5 shrink-0 text-center text-sm tabular-nums ${i < 3 ? "font-semibold text-violet-700" : "text-slate-400"}`}>{i + 1}</span>
                        {p.image ? <HoverImage url={p.image} size={34} previewSize={260} alt={p.name} rounded="rounded" fallback="" />
                          : <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded bg-slate-50 text-slate-300" title="ยังไม่จับคู่ ERP หรือยังไม่มีรูป"><Icon value="i:photo" /></span>}
                        <div className="min-w-0 flex-1"><div className="truncate text-sm text-slate-800" title={p.name}>{p.name}</div>{p.sku && <div className="truncate font-mono text-[11px] text-slate-400">{p.sku}</div>}</div>
                        <div className="shrink-0 text-right text-xs tabular-nums"><div className={topBy === "sales" ? "font-medium text-slate-900" : "text-slate-500"}>{baht(p.sales)}</div><div className={topBy === "qty" ? "font-medium text-slate-900" : "text-slate-500"}>{num(p.qty)} ชิ้น</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="สต๊อกใกล้หมด" icon="i:package" right={<span className="text-[11px] font-normal text-slate-400">เฉพาะที่ขายได้ใน 30 วัน</span>}>
                {d.lowStock.length === 0 ? <p className="py-2 text-sm text-slate-400">สินค้าที่ขายได้ยังมีสต๊อกพอ</p> : (
                  <div className="divide-y divide-slate-100">
                    {d.lowStock.map((s) => (
                      <div key={s.sku_id} className="flex items-center gap-2.5 py-1.5 text-sm">
                        {s.image ? <HoverImage url={s.image} size={30} previewSize={240} alt={s.code} rounded="rounded" fallback="" /> : <span className="h-[30px] w-[30px] shrink-0 rounded bg-slate-50" />}
                        <div className="min-w-0 flex-1"><div className="truncate font-mono text-xs text-slate-700">{s.code}</div><div className="truncate text-[11px] text-slate-400">{s.name}</div></div>
                        <div className="shrink-0 text-right text-xs">
                          <div className={`font-medium tabular-nums ${s.available <= 0 ? "text-rose-600" : "text-amber-600"}`}>{s.available <= 0 ? "หมดแล้ว" : `เหลือ ${num(s.available)}`}</div>
                          <div className="text-[11px] text-slate-400">ขาย {num(s.sold30)}/30 วัน{s.cover_days != null && s.available > 0 ? ` · พอ ~${Math.max(1, Math.round(s.cover_days))} วัน` : ""}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="สถานะออเดอร์" icon="i:list-check" right={<span className="text-[11px] font-normal text-slate-400">{rangeLabel}</span>}>
                <div className="flex flex-wrap gap-1.5">
                  {d.byStatus.map((s) => (
                    <Link key={s.status} href={ordersHref} className={`rounded-lg px-2.5 py-1 text-xs ${ST_CLS[s.status] ?? "bg-slate-100 text-slate-600"} hover:opacity-80`}>{ST[s.status] ?? s.status} <b className="font-semibold">{num(s.count)}</b></Link>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {kpi.catalogUnmatched > 0 && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Icon value="i:link" />สินค้าบนแพลตฟอร์ม {num(kpi.catalogTotal)} รายการ · จับคู่ ERP แล้ว {num(kpi.catalogMatched)} · ยังไม่จับคู่ <b className="font-medium text-slate-800">{num(kpi.catalogUnmatched)}</b>
              <Link href="/master/platform-catalog" className="text-violet-700 hover:underline">ไปจับคู่ →</Link>
            </p>
          )}
        </div>
      )}

      {/* ตั้ง/แก้/ลบเป้ายอดขายเดือนนี้ */}
      {targetOpen && d && (
        <ERPModal open onClose={() => setTargetOpen(false)} size="sm" title={`เป้ายอดขาย ${shortMonth(d.month.ym)}${brandId ? ` · ${(d.filters.brands.find((b) => b.id === brandId)?.name) ?? ""}` : " · ทุกแบรนด์"}`}
          footer={
            <div className="flex items-center gap-2">
              {target && <button type="button" disabled={savingTarget} onClick={() => void saveTarget(true)} className="h-9 rounded-lg border border-rose-200 px-3 text-sm text-rose-700 hover:bg-rose-50">ลบเป้า</button>}
              <span className="flex-1" />
              <button type="button" onClick={() => setTargetOpen(false)} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">ยกเลิก</button>
              <button type="button" disabled={savingTarget || !(Number(targetVal) > 0)} onClick={() => void saveTarget(false)} className="h-9 rounded-lg bg-violet-600 px-4 text-sm text-white hover:bg-violet-700 disabled:opacity-50">บันทึก</button>
            </div>}>
          <label className="block text-sm text-slate-600">ยอดขายเป้าหมายทั้งเดือน (บาท · นับแบบราคาสินค้าหน้าร้าน)</label>
          <MoneyInput value={targetVal} onChange={setTargetVal} placeholder="เช่น 500,000" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3" autoFocus />
          <p className="mt-2 text-xs text-slate-500">ตอนนี้ได้ {baht(d.month.sales)} · แก้หรือลบเป้าได้ตลอด (เก็บประวัติการแก้ไว้)</p>
        </ERPModal>
      )}
    </div>
  );
}
