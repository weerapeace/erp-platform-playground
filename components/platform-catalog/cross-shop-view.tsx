"use client";
/**
 * เช็กข้ามร้าน (หน้าสินค้าบนแพลตฟอร์ม ?view=cross) — แถวละ 1 สินค้าในระบบ (Parent SKU) × คอลัมน์ละ 1 ร้าน
 * เจ้าของเลือกแบบ A 2026-11-19: ตารางเดียว สลับ "เรื่องที่ตรวจ" (ลงร้านไหนแล้ว · ราคา · ชื่อ · รายละเอียด · สต๊อก · ตัวเลือก)
 *   + ช่องเหลือง "อาจมีแล้ว" (ตัวเดาคู่) + ส่งออก Excel + สต๊อก + ตัวเลือก
 * ข้อมูล: GET /api/platform-catalog/cross-shop (lib/platform-cross-shop-server) · กฎปัญหา = lib/platform-cross-shop (pure + เทสต์)
 * อ่านอย่างเดียว — ทางแก้ใช้ของเดิม: ติ๊ก → ตัวช่วยลงสินค้า (สร้างร่างก่อน ไม่ขึ้นร้านจนกดยืนยัน) · กดช่อง → ลิ้นชักรายการบนร้าน (แก้ตามสิทธิ์ ถามก่อนส่ง)
 * ป้ายพร้อมลง: ตัวตรวจเดียวกับตัวช่วย (/api/product-platforms/create-readiness) — ตรวจเฉพาะแถวที่เลื่อนมาเห็นบนจอ ทีละ 2 แถว · จำผล 10 นาที
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useSWRLite } from "@/lib/swr-lite";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { HoverImage } from "@/components/hover-image";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import { useUserPref } from "@/lib/use-user-pref";
import { useMediaQuery } from "@/lib/use-media-query";
import { exportTable, type ExportColumn } from "@/lib/export";
import { readinessText, type CreateReadiness } from "@/lib/platform-create-readiness";
import {
  CROSS_DIMS, TITLE_LIMITS, activeShops, cellIssues, matchPresence, missingShopCodes, presenceCounts, rowHasIssue, titleLength,
  type CellIssue, type CrossCell, type CrossDim, type CrossRow, type CrossShopResponse, type PresenceFilter,
} from "@/lib/platform-cross-shop";
import type { AddWizardParent } from "@/components/platform-listing/add-to-platform-wizard";

const AddToPlatformWizard = dynamic(() => import("@/components/platform-listing/add-to-platform-wizard").then((m) => m.AddToPlatformWizard), { ssr: false });
const ListingDrawer = dynamic(() => import("./listing-drawer").then((m) => m.ListingDrawer), { ssr: false });

const SHORT: Record<string, string> = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE", website: "Website" };
const shortName = (code: string, name: string) => SHORT[code] ?? name;
const baht = (n: number | null | undefined) => (n == null ? "—" : `฿${Math.round(n).toLocaleString()}`);
const parseDim = (v: unknown): CrossDim | null => (CROSS_DIMS.some((d) => d.key === v) ? v as CrossDim : null);

const STATE_LABEL: Record<string, string> = {
  selling: "ขายอยู่", low: "ใกล้หมด", out: "หมด", hidden: "ปิดขาย", review: "รอตรวจ", nodata: "ลงแล้ว", maybe: "อาจมีแล้ว", none: "ยังไม่ลง", off: "ซ่อน",
};
const STATE_CLS: Record<string, string> = {
  selling: "bg-emerald-50 text-emerald-700 border-emerald-200", low: "bg-amber-50 text-amber-700 border-amber-200",
  out: "bg-rose-50 text-rose-700 border-rose-200", hidden: "bg-slate-100 text-slate-600 border-slate-200",
  review: "bg-sky-50 text-sky-700 border-sky-200", nodata: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maybe: "bg-amber-50 text-amber-800 border-amber-300", none: "bg-white text-rose-600 border-rose-300 border-dashed", off: "bg-transparent text-slate-300 border-transparent",
};
const TONE_CLS: Record<CellIssue["tone"], string> = { danger: "text-rose-700", warning: "text-amber-700", info: "text-slate-500" };

// ───────── ป้ายพร้อมลง (ตรวจเฉพาะแถวที่เห็นบนจอ · ทีละ 2 · จำ 10 นาที) ─────────
type RdMap = Record<string, CreateReadiness>;
const RD_TTL = 10 * 60_000;
const RD_CONCURRENCY = 2;
const rdCache = new Map<string, { at: number; data: RdMap | null; error: string | null }>();
const rdWaiters = new Map<string, Set<() => void>>();
const rdQueue: { key: string; run: () => Promise<void> }[] = [];
let rdActive = 0;
function rdPump() {
  while (rdActive < RD_CONCURRENCY && rdQueue.length) {
    const job = rdQueue.shift()!;
    rdActive++;
    void job.run().finally(() => { rdActive--; rdWaiters.get(job.key)?.forEach((f) => f()); rdPump(); });
  }
}
function rdRequest(parentId: string, codes: string[]): string {
  const key = `${parentId}|${codes.join(",")}`;
  const hit = rdCache.get(key);
  if ((hit && Date.now() - hit.at < RD_TTL) || rdQueue.some((j) => j.key === key)) return key;
  rdQueue.push({ key, run: async () => {
    try {
      const j = await apiFetch(`/api/product-platforms/create-readiness?parent_sku_id=${encodeURIComponent(parentId)}&codes=${encodeURIComponent(codes.join(","))}`).then((r) => r.json()) as { data?: RdMap; error?: string | null };
      rdCache.set(key, { at: Date.now(), data: j.data ?? null, error: j.error ?? null });
    } catch (e) { rdCache.set(key, { at: Date.now(), data: null, error: (e as Error).message || "ตรวจไม่สำเร็จ" }); }
  } });
  rdPump();
  return key;
}

function ReadinessBadge({ parentId, codes, names }: { parentId: string; codes: string[]; names: Record<string, string> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  const [, bump] = useState(0);
  const key = `${parentId}|${codes.join(",")}`;
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  useEffect(() => {
    if (!seen || !codes.length) return;
    const f = () => bump((n) => n + 1);
    const set = rdWaiters.get(key) ?? rdWaiters.set(key, new Set()).get(key)!;
    set.add(f);
    rdRequest(parentId, codes);
    return () => { set.delete(f); };
  }, [seen, key, parentId, codes]);
  if (!codes.length) return <span ref={ref} className="text-xs text-slate-300">—</span>;
  const hit = rdCache.get(key);
  if (!hit) return <span ref={ref} className="text-xs text-slate-400">{seen ? "กำลังตรวจ…" : "รอตรวจ"}</span>;
  if (hit.error || !hit.data) return <span ref={ref} className="text-xs text-rose-600" title={hit.error ?? ""}>ตรวจไม่สำเร็จ</span>;
  const list = codes.map((c) => hit.data?.[c]).filter((r): r is CreateReadiness => !!r);
  if (!list.length) return <span ref={ref} className="text-xs text-slate-400" title="ร้านนี้ยังไม่มีตัวสร้างสินค้าในระบบ">ตรวจไม่ได้</span>;
  const ready = list.filter((r) => !r.error && !r.on_shop && !r.missing.length).length;
  const tip = list.map((r) => `${names[r.code] ?? r.code}: ${readinessText(r, 6).text}`).join("\n");
  return (
    <span ref={ref} title={tip} className={`inline-flex items-center gap-1 text-xs ${ready === list.length ? "text-emerald-700" : "text-amber-700"}`}>
      <Icon value={ready === list.length ? "i:circle-check" : "i:alert-triangle"} />
      {ready === list.length ? "พร้อมลง" : `พร้อม ${ready}/${list.length} ร้าน`}
    </span>
  );
}

// ───────── ช่องในตาราง ─────────
function CellView({ dim, row, code, brandName, shopCodes }: { dim: CrossDim; row: CrossRow; code: string; brandName: string; shopCodes: string[] }) {
  const c: CrossCell | undefined = row.cells[code];
  if (!c) return null;
  const issues = cellIssues(dim, row, code, brandName, shopCodes);
  const chip = (st: string, extra?: string) => (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] whitespace-nowrap ${STATE_CLS[st] ?? ""}`}>{STATE_LABEL[st] ?? st}{extra}</span>
  );
  const lines = (items: CellIssue[]) => items.map((i) => <div key={i.text} className={`text-[11px] leading-tight ${TONE_CLS[i.tone]}`}>{i.text}</div>);
  if (c.st === "off") return chip("off");
  if (dim === "status" || c.st === "none" || c.st === "maybe") {
    return (
      <div className="space-y-0.5" title={c.st === "maybe" && c.maybe ? `ตัวเดาคู่ชี้ว่ารายการ "${c.maybe.title ?? ""}" อาจเป็นสินค้านี้ (คะแนน ${c.maybe.score}) — ไปจับคู่ก่อน อย่าลงซ้ำ` : undefined}>
        {chip(c.st, c.listings > 1 ? ` ×${c.listings}` : "")}
        {dim === "status" && c.st !== "none" && c.st !== "maybe" && c.stock != null && <div className="text-[11px] text-slate-400">สต๊อก {c.stock.toLocaleString()}</div>}
      </div>
    );
  }
  if (dim === "price") {
    return (
      <div className="leading-tight">
        <div className={`text-xs ${c.pay_diff ? "text-rose-700 font-medium" : "text-slate-700"}`}>
          {c.sale != null ? <>{baht(c.sale)} <span className="text-[11px] text-slate-400 line-through">{baht(c.price)}</span></> : baht(c.price)}
        </div>
        {lines(issues)}
        {!issues.length && c.priced > 0 && <div className="text-[11px] text-emerald-600">ตรงกับระบบ</div>}
      </div>
    );
  }
  if (dim === "title") {
    const t = c.title ?? ""; const max = TITLE_LIMITS[code] ?? 0;
    return (
      <div className="leading-tight" title={t}>
        <div className="text-xs text-slate-700">{titleLength(code, t)}{max ? `/${max}` : ""} ตัวอักษร</div>
        {lines(issues)}
      </div>
    );
  }
  if (dim === "details") {
    return (
      <div className="leading-tight text-[11px] text-slate-600">
        <div>รูป {c.images ?? "—"} · หมวด {c.category == null ? "—" : c.category ? "มี" : "ไม่มี"}{c.weight != null ? ` · ${c.weight}kg` : ""}</div>
        {lines(issues)}
      </div>
    );
  }
  if (dim === "stock") {
    return (
      <div className="leading-tight">
        <div className="text-xs text-slate-700">{c.stock == null ? "ไม่รู้" : c.stock.toLocaleString()}</div>
        {lines(issues)}
      </div>
    );
  }
  return (
    <div className="leading-tight">
      <div className="text-xs text-slate-700">{c.vars} ตัวเลือก</div>
      {lines(issues)}
    </div>
  );
}

/** ข้อความช่องสำหรับ Excel (เรื่องที่ตรวจอยู่) */
function cellExport(dim: CrossDim, row: CrossRow, code: string, brandName: string, shopCodes: string[]): string {
  const c = row.cells[code]; if (!c) return "";
  const issues = cellIssues(dim, row, code, brandName, shopCodes).map((i) => i.text).join(" · ");
  if (c.st === "off" || c.st === "none" || c.st === "maybe" || dim === "status") return [STATE_LABEL[c.st], c.listings > 1 ? `ลงซ้ำ ${c.listings}` : ""].filter(Boolean).join(" · ");
  const head = dim === "price" ? (c.sale != null ? `${c.sale} (เต็ม ${c.price ?? "-"})` : String(c.price ?? ""))
    : dim === "title" ? (c.title ?? "")
    : dim === "details" ? `รูป ${c.images ?? "-"} · หมวด ${c.category == null ? "-" : c.category ? "มี" : "ไม่มี"} · น้ำหนัก ${c.weight ?? "-"}`
    : dim === "stock" ? String(c.stock ?? "ไม่รู้")
    : `${c.vars} ตัวเลือก`;
  return issues ? `${head} — ${issues}` : head;
}

