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
  CROSS_DIMS, TITLE_LIMITS, WEBSITE, activeShops, cellIssues, listableMissing, matchPresence, missingShopCodes, presenceCounts, rowHasIssue, titleLength,
  type CellIssue, type CrossCell, type CrossDim, type CrossReady, type CrossRow, type CrossShopResponse, type PresenceFilter,
} from "@/lib/platform-cross-shop";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import type { AddWizardParent } from "@/components/platform-listing/add-to-platform-wizard";
import type { FakePriceRow } from "@/components/fake-price-dialog";

const AddToPlatformWizard = dynamic(() => import("@/components/platform-listing/add-to-platform-wizard").then((m) => m.AddToPlatformWizard), { ssr: false });
const ListingDrawer = dynamic(() => import("./listing-drawer").then((m) => m.ListingDrawer), { ssr: false });
const FakePriceDialog = dynamic(() => import("@/components/fake-price-dialog").then((m) => m.FakePriceDialog), { ssr: false });

/** ราคาบนร้านไม่ตรงระบบ (ข้อ 3) — ลูกค้าจ่ายไม่ตรง หรือราคาเต็มไม่ตรง (TikTok เทียบราคาเต็มไม่ได้จริง → นับแค่ราคาจ่าย) */
const priceMismatch = (r: CrossRow, code: string): boolean => {
  const c = r.cells[code];
  if (!c || code === WEBSITE || c.st === "none" || c.st === "maybe" || c.st === "off") return false;
  return c.pay_diff > 0 || (code !== "tiktok" && c.full_diff > 0);
};
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const fmtAt = (iso: string) => { try { return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };

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

function ReadinessBadge({ parentId, codes, names, stored }: { parentId: string; codes: string[]; names: Record<string, string>; stored?: Record<string, CrossReady> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  const [live, setLive] = useState(false);
  const [, bump] = useState(0);
  const key = `${parentId}|${codes.join(",")}`;
  // ข้อ 6: มีผลที่ตรวจไว้ครบทุกร้าน (cron ทุกคืน / ตรวจสดล่าสุด) → ขึ้นทันที ไม่ต้องรอ · กดป้าย = ตรวจสดใหม่
  const allStored = !!stored && codes.length > 0 && codes.every((c) => stored[c]);
  const useStored = allStored && !live && !rdCache.has(key);
  useEffect(() => {
    if (useStored) return;
    const el = ref.current; if (!el || seen) return;
    // ดูทั้ง "แถว" ไม่ใช่ตัวป้าย — คอลัมน์นี้อยู่ขวาสุด จอแคบตารางเลื่อนแนวนอน ป้ายพ้นจอ = ไม่เคยตรวจ (เจอตอน recheck 2026-11-20)
    const target = el.closest<HTMLElement>(".divide-y > *") ?? el;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "100px" });
    io.observe(target);
    return () => io.disconnect();
  }, [seen, useStored]);
  useEffect(() => {
    if (!seen || !codes.length) return;
    const f = () => bump((n) => n + 1);
    const set = rdWaiters.get(key) ?? rdWaiters.set(key, new Set()).get(key)!;
    set.add(f);
    rdRequest(parentId, codes);
    return () => { set.delete(f); };
  }, [seen, key, parentId, codes]);
  if (!codes.length) return <span ref={ref} className="text-xs text-slate-300">—</span>;
  if (useStored && stored) {
    const list = codes.map((c) => ({ code: c, ...stored[c], error: null }));
    const ready = list.filter((r) => r.ready).length;
    const oldest = list.map((r) => r.at).sort()[0];
    const tip = `${list.map((r) => `${names[r.code] ?? r.code}: ${readinessText(r, 6).text}`).join("\n")}\nตรวจเมื่อ ${fmtAt(oldest)} — กดเพื่อตรวจใหม่ตอนนี้`;
    return (
      <button type="button" title={tip} onClick={(e) => { e.stopPropagation(); setLive(true); setSeen(true); }}
        className={`inline-flex items-center gap-1 text-xs hover:underline ${ready === list.length ? "text-emerald-700" : "text-amber-700"}`}>
        <Icon value={ready === list.length ? "i:circle-check" : "i:alert-triangle"} />
        {ready === list.length ? "พร้อมลง" : `พร้อม ${ready}/${list.length} ร้าน`}
      </button>
    );
  }
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
  if (code === WEBSITE) {
    const label = c.st === "selling" ? "ขึ้นเว็บแล้ว" : c.st === "hidden" ? "เพิ่มแล้ว·ซ่อน" : "ยังไม่ขึ้นเว็บ";
    return (
      <div className="space-y-0.5" title={c.web_shops?.length ? `หน้าร้าน: ${c.web_shops.join(", ")} — กดเพื่อเปิดแท็บเว็บไซต์ของสินค้านี้` : "กดเพื่อเปิด Parent SKU แล้วไปแท็บ \"เว็บไซต์\" เพื่อเพิ่มขึ้นหน้าร้าน"}>
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] whitespace-nowrap ${STATE_CLS[c.st] ?? ""}`}>{label}</span>
      </div>
    );
  }
  if (dim === "status" || c.st === "none" || c.st === "maybe") {
    return (
      <div className="space-y-0.5" title={c.st === "maybe" && c.maybe ? `ตัวเดาคู่ชี้ว่ารายการ "${c.maybe.title ?? ""}" อาจเป็นสินค้านี้ (คะแนน ${c.maybe.score}) — ไปจับคู่ก่อน อย่าลงซ้ำ` : c.listings > 1 ? `ลงซ้ำ ${c.listings} รายการ — กดเพื่อดูทุกตัว` : undefined}>
        {chip(c.st, c.listings > 1 ? ` ×${c.listings}` : "")}
        {c.listings > 1 && <div className="text-[11px] text-amber-700 underline decoration-dotted">ดูตัวซ้ำ</div>}
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
  if (code === WEBSITE) return c.st === "off" ? STATE_LABEL.off : c.st === "selling" ? `ขึ้นเว็บแล้ว (${(c.web_shops ?? []).join(", ")})` : c.st === "hidden" ? `เพิ่มแล้วแต่ซ่อน (${(c.web_shops ?? []).join(", ")})` : "ยังไม่ขึ้นเว็บ";
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
  const canEditProducts = can("products.edit");
  const [dupFor, setDupFor] = useState<{ row: CrossRow; code: string } | null>(null);                 // ข้อ 8 ดูตัวซ้ำ
  const [fakeRows, setFakeRows] = useState<FakePriceRow[] | null>(null);                               // ข้อ 2 ใส่ราคาเต็มหลายรุ่น
  const [fakeLoading, setFakeLoading] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);                                                   // ข้อ 3 ส่งราคาตามระบบ
  const [lineConfirm, setLineConfirm] = useState<CrossRow[] | null>(null);
  const [linePushing, setLinePushing] = useState<{ done: number; total: number } | null>(null);
  const [queue, setQueue] = useState<{ code: string; items: { lid: string; code: string }[]; i: number } | null>(null);
  useEffect(() => { setSelected(new Set()); setPage(1); setPresence("missing"); setQ(""); setQueue(null); }, [brandId]);

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
    for (const r of selRows) { const m = listableMissing(r, on); if (m.length) { n++; m.forEach((c) => codes.add(c)); } }
    return { n, codes: on.filter((c) => codes.has(c)) };
  }, [selRows, on]);

  // ───── ข้อ 2: ใส่ราคาเต็ม (Fake Price) หลายรุ่น — หน้าต่างสูตรเดิม (FakePriceDialog) + บันทึกทางเดิม (bulk-update · products.edit + audit) ─────
  const saveFake = useCallback(async (edits: { id: string; fake_price: number | null }[]): Promise<boolean> => {
    try {
      const res = await apiFetch("/api/master-v2/skus/bulk-update", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: edits.map((e) => ({ id: e.id, changes: { fake_price: e.fake_price } })) }),
      });
      const j = await res.json().catch(() => ({})) as { error?: string | null };
      if (!res.ok || j.error) { toast.error(`บันทึกไม่สำเร็จ: ${j.error ?? `HTTP ${res.status}`}`); return false; }
      return true;
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ: ${(e as Error).message || "เครือข่ายขัดข้อง"}`); return false; }
  }, [toast]);
  const openFakePrice = useCallback(async () => {
    if (!selRows.length) return;
    setFakeLoading(true);
    try {
      const res = await apiFetch("/api/platform-catalog/cross-shop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_ids: selRows.map((r) => r.id) }) });
      const j = await res.json() as { skus?: { id: string; code: string; sale: number | null; fake: number | null }[]; error?: string | null };
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      if (!j.skus?.length) { toast.warning("รุ่นที่เลือกไม่มี SKU ที่เปิดขาย"); return; }
      setFakeRows(j.skus.map((s) => ({ id: s.id, code: s.code, sale: s.sale, fake: s.fake })));
    } catch (e) { toast.error(`โหลด SKU ไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setFakeLoading(false); }
  }, [selRows, toast]);
  const applyFakePrices = useCallback(async (edits: { id: string; fake_price: number }[]): Promise<boolean> => {
    const before = new Map((fakeRows ?? []).map((r) => [r.id, r.fake]));
    if (!await saveFake(edits)) return false;
    const undo = edits.map((e) => { const v = Number(before.get(e.id)); return { id: e.id, fake_price: Number.isFinite(v) && v > 0 ? v : null }; });
    toast.undo(`ใส่ราคาเต็มแล้ว ${edits.length.toLocaleString()} SKU`, async () => {
      if (await saveFake(undo)) { toast.success("ย้อนราคาเต็มกลับแล้ว"); void swr.revalidate(true); }
    }, { ms: 10_000 });
    void swr.revalidate(true);
    return true;
  }, [fakeRows, saveFake, toast, swr]);

  // ───── ข้อ 3: ส่งราคาตามระบบ — LINE ส่งได้ทีเดียว (ปุ่มส่งราคาเดิม /api/line-shopping/push-prices) · ร้านอื่นไล่แก้ทีละรายการในลิ้นชักเดิม (ถามยืนยันก่อน/หลังทุกครั้ง) ─────
  const priceShops = useMemo(() => on.filter((c) => c !== WEBSITE).map((c) => ({ code: c, rows: selRows.filter((r) => priceMismatch(r, c)) })), [on, selRows]);
  const pushLine = useCallback(async (rows: CrossRow[]) => {
    setLineConfirm(null);
    setLinePushing({ done: 0, total: rows.length });
    let ok = 0; const fails: string[] = [];
    for (const [i, r] of rows.entries()) {
      try {
        const res = await apiFetch("/api/line-shopping/push-prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_id: brandId, parent_sku_id: r.id }) });
        const j = await res.json().catch(() => ({})) as { ok?: boolean; total?: number; okCount?: number; error?: string | null; results?: { ok: boolean; error?: string }[] };
        if (!res.ok || j.error || j.ok === false) fails.push(`${r.code}: ${j.error ?? `HTTP ${res.status}`}`);
        else if (typeof j.total === "number" && typeof j.okCount === "number" && j.okCount < j.total) fails.push(`${r.code}: ${j.results?.find((x) => !x.ok)?.error ?? "ส่งไม่ครบทุกรายการ"}`);
        else ok++;
      } catch (e) { fails.push(`${r.code}: ${(e as Error).message || "เครือข่ายขัดข้อง"}`); }
      setLinePushing({ done: i + 1, total: rows.length });
      if (i < rows.length - 1) await sleep(400);   // ส่งทีละรุ่น เว้นจังหวะ กัน LINE ตอบ "เรียกถี่เกินไป"
    }
    setLinePushing(null);
    if (fails.length) toast.error(`ส่งราคาไป LINE สำเร็จ ${ok} · ไม่สำเร็จ ${fails.length}: ${fails.slice(0, 3).join(" · ")}${fails.length > 3 ? " …" : ""}`);
    else toast.success(`ส่งราคาไป LINE แล้ว ${ok.toLocaleString()} รุ่น — ตัวเลขในตารางจะเปลี่ยนหลังดึงสินค้าจาก LINE รอบหน้า`);
    setSelected(new Set());
    void swr.revalidate(true);
  }, [brandId, toast, swr]);
  const startQueue = useCallback((code: string, rows: CrossRow[]) => {
    const items = rows.map((r) => ({ lid: r.cells[code]?.lid ?? "", code: r.code })).filter((x) => x.lid);
    if (!items.length) return;
    setPriceOpen(false);
    setQueue({ code, items, i: 0 });
    setOpenId(items[0].lid);
  }, []);
  const queueGo = useCallback((i: number) => {
    setQueue((q) => { if (!q || i < 0 || i >= q.items.length) return q; setOpenId(q.items[i].lid); return { ...q, i }; });
  }, []);

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
      cell: (r: CrossRow) => <ReadinessBadge parentId={r.id} codes={listableMissing(r, on)} names={names} stored={r.ready} />,
    }] : []),
  ], [shops, names, dim, bName, on]);

  const onCell = useCallback((r: CrossRow, colKey: string) => {
    if (!colKey.startsWith("shop_")) return;
    const code = colKey.slice(5);
    const c = r.cells[code];
    if (!c || c.st === "off") return;
    // Website = หน้าร้านเว็บของเรา → เปิด Parent SKU (แท็บ "เว็บไซต์" เพิ่ม/เผยแพร่ขึ้นหน้าร้าน)
    if (code === WEBSITE) { window.open(`/master/parent-skus?open=${encodeURIComponent(r.id)}`, "_blank", "noopener"); return; }
    if (c.listings > 1 && c.dups.length) { setDupFor({ row: r, code }); return; }   // ลงซ้ำ → ดูทุกตัวก่อน
    const lid = c.lid ?? c.maybe?.lid ?? null;
    if (lid) setOpenId(lid);
  }, []);

  if (!brandId) return <EmptyState title="เลือกแบรนด์ก่อน" hint="เช็กข้ามร้านดูทีละแบรนด์ — เลือกแบรนด์ที่แถบซ้าย" />;
  if (!data && swr.loading) return <LoadingState label="กำลังรวมข้อมูลทุกร้าน… (ครั้งแรกอาจใช้ 5-15 วินาที)" />;
  if (!data && swr.error) return <ErrorState title="โหลดข้อมูลไม่สำเร็จ" hint={swr.error.message} onRetry={() => void swr.revalidate(true)} />;
  if (!data) return null;

  // ข้อ 1 (เจ้าของเลือก 2026-11-20): พาไปหน้าจับคู่ของร้านนั้นตรง ๆ — ยืนยันคู่ที่นั่น (ทางเดิม · เจ้าของกดเอง)
  const unmatchedWarn = on.filter((c) => (data.unmatched[c] ?? 0) > 0);
  const matchHref = (code: string) => `/master/platform-catalog?brand=${encodeURIComponent(brandId)}&platform=${encodeURIComponent(code)}`;
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
          {chip("ready", "พร้อมลงเลย")}
          {chip("dup", "ลงซ้ำ")}
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
            <div className="min-w-0 space-y-1.5">
              <div>
                ยังมีรายการบนร้านที่ไม่ได้จับคู่ — ตัวเลข &quot;ยังไม่ลง&quot; จะแม่นขึ้นเมื่อจับคู่ครบ ·
                ช่องสีเหลือง &quot;อาจมีแล้ว&quot; = ระบบเดาว่าลงไว้แล้ว ให้ไปจับคู่ ไม่ใช่ลงซ้ำ
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unmatchedWarn.map((c) => (
                  <a key={c} href={matchHref(c)} title={`เปิดหน้าจับคู่ของ ${names[c]} — ยืนยันทีเดียวทุกตัวที่รหัสตรงกันได้ที่การ์ด "รอยืนยัน"`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 font-medium text-amber-800 hover:bg-amber-100">
                    <Icon value="i:link" />ไปจับคู่ {names[c]} <span className="tabular-nums">{data.unmatched[c].toLocaleString()}</span>
                  </a>
                ))}
              </div>
            </div>
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
              {dim === "status" && listableMissing(r, on).length > 0 && (
                <div className="text-[11px] text-slate-500">พร้อมลง: <ReadinessBadge parentId={r.id} codes={listableMissing(r, on)} names={names} stored={r.ready} /></div>
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
        {canPublish && priceShops.some((s) => s.rows.length) && (
          <button type="button" onClick={() => setPriceOpen(true)} title="ส่งราคาตามระบบไปร้านที่ราคาไม่ตรง — ดูราคาก่อน/หลังและยืนยันก่อนส่งทุกครั้ง"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-sm text-slate-800 hover:bg-slate-100">
            <Icon value="i:currency-baht" />ส่งราคาตามระบบ
          </button>
        )}
        {canEditProducts && (
          <button type="button" disabled={fakeLoading} onClick={() => void openFakePrice()} title="ใส่ราคาเต็ม (ราคาขีดฆ่า) ให้ทุก SKU ของรุ่นที่ติ๊กตามสูตร — ดูก่อน/หลังก่อนบันทึก · ย้อนกลับได้"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50">
            <Icon value="i:tag" />{fakeLoading ? "กำลังโหลด…" : "ใส่ราคาเต็ม"}
          </button>
        )}
        <button type="button" disabled={exporting} onClick={() => void doExport(selRows, "selected")}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50">
          <Icon value="i:file-spreadsheet" />Excel ({selected.size.toLocaleString()})
        </button>
      </BulkActionBar>

      {/* ข้อ 3: ไล่แก้ราคาทีละรายการ (ร้านที่ส่งราคาจากลิ้นชัก) */}
      {queue && (
        <div className="sticky bottom-16 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900 shadow-sm">
          <Icon value="i:list-check" />
          <span className="min-w-0 flex-1">
            ไล่แก้ราคา {names[queue.code]}: รายการ <b className="tabular-nums">{queue.i + 1}/{queue.items.length}</b>
            <span className="ml-1 font-mono text-xs">{queue.items[queue.i]?.code}</span>
            <span className="ml-1 text-xs text-violet-700">— ในลิ้นชักกด &quot;ใช้ราคาในระบบ&quot;/แก้ราคา แล้วยืนยันส่ง</span>
          </span>
          <button type="button" onClick={() => queueGo(queue.i)} className="h-8 rounded-lg border border-violet-200 bg-white px-2.5 text-xs hover:bg-violet-100">เปิดอีกครั้ง</button>
          <button type="button" disabled={queue.i === 0} onClick={() => queueGo(queue.i - 1)} className="h-8 rounded-lg border border-violet-200 bg-white px-2.5 text-xs hover:bg-violet-100 disabled:opacity-40">ก่อนหน้า</button>
          <button type="button" disabled={queue.i >= queue.items.length - 1} onClick={() => queueGo(queue.i + 1)} className="h-8 rounded-lg bg-violet-600 px-3 text-xs text-white hover:bg-violet-500 disabled:opacity-40">ถัดไป</button>
          <button type="button" onClick={() => { setQueue(null); setOpenId(null); void swr.revalidate(true); }} className="h-8 rounded-lg px-2 text-xs text-violet-700 hover:bg-violet-100">จบ</button>
        </div>
      )}

      {priceOpen && (
        <ERPModal open onClose={() => setPriceOpen(false)} title="ส่งราคาตามระบบ" size="md"
          description={`จากที่ติ๊กไว้ ${selected.size.toLocaleString()} รุ่น — ส่งเฉพาะร้านที่ราคาบนร้านไม่ตรงกับระบบ`}>
          <div className="space-y-2 p-1 text-sm">
            {priceShops.map(({ code, rows }) => (
              <div key={code} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800">{names[code]} <span className="tabular-nums text-slate-500">{rows.length.toLocaleString()} รุ่นราคาไม่ตรง</span></div>
                  <div className="text-xs text-slate-500">
                    {code === "line_shopping" ? "ส่งได้ทีเดียวทุกรุ่น (ราคาเต็ม + ส่วนลด ตามสูตรเดิม) — ดูก่อน/หลังแล้วยืนยัน"
                      : "ร้านนี้ส่งราคาทีละรายการในลิ้นชัก (ตรวจราคาบนร้านล่าสุด + ถามยืนยันก่อนส่ง) — ระบบเปิดให้ทีละตัวต่อกันไป"}
                  </div>
                </div>
                {rows.length > 0 && (code === "line_shopping"
                  ? <button type="button" onClick={() => { setPriceOpen(false); setLineConfirm(rows); }} className="h-8 rounded-lg bg-violet-600 px-3 text-xs text-white hover:bg-violet-500">ดูก่อนส่ง ({rows.length})</button>
                  : <button type="button" onClick={() => startQueue(code, rows)} className="h-8 rounded-lg border border-violet-300 px-3 text-xs text-violet-800 hover:bg-violet-50">ไล่แก้ทีละรายการ ({rows.length})</button>)}
              </div>
            ))}
            <p className="text-[11px] text-slate-400">ส่งราคาขึ้นร้านแล้วดึงกลับอัตโนมัติไม่ได้ — ถ้าส่งผิด ให้แก้ราคาในระบบแล้วส่งใหม่ · ทุกครั้งบันทึกประวัติว่าใครส่ง</p>
          </div>
        </ERPModal>
      )}
      <ConfirmDialog open={!!lineConfirm} onClose={() => setLineConfirm(null)} onConfirm={() => lineConfirm && void pushLine(lineConfirm)}
        title={`ส่งราคาตามระบบไป LINE ${lineConfirm?.length ?? 0} รุ่น?`} confirmText="ส่งราคา" variant="danger"
        requireTyped={(lineConfirm?.length ?? 0) > 20 ? "ยืนยัน" : undefined}
        message={
          <div className="space-y-2 text-sm">
            <p className="text-slate-600">ราคาที่ลูกค้าเห็นบน LINE จะเปลี่ยนทันที (ราคาต่อสี/ไซซ์ ระบบคำนวณจริงตอนส่ง ตามสูตรเดียวกับปุ่มส่งราคาเดิม)</p>
            {(() => {
              const rows = lineConfirm ?? [];
              const loseStrike = rows.filter((r) => r.cells.line_shopping?.sale != null && !r.our.full).length;
              const up = rows.filter((r) => { const c = r.cells.line_shopping; const now = c?.sale ?? c?.price; return now != null && r.our.sale != null && r.our.sale > now + 0.5; }).length;
              return (loseStrike > 0 || up > 0) && (
                <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                  {loseStrike > 0 && <div className="flex items-start gap-1"><Icon value="i:alert-triangle" className="mt-0.5 shrink-0" /><span>{loseStrike.toLocaleString()} รุ่น ระบบยังไม่มีราคาเต็ม → ราคาขีดฆ่าบน LINE จะหาย (ใส่ราคาเต็มก่อนด้วยปุ่ม &quot;ใส่ราคาเต็ม&quot;)</span></div>}
                  {up > 0 && <div className="flex items-start gap-1"><Icon value="i:alert-triangle" className="mt-0.5 shrink-0" /><span>{up.toLocaleString()} รุ่น ราคาที่ลูกค้าจ่ายจะแพงขึ้น — เช็กก่อนว่าราคาในระบบเป็นปัจจุบัน (ร้านอาจตั้งโปรไว้)</span></div>}
                </div>
              );
            })()}
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-2 py-1 text-left">รุ่น</th><th className="px-2 py-1 text-right">บน LINE ตอนนี้</th><th className="px-2 py-1 text-right">ตามระบบ</th></tr></thead>
                <tbody>
                  {(lineConfirm ?? []).slice(0, 50).map((r) => { const c = r.cells.line_shopping; return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-mono">{r.code}</td>
                      <td className="px-2 py-1 text-right">จ่าย {baht(c?.sale ?? c?.price)}{c?.sale != null ? <span className="ml-1 text-slate-400 line-through">{baht(c.price)}</span> : null}</td>
                      <td className="px-2 py-1 text-right font-medium text-violet-800">
                        จ่าย {baht(r.our.sale)}{r.our.full ? <span className="ml-1 text-slate-400 line-through">{baht(r.our.full)}</span> : null}
                        {(() => { const now = c?.sale ?? c?.price; if (now == null || r.our.sale == null || Math.abs(r.our.sale - now) < 0.5) return c?.sale != null && !r.our.full ? <div className="text-[10px] font-normal text-amber-700">ขีดฆ่าจะหาย</div> : null;
                          return <div className={`text-[10px] font-normal ${r.our.sale > now ? "text-rose-600" : "text-emerald-700"}`}>{r.our.sale > now ? "แพงขึ้น" : "ถูกลง"} {baht(Math.abs(r.our.sale - now))}</div>; })()}
                      </td>
                    </tr>); })}
                </tbody>
              </table>
              {(lineConfirm?.length ?? 0) > 50 && <div className="px-2 py-1 text-[11px] text-slate-400">…และอีก {(lineConfirm!.length - 50).toLocaleString()} รุ่น</div>}
            </div>
            <p className="text-[11px] text-slate-500">ราคาที่ส่งขึ้นร้านแล้วดึงกลับอัตโนมัติไม่ได้</p>
          </div>
        } />
      {linePushing && (
        <div className="sticky bottom-16 z-30 mx-auto max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
          กำลังส่งราคาไป LINE… <b className="tabular-nums">{linePushing.done}/{linePushing.total}</b>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-violet-500" style={{ width: `${Math.round((linePushing.done / Math.max(1, linePushing.total)) * 100)}%` }} /></div>
        </div>
      )}

      {fakeRows && <FakePriceDialog rows={fakeRows} onApply={applyFakePrices} onClose={() => setFakeRows(null)} />}

      {/* ข้อ 8: ลงซ้ำ — ดูทุกรายการที่จับคู่กับรุ่นนี้บนร้านเดียวกัน */}
      {dupFor && (() => { const c = dupFor.row.cells[dupFor.code]; return (
        <ERPModal open onClose={() => setDupFor(null)} title={`ลงซ้ำบน ${names[dupFor.code]} — ${dupFor.row.code}`} size="md"
          description={`สินค้านี้จับคู่กับ ${c?.dups.length ?? 0} รายการบนร้านเดียวกัน`}>
          <div className="space-y-2 p-1 text-sm">
            {(c?.dups ?? []).map((d, i) => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-800" title={d.title ?? ""}>{d.title ?? "—"}</div>
                  <div className="text-xs text-slate-500">{STATE_LABEL[d.status ?? ""] ?? d.status ?? "—"} · {baht(d.price)}{i === 0 ? " · ตัวที่แสดงในตาราง" : ""}</div>
                </div>
                <button type="button" onClick={() => { setDupFor(null); setOpenId(d.id); }} className="h-8 shrink-0 rounded-lg border border-slate-200 px-3 text-xs hover:bg-slate-50">เปิด</button>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              ตัวที่ไม่ใช้แล้ว: ปิดขายบนร้าน (ในลิ้นชัก ถ้าร้านนั้นรองรับ) หรือไป <a className="text-violet-700 underline" href={matchHref(dupFor.code)}>หน้าจับคู่ {names[dupFor.code]}</a> แล้วยกเลิกคู่/กด &quot;ไม่ต้องจับคู่ตัวนี้&quot; — ตัวเลข ×2 จะหายเอง
            </p>
          </div>
        </ERPModal>
      ); })()}

      {addFor && (
        <AddToPlatformWizard open parents={addFor.parents} brandId={brandId} initialPlatformCodes={addFor.codes}
          onClose={() => { setAddFor(null); setSelected(new Set()); }} onDone={() => void swr.revalidate(true)} />
      )}
      <ListingDrawer listingId={openId} onClose={() => setOpenId(null)} canPublish={canPublish} onChanged={() => void swr.revalidate(true)} />
    </div>
  );
}
