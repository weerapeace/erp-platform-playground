"use client";

/**
 * ShopManager — หน้าจัดการเว็บของ "ร้านเดียว" (/website/<slug>)
 * แต่ละเว็บมีหน้าของตัวเอง ไม่รวมกันแล้ว — หน้ารวมร้านอยู่ที่ /website
 *
 * แท็บ: สินค้าบนเว็บ (components/website-listings-panel) · หมวดหมู่ · จับคู่ฟิลด์ · ดีไซน์ · หน้าแรก · หน้าเว็บ · ข้อมูลร้าน · ออเดอร์
 * เว้นว่าง = ใช้ค่าจาก ERP / จากการจับคู่ฟิลด์
 * ข้อมูล: /api/website/listings (guardWebsite + audit)
 * 🔐 สิทธิ์ (lib/website-access): แท็บโชว์ตามกลุ่มที่ "ดูได้" · กลุ่มที่ดูได้อย่างเดียว = แถบเตือน (API กันบันทึกเอง)
 *    ไม่มีสิทธิ์ร้านนี้ = หน้าห้ามเข้า · สิทธิ์ยังโหลดไม่เสร็จ = ไม่บล็อก (เหมือนล็อกแอป)
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PlaygroundShell } from "@/components/playground-shell";
import { loadWebListings } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { ErrorState, LoadingState } from "@/components/state-views";
import { ImageSetsProvider } from "@/components/website-image-sets-context";
import { WebsiteOpenToggle } from "@/components/website-open-toggle";
import type { Listing, CategoryDef, ShopInfo } from "@/components/website-listings-panel";
import { WheelSelect } from "@/components/wheel-select";
import { useViewPref } from "@/lib/use-view-pref";
import { ConfirmDialog } from "@/components/modal";
import { UnsavedGuardProvider, useUnsavedGuardHost } from "@/components/save-bar";
import { AccessDenied, useAuth, type Permission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { designAccess, designTabTopicOf, WEBSITE_LEVEL_LABEL, websiteGroupDef, websiteGroupOfTab, websiteLevel, websiteShopPerm, WEBSITE_GROUPS, type WebsiteGroup } from "@/lib/website-access";
import { WebsiteManagerMenu } from "@/components/website-manager-menu";

// ⚡ โค้ดของแต่ละแท็บโหลดตอนเปิดแท็บนั้น (2026-11-12) — เดิมโหลดครบ 21 แท็บตั้งแต่เปิดหน้า = โค้ด 920KB หนักสุดในระบบ
//    แท็บยังไม่มา = ข้อความกำลังเปิด (state-views กลาง) · ssr:false เพราะทุกแผงต้องรู้ตัวผู้ใช้/ร้านก่อนอยู่แล้ว
const tabLoading = () => <LoadingState label="กำลังเปิดแท็บ…" />;
const lazyTab = { ssr: false, loading: tabLoading } as const;
const WebsiteListingsPanel = dynamic(() => import("@/components/website-listings-panel").then((m) => m.WebsiteListingsPanel), lazyTab);
const WebsiteFieldMapPanel = dynamic(() => import("@/components/website-field-map-panel").then((m) => m.WebsiteFieldMapPanel), lazyTab);
const WebsiteCategoriesPanel = dynamic(() => import("@/components/website-categories-panel").then((m) => m.WebsiteCategoriesPanel), lazyTab);
const WebsiteCollectionsPanel = dynamic(() => import("@/components/website-collections-panel").then((m) => m.WebsiteCollectionsPanel), lazyTab);
const WebsiteNewDropsPanel = dynamic(() => import("@/components/website-new-drops-panel").then((m) => m.WebsiteNewDropsPanel), lazyTab);
const WebsiteSizeGuidesPanel = dynamic(() => import("@/components/website-size-guides-panel").then((m) => m.WebsiteSizeGuidesPanel), lazyTab);
const WebsiteThemePanel = dynamic(() => import("@/components/website-theme-panel").then((m) => m.WebsiteThemePanel), lazyTab);
const WebsiteLayoutPanel = dynamic(() => import("@/components/website-layout-panel").then((m) => m.WebsiteLayoutPanel), lazyTab);
const WebsitePagesPanel = dynamic(() => import("@/components/website-pages-panel").then((m) => m.WebsitePagesPanel), lazyTab);
const WebsiteInfoPanel = dynamic(() => import("@/components/website-info-panel").then((m) => m.WebsiteInfoPanel), lazyTab);
const WebsiteOrdersPanel = dynamic(() => import("@/components/website-orders-panel").then((m) => m.WebsiteOrdersPanel), lazyTab);
const WebsiteShippingPanel = dynamic(() => import("@/components/website-shipping-panel").then((m) => m.WebsiteShippingPanel), lazyTab);
const WebsiteCouponsPanel = dynamic(() => import("@/components/website-coupons-panel").then((m) => m.WebsiteCouponsPanel), lazyTab);
const WebsiteMembersPanel = dynamic(() => import("@/components/website-members-panel").then((m) => m.WebsiteMembersPanel), lazyTab);
const WebsiteReviewsPanel = dynamic(() => import("@/components/website-reviews-panel").then((m) => m.WebsiteReviewsPanel), lazyTab);
const WebsiteStatsPanel = dynamic(() => import("@/components/website-stats-panel").then((m) => m.WebsiteStatsPanel), lazyTab);
const WebsiteReturnsPanel = dynamic(() => import("@/components/website-returns-panel").then((m) => m.WebsiteReturnsPanel), lazyTab);
const WebsiteImageSetsPanel = dynamic(() => import("@/components/website-image-sets-panel").then((m) => m.WebsiteImageSetsPanel), lazyTab);
const WebsiteSiteImagesPanel = dynamic(() => import("@/components/website-site-images-panel").then((m) => m.WebsiteSiteImagesPanel), lazyTab);
const WebsitePromotionsPanel = dynamic(() => import("@/components/website-promotions-panel").then((m) => m.WebsitePromotionsPanel), lazyTab);
const WebsiteTranslationCenter = dynamic(() => import("@/components/website-translation-center").then((m) => m.WebsiteTranslationCenter), lazyTab);

/** ↔ ความกว้างหน้าจัดการเว็บ (จำรายคน · useViewPref) — กว้าง = ค่าเริ่มต้น จัดดีไซน์/พรีวิวสะดวกขึ้น */
const PAGE_WIDTHS = ["normal", "wide", "full"] as const;
type PageWidth = (typeof PAGE_WIDTHS)[number];
const PAGE_WIDTH_CLS: Record<PageWidth, string> = { normal: "max-w-6xl", wide: "max-w-[1680px]", full: "max-w-none" };
const PAGE_WIDTH_LABEL: Record<PageWidth, string> = { normal: "ปกติ", wide: "กว้าง", full: "เต็มจอ" };

