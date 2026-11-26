"use client";

/**
 * แท็บ "คอนเทนต์" ของหน้าภาพรวมการตลาด — ข้อมูลจาก /api/marketing/content · คู่แข่ง แก้ที่ /api/marketing/competitors
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-26 (แผนการตลาด รอบ 7 · แบบ A + ข้อ 2 โพสต์ FB/IG · 3 แอฟฟิลิเอต · 5 คู่แข่ง · 6 วิดีโอ Shopee)
 * คู่แข่ง: เพิ่ม · แก้ทุกช่อง · ลบแบบเก็บไว้ + ปุ่มย้อนกลับ · ดูที่ลบไว้แล้วกู้คืน · ราคา/ดาว/ยอดขายเปลี่ยน = เก็บประวัติ (audit ทุกครั้ง)
 * ของกลาง: DataTable · ERPModal · ParentSkuPicker · MoneyInput · HoverImage · PlatformIcon · Icon · useToast · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { HoverImage } from "@/components/hover-image";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { TH_MONTHS } from "@/lib/date-range";

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 10_000 ? `฿${(n / 1_000).toFixed(1)}K` : baht(n));
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const signPct = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`);
const dt = (iso: string | null) => { if (!iso) return "—"; const t = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString(); return `${+t.slice(8, 10)} ${TH_MONTHS[+t.slice(5, 7) - 1]}`; };
const PF: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", shopee_video: "วิดีโอ Shopee" };
const pfIcon = (p: string) => (p === "shopee_video" ? "shopee" : p);

type Post = { platform: string; post_id: string; message: string | null; permalink: string | null; media_type: string | null; image_url: string | null; posted_at: string | null; likes: number; comments: number; shares: number; engagement: number; brand_name: string };
type Aff = { product: string; orders: number; sales: number; commission: number; rate: number | null; info: { code: string; name: string; image: string | null } };
type Comp = { id: string; brand_id: string | null; platform: string | null; shop_name: string | null; product_name: string; url: string | null; price: number | null; rating: number | null; sold: number | null; our_parent_sku_id: string | null; note: string | null; history: { at: string; price: number | null; sold: number | null }[]; is_active: boolean; updated_at: string; brand_name: string; ours: { code: string; name: string; price: number | null; image: string | null } | null; gap: number | null };
type Part = { ok: boolean; count: number; error?: string | null; at: string };
type Resp = {
  range: { from: string; to: string }; posts: Post[];
  summary: { platform: string; posts: number; engagement: number; avg: number; likes: number; comments: number; shares: number }[];
  affiliate: { orders: number; sales: number; commission: number; rate: number | null; incomeOrders: number; totalOrders: number; shopTotal: number; products: Aff[] };
  competitors: Comp[]; brands: { id: string; name: string }[];
  sync: { at: string; facebook: Part; instagram: Part; shopee_video: Part } | null; notes: string[]; error: string | null;
};

const Thumb = ({ url, size = 32 }: { url: string | null; size?: number }) => <HoverImage url={url} size={size} previewSize={240} fallback={<span className="flex items-center justify-center rounded bg-slate-100 text-slate-400" style={{ width: size, height: size }}><Icon name="image" /></span>} />;

export function ContentTab({ from, to, brandId, reloadKey }: { from: string; to: string; brandId: string; reloadKey: number }) {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.platforms.edit");
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Comp | "new" | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const q = new URLSearchParams({ from, to });
    if (brandId) q.set("brand_id", brandId);
    try {
      const res = await apiFetch(`/api/marketing/content?${q}`);
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
      toast.success(j.summary || "ดึงโพสต์แล้ว");
      void load();
    } catch (e) { toast.error(`ดึงไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setBusy(false); }
  };
  const patchComp = async (body: Record<string, unknown>) => {
    const j = await apiFetch("/api/marketing/competitors", { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
    return j;
  };
  const removeComp = async (c: Comp) => {
    const j = await apiFetch(`/api/marketing/competitors?id=${encodeURIComponent(c.id)}`, { method: "DELETE" }).then((r) => r.json());
    if (j.error) { toast.error(j.error); return; }
    void load();
    toast.undo(`ลบ "${c.product_name}" แล้ว (เก็บไว้ กู้คืนได้)`, async () => { try { await patchComp({ id: c.id, is_active: true }); toast.success("กู้คืนแล้ว"); void load(); } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); } }, { ms: 8000 });
  };
  const restoreComp = async (c: Comp) => {
    try { await patchComp({ id: c.id, is_active: true }); toast.success(`กู้คืน "${c.product_name}" แล้ว`); void load(); } catch (e) { toast.error(e instanceof Error ? e.message : "กู้คืนไม่สำเร็จ"); }
  };

  const postCols = useMemo<ColumnDef<Post>[]>(() => [
    { accessorKey: "message", header: "โพสต์", cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-2">
        <Thumb url={row.original.image_url} />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-xs text-slate-500"><PlatformIcon code={pfIcon(row.original.platform)} size={12} /> {PF[row.original.platform] ?? row.original.platform}{row.original.brand_name ? ` · ${row.original.brand_name}` : ""}</span>
          <span className="block max-w-sm truncate text-sm text-slate-800">{row.original.message || "(ไม่มีข้อความ)"}</span>
        </span>
      </span>
    ) },
    { accessorKey: "posted_at", header: "วันที่", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs">{dt(getValue() as string | null)}</span> },
    { accessorKey: "engagement", header: "มีส่วนร่วม", cell: ({ getValue }) => <span className="font-medium">{num(getValue() as number)}</span> },
    { accessorKey: "likes", header: "ถูกใจ", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "comments", header: "คอมเมนต์", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "shares", header: "แชร์", cell: ({ getValue }) => num(getValue() as number) },
    { id: "open", header: "", enableSorting: false, cell: ({ row }) => row.original.permalink ? <a href={row.original.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline">เปิด <Icon name="open" /></a> : null },
  ], []);
  const postViews = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "fb", label: "Facebook", filter: (r) => (r as unknown as Post).platform === "facebook" },
    { id: "ig", label: "Instagram", filter: (r) => (r as unknown as Post).platform === "instagram" },
    { id: "video", label: "วิดีโอ", filter: (r) => ["video", "reels"].includes(String((r as unknown as Post).media_type)) || (r as unknown as Post).platform === "shopee_video" },
  ], []);
  const compCols = useMemo<ColumnDef<Comp>[]>(() => [
    { accessorKey: "product_name", header: "สินค้าคู่แข่ง", cell: ({ row }) => (
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-800">{row.original.url ? <a href={row.original.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{row.original.product_name}</a> : row.original.product_name}</span>
        <span className="block truncate text-xs text-slate-500">{[row.original.platform, row.original.shop_name].filter(Boolean).join(" · ")}{!row.original.is_active ? " · ลบแล้ว" : ""}</span>
      </span>
    ) },
    { accessorKey: "price", header: "ราคาเขา", cell: ({ getValue }) => (getValue() == null ? "—" : baht(getValue() as number)) },
    { id: "ours", header: "ของเรา", cell: ({ row }) => row.original.ours ? <span className="flex items-center gap-1.5"><Thumb url={row.original.ours.image} size={24} /><span className="text-xs">{row.original.ours.code} · {row.original.ours.price != null ? baht(row.original.ours.price) : "—"}</span></span> : <span className="text-xs text-slate-400">ยังไม่จับคู่</span> },
    { accessorKey: "gap", header: "เราแพงกว่า", cell: ({ getValue }) => { const v = getValue() as number | null; return v == null ? "—" : <span className={v > 0.05 ? "text-rose-600" : v < -0.05 ? "text-emerald-600" : ""}>{signPct(v)}</span>; } },
    { accessorKey: "rating", header: "ดาว", cell: ({ getValue }) => (getValue() == null ? "—" : (getValue() as number).toFixed(1)) },
    { accessorKey: "sold", header: "ขายแล้ว", cell: ({ row }) => { const h = row.original.history ?? []; const prev = h.length >= 2 ? h[h.length - 2].sold : null; return row.original.sold == null ? "—" : <span title={prev != null ? `ครั้งก่อน ${num(prev)}` : undefined}>{num(row.original.sold)}{prev != null && row.original.sold > prev ? <span className="ml-1 text-xs text-emerald-600">+{num(row.original.sold - prev)}</span> : null}</span>; } },
    { accessorKey: "updated_at", header: "อัปเดต", cell: ({ getValue }) => <span className="text-xs">{dt(getValue() as string)}</span> },
    { id: "act", header: "", enableSorting: false, cell: ({ row }) => !canEdit ? null : row.original.is_active ? (
      <span className="flex gap-1">
        <button type="button" onClick={() => setEditing(row.original)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="แก้ไข" title="แก้ไข"><Icon name="edit" /></button>
        <button type="button" onClick={() => void removeComp(row.original)} className="rounded p-1 text-rose-500 hover:bg-rose-50" aria-label="ลบ" title="ลบ (กู้คืนได้)"><Icon name="delete" /></button>
      </span>
    ) : <button type="button" onClick={() => void restoreComp(row.original)} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">กู้คืน</button> },
  ], [canEdit]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !d) return <LoadingState label="กำลังรวมคอนเทนต์…" />;
  if (err && !d) return <ErrorState title="โหลดข้อมูลคอนเทนต์ไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const a = d.affiliate;
  const comps = d.competitors.filter((c) => showDeleted || c.is_active);
  const syncLine = d.sync ? [["Facebook", d.sync.facebook], ["Instagram", d.sync.instagram], ["วิดีโอ Shopee", d.sync.shopee_video]] as const : [];
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5"><Icon name="info" /> {d.sync ? `ดึงล่าสุด ${dt(d.sync.at)}` : "ยังไม่เคยดึงโพสต์"} · วันละ 2 รอบ (09:00 / 21:00)</span>
          <button type="button" disabled={busy} onClick={() => void syncNow()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Icon name="refresh" /> {busy ? "กำลังดึง…" : "ดึงตอนนี้"}</button>
        </div>
        {syncLine.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {syncLine.map(([label, s]) => <li key={label} className={s.error ? "text-rose-600" : "text-slate-500"}>{label}: {s.error ? s.error : `${num(s.count)} โพสต์`}</li>)}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d.summary.length ? d.summary.slice(0, 3).map((s) => (
          <div key={s.platform} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><PlatformIcon code={pfIcon(s.platform)} size={14} /> {PF[s.platform] ?? s.platform}</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{num(s.posts)} <span className="text-sm font-normal text-slate-500">โพสต์</span></div>
            <div className="mt-0.5 text-xs text-slate-500">มีส่วนร่วม {num(s.engagement)} · เฉลี่ย {num(s.avg)}/โพสต์</div>
          </div>
        )) : <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 lg:col-span-3">ยังไม่มีโพสต์ในช่วงนี้</div>}
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="text-xs text-slate-500">ขายผ่านแอฟฟิลิเอต (Shopee)</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">{bahtShort(a.sales)}</div>
          <div className="mt-0.5 text-xs text-slate-500">{num(a.orders)} ออเดอร์ · ค่าคอม {bahtShort(a.commission)} ({pct(a.rate)}) · {pct(a.shopTotal > 0 ? a.sales / a.shopTotal : null)} ของยอด</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        {d.posts.length ? (
          <DataTable<Post> tableId="marketing-content-posts" data={d.posts} columns={postCols} views={postViews} pageSize={20}
            searchableKeys={["message", "brand_name"]} searchPlaceholder="ค้นหาข้อความโพสต์…" exportFilename="marketing-posts" exportEntityType="marketing_overview" emptyMessage="ไม่มีโพสต์" />
        ) : <EmptyState title="ยังไม่มีโพสต์ในช่วงนี้" hint="กด “ดึงตอนนี้” เพื่อดึงโพสต์จากเพจ Facebook / Instagram ที่เชื่อมไว้" />}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-800">สินค้าที่ขายผ่านแอฟฟิลิเอต</h2>
        <p className="mb-2 text-xs text-slate-500">ออเดอร์ที่ Shopee หักค่าคอมแอฟฟิลิเอต · ค่าคอมปันส่วนตามมูลค่าสินค้าในใบ</p>
        {a.products.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {a.products.slice(0, 15).map((p) => (
              <li key={p.product} className="flex items-center gap-2 py-1.5">
                <Thumb url={p.info.image} size={28} />
                <span className="min-w-0 flex-1 truncate" title={p.info.name}>{p.info.code || p.info.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{num(p.orders)} ใบ · {baht(p.sales)}</span>
                <span className="w-24 shrink-0 text-right text-xs text-slate-500">ค่าคอม {baht(p.commission)}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="ยังไม่มีออเดอร์ผ่านแอฟฟิลิเอตในช่วงนี้" />}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
          <div><h2 className="text-sm font-medium text-slate-800">คู่แข่ง</h2><p className="text-xs text-slate-500">กรอกเอง · แก้ราคา/ยอดขายเมื่อไปเช็ก ระบบเก็บประวัติให้</p></div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> ดูที่ลบไว้</label>
            {canEdit && <button type="button" onClick={() => setEditing("new")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-orange-500 px-3 text-xs font-medium text-white hover:bg-orange-600"><Icon name="add" /> เพิ่มคู่แข่ง</button>}
          </div>
        </div>
        {comps.length ? (
          <DataTable<Comp> tableId="marketing-competitors" data={comps} columns={compCols} pageSize={20} searchableKeys={["product_name", "shop_name", "platform"]} searchPlaceholder="ค้นหาคู่แข่ง…" exportFilename="marketing-competitors" exportEntityType="marketing_overview" emptyMessage="—" />
        ) : <EmptyState title="ยังไม่มีคู่แข่งในรายการ" hint={canEdit ? "กด “เพิ่มคู่แข่ง” แล้วใส่ลิงก์สินค้า ราคา และจับคู่กับสินค้าเรา" : "ให้คนที่มีสิทธิ์แก้ช่องทางขายเป็นคนเพิ่ม"} />}
      </div>

      <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {d.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}
      </ul>

      {editing && <CompetitorModal row={editing === "new" ? null : editing} brands={d.brands} defaultBrand={brandId} onClose={() => setEditing(null)} onSaved={() => void load()} patchComp={patchComp} />}
    </div>
  );
}

function CompetitorModal({ row, brands, defaultBrand, onClose, onSaved, patchComp }: { row: Comp | null; brands: { id: string; name: string }[]; defaultBrand: string; onClose: () => void; onSaved: () => void; patchComp: (b: Record<string, unknown>) => Promise<{ before?: Record<string, unknown> }> }) {
  const toast = useToast();
  const init = useMemo(() => ({
    product_name: row?.product_name ?? "", platform: row?.platform ?? "Shopee", shop_name: row?.shop_name ?? "", url: row?.url ?? "",
    price: row?.price != null ? String(row.price) : "", rating: row?.rating != null ? String(row.rating) : "", sold: row?.sold != null ? String(row.sold) : "",
    note: row?.note ?? "", brand_id: row?.brand_id ?? defaultBrand ?? "",
  }), [row, defaultBrand]);
  const [v, setV] = useState(init);
  const [ours, setOurs] = useState<ParentSkuPickerValue | null>(row?.ours && row.our_parent_sku_id ? { id: row.our_parent_sku_id, code: row.ours.code, name: row.ours.name } : null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(init) || (ours?.id ?? null) !== (row?.our_parent_sku_id ?? null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (!v.product_name.trim()) { toast.error("ต้องใส่ชื่อสินค้าคู่แข่ง"); return; }
    if (v.url && !/^https?:\/\//i.test(v.url)) { toast.error("ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"); return; }
    if (v.rating && !(Number(v.rating) >= 0 && Number(v.rating) <= 5)) { toast.error("ดาวต้องอยู่ระหว่าง 0–5"); return; }
    const body = { ...v, brand_id: v.brand_id || null, our_parent_sku_id: ours?.id ?? null };
    setSaving(true);
    try {
      if (!row) {
        const j = await apiFetch("/api/marketing/competitors", { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
        if (j.error) throw new Error(j.error);
        onClose(); onSaved();
        toast.undo(`เพิ่ม "${v.product_name}" แล้ว`, async () => { try { await apiFetch(`/api/marketing/competitors?id=${encodeURIComponent(j.row.id)}`, { method: "DELETE" }); onSaved(); } catch { /* ไม่เป็นไร */ } }, { ms: 8000 });
      } else {
        const j = await patchComp({ id: row.id, ...body });
        onClose(); onSaved();
        const b = j.before ?? {};
        toast.undo(`บันทึก "${v.product_name}" แล้ว`, async () => {
          try { await patchComp({ id: row.id, product_name: b.product_name, platform: b.platform, shop_name: b.shop_name, url: b.url, price: b.price, rating: b.rating, sold: b.sold, note: b.note, brand_id: b.brand_id, our_parent_sku_id: b.our_parent_sku_id }); toast.success("ย้อนกลับแล้ว"); onSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
        }, { ms: 8000 });
      }
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setSaving(false); }
  };

  const input = "h-9 w-full rounded-lg border border-slate-200 px-3 text-sm";
  return (
    <ERPModal open onClose={onClose} size="md" title={row ? "แก้ไขคู่แข่ง" : "เพิ่มคู่แข่ง"} hasUnsavedChanges={dirty} loading={saving}
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm">ยกเลิก</button><button type="button" disabled={saving || !dirty} onClick={() => void save()} className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">บันทึก</button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2"><span className="text-slate-700">ชื่อสินค้าคู่แข่ง *</span><input value={v.product_name} onChange={set("product_name")} className={`mt-1 ${input}`} placeholder="เช่น เข็มขัดหนังแท้หัวออโต้ แบรนด์ X" /></label>
        <label className="block text-sm sm:col-span-2"><span className="text-slate-700">ลิงก์สินค้า</span><input value={v.url} onChange={set("url")} className={`mt-1 ${input}`} placeholder="https://shopee.co.th/..." /></label>
        <label className="block text-sm"><span className="text-slate-700">ช่องทาง</span>
          <select value={v.platform} onChange={set("platform")} className={`mt-1 ${input} bg-white`}>{["Shopee", "Lazada", "TikTok", "เว็บไซต์", "อื่น ๆ"].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <label className="block text-sm"><span className="text-slate-700">ชื่อร้านคู่แข่ง</span><input value={v.shop_name} onChange={set("shop_name")} className={`mt-1 ${input}`} /></label>
        <label className="block text-sm"><span className="text-slate-700">ราคาขาย</span><MoneyInput value={v.price} onChange={(x) => setV((s) => ({ ...s, price: x }))} className={`mt-1 ${input}`} placeholder="฿" /></label>
        <label className="block text-sm"><span className="text-slate-700">ดาว (0–5)</span><input type="number" step="0.1" min="0" max="5" inputMode="decimal" value={v.rating} onChange={set("rating")} className={`mt-1 ${input}`} /></label>
        <label className="block text-sm"><span className="text-slate-700">ขายแล้ว (ชิ้น)</span><input type="number" min="0" inputMode="numeric" value={v.sold} onChange={set("sold")} className={`mt-1 ${input}`} /></label>
        <label className="block text-sm"><span className="text-slate-700">แบรนด์ของเราที่แข่ง</span>
          <select value={v.brand_id} onChange={set("brand_id")} className={`mt-1 ${input} bg-white`}><option value="">ไม่ระบุ</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <div className="block text-sm sm:col-span-2"><span className="text-slate-700">สินค้าเราที่เทียบ</span><div className="mt-1"><ParentSkuPicker value={ours} onChange={setOurs} placeholder="ค้นหารุ่นของเรา…" disableCreate /></div></div>
        <label className="block text-sm sm:col-span-2"><span className="text-slate-700">โน้ต</span><textarea value={v.note} onChange={set("note")} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="จุดเด่น/จุดด้อยของคู่แข่ง โปรที่จัด ฯลฯ" /></label>
      </div>
    </ERPModal>
  );
}
