"use client";
/**
 * ลิ้นชักสินค้าบนร้าน (หน้าสินค้าบนแพลตฟอร์ม — แท็บจับคู่ + มุมมองหน้าร้าน) · แบบ Seller Center ของ LINE
 *
 * แท็บ: ข้อมูลสินค้า (ชื่อ · แบรนด์ · หมวด LINE · รายละเอียดจัดรูปแบบ) · รูป · ตัวเลือก & ราคา · จับคู่ · ประวัติ
 * แก้แล้วกด "บันทึกขึ้น LINE" → โชว์ก่อน → หลัง ทุกช่องให้ยืนยัน → ส่งขึ้นร้านจริง (ส่งเฉพาะที่เปลี่ยน) → แก้สำเนาในระบบ + ประวัติ
 * เปิด/ปิดขาย = สวิตช์ที่หัว (useLineDisplay — ถามก่อนเสมอ)
 * เฟส 2: รูปสินค้า (ลากเรียง · ตั้งปก · ลบ · เพิ่มจากรูปในระบบ ≤7) · น้ำหนัก/บาร์โค้ด/SKU/รูปต่อตัวเลือก
 * ยังไม่ทำ: เพิ่ม/ลบตัวเลือก · สต๊อก (ระบบซิงค์สต๊อกกลาง)
 *
 * Lazada: แท็บข้อมูล/รูป/ตัวเลือก ดึงสดจาก Lazada → ./lazada-listing-panels (GET /api/lazada/listing-detail)
 *   เฟส 2: แก้ชื่อ/รายละเอียด/จุดเด่น (useLazadaEdit → /api/lazada/listing-edit) + เปิด/ปิดขาย ทั้งสินค้า/ทีละตัวเลือก (useLazadaDisplay → /listing-display)
 *   หัว/แท็บจับคู่/ประวัติ ใช้ร่วมกับ LINE · แผนเปิดให้แก้ขึ้น Lazada ทีละเฟส: docs/lazada-connector.md
 *
 * ข้อมูล: GET /api/platform-catalog?view=listing (รายละเอียด+ประวัติ) + ?view=variants (ตัวเลือก↔SKU + ราคาที่ระบบจะส่ง)
 * ส่ง: POST /api/line-shopping/listing-edit · กฎกลาง lib/line-listing-edit (planLineEdit — หน้าเว็บกับ API ใช้ตัวเดียวกัน)
 * ของกลางที่ใช้: Drawer · ConfirmDialog · ScrollTabs · MiniTable · MoneyInput · RichTextEditor · ToggleSwitch · ImageLightbox · PlatformCategoryPicker · state-views
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Drawer, ConfirmDialog, ERPModal } from "@/components/modal";
import { ScrollTabs } from "@/components/scroll-tabs";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { MoneyInput } from "@/components/money-input";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Icon } from "@/components/icon";
import { ErrorState, LoadingState } from "@/components/state-views";
import { PlatformCategoryPicker, parseCategoryLabel } from "@/components/platform-category-picker";
import { ImageLightbox } from "@/components/image-lightbox";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { r2ImageUrl } from "@/lib/r2-image";
import { ListingVariantMap } from "./listing-variants";
import { useLineDisplay } from "./use-line-display";
import { VariantStructureEditor } from "./variant-structure-editor";
import { DescImagesTest } from "./desc-images-test";
import { LineGiftSection } from "./line-gift-section";
import { LazadaEditFooter, LazadaHeaderStatus, LazadaImagesPanel, LazadaInfoPanel, LazadaOptionsPanel, useLazadaDisplay, useLazadaEdit, useLazadaListing } from "./lazada-listing-panels";
import { applyBulkPrice, planLineEdit, systemImageKey, systemImageRef, MAX_LINE_IMAGES, type LineEditState, type LineEditVariant, type ListingDetail, type ListingDetailResponse } from "@/lib/line-listing-edit";
import type { ListingVariantsResponse } from "@/lib/platform-variant-match";

// กล่องข้อความจัดรูปแบบหนัก (tiptap) — โหลดเมื่อเปิดลิ้นชักเท่านั้น
const RichTextEditor = dynamic(() => import("@/components/rich-text").then((m) => m.RichTextEditor), { ssr: false, loading: () => <div className="h-40 rounded-lg bg-slate-50" /> });

type Tab = "info" | "images" | "options" | "match" | "history";
const baht = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);
const thDateTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const numOrNull = (raw: string) => { const n = Number(raw); return raw.trim() === "" || !Number.isFinite(n) ? null : n; };
/** รูปในฟอร์ม: "r2:<key>" = รูปจากระบบ (ย่อจาก R2) · อื่น ๆ = ลิงก์ของ LINE */
const imgSrc = (ref: string | null | undefined, w = 400) => { const k = systemImageKey(ref); return k ? r2ImageUrl(k, w) ?? "" : (ref ?? ""); };

