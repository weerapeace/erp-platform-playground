"use client";

/**
 * มุมมองหน้าร้าน (แบบ Seller Center) ของหน้า "สินค้าบนแพลตฟอร์ม" — /master/platform-catalog?view=shop
 * เจ้าของเลือกแบบ A (แท็บสถานะ + แถวสินค้า) + การ์ดกองงานแบบ D ด้านบน (2026-11-08) · เมนูในแอปจัดการงานเปิดมุมมองนี้
 *
 * ข้อมูล: GET /api/platform-catalog?view=shop (สรุปฝั่ง server ด้วย lib/platform-listing-health) — อ่านอย่างเดียว
 * ของกลางที่ใช้: StatFilterCards (ผ่าน ShopQueues) · ScrollTabs · MiniTable · Pager · BulkActionBar · HoverImage · state-views · Icon
 * สร้างงาน: ป๊อปสร้างงานเดิมของแอปจัดการงาน (CreateTaskModal + presetProducts) — ได้งาน 1 ใบรวมสินค้าที่เลือก
 * ร้านเลือก/แบรนด์/ปุ่มดึงสินค้า อยู่ที่หน้าแม่ (ใช้ร่วมกับมุมมองจับคู่)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { mutateSWR, peekSWR, useSWRLite } from "@/lib/swr-lite";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { MiniTable, LayoutSwitch, useMiniTableLayout, type MiniColumn } from "@/components/mini-table";
import { Pager } from "@/components/pager";
import { ScrollTabs } from "@/components/scroll-tabs";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { HoverImage } from "@/components/hover-image";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import type { ParentSkuPickerValue } from "@/components/pickers";
import {
  SHOP_STATE_LABEL, SHOP_TABS, inShopQueue, inShopTab, notListedTrustworthy, shopStateOf,
  type ShopItem, type ShopParent, type ShopTab, type ShopViewResponse,
} from "@/lib/platform-listing-health";
import { ShopQueues, queueLabel, queueWhy, type QueueKey } from "./shop-queues";
import { ListingCard, SHOP_STATE_CLS } from "./listing-card";
import { ListingDrawer } from "./listing-drawer";
import { useLineDisplay } from "./use-line-display";
import { ToggleSwitch } from "@/components/toggle-switch";
import { AddToPlatformWizard, type AddWizardParent } from "@/components/platform-listing/add-to-platform-wizard";

// ป๊อปสร้างงาน (หนัก) — โหลดตอนกดเท่านั้น
const CreateTaskModal = dynamic(() => import("@/app/tasks/create-task-modal").then((m) => m.CreateTaskModal), { ssr: false });

const IMG_STATE_LABEL: Record<ShopParent["image_state"], string> = { ok: "มีรูปปก", sku_only: "มีรูป SKU · ยังไม่ตั้งปก", none: "ไม่มีรูปเลย" };

type SortKey = "default" | "stock_desc" | "stock_asc" | "price_desc" | "price_asc" | "name";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "default", label: "เรียง: ล่าสุดก่อน" },
  { key: "stock_desc", label: "สต๊อก มาก → น้อย" },
  { key: "stock_asc", label: "สต๊อก น้อย → มาก" },
  { key: "price_desc", label: "ราคา สูง → ต่ำ" },
  { key: "price_asc", label: "ราคา ต่ำ → สูง" },
  { key: "name", label: "ชื่อ ก → ฮ" },
];
const effPrice = (it: ShopItem): number | null => it.salePrice ?? it.price;
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
function thDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

export function PlatformShopView({ platformId, platformCode, brandId, brandName, where, reloadKey, onCounts, onGoMatch }: {
  platformId: string;
  platformCode: string;
  brandId: string;
  brandName: string | null;
  /** ชื่อร้าน · แบรนด์ (ไว้ในข้อความ) */
  where: string;
  /** เปลี่ยนค่า = โหลดใหม่ (เช่น หลังกดดึงสินค้าจากร้าน) */
  reloadKey: number;
  /** ส่งจำนวนสินค้าต่อร้านกลับให้ปุ่มเลือกร้านของหน้าแม่ */
  onCounts?: (c: Record<string, number>) => void;
  /** ไปมุมมองจับคู่ (รายการที่ยังไม่จับคู่) */
  onGoMatch: () => void;
}) {
  const { can } = useAuth();
  const toast = useToast();
  const canCreateTask = can("tasks.create" as Parameters<typeof can>[0]);
  // ข้อมูลหน้าร้าน — แคชกลาง useSWRLite ต่อร้าน+แบรนด์: เปิดซ้ำ/สลับแบรนด์กลับมา = เห็นของเดิมทันที แล้วโหลดใหม่เงียบ ๆ
  //   (แคชอยู่ในหน้าเว็บที่เปิดอยู่ · รีเฟรชหน้า = โหลดสด) · เปลี่ยนแบรนด์ระหว่างโหลด = ไม่ทับกันเพราะแยกกุญแจ
  const swrKey = platformId ? `platform-shop:${platformId}:${brandId}` : null;
  const [refreshing, setRefreshing] = useState(false);
  const swr = useSWRLite<ShopViewResponse>(swrKey, async () => {
    setRefreshing(true);
    try {
      const qs = new URLSearchParams({ platform_id: platformId, view: "shop", with_counts: "1" });
      if (brandId) qs.set("brand_id", brandId);
      const j = await apiFetch(`/api/platform-catalog?${qs}`).then((r) => r.json()) as ShopViewResponse;
      if (j.error) throw new Error(j.error);
      return j;
    } finally { setRefreshing(false); }
  }, { focusStaleMs: 5 * 60_000 });
  const data = swr.data ?? null;
  const error = swr.error ? (swr.error.message || "โหลดข้อมูลไม่สำเร็จ") : null;
  const reload = swr.revalidate;
  const load = useCallback(() => { void reload(true); }, [reload]);
  const [tab, setTab] = useState<ShopTab>("all");
  const [queue, setQueue] = useState<QueueKey>("none");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [taskFor, setTaskFor] = useState<ParentSkuPickerValue[] | null>(null);
  const [addFor, setAddFor] = useState<AddWizardParent[] | null>(null);   // ตัวช่วยลงสินค้า (ของกลาง)
  const [cat, setCat] = useState("");   // หมวดกลาง ("" = ทุกหมวด · "__none" = ไม่รู้หมวด เช่น ยังไม่จับคู่)
  const canAdd = can("products.platforms.edit");
  const [layout, setLayout] = useMiniTableLayout("platform-shop-items");   // ตาราง / การ์ด (การ์ดใบเดียวกับแท็บจับคู่)
  // ลิ้นชักสินค้าบนร้าน (กดแถว/การ์ด) + เปิด/ปิดขายบน LINE
  const canPublish = can("products.platforms.publish");
  const isLine = platformCode === "line_shopping";
  const [openId, setOpenId] = useState<string | null>(null);
  const patchItem = useCallback((id: string, p: { title?: string; display?: boolean }) => {
    const d = peekSWR<ShopViewResponse>(swrKey);
    if (!swrKey || !d) return;
    mutateSWR<ShopViewResponse>(swrKey, { ...d, items: d.items.map((it) => {
      if (it.id !== id) return it;
      const display = p.display ?? it.display;
      return { ...it, ...(p.title ? { title: p.title } : {}), display, state: p.display != null ? shopStateOf(display, it.stock, true) : it.state };
    }) });
  }, [swrKey]);
  const disp = useLineDisplay((results) => { for (const r of results) if (r.ok) patchItem(r.listing_id, { display: !!r.display }); });

  // หน้าแม่สั่งโหลดใหม่ (หลังกดดึงสินค้าจากร้าน) → โหลดสด แต่ยังโชว์ของเดิมระหว่างรอ
  const lastReload = useRef(reloadKey);
  useEffect(() => {
    if (lastReload.current === reloadKey) return;
    lastReload.current = reloadKey;
    void reload(true);
  }, [reloadKey, reload]);
  // จำนวนสินค้าต่อร้าน → ปุ่มเลือกร้านของหน้าแม่
  useEffect(() => { if (data?.platform_counts) onCounts?.(data.platform_counts); }, [data, onCounts]);
  // เปลี่ยนร้าน/แบรนด์ → เริ่มที่แท็บแรก
  useEffect(() => { setTab("all"); setQueue("none"); setPage(1); setQ(""); setCat(""); setSelected(new Set()); }, [platformId, brandId]);

  const allItems = useMemo(() => data?.items ?? [], [data]);
  const noData = allItems.length > 0 && allItems.every((it) => it.state === "nodata");
  const trustNotListed = useMemo(() => notListedTrustworthy(allItems), [allItems]);
  // ชิปหมวดกลาง → กรองทั้งการ์ดกองงาน แท็บ และตาราง
  const inCat = useCallback((id: string | null) => !cat || (cat === "__none" ? !id : id === cat), [cat]);
  const items = useMemo(() => allItems.filter((it) => inCat(it.category_id)), [allItems, inCat]);
  const notListed = useMemo(() => data?.not_listed ? data.not_listed.filter((p) => inCat(p.category_id)) : null, [data, inCat]);
  const noImage = useMemo(() => data?.no_image ? data.no_image.filter((p) => inCat(p.category_id)) : null, [data, inCat]);

  // โหมดตาราง: รายการบนร้าน หรือ สินค้าของเรา (แท็บยังไม่ลง / กองไม่มีรูปในระบบ)
  const parentMode = tab === "notlisted" || queue === "noimg_erp";
  const parentRowsAll: ShopParent[] | null = queue === "noimg_erp"
    ? noImage?.slice().sort((a, b) => (a.image_state === b.image_state ? 0 : a.image_state === "none" ? -1 : 1)) ?? null
    : tab === "notlisted" ? notListed : null;

  const needle = q.trim().toLowerCase();
  const shownItems = useMemo(() => {
    if (parentMode) return [];
    let rows = items.filter((it) => queue !== "none" ? inShopQueue(it, queue as Exclude<QueueKey, "none" | "noimg_erp">) : inShopTab(it, tab));
    if (needle) rows = rows.filter((it) => `${it.title ?? ""} ${it.sku_code ?? ""} ${it.external_product_id ?? ""} ${it.matched_code ?? ""}`.toLowerCase().includes(needle));
    const nz = (n: number | null, dir: 1 | -1) => (n == null ? Number.POSITIVE_INFINITY : n * dir);
    const cmp: Record<SortKey, ((a: ShopItem, b: ShopItem) => number) | null> = {
      default: null,
      stock_desc: (a, b) => nz(a.stock, -1) - nz(b.stock, -1),
      stock_asc: (a, b) => nz(a.stock, 1) - nz(b.stock, 1),
      price_desc: (a, b) => nz(effPrice(a), -1) - nz(effPrice(b), -1),
      price_asc: (a, b) => nz(effPrice(a), 1) - nz(effPrice(b), 1),
      name: (a, b) => (a.title ?? "").localeCompare(b.title ?? "", "th"),
    };
    const c = cmp[sort];
    return c ? rows.slice().sort(c) : rows;
  }, [items, parentMode, queue, tab, needle, sort]);
  const shownParents = useMemo(() => {
    if (!parentMode || !parentRowsAll) return [];
    return needle ? parentRowsAll.filter((p) => `${p.code} ${p.name ?? ""}`.toLowerCase().includes(needle)) : parentRowsAll;
  }, [parentMode, parentRowsAll, needle]);
  const total = parentMode ? shownParents.length : shownItems.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > maxPage) setPage(maxPage); }, [page, maxPage]);
  const pageItems = shownItems.slice((page - 1) * pageSize, page * pageSize);
  const pageParents = shownParents.slice((page - 1) * pageSize, page * pageSize);

  const tabCount = (t: ShopTab): number | null => {
    if (t === "notlisted") return notListed ? notListed.length : null;
    if (noData && (t === "selling" || t === "out" || t === "hidden" || t === "review")) return null;
    return items.filter((it) => inShopTab(it, t)).length;
  };
  const pickTab = (t: ShopTab) => { setTab(t); setQueue("none"); setPage(1); setSelected(new Set()); };
  const pickQueue = (k: QueueKey) => { setQueue(k); setTab("all"); setPage(1); setSelected(new Set()); };

  // ---------- สร้างงาน ----------
  const pickerOf = (id: string, code: string | null, name: string | null, coverKey: string | null): ParentSkuPickerValue =>
    ({ id, code: code ?? "", name: name ?? code ?? "", image_key: coverKey });
  const selItems = items.filter((it) => selected.has(it.id));
  const selLive = isLine && !parentMode ? selItems.filter((it) => it.display != null && it.state !== "gone") : [];
  const selToOpen = selLive.filter((it) => !it.display);
  const selToHide = selLive.filter((it) => it.display);
  const selParents = (parentRowsAll ?? []).filter((p) => selected.has(p.id));
  const selTargets: ParentSkuPickerValue[] = parentMode
    ? selParents.map((p) => pickerOf(p.id, p.code, p.name, p.cover_key))
    : [...new Map(selItems.filter((it) => it.matched_parent_sku_id).map((it) => [it.matched_parent_sku_id as string, pickerOf(it.matched_parent_sku_id as string, it.matched_code, it.matched_name, it.matched_cover_key)])).values()];
  const selUnmatched = parentMode ? 0 : selItems.filter((it) => !it.matched_parent_sku_id).length;

  const onCreated = (res: { id: string; task_no: string }) => {
    setTaskFor(null); setSelected(new Set());
    toast.action(`สร้างงาน ${res.task_no} แล้ว`, "เปิดงาน", () => window.open(`/tasks?task=${res.id}`, "_blank"));
    void load();   // อัปเดตป้าย "งานค้าง"
  };

  // ---------- คอลัมน์ ----------
  const taskBadge = (n: number) => n > 0 && (
    <span className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-100 whitespace-nowrap">งานค้าง {n}</span>
  );
  const itemCols: MiniColumn<ShopItem>[] = [
    {
      key: "product", header: "สินค้าบนร้าน", width: "2.6fr", locked: true,
      cell: (it) => {
        const shopImg = it.image;
        const erpImg = r2ImageUrl(it.matched_cover_key, 160);
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <HoverImage url={shopImg ?? erpImg} size={44} previewSize={300} rounded="rounded-md" fallback="—" />
            <div className="min-w-0">
              <div className="truncate" title={it.title ?? ""}>{it.title || "—"}</div>
              <div className="text-[11px] text-slate-400 font-mono truncate">
                {it.sku_code || "ไม่มี SKU"}{it.variants > 0 ? ` · ${it.variants.toLocaleString()} ตัวเลือก` : ""}{it.category ? ` · ${it.category}` : ""}
              </div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {taskBadge(it.open_tasks)}
                {it.dup_count > 1 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">ชื่อ+รหัสซ้ำ ×{it.dup_count}</span>}
                {it.imageKnown && !shopImg && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{erpImg ? "ร้านไม่มีรูป · โชว์รูปในระบบ" : "ไม่มีรูปบนร้าน"}</span>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "price", header: "ราคา", width: "0.8fr", align: "right",
      cell: (it) => it.salePrice != null ? (
        <div className="leading-tight"><div className="text-rose-600">{baht(it.salePrice)}</div>{it.price != null && <div className="text-[11px] text-slate-400 line-through">{baht(it.price)}</div>}</div>
      ) : it.price != null ? <span>{baht(it.price)}</span> : <span className="text-slate-300">—</span>,
    },
    {
      key: "stock", header: "สต๊อก", width: "0.6fr", align: "right",
      cell: (it) => it.stock == null ? <span className="text-slate-300">—</span>
        : <span className={`tabular-nums ${it.state === "out" ? "text-rose-600 font-medium" : it.state === "low" ? "text-amber-600 font-medium" : ""}`}>{it.stock.toLocaleString()}</span>,
    },
    ...(isLine ? [{
      key: "disp", header: "เปิดขาย", width: "4.5rem", align: "center" as const,
      cell: (it: ShopItem) => (it.display == null || it.state === "gone" ? <span className="text-slate-300">—</span>
        : <ToggleSwitch size="sm" on={it.display} disabled={!canPublish || disp.busy} title={canPublish ? "เปิด/ปิดขายบน LINE (ถามก่อน)" : "ไม่มีสิทธิ์ส่งขึ้นร้าน"}
            onChange={(v) => disp.request([it.id], v ? "onsale" : "hide", [it.title || it.sku_code || ""])} />),
    }] : []),
    {
      key: "state", header: "สถานะ", width: "0.8fr", align: "center",
      cell: (it) => <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${SHOP_STATE_CLS[it.state]}`}>{SHOP_STATE_LABEL[it.state]}</span>,
    },
    {
      key: "match", header: "สินค้าในระบบ", width: "1fr",
      cell: (it) => it.matched_parent_sku_id
        ? <span className="text-xs font-mono text-emerald-700 truncate" title={it.matched_name ?? ""}>{it.matched_code || "จับคู่แล้ว"}</span>
        : it.match_ignored ? <span className="text-xs text-slate-400">ไม่ต้องจับคู่</span>
        : <button type="button" onClick={onGoMatch} className="text-xs text-amber-700 hover:underline">ยังไม่จับคู่ — ไปจับคู่</button>,
    },
    {
      key: "act", header: "", width: "6.5rem", align: "right", locked: true,
      cell: (it) => canCreateTask && it.matched_parent_sku_id ? (
        <button type="button" onClick={() => setTaskFor([pickerOf(it.matched_parent_sku_id as string, it.matched_code, it.matched_name, it.matched_cover_key)])}
          className="h-7 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap">
          <Icon name="add" />สร้างงาน
        </button>
      ) : null,
    },
  ];
  const parentCols: MiniColumn<ShopParent>[] = [
    {
      key: "product", header: "สินค้าของเรา", width: "2.6fr", locked: true,
      cell: (p) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <HoverImage url={r2ImageUrl(p.cover_key, 160)} size={44} previewSize={300} rounded="rounded-md" fallback="—" />
          <div className="min-w-0">
            <div className="truncate" title={p.name ?? ""}>{p.name || p.code}</div>
            <div className="text-[11px] text-slate-400 font-mono truncate">{p.code}</div>
            <div className="flex flex-wrap gap-1 mt-0.5">{taskBadge(p.open_tasks)}</div>
          </div>
        </div>
      ),
    },
    {
      key: "img", header: "รูปในระบบ", width: "1.2fr",
      cell: (p) => <span className={`text-xs ${p.image_state === "none" ? "text-rose-600" : p.image_state === "sku_only" ? "text-amber-700" : "text-slate-500"}`}>{IMG_STATE_LABEL[p.image_state]}</span>,
    },
    {
      key: "act", header: "", width: tab === "notlisted" ? "11rem" : "6.5rem", align: "right", locked: true,
      cell: (p) => (
        <span className="inline-flex gap-1">
          {canAdd && tab === "notlisted" && (
            <button type="button" onClick={() => setAddFor([{ id: p.id, code: p.code, name: p.name }])} title="ลงสินค้านี้ขึ้นร้าน (ตัวช่วยลงสินค้า)"
              className="h-7 px-2 text-xs text-white bg-violet-600 rounded-md hover:bg-violet-700 inline-flex items-center gap-1 whitespace-nowrap">
              <Icon name="upload" />ลงร้าน
            </button>
          )}
          {canCreateTask && (
            <button type="button" onClick={() => setTaskFor([pickerOf(p.id, p.code, p.name, p.cover_key)])}
              className="h-7 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap">
              <Icon name="add" />สร้างงาน
            </button>
          )}
        </span>
      ),
    },
  ];

  // ---------- แสดงผล ----------
  // กำลังโหลด (รวมกรณีเคยพังกับแบรนด์ก่อน แล้วสลับมาแบรนด์ใหม่) → จอรอ · พังและไม่ได้โหลดอยู่ → จอลองใหม่
  if (!data && swrKey && (refreshing || !error)) return <LoadingState label={`กำลังโหลดสินค้าของ ${where}...`} />;
  if (error && !data) return <ErrorState hint={error} onRetry={load} />;
  if (!data) return null;
  if (items.length === 0 && !data.not_listed?.length) {
    return <EmptyState title={`ยังไม่มีสินค้าจาก ${where}`} hint="กดดึงสินค้าจากร้าน หรือนำเข้าไฟล์ export ด้านบนก่อน" />;
  }

  const queueOn = queue !== "none";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Icon name="history" />ข้อมูลจากร้านล่าสุด {thDate(data.last_imported_at)}</span>
        {refreshing && <span className="text-slate-400">กำลังโหลดใหม่…</span>}
        {!brandId && <span className="text-amber-700">เลือกแบรนด์ด้านบน เพื่อดู "ยังไม่ลง" และ "ไม่มีรูปในระบบ"</span>}
      </div>
      {noData && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <Icon name="warning" className="mt-0.5 shrink-0" />
          <span>ข้อมูลของร้านนี้มาจากไฟล์ export ที่มีแค่ชื่อกับรหัส — ยังไม่รู้ราคา สต๊อก และเปิด/ปิดขาย (ขึ้น &quot;—&quot; ไว้ก่อน) · รูปที่เห็นคือรูปในระบบของตัวที่จับคู่แล้ว · จะครบเมื่อเชื่อมร้านแบบ API</span>
        </div>
      )}

      {data.categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-0.5">หมวด</span>
          {[{ id: "", name: "ทุกหมวด", n: allItems.length }, ...data.categories.map((c) => ({ id: c.id, name: c.name, n: allItems.filter((it) => it.category_id === c.id).length })),
            ...(allItems.some((it) => !it.category_id) ? [{ id: "__none", name: "ไม่รู้หมวด (ยังไม่จับคู่)", n: allItems.filter((it) => !it.category_id).length }] : [])]
            .filter((c) => c.id === "" || c.n > 0 || cat === c.id)   // หมวดที่เป็น 0 ซ่อน (กติกาเดียวกับการ์ดกลาง)
            .map((c) => (
            <button key={c.id || "all"} type="button" onClick={() => { setCat(c.id); setPage(1); setSelected(new Set()); }} aria-pressed={cat === c.id}
              className={`h-7 px-2.5 rounded-full border text-xs whitespace-nowrap ${cat === c.id ? "bg-violet-50 border-violet-300 text-violet-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {c.name} <span className="tabular-nums text-slate-400">{c.n.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}

      <ShopQueues items={items} noImage={noImage} value={queue} onChange={pickQueue} />

      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <ScrollTabs activeKey={queueOn ? null : tab} className="border-b border-slate-200 px-1">
          {SHOP_TABS.map((t) => {
            const on = !queueOn && t.key === tab;
            const n = tabCount(t.key);
            if (t.key === "gone" && !n && !on) return null;   // ไม่อยู่บนร้านแล้ว: โชว์เฉพาะตอนมี (ล้างที่หน้าจับคู่)
            return (
              <button key={t.key} type="button" data-tab-key={t.key} onClick={() => pickTab(t.key)} aria-pressed={on}
                className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${on ? "border-violet-500 text-violet-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {t.label} <span className={`text-xs tabular-nums ${on ? "text-violet-500" : "text-slate-400"}`}>{n == null ? "?" : n.toLocaleString()}</span>
              </button>
            );
          })}
        </ScrollTabs>

        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          {queueOn && (
            <span className="inline-flex items-center gap-1.5 text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full pl-2.5 pr-1 py-0.5">
              กอง: {queueLabel(queue)}
              <button type="button" onClick={() => pickQueue("none")} aria-label="เลิกกรองกองงาน" className="h-5 w-5 rounded-full hover:bg-violet-100 inline-flex items-center justify-center"><Icon name="cancel" /></button>
            </span>
          )}
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="ค้นชื่อ / SKU / รหัสบนร้าน / รหัสในระบบ"
            className="flex-1 min-w-[12rem] h-9 border border-slate-200 rounded-lg px-3 text-sm" />
          {!parentMode && (
            <select value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }} className="h-9 border border-slate-200 rounded-lg px-2 text-sm bg-white">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
          {!parentMode && <LayoutSwitch value={layout} onChange={setLayout} />}
          {queueOn && queue === "unmatched" && (
            <button type="button" onClick={onGoMatch} className="h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 inline-flex items-center gap-1.5"><Icon name="link" />ไปหน้าจับคู่</button>
          )}
        </div>
        {queueOn && <p className="px-3 pb-2 -mt-1 text-xs text-slate-500">{queueWhy(queue)}</p>}
        {tab === "notlisted" && !queueOn && brandId && !trustNotListed && (
          <div className="mx-3 mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <Icon name="warning" className="mt-0.5 shrink-0" />
            <span>รายการบนร้านนี้ยังจับคู่ไม่ครบ — สินค้าที่ลงร้านแล้วแต่ยังไม่จับคู่จะถูกนับว่า &quot;ยังไม่ลง&quot; ด้วย · <button type="button" onClick={onGoMatch} className="underline">ไปจับคู่ก่อน</button> แล้วตัวเลขนี้จะแม่นขึ้น</span>
          </div>
        )}

        {tab === "notlisted" && !queueOn && !brandId ? (
          <EmptyState title="เลือกแบรนด์ก่อน" hint={`ต้องรู้ว่าสินค้าแบรนด์ไหนควรอยู่บน ${where} ถึงจะบอกได้ว่าตัวไหนยังไม่ลง`} />
        ) : parentMode ? (
          <MiniTable rows={pageParents} columns={parentCols} rowKey={(p) => p.id}
            selectable={canCreateTask || (canAdd && tab === "notlisted")} selected={selected} onSelectedChange={setSelected}
            emptyText={needle ? "ไม่พบสินค้าที่ค้นหา" : tab === "notlisted" ? `สินค้า${brandName ? ` ${brandName}` : ""} ลงร้านนี้ครบแล้ว` : "ทุกสินค้ามีรูปแล้ว"} dense
            resizable storageKey="platform-shop-parents" />
        ) : (
          <MiniTable rows={pageItems} columns={itemCols} rowKey={(it) => it.id} onRowClick={(it) => setOpenId(it.id)}
            selectable={canCreateTask || (canPublish && isLine)} selected={selected} onSelectedChange={setSelected}
            layout={layout} cardPick cardGrid="repeat(auto-fill,minmax(170px,1fr))"
            renderCard={(it) => (
              <ListingCard badges={(
                <>
                  {it.open_tasks > 0 && <div className="flex flex-wrap gap-1">{taskBadge(it.open_tasks)}</div>}
                  {isLine && it.display != null && it.state !== "gone" && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500" onClick={(e) => e.stopPropagation()}>
                      <span>{it.display ? "เปิดขายบน LINE" : "ปิดขายอยู่"}</span>
                      <ToggleSwitch size="sm" on={it.display} disabled={!canPublish || disp.busy} title={canPublish ? "เปิด/ปิดขายบน LINE (ถามก่อน)" : "ไม่มีสิทธิ์ส่งขึ้นร้าน"}
                        onChange={(v) => disp.request([it.id], v ? "onsale" : "hide", [it.title || it.sku_code || ""])} />
                    </div>
                  )}
                </>
              )} data={{
                image: it.image ?? r2ImageUrl(it.matched_cover_key, 400), title: it.title, sku: it.sku_code, externalId: it.external_product_id,
                state: it.state, stock: it.stock, price: it.price, salePrice: it.salePrice, variants: it.variants, dupCount: it.dup_count,
              }} footer={(
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  {it.matched_parent_sku_id
                    ? <span className="truncate font-mono text-emerald-700" title={it.matched_name ?? ""}>✓ {it.matched_code || "จับคู่แล้ว"}</span>
                    : it.match_ignored ? <span className="text-slate-400">ไม่ต้องจับคู่</span>
                    : <button type="button" onClick={onGoMatch} className="truncate text-amber-700 hover:underline">ยังไม่จับคู่ — ไปจับคู่</button>}
                  {canCreateTask && it.matched_parent_sku_id && (
                    <button type="button" onClick={() => setTaskFor([pickerOf(it.matched_parent_sku_id as string, it.matched_code, it.matched_name, it.matched_cover_key)])}
                      className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 hover:bg-slate-50"><Icon name="add" />สร้างงาน</button>
                  )}
                </div>
              )} />
            )}
            emptyText={needle ? "ไม่พบสินค้าที่ค้นหา" : "ไม่มีสินค้าในกลุ่มนี้"} dense
            resizable storageKey="platform-shop-items" />
        )}
        <div className="px-3 py-2 border-t border-slate-100">
          <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} unitLabel={parentMode ? "สินค้า" : "รายการ"}
            onPageSize={(s) => { setPageSize(s); setPage(1); }} pageSizes={[25, 50, 100]} />
        </div>
      </div>

      {(canCreateTask || (canAdd && parentMode) || (canPublish && isLine)) && (
        <BulkActionBar count={selected.size} unit={parentMode ? "สินค้า" : "รายการ"} onClear={() => setSelected(new Set())}
          extra={selUnmatched > 0 ? `${selUnmatched.toLocaleString()} รายการยังไม่จับคู่ จะไม่ถูกใส่ในงาน` : undefined}>
          {canPublish && selToOpen.length > 0 && (
            <button type="button" disabled={disp.busy} onClick={() => disp.request(selToOpen.map((it) => it.id), "onsale", selToOpen.map((it) => it.title || it.sku_code || ""))} className="h-8 px-3 text-sm rounded-lg bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">เปิดขาย ({selToOpen.length.toLocaleString()})</button>
          )}
          {canPublish && selToHide.length > 0 && (
            <button type="button" disabled={disp.busy} onClick={() => disp.request(selToHide.map((it) => it.id), "hide", selToHide.map((it) => it.title || it.sku_code || ""))} className="h-8 px-3 text-sm rounded-lg border border-white/30 text-white hover:bg-white/10 disabled:opacity-50">ปิดขาย ({selToHide.length.toLocaleString()})</button>
          )}
          {canAdd && tab === "notlisted" && selParents.length > 0 && (
            <button type="button" onClick={() => setAddFor(selParents.map((p) => ({ id: p.id, code: p.code, name: p.name })))} className="h-8 px-3 text-sm rounded-lg bg-violet-500 text-white hover:bg-violet-400 inline-flex items-center gap-1.5">
              <Icon name="upload" />ลงสินค้า ({selParents.length.toLocaleString()})
            </button>
          )}
          {canCreateTask && selTargets.length > 0 && (
            <button type="button" onClick={() => setTaskFor(selTargets)} className="h-8 px-3 text-sm rounded-lg bg-white text-slate-800 hover:bg-slate-100 inline-flex items-center gap-1.5">
              <Icon name="add" />สร้างงาน ({selTargets.length.toLocaleString()} สินค้า)
            </button>
          )}
        </BulkActionBar>
      )}

      {addFor && (
        <AddToPlatformWizard open parents={addFor} brandId={brandId || null} initialPlatformCodes={platformCode ? [platformCode] : []}
          onClose={() => { setAddFor(null); setSelected(new Set()); }} onDone={() => void load()} />
      )}

      {disp.dialog}
      <ListingDrawer listingId={openId} onClose={() => setOpenId(null)} canPublish={canPublish} onChanged={patchItem}
        matchTab={(() => {
          const it = allItems.find((x) => x.id === openId);
          if (!it) return null;
          return (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
              <div className="text-xs font-semibold text-slate-600">จับคู่กับสินค้าในระบบ</div>
              {it.matched_parent_sku_id
                ? <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">จับคู่อยู่กับ <span className="font-mono">{it.matched_code}</span>{it.matched_name ? ` · ${it.matched_name}` : ""}</div>
                : it.match_ignored ? <div className="text-xs text-slate-500">ตั้งไว้ว่าไม่ต้องจับคู่</div>
                : <button type="button" onClick={() => { setOpenId(null); onGoMatch(); }} className="text-xs text-amber-700 hover:underline">ยังไม่จับคู่ — ไปหน้าจับคู่</button>}
              {canCreateTask && it.matched_parent_sku_id && (
                <button type="button" onClick={() => setTaskFor([pickerOf(it.matched_parent_sku_id as string, it.matched_code, it.matched_name, it.matched_cover_key)])}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50"><Icon name="add" />สร้างงานของสินค้านี้</button>
              )}
            </div>
          );
        })()} />

      {taskFor && (
        <CreateTaskModal open onClose={() => setTaskFor(null)} onCreated={onCreated}
          pushToast={(type, m) => toast.show(m, type)}
          presetProducts={{ brandId: brandId || null, parents: taskFor, platforms: platformCode ? [platformCode] : [] }} />
      )}
    </div>
  );
}
