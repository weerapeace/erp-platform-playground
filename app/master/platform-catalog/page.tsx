"use client";

// สินค้าบนแพลตฟอร์ม (Platform Catalog) — ดูว่าแต่ละร้านมีสินค้าอะไร แล้วจับคู่กับสินค้าในระบบเรา + ตั้งค่าส่งข้อมูล (field mapping)
// หน้าหลัก: ปุ่มเลือกร้าน · การ์ดตัวเลขกดกรอง (StatFilterCards) · ตารางกลาง MiniTable · ยืนยัน/จับคู่ในแถว (MatchCandidates)
// โหมดจับคู่ทีละตัว: components/platform-catalog/match-workbench
// เดาคู่: /api/platform-catalog/suggest (ของกลาง lib/platform-match-suggest) · บันทึก: /api/platform-catalog/match (+ประวัติ เดิม→ใหม่)
// 🐛 เคยเจอ: เลือก Lazada แต่ตารางโชว์ของ Shopee — คำตอบของร้านเดิมที่มาช้ามาทับ → ทุกการโหลดมีเลขรอบ ทิ้งคำตอบของรอบเก่า

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { MiniTable, LayoutSwitch, useMiniTableLayout, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { ListingCard, ShopStateBadge } from "@/components/platform-catalog/listing-card";
import { ConfirmDialog } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { StatFilterCards } from "@/components/stat-filter-cards";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { MatchCandidates, type PickedParent } from "@/components/platform-catalog/match-candidates";
import { MatchWorkbench } from "@/components/platform-catalog/match-workbench";
import { IgnoreDialog, IGNORE_REASON_DUP } from "@/components/platform-catalog/ignore-dialog";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { PLATFORM_SOURCE_FIELDS } from "@/lib/platform-source-fields";
import { isSellingPlatform } from "@/lib/selling-platforms";
import { listingMatchStatus, type ListingMatchStatus, type MatchSuggestion } from "@/lib/platform-match-suggest";
import { detectProfile, profilesForPlatform, getProfile, dbRowToProfile, type ImportMatrix, type ImportProfile, type DbProfileRow } from "@/lib/platform-import-profiles";
import PlatformImportProfileManager from "@/components/platform-import-profile-manager";
import { PlatformShopView } from "@/components/platform-catalog/shop-view";
import { ListingDrawer } from "@/components/platform-catalog/listing-drawer";
import { NotListedPicker } from "@/components/platform-catalog/not-listed-picker";
import { useLineDisplay } from "@/components/platform-catalog/use-line-display";
import { ToggleSwitch } from "@/components/toggle-switch";
import { FloatingDropdown } from "@/components/floating-dropdown";
import type { AddWizardParent } from "@/components/platform-listing/add-to-platform-wizard";
import { BrandGate, BrandAvatar } from "@/components/platform-catalog/brand-gate";
import {
  duplicateCounts, duplicateKey, discountPct, effectivePrice, priceFlags, isGoneStatus, shopStateOf, LOW_STOCK_MAX, PRICE_FLAG_LABEL,
  type ListingCardSummary, type ListingSummariesResponse, type ShopBrandSummary, type ShopState,
} from "@/lib/platform-listing-health";

// Drawer รายละเอียดต่อแพลตฟอร์ม (ของกลาง เปิดจาก Parent SKUs ด้วย) — dynamic กัน bundle หนัก
const ProductPlatformManager = dynamic(() => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager), { ssr: false });
// ตัวช่วยลงสินค้า (ของกลาง) — ปุ่ม "เพิ่มสินค้าขึ้นร้าน"
const AddToPlatformWizard = dynamic(() => import("@/components/platform-listing/add-to-platform-wizard").then((m) => m.AddToPlatformWizard), { ssr: false });

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type FieldRow = { field_key: string; field_label: string | null; data_type: string | null; is_required: boolean; sample: string | null; source: string };
type Listing = {
  id: string; external_product_id: string | null; title: string | null; sku_code: string | null;
  matched_parent_sku_id: string | null; matched_code?: string | null; matched_name?: string | null; price: number | null; status: string | null;
  match_ignored?: boolean | null; match_ignore_reason?: string | null; match_ignored_at?: string | null;
  last_imported_at?: string | null;
};
type Filter = "all" | ListingMatchStatus | "dup";
// กรองตามสถานะบนร้าน (ใช้ร่วมกับการ์ดกรองสถานะจับคู่) — "หมดแต่ยังเปิดขาย" = ลูกค้าเห็นแต่ซื้อไม่ได้
type ShopFilter = "" | "out" | "low" | "hidden" | "review" | "price";
const SHOP_FILTERS: { key: Exclude<ShopFilter, "">; label: string; tip: string }[] = [
  { key: "out", label: "หมดแต่ยังเปิดขาย", tip: "ลูกค้าเห็นแต่ซื้อไม่ได้ — เติมสต๊อก หรือปิดขายไว้ก่อน" },
  { key: "low", label: `ใกล้หมด (≤${LOW_STOCK_MAX})`, tip: "เปิดขายอยู่ แต่เหลือรวมทุกตัวเลือกไม่เกิน 3 ชิ้น" },
  { key: "hidden", label: "ปิดขาย", tip: "ปิดขายบนร้านอยู่ — ตรวจว่าตั้งใจปิดไหม" },
  { key: "review", label: "รอตรวจ", tip: "ยังไม่ได้ข้อมูลจากร้าน (เช่น ระบบสร้างขึ้นร้านเองแต่ยังไม่ได้ดึงกลับ)" },
  { key: "price", label: "ราคาผิดปกติ", tip: "ลูกค้าจ่ายต่ำกว่า 10฿ · ลดเกิน 80% · หรือราคาที่ลูกค้าจ่ายบนร้านไม่ตรงกับที่ระบบจะส่ง (LINE ที่จับคู่แล้ว · แค่ราคาเต็มไม่ตรงไม่นับ)" },
];
// ผลป้าย "ไม่อยู่บนร้านแล้ว" หลังกดดึงสินค้า (lib/platform-catalog-sync) → ข้อความต่อท้าย
const goneNote = (j: { removed?: number; restored?: number; removed_skipped?: number; complete?: boolean }) => [
  j.removed ? ` · ไม่อยู่บนร้านแล้ว ${j.removed} รายการ (ดูการ์ด "ไม่อยู่บนร้านแล้ว")` : "",
  j.restored ? ` · กลับมาบนร้าน ${j.restored} รายการ` : "",
  j.removed_skipped ? ` · ⚠️ ไม่เจอ ${j.removed_skipped} รายการ (เกินครึ่งร้าน — สงสัยดึงมาไม่ครบ เลยยังไม่ติดป้าย ลองดึงใหม่)` : "",
  j.complete === false ? " · ยังดึงไม่ครบทั้งร้าน เลยยังไม่เช็กว่าตัวไหนถูกลบ" : "",
].join("");
const priceFlagText = (s: ListingCardSummary | undefined) => priceFlags(s).map((f) => (f === "erp" && s?.erpPriceDiff ? `ราคาขายไม่ตรงระบบ ${s.erpPriceDiff} ตัวเลือก` : PRICE_FLAG_LABEL[f])).join(" · ");
// เรียงตามสถานะบนร้าน: ปัญหาก่อน
const STATE_RANK: Record<ShopState, number> = { out: 0, low: 1, review: 2, hidden: 3, selling: 4, nodata: 5, gone: 6 };
const SORT_LS = "platform-catalog:sort";
// สีพื้นไอคอนในเมนูตั้งค่าร้าน (ไอคอนเส้นมีสี)
const TOOL_TONE = {
  emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700",
  violet: "bg-violet-50 text-violet-700", indigo: "bg-indigo-50 text-indigo-700", slate: "bg-slate-100 text-slate-600",
} as const;
type IgnorePatch = { match_ignored: boolean; match_ignore_reason: string | null; match_ignored_at: string | null };

// มุมมอง: จับคู่ (เดิม · ค่าเริ่มต้นในแอปช่องทางขาย) / หน้าร้าน (แบบ Seller Center · เมนูในแอปจัดการงานเปิดด้วย ?view=shop)
type PageView = "match" | "shop";
function readViewParam(): PageView {
  if (typeof window === "undefined") return "match";
  return new URLSearchParams(window.location.search).get("view") === "shop" ? "shop" : "match";
}

// ยืนยันทีเดียวเกินนี้ต้องพิมพ์คำยืนยัน (กฎ bulk ของระบบ)
const TYPED_CONFIRM_OVER = 100;
const LAST_KEY = "platform-catalog:last";
function readLast(): { platformId?: string; brandId?: string } {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as { platformId?: string; brandId?: string }; } catch { return {}; }
}

