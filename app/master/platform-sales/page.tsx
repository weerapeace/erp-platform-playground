"use client";

// ============================================================
// 📈 สินค้าที่ขายได้บนแพลตฟอร์ม (รายเดือน / รายวัน) — /master/platform-sales  (?date=YYYY-MM-DD = เปิดดูรายวัน)
// ข้อมูล: ออเดอร์จากแพลตฟอร์มทุกแหล่ง (เมล Shopee/Lazada ที่สคริปต์ Gmail ส่งเข้ามา + ไฟล์ + API) → /api/platform-sales/report
//   ตัวนับ = ของกลาง lib/platform-sales/server (ตัวเดียวกับรายงานอัตโนมัติรายวัน Gmail / LINE / Discord)
// รายเดือน: ตัวเลขสรุป + ตาราง "ยอดรายวัน" (กดวันไหน = เปิดดูวันนั้น) + สินค้าที่ขายได้ · รายวัน: เทียบวันก่อนหน้า
// ของกลาง: MonthNav · DateInput · MiniTable · SoldProductsTable (ตารางเดียวกับสรุปยอดขายรายเดือน) · exportTable
// ตั้งค่า/สถานะการดึงเมล: /admin/platform-email · ส่งสรุปรายวันอัตโนมัติ: /admin/email-reports · เอกสาร docs/platform-email-orders.md
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { MonthNav } from "@/components/month-nav";
import { DateInput } from "@/components/date-input";
import { ERPSelect } from "@/components/form";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { useReportOptions } from "@/components/report-sections";
import { SoldProductsTable } from "@/components/sold-products-table";
import { DEFAULT_PRODUCT_OPTIONS, mergeProducts, type SoldProduct } from "@/lib/sold-products";
import { monthLabelTh, thisMonth } from "@/lib/month";
import { exportTable } from "@/lib/export";
import { apiFetch } from "@/lib/api";

type Summary = { orders: number; cancelled: number; qty: number; amount: number; no_price_orders: number; pending_items: number; returns: number; from_email: number };
type DailyTotal = { date: string; orders: number; cancelled: number; qty: number; amount: number };
type Report = {
  month: string;
  date: string | null;
  platforms: { id: string; code: string; name_th: string }[];
  brands: { id: string; name: string }[];
  summary: Summary;
  prev: { orders: number; qty: number; amount: number } | null;
  by_shop: { shop: string; orders: number; qty: number; amount: number }[];
  daily: DailyTotal[];
  products: SoldProduct[];
};

