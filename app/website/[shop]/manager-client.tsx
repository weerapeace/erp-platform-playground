"use client";

/**
 * ShopManager — หน้าจัดการเว็บของ "ร้านเดียว" (/website/<slug>)
 * แต่ละเว็บมีหน้าของตัวเอง ไม่รวมกันแล้ว — หน้ารวมร้านอยู่ที่ /website
 *
 * แท็บ: สินค้าบนเว็บ (components/website-listings-panel) · หมวดหมู่ · จับคู่ฟิลด์ · ดีไซน์ · หน้าแรก · หน้าเว็บ · ข้อมูลร้าน · ออเดอร์
 * เว้นว่าง = ใช้ค่าจาก ERP / จากการจับคู่ฟิลด์
 * ข้อมูล: /api/website/listings (guardApi products.view/edit + audit)
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlaygroundShell } from "@/components/playground-shell";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { WebsiteFieldMapPanel } from "@/components/website-field-map-panel";
import { WebsiteCategoriesPanel } from "@/components/website-categories-panel";
import { WebsiteCollectionsPanel } from "@/components/website-collections-panel";
import { WebsiteNewDropsPanel } from "@/components/website-new-drops-panel";
import { WebsiteThemePanel } from "@/components/website-theme-panel";
import { WebsiteLayoutPanel } from "@/components/website-layout-panel";
import { WebsitePagesPanel } from "@/components/website-pages-panel";
import { WebsiteInfoPanel } from "@/components/website-info-panel";
import { WebsiteOrdersPanel } from "@/components/website-orders-panel";
import { WebsiteCouponsPanel } from "@/components/website-coupons-panel";
import { WebsiteMembersPanel } from "@/components/website-members-panel";
import { WebsiteTranslationCenter } from "@/components/website-translation-center";
import { WebsiteOpenToggle } from "@/components/website-open-toggle";
import { WebsiteListingsPanel, type Listing, type CategoryDef, type ShopInfo } from "@/components/website-listings-panel";
import { WheelSelect } from "@/components/wheel-select";
import { useViewPref } from "@/lib/use-view-pref";
import { ConfirmDialog } from "@/components/modal";
import { UnsavedGuardProvider, useUnsavedGuardHost } from "@/components/save-bar";

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
  type TabKey = "listings" | "categories" | "collections" | "newdrops" | "fieldmap" | "design" | "layout" | "pages" | "info" | "i18n" | "orders" | "coupons" | "members";
  const [tab, setTab] = useState<TabKey>("listings");
  // ⚠️ สลับแท็บตอนแท็บเดิมยังไม่บันทึก → ถามก่อน (เดิมของที่แก้หายเงียบ)
  const guard = useUnsavedGuardHost();
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);
  const goTab = (k: TabKey) => {
    if (k === tab) return;
    if (guard.anyDirty()) setPendingTab(k);
    else setTab(k);
  };
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  // ลิงก์จากที่อื่น (เช่น ป๊อปตรวจก่อนเผยแพร่ → "ไปแก้") เปิดแท็บที่ระบุ ?tab= · ⚠️ ไม่ใช้ useSearchParams (อยู่ใน PlaygroundShell)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    const ok = ["listings", "categories", "collections", "fieldmap", "design", "layout", "pages", "info", "i18n", "orders", "coupons", "members"] as const;
    if (t && (ok as readonly string[]).includes(t)) setTab(t as (typeof ok)[number]);
  }, []);

  const load = useCallback(
    async (slug?: string) => {
      setLoading((v) => v || !slug);
      try {
        const r = await apiFetch(`/api/website/listings?shop=${encodeURIComponent(slug ?? "")}`);
        const j = await r.json();
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
            {shop && <WebsiteOpenToggle shopSlug={shop.slug} shopId={shop.id} />}
            {shop?.siteUrl && (
              <a href={shop.siteUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                {shop.siteUrl.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500" title="ความกว้างของหน้านี้ (จำไว้ให้ครั้งหน้า)">
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
              { k: "fieldmap", l: "⚙️ จับคู่ฟิลด์" },
              { k: "design", l: "🎨 ดีไซน์" },
              { k: "layout", l: "🧱 หน้าแรก" },
              { k: "pages", l: "📄 หน้าเว็บ" },
              { k: "info", l: "🏪 ข้อมูลร้าน" },
              { k: "i18n", l: "🌐 แปลภาษา" },
              { k: "orders", l: "🧾 ออเดอร์" },
              { k: "coupons", l: "🎟️ คูปอง" },
              { k: "members", l: "👥 สมาชิก" },
            ] as const).map((t) => (
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
              </button>
            ))}
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

        {/* แท็บจับคู่ฟิลด์ */}
        {tab === "fieldmap" && shop && <WebsiteFieldMapPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บดีไซน์ (ธีม) */}
        {tab === "design" && shop && <WebsiteThemePanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บจัดหน้าแรก (บล็อก) */}
        {tab === "layout" && shop && <WebsiteLayoutPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บหน้าเว็บอื่น ๆ */}
        {tab === "pages" && shop && <WebsitePagesPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บข้อมูลร้าน (คำโปรย/ติดต่อ/ค่าส่ง/ช่องทางจ่าย) */}
        {tab === "info" && shop && <WebsiteInfoPanel shopSlug={shop.slug} shopId={shop.id} />}

        {/* แท็บออเดอร์จากเว็บ */}
        {/* 🌐 ศูนย์แปลภาษา — ทุกข้อความของร้านในตารางเดียว (หน้าเว็บ /en) */}
        {tab === "i18n" && shop && <WebsiteTranslationCenter shopSlug={shop.slug} />}
        {tab === "orders" && shop && <WebsiteOrdersPanel shopSlug={shop.slug} shopId={shop.id} />}
        {tab === "coupons" && shop && <WebsiteCouponsPanel shopSlug={shop.slug} shopId={shop.id} />}
        {tab === "members" && shop && <WebsiteMembersPanel shopSlug={shop.slug} />}
        </UnsavedGuardProvider>
      </div>
    </PlaygroundShell>
  );
}