export function CrossShopView({ brandId, brandName }: { brandId: string; brandName: string | null }) {
  const toast = useToast();
  const { can } = useAuth();
  const canAdd = can("products.platforms.edit");
  const canPublish = can("products.platforms.publish");
  const isPhone = useMediaQuery("(max-width: 767px)");
  const swr = useSWRLite<CrossShopResponse>(brandId ? `platform-cross-shop:${brandId}` : null, async () => {
    const r = await apiFetch(`/api/platform-catalog/cross-shop?brand_id=${encodeURIComponent(brandId)}`);
    const j = await r.json() as CrossShopResponse;
    if (j.error) throw new Error(j.error);
    return j;
  }, { focusStaleMs: 10 * 60_000, timeoutMs: 60_000 });
  const data = swr.data ?? null;
  const [dim, setDim] = useUserPref<CrossDim>("platform_cross_dim", "status", parseDim);
  const [presence, setPresence] = useState<PresenceFilter>("missing");
  const [onlyIssues, setOnlyIssues] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addFor, setAddFor] = useState<{ parents: AddWizardParent[]; codes: string[] } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setSelected(new Set()); setPage(1); setPresence("missing"); setQ(""); }, [brandId]);

  const bName = data?.brand?.name || brandName || "";
  const shops = useMemo(() => (data?.shops ?? []).filter((s) => s.state !== "noshop"), [data]);
  const on = useMemo(() => activeShops(data?.shops ?? []).map((s) => s.code), [data]);
  const names = useMemo(() => Object.fromEntries((data?.shops ?? []).map((s) => [s.code, shortName(s.code, s.name)])), [data]);
  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const counts = useMemo(() => presenceCounts(allRows, on), [allRows, on]);
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => allRows.filter((r) =>
    matchPresence(r, presence, on)
    && (dim === "status" || !onlyIssues || rowHasIssue(dim, r, on, bName))
    && (!needle || `${r.code} ${r.name ?? ""} ${r.name_platform ?? ""}`.toLowerCase().includes(needle))), [allRows, presence, on, dim, onlyIssues, bName, needle]);
  const issueCount = useMemo(() => (dim === "status" ? 0 : allRows.filter((r) => matchPresence(r, presence, on) && rowHasIssue(dim, r, on, bName)).length), [allRows, presence, on, dim, bName]);
  useEffect(() => { setPage(1); }, [presence, dim, onlyIssues, needle]);
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const selRows = useMemo(() => allRows.filter((r) => selected.has(r.id)), [allRows, selected]);
  const selMissing = useMemo(() => {
    const codes = new Set<string>(); let n = 0;
    for (const r of selRows) { const m = missingShopCodes(r, on); if (m.length) { n++; m.forEach((c) => codes.add(c)); } }
    return { n, codes: on.filter((c) => codes.has(c)) };
  }, [selRows, on]);

  const doExport = useCallback(async (rows: CrossRow[], mode: "selected" | "filtered_all") => {
    if (!rows.length) return;
    setExporting(true);
    try {
      const dimLabel = CROSS_DIMS.find((d) => d.key === dim)?.label ?? dim;
      const cols: ExportColumn[] = [
        { key: "code", header: "รหัสรุ่น", width: 14 }, { key: "name", header: "ชื่อสินค้า", width: 36 },
        { key: "our_sale", header: "ราคาขายในระบบ", width: 12 }, { key: "our_full", header: "ราคาเต็มในระบบ", width: 12 },
        ...shops.map((s) => ({ key: `shop_${s.code}`, header: `${names[s.code]} (${dimLabel})`, width: dim === "title" ? 60 : 28 })),
        { key: "missing", header: "ร้านที่ยังไม่ลง", width: 24 },
      ];
      const out = rows.map((r) => ({
        code: r.code, name: r.name ?? "", our_sale: r.our.sale ?? "", our_full: r.our.full ?? "",
        ...Object.fromEntries(shops.map((s) => [`shop_${s.code}`, cellExport(dim, r, s.code, bName, on)])),
        missing: missingShopCodes(r, on).map((c) => names[c]).join(", "),
      }));
      await exportTable({ format: "excel", filename: `เช็กข้ามร้าน-${bName || "แบรนด์"}-${dimLabel}`, rows: out, columns: cols, can: (p: string) => can(p as Parameters<typeof can>[0]),
        context: { entityType: "platform_cross_shop", mode, totalRows: out.length, filterDesc: `${dimLabel} · ${presence || "ทั้งหมด"}${needle ? ` · ค้น "${needle}"` : ""}` } });
    } catch (e) { toast.error((e as Error).message || "ส่งออกไม่สำเร็จ"); }
    finally { setExporting(false); }
  }, [dim, shops, names, bName, on, presence, needle, can, toast]);

  const dimInfo = CROSS_DIMS.find((d) => d.key === dim);
  const columns = useMemo<MiniColumn<CrossRow>[]>(() => [
    {
      key: "product", header: "สินค้า (Parent SKU)", width: "minmax(14rem,1.6fr)", locked: true,
      sortValue: (r) => r.code,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <HoverImage url={r2ImageUrl(r.cover_key, 160)} size={40} previewSize={300} rounded="rounded-md" fallback="—" />
          <div className="min-w-0">
            <div className="font-mono text-xs font-medium text-slate-800">{r.code}</div>
            <div className="truncate text-xs text-slate-500" title={r.name ?? ""}>{r.name ?? "—"}</div>
            <div className="text-[11px] text-slate-400">
              {dim === "price" ? `ระบบ ${baht(r.our.sale)}${r.our.full ? ` · เต็ม ${baht(r.our.full)}` : ""}`
                : dim === "stock" ? (r.our.stock == null ? "ระบบยังไม่มีสต๊อก (BigSeller คุม)" : `ระบบ ${r.our.stock.toLocaleString()}`)
                : dim === "variants" ? `ระบบเปิดขาย ${r.our.skus} SKU`
                : dim === "details" ? `ระบบ: รายละเอียด ${r.our.desc_len ? `${r.our.desc_len.toLocaleString()} ตัว` : "ยังไม่มี"} · ${r.our.weight_g ? `${r.our.weight_g}g` : "ไม่มีน้ำหนัก"} · ${r.our.box ? "มีขนาดกล่อง" : "ไม่มีขนาดกล่อง"}`
                : dim === "title" ? (r.name_platform ? `ชื่อแพลตฟอร์ม ${[...r.name_platform].length} ตัว` : "ยังไม่ตั้งชื่อแพลตฟอร์ม")
                : `${r.our.skus} SKU เปิดขาย`}
            </div>
          </div>
        </div>
      ),
      exportValue: (r) => r.code,
    },
    ...shops.map((s): MiniColumn<CrossRow> => ({
      key: `shop_${s.code}`, header: names[s.code] + (s.state === "hidden" ? " (ซ่อน)" : ""), width: "minmax(7.5rem,1fr)",
      sortValue: (r) => { const c = r.cells[s.code]; return c ? (c.st === "none" ? 0 : c.st === "maybe" ? 1 : 2) : 3; },
      cell: (r) => <CellView dim={dim} row={r} code={s.code} brandName={bName} shopCodes={on} />,
    })),
    ...(dim === "status" ? [{
      key: "ready", header: "พร้อมลงร้านที่ขาด", width: "minmax(8rem,0.9fr)",
      cell: (r: CrossRow) => <ReadinessBadge parentId={r.id} codes={missingShopCodes(r, on)} names={names} />,
    }] : []),
  ], [shops, names, dim, bName, on]);

  const onCell = useCallback((r: CrossRow, colKey: string) => {
    if (!colKey.startsWith("shop_")) return;
    const c = r.cells[colKey.slice(5)];
    const lid = c?.lid ?? c?.maybe?.lid ?? null;
    if (lid) setOpenId(lid);
  }, []);

  if (!brandId) return <EmptyState title="เลือกแบรนด์ก่อน" hint="เช็กข้ามร้านดูทีละแบรนด์ — เลือกแบรนด์ที่แถบซ้าย" />;
  if (!data && swr.loading) return <LoadingState label="กำลังรวมข้อมูลทุกร้าน… (ครั้งแรกอาจใช้ 5-15 วินาที)" />;
  if (!data && swr.error) return <ErrorState title="โหลดข้อมูลไม่สำเร็จ" hint={swr.error.message} onRetry={() => void swr.revalidate(true)} />;
  if (!data) return null;

  const unmatchedWarn = on.filter((c) => (data.unmatched[c] ?? 0) >= 20);
  const chip = (key: PresenceFilter, label: string) => (
    <button key={key || "all"} type="button" onClick={() => setPresence(key)} aria-pressed={presence === key}
      className={`h-8 shrink-0 rounded-full border px-3 text-xs whitespace-nowrap ${presence === key ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
      {label} <span className="tabular-nums text-slate-400">{(counts[key] ?? 0).toLocaleString()}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      {/* เรื่องที่ตรวจ */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-3 pb-2 [scrollbar-width:none]">
          {CROSS_DIMS.map((d) => (
            <button key={d.key} type="button" onClick={() => setDim(d.key)} aria-pressed={dim === d.key} title={d.why}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap ${dim === d.key ? "border-violet-300 bg-violet-50 font-medium text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <Icon value={`i:${d.icon}`} />{d.label}
            </button>
          ))}
        </div>
        <p className="px-3 pb-2 text-xs text-slate-500">{dimInfo?.why}{dim === "stock" ? " · สต๊อกบนร้านมาจากรอบดึงสินค้าล่าสุด" : ""}</p>

        {/* ตัวกรองการลงร้าน */}
        <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2 [scrollbar-width:none]">
          {chip("missing", "ขาดบางร้าน")}
          {chip("none", "ไม่อยู่ร้านไหนเลย")}
          {on.map((c) => chip(`miss:${c}`, `ขาด ${names[c]}`))}
          {chip("all", `ครบ ${on.length} ร้าน`)}
          {chip("", "ทั้งหมด")}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นรหัส / ชื่อสินค้า"
            className="h-9 min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
          {dim !== "status" && (
            <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-600">
              <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
              มีปัญหาเท่านั้น <span className="tabular-nums text-slate-400">{issueCount.toLocaleString()}</span>
            </label>
          )}
          <button type="button" disabled={exporting || !filtered.length} onClick={() => void doExport(filtered, "filtered_all")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Icon value="i:file-spreadsheet" />{exporting ? "กำลังส่งออก…" : `Excel (${filtered.length.toLocaleString()})`}
          </button>
          <button type="button" onClick={() => void swr.revalidate(true)} disabled={swr.loading} title="โหลดข้อมูลใหม่ (ข้อมูลบนร้านมาจากรอบดึงสินค้าล่าสุด)"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <Icon value="i:refresh" />{swr.loading ? "กำลังโหลด…" : "รีเฟรช"}
          </button>
        </div>

        {unmatchedWarn.length > 0 && (
          <div className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Icon value="i:alert-triangle" className="mt-0.5 shrink-0" />
            <span>
              ยังมีรายการบนร้านที่ไม่ได้จับคู่: {unmatchedWarn.map((c) => `${names[c]} ${data.unmatched[c].toLocaleString()}`).join(" · ")} —
              ช่องสีเหลือง &quot;อาจมีแล้ว&quot; = ระบบเดาว่าลงไว้แล้วแต่ยังไม่จับคู่ ควรไปจับคู่ก่อน (มุมมอง &quot;จับคู่ + ตั้งค่า&quot;) ไม่ใช่ลงซ้ำ
            </span>
          </div>
        )}

        <MiniTable rows={pageRows} columns={columns} rowKey={(r) => r.id}
          selectable selected={selected} onSelectedChange={setSelected}
          onCellClick={onCell} layout={isPhone ? "cards" : "table"} cardPick
          renderCard={(r) => (
            <div className="space-y-2 p-2">
              <div className="flex min-w-0 items-center gap-2">
                <HoverImage url={r2ImageUrl(r.cover_key, 120)} size={36} previewSize={240} rounded="rounded-md" fallback="—" />
                <div className="min-w-0">
                  <div className="font-mono text-xs font-medium text-slate-800">{r.code}</div>
                  <div className="truncate text-xs text-slate-500">{r.name ?? "—"}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                {shops.map((s) => (
                  <button key={s.code} type="button" onClick={(e) => { e.stopPropagation(); onCell(r, `shop_${s.code}`); }} className="min-w-0 text-left">
                    <div className="text-[11px] text-slate-400">{names[s.code]}</div>
                    <CellView dim={dim} row={r} code={s.code} brandName={bName} shopCodes={on} />
                  </button>
                ))}
              </div>
              {dim === "status" && missingShopCodes(r, on).length > 0 && (
                <div className="text-[11px] text-slate-500">พร้อมลง: <ReadinessBadge parentId={r.id} codes={missingShopCodes(r, on)} names={names} /></div>
              )}
            </div>
          )}
          hideToolbar dense stickyCols={1} resizable storageKey="platform-cross-shop"
          emptyText={needle ? "ไม่พบสินค้าที่ค้นหา" : presence === "missing" ? `สินค้า ${bName} ลงครบทุกร้านแล้ว` : dim !== "status" && onlyIssues ? "ไม่มีปัญหาเรื่องนี้" : "ไม่มีสินค้าในกลุ่มนี้"} />
        <div className="border-t border-slate-100 px-3 py-2">
          <Pager page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} unitLabel="สินค้า"
            onPageSize={(s) => { setPageSize(s); setPage(1); }} pageSizes={[25, 50, 100, 200]} />
        </div>
        {(data.shops ?? []).some((s) => s.state === "noshop") && (
          <p className="px-3 pb-3 text-[11px] text-slate-400">
            ไม่แสดง: {(data.shops ?? []).filter((s) => s.state === "noshop").map((s) => shortName(s.code, s.name)).join(", ")} (แบรนด์นี้ยังไม่มีร้าน/ยังไม่มีสินค้าบนร้าน)
            · ร้านที่ซ่อนทั้งแบรนด์ตั้งได้ที่แท็บแพลตฟอร์มของ Parent SKU
          </p>
        )}
      </div>

      <BulkActionBar count={selected.size} unit="สินค้า" onClear={() => setSelected(new Set())}
        extra={selMissing.n < selected.size ? `${(selected.size - selMissing.n).toLocaleString()} ตัวลงครบแล้ว/รอจับคู่ จะไม่ถูกส่งเข้าตัวช่วย` : undefined}>
        {canAdd && selMissing.n > 0 && (
          <button type="button" onClick={() => setAddFor({ parents: selRows.filter((r) => missingShopCodes(r, on).length).map((r) => ({ id: r.id, code: r.code, name: r.name })), codes: selMissing.codes })}
            title="เปิดตัวช่วยลงสินค้า — สร้างเป็นร่างก่อน ไม่ขึ้นร้านจนกว่าจะกดยืนยันในตัวช่วย"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-500 px-3 text-sm text-white hover:bg-violet-400">
            <Icon name="upload" />ลงร้านที่ขาด ({selMissing.n.toLocaleString()})
          </button>
        )}
        <button type="button" disabled={exporting} onClick={() => void doExport(selRows, "selected")}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50">
          <Icon value="i:file-spreadsheet" />Excel ({selected.size.toLocaleString()})
        </button>
      </BulkActionBar>

      {addFor && (
        <AddToPlatformWizard open parents={addFor.parents} brandId={brandId} initialPlatformCodes={addFor.codes}
          onClose={() => { setAddFor(null); setSelected(new Set()); }} onDone={() => void swr.revalidate(true)} />
      )}
      <ListingDrawer listingId={openId} onClose={() => setOpenId(null)} canPublish={canPublish} onChanged={() => void swr.revalidate(true)} />
    </div>
  );
}
