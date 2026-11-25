"use client";

/**
 * แท็บ "โปรโมชั่น" ของหน้าภาพรวมการตลาด — ข้อมูลจาก /api/marketing/promos (โหลดเมื่อเปิดแท็บ)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 6 · แบบ A + ข้อ 1 ดึงรายการโปร · 2 ผลของแต่ละโปร · 3 แยกโค้ดส่วนลดร้าน · 4 ส่วนลดที่ Shopee ช่วยออก)
 * อ่านอย่างเดียว (ไม่สร้าง/แก้โปร) · ปุ่ม "ดึงตอนนี้" อ่านจากร้านอย่างเดียว
 * ของกลาง: DataTable (มุมมอง/ส่งออก Excel) · SimpleBarChart · Icon · useToast · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { SimpleBarChart } from "@/components/bar-chart";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { TH_MONTHS } from "@/lib/date-range";
import { EFFECT_META, type PromoEffect } from "@/lib/marketing-promos-calc";

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 10_000 ? `฿${(n / 1_000).toFixed(1)}K` : baht(n));
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const signPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`);
const bkk = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 7 * 3_600_000).toISOString() : null);
const dt = (iso: string | null) => { const t = bkk(iso); return t ? `${+t.slice(8, 10)} ${TH_MONTHS[+t.slice(5, 7) - 1]} ${t.slice(11, 16)}` : "—"; };
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;

const KIND: Record<string, { label: string; cls: string }> = {
  voucher: { label: "โค้ดส่วนลด", cls: "bg-violet-50 text-violet-700" },
  discount: { label: "ลดราคา", cls: "bg-sky-50 text-sky-700" },
  flash_sale: { label: "แฟลชเซล", cls: "bg-orange-50 text-orange-700" },
};
const EFF_CLS: Record<PromoEffect, string> = {
  worked: "bg-emerald-50 text-emerald-700", flat: "bg-slate-100 text-slate-600", failed: "bg-rose-50 text-rose-700",
  always_on: "bg-slate-50 text-slate-400", no_data: "bg-slate-50 text-slate-400", upcoming: "bg-amber-50 text-amber-700",
};
const PURPOSE: Record<number, string> = { 0: "ทั่วไป", 1: "ต้อนรับ", 2: "แนะนำเพื่อน", 3: "ผู้ติดตามร้าน", 4: "เกมร้าน", 5: "ของแถม", 6: "สมาชิก" };

type Promo = {
  kind: string; promo_id: string; name: string | null; code: string | null; status: string | null; start_at: string | null; end_at: string | null;
  usage_quantity: number | null; current_usage: number | null; discount_amount: number | null; percentage: number | null; reward_type: number | null; purpose: number | null;
  item_count: number | null; remind_count: number | null; click_count: number | null; brand_name: string;
  effect: PromoEffect; days: number; avgDuring: number | null; avgBefore: number | null; lift: number | null; overlaps: number; usagePct: number | null; costEstimate: number | null;
};
type Resp = {
  range: { from: string; to: string }; today: string;
  kpi: { count: number; byKind: { voucher: number; discount: number; flash_sale: number }; voucherUses: number; voucherQuota: number; sellerVoucher: number; voucherCovered: number; sellerVoucherPct: number | null; shopeeFunded: number; shopeeFundedPct: number | null; incomeOrders: number; orders: number; sales: number; worked: number; failed: number };
  promos: Promo[]; daily: { date: string; sales: number; shopeeFunded: number }[]; lastSync: string | null; notes: string[]; error: string | null;
};

function Card({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
const promoTitle = (p: Promo) => p.name || p.code || (p.kind === "flash_sale" ? `แฟลชเซล ${dt(p.start_at)}` : `#${p.promo_id}`);
const promoDetail = (p: Promo) => {
  if (p.kind === "voucher") {
    const reward = p.reward_type === 1 && p.discount_amount != null ? `ลด ${baht(p.discount_amount)}` : p.reward_type === 2 && p.percentage != null ? `ลด ${p.percentage}%` : p.reward_type === 3 && p.percentage != null ? `คืน coins ${p.percentage}%` : "";
    return [p.code, reward, p.purpose != null ? PURPOSE[p.purpose] : null].filter(Boolean).join(" · ");
  }
  if (p.kind === "flash_sale") return `${num(p.item_count ?? 0)} สินค้า${p.remind_count ? ` · กดเตือน ${num(p.remind_count)}` : ""}${p.click_count ? ` · คลิก ${num(p.click_count)}` : ""}`;
  return p.brand_name;
};

export function PromosTab({ from, to, brandId, reloadKey }: { from: string; to: string; brandId: string; reloadKey: number }) {
  const toast = useToast();
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const q = new URLSearchParams({ from, to });
    if (brandId) q.set("brand_id", brandId);
    try {
      const res = await apiFetch(`/api/marketing/promos?${q}`);
      const j = (await res.json()) as Resp;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ");
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [from, to, brandId]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const syncNow = async () => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/cron/marketing-promos", { method: "POST" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(j.summary || "ดึงรายการโปรแล้ว");
      void load();
    } catch (e) { toast.error(`ดึงรายการโปรไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setBusy(false); }
  };

  const cols = useMemo<ColumnDef<Promo>[]>(() => [
    { accessorKey: "name", header: "โปร", cell: ({ row }) => (
      <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{promoTitle(row.original)}</span><span className="block truncate text-xs text-slate-500">{promoDetail(row.original)}</span></span>
    ) },
    { accessorKey: "kind", header: "ชนิด", cell: ({ row }) => <span className={`rounded px-1.5 py-0.5 text-xs ${KIND[row.original.kind]?.cls ?? ""}`}>{KIND[row.original.kind]?.label ?? row.original.kind}</span> },
    { accessorKey: "start_at", header: "ช่วงเวลา", cell: ({ row }) => <span className="text-xs">{dt(row.original.start_at)} – {dt(row.original.end_at)}</span> },
    { accessorKey: "lift", header: "ยอด/วัน เทียบปกติ", cell: ({ row }) => row.original.lift == null ? "—" : <span className={row.original.lift >= 0 ? "text-emerald-600" : "text-rose-600"} title={`ช่วงโปร ${baht(row.original.avgDuring ?? 0)}/วัน · ก่อนโปร ${baht(row.original.avgBefore ?? 0)}/วัน`}>{signPct(row.original.lift)}</span> },
    { accessorKey: "effect", header: "ผล", cell: ({ row }) => <span className={`rounded px-1.5 py-0.5 text-xs ${EFF_CLS[row.original.effect]}`}>{EFFECT_META[row.original.effect].label}</span> },
    { accessorKey: "overlaps", header: "ซ้อน", cell: ({ getValue }) => { const v = getValue() as number; return v ? <span className="text-xs text-amber-700" title="มีโปรอื่นช่วงเดียวกัน แยกผลไม่ได้">{v} โปร</span> : <span className="text-xs text-slate-400">—</span>; } },
    { accessorKey: "usagePct", header: "ใช้โค้ด", cell: ({ row }) => row.original.kind !== "voucher" ? "—" : <span title={row.original.costEstimate != null ? `ค่าโค้ดประมาณ ${baht(row.original.costEstimate)}` : undefined}>{num(row.original.current_usage ?? 0)}/{num(row.original.usage_quantity ?? 0)} <span className="text-xs text-slate-400">({pct(row.original.usagePct, 0)})</span></span> },
  ], []);
  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "worked", label: "ได้ผล", filter: (r) => (r as unknown as Promo).effect === "worked" },
    { id: "failed", label: "ไม่ได้ผล", filter: (r) => (r as unknown as Promo).effect === "failed" },
    { id: "voucher", label: "โค้ดส่วนลด", filter: (r) => (r as unknown as Promo).kind === "voucher" },
    { id: "flash", label: "แฟลชเซล", filter: (r) => (r as unknown as Promo).kind === "flash_sale" },
    { id: "upcoming", label: "กำลังจะเริ่ม", filter: (r) => (r as unknown as Promo).effect === "upcoming" },
  ], []);

  if (loading && !d) return <LoadingState label="กำลังรวมข้อมูลโปรโมชั่น…" />;
  if (err && !d) return <ErrorState title="โหลดข้อมูลโปรโมชั่นไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const k = d.kpi;
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 sm:px-4">
        <span className="inline-flex items-center gap-1.5"><Icon name="info" /> {d.lastSync ? `ดึงรายการโปรล่าสุด ${dt(d.lastSync)}` : "ยังไม่เคยดึงรายการโปร"} · ระบบดึงทุกเช้า 08:50 · เฉพาะ Shopee</span>
        <button type="button" disabled={busy} onClick={() => void syncNow()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon name="refresh" /> {busy ? "กำลังดึง…" : "ดึงตอนนี้"}</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="โปรในช่วงนี้" value={num(k.count)} sub={`โค้ด ${k.byKind.voucher} · ลดราคา ${k.byKind.discount} · แฟลชเซล ${k.byKind.flash_sale}`} />
        <Card label="โค้ดถูกใช้" value={`${num(k.voucherUses)} ครั้ง`} sub={k.voucherQuota ? `จาก ${num(k.voucherQuota)} สิทธิ์` : undefined} />
        <Card label="ส่วนลดจากโค้ดร้าน" value={k.voucherCovered ? bahtShort(k.sellerVoucher) : "—"} sub={k.voucherCovered ? `${pct(k.sellerVoucherPct)} ของยอด · ${num(k.voucherCovered)}/${num(k.orders)} ใบที่แยกแล้ว` : "เริ่มแยกจากใบใหม่ (รอตัวดึงค่าธรรมเนียม)"} />
        <Card label="Shopee ช่วยออกส่วนลด" value={bahtShort(k.shopeeFunded)} sub={`${pct(k.shopeeFundedPct)} ของยอด · จาก ${num(k.incomeOrders)} ใบที่ดึงรายได้แล้ว`} />
      </div>

      {d.daily.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-slate-800">ส่วนลดที่ Shopee ช่วยออก รายวัน</h2>
          <SimpleBarChart data={d.daily.map((x) => ({ key: x.date, label: shortDate(x.date), value: x.shopeeFunded, hint: `ยอดขาย ${baht(x.sales)} · Shopee ช่วย ${pct(x.sales ? x.shopeeFunded / x.sales : null)}` }))} format={bahtShort} height={170} barColor="#f97316" barHoverColor="#ea580c" ariaLabel="ส่วนลดที่ Shopee ช่วยออกรายวัน" />
          <p className="mt-2 text-xs text-slate-400">วันที่ Shopee ช่วยออกเยอะ = Shopee กำลังอุดหนุนแคมเปญ — ควรร่วมแคมเปญ/เติมสต็อกช่วงนั้น</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        {d.promos.length ? (
          <DataTable<Promo> tableId="marketing-promos" data={d.promos} columns={cols} views={views} pageSize={25}
            searchableKeys={["name", "code", "brand_name"]} searchPlaceholder="ค้นหาชื่อโปร / โค้ด…"
            exportFilename="marketing-promos" exportEntityType="marketing_overview" emptyMessage="ไม่มีโปรในช่วงนี้" />
        ) : <EmptyState title="ยังไม่มีรายการโปรในช่วงนี้" hint="ตัวดึงทำงานทุกเช้า 08:50 — หรือกด “ดึงตอนนี้” ด้านบน" />}
        {k.worked + k.failed > 0 && <p className="mt-2 px-2 text-xs text-slate-500">ได้ผล {k.worked} โปร · ไม่ได้ผล {k.failed} โปร</p>}
      </div>

      <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {d.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}
      </ul>
    </div>
  );
}