export function ShopManager({ shopSlug }: { shopSlug: string }) {
  const toast = useToast();
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const { view: pageWidth, setView: setPageWidth, saveDefault: savePageWidth } = useViewPref<PageWidth>("website_manager_width", PAGE_WIDTHS, "wide");
  const [listings, setListings] = useState<Listing[]>([]);
  // loading = รายการสินค้ากำลังโหลด · shopLoading = ข้อมูลร้าน (เบา) กำลังโหลด · listingsFor = ร้านที่ขอรายการสินค้าไปแล้ว
  const [loading, setLoading] = useState(false);
  const [shopLoading, setShopLoading] = useState(true);
  const [listingsFor, setListingsFor] = useState<string | null>(null);
  const [tabReady, setTabReady] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // ⚠️ โหลดสินค้าไม่ครบ (ฐานข้อมูลตอบช้า) — เก็บข้อมูลเดิมไว้ ไม่แสดงของครึ่ง ๆ กลาง ๆ + ปุ่มลองใหม่
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  type TabKey = "listings" | "categories" | "collections" | "newdrops" | "sizeguides" | "fieldmap" | "design" | "layout" | "pages" | "info" | "shipping" | "i18n" | "orders" | "coupons" | "members" | "reviews" | "promotions" | "stats" | "returns" | "imagesets" | "webimages";
  const [tab, setTab] = useState<TabKey>("listings");
  // 🗂 รูปบนเว็บ → "✏️ ไปแก้" Section ในหน้าแรก = เปิดแท็บหน้าแรกแล้วเลือก Section นั้นให้
  const [layoutFocus, setLayoutFocus] = useState<string | null>(null);
  const clearLayoutFocus = useCallback(() => setLayoutFocus(null), []);
  // ⚠️ สลับแท็บตอนแท็บเดิมยังไม่บันทึก → ถามก่อน (เดิมของที่แก้หายเงียบ)
  const guard = useUnsavedGuardHost();
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);
  const goTab = (k: TabKey) => {
    if (k === tab) return;
    if (guard.anyDirty()) setPendingTab(k);
    else setTab(k);
  };
  // 🧭 เมนู 2 ชั้น: จำแท็บย่อยล่าสุดของแต่ละกลุ่ม → กดกลุ่มกลับมาแล้วอยู่แท็บเดิม
  const [lastTabOf, setLastTabOf] = useState<Partial<Record<WebsiteGroup, TabKey>>>({});
  useEffect(() => {
    const g = websiteGroupOfTab(tab);
    if (g) setLastTabOf((m) => (m[g] === tab ? m : { ...m, [g]: tab }));
  }, [tab]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  // 🔐 สิทธิ์เว็บไซต์ — สิทธิ์ยังโหลดไม่เสร็จ = ถือว่าได้ (API ตรวจซ้ำเสมอ)
  const { can, permsReady, user } = useAuth();
  const know = permsReady || user?.role === "admin";
  const has = (k: string) => !know || can(k as Permission);
  const levelOfTab = (k: string) => {
    const g = websiteGroupOfTab(k);
    return g ? websiteLevel(has, g) : "edit";
  };
  const shopAllowed = has(websiteShopPerm(shopSlug));
  const anyGroup = WEBSITE_GROUPS.some((g) => websiteLevel(has, g.key) !== "none");
  // ลิงก์จากที่อื่น (เช่น ป๊อปตรวจก่อนเผยแพร่ → "ไปแก้") เปิดแท็บที่ระบุ ?tab= · ⚠️ ไม่ใช้ useSearchParams (อยู่ใน PlaygroundShell)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    const ok = ["listings", "categories", "collections", "fieldmap", "design", "layout", "pages", "info", "shipping", "i18n", "orders", "coupons", "members", "reviews", "promotions", "stats", "returns", "imagesets", "webimages"] as const;
    if (t && (ok as readonly string[]).includes(t)) setTab(t as (typeof ok)[number]);
    setTabReady(true);
  }, []);

  const load = useCallback(
    async (slug?: string) => {
      setLoading((v) => v || !slug);
      try {
        const j = await loadWebListings<Listing, ShopInfo, CategoryDef>(slug ?? "", true);
        if ((j as { retryable?: boolean }).retryable) {
          // ฐานข้อมูลตอบไม่ทัน → ไม่แตะรายการที่แสดงอยู่ (กันป้าย "ยังไม่มีราคา" ผิดทั้งร้าน) · รู้ร้านแล้วก็เก็บไว้
          setLoadError(j.error || "โหลดข้อมูลสินค้าไม่ครบ — กดลองใหม่อีกครั้ง");
          if (j.shop) setShop((cur) => cur ?? (j.shop as ShopInfo));
          return;
        }
        setLoadError(null);
        if (!j.shop && (j as { error?: string }).error) {
          // ไม่มีสิทธิ์กลุ่มสินค้าบนเว็บ → ข้อมูลร้านจากรายชื่อร้าน (เห็นเฉพาะร้านที่เข้าได้)
          const s = await apiFetch("/api/website/shops").then((r) => r.json()).catch(() => null);
          const found = ((s?.shops ?? []) as ShopInfo[]).find((x) => x.slug === slug) ?? null;
          setShop(found);
          setNotFound(!found);
          setListings([]);
          setCategories([]);
          return;
        }
        setShop(j.shop ?? null);
        // API ตอบ notFound เมื่อ slug ที่ขอไม่มีจริง (ไม่เด้งไปร้านอื่นแล้ว)
        setNotFound(Boolean(j.notFound) || !j.shop);
        setListings(j.listings ?? []);
        setCategories(Array.isArray(j.categories) ? j.categories : []);
      } catch {
        toast.error("โหลดข้อมูลไม่สำเร็จ");
        setLoadError("โหลดข้อมูลไม่สำเร็จ — เชื่อมต่อไม่ได้หรือเครือข่ายมีปัญหา");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );
  const retryLoad = async () => {
    setRetrying(true);
    try { await load(shopSlug); } finally { setRetrying(false); }
  };

  // ⚡ เปิดหน้า = โหลดข้อมูลร้านแบบเบาก่อน (2026-11-12) → หัวหน้า/เมนู/แท็บอื่นขึ้นทันที
  //    เดิมรอรายการสินค้าทั้งร้านก่อน (Louis Montini 390 ตัว ~5MB) ทุกแท็บจึงค้าง "กำลังโหลด" ถึงจะไม่ได้เปิดแท็บสินค้า
  //    อ่านรายชื่อร้านไม่ได้ (เครือข่าย/สิทธิ์) → ใช้ทางเดิม: ข้อมูลร้านมากับรายการสินค้า
  useEffect(() => {
    let off = false;
    setShopLoading(true);
    setShop(null);
    setNotFound(false);
    setListings([]);
    setCategories([]);
    setLoadError(null);
    void (async () => {
      const s = await apiFetch("/api/website/shops").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (off) return;
      const all = Array.isArray(s?.shops) ? (s.shops as (ShopInfo & { siteUrl?: string | null })[]) : null;
      if (!all) {
        setListingsFor(shopSlug);
        await load(shopSlug);
        if (!off) setShopLoading(false);
        return;
      }
      const found = all.find((x) => x.slug === shopSlug) ?? all.find((x) => x.slug.toLowerCase() === shopSlug.toLowerCase()) ?? null;
      if (found) {
        const info: ShopInfo = { id: found.id, name: found.name, slug: found.slug, isDefault: Boolean(found.isDefault), siteUrl: found.siteUrl ?? null };
        setShop((cur) => (cur && cur.id === info.id ? cur : info));
      }
      setNotFound(!found);
      setShopLoading(false);
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSlug]);

  // 🛍 รายการสินค้าโหลดตอนเปิดแท็บสินค้าครั้งแรก (ของร้านนี้) แล้วเก็บไว้ — แท็บอื่นไม่ต้องรอ/ไม่แย่งเครื่อง
  //    รอ tabReady = อ่าน ?tab= จากลิงก์แล้ว (กันโหลดสินค้าทิ้งตอนลิงก์พาไปแท็บอื่น)
  useEffect(() => {
    if (!tabReady || tab !== "listings" || listingsFor === shopSlug) return;
    setListingsFor(shopSlug);
    setLoading(true);
    void load(shopSlug);
  }, [tab, tabReady, shopSlug, listingsFor, load]);

  // แท็บที่เปิดอยู่ไม่มีสิทธิ์ดู (สิทธิ์โหลดเสร็จ / เปิดจากลิงก์ ?tab=) → ไปแท็บแรกที่ดูได้
  const tabKeys = WEBSITE_GROUPS.flatMap((g) => g.tabs) as TabKey[];
  const firstTab = tabKeys.find((k) => levelOfTab(k) !== "none") ?? null;
  useEffect(() => {
    if (levelOfTab(tab) === "none" && firstTab) setTab(firstTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, firstTab]);

  if (know && (!anyGroup || !shopAllowed))
    return (
      <PlaygroundShell>
        <div className="max-w-6xl mx-auto px-5 py-6">
          <Link href="/website" className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1">
            ← เว็บไซต์ทั้งหมด
          </Link>
          <AccessDenied message={anyGroup ? "คุณไม่มีสิทธิ์จัดการเว็บร้านนี้ — ขอสิทธิ์ได้ที่ผู้ดูแลระบบ" : "คุณยังไม่มีสิทธิ์ใช้งานเว็บไซต์ — ขอสิทธิ์ได้ที่ผู้ดูแลระบบ"} />
        </div>
      </PlaygroundShell>
    );

  const tabGroup = websiteGroupOfTab(tab);
  // 👷 หน้าตาเว็บ "ดูได้" + ได้แก้บางหัวข้อ → แท็บดีไซน์แก้ได้ (หน้าดีไซน์จัดการเอง) ไม่ขึ้นแถบดูอย่างเดียว
  //    🗂 ติ๊กหัวข้อแท็บ (หน้าแรก/หน้าเว็บ/รูปบนเว็บ) → แท็บนั้นแก้ได้ (เผยแพร่ไม่ได้ = หน้าจอเปลี่ยนเป็นส่งหัวหน้าเอง)
  const myDesign = designAccess(has);
  const designTopics = myDesign.topics.length > 0;
  const tabTopicOn = (k: string) => {
    const t = designTabTopicOf(k);
    return t != null && myDesign.tabs.includes(t);
  };
  const viewOnlyTab = (k: string) => levelOfTab(k) === "view" && !(k === "design" && designTopics) && !tabTopicOn(k);

  // ไม่มีเว็บร้านชื่อนี้ — บอกให้ชัด ดีกว่าพาไปร้านอื่นแบบเงียบ ๆ
  if (notFound && !shopLoading && !loading)
    return (
      <PlaygroundShell>
        <div className="max-w-6xl mx-auto px-5 py-6">
          <Link href="/website" className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1">
            ← เว็บไซต์ทั้งหมด
          </Link>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
            <p className="text-3xl">🔍</p>
            <p className="mt-3 text-sm text-amber-900">
              ไม่พบเว็บร้านชื่อ <span className="font-medium">“{shopSlug}”</span>
            </p>
            <p className="mt-1 text-xs text-amber-700">อาจพิมพ์ที่อยู่ผิด หรือร้านนี้ถูกลบไปแล้ว</p>
            <Link
              href="/website"
              className="inline-block mt-4 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
            >
              เลือกจากเว็บไซต์ทั้งหมด
            </Link>
          </div>
        </div>
      </PlaygroundShell>
    );

  return (
    <PlaygroundShell>
      <div className={`${PAGE_WIDTH_CLS[pageWidth]} mx-auto px-5 py-6`}>
        {/* หัวเรื่อง */}
        <div className="mb-5">
          <Link href="/website" className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1">
            ← เว็บไซต์ทั้งหมด
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              🌐 {shop?.name ?? "กำลังโหลด…"}
              {shop?.isDefault && (
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">ร้านหลัก</span>
              )}
            </h1>
            {/* ปุ่มเปิด/ปิดเว็บชั่วคราว — ค่าเดียวกับช่องในแท็บข้อมูลร้าน */}
            {shop && websiteLevel(has, "settings") !== "none" && <WebsiteOpenToggle shopSlug={shop.slug} shopId={shop.id} />}
            {shop?.siteUrl && (
              <a href={shop.siteUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                {shop.siteUrl.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
            {can("admin.users") && (
              <Link href="/website/access" className="ml-auto text-xs text-slate-500 hover:text-blue-600" title="ตั้งว่าใครเห็น/แก้ส่วนไหนของเว็บ และเข้าร้านไหนได้">
                🔐 ใครทำอะไรได้
              </Link>
            )}
            <label className={`${can("admin.users") ? "" : "ml-auto "}flex items-center gap-1.5 text-[11px] text-slate-500`} title="ความกว้างของหน้านี้ (จำไว้ให้ครั้งหน้า)">
              ↔ ความกว้างหน้า
              <WheelSelect
                value={pageWidth}
                onChange={(e) => {
                  const v = e.target.value as PageWidth;
                  setPageWidth(v);
                  void savePageWidth(v);
                }}
              >
                {PAGE_WIDTHS.map((w) => (
                  <option key={w} value={w}>{PAGE_WIDTH_LABEL[w]}</option>
                ))}
              </WheelSelect>
            </label>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            กำหนดว่าสินค้าไหนขึ้นเว็บร้านนี้ พร้อมตั้งชื่อ/ราคา/หน่วย/หมวดเฉพาะเว็บ — เว้นว่าง = เติมอัตโนมัติจาก ERP
          </p>
        </div>

        {/* 🧭 เมนู 2 ชั้น (เจ้าของเลือก 2026-11-10 แบบ A) — ชั้นบน = กลุ่ม (ตัวเดียวกับสิทธิ์ WEBSITE_GROUPS) · ชั้นล่าง = แท็บย่อยของกลุ่มที่เลือก
            ไอคอนเส้นมีสีตามกลุ่ม · components/website-manager-menu (ชื่อ/ไอคอน/สี = lib/website-access) · กลุ่มที่ไม่มีสิทธิ์ดู = ไม่โชว์ */}
        {shop && (
          <WebsiteManagerMenu<TabKey>
            tab={tab}
            onGo={goTab}
            canSee={(k) => levelOfTab(k) !== "none"}
            viewOnly={know ? viewOnlyTab : undefined}
            lastTabOf={lastTabOf}
          />
        )}

        {/* 👁 กลุ่มนี้ดูได้อย่างเดียว — ปุ่มบันทึกยังกดได้ แต่ระบบไม่ให้บันทึก (API ตรวจสิทธิ์) */}
        {shop && know && viewOnlyTab(tab) && tabGroup && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-website-view-only>
            👁 ส่วน “{websiteGroupDef(tabGroup).label}” คุณ{WEBSITE_LEVEL_LABEL.view}อย่างเดียว — แก้แล้วบันทึกไม่ได้ · ขอสิทธิ์แก้ได้ที่ผู้ดูแลระบบ
          </div>
        )}

        {/* ⚠️ โหลดสินค้าไม่ครบ — ยังไม่เคยโหลดได้เลย = ข้อความเต็ม · มีข้อมูลรอบก่อนอยู่ = แถบเตือน + ลองใหม่ */}
        {loadError && !loading && (!shop || (tab === "listings" && listings.length === 0)) && (
          <ErrorState title="โหลดข้อมูลสินค้าไม่ครบ" hint={loadError} onRetry={() => void retryLoad()} retrying={retrying} />
        )}
        {loadError && !loading && shop && !(tab === "listings" && listings.length === 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert" data-website-load-error>
            <span className="flex-1 min-w-[200px]">⚠️ {loadError} · รายการสินค้าที่เห็นเป็นข้อมูลรอบก่อน อาจไม่ใช่ล่าสุด</span>
            <button type="button" onClick={() => void retryLoad()} disabled={retrying}
              className="shrink-0 rounded-md bg-rose-600 px-3 py-1 font-medium text-white hover:bg-rose-700 disabled:opacity-50">
              {retrying ? "กำลังลองใหม่..." : "↻ ลองใหม่"}
            </button>
          </div>
        )}

        {/* ⚠️ ยังไม่บันทึก → ถามก่อนสลับแท็บ (แต่ละแท็บแจ้งผ่าน SaveBar / useReportUnsaved) */}
        <ConfirmDialog
          open={!!pendingTab}
          onClose={() => setPendingTab(null)}
          onConfirm={() => {
            if (pendingTab) setTab(pendingTab);
            setPendingTab(null);
          }}
          title="ยังไม่ได้บันทึก"
          message="คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?"
          confirmText="ออกโดยไม่บันทึก"
          cancelText="อยู่ต่อ"
        />
        <UnsavedGuardProvider value={guard.register}>
        {/* 🖼 รายชื่อชุดรูปของร้าน → ช่องรูปทุกช่องในหน้านี้มีปุ่ม "🔗 ใช้ชุดรูป" */}
        <ImageSetsProvider shopSlug={shop?.slug ?? ""}>
        {/* แท็บสินค้าบนเว็บ (ตัวกรอง/ค้นหา/ทำหลายรายการ/ลากเรียง/แก้ด่วน) */}
        {tab === "listings" && shop && !(loadError && !loading && listings.length === 0) && (
          <WebsiteListingsPanel
            shop={shop}
            listings={listings}
            setListings={setListings}
            categories={categories}
            loading={loading || listingsFor !== shopSlug}
            reload={() => load(shop.slug)}
          />
        )}

        {/* แท็บหมวดหมู่ (หมวด + รูป/แบนเนอร์ + จัดสินค้าลงหมวด) */}
        {tab === "categories" && shop && <WebsiteCategoriesPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บคอลเลกชัน (เปิดหน้า /collection/<ลิงก์> + แบนเนอร์/เรื่องราว/Google) */}
        {tab === "collections" && shop && <WebsiteCollectionsPanel shopSlug={shop.slug} shopId={shop.id} siteUrl={shop.siteUrl} />}
        {tab === "newdrops" && shop && <WebsiteNewDropsPanel shopSlug={shop.slug} shopId={shop.id} />}
        {/* 📏 ตารางไซส์ (ตั้งต่อหมวด → ลิงก์ตารางไซส์ + ช่วงใต้ปุ่มไซส์ + ตัวช่วยแนะนำไซส์) */}
        {tab === "sizeguides" && shop && <WebsiteSizeGuidesPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บจับคู่ฟิลด์ */}
        {tab === "fieldmap" && shop && <WebsiteFieldMapPanel shopSlug={shop.slug} shopId={shop.id} onOpenCategories={() => goTab("categories")} />}

        {/* แท็บดีไซน์ (ธีม) */}
        {tab === "design" && shop && <WebsiteThemePanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บจัดหน้าแรก (บล็อก) */}
        {tab === "layout" && shop && <WebsiteLayoutPanel shopSlug={shop.slug} shopId={shop.id} focusBlockId={layoutFocus} onFocused={clearLayoutFocus} />}

        {/* แท็บหน้าเว็บอื่น ๆ */}
        {tab === "pages" && shop && <WebsitePagesPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บข้อมูลร้าน (คำโปรย/ติดต่อ/ค่าส่ง/ช่องทางจ่าย) */}
        {tab === "info" && shop && <WebsiteInfoPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บออเดอร์จากเว็บ */}
        {/* 🌐 ศูนย์แปลภาษา — ทุกข้อความของร้านในตารางเดียว (หน้าเว็บ /en) */}
        {tab === "i18n" && shop && <WebsiteTranslationCenter shopSlug={shop.slug} />}
        {tab === "shipping" && shop && <WebsiteShippingPanel shopSlug={shop.slug} shopId={shop.id} />}
        {tab === "orders" && shop && <WebsiteOrdersPanel shopSlug={shop.slug} shopId={shop.id} />}
        {tab === "coupons" && shop && <WebsiteCouponsPanel shopSlug={shop.slug} shopId={shop.id} />}
        {/* 🏷 โปรโมชันอัตโนมัติ (Flash sale / ซื้อครบลด / ซื้อ X แถม Y / ขั้นบันได / เซ็ต) */}
        {tab === "promotions" && shop && <WebsitePromotionsPanel shopSlug={shop.slug} shopId={shop.id} />}
        {tab === "members" && shop && <WebsiteMembersPanel shopSlug={shop.slug} />}
        {/* ⭐ ตรวจ/ตอบรีวิวสินค้า (ตั้งค่าที่แท็บข้อมูลร้าน กลุ่ม ⭐) */}
        {tab === "reviews" && shop && <WebsiteReviewsPanel shopSlug={shop.slug} shopId={shop.id} />}
        {tab === "stats" && shop && <WebsiteStatsPanel shopId={shop.id} />}
        {tab === "returns" && shop && <WebsiteReturnsPanel shopSlug={shop.slug} />}
        {tab === "imagesets" && shop && <WebsiteImageSetsPanel shopSlug={shop.slug} shopId={shop.id} />}
        {tab === "webimages" && shop && (
          <WebsiteSiteImagesPanel
            shopSlug={shop.slug}
            onGo={(g) => {
              if (g.tab === "layout") setLayoutFocus(g.blockId ?? null);
              goTab(g.tab);
            }}
          />
        )}
        </ImageSetsProvider>
        </UnsavedGuardProvider>
      </div>
    </PlaygroundShell>
  );
}
