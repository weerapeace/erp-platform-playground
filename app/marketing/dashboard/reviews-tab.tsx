"use client";

/**
 * แท็บ "รีวิว" ของหน้าภาพรวมการตลาด — ข้อมูลจาก /api/marketing/reviews (โหลดเมื่อเปิดแท็บ)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-26 (แผนการตลาด รอบ 7 · แบบ A + ข้อ 1 รีวิว Shopee + รีวิวแย่ที่ยังไม่ตอบ)
 * อ่านอย่างเดียว (ตอบรีวิวต้องตอบในแอป Shopee) · ปุ่ม "ดึงตอนนี้" อ่านจากแพลตฟอร์มอย่างเดียว
 * ของกลาง: DataTable (มุมมอง/ส่งออก Excel) · HoverImage · Icon · useToast · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { TH_MONTHS } from "@/lib/date-range";

const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const pct = (n: number | null | undefined, d = 0) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const dt = (iso: string | null) => { if (!iso) return "—"; const t = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString(); return `${+t.slice(8, 10)} ${TH_MONTHS[+t.slice(5, 7) - 1]} ${t.slice(11, 16)}`; };
const stars = (r: number | null) => (r == null ? "—" : "★".repeat(r) + "☆".repeat(Math.max(0, 5 - r)));

type Review = { comment_id: string; item_id: string | null; order_sn: string | null; rating: number | null; comment: string | null; buyer: string | null; photos: number; created_at_shop: string | null; reply: string | null; replied_at: string | null; title: string; code: string; image: string | null };
type ByItem = { item_id: string; count: number; avg: number | null; low: number; lowOpen: number; last: string | null; title: string; code: string; image: string | null };
type Part = { ok: boolean; count: number; error?: string | null; at: string };
type Resp = {
  range: { from: string; to: string };
  kpi: { count: number; avg: number | null; dist: number[]; replyRate: number; lowOpen: number; withPhotos: number };
  lowOpen: Review[]; byItem: ByItem[]; reviews: Review[]; namesVisible: boolean;
  sync: { at: string; reviews: Part } | null; dataStart: string | null; notes: string[]; error: string | null;
};

function Card({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold sm:text-2xl ${tone === "danger" ? "text-rose-600" : "text-slate-900"}`}>{value}</div>
      {sub != null && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
const Thumb = ({ url }: { url: string | null }) => <HoverImage url={url} size={28} previewSize={220} fallback={<span className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-slate-400"><Icon name="package" /></span>} />;

export function ReviewsTab({ from, to, brandId, reloadKey }: { from: string; to: string; brandId: string; reloadKey: number }) {
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
      const res = await apiFetch(`/api/marketing/reviews?${q}`);
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
      const j = await apiFetch("/api/cron/marketing-content", { method: "POST" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(j.summary || "ดึงรีวิวแล้ว");
      void load();
    } catch (e) { toast.error(`ดึงไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setBusy(false); }
  };

  const cols = useMemo<ColumnDef<Review>[]>(() => [
    { accessorKey: "rating", header: "ดาว", cell: ({ row }) => <span className={`whitespace-nowrap ${(row.original.rating ?? 5) <= 3 ? "text-rose-500" : "text-amber-500"}`}>{stars(row.original.rating)}</span> },
    { accessorKey: "comment", header: "รีวิว", cell: ({ row }) => <span className="block max-w-md whitespace-normal text-sm text-slate-700">{row.original.comment || <span className="text-slate-400">(ไม่มีข้อความ)</span>}{row.original.photos ? <span className="ml-1 text-xs text-slate-400">· รูป {row.original.photos}</span> : null}</span> },
    { accessorKey: "title", header: "สินค้า", cell: ({ row }) => <span className="flex min-w-0 items-center gap-1.5"><Thumb url={row.original.image} /><span className="min-w-0 truncate text-xs">{row.original.code || row.original.title}</span></span> },
    { accessorKey: "reply", header: "ร้านตอบ", cell: ({ row }) => row.original.reply ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700" title={row.original.reply}>ตอบแล้ว</span> : <span className={`rounded px-1.5 py-0.5 text-xs ${(row.original.rating ?? 5) <= 3 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}>ยังไม่ตอบ</span> },
    { accessorKey: "created_at_shop", header: "เมื่อ", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{dt(getValue() as string | null)}</span> },
    { accessorKey: "buyer", header: "ผู้รีวิว", cell: ({ getValue }) => <span className="text-xs text-slate-500">{(getValue() as string) ?? "—"}</span> },
  ], []);
  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "low", label: "1–3 ดาว", filter: (r) => ((r as unknown as Review).rating ?? 5) <= 3 },
    { id: "open", label: "ยังไม่ตอบ", filter: (r) => !(r as unknown as Review).reply },
    { id: "photo", label: "มีรูป", filter: (r) => (r as unknown as Review).photos > 0 },
  ], []);
  const itemCols = useMemo<ColumnDef<ByItem>[]>(() => [
    { accessorKey: "title", header: "สินค้า", cell: ({ row }) => <span className="flex min-w-0 items-center gap-2"><Thumb url={row.original.image} /><span className="min-w-0"><span className="block truncate font-medium text-slate-800">{row.original.code || row.original.title}</span><span className="block truncate text-xs text-slate-500">{row.original.code ? row.original.title : ""}</span></span></span> },
    { accessorKey: "count", header: "รีวิว", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "avg", header: "ดาวเฉลี่ย", cell: ({ getValue }) => { const v = getValue() as number | null; return v == null ? "—" : <span className={v < 4.5 ? "text-rose-600" : ""}>{v.toFixed(2)}</span>; } },
    { accessorKey: "low", header: "1–3 ดาว", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "lowOpen", header: "แย่ ยังไม่ตอบ", cell: ({ getValue }) => { const v = getValue() as number; return v ? <span className="font-medium text-rose-600">{v}</span> : "—"; } },
  ], []);

  if (loading && !d) return <LoadingState label="กำลังรวมรีวิว…" />;
  if (err && !d) return <ErrorState title="โหลดข้อมูลรีวิวไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const k = d.kpi;
  const maxDist = Math.max(1, ...k.dist);
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 sm:px-4">
        <span className={`inline-flex items-center gap-1.5 ${d.sync?.reviews?.error ? "text-rose-600" : ""}`}><Icon name="info" /> {d.sync ? `ดึงรีวิวล่าสุด ${dt(d.sync.at)}${d.sync.reviews?.error ? ` · ${d.sync.reviews.error}` : ""}` : "ยังไม่เคยดึงรีวิว"} · ระบบดึงวันละ 2 รอบ (09:00 / 21:00) · Shopee</span>
        <button type="button" disabled={busy} onClick={() => void syncNow()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon name="refresh" /> {busy ? "กำลังดึง…" : "ดึงตอนนี้"}</button>
      </div>

      {k.count === 0 ? <EmptyState title="ยังไม่มีรีวิวในช่วงนี้" hint="กด “ดึงตอนนี้” เพื่อดึงรีวิวล่าสุดจาก Shopee" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="รีวิวในช่วงนี้" value={num(k.count)} sub={`มีรูป ${num(k.withPhotos)}`} />
            <Card label="ดาวเฉลี่ย" value={k.avg == null ? "—" : k.avg.toFixed(2)} />
            <Card label="ร้านตอบแล้ว" value={pct(k.replyRate)} />
            <Card label="1–3 ดาว ยังไม่ตอบ" value={num(k.lowOpen)} tone={k.lowOpen ? "danger" : undefined} sub="ควรตอบเร็วที่สุด" />
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <h2 className="mb-2 text-sm font-medium text-slate-800">แจกแจงดาว</h2>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((s) => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <span className="w-10 shrink-0 text-amber-500">{s} ★</span>
                    <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-slate-100"><div className={`h-full ${s <= 3 ? "bg-rose-400" : "bg-amber-400"}`} style={{ width: `${(k.dist[s - 1] / maxDist) * 100}%` }} /></div>
                    <span className="w-10 shrink-0 text-right text-slate-500">{num(k.dist[s - 1])}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 lg:col-span-3">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-rose-800"><Icon name="warning" /> รีวิวแย่ที่ยังไม่ตอบ ({d.lowOpen.length})</h2>
              {d.lowOpen.length ? (
                <ul className="mt-2 max-h-72 divide-y divide-rose-100 overflow-y-auto text-sm">
                  {d.lowOpen.slice(0, 20).map((r) => (
                    <li key={r.comment_id} className="flex gap-2 py-2">
                      <Thumb url={r.image} />
                      <span className="min-w-0 flex-1">
                        <span className="text-xs text-rose-500">{stars(r.rating)}</span> <span className="text-xs text-slate-500">{r.code || r.title} · {dt(r.created_at_shop)}</span>
                        <span className="block text-slate-700">{r.comment || "(ไม่มีข้อความ)"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-emerald-700">ไม่มีรีวิวแย่ที่ค้างตอบ</p>}
              <p className="mt-2 text-xs text-slate-500">ตอบใน Seller Centre ของ Shopee แล้วรอบดึงถัดไปจะขึ้นว่าตอบแล้ว</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
            <p className="mb-2 px-2 text-xs text-slate-500">ต่อสินค้า (แย่ที่ค้างตอบขึ้นก่อน)</p>
            <DataTable<ByItem> tableId="marketing-reviews-items" data={d.byItem} columns={itemCols} pageSize={15} exportFilename="marketing-reviews-by-item" exportEntityType="marketing_overview" emptyMessage="—" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
            <DataTable<Review> tableId="marketing-reviews" data={d.reviews} columns={cols} views={views} pageSize={25}
              searchableKeys={["comment", "title", "code"]} searchPlaceholder="ค้นหาข้อความรีวิว / สินค้า…"
              exportFilename="marketing-reviews" exportEntityType="marketing_overview" emptyMessage="ไม่มีรีวิว" />
          </div>
        </>
      )}

      <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {d.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}
      </ul>
    </div>
  );
}