export default function PlatformCatalogPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.platforms.edit");
  const canPublish = can("products.platforms.publish");   // ส่งขึ้นร้านจริง (แก้สินค้า/เปิดปิดขายจากลิ้นชัก)
  const [addPick, setAddPick] = useState(false);              // ป๊อปเลือกสินค้าที่ยังไม่ลง
  const [addFor, setAddFor] = useState<AddWizardParent[] | null>(null);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  // เมนูตั้งค่าร้าน (ปุ่ม "ตั้งค่า" หัวหน้า) + ยืนยันก่อนส่งราคาทั้งหมด
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLButtonElement>(null);
  const [pushAllAsk, setPushAllAsk] = useState(false);   // ป๊อปเพิ่มสินค้า → "ไปจับคู่" → เปิดลิ้นชักรายการนั้นเมื่อตารางโหลดเสร็จ
  const fileRef = useRef<HTMLInputElement>(null);
  const catFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // คิวไฟล์ที่อ่านแล้วรอยืนยันชนิด (เลือกได้หลายไฟล์ เดาให้ทุกไฟล์ → ยืนยัน → นำเข้าตามลำดับ)
  const [queue, setQueue] = useState<{ id: number; fileName: string; matrix: ImportMatrix; profileId: string }[]>([]);
  const qid = useRef(0);
  // ชนิดไฟล์ที่ผู้ใช้สร้างเอง (custom, active) — รวมกับโปรไฟล์มาตรฐานตอนเดา/เลือก
  const [customProfiles, setCustomProfiles] = useState<ImportProfile[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // ป๊อปรายละเอียดสินค้าบนร้าน (กดแถว)
  const [openListing, setOpenListing] = useState<Listing | null>(null);
  const [modalSugs, setModalSugs] = useState<MatchSuggestion[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [managerParent, setManagerParent] = useState<string | null>(null);   // เปิด ProductPlatformManager (แก้รายละเอียดต่อแพลตฟอร์ม)
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [bootError, setBootError] = useState<string | null>(null);
  const [tab, setTab] = useState<"catalog" | "fields" | "mapping">("catalog");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [platformCounts, setPlatformCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // คู่ที่ระบบเดา (โหลดตามหลังตาราง)
  const [suggestions, setSuggestions] = useState<Record<string, MatchSuggestion[]>>({});
  const [high, setHigh] = useState<Set<string>>(new Set());
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  // จับคู่ในแถว / ทีละตัว / ยืนยันหลายตัว
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [workbench, setWorkbench] = useState(false);
  const [bulkAsk, setBulkAsk] = useState<null | "high" | "selected">(null);   // ยืนยันหลายตัว: ทุกตัวที่รหัสตรง / เฉพาะที่ติ๊ก
  const [bulkBusy, setBulkBusy] = useState(false);
  // ไม่ต้องจับคู่ (ข้าม) — ติ๊กหลายตัว + ป๊อปเลือกเหตุผล
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ignoreTarget, setIgnoreTarget] = useState<string[] | null>(null);
  const [ignoreBusy, setIgnoreBusy] = useState(false);
  const [dupKeepAsk, setDupKeepAsk] = useState(false);   // ป๊อปยืนยัน "เก็บตัวนี้ · ที่เหลือไม่ต้องจับคู่ (ซ้ำบนร้าน)"
  // รูป/สต๊อก/สถานะ/ราคาบนร้าน ต่อรายการ (โหลดตามหลังตาราง) + การ์ด/ตาราง + เรียง (จำในเครื่อง)
  const [summ, setSumm] = useState<Record<string, ListingCardSummary>>({});
  const [summLoading, setSummLoading] = useState(false);
  const [shopFilter, setShopFilter] = useState<ShopFilter>("");
  const [layout, setLayout] = useMiniTableLayout("platform-catalog-listings");
  // เปิด/ปิดขายบน LINE (สวิตช์ในแถว/การ์ด/แถบเลือกหลายตัว) → อัปเดตสถานะในหน้าเลย ไม่ต้องโหลดใหม่
  const disp = useLineDisplay((results) => {
    setSumm((m) => {
      const n = { ...m };
      for (const r of results) {
        const s = n[r.listing_id];
        if (r.ok && s) { const display = !!r.display; n[r.listing_id] = { ...s, display, state: shopStateOf(display, s.stock, true) }; }
      }
      return n;
    });
  });
  // ลิ้นชักส่งขึ้น LINE สำเร็จ → แก้ชื่อ/สถานะในตารางให้ตรง
  const onListingChanged = useCallback((id: string, patch: { title?: string; display?: boolean }) => {
    if (patch.title) {
      const t = patch.title;
      setListings((ls) => ls.map((x) => (x.id === id ? { ...x, title: t } : x)));
      setOpenListing((o) => (o && o.id === id ? { ...o, title: t } : o));
    }
    if (patch.display != null) {
      const display = patch.display;
      setSumm((m) => { const s = m[id]; return s ? { ...m, [id]: { ...s, display, state: shopStateOf(display, s.stock, true) } } : m; });
    }
  }, []);
  const [sortKey, setSortKey] = useState("todo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(SORT_LS) ?? "null") as { k?: string; d?: string } | null; if (s && typeof s.k === "string") { setSortKey(s.k); setSortDir(s.d === "desc" ? "desc" : "asc"); } } catch { /* ไม่จำก็ได้ */ }
  }, []);
  const onSortChange = useCallback((k: string, d: "asc" | "desc") => {
    setSortKey(k); setSortDir(d);
    try { localStorage.setItem(SORT_LS, JSON.stringify({ k, d })); } catch { /* ไม่จำก็ได้ */ }
  }, []);
  // มุมมองหน้าร้าน — อ่านจาก URL ตอนเปิด · สลับแล้วเขียนกลับ URL (รีเฟรชแล้วอยู่มุมมองเดิม)
  const [view, setViewState] = useState<PageView>("match");
  const [viewReady, setViewReady] = useState(false);
  const [shopReload, setShopReload] = useState(0);
  const [pickedBrand, setPickedBrand] = useState<ShopBrandSummary | null>(null);   // การ์ดที่เลือกจากหน้าเลือกแบรนด์ (ใช้โลโก้บนหัวหน้า)
  useEffect(() => { setViewState(readViewParam()); setViewReady(true); }, []);
  const setView = useCallback((v: PageView) => {
    setViewState(v);
    try {
      const u = new URL(window.location.href);
      if (v === "shop") u.searchParams.set("view", "shop"); else u.searchParams.delete("view");
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* เขียน URL ไม่ได้ก็ไม่เป็นไร */ }
  }, []);

  // รายชื่อร้าน (เฉพาะร้านขายของ) + แบรนด์ → เปิดร้าน/แบรนด์ที่ดูล่าสุด
  useEffect(() => { (async () => {
    try {
      const j = await apiFetch("/api/platform-accounts").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const pfs = ((j.platforms ?? []) as Platform[]).filter((p) => isSellingPlatform(p.code));
      const brs = (j.brands ?? []) as Brand[];
      const last = readLast();
      setPlatforms(pfs); setBrands(brs);
      setBrandId(last.brandId && brs.some((b) => b.id === last.brandId) ? last.brandId : "");
      setPlatformId(last.platformId && pfs.some((p) => p.id === last.platformId) ? last.platformId : (pfs[0]?.id ?? ""));
      setBootError(null);
    } catch (e) { setBootError((e as Error).message); }
  })(); }, []);
  useEffect(() => {
    if (!platformId) return;
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ platformId, brandId })); } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
  }, [platformId, brandId]);

  // โหลดชนิดไฟล์ที่ผู้ใช้สร้างเอง (เฉพาะที่เปิดใช้งาน) สำหรับใช้เดา/เลือกตอนนำเข้า
  const profSeq = useRef(0);
  const loadCustomProfiles = useCallback(async () => {
    const my = ++profSeq.current;
    if (!platformId) { setCustomProfiles([]); return; }
    try {
      const j = await apiFetch(`/api/platform-import-profiles?platform_id=${platformId}`).then((r) => r.json());
      if (my !== profSeq.current) return;
      const code = (j.platformCode as string) ?? platforms.find((p) => p.id === platformId)?.code ?? "";
      const rows = ((j.custom ?? []) as (DbProfileRow & { is_active?: boolean })[]).filter((r) => r.is_active !== false);
      setCustomProfiles(rows.map((r) => dbRowToProfile(r, code)));
    } catch { if (my === profSeq.current) setCustomProfiles([]); }
  }, [platformId, platforms]);
  useEffect(() => { loadCustomProfiles(); }, [loadCustomProfiles]);

  // โหลดสินค้าของร้าน+แบรนด์ที่เลือก → แล้วค่อยเดาคู่ตามหลัง (ช้ากว่า) — ตารางขึ้นก่อน
  // เลขรอบ (reqSeq): สลับร้าน/แบรนด์ระหว่างโหลด → คำตอบของรอบเก่าถูกทิ้ง ไม่มาทับร้านที่เลือกอยู่
  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    if (!platformId) return;
    const my = ++reqSeq.current;
    setLoading(true); setLoadError(null);
    setListings([]); setFields([]); setMappings({});
    setSuggestions({}); setHigh(new Set()); setSuggestError(false); setExpanded(new Set()); setSelected(new Set());
    setSumm({}); setShopFilter("");
    let unmatched = 0;
    try {
      const q = new URLSearchParams({ platform_id: platformId, with_counts: "1" }); if (brandId) q.set("brand_id", brandId);
      const [j, mj] = await Promise.all([
        apiFetch(`/api/platform-catalog?${q}`).then((r) => r.json()),
        apiFetch(`/api/platform-field-mappings?platform_id=${platformId}`).then((r) => r.json()),
      ]);
      if (my !== reqSeq.current) return;
      if (j.error) throw new Error(j.error);
      const ls = (j.listings ?? []) as Listing[];
      setFields((j.fields ?? []) as FieldRow[]);
      setListings(ls);
      setMappings((mj.mappings ?? {}) as Record<string, string>);
      if (j.platform_counts) setPlatformCounts(j.platform_counts as Record<string, number>);
      unmatched = ls.filter((l) => !l.matched_parent_sku_id).length;
    } catch (e) {
      if (my === reqSeq.current) setLoadError((e as Error).message);
      return;
    } finally { if (my === reqSeq.current) setLoading(false); }

    // รูป/สต๊อก/สถานะบนร้าน — โหลดคู่กับตัวเดา ไม่บังตาราง · เฉพาะร้านที่ส่งข้อมูลพวกนี้มา (LINE/Lazada — ไฟล์ export ของ Shopee ไม่มี)
    const pfCode = platforms.find((p) => p.id === platformId)?.code ?? "";
    if (pfCode === "line_shopping" || pfCode === "lazada") {
    setSummLoading(true);
    const smq = new URLSearchParams({ platform_id: platformId, view: "summary" }); if (brandId) smq.set("brand_id", brandId);
    void apiFetch(`/api/platform-catalog?${smq}`).then((r) => r.json())
      .then((j: ListingSummariesResponse) => { if (my === reqSeq.current && !j.error) setSumm(j.summaries ?? {}); })
      .catch(() => { /* ไม่มีรูป/สต๊อกก็ยังจับคู่ได้ */ })
      .finally(() => { if (my === reqSeq.current) setSummLoading(false); });
    }

    if (unmatched === 0) return;
    setSuggestLoading(true);
    try {
      const sq = new URLSearchParams({ platform_id: platformId }); if (brandId) sq.set("brand_id", brandId);
      const sj = await apiFetch(`/api/platform-catalog/suggest?${sq}`).then((r) => r.json());
      if (my !== reqSeq.current) return;
      if (sj.error) throw new Error(sj.error);
      setSuggestions((sj.suggestions ?? {}) as Record<string, MatchSuggestion[]>);
      setHigh(new Set((sj.high ?? []) as string[]));
    } catch { if (my === reqSeq.current) setSuggestError(true); }
    finally { if (my === reqSeq.current) setSuggestLoading(false); }
  }, [platformId, brandId, platforms]);
  // มุมมองหน้าร้านโหลดข้อมูลของตัวเอง (สรุปสต๊อก/สถานะ) → ไม่ต้องโหลดตารางจับคู่ + เดาคู่ (หนัก) ซ้ำ
  useEffect(() => { if (viewReady && view === "match") load(); }, [load, view, viewReady]);
  /** หลังดึงสินค้าจากร้าน → โหลดมุมมองที่เปิดอยู่ใหม่ */
  const reloadCurrent = useCallback(async () => {
    if (view === "shop") setShopReload((n) => n + 1); else await load();
  }, [view, load]);

  // ---------- จับคู่ ----------
  const statusOf = useCallback((l: Listing): ListingMatchStatus => listingMatchStatus(l, suggestions[l.id]?.[0]?.score), [suggestions]);
  // ทั้งหมด = ที่ยังอยู่บนร้าน · ตัวที่ร้านลบไปแล้ว (ดึงครบทั้งร้านแต่ไม่เจอ) แยกการ์ด "ไม่อยู่บนร้านแล้ว" ไว้ให้ล้าง
  const counts = useMemo(() => {
    const c = { all: 0, ok: 0, guess: 0, none: 0, ignored: 0, gone: 0 };
    for (const l of listings) c[statusOf(l)]++;
    c.all = listings.length - c.gone;
    return c;
  }, [listings, statusOf]);
  // ชื่อ+รหัสซ้ำบนร้าน = ร้านมีหลายหน้าขายของชิ้นเดียวกัน (เช่น JEAN08 ถูกสร้างบน LINE 6 ครั้งตอนทดสอบ)
  //   กฎเดียวกับมุมมองหน้าร้าน (lib/platform-listing-health) · ไม่นับตัวที่ตั้งไม่ต้องจับคู่แล้ว/ไม่อยู่บนร้านแล้ว → เก็บไว้ตัวเดียวแล้วป้ายหายเอง
  const activeListings = useMemo(() => listings.filter((l) => !l.match_ignored && !isGoneStatus(l.status)), [listings]);
  const dupCounts = useMemo(() => duplicateCounts(activeListings), [activeListings]);
  // ยืนยันทั้งหมด: ไม่รวมตัวที่ซ้ำบนร้าน (ไม่งั้นทุกชิ้นซ้ำถูกจับกับรุ่นเดียวกันหมด) — ให้คนเลือกเก็บตัวเดียวเอง
  const highAll = useMemo(() => listings.filter((l) => statusOf(l) === "guess" && high.has(l.id) && suggestions[l.id]?.[0]), [listings, high, suggestions, statusOf]);
  const highRows = useMemo(() => highAll.filter((l) => !dupCounts.has(l.id)), [highAll, dupCounts]);
  const highDupSkipped = highAll.length - highRows.length;
  const matchRows = useMemo(() => filter === "all" ? listings.filter((l) => !isGoneStatus(l.status)) : filter === "dup" ? listings.filter((l) => dupCounts.has(l.id)) : listings.filter((l) => statusOf(l) === filter), [listings, filter, statusOf, dupCounts]);
  const shownRows = useMemo(() => !shopFilter ? matchRows
    : shopFilter === "price" ? matchRows.filter((l) => priceFlags(summ[l.id]).length > 0)
    : matchRows.filter((l) => summ[l.id]?.state === shopFilter), [matchRows, shopFilter, summ]);
  // ร้านนี้ส่งสถานะ/สต๊อก/รูปมาไหม (ไฟล์ export ของ Shopee = ไม่ส่ง → ซ่อนคอลัมน์/ชิปที่ใช้ไม่ได้)
  const summList = useMemo(() => Object.values(summ), [summ]);
  const hasShopData = summList.some((s) => s.state !== "nodata");
  const showThumbs = summList.some((s) => s.imageKnown);
  const shopCounts = useMemo(() => {
    const c: Record<ShopState | "price", number> = { selling: 0, low: 0, out: 0, hidden: 0, review: 0, nodata: 0, gone: 0, price: 0 };
    for (const l of matchRows) { const s = summ[l.id]; if (s) { c[s.state]++; if (priceFlags(s).length) c.price++; } }
    return c;
  }, [matchRows, summ]);
  // เรียงแบบพิเศษ (เมนูเรียงของตาราง — ใช้ได้ทั้งตารางและการ์ด) · สต๊อก/ราคา/สถานะร้าน = เรียงตามคอลัมน์ (สลับทิศได้)
  const extraSorts = useMemo(() => {
    const rankOf = (l: Listing) => (dupCounts.has(l.id) ? 0 : ({ guess: 1, none: 2, ok: 3, ignored: 4, gone: 5 } as const)[statusOf(l)]);
    const extId = (l: Listing) => Number(l.external_product_id) || 0;   // LINE เลขสินค้าเรียงตามวันที่ลงร้าน (ร้านไม่ส่งวันที่มา)
    const byTitle = (a: Listing, b: Listing) => (a.title ?? "").localeCompare(b.title ?? "", "th");
    return [
      { key: "todo", label: "เรียง: งานที่ต้องทำก่อน", compare: (a: Listing, b: Listing) => rankOf(a) - rankOf(b) || byTitle(a, b) },
      { key: "dupnear", label: "เรียง: ชื่อ ก–ฮ (ตัวซ้ำอยู่ติดกัน)", compare: (a: Listing, b: Listing) => byTitle(a, b) || (a.sku_code ?? "").localeCompare(b.sku_code ?? "") || extId(a) - extId(b) },
      { key: "disc", label: "เรียง: ลดราคามากสุด (%)", compare: (a: Listing, b: Listing) => discountPct(summ[b.id]) - discountPct(summ[a.id]) },
      { key: "newest", label: "เรียง: ลงร้านล่าสุดก่อน", compare: (a: Listing, b: Listing) => extId(b) - extId(a) },
      { key: "variants", label: "เรียง: ตัวเลือกเยอะสุด", compare: (a: Listing, b: Listing) => (summ[b.id]?.variants ?? 0) - (summ[a.id]?.variants ?? 0) },
    ];
  }, [dupCounts, statusOf, summ]);

  const applyMatch = (listingId: string, r: { matched_parent_sku_id: string | null; matched_code: string | null; matched_name: string | null }) => {
    setListings((ls) => ls.map((x) => x.id === listingId ? { ...x, ...r } : x));
    setOpenListing((o) => o && o.id === listingId ? { ...o, ...r } : o);
  };
  // บันทึกคู่ 1 ตัว (parent = null คือยกเลิกจับคู่) · quiet = ไม่เด้งแจ้ง (โหมดทีละตัวมีแถบความคืบหน้าบอกอยู่แล้ว)
  const saveMatch = async (listingId: string, parent: PickedParent | null, quiet = false): Promise<boolean> => {
    setBusyIds((s) => new Set(s).add(listingId));
    try {
      const r = await apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ listing_id: listingId, parent_sku_id: parent?.id ?? null }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      applyMatch(listingId, { matched_parent_sku_id: j.matched_parent_sku_id ?? null, matched_code: j.matched_code ?? null, matched_name: j.matched_name ?? null });
      // จับคู่ตัวที่เคยข้าม → API ล้างสถานะข้ามแล้ว ให้หน้าตรงกัน
      if (parent) setListings((ls) => ls.map((x) => x.id === listingId ? { ...x, match_ignored: false, match_ignore_reason: null, match_ignored_at: null } : x));
      setExpanded((s) => { const n = new Set(s); n.delete(listingId); return n; });
      if (!quiet) toast.success(parent ? `จับคู่กับ ${j.matched_code ?? parent.code} แล้ว` : "ยกเลิกจับคู่แล้ว");
      return true;
    } catch (e) { toast.error("จับคู่ไม่สำเร็จ: " + (e as Error).message); return false; }
    finally { setBusyIds((s) => { const n = new Set(s); n.delete(listingId); return n; }); }
  };
  const confirmTop = (l: Listing) => {
    const s = suggestions[l.id]?.[0];
    if (s) void saveMatch(l.id, { id: s.parent_sku_id, code: s.code, name: s.name });
  };
  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ---------- ไม่ต้องจับคู่ (ข้าม) ----------
  // ignored=true ต้องมีเหตุผล · ตัวที่จับคู่อยู่ข้ามไม่ได้ (API ข้ามให้เอง → skipped) · ส่งเป็นชุดละ 500
  const saveIgnore = async (ids: string[], ignored: boolean, reason: string | null, quiet = false): Promise<boolean> => {
    if (ids.length === 0) return false;
    setIgnoreBusy(true);
    let updated = 0, skipped = 0;
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await apiFetch("/api/platform-catalog/ignore", { method: "POST", body: JSON.stringify({ listing_ids: ids.slice(i, i + 500), ignored, reason }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        const patch = new Map(((j.results ?? []) as ({ listing_id: string } & IgnorePatch)[]).map((x) => [x.listing_id, x]));
        setListings((ls) => ls.map((l) => { const p = patch.get(l.id); return p ? { ...l, match_ignored: p.match_ignored, match_ignore_reason: p.match_ignore_reason, match_ignored_at: p.match_ignored_at } : l; }));
        setOpenListing((o) => { const p = o && patch.get(o.id); return p ? { ...o!, match_ignored: p.match_ignored, match_ignore_reason: p.match_ignore_reason, match_ignored_at: p.match_ignored_at } : o; });
        updated += j.updated ?? 0; skipped += j.skipped ?? 0;
      }
      setExpanded((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
      setSelected(new Set());
      if (!quiet) {
        const head = ignored ? `ตั้งไม่ต้องจับคู่ ${updated.toLocaleString()} รายการแล้ว` : `เลิกข้าม ${updated.toLocaleString()} รายการ — กลับไปรอจับคู่`;
        toast.success(skipped ? `${head} · ข้ามไป ${skipped} รายการ (จับคู่อยู่แล้ว/ไม่ได้ข้าม)` : head);
      }
      return updated > 0;
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ${updated ? ` (ทำไปแล้ว ${updated} รายการ)` : ""}: ${(e as Error).message}`); return false; }
    finally { setIgnoreBusy(false); }
  };
  const ignoreTargetRows = useMemo(() => (ignoreTarget ?? []).map((id) => listings.find((l) => l.id === id)).filter(Boolean) as Listing[], [ignoreTarget, listings]);
  const selectedRows = useMemo(() => listings.filter((l) => selected.has(l.id)), [listings, selected]);
  const selIgnorable = selectedRows.filter((l) => !l.matched_parent_sku_id && !l.match_ignored && !isGoneStatus(l.status)).map((l) => l.id);
  const selGone = selectedRows.filter((l) => isGoneStatus(l.status)).map((l) => l.id);
  // เปิด/ปิดขายหลายตัว (LINE เท่านั้น · ตัวที่รู้สถานะบนร้าน · ไม่นับตัวที่ไม่อยู่บนร้านแล้ว)
  const selLive = platforms.find((p) => p.id === platformId)?.code === "line_shopping" ? selectedRows.filter((l) => { const s = summ[l.id]; return s && s.display != null && s.state !== "gone"; }) : [];
  const selToOpen = selLive.filter((l) => !summ[l.id]?.display);
  const selToHide = selLive.filter((l) => summ[l.id]?.display);
  const goneIds = useMemo(() => listings.filter((l) => isGoneStatus(l.status)).map((l) => l.id), [listings]);
  // ล้างรายการที่ไม่อยู่บนร้านแล้ว (สำเนาในระบบเรา — ร้านลบไปแล้ว) · ลบได้เฉพาะตัวที่ติดป้ายจริง (server เช็กซ้ำ)
  const [goneBusy, setGoneBusy] = useState(false);
  const clearGone = async (ids: string[]) => {
    if (ids.length === 0) return;
    const matchedN = listings.filter((l) => ids.includes(l.id) && l.matched_parent_sku_id).length;
    const ok = await askConfirm({
      title: `ล้างรายการที่ไม่อยู่บนร้านแล้ว ${ids.length.toLocaleString()} รายการ?`,
      message: `ร้านลบสินค้าเหล่านี้ไปแล้ว (ดึงครบทั้งร้านแต่ไม่เจอ) — ลบสำเนาออกจากระบบเรา${matchedN ? ` · การจับคู่ ${matchedN.toLocaleString()} รายการจะหายไปด้วย` : ""} · ถ้าวันหลังร้านเปิดขายกลับ กดดึงสินค้าใหม่แล้วจะกลับมาเอง (ต้องจับคู่ใหม่)`,
      confirmText: "ยืนยันล้าง", variant: "danger",
    });
    if (!ok) return;
    setGoneBusy(true);
    let deleted = 0;
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await apiFetch("/api/platform-catalog", { method: "DELETE", body: JSON.stringify({ gone_ids: ids.slice(i, i + 500) }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        deleted += Number(j.deleted ?? 0);
      }
      toast.success(`ล้างรายการที่ไม่อยู่บนร้านแล้ว ${deleted.toLocaleString()} รายการ`);
      const gone = new Set(ids);
      setListings((ls) => ls.filter((l) => !(gone.has(l.id) && isGoneStatus(l.status))));
      setSelected((s) => new Set([...s].filter((id) => !gone.has(id))));
      if (filter === "gone") setFilter("all");
    } catch (e) { toast.error(`ล้างไม่สำเร็จ${deleted ? ` (ล้างไปแล้ว ${deleted} รายการ)` : ""}: ${(e as Error).message}`); await reloadCurrent(); }
    finally { setGoneBusy(false); }
  };
  const selIgnored = selectedRows.filter((l) => !l.matched_parent_sku_id && l.match_ignored).map((l) => l.id);

  // ติ๊กแล้วยืนยันคู่ที่ระบบเดา — ไม่รวมตัวซ้ำบนร้าน (ต้องเลือกเก็บทีละตัว)
  const selGuessAll = selectedRows.filter((l) => statusOf(l) === "guess" && suggestions[l.id]?.[0]);
  const selGuess = selGuessAll.filter((l) => !dupCounts.has(l.id));
  const selGuessDup = selGuessAll.length - selGuess.length;
  const bulkRows = bulkAsk === "selected" ? selGuess : bulkAsk === "high" ? highRows : [];
  const bulkSure = bulkRows.filter((l) => high.has(l.id)).length;   // รหัสตรงกันและไม่กำกวม (มั่นใจ)
  // ยืนยันหลายตัวทีเดียว (ส่งเป็นชุดละ 500) — ทุกตัวที่รหัสตรงกัน หรือเฉพาะที่ติ๊ก
  const confirmMany = async () => {
    const rows = bulkRows;
    if (rows.length === 0) return;
    setBulkBusy(true);
    let updated = 0;
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const items = rows.slice(i, i + 500).map((l) => ({ listing_id: l.id, parent_sku_id: suggestions[l.id][0].parent_sku_id }));
        const r = await apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ items }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        for (const x of (j.results ?? []) as { listing_id: string; matched_parent_sku_id: string | null; matched_code: string | null; matched_name: string | null }[]) applyMatch(x.listing_id, x);
        updated += j.updated ?? 0;
      }
      toast.success(`จับคู่แล้ว ${updated.toLocaleString()} รายการ — แก้ทีหลังได้ทีละตัว (มีประวัติเก็บไว้)`);
      if (bulkAsk === "selected") setSelected(new Set());
      setBulkAsk(null);
    } catch (e) { toast.error(`จับคู่ได้ ${updated} รายการ แล้วสะดุด: ${(e as Error).message}`); }
    finally { setBulkBusy(false); }
  };

  // ---------- นำเข้าไฟล์ ----------
  // ขั้นที่ 1: อ่านไฟล์ (xlsx/csv) เป็น matrix ดิบ → เดาชนิดไฟล์ → เข้าคิว (รับได้หลายไฟล์)
  const importFiles = async (files: File[]) => {
    if (!platformId) { setNote("เลือกร้านก่อน"); return; }
    setImporting(true); setNote(`กำลังอ่านไฟล์... (${files.length})`);
    try {
      const XLSX = await import("xlsx");
      const code = platforms.find((p) => p.id === platformId)?.code ?? "";
      const items: { id: number; fileName: string; matrix: ImportMatrix; profileId: string }[] = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as ImportMatrix;
        if (matrix.length === 0) continue;
        const guessed = detectProfile(code, matrix, customProfiles);
        items.push({ id: ++qid.current, fileName: file.name, matrix, profileId: guessed.id });
      }
      if (items.length === 0) { setNote("ไม่พบข้อมูลในไฟล์ที่เลือก"); return; }
      setQueue((q) => [...q, ...items]);
      setNote(null);
    } catch (e) { setNote("อ่านไฟล์ไม่สำเร็จ: " + (e as Error).message); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // ขั้นที่ 2: ยืนยันแล้ว → นำเข้าทีละไฟล์ตามลำดับ (ไฟล์ระดับสินค้าก่อนระดับตัวเลือก เพื่อให้ใส่ชื่อ/รหัสก่อน)
  const confirmImportAll = async () => {
    if (queue.length === 0) return;
    const items = [...queue].sort((a, b) => {
      const la = getProfile(a.profileId, customProfiles)?.level === "variation" ? 1 : 0;
      const lb = getProfile(b.profileId, customProfiles)?.level === "variation" ? 1 : 0;
      return la - lb;
    });
    setImporting(true);
    let okFiles = 0, skipped = 0; const errors: string[] = [];
    const sum = { products: 0, created: 0, updated: 0, matched: 0 };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const prof = getProfile(it.profileId, customProfiles);
      if (prof?.kind === "orders") { skipped++; continue; }
      setNote(`กำลังนำเข้า ${i + 1}/${items.length}: ${it.fileName} ...`);
      try {
        const r = await apiFetch("/api/platform-catalog/import", { method: "POST", body: JSON.stringify({ platform_id: platformId, brand_id: brandId || undefined, profile_id: it.profileId, matrix: it.matrix }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        okFiles++; sum.products += j.products ?? 0; sum.created += j.created ?? 0; sum.updated += j.updated ?? 0; sum.matched += j.matched ?? 0;
      } catch (e) { errors.push(`${it.fileName}: ${(e as Error).message}`); }
    }
    setQueue([]); setImporting(false);
    let msg = `นำเข้าเสร็จ ${okFiles} ไฟล์ · รวม ${sum.products} สินค้า (เพิ่มใหม่ ${sum.created} · อัปเดต ${sum.updated}) · จับคู่ ERP ได้ ${sum.matched}`;
    if (skipped) msg += ` · ข้ามไฟล์ออเดอร์ ${skipped} (ให้ไปนำเข้าที่หน้ารับออเดอร์)`;
    if (errors.length) msg += ` · ผิดพลาด ${errors.length} ไฟล์: ${errors.join(" | ")}`;
    setNote(msg);
    await reloadCurrent();
  };
  const setQueueProfile = (id: number, profileId: string) => setQueue((q) => q.map((it) => it.id === id ? { ...it, profileId } : it));
  const removeFromQueue = (id: number) => setQueue((q) => q.filter((it) => it.id !== id));

  // ---------- ป๊อปรายละเอียด ----------
  const openRow = (l: Listing) => {
    setOpenListing(l);
    setPushMsg(null);
    setModalSugs(suggestions[l.id] ?? null);
    // ตัวที่จับคู่แล้วไม่มีคู่ที่เดาติดมา → ขอเดาเฉพาะตัวนี้ (ไว้เทียบ/เปลี่ยนคู่)
    if (!suggestions[l.id]) {
      apiFetch(`/api/platform-catalog/suggest?listing_id=${l.id}`).then((r) => r.json())
        .then((j) => setModalSugs(((j.suggestions ?? {}) as Record<string, MatchSuggestion[]>)[l.id] ?? []))
        .catch(() => setModalSugs([]));
    }
  };
  // ป๊อปเพิ่มสินค้า แท็บ "อาจมีบนร้านแล้ว" → ไปจับคู่: สลับมาแท็บจับคู่ แล้วเปิดลิ้นชักของรายการนั้น
  useEffect(() => {
    if (!pendingOpen) return;
    const l = listings.find((x) => x.id === pendingOpen);
    if (l) { setPendingOpen(null); openRow(l); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen, listings]);
  // ลบรายการที่นำเข้าผิด (สำเนาในระบบเรา — ของบนร้านจริงไม่ถูกแตะ)
  const deleteListing = async () => {
    if (!openListing) return;
    const ok = await askConfirm({
      title: "ลบรายการนี้ออกจากระบบ?",
      message: `${openListing.matched_parent_sku_id ? "การจับคู่กับสินค้าในระบบจะหายไปด้วย · " : ""}ของบนร้านจริงไม่ถูกแตะ — ถ้ายังอยู่ในไฟล์ export รอบหน้าจะกลับมาเอง`,
      confirmText: "ยืนยันลบ", variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/api/platform-catalog?id=${openListing.id}`, { method: "DELETE" });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`ลบรายการ “${openListing.title || openListing.external_product_id || ""}” แล้ว`);
      setListings((ls) => ls.filter((x) => x.id !== openListing.id));
      setOpenListing(null);
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + (e as Error).message); }
    finally { setDeleting(false); }
  };
  // ส่งราคาขึ้น LINE เฉพาะสินค้านี้ (ทดสอบทีละตัวก่อนยิงทั้งหมด — ปลอดภัยกว่า)
  const pushOnePrice = async () => {
    if (!openListing?.matched_parent_sku_id) return;
    setPushing(true); setPushMsg("กำลังส่งราคาขึ้น LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/push-prices", { method: "POST", body: JSON.stringify({ brand_id: brandId, parent_sku_id: openListing.matched_parent_sku_id }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const first = (j.results ?? [])[0] as { ok?: boolean; error?: string; variants?: number } | undefined;
      setPushMsg(j.okCount > 0
        ? `✅ ส่งราคาขึ้น LINE สำเร็จ (${first?.variants ?? 0} ตัวเลือก) — ไปเช็กราคาใน MyShop ว่าถูกไหม`
        : `❌ ${first?.error ?? "ส่งไม่สำเร็จ"}`);
    } catch (e) { setPushMsg("❌ " + (e as Error).message); }
    finally { setPushing(false); }
  };
  // ส่งรายละเอียด (ชื่อ/รายละเอียด/แบรนด์/หมวด) ขึ้น LINE เฉพาะสินค้านี้
  const pushOneDetails = async () => {
    if (!openListing?.matched_parent_sku_id) return;
    setPushing(true); setPushMsg("กำลังส่งรายละเอียดขึ้น LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/push-details", { method: "POST", body: JSON.stringify({ brand_id: brandId, parent_sku_id: openListing.matched_parent_sku_id }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const first = (j.results ?? [])[0] as { ok?: boolean; error?: string; sent?: string[] } | undefined;
      setPushMsg(j.okCount > 0
        ? `✅ ส่งรายละเอียดขึ้น LINE สำเร็จ (ส่ง: ${(first?.sent ?? []).join(", ") || "-"}) — เช็กใน MyShop`
        : `❌ ${first?.error ?? "ส่งไม่สำเร็จ"}`);
    } catch (e) { setPushMsg("❌ " + (e as Error).message); }
    finally { setPushing(false); }
  };

  const platformCode = platforms.find((p) => p.id === platformId)?.code ?? "";
  const profileOptions = profilesForPlatform(platformCode, customProfiles);
  const activePf = platforms.find((p) => p.id === platformId);
  const activeBrand = brands.find((b) => b.id === brandId);

  // Lazada (ต่อ API · OAuth ผูกกับแบรนด์) — สถานะกุญแจ + ดึงสินค้าที่ลงไว้บนร้าน (อ่านอย่างเดียว)
  type LazStatus = { connected: boolean; health: "none" | "connected" | "expiring" | "expired"; days_left: number | null; short_code: string | null; configured: boolean };
  const [lazStatus, setLazStatus] = useState<LazStatus | null>(null);
  const lazSeq = useRef(0);
  useEffect(() => {
    const my = ++lazSeq.current;
    setLazStatus(null);
    if (platformCode !== "lazada" || !brandId) return;
    apiFetch(`/api/lazada/status?brand_id=${encodeURIComponent(brandId)}`).then((r) => r.json())
      .then((j) => { if (my === lazSeq.current && !j.error) setLazStatus(j as LazStatus); })
      .catch(() => { /* โชว์ปุ่มไม่ได้ก็ไม่เป็นไร */ });
  }, [platformCode, brandId]);
  // ดึงทั้งร้านแบบหลายครั้งต่อกัน (Lazada ตอบช้า ~10 วิต่อ 50 ตัว · ครั้งละไม่เกิน ~45 วิ) — เรียกต่อเองจนครบ
  //   Lazada ตอบผิดพลาด → ลองครั้งนั้นซ้ำ 1 ครั้ง · ยังไม่ได้ = หยุด แล้วจำจุดค้างไว้ กดอีกครั้ง = ดึงต่อจากตรงนั้น (ภายใน 25 นาที)
  const lazResume = useRef<{ brandId: string; offset: number; run: string; at: number } | null>(null);
  const syncLazada = async () => {
    if (!brandId) { setNote("เลือกแบรนด์/ร้านก่อน (การเชื่อม Lazada ผูกกับแบรนด์)"); return; }
    const resume = lazResume.current && lazResume.current.brandId === brandId && Date.now() - lazResume.current.at < 25 * 60_000 ? lazResume.current : null;
    let offset = resume?.offset ?? 0, run = resume?.run ?? "", apiTotal = 0, retried = false;
    const sum = { fetched: 0, created: 0, updated: 0, newly_matched: 0 };
    type LazSyncRes = { error?: string | null; api_total?: number; fetched?: number; created?: number; updated?: number; newly_matched?: number; next_offset?: number | null; done?: boolean; complete?: boolean; run_started_at?: string; stop_reason?: string | null; removed?: number; removed_skipped?: number };
    setImporting(true);
    try {
      for (let round = 0; round < 60; round++) {
        setNote(`กำลังดึงสินค้าจาก Lazada... ${offset.toLocaleString()}${apiTotal ? ` / ${apiTotal.toLocaleString()}` : ""} ตัว (Lazada ตอบช้า ~10 วิต่อ 50 ตัว)`);
        const r = await apiFetch("/api/lazada/sync-products", { method: "POST", body: JSON.stringify({ brand_id: brandId, offset, run_started_at: run || undefined }) });
        const j = (await r.json().catch(() => ({ error: `ระบบตอบผิดพลาด (HTTP ${r.status})` }))) as LazSyncRes;
        const stop = j.error || j.stop_reason;
        if (j.run_started_at) run = j.run_started_at;
        if (j.api_total) apiTotal = j.api_total;
        sum.fetched += j.fetched ?? 0; sum.created += j.created ?? 0; sum.updated += j.updated ?? 0; sum.newly_matched += j.newly_matched ?? 0;
        if (typeof j.next_offset === "number") offset = j.next_offset;
        if (j.done) {
          lazResume.current = null;
          const totalNote = apiTotal ? ` (Lazada รายงาน ${apiTotal.toLocaleString()})` : "";
          setNote(`ดึงจาก Lazada ครบแล้ว${totalNote} · รอบนี้ได้ ${sum.fetched.toLocaleString()} ตัว · เพิ่มใหม่ ${sum.created} · อัปเดต ${sum.updated} · จับคู่รหัสตรงอัตโนมัติ ${sum.newly_matched} — ที่เหลือดูการ์ด "รอยืนยัน"${goneNote(j)}${j.stop_reason ? ` · ⚠️ ${j.stop_reason}` : ""}`);
          break;
        }
        if (stop) {
          // ลองซ้ำครั้งเดียว (Lazada มักจำกัดความถี่ — รอแป๊บแล้วค่อยถามใหม่)
          if (!retried) { retried = true; await new Promise((res) => setTimeout(res, 4000)); continue; }
          lazResume.current = { brandId, offset, run, at: Date.now() };
          setNote(`⚠️ ดึงจาก Lazada ได้ถึงตัวที่ ${offset.toLocaleString()}${apiTotal ? ` จาก ${apiTotal.toLocaleString()}` : ""} แล้ว Lazada ตอบผิดพลาด: ${stop} — กด "ดึงสินค้าจาก Lazada" อีกครั้งเพื่อดึงต่อจากตัวที่ ${(offset + 1).toLocaleString()} (ยังไม่เช็กว่าตัวไหนร้านลบ จนกว่าจะดึงครบ)`);
          break;
        }
        retried = false;
      }
      await reloadCurrent();
    } catch (e) {
      lazResume.current = { brandId, offset, run, at: Date.now() };
      setNote(`ผิดพลาด: ${(e as Error).message} — กดดึงอีกครั้งเพื่อดึงต่อจากตัวที่ ${(offset + 1).toLocaleString()}`);
    }
    finally { setImporting(false); }
  };

  // ดึงสินค้าจาก LINE SHOPPING (ต่อ API จริง) → catalog + จับคู่ ERP
  const syncLine = async () => {
    if (!brandId) { setNote("เลือกแบรนด์/ร้านก่อน (คีย์ LINE ผูกกับแบรนด์)"); return; }
    setImporting(true); setNote("กำลังดึงสินค้าจาก LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/sync-products", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const totalNote = j.api_total > 0 && j.api_total !== j.fetched ? ` (LINE รายงานทั้งหมด ${j.api_total})` : "";
      setNote(`ดึงจาก LINE แล้ว: ${j.fetched} สินค้า${totalNote} · เพิ่มใหม่ ${j.created} · อัปเดต ${j.updated} · จับคู่ ERP อัตโนมัติ ${j.matched}${goneNote(j)}`);
      await reloadCurrent();
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); }
  };

  // นำเข้ารายการหมวดหมู่แพลตฟอร์มจากไฟล์ (ชีต "ตัวเลือกหมวดสินค้า" — คอลัมน์ id/en/th)
  const importCategoryFile = async (file: File) => {
    if (!platformId) { setNote("เลือกร้านก่อน"); return; }
    setImporting(true); setNote("กำลังอ่านไฟล์หมวดหมู่...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const cand = wb.SheetNames.find((n) => /หมวด|categ/i.test(n)) ? [wb.SheetNames.find((n) => /หมวด|categ/i.test(n))!] : wb.SheetNames;
      let aoa: unknown[][] = [];
      for (const sn of cand) {
        const a = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, defval: "" });
        const hdr = ((a[0] ?? []) as unknown[]).map((x) => String(x).trim().toLowerCase());
        if (hdr.includes("id") && (hdr.includes("en") || hdr.includes("th"))) { aoa = a; break; }
      }
      if (aoa.length < 2) { setNote("ไม่พบชีตหมวดหมู่ (ต้องมีคอลัมน์ id + en/th)"); return; }
      const hdr = (aoa[0] as unknown[]).map((x) => String(x).trim().toLowerCase());
      const ci = { id: hdr.indexOf("id"), en: hdr.indexOf("en"), th: hdr.indexOf("th") };
      const rows = (aoa.slice(1) as unknown[][])
        .map((r) => ({ id: r[ci.id], en: ci.en >= 0 ? r[ci.en] : "", th: ci.th >= 0 ? r[ci.th] : "" }))
        .filter((r) => String(r.id ?? "").trim());
      const res = await apiFetch("/api/platform-category-options", { method: "POST", body: JSON.stringify({ platform_id: platformId, rows }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setNote(`นำเข้าหมวดหมู่ ${activePf?.name_th ?? ""} แล้ว: ${j.imported} หมวด (ใช้เลือกใน "แก้รายละเอียดต่อแพลตฟอร์ม" ได้)`);
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); if (catFileRef.current) catFileRef.current.value = ""; }
  };

  // ส่งราคาขาย ERP → LINE (สินค้าที่จับคู่แล้ว)
  const pushPricesLine = async () => {
    if (!brandId) { setNote("เลือกแบรนด์/ร้านก่อน"); return; }
    setImporting(true); setNote("กำลังส่งราคาขึ้น LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/push-prices", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.note) { setNote(j.note); return; }
      const fails = (j.results ?? []).filter((x: { ok: boolean }) => !x.ok);
      let msg = `ส่งราคาขึ้น LINE: สำเร็จ ${j.okCount}/${j.total} สินค้า`;
      if (fails.length) msg += " · ผิดพลาด: " + fails.map((x: { product: string; error?: string }) => `${x.product} (${x.error})`).join(" | ");
      setNote(msg);
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); }
  };

  const saveMapping = async (platform_field_key: string, source_key: string) => {
    setMappings((m) => { const n = { ...m }; if (source_key) n[platform_field_key] = source_key; else delete n[platform_field_key]; return n; });
    try {
      const r = await apiFetch("/api/platform-field-mappings", { method: "PATCH", body: JSON.stringify({ platform_id: platformId, platform_field_key, source_key }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch (e) { setNote("บันทึก mapping ไม่สำเร็จ: " + (e as Error).message); }
  };
  const mappedCount = fields.filter((f) => mappings[f.field_key]).length;

  // ช่อง "จับคู่ในระบบ" ของแต่ละแถว — ปุ่มในช่องนี้ไม่เปิดป๊อป (กดแถวส่วนอื่น = เปิดรายละเอียด)
  // inCard = ส่วนท้ายการ์ด (การ์ดกางแถวไม่ได้ → ปุ่ม "จับคู่/เปลี่ยน" เปิดป๊อปรายละเอียดแทน)
  const matchCell = (l: Listing, inCard = false) => {
    const st = statusOf(l);
    const busy = busyIds.has(l.id);
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    if (st === "gone") return (
      <span className="inline-flex items-center gap-1.5 max-w-full" onClick={stop}>
        <span className="text-xs text-slate-500 bg-slate-100 border border-dashed border-slate-300 rounded px-1.5 py-0.5 truncate"
          title={`ดึงสินค้าครบทั้งร้านแล้วไม่เจอตัวนี้ (ร้านลบไปแล้ว)${l.matched_code ? ` · เคยจับคู่กับ ${l.matched_code}` : ""}`}>
          ไม่อยู่บนร้านแล้ว{l.matched_code ? ` · เคยคู่ ${l.matched_code}` : ""}
        </span>
        {canEdit && <button type="button" disabled={goneBusy} onClick={() => void clearGone([l.id])} className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline shrink-0 disabled:opacity-50">ล้างออก</button>}
      </span>
    );
    if (st === "ok") return (
      <span className="inline-flex items-center gap-1.5 max-w-full" onClick={stop}>
        <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 truncate" title={l.matched_name ?? ""}>✓ {l.matched_code || "จับคู่แล้ว"}</span>
        {canEdit && <button type="button" onClick={() => (inCard ? openRow(l) : toggleExpand(l.id))} className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline shrink-0">เปลี่ยน</button>}
      </span>
    );
    if (st === "ignored") return (
      <span className="inline-flex items-center gap-1.5 max-w-full" onClick={stop}>
        <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 truncate" title={l.match_ignore_reason ?? ""}>🚫 ไม่ต้องจับคู่{l.match_ignore_reason ? ` · ${l.match_ignore_reason}` : ""}</span>
        {canEdit && <button type="button" disabled={ignoreBusy} onClick={() => void saveIgnore([l.id], false, null)} className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline shrink-0 disabled:opacity-50">เลิกข้าม</button>}
      </span>
    );
    const top = suggestions[l.id]?.[0];
    if (st === "guess" && top) return (
      <span className="inline-flex items-center gap-1.5 max-w-full" onClick={stop}>
        <button type="button" onClick={() => (inCard ? openRow(l) : toggleExpand(l.id))} title={`${top.name ?? ""} · ${top.score}% ${top.reason}`}
          className="text-xs font-mono text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 truncate hover:bg-sky-100">{top.code} ?</button>
        {canEdit && <button type="button" disabled={busy} onClick={() => confirmTop(l)} className="h-7 px-2.5 text-xs text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 shrink-0">{busy ? "…" : "ยืนยัน"}</button>}
      </span>
    );
    return (
      <span onClick={stop}>
        <button type="button" onClick={() => (inCard ? openRow(l) : toggleExpand(l.id))} className="h-7 px-2.5 text-xs text-amber-700 border border-amber-200 bg-amber-50/60 rounded-md hover:bg-amber-50">
          {suggestLoading ? "กำลังเดา…" : "🔍 จับคู่"}
        </button>
      </span>
    );
  };
  const cols: MiniColumn<Listing>[] = [
    {
      key: "title", header: "สินค้าบนร้าน", sortLabel: "ชื่อ", width: "2.4fr", locked: true, sortValue: (l) => l.title ?? "",
      cell: (l) => (
        <div className="flex min-w-0 items-center gap-2">
        {showThumbs && <HoverImage url={summ[l.id]?.image ?? null} size={36} previewSize={280} rounded="rounded-md" fallback="—" />}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate" title={l.title ?? ""}>{l.title || "—"}</span>
            {dupCounts.has(l.id) && (
              <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1 text-[10px] font-medium text-amber-700"
                title={`บนร้านมีสินค้าชื่อและรหัสเหมือนกัน ${dupCounts.get(l.id)} ชิ้น — กดแถวเพื่อดู แล้วเลือกเก็บไว้ตัวเดียว`}>ซ้ำ ×{dupCounts.get(l.id)}</span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate">{l.sku_code || "ไม่มี SKU"} · #{l.external_product_id || "—"}</div>
        </div>
        </div>
      ),
    },
    ...(hasShopData ? [{
      key: "shop", header: "สถานะร้าน", sortLabel: "สถานะบนร้าน (ปัญหาก่อน)", width: "0.8fr", align: "center" as const,
      sortValue: (l: Listing) => STATE_RANK[summ[l.id]?.state ?? "nodata"],
      cell: (l: Listing) => { const s = summ[l.id]; return s && s.state !== "nodata" ? <ShopStateBadge state={s.state} /> : <span className="text-slate-300">—</span>; },
    }, {
      key: "stock", header: "สต๊อก", width: "0.55fr", align: "right" as const, sortValue: (l: Listing) => summ[l.id]?.stock ?? -1,
      cell: (l: Listing) => { const s = summ[l.id]; return s?.stock == null || s.state === "gone" ? <span className="text-slate-300">—</span> : <span className={`tabular-nums ${s.state === "out" ? "text-rose-600 font-medium" : s.state === "low" ? "text-amber-600 font-medium" : ""}`}>{s.stock.toLocaleString()}</span>; },
    }] : []),
    {
      key: "price", header: "ราคา", sortLabel: "ราคาที่ขายจริง", width: "0.75fr", align: "right", sortValue: (l) => effectivePrice(summ[l.id]) ?? l.price ?? -1,
      cell: (l) => {
        const s = summ[l.id]; const full = s?.price ?? l.price; const sale = s?.salePrice ?? null;
        const flag = priceFlagText(s);
        const warn = flag ? <span className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-amber-700" title={flag}><Icon name="warning" />ราคาผิดปกติ</span> : null;
        if (sale != null) return <span className="leading-tight"><span className="block text-rose-600">{sale.toLocaleString()}฿</span>{full != null && <span className="block text-[11px] text-slate-400 line-through">{full.toLocaleString()}฿</span>}{warn}</span>;
        return full != null ? <span className="leading-tight"><span className="block">{full.toLocaleString()}฿</span>{warn}</span> : <span className="text-slate-300">—</span>;
      },
    },
    ...(platformCode === "line_shopping" && hasShopData ? [{
      key: "disp", header: "เปิดขาย", width: "4.5rem", align: "center" as const, sortValue: (l: Listing) => (summ[l.id]?.display ? 1 : 0),
      cell: (l: Listing) => {
        const s = summ[l.id];
        if (!s || s.display == null || s.state === "gone") return <span className="text-slate-300">—</span>;
        return <ToggleSwitch size="sm" on={s.display} disabled={!canPublish || disp.busy} title={canPublish ? "เปิด/ปิดขายบน LINE (ถามก่อน)" : "ไม่มีสิทธิ์ส่งขึ้นร้าน"}
          onChange={(v) => disp.request([l.id], v ? "onsale" : "hide", [l.title || l.sku_code || ""])} />;
      },
    }] : []),
    { key: "match", header: "จับคู่ในระบบ", width: "1.6fr", align: "right", sortValue: (l) => ({ guess: 0, none: 1, ok: 2, ignored: 3, gone: 4 })[statusOf(l)], cell: (l) => matchCell(l) },
  ];
  const fcols: MiniColumn<FieldRow>[] = [
    { key: "key", header: "Field", width: "1.3fr", sortValue: (f) => f.field_key, cell: (f) => <span className="font-mono text-xs">{f.field_key}</span> },
    { key: "label", header: "ป้าย", width: "1.3fr", cell: (f) => f.field_label || "—" },
    { key: "type", header: "ชนิด", width: "0.8fr", cell: (f) => <span className="text-xs text-slate-500">{f.data_type || "text"}</span> },
    { key: "req", header: "บังคับ", width: "4rem", align: "center", cell: (f) => f.is_required ? <span className="text-rose-600">✓</span> : <span className="text-slate-300">—</span> },
    { key: "sample", header: "ตัวอย่าง", width: "1.5fr", cell: (f) => <span className="text-xs text-slate-400 truncate">{f.sample || "—"}</span> },
  ];

  // % จับคู่ คิดจากตัวที่ "ต้องจับคู่" (ไม่นับตัวที่กดไม่ต้องจับคู่ · counts.all ไม่รวมตัวที่ไม่อยู่บนร้านแล้วอยู่แล้ว) → ไปถึง 100% ได้จริง
  const needMatch = counts.all - counts.ignored;
  const pct = needMatch ? Math.round((counts.ok / needMatch) * 100) : (counts.all ? 100 : 0);
  const unmatchedRows = listings.filter((l) => { const s = statusOf(l); return s === "guess" || s === "none"; });
  // ยังไม่จับคู่ = รอยืนยัน + ต้องหาคู่เอง (รู้ได้ทันที ไม่ต้องรอตัวเดา) · หลายประกาศบนร้านชี้สินค้าในระบบตัวเดียวกันได้ → นับรุ่นแยก
  const unmatchedCount = needMatch - counts.ok;
  const matchedParents = new Set(listings.filter((l) => !isGoneStatus(l.status)).map((l) => l.matched_parent_sku_id).filter(Boolean)).size;
  const where = `${activePf?.name_th ?? "ร้านนี้"}${activeBrand ? ` · ${activeBrand.name}` : ""}`;
  // มุมมองหน้าร้านต้องเลือกแบรนด์ก่อน (เจ้าของขอ 2026-11-08) — ยังไม่เลือก = หน้าเลือกแบรนด์
  const gate = viewReady && view === "shop" && !brandId;
  // เมนูตั้งค่าร้าน — จุดเตือนบนปุ่ม (Lazada ใกล้หมดอายุ/หมดแล้ว/ยังไม่เชื่อม) · วันที่ดึงข้อมูลล่าสุด · ราคาไม่ตรงระบบ (มีเมื่อโหลดสรุปแล้ว)
  const toolsAlert = platformCode === "lazada" && !!brandId && !!lazStatus && (!lazStatus.connected || lazStatus.health === "expiring" || lazStatus.health === "expired");
  const lastImported = listings.reduce<string | null>((m, l) => (l.last_imported_at && (!m || l.last_imported_at > m) ? l.last_imported_at : m), null);
  const priceMismatchN = summList.filter((s) => (s.erpPriceDiff ?? 0) > 0).length;
  const toolItem = (o: { icon: string; tone: keyof typeof TOOL_TONE; title: string; sub?: string; disabled?: boolean; warn?: boolean; onClick?: () => void; href?: string }) => {
    const inner = (
      <>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${TOOL_TONE[o.tone]}`}><Icon name={o.icon} mode="line" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-slate-800">{o.title}</span>
          {o.sub && <span className={`block text-[11px] ${o.warn ? "text-amber-700" : "text-slate-400"}`}>{o.sub}</span>}
        </span>
      </>
    );
    const cls = "flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent";
    return o.href
      ? <a key={o.title} href={o.href} className={cls} onClick={() => setToolsOpen(false)}>{inner}</a>
      : <button key={o.title} type="button" disabled={o.disabled} className={cls} onClick={() => { setToolsOpen(false); o.onClick?.(); }}>{inner}</button>;
  };
  // ป๊อปรายละเอียด: ชิ้นที่ชื่อ+รหัสเหมือนตัวที่เปิดอยู่ (รวมตัวเอง) → เก็บไว้ตัวเดียว ที่เหลือตั้งไม่ต้องจับคู่
  const openDupKey = openListing && !openListing.match_ignored ? duplicateKey(openListing.title, openListing.sku_code) : null;
  const openSiblings = openDupKey ? activeListings.filter((l) => duplicateKey(l.title, l.sku_code) === openDupKey) : [];
  const dupOthers = openListing ? openSiblings.filter((l) => l.id !== openListing.id && !l.matched_parent_sku_id) : [];
  const dupMatchedOther = openListing ? openSiblings.find((l) => l.id !== openListing.id && l.matched_parent_sku_id) ?? null : null;
  // ตัวอื่นจับคู่อยู่ แต่ตัวที่เปิดยังไม่จับคู่ → ให้ไปเก็บตัวที่จับคู่แทน (ไม่ทิ้งคู่ที่ทำไว้แล้ว)
  const dupCanKeep = dupOthers.length > 0 && (!dupMatchedOther || !!openListing?.matched_parent_sku_id);
  // แนะนำเก็บ = ชิ้นที่ยังขายได้ (เปิดขาย + มีของ) และสต๊อกมากสุด · เท่ากัน = ตัวที่จับคู่อยู่
  const keepScore = (l: Listing) => { const s = summ[l.id]; const live = s && (s.state === "selling" || s.state === "low") ? 1 : 0; return live * 1e9 + (s?.stock ?? 0) * 10 + (l.matched_parent_sku_id ? 1 : 0); };
  const dupBest = openSiblings.length > 1 && openSiblings.some((l) => summ[l.id]) ? openSiblings.reduce((a, b) => (keepScore(b) > keepScore(a) ? b : a)) : null;
  const pickBrand = (b: ShopBrandSummary) => {
    setPickedBrand(b);
    setBrandId(b.id);
    // ร้านที่เลือกอยู่ไม่มีของของแบรนด์นี้ → ไปร้านที่มีของมากสุด
    const curCode = platforms.find((p) => p.id === platformId)?.code ?? "";
    if (!(b.listings[curCode] > 0)) {
      const best = platforms.filter((p) => (b.listings[p.code] ?? 0) > 0).sort((x, y) => (b.listings[y.code] ?? 0) - (b.listings[x.code] ?? 0))[0];
      if (best) setPlatformId(best.id);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-semibold text-slate-900">🛒 สินค้าบนแพลตฟอร์ม</h1>
        <button onClick={() => setShowHelp((v) => !v)} className="shrink-0 h-8 px-3 text-sm text-sky-700 border border-sky-200 bg-sky-50 rounded-lg hover:bg-sky-100">{showHelp ? "ซ่อนวิธีใช้" : "ℹ️ วิธีใช้"}</button>
      </div>
      <p className="text-sm text-slate-500 mb-3">ดูว่าแต่ละร้านมีสินค้าอะไร แล้วจับคู่กับสินค้าในระบบเรา — จับคู่แล้วถึงจะเทียบสต๊อก/ส่งราคาได้ถูกตัว</p>

      {showHelp && (
        <div className="mb-4 border border-sky-200 bg-sky-50/60 rounded-xl p-4 text-sm text-slate-700 space-y-2">
          <p className="font-medium text-slate-800">หน้านี้ใช้ทำอะไร?</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li><b>เลือกร้าน</b> (ปุ่มด้านบน) + แบรนด์ — ระบบจำร้านที่ดูล่าสุดไว้ให้</li>
            <li>ยังไม่มีสินค้า? กด <b>⬆️ นำเข้าสินค้าจากร้าน</b> แล้วเลือกไฟล์ export จาก Seller Center (เลือกหลายไฟล์พร้อมกันได้ ระบบดูให้เองว่าแต่ละไฟล์คืออะไร)</li>
            <li>ดู <b>การ์ดตัวเลข</b> — กดการ์ดเพื่อกรองตาราง: <span className="text-emerald-700">จับคู่แล้ว</span> · <span className="text-sky-700">รอยืนยัน (ระบบเดาให้แล้ว)</span> · <span className="text-amber-700">ต้องหาคู่เอง</span> — สองใบหลังรวมกัน = ยังไม่จับคู่</li>
            <li>จับคู่: กด <b>ยืนยัน</b> ในแถวถ้าระบบเดาถูก · กด <b>🔍 จับคู่</b> เพื่อดูตัวเลือก/ค้นหาเอง · หรือกด <b>⚡ จับคู่ทีละตัว</b> ไล่ทีละตัวด้วยคีย์ลัด (1-3 เลือก · S ข้าม)</li>
            <li>รหัสตรงกันเยอะ ๆ กด <b>✓ ยืนยันทั้งหมดที่รหัสตรงกัน</b> ได้ทีเดียว (ระบบถามก่อน · แก้ทีหลังได้ · มีประวัติว่าใครจับคู่อะไร)</li>
            <li>ของที่ไม่มีในระบบเราจริง ๆ (งานบริการ/เลิกขาย/ซ้ำบนร้าน) กด <b>🚫 ไม่ต้องจับคู่ตัวนี้</b> หรือติ๊กหลายตัวแล้วกดจากแถบด้านล่าง — ไม่นับใน &quot;ยังไม่จับคู่&quot; · กด &quot;เลิกข้าม&quot; ได้ทุกเมื่อ</li>
          </ol>
          <p className="pt-1"><b>แท็บอื่น:</b> “ช่องข้อมูลของร้าน” = คอลัมน์ที่อ่านได้จากไฟล์ · “ตั้งค่าส่งข้อมูล” = บอกว่าจะเอาข้อมูลในระบบเราตัวไหนไปใส่ช่องไหนของร้าน</p>
          <p><b>ปุ่ม ตั้งค่า</b> = ดึงสินค้าจากร้าน (LINE/Lazada) · ส่งราคาทั้งหมด · นำเข้าหมวด · จัดการ “ชนิดไฟล์นำเข้า” (เพิ่ม/แก้เองได้ถ้าร้านเปลี่ยนคอลัมน์) · ระบบแค่ <b>เดา</b> ให้ — ไม่จับคู่เองโดยไม่มีคนกดยืนยัน</p>
        </div>
      )}

      {bootError && <ErrorState className="mb-3" title="โหลดรายชื่อร้านไม่สำเร็จ" hint={bootError} onRetry={() => window.location.reload()} />}

      {/* มุมมองหน้าร้านยังไม่เลือกแบรนด์ → โชว์แค่หน้าเลือกแบรนด์ (ซ่อนปุ่มร้าน/นำเข้า/ดึงสินค้า ที่ต้องรู้แบรนด์) */}
      {!gate && (<>
      {/* เลือกร้าน + แบรนด์ + ปุ่มนำเข้า */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {platforms.map((p) => {
          const on = p.id === platformId;
          const n = platformCounts[p.id];
          return (
            <button key={p.id} type="button" onClick={() => setPlatformId(p.id)} aria-pressed={on}
              className={`h-9 px-3 rounded-full border text-sm inline-flex items-center gap-1.5 ${on ? "bg-violet-50 border-violet-300 text-violet-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />
              {p.name_th}
              {n != null && <span className={`text-xs tabular-nums ${on ? "text-violet-600" : "text-slate-400"}`}>{n.toLocaleString()}</span>}
            </button>
          );
        })}
        {view === "shop" && activeBrand ? (
          // มุมมองหน้าร้าน = ดูทีละแบรนด์เสมอ (ไม่มี "ทุกแบรนด์") · เปลี่ยน = กลับไปหน้าเลือกแบรนด์
          <span className="h-9 pl-1.5 pr-1 rounded-lg border border-slate-200 bg-white inline-flex items-center gap-2 text-sm">
            <BrandAvatar name={activeBrand.name} logoKey={pickedBrand?.id === activeBrand.id ? pickedBrand.logo_key : null} color={pickedBrand?.id === activeBrand.id ? pickedBrand.color : null} size={24} />
            <span className="font-medium text-slate-800">{activeBrand.name}</span>
            <button type="button" onClick={() => setBrandId("")} className="h-7 px-2 text-xs text-violet-700 rounded-md hover:bg-violet-50 inline-flex items-center gap-1"><Icon name="shuffle" />เปลี่ยนแบรนด์</button>
          </span>
        ) : (
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm bg-white">
            <option value="">ทุกแบรนด์/ร้าน</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div className="flex-1" />
        <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) importFiles(fs); }} />
        {/* ปุ่มนำเข้า + ⚙️ ติดกันเสมอ (ร้านเยอะแล้วแถวเต็ม ⚙️ เคยตกไปอยู่บรรทัดใหม่คนเดียว) */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button type="button" onClick={() => setAddPick(true)} disabled={!canEdit || !platformId || !brandId}
            title={!brandId ? "เลือกแบรนด์ก่อน" : `เลือกสินค้าในระบบที่ยังไม่ได้ลง ${activePf?.name_th ?? "ร้านนี้"} แล้วลงขึ้นร้าน`}
            className="h-9 px-3 text-sm text-violet-700 border border-violet-200 bg-white rounded-lg hover:bg-violet-50 disabled:opacity-50 whitespace-nowrap inline-flex items-center gap-1.5"><Icon name="add" />เพิ่มสินค้าขึ้นร้าน</button>
          <button onClick={() => fileRef.current?.click()} disabled={!canEdit || importing || !platformId} title={!canEdit ? "ไม่มีสิทธิ์นำเข้า" : "อัปไฟล์ export (Excel/CSV) จาก Seller Center — เลือกได้หลายไฟล์"} className="h-9 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 whitespace-nowrap inline-flex items-center gap-1.5"><Icon name="import" mode="line" />{importing ? "กำลังนำเข้า..." : "นำเข้าสินค้าจากไฟล์"}</button>
          <input ref={catFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCategoryFile(f); }} />
          <button ref={toolsRef} type="button" onClick={() => setToolsOpen((o) => !o)} disabled={!platformId} aria-expanded={toolsOpen}
            title="ตั้งค่าร้าน: ดึงสินค้าจากร้าน · ส่งราคา · นำเข้าหมวด · ชนิดไฟล์นำเข้า · บัญชีร้าน"
            className="relative h-9 px-3 text-sm text-slate-700 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap inline-flex items-center gap-1.5">
            <Icon name="settings" mode="line" />ตั้งค่า
            {toolsAlert && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" title="มีเรื่องต้องดูในตั้งค่า" />}
          </button>
        </div>
      </div>
      {/* เมนูตั้งค่าร้าน (เจ้าของ 2026-11-10: ย้ายแถว "ต่อ API" มาไว้ในตั้งค่า · ไอคอนเส้นมีสี) */}
      <FloatingDropdown anchorRef={toolsRef} open={toolsOpen} onClose={() => setToolsOpen(false)} minWidth={340} maxWidth={390}>
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-1.5 pb-2 pt-1">
            {activePf && <PlatformIcon code={activePf.code} iconKey={activePf.icon_key} size={18} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{activePf?.name_th ?? "ร้าน"}{activeBrand ? ` · ${activeBrand.name}` : ""}</div>
              <div className="truncate text-[11px] text-slate-400">
                {platformCode === "line_shopping" ? "เชื่อมด้วย API Key ของแบรนด์" : platformCode === "lazada" ? "เชื่อมด้วย Lazada (อ่านอย่างเดียว)" : "ยังไม่ต่อ API — ใช้นำเข้าไฟล์ export"}
                {lastImported ? ` · ข้อมูลจากร้านล่าสุด ${new Date(lastImported).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}` : ""}
              </div>
            </div>
            {platformCode === "lazada" && brandId && lazStatus && (
              lazStatus.connected
                ? <span className={`shrink-0 text-[11px] ${lazStatus.health === "expiring" ? "text-amber-700" : "text-emerald-600"}`}>{lazStatus.health === "expiring" ? `อีก ${lazStatus.days_left ?? 0} วันต้องเชื่อมใหม่` : "● เชื่อมอยู่"}</span>
                : <span className="shrink-0 text-[11px] text-amber-700">{lazStatus.health === "expired" ? "หมดอายุ" : "ยังไม่เชื่อม"}</span>
            )}
          </div>
          {(platformCode === "line_shopping" || platformCode === "lazada") && <div className="px-1.5 pb-1 pt-2 text-[11px] text-slate-400">ข้อมูลจากร้าน</div>}
          {platformCode === "line_shopping" && toolItem({ icon: "refresh", tone: "emerald", title: importing ? "กำลังดึง…" : "ดึงสินค้าจาก LINE", sub: brandId ? "อัปเดตชื่อ ราคา สต๊อก รูป จากร้าน" : "เลือกแบรนด์ก่อน", disabled: !canEdit || importing || !brandId, onClick: () => void syncLine() })}
          {platformCode === "line_shopping" && toolItem({ icon: "folder", tone: "amber", title: "นำเข้าหมวดหมู่ LINE", sub: "จากไฟล์ template (ชีตตัวเลือกหมวด) · ใช้ครั้งเดียว", disabled: !canEdit || importing, onClick: () => catFileRef.current?.click() })}
          {platformCode === "lazada" && toolItem({
            icon: "refresh", tone: "indigo", title: importing ? "กำลังดึง…" : "ดึงสินค้าจาก Lazada",
            sub: !brandId ? "เลือกแบรนด์ก่อน — การเชื่อม Lazada ผูกกับแบรนด์" : lazStatus?.connected ? "อ่านรายการที่ลงไว้บนร้าน (ไม่แก้อะไรบนร้าน)" : "ต้องเชื่อม Lazada ก่อน (ดูบัญชีร้านด้านล่าง)",
            disabled: !canEdit || importing || !brandId || !lazStatus?.connected, onClick: () => void syncLazada(),
          })}
          {platformCode === "line_shopping" && <div className="px-1.5 pb-1 pt-2 text-[11px] text-slate-400">ส่งขึ้นร้าน (ร้านจริง)</div>}
          {platformCode === "line_shopping" && toolItem({
            icon: "upload", tone: "rose", title: "ส่งราคาทั้งหมดขึ้น LINE",
            sub: priceMismatchN > 0 ? `ราคาขายไม่ตรงระบบ ${priceMismatchN.toLocaleString()} รุ่น — ถามยืนยันก่อนส่ง` : "ทุกสินค้าที่จับคู่แล้ว ตามราคาในระบบ · ถามยืนยันก่อนส่ง",
            warn: priceMismatchN > 0, disabled: !canEdit || importing || !brandId, onClick: () => setPushAllAsk(true),
          })}
          <div className="px-1.5 pb-1 pt-2 text-[11px] text-slate-400">ตั้งค่า</div>
          {toolItem({ icon: "settings", tone: "violet", title: "จัดการชนิดไฟล์นำเข้า", sub: "เพิ่ม/แก้คอลัมน์ของไฟล์ export แต่ละร้าน", disabled: !canEdit || !platformId, onClick: () => setShowManager(true) })}
          {toolItem({ icon: "link", tone: "slate", title: platformCode === "lazada" ? "บัญชีร้าน / เชื่อม Lazada" : "บัญชีร้าน / API Key", sub: "ไปหน้าจัดการร้าน/บัญชีแพลตฟอร์ม", href: "/admin/platform-accounts", warn: !!toolsAlert })}
        </div>
      </FloatingDropdown>
      <ConfirmDialog open={pushAllAsk} onClose={() => { if (!importing) setPushAllAsk(false); }} variant="danger" requireTyped="ยืนยัน"
        onConfirm={() => { setPushAllAsk(false); void pushPricesLine(); }}
        title={`ส่งราคาทั้งหมดขึ้น LINE${activeBrand ? ` — ${activeBrand.name}` : ""}?`} confirmText="ส่งราคาทั้งหมด"
        message={(
          <div className="space-y-2 text-sm">
            <p>ระบบจะตั้งราคาบนร้าน LINE ของ <b>ทุกสินค้าที่จับคู่แล้ว</b> ตามราคาในระบบ (ราคาเต็ม + ราคาขาย) — ส่งขึ้นร้านจริงทันที · มีประวัติว่าใครกด</p>
            {priceMismatchN > 0 && <p className="text-amber-700">ตอนนี้ราคาที่ลูกค้าจ่ายไม่ตรงระบบ {priceMismatchN.toLocaleString()} รุ่น → ราคาเหล่านี้จะเปลี่ยน · ในระบบไม่มีราคาเต็ม = ตัวขีดฆ่าบนร้านหาย</p>}
            <p className="text-xs text-slate-500">แนะนำตรวจด้วยชิป “ราคาผิดปกติ” ก่อน · แก้ทีละสินค้าได้ในลิ้นชัก (แท็บตัวเลือก &amp; ราคา)</p>
          </div>
        )} />
      {note && <p className="text-xs text-slate-500 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{note}</p>}

      {queue.length > 0 && (
        <div className="mb-3 border border-violet-200 bg-violet-50/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">ไฟล์รอนำเข้า ({queue.length}) — ตรวจชนิดไฟล์ก่อนกดนำเข้า</span>
            <div className="flex gap-2">
              <button onClick={() => { setQueue([]); setNote(null); }} disabled={importing} className="h-8 px-3 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50">ล้างทั้งหมด</button>
              <button onClick={confirmImportAll} disabled={importing} className="h-8 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{importing ? "กำลังนำเข้า..." : `นำเข้าทั้งหมด (${queue.length})`}</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {queue.map((it) => {
              const isOrders = getProfile(it.profileId, customProfiles)?.kind === "orders";
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm text-slate-700 truncate max-w-[16rem]" title={it.fileName}>📄 {it.fileName}</span>
                  <span className="text-slate-300">→</span>
                  <select value={it.profileId} onChange={(e) => setQueueProfile(it.id, e.target.value)} disabled={importing} className="h-8 border border-violet-200 rounded-md px-2 text-sm bg-white max-w-full">
                    {profileOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  {isOrders && <span className="text-[11px] text-amber-600">ไฟล์ออเดอร์ — จะถูกข้าม</span>}
                  <div className="flex-1" />
                  <button onClick={() => removeFromQueue(it.id)} disabled={importing} className="text-slate-400 hover:text-rose-600 text-sm disabled:opacity-50" title="เอาออกจากคิว">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>)}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* สลับมุมมอง: หน้าร้าน (แบบ Seller Center) / จับคู่ + ตั้งค่า (เดิม) */}
        <div role="group" aria-label="มุมมอง" className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-sm">
          <button type="button" onClick={() => setView("shop")} aria-pressed={view === "shop"} className={`px-3 py-1 rounded inline-flex items-center gap-1.5 ${view === "shop" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}><Icon name="store" />หน้าร้าน</button>
          <button type="button" onClick={() => setView("match")} aria-pressed={view === "match"} className={`px-3 py-1 rounded inline-flex items-center gap-1.5 ${view === "match" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}><Icon name="link" />จับคู่ + ตั้งค่า</button>
        </div>
        {view === "match" && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit text-sm">
            <button onClick={() => setTab("catalog")} className={`px-3 py-1 rounded ${tab === "catalog" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>รายการสินค้า ({listings.length.toLocaleString()})</button>
            <button onClick={() => setTab("fields")} className={`px-3 py-1 rounded ${tab === "fields" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>ช่องข้อมูลของ {activePf?.name_th ?? "ร้าน"} ({fields.length})</button>
            <button onClick={() => setTab("mapping")} className={`px-3 py-1 rounded ${tab === "mapping" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>ตั้งค่าส่งข้อมูล ({mappedCount}/{fields.length})</button>
          </div>
        )}
      </div>

      {!viewReady ? null
        : gate ? <BrandGate onPick={pickBrand} />
        : view === "shop" ? (
          <PlatformShopView platformId={platformId} platformCode={platformCode} brandId={brandId} brandName={activeBrand?.name ?? null}
            where={where} reloadKey={shopReload} onCounts={setPlatformCounts}
            onGoMatch={() => { setView("match"); setTab("catalog"); setFilter("all"); }} />
        )
        : loading ? <LoadingState label={`กำลังโหลดสินค้าของ ${where}...`} />
        : loadError ? <ErrorState hint={loadError} onRetry={load} />
        : tab === "catalog" ? (
          listings.length === 0 ? (
            <EmptyState icon="🛒" title={`ยังไม่มีสินค้าจาก ${where}`}
              hint={platformCode === "line_shopping" ? "กดปุ่ม “ตั้งค่า” ด้านบน → ดึงสินค้าจาก LINE แล้วระบบจะช่วยจับคู่ให้"
                : platformCode === "lazada" ? "กด ดึงสินค้าจาก Lazada ด้านบน (ต้องเชื่อมร้านก่อน) หรือนำเข้าไฟล์ export แล้วระบบจะช่วยจับคู่ให้"
                : "นำเข้าไฟล์ export จาก Seller Center เข้ามาก่อน แล้วระบบจะช่วยจับคู่ให้"}
              action={canEdit && platformCode === "lazada" && lazStatus?.connected ? { label: "ดึงสินค้าจาก Lazada", onClick: () => void syncLazada() }
                : canEdit && platformCode !== "line_shopping" ? { label: `⬆️ นำเข้าสินค้าจาก ${activePf?.name_th ?? "ร้าน"}`, onClick: () => fileRef.current?.click() } : undefined} />
          ) : (
            <div className="space-y-3">
              <StatFilterCards value={filter} onChange={(k) => setFilter(k as Filter)} cards={[
                { key: "all", label: "ทั้งหมด", value: counts.all, hint: unmatchedCount > 0 ? `ยังไม่จับคู่ ${unmatchedCount.toLocaleString()}` : "จับคู่ครบแล้ว" },
                { key: "ok", label: "จับคู่แล้ว", value: counts.ok, tone: "success", hint: `${pct}% · ${matchedParents.toLocaleString()} รุ่นในระบบ` },
                { key: "guess", label: "รอยืนยัน", value: suggestLoading ? null : counts.guess, tone: "info", hint: suggestError ? "เดาคู่ไม่สำเร็จ — กดโหลดใหม่" : highRows.length ? `ระบบเดาให้ · รหัสตรงกัน ${highRows.length.toLocaleString()}` : "ระบบเดาให้แล้ว" },
                { key: "none", label: "ต้องหาคู่เอง", value: suggestLoading ? null : counts.none, tone: "warning", hint: "ระบบเดาไม่ได้/ไม่มั่นใจ" },
                { key: "ignored", label: "ไม่ต้องจับคู่", value: counts.ignored, tone: "neutral", hint: "งานบริการ/เลิกขาย ฯลฯ" },
                ...(dupCounts.size > 0 || filter === "dup" ? [{ key: "dup", label: "ซ้ำบนร้าน", value: dupCounts.size, tone: "danger" as const, hint: "ชื่อ+รหัสเหมือนกัน · เก็บไว้ตัวเดียว" }] : []),
                ...(counts.gone > 0 || filter === "gone" ? [{ key: "gone", label: "ไม่อยู่บนร้านแล้ว", value: counts.gone, tone: "neutral" as const, hint: "ร้านลบไปแล้ว · ล้างออกได้" }] : []),
              ]} />
              {filter === "gone" && counts.gone > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <Icon name="info" />
                  <span className="flex-1 min-w-[14rem]">ตอนกดดึงสินค้าจากร้านแล้วได้ครบทั้งร้าน รายการเหล่านี้ไม่อยู่ในร้านแล้ว (ร้านลบไป) — ไม่นับเป็นงานจับคู่ · ถ้าร้านเปิดขายกลับ ดึงรอบหน้าป้ายจะหายเอง</span>
                  {canEdit && (
                    <button type="button" disabled={goneBusy} onClick={() => void clearGone(goneIds)}
                      className="h-8 px-3 inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-rose-700 border border-rose-200 bg-white rounded-lg hover:bg-rose-50 disabled:opacity-50">
                      <Icon name="delete" />{goneBusy ? "กำลังล้าง…" : `ล้างรายการที่ไม่อยู่บนร้าน (${counts.gone.toLocaleString()})`}
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
                <span className="text-xs text-slate-500 shrink-0">จับคู่แล้ว {pct}%{counts.ignored ? ` (ไม่นับที่ไม่ต้องจับคู่ ${counts.ignored.toLocaleString()})` : ""}</span>
              </div>
              {(hasShopData || summLoading) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-xs text-slate-500">สถานะบนร้าน</span>
                  {summLoading && !hasShopData ? <span className="text-xs text-slate-400">กำลังโหลดสต๊อก/สถานะจากร้าน…</span> : (
                    <>
                      <button type="button" onClick={() => setShopFilter("")} aria-pressed={!shopFilter}
                        className={`h-7 rounded-full border px-2.5 text-xs whitespace-nowrap ${!shopFilter ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>ทั้งหมด</button>
                      {SHOP_FILTERS.filter((f) => shopCounts[f.key] > 0 || shopFilter === f.key).map((f) => (
                        <button key={f.key} type="button" onClick={() => setShopFilter(shopFilter === f.key ? "" : f.key)} aria-pressed={shopFilter === f.key} title={f.tip}
                          className={`h-7 rounded-full border px-2.5 text-xs whitespace-nowrap ${shopFilter === f.key ? "border-violet-300 bg-violet-50 text-violet-800" : (f.key === "out" || f.key === "price") && shopCounts[f.key] > 0 ? "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-50" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                          {f.label} <span className="tabular-nums opacity-70">{shopCounts[f.key].toLocaleString()}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
              <MiniTable
                rows={shownRows} columns={cols} rowKey={(l) => l.id} onRowClick={openRow}
                layout={layout} cardPick cardGrid="repeat(auto-fill,minmax(170px,1fr))"
                renderCard={(l) => {
                  const s = summ[l.id];
                  return (
                    <ListingCard footer={matchCell(l, true)} badges={(
                      <>
                        {priceFlagText(s) && <span className="inline-flex w-fit items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800" title={priceFlagText(s)}><Icon name="warning" />{priceFlagText(s)}</span>}
                        {platformCode === "line_shopping" && s && s.display != null && s.state !== "gone" && (
                          <div className="flex items-center justify-between text-[11px] text-slate-500" onClick={(e) => e.stopPropagation()}>
                            <span>{s.display ? "เปิดขายบน LINE" : "ปิดขายอยู่"}</span>
                            <ToggleSwitch size="sm" on={s.display} disabled={!canPublish || disp.busy} title={canPublish ? "เปิด/ปิดขายบน LINE (ถามก่อน)" : "ไม่มีสิทธิ์ส่งขึ้นร้าน"}
                              onChange={(v) => disp.request([l.id], v ? "onsale" : "hide", [l.title || l.sku_code || ""])} />
                          </div>
                        )}
                      </>
                    )} data={{
                      image: s?.image ?? null, title: l.title, sku: l.sku_code, externalId: l.external_product_id,
                      state: s?.state ?? null, stock: s?.stock ?? null, price: s?.price ?? l.price, salePrice: s?.salePrice ?? null,
                      variants: s?.variants ?? null, dupCount: dupCounts.get(l.id),
                    }} />
                  );
                }}
                extraSorts={extraSorts} sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange}
                selectable={canEdit} selected={selected} onSelectedChange={setSelected}
                expandedKeys={expanded}
                renderExpanded={(l) => (
                  <MatchCandidates suggestions={suggestions[l.id]} loading={suggestLoading} currentId={l.matched_parent_sku_id}
                    canEdit={canEdit} busy={busyIds.has(l.id)} onPick={(p) => void saveMatch(l.id, p)}
                    onUnmatch={l.matched_parent_sku_id ? () => void saveMatch(l.id, null) : undefined}
                    onIgnore={!l.matched_parent_sku_id && !l.match_ignored ? () => setIgnoreTarget([l.id]) : undefined} />
                )}
                searchText={(l) => `${l.title ?? ""} ${l.sku_code ?? ""} ${l.external_product_id ?? ""} ${l.matched_code ?? ""}`}
                searchPlaceholder="ค้นหาชื่อ / SKU / รหัสบนร้าน / รหัสในระบบ"
                emptyText="ไม่มีสินค้าในกลุ่มนี้"
                actions={(
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <LayoutSwitch value={layout} onChange={setLayout} />
                    {canEdit && unmatchedRows.length > 0 && (
                      <button type="button" onClick={() => setWorkbench(true)} className="h-8 px-3 text-sm whitespace-nowrap text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">⚡ จับคู่ทีละตัว ({unmatchedRows.length.toLocaleString()})</button>
                    )}
                    {canEdit && highRows.length > 0 && (
                      <button type="button" onClick={() => setBulkAsk("high")} disabled={bulkBusy} className="h-8 px-3 text-sm whitespace-nowrap text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ ยืนยันทั้งหมดที่รหัสตรงกัน ({highRows.length.toLocaleString()})</button>
                    )}
                  </div>
                )}
                resizable storageKey="platform-catalog-listings-v2" dense
              />
            </div>
          )
        ) : tab === "fields" ? (
          fields.length === 0
            ? <EmptyState icon="🧾" title={`ยังไม่รู้ช่องข้อมูลของ ${activePf?.name_th ?? "ร้านนี้"}`} hint="อัปไฟล์ export แล้วระบบจะอ่านหัวคอลัมน์เป็นช่องข้อมูลให้อัตโนมัติ" />
            : <MiniTable rows={fields} columns={fcols} rowKey={(f) => f.field_key} searchText={(f) => `${f.field_key} ${f.field_label ?? ""}`} dense />
        ) : (
          fields.length === 0
            ? <EmptyState icon="🔗" title={`ยังไม่รู้ช่องข้อมูลของ ${activePf?.name_th ?? "ร้านนี้"}`} hint="อัปไฟล์ export ก่อน แล้วค่อยตั้งค่าส่งข้อมูล" />
            : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 text-[11px] text-slate-400 font-medium">
                  <span className="flex-1">ช่องของ {activePf?.name_th}</span>
                  <span className="text-slate-300">←</span>
                  <span className="w-64">เอาข้อมูลในระบบตัวไหนมาใส่</span>
                </div>
                {fields.map((f) => (
                  <div key={f.field_key} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 min-w-0"><span className="font-mono text-xs text-slate-700">{f.field_key}</span>{f.is_required && <span className="ml-1 text-[10px] text-rose-500">*</span>}{f.field_label && f.field_label !== f.field_key && <span className="text-[11px] text-slate-400 ml-1 truncate">({f.field_label})</span>}</span>
                    <span className="text-slate-300">←</span>
                    <select value={mappings[f.field_key] ?? ""} disabled={!canEdit} onChange={(e) => saveMapping(f.field_key, e.target.value)} className="w-64 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white shrink-0">
                      <option value="">— ไม่ใช้ —</option>
                      {["Parent SKU", "SKU (สี)", "อื่นๆ"].map((g) => (
                        <optgroup key={g} label={g}>
                          {PLATFORM_SOURCE_FIELDS.filter((s) => s.group === g).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )
        )}

      {showManager && <PlatformImportProfileManager platformId={platformId} platformCode={platformCode} onClose={() => setShowManager(false)} onChanged={loadCustomProfiles} />}

      {managerParent && <ProductPlatformManager parentSkuId={managerParent} initialPlatformId={platformId} canEdit={canEdit} canPublish={can("products.platforms.publish")} onClose={() => { setManagerParent(null); load(); }} />}

      <MatchWorkbench
        open={workbench} onClose={() => setWorkbench(false)}
        title={`จับคู่ทีละตัว — ${where}`}
        items={unmatchedRows} suggestions={suggestions} suggestLoading={suggestLoading} canEdit={canEdit}
        total={needMatch} matchedBefore={counts.ok}
        onMatch={(listingId, p) => saveMatch(listingId, p, true)}
        onIgnore={(listingId, reason) => saveIgnore([listingId], true, reason, true)}
      />

      <IgnoreDialog
        open={!!ignoreTarget && ignoreTargetRows.length > 0} count={ignoreTargetRows.length} busy={ignoreBusy}
        sample={ignoreTargetRows.map((l) => l.title || l.sku_code || l.external_product_id || "—")}
        onClose={() => setIgnoreTarget(null)}
        onConfirm={(reason) => { void saveIgnore(ignoreTargetRows.map((l) => l.id), true, reason).then((ok) => { if (ok) setIgnoreTarget(null); }); }}
      />

      {canEdit && view === "match" && tab === "catalog" && (
        <BulkActionBar count={selected.size} unit="รายการ" onClear={() => setSelected(new Set())}
          extra={[selGuessDup > 0 ? `ตัวซ้ำบนร้าน ${selGuessDup} ไม่รวมในการยืนยัน` : "", selected.size !== selIgnorable.length + selIgnored.length ? "ตัวที่จับคู่อยู่แล้วจะไม่ถูกข้าม" : ""].filter(Boolean).join(" · ") || undefined}>
          {canPublish && selToOpen.length > 0 && (
            <button type="button" disabled={disp.busy} onClick={() => disp.request(selToOpen.map((l) => l.id), "onsale", selToOpen.map((l) => l.title || l.sku_code || ""))} className="h-8 px-3 text-sm rounded-lg bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">เปิดขาย ({selToOpen.length.toLocaleString()})</button>
          )}
          {canPublish && selToHide.length > 0 && (
            <button type="button" disabled={disp.busy} onClick={() => disp.request(selToHide.map((l) => l.id), "hide", selToHide.map((l) => l.title || l.sku_code || ""))} className="h-8 px-3 text-sm rounded-lg border border-white/30 text-white hover:bg-white/10 disabled:opacity-50">ปิดขาย ({selToHide.length.toLocaleString()})</button>
          )}
          {selGuess.length > 0 && (
            <button type="button" disabled={bulkBusy} onClick={() => setBulkAsk("selected")} className="h-8 px-3 text-sm rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">✓ ยืนยันคู่ที่ระบบเดา ({selGuess.length.toLocaleString()})</button>
          )}
          {selIgnorable.length > 0 && (
            <button type="button" disabled={ignoreBusy} onClick={() => setIgnoreTarget(selIgnorable)} className="h-8 px-3 text-sm rounded-lg bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-50">🚫 ไม่ต้องจับคู่ ({selIgnorable.length.toLocaleString()})</button>
          )}
          {selIgnored.length > 0 && (
            <button type="button" disabled={ignoreBusy} onClick={() => void saveIgnore(selIgnored, false, null)} className="h-8 px-3 text-sm rounded-lg border border-white/30 text-white hover:bg-white/10 disabled:opacity-50">↩ เลิกข้าม ({selIgnored.length.toLocaleString()})</button>
          )}
          {selGone.length > 0 && (
            <button type="button" disabled={goneBusy} onClick={() => void clearGone(selGone)} className="h-8 px-3 inline-flex items-center gap-1.5 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"><Icon name="delete" />ล้างที่ไม่อยู่บนร้าน ({selGone.length.toLocaleString()})</button>
          )}
        </BulkActionBar>
      )}

      <ConfirmDialog
        open={!!bulkAsk && bulkRows.length > 0} onClose={() => { if (!bulkBusy) setBulkAsk(null); }} onConfirm={() => void confirmMany()} loading={bulkBusy}
        title={bulkAsk === "selected" ? `ยืนยันจับคู่ ${bulkRows.length.toLocaleString()} รายการที่เลือก?` : `ยืนยันจับคู่ ${bulkRows.length.toLocaleString()} รายการที่รหัสตรงกัน?`}
        confirmText={`ยืนยัน ${bulkRows.length.toLocaleString()} รายการ`}
        requireTyped={bulkRows.length > TYPED_CONFIRM_OVER ? "ยืนยัน" : undefined}
        message={(
          <div className="space-y-2 text-sm">
            {bulkAsk === "selected"
              ? <p>จับคู่ตามที่ระบบเดา — รหัสตรงกัน (มั่นใจ) {bulkSure.toLocaleString()} · เดาจากชื่อ/รหัสใกล้เคียง {(bulkRows.length - bulkSure).toLocaleString()}{bulkRows.length - bulkSure > 0 ? " (ควรดูตัวอย่างก่อน)" : ""}:</p>
              : <p>ทุกรายการนี้ รหัสบนร้าน (ช่อง SKU หรือรหัสท้ายชื่อสินค้า) ตรงกับรหัสในระบบ ต่างแค่ขีด/ตัวเล็กใหญ่ และไม่มีตัวอื่นที่ตรงพอกัน — ตัวอย่าง:</p>}
            <ul className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5">
              {[...bulkRows].sort((a, b) => (high.has(a.id) ? 1 : 0) - (high.has(b.id) ? 1 : 0)).slice(0, 8).map((l) => (
                <li key={l.id} className="truncate">{l.sku_code || (l.title ?? "").slice(0, 32)} → {suggestions[l.id]?.[0]?.code}{!high.has(l.id) && <span className="text-amber-700"> · {suggestions[l.id]?.[0]?.score}%</span>}</li>
              ))}
              {bulkRows.length > 8 && <li className="text-slate-400">… และอีก {(bulkRows.length - 8).toLocaleString()} รายการ</li>}
            </ul>
            {bulkAsk === "high" && highDupSkipped > 0 && <p className="text-xs text-amber-700">ไม่รวม {highDupSkipped.toLocaleString()} รายการที่ซ้ำบนร้าน (ชื่อ+รหัสเหมือนกันหลายชิ้น) — กดการ์ด “ซ้ำบนร้าน” แล้วเปิดดูทีละตัวเพื่อเก็บไว้ตัวเดียว</p>}
            <p className="text-xs text-slate-500">จับคู่ผิดตัวไหนแก้ทีหลังได้ทีละตัว · มีประวัติเก็บว่าใครจับคู่อะไร</p>
          </div>
        )}
      />

      {disp.dialog}
      <NotListedPicker open={addPick} onClose={() => setAddPick(false)} platformId={platformId} brandId={brandId} where={where}
        onPick={(ps) => { setAddPick(false); setAddFor(ps); }}
        onGoMatch={(listingId) => { setAddPick(false); setFilter("all"); setPendingOpen(listingId); if (view !== "match") setView("match"); }} />
      {addFor && (
        <AddToPlatformWizard open parents={addFor} brandId={brandId || null} initialPlatformCodes={platformCode ? [platformCode] : undefined}
          onClose={() => setAddFor(null)} onDone={() => { setAddFor(null); void reloadCurrent(); }} />
      )}
      <ListingDrawer listingId={openListing?.id ?? null} onClose={() => setOpenListing(null)} canPublish={canPublish} onChanged={onListingChanged}
        matchTab={openListing ? (
          <div className="space-y-4 text-sm">
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-600">จับคู่กับสินค้าในระบบ</div>
              {openListing.matched_parent_sku_id
                ? <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">✓ จับคู่อยู่กับ <span className="font-mono">{openListing.matched_code}</span> {openListing.matched_name ? `· ${openListing.matched_name}` : ""}</div>
                : openListing.match_ignored
                  ? (
                    <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                      <span className="flex-1">🚫 ตั้งไว้ว่าไม่ต้องจับคู่{openListing.match_ignore_reason ? ` · ${openListing.match_ignore_reason}` : ""}</span>
                      {canEdit && <button type="button" disabled={ignoreBusy} onClick={() => void saveIgnore([openListing.id], false, null)} className="text-violet-700 hover:underline disabled:opacity-50">เลิกข้าม</button>}
                    </div>
                  )
                  : <div className="text-xs text-amber-600">ยังไม่จับคู่ — เลือกจากที่ระบบเดา หรือค้นหาเอง</div>}
              {openListing.matched_parent_sku_id && (
                <button onClick={() => setManagerParent(openListing.matched_parent_sku_id!)} className="w-full h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📝 แก้รายละเอียดต่อแพลตฟอร์ม (ชื่อ/หมวด/รูป/ราคา) →</button>
              )}
              <MatchCandidates suggestions={modalSugs ?? undefined} loading={modalSugs === null} currentId={openListing.matched_parent_sku_id}
                canEdit={canEdit} busy={busyIds.has(openListing.id)} onPick={(p) => void saveMatch(openListing.id, p)}
                onUnmatch={openListing.matched_parent_sku_id ? () => void saveMatch(openListing.id, null) : undefined}
                onIgnore={!openListing.matched_parent_sku_id && !openListing.match_ignored ? () => setIgnoreTarget([openListing.id]) : undefined} />
            </div>

            {/* ชื่อ+รหัสซ้ำบนร้าน → เก็บไว้ตัวเดียว */}
            {openSiblings.length > 1 && (
              <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-amber-800">บนร้านมีสินค้าชื่อและรหัสเหมือนตัวนี้ {openSiblings.length} ชิ้น</div>
                <p className="text-[11px] text-slate-600">ร้านมีหลายหน้าขายของชิ้นเดียวกัน (เช่น กดสร้างซ้ำตอนทดสอบ) — ควรลบตัวเกินใน Seller Center ของร้าน แล้วในระบบเก็บไว้ตัวเดียว</p>
                <ul className="divide-y divide-amber-100 rounded-lg border border-amber-100 bg-white text-xs">
                  {openSiblings.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
                      <span className="font-mono text-slate-700">#{s.external_product_id || "—"}</span>
                      {s.id === openListing.id && <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">ตัวนี้</span>}
                      {dupBest?.id === s.id && <span className="rounded border border-emerald-200 bg-emerald-50 px-1 text-[10px] text-emerald-700">แนะนำเก็บ</span>}
                      <span className="flex-1" />
                      {summ[s.id] && summ[s.id].state !== "nodata" && <ShopStateBadge state={summ[s.id].state} stock={summ[s.id].stock} />}
                      {summ[s.id] && summ[s.id].state === "out" && <span className="text-rose-600">สต๊อก 0</span>}
                      {effectivePrice(summ[s.id]) != null && <span className="tabular-nums text-slate-600">{effectivePrice(summ[s.id])!.toLocaleString()}฿</span>}
                      {s.matched_parent_sku_id ? <span className="text-emerald-700">✓ จับคู่ {s.matched_code}</span> : <span className="text-slate-400">ยังไม่จับคู่</span>}
                      {s.id !== openListing.id && <button type="button" onClick={() => openRow(s)} className="text-violet-700 hover:underline">เปิด</button>}
                    </li>
                  ))}
                </ul>
                {dupBest && <p className="text-[11px] text-slate-500">“แนะนำเก็บ” = ชิ้นที่ยังเปิดขายและสต๊อกมากสุด (ลูกค้าซื้อได้จริง){dupBest.id !== openListing.id ? " — กด “เปิด” ที่ตัวนั้น แล้วกด “เก็บตัวนี้”" : ""}</p>}
                {canEdit && (dupCanKeep ? (
                  <button type="button" disabled={ignoreBusy} onClick={() => setDupKeepAsk(true)} className="w-full h-9 px-3 text-sm text-amber-800 border border-amber-300 bg-white rounded-lg hover:bg-amber-50 disabled:opacity-50">
                    เก็บตัวนี้ · อีก {dupOthers.length} ตัวตั้ง “ไม่ต้องจับคู่ (ซ้ำบนร้าน)”
                  </button>
                ) : dupMatchedOther && !openListing.matched_parent_sku_id ? (
                  <p className="text-[11px] text-slate-600">ตัวที่จับคู่อยู่คือ <span className="font-mono">#{dupMatchedOther.external_product_id}</span> — กด “เปิด” ที่ตัวนั้น แล้วกด “เก็บตัวนี้”</p>
                ) : null)}
              </div>
            )}

            {/* ส่งราคาขึ้น LINE เฉพาะสินค้านี้ (เฉพาะ LINE + จับคู่แล้ว) */}
            {canEdit && platformCode === "line_shopping" && openListing.matched_parent_sku_id && !isGoneStatus(openListing.status) && (
              <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-3 space-y-1.5">
                <div className="text-xs font-semibold text-slate-600">ส่งราคาขึ้น LINE</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={pushOnePrice} disabled={pushing} className="h-9 px-3 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{pushing ? "กำลังส่ง..." : "⬆️ ส่งราคา"}</button>
                  <button onClick={pushOneDetails} disabled={pushing} className="h-9 px-3 text-sm text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 disabled:opacity-50">📝 ส่งรายละเอียด (ชื่อ/แบรนด์/หมวด)</button>
                </div>
                {pushMsg && <p className="text-xs text-slate-700">{pushMsg}</p>}
                <p className="text-[11px] text-slate-400">ราคาเอาจากราคาขาย (list_price) ใน ERP · ไม่ตั้งส่วนลด · แนะนำทดสอบตัวนี้ก่อนกด “ส่งทั้งหมด”</p>
              </div>
            )}

            {canEdit && (
              <button onClick={() => void deleteListing()} disabled={deleting} className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline disabled:opacity-50">{deleting ? "กำลังลบ…" : "🗑 นำเข้าผิด? ลบรายการนี้"}</button>
            )}
          </div>
        ) : null} />

      <ConfirmDialog
        open={dupKeepAsk && dupOthers.length > 0} onClose={() => { if (!ignoreBusy) setDupKeepAsk(false); }} loading={ignoreBusy}
        onConfirm={() => void saveIgnore(dupOthers.map((l) => l.id), true, IGNORE_REASON_DUP).then((ok) => { if (ok) setDupKeepAsk(false); })}
        title={`ตั้ง ${dupOthers.length} รายการที่ซ้ำเป็น “ไม่ต้องจับคู่”?`}
        confirmText={`ตั้ง ${dupOthers.length} รายการ`}
        message={(
          <div className="space-y-2 text-sm">
            <p>เก็บ <span className="font-mono">#{openListing?.external_product_id ?? "—"}</span> ไว้ตัวเดียว · อีก {dupOthers.length} ตัวจะไม่นับใน “ยังไม่จับคู่” และไม่ถูกจับคู่ตอนกดยืนยันทั้งหมด</p>
            <ul className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5">
              {dupOthers.slice(0, 8).map((l) => <li key={l.id}>#{l.external_product_id || "—"}</li>)}
              {dupOthers.length > 8 && <li className="text-slate-400">… และอีก {dupOthers.length - 8} รายการ</li>}
            </ul>
            <p className="text-xs text-slate-500">ของบนร้านจริงไม่ถูกลบ — ต้องไปลบใน Seller Center เอง · กด “เลิกข้าม” ได้ทุกเมื่อ · มีประวัติว่าใครตั้ง</p>
          </div>
        )}
      />
    </div>
  );
}
