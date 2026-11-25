"use client";

/**
 * แท็บ "คนเข้าร้าน" ของหน้าภาพรวมการตลาด — ข้อมูลจาก /api/marketing/traffic (โหลดเมื่อเปิดแท็บ)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 4 · แบบ A + ข้อ 1 เก็บยอดเข้าชมทุกวัน · 2 คนดูเยอะขายน้อย/ขายดีคนดูน้อย · 3 เตือนดาวตก · 4 เตือนคนดูพุ่ง)
 *   KPI · ช่องทางลูกค้า (เห็นโฆษณา → คลิก → เข้าดู → ซื้อ) · คนดูรายวัน · ตารางสินค้า (+ป้าย) · ดาวต่ำกว่า 4.5
 * ไม่มีอะไรให้สร้าง/แก้ในแท็บนี้ (อ่านอย่างเดียว) · ปุ่ม "เก็บตอนนี้" อ่านจากร้านอย่างเดียว
 * ของกลาง: DataTable (มุมมอง/ส่งออก Excel) · SimpleBarChart · HoverImage · Icon · useToast · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { SimpleBarChart } from "@/components/bar-chart";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { TH_MONTHS } from "@/lib/date-range";
import type { TrafficFlag } from "@/lib/marketing-traffic-calc";

const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const signPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`);
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;

const FLAG: Record<TrafficFlag, { label: string; cls: string; tip: string }> = {
  many_views_low_sales: { label: "คนดูเยอะ ขายน้อย", cls: "bg-amber-50 text-amber-700", tip: "ลองแก้รูปปก ราคา หรือรายละเอียด" },
  selling_low_views: { label: "ขายดี คนดูน้อย", cls: "bg-sky-50 text-sky-700", tip: "ควรลงโฆษณาเพิ่ม" },
};

type Item = { item_id: string; title: string; code: string; image: string | null; parentId: string | null; views: number; likes: number; newReviews: number; units: number; conv: number | null; rating: number | null; flag: TrafficFlag | null; totalReviews: number; totalLikes: number };
type Resp = {
  range: { from: string; to: string }; dataStart: string | null;
  kpi: { views: number; prevViews: number; change: number | null; likes: number; newReviews: number; units: number; conv: number | null; ratingAvg: number | null; days: number };
  funnel: { key: string; label: string; value: number }[];
  daily: { date: string; views: number }[];
  items: Item[]; lowRated: Item[]; notes: string[]; error: string | null;
};

function Card({ label, value, sub, subCls = "text-slate-500" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; subCls?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{value}</div>
      {sub != null && <div className={`mt-0.5 text-xs ${subCls}`}>{sub}</div>}
    </div>
  );
}

export function TrafficTab({ from, to, brandId, reloadKey }: { from: string; to: string; brandId: string; reloadKey: number }) {
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
      const res = await apiFetch(`/api/marketing/traffic?${q}`);
      const j = (await res.json()) as Resp;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ");
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [from, to, brandId]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const snapNow = async () => {
    setBusy(true);
    try {
      const j = await apiFetch("/api/cron/marketing-traffic", { method: "POST" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(j.summary || "เก็บยอดแล้ว");
      void load();
    } catch (e) { toast.error(`เก็บยอดไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setBusy(false); }
  };

  const cols = useMemo<ColumnDef<Item>[]>(() => [
    { accessorKey: "title", header: "สินค้า", cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-2">
        <HoverImage url={row.original.image} size={32} previewSize={240} fallback={<span className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-slate-400"><Icon name="package" /></span>} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-800">{row.original.code || row.original.title}</span>
          <span className="block truncate text-xs text-slate-500">{row.original.code ? row.original.title : `รหัสบนร้าน ${row.original.item_id}`}</span>
        </span>
      </span>
    ) },
    { accessorKey: "views", header: "คนดู", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "units", header: "ขาย (ชิ้น)", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "conv", header: "อัตราซื้อ", cell: ({ getValue }) => pct(getValue() as number | null) },
    { accessorKey: "flag", header: "ป้าย", cell: ({ row }) => row.original.flag ? <span title={FLAG[row.original.flag].tip} className={`rounded px-1.5 py-0.5 text-xs ${FLAG[row.original.flag].cls}`}>{FLAG[row.original.flag].label}</span> : null },
    { accessorKey: "likes", header: "กดถูกใจใหม่", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "rating", header: "ดาว", cell: ({ row }) => row.original.rating == null ? "—" : <span className={row.original.rating < 4.5 ? "text-rose-600" : ""}>{row.original.rating.toFixed(2)} <span className="text-xs text-slate-400">({num(row.original.totalReviews)})</span></span> },
    { accessorKey: "newReviews", header: "รีวิวใหม่", cell: ({ getValue }) => num(getValue() as number) },
  ], []);
  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "low_sales", label: "คนดูเยอะ ขายน้อย", filter: (r) => (r as unknown as Item).flag === "many_views_low_sales" },
    { id: "low_views", label: "ขายดี คนดูน้อย", filter: (r) => (r as unknown as Item).flag === "selling_low_views" },
    { id: "low_rating", label: "ดาวต่ำกว่า 4.5", filter: (r) => { const x = r as unknown as Item; return x.rating != null && x.rating < 4.5; } },
  ], []);

  if (loading && !d) return <LoadingState label="กำลังรวมยอดคนดู…" />;
  if (err && !d) return <ErrorState title="โหลดข้อมูลคนเข้าร้านไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const k = d.kpi;
  const top = Math.max(1, ...d.funnel.map((f) => f.value));
  const noDays = k.days === 0;
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 sm:px-4">
        <span className="inline-flex items-center gap-1.5"><Icon name="info" /> {d.dataStart ? `เริ่มเก็บยอดคนดูเมื่อ ${shortDate(d.dataStart)} · ระบบเก็บทุกเที่ยงคืน` : "ยังไม่เริ่มเก็บยอดคนดู"} · เฉพาะ Shopee</span>
        <button type="button" disabled={busy} onClick={() => void snapNow()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon name="refresh" /> {busy ? "กำลังเก็บ…" : "เก็บตอนนี้"}</button>
      </div>

      {noDays ? (
        <EmptyState title="ยอดคนดูรายวันจะขึ้นหลังเก็บครบ 2 วัน" hint="Shopee ให้แค่ยอดสะสม ระบบจึงต้องเก็บ 2 วันติดกันแล้วลบกัน — ระหว่างนี้ตารางด้านล่างแสดงดาวและรีวิวล่าสุดได้" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label={`คนเข้าดูสินค้า (${k.days} วัน)`} value={num(k.views)} sub={k.change != null ? `${signPct(k.change)} จากช่วงก่อน` : undefined} subCls={k.change == null ? "text-slate-500" : k.change >= 0 ? "text-emerald-600" : "text-rose-600"} />
            <Card label="อัตราซื้อ" value={pct(k.conv, 2)} sub={`ขาย ${num(k.units)} ชิ้น ÷ คนดู`} />
            <Card label="กดถูกใจใหม่" value={num(k.likes)} />
            <Card label="ดาวรีวิวเฉลี่ย" value={k.ratingAvg == null ? "—" : k.ratingAvg.toFixed(2)} sub={`รีวิวใหม่ ${num(k.newReviews)}`} subCls={k.ratingAvg != null && k.ratingAvg < 4.5 ? "text-rose-600" : "text-slate-500"} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-medium text-slate-800">เส้นทางลูกค้า (Shopee)</h2>
            <div className="space-y-2">
              {d.funnel.map((f, i) => {
                const prev = i > 0 ? d.funnel[i - 1].value : 0;
                return (
                  <div key={f.key} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-slate-500 sm:w-28">{f.label}</span>
                    <div className="min-w-0 flex-1"><div className="flex h-7 items-center rounded bg-violet-500 px-2 text-xs text-white" style={{ width: `${Math.max(8, (Math.log10(f.value + 1) / Math.log10(top + 1)) * 100)}%` }}>{num(f.value)}</div></div>
                    <span className="w-16 shrink-0 text-right text-xs text-slate-400">{i > 0 && prev > 0 && f.key !== "views" ? pct(f.value / prev) : ""}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400">แถบยาวตามสเกล log (ตัวเลขต่างกันมาก) · “เข้าดูสินค้า” รวมคนที่มาจากทุกทาง ไม่ใช่แค่จากโฆษณา</p>
          </div>

          {d.daily.length > 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-medium text-slate-800">คนดูรายวัน</h2>
              <SimpleBarChart data={d.daily.map((x) => ({ key: x.date, label: shortDate(x.date), value: x.views }))} format={(v) => num(v)} height={180} barColor="#8b5cf6" barHoverColor="#7c3aed" ariaLabel="คนดูรายวัน" />
            </div>
          )}
        </>
      )}

      {d.lowRated.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 sm:p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-rose-800"><Icon name="warning" /> ดาวต่ำกว่า 4.5 ({d.lowRated.length})</h2>
          <ul className="mt-2 divide-y divide-rose-100 text-sm">
            {d.lowRated.slice(0, 10).map((i) => (
              <li key={i.item_id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{i.code ? `${i.code} · ` : ""}{i.title}</span>
                <span className="shrink-0 text-rose-700">{i.rating?.toFixed(2)} <span className="text-xs text-slate-400">({num(i.totalReviews)} รีวิว)</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <DataTable<Item> tableId="marketing-traffic-items" data={d.items} columns={cols} views={views} pageSize={25}
          searchableKeys={["title", "code", "item_id"]} searchPlaceholder="ค้นหาชื่อ / รหัสสินค้า…"
          exportFilename="marketing-traffic" exportEntityType="marketing_overview" emptyMessage="ยังไม่มีข้อมูลสินค้า — กด “เก็บตอนนี้” เพื่อเริ่ม" />
      </div>

      <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {d.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}
      </ul>
    </div>
  );
}