export function ListingDrawer({ listingId, onClose, onChanged, canPublish, matchTab }: {
  listingId: string | null;
  onClose: () => void;
  /** ส่งขึ้น LINE / เปิดปิดขาย สำเร็จ → หน้าแม่อัปเดตแถว */
  onChanged?: (id: string, patch: { title?: string; display?: boolean }) => void;
  /** สิทธิ์ส่งขึ้นร้านจริง (products.platforms.publish) — ไม่มี = ดูอย่างเดียว */
  canPublish: boolean;
  /** เนื้อหาแท็บจับคู่จากหน้าแม่ (กล่องจับคู่ / ตัวซ้ำ / ส่งตามข้อมูลในระบบ) */
  matchTab?: ReactNode;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<ListingDetail | null>(null);
  const [variants, setVariants] = useState<ListingVariantsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<LineEditState | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [ask, setAsk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(-1);
  const [descEdit, setDescEdit] = useState(false);
  // เฟส 2: รูปในระบบ (คลังรูปของสินค้าที่จับคู่) — โหลดเมื่อกดเพิ่มรูป · ตัวเลือกราคา / รายละเอียด
  const [sysImages, setSysImages] = useState<{ key: string; source: string }[] | null>(null);
  const [picker, setPicker] = useState<null | { mode: "product" } | { mode: "variant"; id: string }>(null);
  const [optMode, setOptMode] = useState<"price" | "detail" | "structure">("price");
  // แก้ราคาหลายตัวเลือกพร้อมกัน (ติ๊กบางตัว = เฉพาะที่ติ๊ก · ไม่ติ๊ก = ทุกตัว) — เติมฟอร์มอย่างเดียว ยังไม่ส่ง
  const [priceSel, setPriceSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ full: string; pay: string; pct: string }>({ full: "", pay: "", pct: "" });
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  // โหลดรายละเอียด + ตัวเลือก↔SKU พร้อมกัน · สลับรายการ = เริ่มใหม่ (ล้างของเดิม + กลับแท็บแรก) · โหลดซ้ำหลังส่ง = คงแท็บไว้
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!listingId) { loadedFor.current = null; return; }
    let alive = true;
    const fresh = loadedFor.current !== listingId;
    loadedFor.current = listingId;
    setError(null);
    if (fresh) { setDetail(null); setVariants(null); setForm(null); setDescEdit(false); setSysImages(null); setPicker(null); setPriceSel(new Set()); setBulk({ full: "", pay: "", pct: "" }); setBulkErr(null); }
    const q = encodeURIComponent(listingId);
    Promise.all([
      apiFetch(`/api/platform-catalog?view=listing&listing_id=${q}`).then((r) => r.json() as Promise<ListingDetailResponse>),
      apiFetch(`/api/platform-catalog?view=variants&listing_id=${q}`).then((r) => r.json() as Promise<ListingVariantsResponse>).catch(() => null),
    ]).then(([d, v]) => {
      if (!alive) return;
      if (d.error || !d.detail) { setError(d.error ?? "โหลดไม่สำเร็จ"); return; }
      setDetail(d.detail);
      setVariants(v && !v.error ? v : null);
      setForm(d.detail.line ? structuredClone(d.detail.line.edit) : null);
      if (fresh) setTab(d.detail.line || d.detail.platform_code === "lazada" ? "info" : "match");
    }).catch(() => { if (alive) setError("โหลดรายละเอียดไม่สำเร็จ ลองใหม่อีกครั้ง"); });
    return () => { alive = false; };
  }, [listingId, reload]);

  const base = detail?.line?.edit ?? null;
  const plan = useMemo(() => (base && form ? planLineEdit(base, form) : null), [base, form]);
  const dirty = !!plan && plan.changes.length > 0;
  const canEdit = canPublish && !!detail?.line && detail.status !== "removed";
  const rowByKey = useMemo(() => new Map((variants?.rows ?? []).map((r) => [r.key, r])), [variants]);

  // Lazada: ดึงสดจากร้านเมื่อเปิด (ข้อมูลเต็มไม่ได้เก็บในระบบ) · กดดึงตัวนี้ = อัปเดตสำเนาในระบบ → โหลดรายละเอียด/ตัวเลือก↔SKU ใหม่
  const isLazada = detail?.platform_code === "lazada" && detail.id === listingId;
  const laz = useLazadaListing(isLazada ? listingId : null, useCallback(() => setReload((n) => n + 1), []));
  // เฟส 2 (แก้ร้านจริง · ถามก่อนเสมอ): สิทธิ์เดียวกับ LINE (products.platforms.publish) · รายการที่ไม่อยู่บนร้านแล้วแก้ไม่ได้
  const lazCanEdit = canPublish && isLazada && detail?.status !== "removed";
  const lazEdit = useLazadaEdit(laz, lazCanEdit, useCallback((name: string) => { if (listingId) onChanged?.(listingId, { title: name }); setReload((n) => n + 1); }, [listingId, onChanged]));
  const lazDisp = useLazadaDisplay(laz, useCallback(() => { if (listingId) onChanged?.(listingId, {}); setReload((n) => n + 1); }, [listingId, onChanged]));

  const disp = useLineDisplay((results) => {
    const r = results.find((x) => x.listing_id === listingId);
    if (r?.ok && listingId) { onChanged?.(listingId, { display: !!r.display }); setReload((n) => n + 1); }
  });

  const setField = <K extends keyof LineEditState>(k: K, v: LineEditState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setVariant = (id: string, patch: Partial<LineEditVariant>) => setForm((f) => (f ? { ...f, variants: f.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) } : f));
  const applyErpPrice = (ids?: string[]) => setForm((f) => (f ? {
    ...f, variants: f.variants.map((v) => {
      if (ids && !ids.includes(v.id)) return v;
      const r = rowByKey.get(v.id);
      return r && r.erp_pay != null && r.erp_price != null ? { ...v, price: r.erp_price, pay: r.erp_pay } : v;
    }),
  } : f));
  const resetForm = () => { if (base) setForm(structuredClone(base)); setDescEdit(false); };
  const applyBulk = () => {
    if (!form) return;
    const r = applyBulkPrice(form.variants, priceSel, { full: numOrNull(bulk.full), pay: numOrNull(bulk.pay), discountPct: numOrNull(bulk.pct) });
    setBulkErr(r.error);
    if (!r.error) {
      setForm((f) => (f ? { ...f, variants: r.variants } : f));
      if (r.changed === 0) setBulkErr("ราคาเท่าเดิมทุกตัว — ไม่มีอะไรเปลี่ยน");
    }
  };
  // รูปสินค้า: ลากเรียง (ของกลาง SortableList) · ตั้งปก = ย้ายไปแรก · ลบ (เหลืออย่างน้อย 1)
  const drag = useDragReorder((from, to) => setForm((f) => (f ? { ...f, images: moveItem(f.images, from, to) } : f)), { group: "listing-images" });
  const setImages = (fn: (imgs: string[]) => string[]) => setForm((f) => (f ? { ...f, images: fn(f.images) } : f));
  const matchedParent = detail?.matched_parent_sku_id ?? null;
  const loadSysImages = useCallback(async () => {
    if (!matchedParent || sysImages) return;
    try {
      const j = await apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(matchedParent)}`).then((r) => r.json()) as { images?: { key: string; source: string }[] };
      setSysImages(Array.isArray(j.images) ? j.images : []);
    } catch { setSysImages([]); }
  }, [matchedParent, sysImages]);
  const openPicker = (p: { mode: "product" } | { mode: "variant"; id: string }) => { setPicker(p); void loadSysImages(); };
  // ดึงข้อมูลสินค้าตัวนี้ตัวเดียวจาก LINE (POST /api/line-shopping/listing-refresh)
  const [refreshing, setRefreshing] = useState(false);
  const refreshOne = async () => {
    if (!listingId) return;
    setRefreshing(true);
    try {
      const r = await apiFetch("/api/line-shopping/listing-refresh", { method: "POST", body: JSON.stringify({ listing_id: listingId }) });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` })) as { ok?: boolean; error: string | null };
      if (j.ok) { toast.success("ดึงข้อมูลจาก LINE แล้ว"); setReload((n) => n + 1); }
      else toast.error(j.error || "ดึงไม่สำเร็จ");
    } catch (e) { toast.error((e as Error).message); }
    finally { setRefreshing(false); }
  };

  const save = useCallback(async () => {
    if (!listingId || !form) return;
    setSaving(true);
    try {
      const r = await apiFetch("/api/line-shopping/listing-edit", { method: "POST", body: JSON.stringify({ listing_id: listingId, edit: form }) });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (j.ok) {
        toast.success("ส่งขึ้น LINE แล้ว — บันทึกประวัติแล้ว");
        onChanged?.(listingId, { title: form.name });
        setAsk(false); setDescEdit(false); setReload((n) => n + 1);
      } else {
        toast.error(`ส่งขึ้น LINE ไม่สำเร็จ: ${j.error ?? `HTTP ${r.status}`}`);
        if (j.details === "ok" || j.prices === "ok") { onChanged?.(listingId, { title: form.name }); setAsk(false); setReload((n) => n + 1); }
      }
    } catch (e) { toast.error(`ส่งขึ้น LINE ไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setSaving(false); }
  }, [listingId, form, onChanged, toast]);

  const line = detail?.line ?? null;
  const lazView = isLazada ? laz.view : null;
  const imgCount = line ? line.images.length : lazView ? lazView.images.length : null;
  const optCount = form ? form.variants.length : lazView ? lazView.skus.length : null;
  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "ข้อมูลสินค้า" },
    { key: "images", label: `รูป${imgCount != null ? ` (${imgCount})` : ""}` },
    { key: "options", label: `ตัวเลือก & ราคา${optCount != null ? ` (${optCount})` : ""}` },
    { key: "match", label: "จับคู่" },
    { key: "history", label: `ประวัติ${detail ? ` (${detail.history.length})` : ""}` },
  ];

  // ---------- ตัวเลือก & ราคา ----------
  const optCols: MiniColumn<LineEditVariant>[] = [
    {
      key: "opt", header: "ตัวเลือก", width: "1.6fr",
      cell: (v) => { const r = rowByKey.get(v.id); return (
        <div className="min-w-0">
          <div className="truncate" title={v.label}>{v.label}</div>
          <div className="truncate font-mono text-[11px] text-slate-400">{v.sku ?? "ไม่มีรหัส"}{r?.erp_code && r.erp_code !== v.sku ? ` → ${r.erp_code}` : ""}{r && (r.kind === "none" || r.kind === "nosku") ? " · ไม่เจอ SKU" : ""}</div>
        </div>
      ); },
    },
    {
      key: "erp", header: "ระบบจะส่ง", width: "6.5rem", align: "right",
      cell: (v) => { const r = rowByKey.get(v.id); if (!r || r.erp_pay == null) return <span className="text-slate-300">—</span>;
        const diff = v.pay != null && Math.abs(v.pay - r.erp_pay) >= 1;
        return (
          <span className={`leading-tight ${diff ? "text-rose-600" : "text-slate-500"}`} title={diff ? "ราคาที่ลูกค้าจ่ายไม่ตรงกับในระบบ" : "ตรงกับในระบบ"}>
            <span className="block">{baht(r.erp_pay)}</span>
            {r.erp_price != null && r.erp_price !== r.erp_pay && <span className="block text-[11px] text-slate-400 line-through">{baht(r.erp_price)}</span>}
            {canEdit && diff && <button type="button" onClick={() => applyErpPrice([v.id])} className="text-[11px] text-violet-700 hover:underline">ใช้ราคานี้</button>}
          </span>
        ); },
    },
    {
      key: "price", header: "ราคาเต็ม", width: "6.5rem", align: "right",
      cell: (v) => canEdit
        ? <MoneyInput value={v.price} onChange={(raw) => setVariant(v.id, { price: numOrNull(raw) })} className="h-8 w-full rounded-md border border-slate-200 px-2 text-right text-sm" />
        : <span>{baht(v.price)}</span>,
    },
    {
      key: "pay", header: "ลูกค้าจ่าย", width: "6.5rem", align: "right",
      cell: (v) => canEdit
        ? <MoneyInput value={v.pay} onChange={(raw) => setVariant(v.id, { pay: numOrNull(raw) })} className="h-8 w-full rounded-md border border-slate-200 px-2 text-right text-sm" />
        : <span>{baht(v.pay)}</span>,
    },
    {
      key: "disc", header: "ส่วนลด", width: "4.5rem", align: "right",
      cell: (v) => (v.price != null && v.pay != null && v.pay < v.price ? <span className="text-rose-600">-{Math.round((1 - v.pay / v.price) * 100)}%</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: "stock", header: "สต๊อก", width: "4rem", align: "right",
      cell: (v) => { const s = rowByKey.get(v.id)?.stock; return s == null ? <span className="text-slate-300">—</span> : <span className={s === 0 ? "text-rose-600" : ""}>{s.toLocaleString()}</span>; },
    },
  ];
  const priceDiffN = form ? form.variants.filter((v) => { const r = rowByKey.get(v.id); return r?.erp_pay != null && v.pay != null && Math.abs(v.pay - r.erp_pay) >= 1; }).length : 0;

  // ---------- หัวลิ้นชัก ----------
  const cover = line?.images[0] ?? lazView?.images[0] ?? null;
  const header = detail && (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
      {cover
        ? <button type="button" onClick={() => setLightbox(0)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-50"><img src={cover} alt="" className="h-full w-full object-cover" /></button>
        : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300"><Icon name="image" /></div>}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-medium text-slate-800" title={detail.title ?? ""}>{form?.name || lazView?.name || detail.title || "—"}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
          <span className="font-mono">#{detail.external_product_id ?? "—"}</span>
          {detail.matched_code ? <span className="font-mono text-emerald-700">จับคู่ {detail.matched_code}</span> : <span className="text-amber-700">ยังไม่จับคู่</span>}
          {detail.status === "removed" && <span className="rounded bg-slate-100 px-1.5 text-slate-500">ไม่อยู่บนร้านแล้ว</span>}
        </div>
      </div>
      {line && line.display != null && detail.status !== "removed" && (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <ToggleSwitch on={line.display} disabled={!canPublish || disp.busy} label={<span className="text-xs text-slate-600">{line.display ? "เปิดขาย" : "ปิดขาย"}</span>}
            title={canPublish ? "เปิด/ปิดขายบน LINE (ถามก่อน)" : "ไม่มีสิทธิ์ส่งขึ้นร้าน"}
            onChange={(v) => listingId && disp.request([listingId], v ? "onsale" : "hide", [form?.name || detail.title || ""])} />
        </div>
      )}
      {isLazada && detail.status !== "removed" && <LazadaHeaderStatus state={laz} disp={lazCanEdit ? lazDisp : null} dirty={lazEdit.dirty} />}
    </div>
  );

  // ---------- เนื้อหาแท็บ ----------
  // ยังไม่มีข้อมูลจาก LINE (เช่น ลงจากระบบแล้วแต่ยังไม่ดึง) → ปุ่มดึง "ตัวนี้ตัวเดียว" ไม่ต้องดึงทั้งร้าน
  const canRefreshOne = detail?.platform_code === "line_shopping" && !!detail.external_product_id && detail.status !== "removed";
  const noLine = (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span className="min-w-[12rem] flex-1">
        {detail?.platform_code && detail.platform_code !== "line_shopping"
          ? "แก้จากหน้านี้ได้เฉพาะสินค้าบน LINE ตอนนี้ — ร้านนี้ดูข้อมูลได้ที่แท็บจับคู่"
          : canRefreshOne ? "ยังไม่มีข้อมูลสินค้านี้จาก LINE ในระบบ — กดดึงตัวนี้ได้เลย" : "ยังไม่มีข้อมูลสินค้านี้จาก LINE — กด “ดึงสินค้าจาก LINE” ด้านบนหนึ่งครั้ง แล้วเปิดใหม่"}
      </span>
      {canRefreshOne && (
        <button type="button" disabled={refreshing} onClick={() => void refreshOne()} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50">
          <Icon name="refresh" />{refreshing ? "กำลังดึง..." : `ดึงตัวนี้จาก LINE (#${detail?.external_product_id})`}
        </button>
      )}
    </div>
  );
  const infoTab = !form || !line ? noLine : (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">ชื่อสินค้าบน LINE</span>
        <input value={form.name} disabled={!canEdit} onChange={(e) => setField("name", e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">แบรนด์</span>
          <input value={form.brand} disabled={!canEdit} onChange={(e) => setField("brand", e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" />
        </label>
        <div>
          <span className="mb-1 block text-xs text-slate-500">หมวดบน LINE</span>
          <div className="mb-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700" title={form.categoryName ?? ""}>
            {form.categoryId ? <><span className="font-mono text-slate-400">{form.categoryId}</span> {form.categoryName ?? ""}</> : <span className="text-amber-700">ยังไม่มีหมวด</span>}
          </div>
          {canEdit && detail && <PlatformCategoryPicker platformId={detail.platform_id} placeholder="เปลี่ยนหมวด — พิมพ์ค้น เช่น กระเป๋า"
            onPick={(label) => { const c = parseCategoryLabel(label); if (c.id) setForm((f) => (f ? { ...f, categoryId: c.id, categoryName: c.name } : f)); }} />}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">รายละเอียดสินค้า</span>
          {canEdit && !descEdit && <button type="button" onClick={() => setDescEdit(true)} className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"><Icon name="edit" />แก้รายละเอียด</button>}
        </div>
        {descEdit
          ? <RichTextEditor value={form.description} onChange={(html) => setField("description", html)} minHeight={220} />
          : <div className="tiptap-content max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm [&_img]:max-w-full [&_img]:rounded"
              dangerouslySetInnerHTML={{ __html: form.description || "<p class=\"text-slate-400\">(ไม่มีรายละเอียด)</p>" }} />}
      </div>
      {/* ทดสอบใส่รูปจากระบบลงในรายละเอียด (ช่วงทดสอบ · เฉพาะสินค้าปิดขาย) */}
      {line.gift && <LineGiftSection current={line.gift} />}
      {canEdit && listingId && (
        <DescImagesTest listingId={listingId} matchedParent={matchedParent} display={line.display}
          blocked={dirty ? "มีการแก้ที่ยังไม่ได้ส่งขึ้น LINE — ส่งหรือยกเลิกก่อน" : null}
          onDone={() => setReload((n) => n + 1)} />
      )}
    </div>
  );
  const imagesTab = !form || !line ? noLine : (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {form.images.map((ref, i) => {
          const isNew = !!systemImageKey(ref);
          return (
            <div key={`${ref}-${i}`} {...(canEdit ? drag.rowProps(i) : {})}
              className={`relative aspect-square overflow-hidden rounded-lg border bg-slate-50 ${isNew ? "border-violet-300" : "border-slate-200"} ${canEdit ? drag.rowCls(i) : ""}`}>
              <button type="button" onClick={() => setLightbox(i)} className="h-full w-full"><img src={imgSrc(ref)} alt="" loading="lazy" className="h-full w-full object-cover" /></button>
              {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] text-violet-700">ปก</span>}
              {isNew && <span className="absolute right-1 top-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">ใหม่</span>}
              {canEdit && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-white/90 px-1 py-0.5 text-[10px]">
                  <DragHandle {...drag.handleProps(i)} title="ลากเพื่อเรียงลำดับ" />
                  {i !== 0 && <button type="button" onClick={() => setImages((imgs) => moveItem(imgs, i, 0))} className="text-violet-700 hover:underline">ตั้งเป็นปก</button>}
                  <button type="button" disabled={form.images.length <= 1} onClick={() => setImages((imgs) => imgs.filter((_, k) => k !== i))}
                    title={form.images.length <= 1 ? "ต้องเหลืออย่างน้อย 1 รูป" : "เอารูปนี้ออก"} className="ml-auto text-rose-600 hover:underline disabled:opacity-30">ลบ</button>
                </div>
              )}
            </div>
          );
        })}
        {canEdit && form.images.length < MAX_LINE_IMAGES && (
          <button type="button" disabled={!matchedParent} onClick={() => openPicker({ mode: "product" })}
            title={matchedParent ? "เลือกรูปจากคลังรูปของสินค้าในระบบ" : "จับคู่สินค้าในระบบก่อน ถึงจะเพิ่มรูปจากระบบได้"}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <Icon name="add" />เพิ่มจากรูปในระบบ
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400">LINE รับ 1–{MAX_LINE_IMAGES} รูป · รูปแรก = ปก · ลากที่หูจับเพื่อเรียง · รูปป้าย “ใหม่” = จากคลังรูปในระบบ (ส่งตอนกดบันทึก)</p>
    </div>
  );
  const detailCols: MiniColumn<LineEditVariant>[] = [
    { key: "opt", header: "ตัวเลือก", width: "1.5fr", cell: (v) => <div className="min-w-0"><div className="truncate" title={v.label}>{v.label}</div><div className="truncate font-mono text-[11px] text-slate-400">{v.sku ?? "ไม่มีรหัส"}</div></div> },
    {
      key: "img", header: "รูป", width: "5.5rem",
      cell: (v) => (
        <div className="flex items-center gap-1.5">
          {v.imageUrl ? <img src={imgSrc(v.imageUrl, 120)} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-slate-50 text-slate-300"><Icon name="image" /></span>}
          {canEdit && <button type="button" onClick={() => openPicker({ mode: "variant", id: v.id })} className="text-[11px] text-violet-700 hover:underline">เปลี่ยน</button>}
        </div>
      ),
    },
    {
      key: "w", header: "น้ำหนัก (กก.)", width: "6rem", align: "right",
      cell: (v) => canEdit
        ? <input type="number" step="0.01" min="0.01" max="999.99" value={v.weight ?? ""} onChange={(e) => setVariant(v.id, { weight: numOrNull(e.target.value) })} className="h-8 w-full rounded-md border border-slate-200 px-2 text-right text-sm" />
        : <span>{v.weight ?? "—"}</span>,
    },
    {
      key: "bc", header: "บาร์โค้ด", width: "1fr",
      cell: (v) => canEdit
        ? <input value={v.barcode ?? ""} onChange={(e) => setVariant(v.id, { barcode: e.target.value })} className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-xs" />
        : <span className="font-mono text-xs">{v.barcode || "—"}</span>,
    },
    {
      key: "sku", header: "SKU บนร้าน", width: "1fr",
      cell: (v) => canEdit
        ? <input value={v.sku ?? ""} onChange={(e) => setVariant(v.id, { sku: e.target.value })} title="ระบบจับตัวเลือกกับ SKU ในระบบด้วยรหัสนี้ — เปลี่ยนแล้วตรวจให้ตรง" className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-xs" />
        : <span className="font-mono text-xs">{v.sku || "—"}</span>,
    },
  ];
  const optionsTab = !form || !line ? noLine : (
    <div className="space-y-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm">
        {([["price", "ราคา"], ["detail", "น้ำหนัก · บาร์โค้ด · รูป · SKU"], ["structure", "เพิ่ม/ลบตัวเลือก"]] as const).map(([k, label], i) => (
          <button key={k} type="button" onClick={() => setOptMode(k)} aria-pressed={optMode === k}
            className={`h-8 px-3 ${i ? "border-l border-slate-200" : ""} ${optMode === k ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
        ))}
      </div>
      {optMode === "price" && canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-2.5 py-2 text-xs text-violet-900">
          <span className="font-medium">แก้{priceSel.size ? `ตัวที่ติ๊ก (${priceSel.size})` : `ทุกตัวเลือก (${form.variants.length})`}พร้อมกัน:</span>
          <label className="inline-flex items-center gap-1">ราคาเต็ม<MoneyInput value={bulk.full} onChange={(raw) => { setBulk((b) => ({ ...b, full: raw })); setBulkErr(null); }} placeholder="ไม่เปลี่ยน" className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-right" /></label>
          <label className="inline-flex items-center gap-1">ลูกค้าจ่าย<MoneyInput value={bulk.pay} onChange={(raw) => { setBulk((b) => ({ ...b, pay: raw })); setBulkErr(null); }} placeholder="ไม่เปลี่ยน" className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-right" /></label>
          <label className="inline-flex items-center gap-1">หรือ ลด<input type="number" min="0" max="99" value={bulk.pct} onChange={(e) => { setBulk((b) => ({ ...b, pct: e.target.value })); setBulkErr(null); }} className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-right" />%</label>
          <button type="button" onClick={applyBulk} className="h-8 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700">ใช้กับ{priceSel.size ? `ที่ติ๊ก ${priceSel.size} ตัว` : "ทุกตัว"}</button>
          {bulkErr && <span className="w-full text-rose-600">{bulkErr}</span>}
          <span className="w-full text-[11px] text-violet-700/80">ช่องที่ว่าง = ไม่เปลี่ยน · ลด % คิดจากราคาเต็ม · กดแล้วยังไม่ส่ง — ต้องกด “บันทึกขึ้น LINE” (โชว์ก่อน → หลัง ให้ตรวจ)</span>
        </div>
      )}
      {optMode === "price"
        ? <MiniTable rows={form.variants} columns={optCols} rowKey={(v) => v.id} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-options"
            selectable={canEdit} selected={priceSel} onSelectedChange={setPriceSel} />
        : optMode === "detail"
          ? <MiniTable rows={form.variants} columns={detailCols} rowKey={(v) => v.id} dense hideToolbar emptyText="ไม่มีตัวเลือก" resizable storageKey="listing-drawer-options-detail" />
          : listingId && <VariantStructureEditor listingId={listingId} structure={line.structure} display={line.display} canEdit={canEdit}
              blockedReason={dirty ? "มีที่แก้ค้างยังไม่ได้บันทึก — กด “บันทึกขึ้น LINE” หรือ “ยกเลิกที่แก้” ก่อน แล้วค่อยเพิ่ม/ลบตัวเลือก" : null}
              defaults={{ price: form.variants[0]?.price ?? null, weight: form.variants[0]?.weight ?? null }}
              onDone={() => { setReload((n) => n + 1); if (listingId) onChanged?.(listingId, {}); }} />}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {priceDiffN > 0 && <span className="text-rose-600">ลูกค้าจ่ายไม่ตรงในระบบ {priceDiffN.toLocaleString()} ตัวเลือก</span>}
        {canEdit && priceDiffN > 0 && <button type="button" onClick={() => applyErpPrice()} className="rounded-md border border-violet-200 px-2 py-1 text-violet-700 hover:bg-violet-50">ใช้ราคาในระบบทั้งหมด</button>}
        <span className="ml-auto text-slate-400">สต๊อกดูอย่างเดียว (แก้ผ่านระบบซิงค์สต๊อก)</span>
      </div>
    </div>
  );
  const matchTabBody = (
    <div className="space-y-3">
      {matchTab}
      {detail && (detail.platform_code === "line_shopping" || detail.platform_code === "lazada") && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="text-xs font-semibold text-slate-600">ตัวเลือกบนร้าน ↔ SKU ในระบบ</div>
          {listingId && <ListingVariantMap listingId={listingId} data={variants ?? undefined} />}
        </div>
      )}
    </div>
  );
  const historyTab = !detail ? null : detail.history.length === 0 ? <p className="text-xs text-slate-500">ยังไม่มีประวัติ</p> : (
    <ul className="divide-y divide-slate-100 text-xs">
      {detail.history.map((h, i) => (
        <li key={i} className="flex gap-3 py-1.5">
          <span className="w-28 shrink-0 text-slate-400">{thDateTime(h.at)}</span>
          <span className="w-32 shrink-0 truncate text-slate-500" title={h.actor ?? ""}>{h.actor ?? "ระบบ"}</span>
          <span className="min-w-0 flex-1 text-slate-700">{h.text}</span>
        </li>
      ))}
    </ul>
  );

  const footer = canEdit && plan ? (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 text-xs text-slate-500">
        {plan.errors.length ? <span className="text-rose-600">{plan.errors[0]}</span>
          : dirty ? `แก้แล้ว ${plan.changes.length.toLocaleString()} ช่อง — ยังไม่ได้ส่งขึ้น LINE` : "ยังไม่ได้แก้อะไร"}
      </span>
      {dirty && <button type="button" onClick={resetForm} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิกที่แก้</button>}
      <button type="button" disabled={!dirty || plan.errors.length > 0 || saving} onClick={() => setAsk(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm text-white hover:bg-emerald-700 disabled:opacity-40"><Icon name="upload" />บันทึกขึ้น LINE</button>
    </div>
  ) : detail?.line && !canPublish ? <span className="text-xs text-slate-400">ดูอย่างเดียว — ไม่มีสิทธิ์ส่งขึ้นร้าน</span>
    : isLazada ? (detail?.status === "removed" ? <span className="text-xs text-slate-400">ไม่อยู่บนร้าน Lazada แล้ว — แก้ไม่ได้</span> : <LazadaEditFooter edit={lazEdit} state={laz} />) : undefined;

  return (
    <>
      <Drawer open={!!listingId} onClose={onClose} title="สินค้าบนร้าน" size="xl" storageKey="platform-listing-drawer" hasUnsavedChanges={dirty || (isLazada && lazEdit.dirty)} footer={footer}>
        {error ? <ErrorState title={error} onRetry={() => setReload((n) => n + 1)} />
          : !detail ? <LoadingState label="กำลังโหลดสินค้าจากร้าน…" />
          : (
            <div className="space-y-3">
              {header}
              <ScrollTabs activeKey={tab} className="border-b border-slate-200">
                {tabs.map((t) => (
                  <button key={t.key} type="button" data-tab-key={t.key} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
                    className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-violet-500 font-medium text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</button>
                ))}
              </ScrollTabs>
              {tab === "match" ? matchTabBody : tab === "history" ? historyTab
                : isLazada ? (tab === "info" ? <LazadaInfoPanel state={laz} edit={lazEdit} /> : tab === "images" ? <LazadaImagesPanel state={laz} onOpen={setLightbox} /> : <LazadaOptionsPanel state={laz} disp={lazCanEdit ? lazDisp : null} />)
                : tab === "info" ? infoTab : tab === "images" ? imagesTab : optionsTab}
            </div>
          )}
      </Drawer>

      <ConfirmDialog open={ask && !!plan} onClose={() => { if (!saving) setAsk(false); }} onConfirm={() => void save()} loading={saving}
        title={`ส่งการแก้ไข ${plan?.changes.length ?? 0} ช่องขึ้นร้าน LINE?`} confirmText="ส่งขึ้น LINE"
        message={plan ? (
          <div className="space-y-2 text-sm">
            <p>ระบบจะแก้สินค้าบนร้าน LINE จริงตามนี้ (ส่งเฉพาะที่เปลี่ยน) · มีประวัติว่าใครแก้อะไร</p>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
              {plan.changes.map((c, i) => (
                <li key={i}><span className="font-medium text-slate-700">{c.label}:</span> <span className="text-slate-400 line-through">{c.before}</span> → <span className="text-slate-800">{c.after}</span></li>
              ))}
            </ul>
            {plan.warnings.map((w, i) => <p key={i} className="flex items-start gap-1 text-xs text-amber-700"><Icon name="warning" className="mt-0.5 shrink-0" />{w}</p>)}
          </div>
        ) : ""} />

      {disp.dialog}
      {isLazada && lazEdit.dialog}
      {isLazada && lazDisp.dialog}
      {line && <ImageLightbox images={(form?.images ?? line.images).map((u) => ({ url: imgSrc(u, 1600) }))} index={lightbox} onClose={() => setLightbox(-1)} onIndex={setLightbox} />}
      {!line && lazView && <ImageLightbox images={lazView.images.map((url) => ({ url }))} index={lightbox} onClose={() => setLightbox(-1)} onIndex={setLightbox} />}

      {/* เลือกรูป: เพิ่มรูปสินค้าจากคลังรูปในระบบ / เลือกรูปให้ตัวเลือก (รูปสินค้าบนร้าน + คลังรูปในระบบ) */}
      <ERPModal open={!!picker} onClose={() => setPicker(null)} size="lg" storageKey="listing-drawer-image-picker"
        title={picker?.mode === "variant" ? `เลือกรูปให้ตัวเลือก ${form?.variants.find((v) => v.id === (picker as { id: string }).id)?.label ?? ""}` : "เพิ่มรูปสินค้าจากคลังรูปในระบบ"}
        description={picker?.mode === "product" ? `เลือกได้อีก ${Math.max(0, MAX_LINE_IMAGES - (form?.images.length ?? 0))} รูป (LINE รับไม่เกิน ${MAX_LINE_IMAGES}) · ส่งขึ้นร้านตอนกดบันทึก` : "กดรูปที่ต้องการ · ส่งขึ้นร้านตอนกดบันทึก"}>
        {picker && form && (
          <div className="space-y-3">
            {picker.mode === "variant" && form.images.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-slate-500">รูปสินค้าบนร้าน</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {form.images.map((ref, i) => (
                    <button key={`p-${i}`} type="button" onClick={() => { setVariant(picker.id, { imageUrl: ref }); setPicker(null); }} className="aspect-square overflow-hidden rounded-lg border border-slate-200 hover:ring-2 hover:ring-violet-300">
                      <img src={imgSrc(ref, 300)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs text-slate-500">คลังรูปของสินค้าในระบบ{detail?.matched_code ? ` (${detail.matched_code})` : ""}</div>
              {!matchedParent ? <p className="text-xs text-amber-700">ยังไม่จับคู่สินค้าในระบบ — จับคู่ก่อนถึงจะใช้รูปจากระบบได้</p>
                : sysImages == null ? <LoadingState label="กำลังโหลดรูปในระบบ…" />
                : sysImages.length === 0 ? <p className="text-xs text-slate-500">สินค้าในระบบยังไม่มีรูป</p>
                : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {sysImages.map((im) => {
                      const ref = systemImageRef(im.key);
                      const used = picker.mode === "product" && form.images.includes(ref);
                      const full = picker.mode === "product" && form.images.length >= MAX_LINE_IMAGES;
                      return (
                        <button key={im.key} type="button" disabled={used || full}
                          onClick={() => { if (picker.mode === "product") setImages((imgs) => [...imgs, ref]); else { setVariant(picker.id, { imageUrl: ref }); setPicker(null); } }}
                          className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 hover:ring-2 hover:ring-violet-300 disabled:opacity-40 disabled:hover:ring-0">
                          <img src={r2ImageUrl(im.key, 300) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                          {used && <span className="absolute inset-x-0 bottom-0 bg-white/90 text-center text-[10px] text-slate-600">เพิ่มแล้ว</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          </div>
        )}
      </ERPModal>
    </>
  );
}

