"use client";

/**
 * แท็บ "โฆษณา" ของหน้าภาพรวมการตลาด — ข้อมูลจาก /api/marketing/ads-overview (โหลดเมื่อเปิดแท็บ)
 * --------------------------------------------------------------------------
 * เจ้าของเลือก 2026-11-24 (แผนการตลาด รอบ 3 · แบบ A + ข้อ 1 Shopee Ads อัตโนมัติ · 2 ROAS จุดคุ้มทุนต่อแบรนด์ · 3 เตือนขาดทุน 3 วันติด
 *   · 4 ค่าแอฟฟิลิเอต/Boost จากค่าธรรมเนียม · 5 รวมไฟล์ที่อัปโหลด · 6 เชื่อม Meta Ads)
 * แก้/ย้อน/ลบ: จุดคุ้มทุน ตั้ง-แก้-ลบได้ + ปุ่มย้อนกลับ · บัญชีโฆษณา ปิด/เปิดดึงได้ + ย้อนกลับ · ตัดการเชื่อม Meta (ยืนยันก่อน · ยอดเก่ายังอยู่)
 * ของกลาง: DataTable · SimpleBarChart · ERPModal · ConfirmDialog · ToggleSwitch · PlatformIcon · Icon · useToast · Loading/Error/EmptyState
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PlatformIcon } from "@/components/platform-icon";
import { SimpleBarChart } from "@/components/bar-chart";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ToggleSwitch } from "@/components/toggle-switch";
import { DataTable, type DataTableView } from "@/components/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { TH_MONTHS } from "@/lib/date-range";
import type { AdsStatus, CampaignAgg } from "@/lib/marketing-ads-calc";

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const num = (n: number) => Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => (Math.abs(n) >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 10_000 ? `฿${(n / 1_000).toFixed(1)}K` : baht(n));
const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const roasTxt = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}x`);
const shortDate = (ymd: string) => `${+ymd.slice(8, 10)} ${TH_MONTHS[+ymd.slice(5, 7) - 1]}`;
const ago = (iso: string | null) => { if (!iso) return "ยังไม่เคย"; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${m} นาทีก่อน` : m < 1440 ? `${Math.round(m / 60)} ชม.ก่อน` : `${Math.round(m / 1440)} วันก่อน`; };

const STATUS: Record<AdsStatus, { label: string; cls: string }> = {
  profit: { label: "ทำกำไร", cls: "bg-emerald-50 text-emerald-700" },
  near: { label: "เฉียดทุน", cls: "bg-amber-50 text-amber-700" },
  loss: { label: "ขาดทุน", cls: "bg-rose-50 text-rose-700" },
  unknown: { label: "ยังไม่ตั้งจุดคุ้มทุน", cls: "bg-slate-100 text-slate-500" },
};
const PF_NAME: Record<string, string> = { shopee: "Shopee Ads", meta: "Meta (Facebook/IG)" };

type Campaign = CampaignAgg & { brand_name: string };
type FileRow = { platform: string; shop: string | null; period_start: string; period_end: string; campaign_name: string | null; ad_type: string | null; clicks: number | null; orders: number | null; sales: number | null; spend: number | null; roas: number | null; status: AdsStatus };
type Account = { platform: string; brand_id: string | null; brand_name: string; account_id: string; account_name: string | null; is_active: boolean; last_sync_at: string | null; last_ok_at: string | null; last_error: string | null; token_expires_at: string | null };
type Resp = {
  range: { from: string; to: string };
  kpi: { spend: number; adSales: number; roas: number | null; acos: number | null; totalSales: number; tacos: number | null; affiliateFee: number; marketingCost: number; marketingPct: number | null; clicks: number; impressions: number; orders: number; breakeven: number | null; status: AdsStatus };
  daily: { date: string; spend: number; sales: number; byPlatform: Record<string, number> }[];
  campaigns: Campaign[];
  files: FileRow[];
  affiliate: { platform: string; fee: number; covered: number; orders: number }[];
  accounts: Account[];
  breakeven: { cfg: Record<string, number>; current: number | null; brands: { id: string; name: string }[] };
  notes: string[];
  error: string | null;
};

function Card({ label, value, sub, subCls = "text-slate-500", tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; subCls?: string; tone?: "danger" | "success" | "warning" }) {
  const tc = tone === "danger" ? "text-rose-600" : tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold sm:text-2xl ${tc}`}>{value}</div>
      {sub != null && <div className={`mt-0.5 text-xs ${subCls}`}>{sub}</div>}
    </div>
  );
}
const toneOf = (s: AdsStatus) => (s === "profit" ? "success" : s === "near" ? "warning" : s === "loss" ? "danger" : undefined);

export function AdsTab({ from, to, brandId, brands, reloadKey }: { from: string; to: string; brandId: string; brands: { id: string; name: string }[]; reloadKey: number }) {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.platforms.edit");
  const canAccounts = can("products.platforms.manage_accounts");
  const [platform, setPlatform] = useState("");
  const [d, setD] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [beOpen, setBeOpen] = useState(false);
  const [disconnect, setDisconnect] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const q = new URLSearchParams({ from, to });
    if (brandId) q.set("brand_id", brandId);
    if (platform) q.set("platform", platform);
    try {
      const res = await apiFetch(`/api/marketing/ads-overview?${q}`);
      const j = (await res.json()) as Resp;
      if (!res.ok || j.error) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ");
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [from, to, brandId, platform]);
  useEffect(() => { void load(); }, [load, reloadKey]);

  // กลับมาจากหน้าอนุญาต Meta
  useEffect(() => {
    const u = new URL(window.location.href);
    const ok = u.searchParams.get("meta_ads"), bad = u.searchParams.get("meta_ads_error");
    if (!ok && !bad) return;
    if (ok) toast.success(`เชื่อม Meta Ads แล้ว (${u.searchParams.get("n") ?? ""} บัญชีโฆษณา) — กด "ดึงตอนนี้" เพื่อดึงยอด`); else toast.error(bad ?? "เชื่อม Meta Ads ไม่สำเร็จ");
    for (const k of ["meta_ads", "meta_ads_error", "n"]) u.searchParams.delete(k);
    window.history.replaceState(null, "", u.toString());
  }, [toast]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const j = await apiFetch(`/api/cron/marketing-ads${brandId ? `?brand_id=${encodeURIComponent(brandId)}` : ""}`, { method: "POST" }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      toast.success(j.summary || "ดึงยอดโฆษณาแล้ว");
      void load();
    } catch (e) { toast.error(`ดึงยอดโฆษณาไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setSyncing(false); }
  };
  const connectMeta = async () => {
    if (!brandId) { toast.error("เลือกแบรนด์ที่มุมขวาบนก่อน แล้วค่อยกดเชื่อม Meta Ads"); return; }
    try {
      const j = await apiFetch(`/api/marketing/ads/meta/start?brand_id=${encodeURIComponent(brandId)}`).then((r) => r.json());
      if (j.error || !j.auth_url) throw new Error(j.error || "เริ่มเชื่อมไม่สำเร็จ");
      window.location.href = j.auth_url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "เริ่มเชื่อมไม่สำเร็จ"); }
  };
  const setActive = async (a: Account, on: boolean, quiet = false) => {
    const j = await apiFetch("/api/marketing/ads/accounts", { method: "PATCH", body: JSON.stringify({ platform: a.platform, account_id: a.account_id, is_active: on }) }).then((r) => r.json());
    if (j.error) { toast.error(j.error); return; }
    void load();
    if (!quiet) toast.undo(on ? `เปิดดึง ${a.account_name ?? a.account_id} แล้ว` : `ปิดดึง ${a.account_name ?? a.account_id} แล้ว (ยอดเก่ายังอยู่)`, () => void setActive(a, !on, true), { ms: 8000 });
  };
  const doDisconnect = async () => {
    const j = await apiFetch("/api/marketing/ads/accounts", { method: "PATCH", body: JSON.stringify({ platform: "meta", disconnect: true, brand_id: brandId }) }).then((r) => r.json());
    setDisconnect(false);
    if (j.error) { toast.error(j.error); return; }
    toast.success("ตัดการเชื่อม Meta Ads แล้ว — ยอดเก่ายังดูได้ · เชื่อมใหม่ได้ทุกเมื่อ");
    void load();
  };

  const cols = useMemo<ColumnDef<Campaign>[]>(() => [
    { accessorKey: "name", header: "แคมเปญ", cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <PlatformIcon code={row.original.platform === "meta" ? "facebook" : row.original.platform} size={16} />
        <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{row.original.name}</span>
          <span className="block truncate text-xs text-slate-500">{[row.original.brand_name, row.original.ad_type].filter(Boolean).join(" · ")}</span></span>
      </span>
    ) },
    { accessorKey: "spend", header: "ค่าโฆษณา", cell: ({ getValue }) => baht(getValue() as number) },
    { accessorKey: "sales", header: "ยอดจากโฆษณา", cell: ({ getValue }) => baht(getValue() as number) },
    { accessorKey: "roas", header: "ROAS", cell: ({ row }) => <span title={row.original.breakeven ? `คุ้มทุนที่ ${row.original.breakeven}x` : "ยังไม่ตั้งจุดคุ้มทุน"}>{roasTxt(row.original.roas)}</span> },
    { accessorKey: "status", header: "สถานะ", cell: ({ row }) => (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS[row.original.status].cls}`}>{STATUS[row.original.status].label}</span>
        {row.original.lossStreak >= 3 && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-xs text-white">ขาดทุน {row.original.lossStreak} วันติด</span>}
      </span>
    ) },
    { accessorKey: "orders", header: "ออเดอร์", cell: ({ row }) => <span title={row.original.messages ? `แชต ${num(row.original.messages)} ครั้ง` : undefined}>{num(row.original.orders)}{row.original.messages ? <span className="ml-1 text-xs text-slate-400">· แชต {num(row.original.messages)}</span> : null}</span> },
    { accessorKey: "clicks", header: "คลิก", cell: ({ getValue }) => num(getValue() as number) },
    { accessorKey: "ctr", header: "CTR", cell: ({ getValue }) => pct(getValue() as number | null, 2) },
    { accessorKey: "cpc", header: "ค่าต่อคลิก", cell: ({ getValue }) => { const v = getValue() as number | null; return v == null ? "—" : `฿${v.toFixed(2)}`; } },
  ], []);
  const views = useMemo<DataTableView[]>(() => [
    { id: "all", label: "ทั้งหมด" },
    { id: "loss", label: "ขาดทุน", filter: (r) => (r as unknown as Campaign).status === "loss" },
    { id: "streak", label: "ขาดทุน 3 วันติด", filter: (r) => (r as unknown as Campaign).lossStreak >= 3 },
    { id: "near", label: "เฉียดทุน", filter: (r) => (r as unknown as Campaign).status === "near" },
    { id: "profit", label: "ทำกำไร", filter: (r) => (r as unknown as Campaign).status === "profit" },
  ], []);
  const fileCols = useMemo<ColumnDef<FileRow>[]>(() => [
    { accessorKey: "campaign_name", header: "แคมเปญ (จากไฟล์)", cell: ({ row }) => <span><span className="block font-medium text-slate-800">{row.original.campaign_name ?? "—"}</span><span className="block text-xs text-slate-500">{row.original.platform} · {row.original.shop ?? ""} · {shortDate(row.original.period_start)}–{shortDate(row.original.period_end)}</span></span> },
    { accessorKey: "spend", header: "ค่าโฆษณา", cell: ({ getValue }) => baht(Number(getValue()) || 0) },
    { accessorKey: "sales", header: "ยอดจากโฆษณา", cell: ({ getValue }) => baht(Number(getValue()) || 0) },
    { accessorKey: "roas", header: "ROAS", cell: ({ getValue }) => roasTxt(getValue() as number | null) },
    { accessorKey: "status", header: "สถานะ", cell: ({ row }) => <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS[row.original.status].cls}`}>{STATUS[row.original.status].label}</span> },
  ], []);

  if (loading && !d) return <LoadingState label="กำลังรวมยอดโฆษณา…" />;
  if (err && !d) return <ErrorState title="โหลดข้อมูลโฆษณาไม่สำเร็จ" hint={err} onRetry={() => void load()} />;
  if (!d) return null;
  const k = d.kpi;
  const metaAccts = d.accounts.filter((a) => a.platform === "meta");
  return (
    <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`}>
      {/* แหล่งข้อมูล */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">ดู:</span>
            {[["", "ทุกแหล่ง"], ["shopee", "Shopee Ads"], ["meta", "Meta"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setPlatform(v)} className={`rounded-full border px-3 py-1 text-xs ${platform === v ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && <button type="button" onClick={() => setBeOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><Icon name="target" /> จุดคุ้มทุน</button>}
            {canAccounts && <button type="button" onClick={() => void connectMeta()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"><PlatformIcon code="facebook" size={14} /> {metaAccts.length ? "เชื่อม Meta Ads ใหม่" : "เชื่อม Meta Ads"}</button>}
            <button type="button" disabled={syncing} onClick={() => void syncNow()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60"><Icon name="refresh" /> {syncing ? "กำลังดึง…" : "ดึงตอนนี้"}</button>
          </div>
        </div>
        {d.accounts.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {d.accounts.map((a) => (
              <li key={`${a.platform}-${a.account_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <PlatformIcon code={a.platform === "meta" ? "facebook" : a.platform} size={16} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{a.account_name || a.account_id} <span className="font-normal text-slate-400">· {PF_NAME[a.platform] ?? a.platform}{a.brand_name ? ` · ${a.brand_name}` : ""}</span></span>
                    <span className={`block text-xs ${a.last_error ? "text-rose-600" : "text-slate-500"}`}>{a.last_error ? a.last_error : `ดึงสำเร็จล่าสุด ${ago(a.last_ok_at)}`}</span>
                  </span>
                </span>
                {canAccounts && <ToggleSwitch size="sm" on={a.is_active} onChange={(v) => void setActive(a, v)} label={a.is_active ? "ดึงอยู่" : "ปิดดึง"} />}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-xs text-slate-500">ยังไม่มีบัญชีโฆษณา — Shopee จะขึ้นเองหลังตัวดึงรอบแรก (หรือกด “ดึงตอนนี้”) · Meta ต้องกด “เชื่อม Meta Ads”</p>}
        {canAccounts && brandId && metaAccts.some((a) => a.brand_id === brandId) && (
          <button type="button" onClick={() => setDisconnect(true)} className="mt-2 text-xs text-rose-600 hover:underline">ตัดการเชื่อม Meta Ads ของแบรนด์นี้</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="ค่าโฆษณา" value={bahtShort(k.spend)} sub={k.affiliateFee > 0 ? `+ แอฟฟิลิเอต/Boost ${bahtShort(k.affiliateFee)}` : `${num(k.clicks)} คลิก`} />
        <Card label="ยอดจากโฆษณา" value={bahtShort(k.adSales)} sub={`${num(k.orders)} ออเดอร์ · ACOS ${pct(k.acos)}`} />
        <Card label="ROAS" value={roasTxt(k.roas)} tone={toneOf(k.status)} sub={k.breakeven ? `คุ้มทุนที่ ${k.breakeven}x · ${STATUS[k.status].label}` : "ยังไม่ตั้งจุดคุ้มทุน"} subCls={k.breakeven ? "text-slate-500" : "text-amber-600"} />
        <Card label="ค่าการตลาด ÷ ยอดขายรวม" value={pct(k.marketingPct)} sub={`ยอดขายรวม ${bahtShort(k.totalSales)} · โฆษณาล้วน ${pct(k.tacos)}`} />
      </div>

      {d.daily.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-slate-800">ค่าโฆษณารายวัน</h2>
          <SimpleBarChart data={d.daily.map((x) => ({ key: x.date, label: shortDate(x.date), value: x.spend, hint: `ยอดจากโฆษณา ${baht(x.sales)} · ROAS ${roasTxt(x.spend > 0 ? x.sales / x.spend : null)}` }))} format={bahtShort} height={180} barColor="#8b5cf6" barHoverColor="#7c3aed" ariaLabel="ค่าโฆษณารายวัน" />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
        {d.campaigns.length ? (
          <DataTable<Campaign> tableId="marketing-ads-campaigns" data={d.campaigns} columns={cols} views={views} pageSize={25}
            searchableKeys={["name", "brand_name", "ad_type"]} searchPlaceholder="ค้นหาชื่อแคมเปญ…"
            exportFilename="marketing-ads-campaigns" exportEntityType="marketing_overview" emptyMessage="ไม่มีแคมเปญในช่วงนี้" />
        ) : <EmptyState title="ยังไม่มียอดรายแคมเปญในช่วงนี้" hint="ตัวดึงทำงานวันละ 2 รอบ (08:40 / 20:40) — หรือกด “ดึงตอนนี้” · ถ้าขึ้นข้อผิดพลาดที่บัญชีด้านบน ให้ทำตามที่บอก" />}
      </div>

      {d.files.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-4">
          <p className="mb-2 px-2 text-xs text-slate-500">จากไฟล์ที่อัปโหลด (หน้า “นำเข้าไฟล์”) — ช่องทางที่ยังไม่มีตัวดึงอัตโนมัติ</p>
          <DataTable<FileRow> tableId="marketing-ads-files" data={d.files} columns={fileCols} pageSize={20} exportFilename="marketing-ads-files" exportEntityType="marketing_overview" emptyMessage="—" />
        </div>
      )}

      {d.affiliate.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-sm font-medium text-slate-800">ค่าแอฟฟิลิเอต / Boost (จากค่าธรรมเนียมจริงต่อออเดอร์)</h2>
          <ul className="divide-y divide-slate-100">
            {d.affiliate.map((a) => <li key={a.platform} className="flex justify-between gap-2 py-1.5"><span className="inline-flex items-center gap-1.5"><PlatformIcon code={a.platform} size={14} /> {a.platform}</span><span>{baht(a.fee)} <span className="text-xs text-slate-400">({num(a.covered)}/{num(a.orders)} ใบที่ดึงค่าธรรมเนียมแล้ว)</span></span></li>)}
          </ul>
        </div>
      )}

      <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {d.notes.map((n) => <li key={n} className="flex gap-1.5"><Icon name="info" className="mt-0.5 shrink-0" /> {n}</li>)}
      </ul>

      {beOpen && <BreakevenModal cfg={d.breakeven.cfg} brands={brands} onClose={() => setBeOpen(false)} onSaved={() => void load()} />}
      <ConfirmDialog open={disconnect} onClose={() => setDisconnect(false)} onConfirm={() => void doDisconnect()} variant="danger"
        title="ตัดการเชื่อม Meta Ads ของแบรนด์นี้?" message="ระบบจะหยุดดึงยอดและลบกุญแจที่เก็บไว้ · ยอดโฆษณาเก่ายังดูได้ · เชื่อมใหม่ได้ทุกเมื่อ" confirmText="ตัดการเชื่อม" />
    </div>
  );
}

function BreakevenModal({ cfg, brands, onClose, onSaved }: { cfg: Record<string, number>; brands: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const init = useMemo(() => { const m: Record<string, string> = {}; for (const [k, v] of Object.entries(cfg ?? {})) m[k] = String(v); return m; }, [cfg]);
  const [vals, setVals] = useState<Record<string, string>>(init);
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys({ ...vals, ...init }).some((k) => (vals[k] ?? "") !== (init[k] ?? ""));
  const send = async (key: string, v: string) => {
    const j = await apiFetch("/api/marketing/ads-overview", { method: "PATCH", body: JSON.stringify({ brand_id: key === "*" ? null : key, roas: v ? Number(v) : null }) }).then((r) => r.json());
    if (j.error) throw new Error(j.error);
  };
  const save = async () => {
    const changed = Object.keys({ ...vals, ...init }).filter((k) => (vals[k] ?? "") !== (init[k] ?? ""));
    const bad = changed.find((k) => vals[k] && !(Number(vals[k]) > 0 && Number(vals[k]) <= 100));
    if (bad) { toast.error("ROAS ต้องเป็นตัวเลขมากกว่า 0 และไม่เกิน 100"); return; }
    setSaving(true);
    try {
      for (const k of changed) await send(k, vals[k] ?? "");
      onClose(); onSaved();
      toast.undo("บันทึกจุดคุ้มทุนแล้ว", async () => {
        try { for (const k of changed) await send(k, init[k] ?? ""); toast.success("ย้อนจุดคุ้มทุนกลับแล้ว"); onSaved(); } catch (e) { toast.error(`ย้อนกลับไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
      }, { ms: 8000 });
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ: ${e instanceof Error ? e.message : ""}`); }
    finally { setSaving(false); }
  };
  // เรียกเป็นฟังก์ชัน (ไม่ใช่ <Field/>) กันช่องหลุดโฟกัสทุกครั้งที่พิมพ์
  const field = (k: string, label: string) => (
    <label key={k} className="flex items-center gap-2 text-sm">
      <span className="w-40 shrink-0 truncate text-slate-700">{label}</span>
      <input type="number" inputMode="decimal" step="0.1" min="0" value={vals[k] ?? ""} onChange={(e) => setVals((s) => ({ ...s, [k]: e.target.value }))} placeholder={k === "*" ? "เช่น 3" : "ใช้ค่าทุกแบรนด์"} className="h-9 w-full rounded-lg border border-slate-200 px-3" />
      <span className="text-slate-400">x</span>
    </label>
  );
  return (
    <ERPModal open onClose={onClose} size="sm" title="ROAS จุดคุ้มทุน" hasUnsavedChanges={dirty} loading={saving}
      footer={<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm">ยกเลิก</button><button type="button" disabled={saving || !dirty} onClick={() => void save()} className="h-9 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">บันทึก</button></div>}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">ROAS ต่ำสุดที่ยังไม่ขาดทุน เช่น กำไรขั้นต้นหลังค่าธรรมเนียม 33% ของราคา → คุ้มทุนที่ 1 ÷ 0.33 ≈ 3x · ต่ำกว่านี้ = ขาดทุน · สูงกว่า 1.2 เท่าของค่านี้ = ทำกำไร · ลบเลขออก = ไม่ตั้ง</p>
        {field("*", "ทุกแบรนด์ (ค่าเริ่มต้น)")}
        <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">ตั้งแยกแบรนด์ (ไม่ตั้ง = ใช้ค่าทุกแบรนด์)</div>
        {brands.map((b) => field(b.id, b.name))}
      </div>
    </ERPModal>
  );
}
