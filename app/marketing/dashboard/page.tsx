"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import {
  MOCK_SHOPEE_SALES,
  type OrderStatusKey,
  type StatusData,
  type HourlyPoint,
} from "@/lib/marketing/mock-data";

/* ---------- format helpers ---------- */
const nf = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const nf1 = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });
const baht = (n: number) => "฿" + n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const pct = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 }) + "%";
function thaiDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_ORDER: OrderStatusKey[] = ["paid", "confirmed", "all"];
const STATUS_HINT: Record<OrderStatusKey, string> = {
  paid: "จ่ายเงินจริงแล้ว — ใกล้เงินเข้าจริงที่สุด",
  confirmed: "ออเดอร์ที่ยืนยันแล้ว",
  all: "ทุกออเดอร์ที่กดสั่ง (รวมที่ยังไม่จ่าย/ยกเลิก)",
};

/* ================================================================== */

export default function MarketingDashboardPage() {
  const data = MOCK_SHOPEE_SALES;
  const [status, setStatus] = useState<OrderStatusKey>("paid");
  const s: StatusData = data.byStatus[status];

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3 max-w-6xl">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
                📊 Marketing Dashboard — Shopee
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                ข้อมูลตัวอย่าง (Mock)
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              ร้าน <span className="font-medium text-slate-700">{data.shop}</span> · ยอดขายวันที่{" "}
              <span className="font-medium text-slate-700">{thaiDate(data.date)}</span>
            </p>
          </div>
          <Link
            href="/marketing/import"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3.5 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            ⬆️ อัปไฟล์ Excel
          </Link>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-5 space-y-6 max-w-6xl">
        {/* Status selector */}
        <div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {STATUS_ORDER.map((k) => (
              <button
                key={k}
                onClick={() => setStatus(k)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  status === k
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {data.byStatus[k].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">{STATUS_HINT[status]}</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            accent
            label="ยอดขายรวม"
            value={baht(s.daily.gross_sales)}
            sub={`ไม่รวมส่วนลด Shopee: ${baht(s.daily.sales_excl_shopee_discount)}`}
          />
          <StatCard
            label="จำนวนออเดอร์"
            value={nf(s.daily.orders)}
            sub={`ยกเลิก ${nf(s.daily.cancelled_orders)} ออเดอร์`}
          />
          <StatCard
            label="ยอดเฉลี่ย/ออเดอร์"
            value={baht(s.daily.aov)}
            sub="AOV — Average Order Value"
          />
          <StatCard
            label="อัตราการซื้อ"
            value={pct(s.daily.conversion_rate)}
            sub={`คลิก ${nf(s.daily.clicks)} · ผู้เข้าชม ${nf(s.daily.visitors)}`}
          />
          <StatCard
            label="ผู้เข้าชมร้าน"
            value={nf(s.daily.visitors)}
            sub={`คลิกสินค้า ${nf(s.daily.clicks)} ครั้ง`}
          />
          <StatCard
            label="จำนวนผู้ซื้อ"
            value={nf(s.daily.buyers)}
            sub={`ใหม่ ${nf(s.daily.new_buyers)} · เดิม ${nf(s.daily.returning_buyers)}`}
          />
          <StatCard
            label="ยอดขายจากโฆษณา"
            value={baht(s.traffic.shopee_ads)}
            sub={`${pct((s.traffic.shopee_ads / s.daily.gross_sales) * 100)} ของยอดขาย · ยังไม่มีค่าโฆษณา`}
          />
          <StatCard
            label="ยอดที่ยกเลิก"
            value={baht(s.daily.cancelled_sales)}
            sub={`${nf(s.daily.cancelled_orders)} ออเดอร์ถูกยกเลิก`}
          />
        </div>

        {/* Hourly chart */}
        <HourlyChart hourly={s.hourly} />

        {/* Traffic + Top products */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <TrafficCard s={s} />
          </div>
          <div className="lg:col-span-3">
            <TopProductsTable s={s} />
          </div>
        </div>

        {/* footer note */}
        <p className="text-xs text-slate-400 leading-relaxed">
          หมายเหตุ: นี่คือหน้าตัวอย่าง ตัวเลขดึงจากไฟล์รายงานร้าน Shopee วันที่ 30 มิ.ย. 2026
          จริง แต่ยังไม่ต่อระบบอัปไฟล์อัตโนมัติ · ROAS จริงต้องใช้ไฟล์ค่าโฆษณา (Shopee Ads)
          เพิ่มอีกไฟล์ · รหัสสินค้าที่แสดงเป็นรหัสของ Shopee ยังไม่ผูกกับรหัสสินค้าในระบบเรา
        </p>
      </div>
    </PlaygroundShell>
  );
}

/* ================================================================== */
/* Sub-components                                                       */
/* ================================================================== */

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={`mt-1 text-2xl sm:text-3xl font-bold tabular-nums ${
          accent ? "text-blue-700" : "text-slate-800"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-[11px] text-slate-400 leading-snug">{sub}</div> : null}
    </div>
  );
}

type HourMetric = "gross_sales" | "orders" | "visitors";
const HOUR_METRICS: { key: HourMetric; label: string }[] = [
  { key: "gross_sales", label: "ยอดขาย" },
  { key: "orders", label: "ออเดอร์" },
  { key: "visitors", label: "ผู้เข้าชม" },
];

function HourlyChart({ hourly }: { hourly: HourlyPoint[] }) {
  const [metric, setMetric] = useState<HourMetric>("gross_sales");
  const max = Math.max(1, ...hourly.map((h) => h[metric]));
  const peak = hourly.reduce((a, b) => (b[metric] > a[metric] ? b : a), hourly[0]);

  const fmt = (v: number) => (metric === "gross_sales" ? baht(v) : nf(v));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">ยอดขายรายชั่วโมง</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ชั่วโมงที่พีค: {String(peak.hour).padStart(2, "0")}:00 ({fmt(peak[metric])})
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
          {HOUR_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                metric === m.key ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-[3px] sm:gap-1.5 h-44">
        {hourly.map((h) => {
          const v = h[metric];
          const heightPct = (v / max) * 100;
          return (
            <div
              key={h.hour}
              className="flex-1 flex flex-col items-center justify-end min-w-0 group relative"
              title={`${String(h.hour).padStart(2, "0")}:00 — ${fmt(v)}`}
            >
              <div
                className="w-full rounded-t bg-blue-500 group-hover:bg-blue-600 transition-colors"
                style={{ height: `${Math.max(2, heightPct)}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* hour axis (every 3h) */}
      <div className="flex gap-[3px] sm:gap-1.5 mt-1.5">
        {hourly.map((h) => (
          <div key={h.hour} className="flex-1 text-center text-[9px] text-slate-400 min-w-0">
            {h.hour % 3 === 0 ? String(h.hour).padStart(2, "0") : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrafficCard({ s }: { s: StatusData }) {
  const t = s.traffic;
  const rows = [
    { label: "หน้ารายละเอียดสินค้า", value: t.product_page, color: "bg-blue-500" },
    { label: "พาร์ทเนอร์ / Affiliate", value: t.partner, color: "bg-violet-500" },
    { label: "Live ของร้านค้า", value: t.live, color: "bg-rose-500" },
    { label: "วิดีโอของร้านค้า", value: t.video, color: "bg-emerald-500" },
  ].sort((a, b) => b.value - a.value);
  const total = Math.max(1, t.total);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 h-full">
      <h2 className="text-sm font-semibold text-slate-700">ที่มาของยอดขาย</h2>
      <p className="text-xs text-slate-400 mt-0.5 mb-4">ยอดขายมาจากช่องทางไหนบ้าง</p>

      <div className="space-y-3">
        {rows.map((r) => {
          const p = (r.value / total) * 100;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-600">{r.label}</span>
                <span className="tabular-nums text-slate-500">
                  {baht(r.value)} · {nf1(p)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${r.color}`} style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
        <div className="text-xs text-amber-800">
          ในยอดขายนี้ มาจาก <span className="font-semibold">โฆษณา Shopee Ads</span>
        </div>
        <div className="text-lg font-bold text-amber-900 tabular-nums mt-0.5">
          {baht(t.shopee_ads)}{" "}
          <span className="text-xs font-normal text-amber-700">
            ({nf1((t.shopee_ads / total) * 100)}% ของยอด)
          </span>
        </div>
        <div className="text-[11px] text-amber-600 mt-0.5">
          * ยังคำนวณ ROAS ไม่ได้ ต้องมีไฟล์ &quot;ค่าโฆษณา&quot; เพิ่ม
        </div>
      </div>
    </div>
  );
}

function TopProductsTable({ s }: { s: StatusData }) {
  const products = [...s.products].sort((a, b) => b.sales - a.sales);
  const maxShare = Math.max(1, ...products.map((p) => p.sales_share));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">สินค้าขายดี (Top SKU)</h2>
          <p className="text-xs text-slate-400 mt-0.5">เรียงตามยอดขาย</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-medium">
          รหัส Shopee (ยังไม่ผูก SKU ระบบ)
        </span>
      </div>

      <div className="space-y-2.5">
        {products.map((p, i) => (
          <div
            key={p.marketplace_item_id}
            className="flex items-center gap-3 rounded-lg border border-slate-100 hover:border-slate-200 px-3 py-2.5 transition-colors"
          >
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-700 truncate" title={p.product_name}>
                {p.product_name}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-400 tabular-nums">
                  #{p.marketplace_item_id}
                </span>
                <div className="h-1.5 flex-1 max-w-[120px] rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${(p.sales_share / maxShare) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-sm font-semibold text-slate-800 tabular-nums">
                {baht(p.sales)}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">
                {nf(p.orders)} ออเดอร์ · ซื้อ {pct(p.conversion_rate)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
