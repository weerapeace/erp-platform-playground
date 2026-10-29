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
import { PlaygroundShell } from "@/components/playground-shell";
import { loadWebListings } from "@/lib/website-data";
import { useToast } from "@/components/toast";
import { WebsiteFieldMapPanel } from "@/components/website-field-map-panel";
import { WebsiteCategoriesPanel } from "@/components/website-categories-panel";
import { WebsiteCollectionsPanel } from "@/components/website-collections-panel";
import { WebsiteNewDropsPanel } from "@/components/website-new-drops-panel";
import { WebsiteSizeGuidesPanel } from "@/components/website-size-guides-panel";
import { WebsiteThemePanel } from "@/components/website-theme-panel";
import { WebsiteLayoutPanel } from "@/components/website-layout-panel";
import { WebsitePagesPanel } from "@/components/website-pages-panel";
import { WebsiteInfoPanel } from "@/components/website-info-panel";
import { WebsiteOrdersPanel } from "@/components/website-orders-panel";
import { WebsiteShippingPanel } from "@/components/website-shipping-panel";
import { WebsiteCouponsPanel } from "@/components/website-coupons-panel";
import { WebsiteMembersPanel } from "@/components/website-members-panel";
import { WebsiteReviewsPanel } from "@/components/website-reviews-panel";
import { WebsiteStatsPanel } from "@/components/website-stats-panel";
import { WebsiteReturnsPanel } from "@/components/website-returns-panel";
import { WebsiteImageSetsPanel } from "@/components/website-image-sets-panel";
import { WebsiteSiteImagesPanel } from "@/components/website-site-images-panel";
import { ImageSetsProvider } from "@/components/website-image-sets-context";
import { WebsitePromotionsPanel } from "@/components/website-promotions-panel";
import { WebsiteTranslationCenter } from "@/components/website-translation-center";
import { WebsiteOpenToggle } from "@/components/website-open-toggle";
import { WebsiteListingsPanel, type Listing, type CategoryDef, type ShopInfo } from "@/components/website-listings-panel";
import { WheelSelect } from "@/components/wheel-select";
import { useViewPref } from "@/lib/use-view-pref";
import { ConfirmDialog } from "@/components/modal";
import { UnsavedGuardProvider, useUnsavedGuardHost } from "@/components/save-bar";
import { AccessDenied, useAuth, type Permission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { designAccess, WEBSITE_LEVEL_LABEL, websiteGroupDef, websiteGroupOfTab, websiteLevel, websiteShopPerm, WEBSITE_GROUPS } from "@/lib/website-access";

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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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
  }, []);

  const load = useCallback(
    async (slug?: string) => {
      setLoading((v) => v || !slug);
      try {
        const j = await loadWebListings<Listing, ShopInfo, CategoryDef>(slug ?? "", true);
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
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    setLoading(true);
    void load(shopSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSlug]);

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
  const designTopics = designAccess(has).topics.length > 0;
  const viewOnlyTab = (k: string) => levelOfTab(k) === "view" && !(k === "design" && designTopics);

  // ไม่มีเว็บร้านชื่อนี้ — บอกให้ชัด ดีกว่าพาไปร้านอื่นแบบเงียบ ๆ
  if (notFound && !loading)
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

        {/* แท็บ */}
        {shop && (
          <div className="flex items-center gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
            {([
              { k: "listings", l: "สินค้าบนเว็บ" },
              { k: "categories", l: "📂 หมวดหมู่" },
              { k: "collections", l: "🎞 คอลเลกชัน" },
              { k: "newdrops", l: "🆕 มาใหม่" },
              { k: "sizeguides", l: "📏 ตารางไซส์" },
              { k: "fieldmap", l: "⚙️ จับคู่ฟิลด์" },
              { k: "design", l: "🎨 ดีไซน์" },
              { k: "layout", l: "🧱 หน้าแรก" },
              { k: "imagesets", l: "🖼 ชุดรูป" },
              { k: "webimages", l: "🗂 รูปบนเว็บ" },
              { k: "pages", l: "📄 หน้าเว็บ" },
              { k: "info", l: "🏪 ข้อมูลร้าน" },
              { k: "shipping", l: "🚚 การจัดส่ง" },
              { k: "i18n", l: "🌐 แปลภาษา" },
              { k: "orders", l: "🧾 ออเดอร์" },
              { k: "returns", l: "↩️ คืน/เปลี่ยน" },
              { k: "coupons", l: "🎟️ คูปอง" },
              { k: "promotions", l: "🏷 โปรโมชัน" },
              { k: "members", l: "👥 สมาชิก" },
              { k: "reviews", l: "⭐ รีวิว" },
              { k: "stats", l: "📈 สถิติ" },
            ] as const).filter((t) => levelOfTab(t.k) !== "none").map((t) => (
              <button
                key={t.k}
                onClick={() => goTab(t.k)}
                className={`shrink-0 px-4 py-2 text-sm border-b-2 -mb-px transition ${
                  tab === t.k
                    ? "border-blue-600 text-blue-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.l}
                {know && viewOnlyTab(t.k) && <span className="ml-1 text-[10px] text-slate-400" title="ดูได้อย่างเดียว">👁</span>}
              </button>
            ))}
          </div>
        )}

        {/* 👁 กลุ่มนี้ดูได้อย่างเดียว — ปุ่มบันทึกยังกดได้ แต่ระบบไม่ให้บันทึก (API ตรวจสิทธิ์) */}
        {shop && know && viewOnlyTab(tab) && tabGroup && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-website-view-only>
            👁 ส่วน “{websiteGroupDef(tabGroup).label}” คุณ{WEBSITE_LEVEL_LABEL.view}อย่างเดียว — แก้แล้วบันทึกไม่ได้ · ขอสิทธิ์แก้ได้ที่ผู้ดูแลระบบ
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
        {tab === "listings" && shop && (
          <WebsiteListingsPanel
            shop={shop}
            listings={listings}
            setListings={setListings}
            categories={categories}
            loading={loading}
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
