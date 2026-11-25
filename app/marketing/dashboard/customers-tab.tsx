"use client";

/**
 * แท็บ "ลูกค้า" ของหน้าภาพรวมการตลาด — ข้อมูลจาก /api/marketing/customers (โหลดเมื่อเปิดแท็บ)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-25 (แผนการตลาด รอบ 5 · แบบ A + ข้อ 1 กลุ่มลูกค้า · 2 ซื้อคู่กัน · 3 สินค้าที่ทำให้กลับมาซื้อ · 4 ตาราง+ส่งออกรายชื่อ)
 * อ่านอย่างเดียว (ไม่มีอะไรให้สร้าง/แก้) · ชื่อลูกค้าเห็นเฉพาะคนมีสิทธิ์ดูออเดอร์ (API ส่งรหัสแทนให้คนอื่น)
 * ของกลาง: DataTable (มุมมองตามกลุ่ม/ส่งออก Excel) · HoverImage · PlatformIcon · Icon · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { HoverImage } from "@/components/hover-image";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { TH_MONTHS } from "@/lib/date-range";
import { SEGMENTS, type Segment } from "@/lib/marketing-customers-calc";

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 10_000 ? `฿${(n / 1_000).toFixed(1)}K` : baht(n));
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;

const SEG_CLS: Record<Segment, string> = {
  champion: "text-emerald-700 bg-emerald-50", loyal: "text-sky-700 bg-sky-50", new: "text-violet-700 bg-violet-50",
  at_risk: "text-amber-700 bg-amber-50", one_time: "text-slate-600 bg-slate-100",
};

type Info = { code: string; name: string; image: string | null };
type Row = { key: string; name: string; platform: string; platform_name: string; brand_name: string; orders: number; visits: number; spend: number; aov: number; first: string; last: string; daysSince: number; segment: Segment };
type Resp = {
  range: { from: string; to: string }; dataStart: string; namesVisible: boolean;
  kpi: { customers: number; newCustomers: number; returning: number; sales: number; perCustomer: number; returningShare: number; repeatRate: number; medianGap: number | null };
  weekly: { week: string; newCustomers: number; returning: number }[];
  segments: { key: Segment; label: string; hint: string; customers: number; spend: number }[];
  customers: Row[];
  pairs: { a: string; b: string; count: number; confAB: number; confBA: number; aInfo: Info; bInfo: Info }[];
  multiOrders: number; rangeOrders: number;
  firstProducts: { product: string; customers: number; repeated: number; rate: number; info: Info }[];
  notes: string[]; error: string | null;
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
const Thumb = ({ info }: { info: Info }) => (
  <HoverImage url={info.image} size={28} previewSize={220} fallback={<span className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-slate-400"><Icon name="package" /></span>} />
);
const prodLabel = (i: Info) => i.code || i.name || "—";

export function CustomersTab({ from, to, platformId, brandId, reloadKey }: { from: string; to: string; platformId: string; brandId: string; reloadKey: number }) {
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const q = new URLSearchParams({ from, to });
    if (platformId) q.set("platform_id", platformId);
    if (brandId) q.set("brand_id", brandId);
    try {
      const res = await apiFetch(`/api/marketing/customers?${q}`);
      const j = (await res.json()) as Resp;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ");
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [from, to, platformId, brandId]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  const cols = useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: "name", header: "ลูกค้า", cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-1.5"><PlatformIcon code={row.original.platform} size={14} />
        <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{row.original.name}</span><span className="block truncate text-xs text-slate-500">{row.original.brand_name}</span></span></span>
    ) },
    { accessorKey: "segment", header: "กลุ่ม", cell: ({ row }) => <span className={`rounded px-1.5 py-0.5 text-xs ${SEG_CLS[row.original.segment]}`}>{SEGMENTS[row.original.segment].label}</span> },
    { accessorKey: "orders", header: "ซื้อ (ครั้ง)", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "spend", header: "ยอดรวม", cell: ({ getValue }) => baht(getValue() as number) },
    { accessorKey: "aov", header: "ต่อครั้ง", cell: ({ getValue }) => baht(getValue() as number) },
    { accessorKey: "first", header: "ซื้อครั้งแรก", cell: ({ getValue }) => shortDate(getValue() as string) },
    { accessorKey: "last", header: "ซื้อล่าสุด", cell: ({ row }) => <span>{shortDate(row.original.last)} <span className="text-xs text-slate-400">({row.original.daysSince} วัน)</span></span> },
  ], []);
  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    ...(Object.keys(SEGMENTS) as Segment[]).map((s) => ({ id: s, label: SEGMENTS[s].label, filter: (r: unknown) => (r as Row).segment === s })),
    { id: "repeat", label: "กลับมาซื้อ (2 วันขึ้นไป)", filter: (r: unknown) => (r as Row).visits >= 2 },
  ], []);

  if (loading && !d) return <LoadingState label="กำลังรวมข้อมูลลูกค้า…" />;
  if (err && !d) return <ErrorState title="โหลดข้อมูลลูกค้าไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const k = d.kpi;
  const wkMax = Math.max(1, ...d.weekly.map((w) => w.newCustomers + w.returning));
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="ลูกค้าในช่วงนี้" value={num(k.customers)} sub={`ใหม่ ${num(k.newCustomers)} · กลับมา ${num(k.returning)}`} />
        <Card label="ซื้อซ้ำ (ทั้งหมดที่รู้จัก)" value={pct(k.repeatRate)} sub={k.medianGap != null ? `กลับมาซื้อครั้งที่ 2 ภายใน ~${k.medianGap} วัน` : "ยังไม่มีคนซื้อซ้ำ"} />
        <Card label="ยอดต่อลูกค้า" value={baht(k.perCustomer)} sub={`ยอดรวม ${bahtShort(k.sales)}`} />
        <Card label="ยอดจากลูกค้าเก่า" value={pct(k.returningShare)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <h2 className="mb-2 text-sm font-medium text-slate-800">กลุ่มลูกค้า (ณ วันนี้)</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {d.segments.map((s) => (
              <div key={s.key} className="rounded-lg border border-slate-200 p-2.5" title={s.hint}>
                <span className={`rounded px-1.5 py-0.5 text-xs ${SEG_CLS[s.key]}`}>{s.label}</span>
                <div className="mt-1 text-lg font-semibold text-slate-900">{num(s.customers)} <span className="text-xs font-normal text-slate-500">คน</span></div>
                <div className="text-xs text-slate-500">{bahtShort(s.spend)} · {s.hint}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">ดูรายชื่อแต่ละกลุ่มที่ตารางด้านล่าง (เลือกมุมมองตามกลุ่ม) แล้วกดส่งออก Excel ไปทำแคมเปญ</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-medium text-slate-800">ลูกค้าใหม่ vs กลับมา (รายสัปดาห์)</h2>
          {d.weekly.length ? (
            <div className="space-y-1.5">
              {d.weekly.map((w) => (
                <div key={w.week} className="flex items-center gap-2 text-xs">
                  <span className="w-14 shrink-0 text-slate-500">{shortDate(w.week)}</span>
                  <div className="flex h-5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                    <span className="bg-violet-400" style={{ width: `${(w.newCustomers / wkMax) * 100}%` }} title={`ใหม่ ${w.newCustomers}`} />
                    <span className="bg-emerald-500" style={{ width: `${(w.returning / wkMax) * 100}%` }} title={`กลับมา ${w.returning}`} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-slate-500">{num(w.newCustomers)} / {num(w.returning)}</span>
                </div>
              ))}
              <div className="flex gap-3 pt-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-400" /> ใหม่</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> กลับมาซื้อ</span></div>
            </div>
          ) : <EmptyState title="ยังไม่มีข้อมูลในช่วงนี้" />}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-medium text-slate-800">ซื้อคู่กันบ่อย</h2>
          <p className="mb-2 text-xs text-slate-500">{num(d.multiOrders)} จาก {num(d.rangeOrders)} ออเดอร์มีสินค้ามากกว่า 1 รุ่น · ใช้ทำโปรจับคู่/เซ็ต</p>
          {d.pairs.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.pairs.slice(0, 12).map((p) => (
                <li key={`${p.a}-${p.b}`} className="flex items-center gap-2 py-1.5">
                  <Thumb info={p.aInfo} /><span className="text-slate-400">+</span><Thumb info={p.bInfo} />
                  <span className="min-w-0 flex-1 truncate" title={`${p.aInfo.name} + ${p.bInfo.name}`}>{prodLabel(p.aInfo)} + {prodLabel(p.bInfo)}</span>
                  <span className="shrink-0 text-xs text-slate-500" title={`คนซื้อ ${prodLabel(p.aInfo)} แล้วซื้อ ${prodLabel(p.bInfo)} ด้วย ${pct(p.confAB, 0)}`}>{num(p.count)} ออเดอร์</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="ยังไม่มีคู่ที่ซื้อด้วยกันบ่อย (ต้องเจออย่างน้อย 3 ออเดอร์)" hint="ลองเลือกช่วงวันที่ยาวขึ้น" />}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-medium text-slate-800">ชิ้นแรกตัวไหน ลูกค้ากลับมาซื้อ</h2>
          <p className="mb-2 text-xs text-slate-500">เฉพาะลูกค้าที่ซื้อครั้งแรกมาแล้ว 21 วันขึ้นไป · สินค้าละอย่างน้อย 5 คน</p>
          {d.firstProducts.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.firstProducts.slice(0, 12).map((f) => (
                <li key={f.product} className="flex items-center gap-2 py-1.5">
                  <Thumb info={f.info} />
                  <span className="min-w-0 flex-1 truncate" title={f.info.name}>{prodLabel(f.info)}</span>
                  <span className="shrink-0 text-xs text-slate-500">{num(f.repeated)}/{num(f.customers)} คน</span>
                  <span className="w-12 shrink-0 text-right font-medium text-emerald-700">{pct(f.rate, 0)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="ข้อมูลยังไม่พอ" hint="ต้องมีลูกค้าที่ซื้อครั้งแรกมานานพอ — จะแม่นขึ้นเรื่อย ๆ" />}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <DataTable<Row> tableId="marketing-customers" data={d.customers} columns={cols} views={views} pageSize={25}
          searchableKeys={["name", "brand_name", "platform_name"]} searchPlaceholder={d.namesVisible ? "ค้นหาชื่อลูกค้า…" : "ค้นหารหัสลูกค้า…"}
          exportFilename="marketing-customers" exportEntityType="marketing_overview" emptyMessage="ยังไม่มีลูกค้า" />
      </div>

      <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {d.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}
      </ul>
    </div>
  );
}