const baht = (n: number) => `฿${Math.round(n || 0).toLocaleString("th-TH")}`;
const num = (n: number) => (n || 0).toLocaleString("th-TH");
/** วันที่ไทย "YYYY-MM-DD" (shift = -1 → เมื่อวาน) — ใช้ Date.UTC เลี่ยงกับดัก timezone */
const thaiDate = (shift = 0) => new Date(Date.now() + 7 * 3600_000 + shift * 86400_000).toISOString().slice(0, 10);
const shiftDate = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const dateLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const vsPrev = (cur: number, prev: number | undefined) => {
  if (prev === undefined) return undefined;
  if (!prev) return `วันก่อน ${num(prev)}`;
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p >= 0 ? "+" : ""}${p}% จากวันก่อน (${num(prev)})`;
};

function Kpi({ label, value, hint, tone = "slate" }: { label: string; value: string; hint?: string; tone?: "slate" | "emerald" | "amber" | "rose" }) {
  const color = { slate: "text-slate-800", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700" }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

export default function PlatformSalesPage() {
  const canView = usePermission("platform_orders.view");
  const canManage = usePermission("platform_orders.manage");
  const { can } = useAuth();
  const [mode, setMode] = useState<"month" | "day">("month");
  const [month, setMonth] = useState(thisMonth());
  const [date, setDate] = useState(thaiDate(-1));
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { opts, set } = useReportOptions("platform_sales_products", { ...DEFAULT_PRODUCT_OPTIONS, grouped: false });

  // ลิงก์จากรายงานอัตโนมัติ: ?date=YYYY-MM-DD → เปิดดูรายวัน (อ่านจาก URL เอง — เลี่ยง useSearchParams ที่ทำ prerender พัง)
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setDate(d); setMode("day"); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams(mode === "day" ? { date } : { month });
      if (platformId) q.set("platform_id", platformId);
      if (brandId) q.set("brand_id", brandId);
      const res = await apiFetch(`/api/platform-sales/report?${q}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setRep(j as Report);
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, [mode, date, month, platformId, brandId]);
  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const openDay = (d: string) => { setDate(d); setMode("day"); };
  const periodLabel = mode === "day" ? dateLabel(date) : `เดือน ${monthLabelTh(month)}`;

  const doExport = async () => {
    if (!rep) return;
    const rows = (opts.grouped ? rep.products : mergeProducts(rep.products)) as unknown as Record<string, unknown>[];
    try {
      await exportTable({
        format: "excel", filename: `platform-sales-${mode === "day" ? date : rep.month}`, rows,
        columns: [
          ...(opts.grouped ? [{ key: "customer", header: "ร้าน" }] : []),
          { key: "sku", header: "รหัส" }, { key: "name", header: "สินค้า" }, { key: "qty", header: "จำนวน (ชิ้น)" }, { key: "amt", header: "ยอด (บาท)" },
        ],
        context: { entityType: "platform_orders", mode: "filtered_all", totalRows: rows.length, filterDesc: `สินค้าที่ขายได้บนแพลตฟอร์ม ${mode === "day" ? date : rep.month}` },
        can: (perm: string) => can(perm as Parameters<typeof can>[0]),
      });
    } catch (e) { setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ"); }
  };

  const dailyCols: MiniColumn<DailyTotal>[] = [
    { key: "date", header: "วันที่", width: "1fr", sortValue: (r) => r.date, cell: (r) => <span className="font-medium text-slate-700">{dayShort(r.date)}</span> },
    { key: "orders", header: "ออเดอร์", width: "6rem", align: "right", sortValue: (r) => r.orders, cell: (r) => <span className="tabular-nums">{num(r.orders)}</span> },
    { key: "qty", header: "ชิ้น", width: "6rem", align: "right", sortValue: (r) => r.qty, cell: (r) => <span className="tabular-nums">{num(r.qty)}</span> },
    { key: "amount", header: "ยอด (บาท)", width: "8rem", align: "right", sortValue: (r) => r.amount, cell: (r) => <span className="font-mono tabular-nums text-slate-800">{baht(r.amount)}</span> },
    { key: "cancelled", header: "ยกเลิก", width: "5rem", align: "right", sortValue: (r) => r.cancelled, cell: (r) => <span className="tabular-nums text-slate-400">{r.cancelled ? num(r.cancelled) : "—"}</span> },
    { key: "open", header: "", width: "5.5rem", align: "right", cell: () => <span className="text-xs font-medium text-blue-600">ดูรายวัน →</span> },
  ];

  if (!canView) return <PlaygroundShell><AccessDenied message="หน้านี้สำหรับผู้มีสิทธิ์ดูออเดอร์จากแพลตฟอร์ม (platform_orders.view)" /></PlaygroundShell>;
  const s = rep?.summary;
  const prev = mode === "day" ? rep?.prev ?? null : null;

  return (
    <PlaygroundShell>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">📈 สินค้าที่ขายได้บนแพลตฟอร์ม</h1>
            <p className="mt-0.5 text-sm text-slate-500">สรุปรายเดือน / รายวัน จากออเดอร์ Shopee / Lazada (เมลแจ้งออเดอร์ที่ระบบอ่านให้อัตโนมัติ + ไฟล์ที่อัปเอง) — ไม่นับออเดอร์ที่ยกเลิก</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-9 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
              {([["month", "รายเดือน"], ["day", "รายวัน"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMode(k)} className={`px-3 ${mode === k ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}>{l}</button>
              ))}
            </div>
            {mode === "month" ? <MonthNav value={month} onChange={setMonth} /> : (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setDate(shiftDate(date, -1))} aria-label="วันก่อนหน้า" className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">‹</button>
                <div className="w-36"><DateInput value={date} onChange={(v) => v && setDate(v)} /></div>
                <button type="button" onClick={() => setDate(shiftDate(date, 1))} aria-label="วันถัดไป" className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">›</button>
                {date !== thaiDate(-1) && <button type="button" onClick={() => setDate(thaiDate(-1))} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50">เมื่อวาน</button>}
              </div>
            )}
            <button onClick={() => void doExport()} disabled={!rep?.products.length}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50 disabled:opacity-50">⬇ Excel</button>
            <Link href="/master/platform-orders" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50">📥 ออเดอร์</Link>
            {canManage && <Link href="/admin/platform-email" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50">📧 ตั้งค่าดึงจากเมล</Link>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500"><b className="text-slate-700">{periodLabel}</b></span>
          <div className="w-40"><ERPSelect value={platformId} onChange={(e) => setPlatformId(e.target.value)} options={[{ value: "", label: "ทุกแพลตฟอร์ม" }, ...(rep?.platforms ?? []).map((p) => ({ value: p.id, label: p.name_th }))]} /></div>
          <div className="w-44"><ERPSelect value={brandId} onChange={(e) => setBrandId(e.target.value)} options={[{ value: "", label: "ทุกแบรนด์" }, ...(rep?.brands ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></div>
          <Link href="/admin/email-reports" className="ml-auto text-xs text-blue-600 hover:underline">🔔 ตั้งส่งสรุปรายวันทาง Gmail / LINE / Discord →</Link>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {error} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>}

        {loading || !s ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="ออเดอร์" value={num(s.orders)} hint={prev ? vsPrev(s.orders, prev.orders) : s.cancelled ? `ยกเลิก ${num(s.cancelled)} ออเดอร์ (ไม่นับ)` : "ไม่มีออเดอร์ยกเลิก"} />
              <Kpi label="จำนวนที่ขายได้" value={`${num(s.qty)} ชิ้น`} hint={prev ? vsPrev(s.qty, prev.qty) : undefined} />
              <Kpi label="ยอดขายสินค้า" value={baht(s.amount)} hint={prev ? vsPrev(s.amount, prev.amount) : "ราคาสินค้า × จำนวน · ไม่รวมค่าส่ง · ยังไม่หักค่าธรรมเนียม"} tone="emerald" />
              {mode === "day"
                ? <Kpi label="ยกเลิก" value={num(s.cancelled)} hint="ไม่นับในยอด" tone={s.cancelled ? "rose" : "slate"} />
                : <Kpi label="คำขอคืนเงิน/คืนสินค้า" value={num(s.returns)} hint="ยังไม่หักจากยอด (เมลไม่บอกสินค้า)" tone={s.returns ? "amber" : "slate"} />}
            </div>

            {(s.pending_items > 0 || s.no_price_orders > 0) && (
              <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                {s.pending_items > 0 && (
                  <div>⚠️ มีสินค้า <b>{num(s.pending_items)}</b> รายการที่ระบบยังไม่รู้ว่าเป็น SKU ไหน — ยังนับในยอดอยู่ แต่โชว์เป็นชื่อจากร้าน (ท้ายชื่อมี &quot;ยังไม่จับคู่&quot;)
                    {canManage && <> · <Link href="/admin/platform-email?tab=pending" className="font-medium underline">ไปยืนยันสินค้า</Link></>}</div>
                )}
                {s.no_price_orders > 0 && <div>ℹ️ {num(s.no_price_orders)} ออเดอร์ไม่มีราคา (เมล Lazada ไม่บอกจำนวน/ราคา) — นับรายการละ 1 ชิ้น ยอดเงินเป็น 0</div>}
              </div>
            )}

            {rep.by_shop.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {rep.by_shop.map((b) => (
                  <div key={b.shop} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
                    <span className="font-medium text-slate-700">{b.shop}</span>
                    <span className="ml-2 text-slate-500">{num(b.orders)} ออเดอร์ · {num(b.qty)} ชิ้น · <span className="font-semibold text-slate-700">{baht(b.amount)}</span></span>
                  </div>
                ))}
              </div>
            )}

            {mode === "month" && rep.daily.length > 0 && (
              <MiniTable rows={rep.daily} columns={dailyCols} rowKey={(r) => r.date} hideSearch dense countUnit="วัน"
                title={<span className="text-sm font-semibold text-slate-800">ยอดรายวัน <span className="font-normal text-slate-400">— กดวันไหนเพื่อดูสินค้าที่ขายได้ของวันนั้น</span></span>}
                onRowClick={(r) => openDay(r.date)} maxHeightClass="max-h-[320px]" />
            )}

            {s.orders === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                <div className="font-medium text-slate-600">{periodLabel} ยังไม่มีออเดอร์จากแพลตฟอร์ม</div>
                <div className="mt-1 text-sm text-slate-500">
                  ถ้าเพิ่งเริ่มใช้ ตรวจว่าติดตั้งสคริปต์ใน Gmail แล้ว{canManage && <> ที่ <Link href="/admin/platform-email" className="text-blue-600 underline">หน้าตั้งค่าดึงออเดอร์จากเมล</Link></>}
                </div>
              </div>
            ) : (
              <SoldProductsTable products={rep.products} opts={opts} onChange={set} groupWord="ร้าน" printOptions={false} />
            )}
          </>
        )}
      </div>
    </PlaygroundShell>
  );
}
