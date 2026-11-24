"use client";

/**
 * แท็บ "ค่าธรรมเนียม" + "กำไร" ของหน้าภาพรวมการตลาด — ข้อมูลจาก /api/marketing/profit (โหลดเมื่อเปิดแท็บ)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 2 · แบบ A 2 แท็บแยก + ข้อเสนอ 1 ดึงค่าธรรมเนียมย้อนหลัง · 2 ขายดีแต่ไม่มีต้นทุน + ปุ่มไปกรอก · 4 เตือนค่าธรรมเนียมพุ่ง)
 *   ค่าธรรมเนียม: ยอด · ค่าธรรมเนียมจริง · % · เงินเข้าร้าน · แยกหมวด (แถบสี) · ดึงแล้วกี่ใบ (ตัวดึงทำงานทุก 30 นาที)
 *   กำไร (เฉพาะคนมีสิทธิ์ดูต้นทุน): กำไรต่อสินค้า · มีต้นทุนกี่ % ของยอด · ขายดีแต่ยังไม่มีต้นทุน → เปิดหน้ารุ่นไปกรอก
 * ของกลาง: DataTable (มุมมอง/ส่งออก Excel) · SimpleBarChart · HoverImage · PlatformIcon · Icon · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { HoverImage } from "@/components/hover-image";
import { SimpleBarChart } from "@/components/bar-chart";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { TH_MONTHS } from "@/lib/date-range";
import type { FeeCat } from "@/lib/marketing-profit-calc";

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 10_000 ? `฿${(n / 1_000).toFixed(1)}K` : baht(n));
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;

const CAT_COLOR: Record<FeeCat, string> = { commission: "#7c3aed", service: "#0d9488", transaction: "#ea580c", shipping: "#64748b", ads: "#db2777", other: "#a8a29e" };

type FeeRow = { platform: string; name_th: string; icon_key: string | null; supported: boolean; orders: number; covered: number; sales: number; salesCovered: number; fee: number; byCat: Record<FeeCat, number>; net: number; pct: number | null; estFeeAll: number | null };
type ProfitRowT = { key: string; parentId: string | null; parentName: string; code: string; name: string; image: string | null; sales: number; qty: number; fee: number; unitCost: number | null; cost: number | null; profit: number | null; margin: number | null };
type Missing = { parentId: string | null; parentName: string; sales: number; qty: number; skus: number; codes: string[]; href: string | null };
type ProfitResp = {
  range: { from: string; to: string };
  cats: { key: FeeCat; label: string }[];
  fees: FeeRow[];
  totals: { sales: number; salesSupported: number; salesCovered: number; fee: number; net: number; orders: number; covered: number; estFeeAll: number; pct: number | null };
  feeDaily: { date: string; fee: number; sales: number }[];
  profit: null | { rows: ProfitRowT[]; sales: number; salesWithCost: number; coverage: number; profit: number; cost: number; fee: number; margin: number | null; missing: Missing[]; missingTop20Share: number; unmatchedSales: number; unmatchedLines: number };
  restricted: boolean;
  error: string | null;
};

function useProfit(q: { from: string; to: string; platformId: string; brandId: string; reloadKey: number }) {
  const [d, setD] = useState<ProfitResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const p = new URLSearchParams({ from: q.from, to: q.to });
    if (q.platformId) p.set("platform_id", q.platformId);
    if (q.brandId) p.set("brand_id", q.brandId);
    try {
      const res = await apiFetch(`/api/marketing/profit?${p}`);
      const j = (await res.json()) as ProfitResp;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ");
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [q.from, q.to, q.platformId, q.brandId]);
  useEffect(() => { void load(); }, [load, q.reloadKey]);
  return { d, loading, err, load };
}

function Card({ label, value, sub, subCls = "text-slate-500", tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; subCls?: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold sm:text-2xl ${tone === "danger" ? "text-rose-600" : tone === "success" ? "text-emerald-600" : "text-slate-900"}`}>{value}</div>
      {sub != null && <div className={`mt-0.5 text-xs ${subCls}`}>{sub}</div>}
    </div>
  );
}

function CatBar({ byCat, cats }: { byCat: Record<FeeCat, number>; cats: { key: FeeCat; label: string }[] }) {
  const total = cats.reduce((a, c) => a + (byCat[c.key] || 0), 0);
  if (!(total > 0)) return <div className="h-2 rounded bg-slate-100" />;
  return (
    <div className="flex h-2 overflow-hidden rounded bg-slate-100" title={cats.filter((c) => byCat[c.key] > 0).map((c) => `${c.label} ${baht(byCat[c.key])}`).join(" · ")}>
      {cats.map((c) => byCat[c.key] > 0 && <span key={c.key} style={{ width: `${(byCat[c.key] / total) * 100}%`, background: CAT_COLOR[c.key] }} />)}
    </div>
  );
}

type Props = { from: string; to: string; platformId: string; brandId: string; reloadKey: number };

// ═════════════════════════ แท็บ ค่าธรรมเนียม ═════════════════════════

export function FeesTab(props: Props) {
  const { d, loading, err, load } = useProfit(props);
  const cols = useMemo<ColumnDef<FeeRow>[]>(() => [
    { accessorKey: "name_th", header: "ช่องทาง", cell: ({ row }) => <span className="inline-flex items-center gap-1.5"><PlatformIcon code={row.original.platform} iconKey={row.original.icon_key} size={16} /> {row.original.name_th}</span> },
    { accessorKey: "sales", header: "ยอดขาย", cell: ({ getValue }) => baht(getValue() as number) },
    { accessorKey: "fee", header: "ค่าธรรมเนียม (จริง)", cell: ({ row }) => row.original.supported ? <span className="text-rose-600">{row.original.covered ? baht(row.original.fee) : "—"}</span> : <span className="text-slate-400">ยังดึงไม่ได้</span> },
    { accessorKey: "pct", header: "% ของยอด", cell: ({ getValue }) => pct(getValue() as number | null) },
    { accessorKey: "net", header: "เงินเข้าร้าน", cell: ({ row }) => (row.original.covered ? baht(row.original.net) : "—") },
    { id: "cats", header: "สัดส่วนค่าธรรมเนียม", enableSorting: false, cell: ({ row }) => <div className="w-32"><CatBar byCat={row.original.byCat} cats={d?.cats ?? []} /></div> },
    { id: "coverage", header: "ดึงแล้ว", cell: ({ row }) => row.original.supported ? `${num(row.original.covered)}/${num(row.original.orders)} ใบ` : "—" },
  ], [d?.cats]);

  if (loading && !d) return <LoadingState label="กำลังรวมค่าธรรมเนียมจากทุกออเดอร์…" />;
  if (err && !d) return <ErrorState title="โหลดค่าธรรมเนียมไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const t = d.totals;
  const coverage = t.orders ? t.covered / t.orders : 0;
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      {coverage < 0.95 && (
        <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          <Icon name="info" className="mt-0.5 shrink-0" />
          <span>ดึงค่าธรรมเนียมจริงแล้ว {num(t.covered)} จาก {num(t.orders)} ออเดอร์ Shopee/Lazada ({pct(coverage, 0)}) — ระบบดึงต่อเองทุก 30 นาทีจนครบ · % คิดจากใบที่ดึงแล้ว · Lazada ลงค่าธรรมเนียมหลังส่งสำเร็จและตัดรอบ</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="ยอดขาย Shopee + Lazada" value={bahtShort(t.salesSupported)} sub={t.sales > t.salesSupported ? `ทุกช่องทาง ${bahtShort(t.sales)}` : undefined} />
        <Card label="ค่าธรรมเนียมจริง (ใบที่ดึงแล้ว)" value={`-${bahtShort(t.fee)}`} tone="danger" sub={`${pct(t.pct)} ของยอด`} />
        <Card label="ประมาณทั้งช่วง" value={t.estFeeAll > 0 ? `-${bahtShort(t.estFeeAll)}` : "รอข้อมูล"} sub={t.estFeeAll > 0 ? "ยอดทั้งหมด × % ที่เห็นจริง" : "ต้องดึงได้อย่างน้อย 20 ใบต่อช่องทางก่อน"} />
        <Card label="เงินเข้าร้าน (ใบที่ดึงแล้ว)" value={bahtShort(t.net)} tone="success" sub="หลังหักค่าธรรมเนียมและส่วนลดร้าน" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-slate-500">
          {d.cats.map((c) => <span key={c.key} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: CAT_COLOR[c.key] }} /> {c.label}</span>)}
        </div>
        <DataTable<FeeRow> tableId="marketing-fees-platforms" data={d.fees} columns={cols} pageSize={20}
          exportFilename="marketing-fees" exportEntityType="marketing_overview" emptyMessage="ไม่มียอดในช่วงนี้"
          drawerTitle={(r) => `ค่าธรรมเนียม ${r.name_th}`}
          drawerContent={(r) => r.covered ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.cats.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2 py-2">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: CAT_COLOR[c.key] }} /> {c.label}</span>
                  <span className="shrink-0 text-slate-700">{baht(r.byCat[c.key] || 0)} <span className="text-xs text-slate-400">({pct(r.salesCovered ? (r.byCat[c.key] || 0) / r.salesCovered : null)})</span></span>
                </li>
              ))}
              <li className="flex justify-between gap-2 py-2 font-medium"><span>รวม</span><span>{baht(r.fee)} ({pct(r.pct)})</span></li>
              <li className="py-2 text-xs text-slate-400">คิดจาก {num(r.covered)} ใบที่ดึงค่าธรรมเนียมแล้ว ยอดรวม {baht(r.salesCovered)}</li>
            </ul>
          ) : <EmptyState title={r.supported ? "ยังไม่ได้ดึงค่าธรรมเนียมของช่วงนี้" : "ช่องทางนี้ยังดึงค่าธรรมเนียมไม่ได้"} hint={r.supported ? "ตัวดึงทำงานทุก 30 นาที กลับมาดูใหม่ภายหลัง" : "TikTok ต้องเปิดสิทธิ์การเงินในแอป TikTok ก่อน"} />} />
      </div>

      <p className="px-1 text-xs text-slate-400">% = ค่าธรรมเนียม ÷ ยอดขาย (มูลค่าสินค้าหลังส่วนลดร้าน) · Shopee คิดค่าธรรมเนียมจากราคาที่รวมส่วนลดที่ Shopee ออกให้ด้วย % จึงดูสูง · ส่วนลดของร้านเองไม่นับเป็นค่าธรรมเนียม</p>

      {d.feeDaily.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-slate-800">ค่าธรรมเนียมรายวัน (ใบที่ดึงแล้ว)</h2>
          <SimpleBarChart data={d.feeDaily.map((x) => ({ key: x.date, label: shortDate(x.date), value: x.fee, hint: `${pct(x.sales ? x.fee / x.sales : null)} ของยอด ${baht(x.sales)}` }))} format={bahtShort} height={180} barColor="#f43f5e" barHoverColor="#e11d48" ariaLabel="ค่าธรรมเนียมรายวัน" />
        </div>
      )}
    </div>
  );
}

// ═════════════════════════ แท็บ กำไร ═════════════════════════

export function ProfitTab(props: Props) {
  const { d, loading, err, load } = useProfit(props);
  const cols = useMemo<ColumnDef<ProfitRowT>[]>(() => [
    { accessorKey: "code", header: "สินค้า", cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <HoverImage url={row.original.image} size={32} previewSize={240} fallback={<span className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-slate-400"><Icon name="package" /></span>} />
        <span className="min-w-0"><span className="block font-medium text-slate-800">{row.original.code}</span><span className="block truncate text-xs text-slate-500">{row.original.name}</span></span>
      </span>
    ) },
    { accessorKey: "sales", header: "ยอดขาย", cell: ({ getValue }) => baht(getValue() as number) },
    { accessorKey: "qty", header: "ชิ้น", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "unitCost", header: "ต้นทุน/ชิ้น", cell: ({ getValue }) => (getValue() == null ? <span className="text-amber-600">ยังไม่มี</span> : baht(getValue() as number)) },
    { accessorKey: "fee", header: "ค่าธรรมเนียม", cell: ({ getValue }) => <span className="text-rose-600">{baht(getValue() as number)}</span> },
    { accessorKey: "profit", header: "กำไร", cell: ({ getValue }) => { const v = getValue() as number | null; return v == null ? "—" : <span className={v >= 0 ? "text-emerald-600" : "text-rose-600"}>{baht(v)}</span>; } },
    { accessorKey: "margin", header: "% กำไร", cell: ({ getValue }) => pct(getValue() as number | null) },
  ], []);
  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "has", label: "มีต้นทุนแล้ว", filter: (r) => (r as unknown as ProfitRowT).cost != null },
    { id: "loss", label: "ขาดทุน", filter: (r) => ((r as unknown as ProfitRowT).profit ?? 0) < 0 },
    { id: "missing", label: "ยังไม่มีต้นทุน", filter: (r) => (r as unknown as ProfitRowT).cost == null },
  ], []);

  if (loading && !d) return <LoadingState label="กำลังคิดกำไรต่อสินค้า…" />;
  if (err && !d) return <ErrorState title="โหลดข้อมูลกำไรไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  if (d.restricted || !d.profit) return <EmptyState title="คุณไม่มีสิทธิ์ดูต้นทุนและกำไร" hint="ขอสิทธิ์ “ดูต้นทุน” จากแอดมิน — แท็บค่าธรรมเนียมยังดูได้ตามปกติ" />;
  const p = d.profit;
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="มีต้นทุนแล้ว" value={pct(p.coverage, 0)} sub={`${bahtShort(p.salesWithCost)} จาก ${bahtShort(p.sales)}`} subCls={p.coverage < 0.5 ? "text-amber-600" : "text-slate-500"} />
        <Card label="กำไรขั้นต้น (เฉพาะที่มีต้นทุน)" value={p.salesWithCost > 0 ? bahtShort(p.profit) : "—"} tone={p.salesWithCost > 0 ? (p.profit >= 0 ? "success" : "danger") : undefined} sub={p.salesWithCost > 0 ? `${pct(p.margin)} ของยอด` : "กรอกต้นทุนแล้วจะเห็นตัวเลข"} />
        <Card label="ต้นทุนสินค้า" value={p.salesWithCost > 0 ? bahtShort(p.cost) : "—"} sub="จำนวน × ราคาซื้อ/ต้นทุนรุ่น" />
        <Card label="ค่าธรรมเนียมที่ปันส่วน" value={p.salesWithCost > 0 ? `-${bahtShort(p.fee)}` : "—"} sub="ใบที่ยังไม่รู้ ใช้ % เฉลี่ยของช่องทาง" />
      </div>

      {p.missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-amber-900"><Icon name="warning" /> ขายดีแต่ยังไม่มีต้นทุน</h2>
            <span className="text-xs text-amber-800">กรอก 20 รุ่นแรก = ครอบคลุมยอดเพิ่ม {pct(p.missingTop20Share, 0)}</span>
          </div>
          <ul className="mt-2 divide-y divide-amber-100">
            {p.missing.slice(0, 20).map((m, i) => (
              <li key={m.parentId ?? m.codes.join(",") ?? i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{m.parentName || m.codes[0] || "—"}</span>
                  <span className="block truncate text-xs text-slate-500">{m.skus} SKU · {m.codes.join(", ")}</span>
                </span>
                <span className="shrink-0 text-slate-700">{baht(m.sales)}</span>
                {m.href ? (
                  <a href={m.href} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100">
                    กรอกต้นทุน <Icon name="open" />
                  </a>
                ) : <span className="shrink-0 text-xs text-slate-400">ไม่มีรุ่นแม่</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800/80">ระบบใช้ “ราคาซื้อ” ของ SKU ก่อน ถ้าไม่มีจะใช้ “ต้นทุน” ของรุ่น · กรอกแล้วกดโหลดใหม่ ตัวเลขกำไรจะขึ้นทันที</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <DataTable<ProfitRowT> tableId="marketing-profit-products" data={p.rows} columns={cols} views={views} pageSize={25}
          searchableKeys={["code", "name", "parentName"]} searchPlaceholder="ค้นหา รหัส / ชื่อสินค้า…"
          exportFilename="marketing-profit" exportEntityType="marketing_overview" emptyMessage="ไม่มีสินค้าขายในช่วงนี้" />
        {p.unmatchedLines > 0 && <p className="mt-2 px-2 text-xs text-slate-400">ไม่รวม {num(p.unmatchedLines)} รายการ ({baht(p.unmatchedSales)}) ที่ยังไม่จับคู่ SKU — คิดกำไรไม่ได้จนกว่าจะจับคู่</p>}
      </div>
    </div>
  );
}
