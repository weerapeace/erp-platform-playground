"use client";

/**
 * WebsiteThemePanel — แท็บ "🎨 ดีไซน์" ในหน้า /website/<slug>
 *
 * หมวด: สี · ตัวอักษร · โลโก้และแบรนด์ · Header · การ์ดสินค้า · รูปทรง · ประวัติ
 * ร่าง/เผยแพร่ · undo/redo (Ctrl+Z) · คืนค่ารายช่อง · ตรวจ contrast (WCAG) ·
 * พรีวิว = เว็บจริงใน iframe (?preview=1) ส่งธีมสดผ่าน postMessage
 *
 * ข้อมูล: /api/website/theme · /api/website/theme/versions · อัปโหลดรูปผ่าน /api/admin/upload (R2)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { contrastRatio, wcagLevel, WCAG_LABEL, suggestReadable, shades, darken } from "@/lib/color-utils";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ColorSwatchButton } from "@/components/color-swatch-manager";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { ListingPanel } from "@/components/website-listing-panel";
import type { ListingConfig } from "@/lib/website-listing";
import { FieldCreatorModal } from "@/components/field-creator";
import { newExtraBanner, extraBannerId, extraBannerSection, MAX_EXTRA_BANNERS, type ExtraBanner, type BannerPart, type ImagePlaceholder } from "@/lib/website-theme";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { PART_CHOICES, resolveMobileProduct, mobileOverrideCount, normalizeMobile, type ProductParts, type ProductMobile, type ProductFonts } from "@/lib/website-theme";
import { TEXT_ROLE_DEFS, defaultTextRole, googleFontsHref, themeFontNames, BUTTON_SHAPES, BUTTON_SIZES, SHADOW_LEVELS, RADIUS_PX_CHOICES, type Typography, type TextRole, type TextRoleKey, type Shape } from "@/lib/website-theme";
import { HEADER_EL_DEFS, MENU_KINDS, newMenuItem, menuItemHref, type HeaderEl, type HeaderZones, type MenuItem, type MenuConfig, type MenuKind } from "@/lib/website-theme";
import { FOOTER_COL_DEFS, FOOTER_BGS, PAYMENT_ICONS, newFooterColumn, type FooterConfig, type FooterColumn, type FooterColKind, type PaymentIcon } from "@/lib/website-theme";
import { BANNER_LAYOUTS, textPosFor, fixTextPos, type BannerLayout, type BannerTextPos } from "@/lib/website-banners";

/** 🔠 ขนาดตัวอักษรหน้าสินค้า — ตัวเลือก % */
const FONT_LABELS: { k: keyof ProductFonts; label: string; hint: string }[] = [
  { k: "title", label: "ชื่อรุ่น", hint: "หัวเรื่องใหญ่ + ชื่อรอง" },
  { k: "price", label: "ราคา", hint: "ตัวเลขราคา" },
  { k: "heading", label: "หัวข้อ", hint: "หัวข้อพับเก็บ/แท็บ · แบนเนอร์ · คุณอาจชอบ" },
  { k: "body", label: "เนื้อหา", hint: "คำอธิบาย · รายละเอียด · ข้อความแบนเนอร์" },
];
const FONT_SIZES = [70, 80, 90, 100, 110, 120, 130, 150];
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { SocialLinksModal } from "@/components/website-social-links";
import { FULL_THEME_PRESETS, applyFullPreset, type BaseColors } from "@/lib/website-theme-presets";
import { FINE_COLOR_DEFAULTS, SOFT_PCT_RANGE, tintPctOf, resolveOnBrand, ON_BRAND_DARK } from "@/lib/website-theme";
import { applySavedTheme } from "@/lib/website-saved-themes";
import { SavedThemesCard } from "@/components/website-saved-themes";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { CopyButton } from "@/components/copy-button";
import { ColorPicker, ColorInput } from "@/components/color-picker";
import { WheelSelect } from "@/components/wheel-select";
import { FontSelect } from "@/components/font-select";
import { webFontOptions, WEB_FONT_NAMES } from "@/components/website-text-pickers";
import { MegaMenuEditor, ShowWindowFields, type MegaEditorCtx } from "@/components/website-mega-menu-editor";
import { HeaderCartSettings, HeaderSearchSettings } from "@/components/website-header-els";
import { DEFAULT_HEADER_CART, DEFAULT_HEADER_SEARCH, type HeaderCart, type HeaderSearch } from "@/lib/website-header-els";
import { DEFAULT_MENU_BEHAVIOR, MENU_DELAYS, NAV_HOVERS, SUB_HOVERS, type MegaAutoData, type MenuBehavior } from "@/lib/website-mega-menu";
import { GRADIENT_ANGLES, PRODUCT_IMAGE_EFFECTS, PRODUCT_IMAGE_SIZES, BUY_ITEM_DEFS, DEFAULT_BUY_ITEMS, defaultBuyItem, type ProductImageBgKind, type ProductGradient, type ProductImageEffect, type ProductImageFit, type BuyItem, type PartBox, PART_WIDTH_OPTIONS, PART_SPACE_OPTIONS, partHasWidth } from "@/lib/website-theme";

type Radius = "sharp" | "soft" | "round";
type LogoMode = "icon-text" | "image" | "text" | "icon";
type HeaderBg = "surface" | "page" | "ink" | "brand" | "transparent";
type MenuAlign = "left" | "center" | "right";
type CardPreset = "flat" | "border" | "shadow" | "floating" | "minimal";
type ImageRatio = "1:1" | "4:3" | "4:5" | "3:4" | "16:9";
type CardHover = "none" | "lift" | "zoom" | "swap" | "lift-swap" | "slide";
type ProductLayout = "classic" | "showcase";
type ProductTitleStyle = "serif" | "display";
type ProductImageBg = "tint" | "surface" | "none";
/** ส่วนประกอบหน้าสินค้า (รวมแบนเนอร์เพิ่ม banner:<id>) — ใช้ type กลางจาก lib */
type ProductSection = import("@/lib/website-theme").ProductSection;
type ProductGalleryStyle = "editorial" | "spotlight";
type ProductDetailsStyle = "accordion" | "tabs" | "plain";
type ProductDetailsOpen = "first" | "closed" | "all";
type DetailSource = "description" | "fields" | "details" | "text" | "shipping" | "dimensions";
type DetailApply = "all" | "categories" | "products";
type DetailOpen = "auto" | "open" | "closed";
interface DetailItem { id: string; label: string; source: DetailSource; fields: string[]; text: string; applyTo: DetailApply; categories: string[]; products: string[]; enabled: boolean; defaultOpen: DetailOpen; showInch?: boolean; sizeCompare?: boolean }

interface SampleItem { name: string; price: number; comparePrice: number | null; unit: string; category: string; badge: string; stock: string; images: string[]; swatches: { color?: string; img?: string }[] }

interface Theme {
  colors: import("@/lib/website-theme").SiteTheme["colors"];
  fonts: { display: string; body: string };
  radius: Radius;
  typography: Typography;
  shape: Shape;
  logo: {
    mark: string;
    text: string;
    mode: LogoMode;
    imageKey: string | null;
    imageDarkKey: string | null;
    faviconKey: string | null;
    height: number;
    placeholder: ImagePlaceholder;
  };
  header: { height: number; sticky: boolean; bg: HeaderBg; menuAlign: MenuAlign; showCart: boolean; border: boolean; bgKind: "preset" | "custom"; bgColor: string; textColor: string; zones: HeaderZones; overHero: boolean; hideOnScroll: boolean; mobileMenuSide: "left" | "right" | "top"; button: { text: string; href: string }; cart: HeaderCart; search: HeaderSearch };
  menu: MenuConfig;
  footer: FooterConfig;
  listing: ListingConfig;
  /** ✨ การเคลื่อนไหวทั้งเว็บ (lib/website-theme SiteTheme.page) */
  page: { transition: "none" | "fade" | "rise"; smoothScroll: boolean };
  card: import("@/lib/website-theme").SiteTheme["card"];
  product: { layout: ProductLayout; titleStyle: ProductTitleStyle; imageBg: ProductImageBg; imageBgKey: string | null; imageBgKind: ProductImageBgKind; imageBgColor: string; imageBgGradient: ProductGradient; imageEffect: ProductImageEffect; imageFit: ProductImageFit; imageSize: number; showTabs: boolean; galleryStyle: ProductGalleryStyle; detailsStyle: ProductDetailsStyle; detailsOpen: ProductDetailsOpen; detailItems: DetailItem[]; sections: ProductSection[]; hidden: ProductSection[]; parts: ProductParts; partBox: Record<string, PartBox>; mobile: ProductMobile; fonts: ProductFonts };
}

interface Choices {
  fonts: string[];
  radius: { value: Radius; label: string }[];
  logoModes: { value: LogoMode; label: string }[];
  headerBg: { value: HeaderBg; label: string }[];
  menuAligns: { value: MenuAlign; label: string }[];
  cardPresets: { value: CardPreset; label: string; hint: string }[];
  imageRatios: { value: ImageRatio; label: string }[];
  cardHovers: { value: CardHover; label: string }[];
  productLayouts?: { value: ProductLayout; label: string; hint: string }[];
  productTitleStyles?: { value: ProductTitleStyle; label: string }[];
  productImageBgs?: { value: ProductImageBg; label: string }[];
  productSections?: { value: ProductSection; label: string; hint: string; hideable: boolean }[];
  productGalleryStyles?: { value: ProductGalleryStyle; label: string; hint: string }[];
  productDetailsStyles?: { value: ProductDetailsStyle; label: string }[];
  productDetailsOpen?: { value: ProductDetailsOpen; label: string }[];
  detailSources?: { value: DetailSource; label: string; hint: string }[];
  specFields?: { key: string; label: string; group?: string }[];
  fieldGroups?: Record<string, string>;
  /** ฟิลด์รูปของ Parent SKU (แบนเนอร์ source = field) */
  imageFields?: { key: string; label: string }[];
  categories?: { key: string; label: string }[];
  products?: { code: string; name: string }[];
}

/** ช่องสีที่เป็นสี (ไม่รวมความเข้มสีอ่อน softPct ที่เป็นตัวเลข) */
type ColorKey = Exclude<keyof Theme["colors"], "softPct">;
/** สีละเอียด (lib/website-theme FINE_COLOR_DEFAULTS) — ไว้นับ "แก้แล้ว" */
const FINE_COLOR_KEYS = Object.keys(FINE_COLOR_DEFAULTS) as (keyof typeof FINE_COLOR_DEFAULTS)[];
const FINE_COLOR_LABEL = "สีละเอียด";
/** บทบาทตัวอักษร — ธีมเก่าที่ยังไม่มีบทบาทใหม่ (เช่น เมนูย่อย) = ค่าเริ่มต้น */
const roleOf = (t: { typography: Partial<Typography> }, k: TextRoleKey): TextRole => t.typography[k] ?? defaultTextRole(k);
type TabKey = "colors" | "fonts" | "logo" | "header" | "menu" | "footer" | "card" | "listing" | "product" | "shape" | "history";
type Device = "desktop" | "tablet" | "mobile";

const TABS: { k: TabKey; label: string }[] = [
  { k: "colors", label: "สี" },
  { k: "fonts", label: "ตัวอักษร" },
  { k: "logo", label: "โลโก้" },
  { k: "header", label: "Header" },
  { k: "menu", label: "เมนู" },
  { k: "footer", label: "Footer" },
  { k: "card", label: "การ์ดสินค้า" },
  { k: "listing", label: "หน้ารายการสินค้า" },
  { k: "product", label: "หน้าสินค้า" },
  { k: "shape", label: "รูปทรง" },
  { k: "history", label: "ประวัติ" },
];

const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: "brand", label: "สีหลักแบรนด์", hint: "ปุ่มหลัก ราคา ลิงก์สำคัญ" },
  { key: "brandDeep", label: "สีหลักเข้ม", hint: "ตอนชี้เมาส์ปุ่ม" },
  { key: "ink", label: "สีตัวอักษรหลัก", hint: "หัวข้อและเนื้อหา" },
  { key: "muted", label: "สีตัวอักษรรอง", hint: "คำอธิบายจาง ๆ" },
  { key: "page", label: "สีพื้นหลังเว็บ", hint: "พื้นหลังทั้งหน้า" },
  { key: "surface", label: "สีพื้นการ์ด", hint: "กล่อง/การ์ดสินค้า" },
];

const DEVICES: { k: Device; label: string; w: number; h: number; icon: string }[] = [
  { k: "desktop", label: "คอมพิวเตอร์", w: 1440, h: 900, icon: "🖥️" },
  { k: "tablet", label: "แท็บเล็ต", w: 768, h: 1024, icon: "📱" },
  { k: "mobile", label: "มือถือ", w: 390, h: 844, icon: "📲" },
];

/** ระดับการย่อพรีวิว — "fit" = ย่อให้พอดีกล่อง (เหมือนแท็บจัดหน้าแรก) */
type Zoom = "fit" | 0.5 | 0.75 | 1;

/** แท็บ → หน้าที่พรีวิว ("product" = สินค้าตัวอย่างของร้าน) · ไม่อยู่ในรายการ = อยู่หน้าเดิม */
const TAB_PREVIEW_PAGE: Partial<Record<TabKey, string>> = { card: "/shop", listing: "/shop", product: "product" };

const PAGES = [
  { path: "/", label: "หน้าแรก" },
  { path: "/shop", label: "สินค้าทั้งหมด (ร้านค้า)" },
  { path: "/oem", label: "รับผลิต" },
  { path: "/quote", label: "ขอใบเสนอราคา" },
  { path: "/contact", label: "ติดต่อ" },
];

const PRESETS: { name: string; theme: { colors: BaseColors; fonts: Theme["fonts"]; radius: Radius } }[] = [
  {
    name: "IG ส้มคลาสสิก",
    theme: {
      colors: { brand: "#E2540F", brandDeep: "#B8420A", ink: "#141517", page: "#FAFAF9", surface: "#FFFFFF", muted: "#9BA1A9" },
      fonts: { display: "Kanit", body: "Noto Sans Thai" },
      radius: "soft",
    },
  },
  {
    name: "ดำอุตสาหกรรม",
    theme: {
      colors: { brand: "#F59E0B", brandDeep: "#B45309", ink: "#0B0C0E", page: "#F4F4F5", surface: "#FFFFFF", muted: "#8B8F96" },
      fonts: { display: "Prompt", body: "Sarabun" },
      radius: "sharp",
    },
  },
  {
    name: "ขาวมินิมอล",
    theme: {
      colors: { brand: "#111827", brandDeep: "#000000", ink: "#111827", page: "#FFFFFF", surface: "#FAFAFA", muted: "#9CA3AF" },
      fonts: { display: "IBM Plex Sans Thai", body: "IBM Plex Sans Thai" },
      radius: "sharp",
    },
  },
  {
    name: "น้ำเงินหรู",
    theme: {
      colors: { brand: "#1E3A5F", brandDeep: "#132639", ink: "#0F172A", page: "#F8FAFC", surface: "#FFFFFF", muted: "#94A3B8" },
      fonts: { display: "Kanit", body: "Sarabun" },
      radius: "soft",
    },
  },
  {
    name: "เบจอบอุ่น",
    theme: {
      colors: { brand: "#A87C4F", brandDeep: "#7A5734", ink: "#2E2A26", page: "#FBF8F4", surface: "#FFFFFF", muted: "#A9A096" },
      fonts: { display: "Prompt", body: "Noto Sans Thai" },
      radius: "round",
    },
  },
];

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const cardCls = "rounded-xl border border-slate-200 bg-white p-4";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

export function WebsiteThemePanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [theme, setTheme] = useState<Theme | null>(null);
  const [published, setPublished] = useState<Theme | null>(null);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [lastVersion, setLastVersion] = useState<{ version_no: number; created_at: string } | null>(null);
  const [hadDraft, setHadDraft] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [tab, setTab] = useState<TabKey>("colors");
  const [device, setDevice] = useState<Device>("desktop");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [page, setPage] = useState("/");
  /** สินค้าตัวแรกบนเว็บร้านนี้ — ไว้เปิดพรีวิว "หน้าสินค้า (ตัวอย่าง)" */
  const [sampleProduct, setSampleProduct] = useState<string | null>(null);
  // สินค้าตัวอย่างสำหรับการ์ดจำลองในแท็บการ์ดสินค้า
  const [sampleItems, setSampleItems] = useState<SampleItem[]>([]);
  const [liveProducts, setLiveProducts] = useState<(MegaEditorCtx["liveProducts"][number] & { collection?: string | null })[]>([]);
  // 🧭 หมวด(+รูป)/คอลเลกชัน/โทนสี ของร้าน (API สาธารณะชุดเดียวกับเว็บร้าน) — รายการอัตโนมัติในแผงเมนู
  const [shopLists, setShopLists] = useState<{ categories: { key: string; label: string; imageKey: string | null }[]; collections: { id: string; slug: string; label: string; imageKey: string | null }[]; tones: { key: string; name: string; hex: string }[] } | null>(null);
  useEffect(() => {
    fetch(`/api/public/storefront/site?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        setShopLists({
          categories: arr(j?.categories).map((c) => ({ key: str(c.key), label: str(c.label), imageKey: str(c.imageKey) || null })).filter((c) => c.key),
          collections: arr(j?.collections).map((c) => ({ id: str(c.id), slug: str(c.slug), label: str(c.title) || str(c.name), imageKey: str(c.bannerKey) || null })).filter((c) => c.slug),
          tones: arr(j?.colorTones).map((t) => ({ key: str(t.key), name: str(t.name), hex: str(t.hex) || "#888888" })).filter((t) => t.key),
        });
      })
      .catch(() => setShopLists(null));
  }, [shopSlug]);
  // หน้าที่สร้างเอง (ไว้ให้เมนูลิงก์ถึง)
  const [storePages, setStorePages] = useState<{ slug: string; title: string }[]>([]);
  useEffect(() => {
    fetch(`/api/public/storefront/page?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => setStorePages((j?.pages as { slug: string; title: string }[]) ?? []))
      .catch(() => setStorePages([]));
  }, [shopSlug]);
  const [versions, setVersions] = useState<{ versionNo: number; createdAt: string; theme: Theme }[]>([]);

  const undoStack = useRef<Theme[]>([]);
  const redoStack = useRef<Theme[]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** ป๊อปตั้งค่าชิ้นส่วนหัวเว็บที่เปิดอยู่ (กดชื่อชิ้นที่มี ⚙ ใน ZonesEditor) */
  const [zoneCfg, setZoneCfg] = useState<HeaderEl | null>(null);
  /** ตัวเลือกลิงก์ปลายทาง (ของกลาง) ในหน้าดีไซน์: ปุ่มหัวเว็บ · รูปแทรกในกริด */
  const linkCtx = useMemo(() => ({ shopSlug, shopId, categories: choices?.categories ?? [] }), [shopSlug, shopId, choices]);
  /** 🧭 ตัวจัดแผงเมนูใหญ่ (components/website-mega-menu-editor) */
  const megaAuto = useMemo<MegaAutoData | null>(() => {
    if (!shopLists) return null;
    const inCat = (k: string) => liveProducts.filter((p) => p.category === k || (p.categories ?? []).includes(k)).length;
    return {
      categories: shopLists.categories.map((c) => ({ ...c, count: inCat(c.key) })),
      collections: shopLists.collections.map((c) => ({ ...c, count: liveProducts.filter((p) => p.collection === c.id).length })),
      tones: shopLists.tones,
    };
  }, [shopLists, liveProducts]);
  const megaCtx = useMemo<MegaEditorCtx>(
    () => ({ link: linkCtx, categories: choices?.categories ?? [], products: choices?.products ?? [], shopId, pages: storePages, liveProducts, autoData: megaAuto }),
    [linkCtx, choices, shopId, storePages, liveProducts, megaAuto]
  );
  // 👁 แก้แผงเมนูอยู่ → สั่งพรีวิวเปิดแผงของเมนูนั้นค้างไว้ (ส่งซ้ำตอนพรีวิวโหลดหน้าใหม่)
  const menuPin = useRef<string | null>(null);
  useEffect(() => {
    const onPin = (e: Event) => {
      menuPin.current = ((e as CustomEvent).detail as string | null) ?? null;
      iframeRef.current?.contentWindow?.postMessage({ type: "storefront-menu-pin", id: menuPin.current }, "*");
    };
    window.addEventListener("website-menu-pin", onPin);
    return () => window.removeEventListener("website-menu-pin", onPin);
  }, []);
  // วัดกล่องพรีวิวจริง เพื่อย่อ "พอดีจอ" (เดิม hardcode 400px → จอคอมถูกบีบเหลือ ~28%)
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(420);
  const [boxH, setBoxH] = useState(600);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/theme?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setTheme(j.draft ?? j.published);
      setPublished(j.published);
      setSiteUrl(j.shop?.siteUrl ?? null);
      setChoices(j.choices ?? null);
      setLastVersion(j.lastVersion ?? null);
      setHadDraft(Boolean(j.hasDraft));
      undoStack.current = [];
      redoStack.current = [];
    } catch {
      toast.error("โหลดธีมไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // หา slug สินค้าตัวแรกของร้าน (API สาธารณะตัวเดียวกับที่เว็บร้านใช้) → เปิดพรีวิวหน้าสินค้าได้
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/storefront/products?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        const list = (j?.products as Record<string, unknown>[] | undefined) ?? [];
        const slug = (list.find((x) => x.slug) as { slug?: string } | undefined)?.slug ?? null;
        if (alive) setSampleProduct(slug);
        // 🧭 แผงเมนู: พรีวิว "จะโชว์กี่ชิ้น" + นับสินค้าต่อหมวด/คอลเลกชัน
        if (alive)
          setLiveProducts(
            list
              .filter((x) => typeof x.code === "string")
              .map((x) => ({
                code: String(x.code),
                name: String(x.name ?? ""),
                category: typeof x.category === "string" ? x.category : undefined,
                categories: Array.isArray(x.categories) ? (x.categories as string[]) : undefined,
                collection: typeof x.collection === "string" ? x.collection : null,
                listedAt: typeof x.listedAt === "string" ? x.listedAt : null,
                salesRank: typeof x.salesRank === "number" ? x.salesRank : null,
                price: Number(x.price) || 0,
                comparePrice: typeof x.comparePrice === "number" ? x.comparePrice : null,
              }))
          );
        // การ์ดจำลอง 3 ใบ — ตัวที่มีรูป ≥ 2 มาก่อน (จะได้เห็นเอฟเฟกต์สลับรูป)
        const multi = list.filter((x) => Array.isArray(x.images) && (x.images as unknown[]).length > 1);
        const picks = [...multi, ...list.filter((x) => !multi.includes(x))].slice(0, 3);
        if (alive) {
          setSampleItems(
            picks.map((pick) => {
              const opts = (pick.options as { items?: { label: string; swatch?: string | null; image?: string | null; images?: string[] | null }[] } | null)?.items ?? [];
              return {
                name: String(pick.name ?? ""),
                price: Number(pick.price) || 0,
                comparePrice: typeof pick.comparePrice === "number" ? pick.comparePrice : null,
                unit: String(pick.unit ?? "ชิ้น"),
                category: String(pick.category ?? ""),
                badge: String(pick.badge ?? ""),
                stock: String(pick.stock ?? "in"),
                images: (pick.images as string[]) ?? [],
                swatches: opts.map((o) => (o.swatch ? { color: o.swatch } : { img: o.image || o.images?.[0] || "" })).filter((x) => x.color || x.img),
              };
            })
          );
        }
      })
      .catch(() => {
        /* ไม่มีสินค้า = ไม่มีตัวเลือกนี้ */
      });
    return () => {
      alive = false;
    };
  }, [shopSlug]);

  // โหลดฟอนต์ Google ที่ธีมใช้ เพื่อให้ "ตัวอย่าง" ในแผงแสดงฟอนต์จริง
  useEffect(() => {
    if (!theme) return;
    const href = googleFontsHref(themeFontNames(theme));
    let el = document.getElementById("zz-gfonts") as HTMLLinkElement | null;
    if (!href) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("link");
      el.id = "zz-gfonts";
      el.rel = "stylesheet";
      document.head.appendChild(el);
    }
    if (el.getAttribute("href") !== href) el.setAttribute("href", href);
  }, [theme]);

  // กดแท็บ → พรีวิวไปหน้าที่แท็บนั้นแก้ทันที (การ์ด/หน้ารายการ = ร้านค้า · หน้าสินค้า = สินค้าตัวอย่าง)
  // แท็บที่มีผลทุกหน้า (สี/ตัวอักษร/โลโก้/Header/เมนู/Footer/รูปทรง) = อยู่หน้าเดิม
  // ถ้าในพรีวิวกดลิงก์ไปหน้าอื่นมาแล้ว (state ยังเป็น path เดิม) → สั่ง iframe ไปใหม่ตรง ๆ
  useEffect(() => {
    const path = TAB_PREVIEW_PAGE[tab] === "product" ? (sampleProduct ? `/product/${sampleProduct}` : null) : TAB_PREVIEW_PAGE[tab] ?? null;
    if (!path) return;
    if (page !== path) setPage(path);
    else if (siteUrl && iframeRef.current) iframeRef.current.src = `${siteUrl}${path}?preview=1`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sampleProduct]);

  // วัดขนาดกล่องพรีวิวเพื่อคำนวณ "พอดีจอ" (แบบเดียวกับแท็บ 🧱 จัดหน้าแรก)
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const read = () => {
      setBoxW(el.clientWidth);
      setBoxH(el.clientHeight);
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, [loading]);

  const apply = useCallback((next: Theme) => {
    setTheme((prev) => {
      if (prev) {
        undoStack.current = [...undoStack.current.slice(-49), prev];
        redoStack.current = [];
      }
      return next;
    });
    tick((n) => n + 1);
  }, []);

  const setColor = (k: ColorKey, v: string) => theme && apply({ ...theme, colors: { ...theme.colors, [k]: v } });
  const setLogo = (p: Partial<Theme["logo"]>) => theme && apply({ ...theme, logo: { ...theme.logo, ...p } });
  const setHeader = (p: Partial<Theme["header"]>) => theme && apply({ ...theme, header: { ...theme.header, ...p } });
  const setMenu = (p: Partial<MenuConfig>) => theme && apply({ ...theme, menu: { ...theme.menu, ...p } });
  const setFooter = (p: Partial<FooterConfig>) => theme && apply({ ...theme, footer: { ...theme.footer, ...p } });
  const setCard = (p: Partial<Theme["card"]>) => theme && apply({ ...theme, card: { ...theme.card, ...p } });
  const setShape = (patch: Partial<Shape>) => theme && apply({ ...theme, shape: { ...theme.shape, ...patch } });
  const setProduct = (p: Partial<Theme["product"]>) => theme && apply({ ...theme, product: { ...theme.product, ...p } });
  // 🖥/📱 กำลังตั้งค่าให้จอไหน — มือถือ = เขียนลง product.mobile (ค่าที่ไม่ตั้ง = ตามคอม)
  const [editDevice, setEditDevice] = useState<"pc" | "mobile">("pc");
  const setMobile = (p: Partial<ProductMobile>) => theme && setProduct({ mobile: { ...theme.product.mobile, ...p } });
  const viewProduct = (t: Theme) => (editDevice === "mobile" ? resolveMobileProduct(t.product) : t.product);
  const setSections = (sections: ProductSection[]) => (editDevice === "mobile" ? setMobile({ sections }) : setProduct({ sections }));
  const setHidden = (hidden: ProductSection[]) => (editDevice === "mobile" ? setMobile({ hidden }) : setProduct({ hidden }));
  const sectionDrag = useDragReorder((from, to) => theme && setSections(moveItem(viewProduct(theme).sections, from, to)));
  // ⚙️ ตั้งค่าต่อส่วนประกอบ (จับคู่ข้อมูล) — เปิดได้ทีละส่วน
  const [openPart, setOpenPart] = useState<ProductSection | null>(null);
  // ➕ แบนเนอร์เพิ่ม — ตั้งค่าที่โหมดคอม (มือถือใช้ร่วม) · อยู่ในลำดับเป็น banner:<id>
  const [delExtra, setDelExtra] = useState<ExtraBanner | null>(null);
  const [imgFieldCreator, setImgFieldCreator] = useState(false);
  const afterBanner = (secs: ProductSection[], sec: ProductSection) => {
    const out = [...secs];
    const last = out.reduce((acc, k, i) => (k === "banner" || k.startsWith("banner:") ? i : acc), -1);
    out.splice(last + 1, 0, sec);
    return out;
  };
  const addExtraBanner = () => {
    if (!theme) return;
    const xs = theme.product.parts.extraBanners;
    if (xs.length >= MAX_EXTRA_BANNERS) return;
    const nb = newExtraBanner(xs.length + 2);
    const sec = extraBannerSection(nb.id) as ProductSection;
    const m = theme.product.mobile;
    setProduct({
      parts: { ...theme.product.parts, extraBanners: [...xs, nb] },
      sections: afterBanner(theme.product.sections, sec),
      mobile: m.sections ? { ...m, sections: afterBanner(m.sections, sec) } : m,
    });
    setOpenPart(sec);
  };
  const setExtraBanner = (id: string, patch: Partial<ExtraBanner>) =>
    theme && setProduct({ parts: { ...theme.product.parts, extraBanners: theme.product.parts.extraBanners.map((x) => (x.id === id ? { ...x, ...patch } : x)) } });
  const removeExtraBanner = (id: string) => {
    if (!theme) return;
    const sec = extraBannerSection(id);
    const m = theme.product.mobile;
    const drop = (arr: ProductSection[] | null) => (arr ? arr.filter((k) => k !== sec) : arr);
    setProduct({
      parts: { ...theme.product.parts, extraBanners: theme.product.parts.extraBanners.filter((x) => x.id !== id) },
      sections: drop(theme.product.sections) as ProductSection[],
      hidden: drop(theme.product.hidden) as ProductSection[],
      mobile: { ...m, sections: drop(m.sections), hidden: drop(m.hidden) },
    });
    if (openPart === sec) setOpenPart(null);
  };
  /** สร้างฟิลด์รูปใหม่ใน Parent SKU แล้ว → โหลดรายการฟิลด์รูปใหม่ (ไม่แตะธีมที่กำลังแก้) */
  const reloadImageFields = async () => {
    try {
      const j = await apiFetch(`/api/website/theme?shop=${encodeURIComponent(shopSlug)}&freshFields=1`).then((r) => r.json());
      setChoices((c) => (c ? { ...c, imageFields: j.choices?.imageFields ?? c.imageFields } : c));
    } catch {
      /* ไม่เป็นไร — เปิดหน้าใหม่ก็เห็น */
    }
  };
  const setPart = <K extends keyof ProductParts>(k: K, p: Partial<ProductParts[K]>) => {
    if (!theme) return;
    // มือถือ: ทุกส่วนตั้งแยกได้ — ราคา-ตะกร้าเก็บทั้งชุด (buyItems/buyColumns) · ส่วนอื่นเก็บเฉพาะช่องที่ตั้ง
    if (editDevice === "mobile") {
      if (k === "buy") {
        const pb = p as Partial<ProductParts["buy"]>;
        const patch: Partial<ProductMobile> = {};
        if (pb.items !== undefined) patch.buyItems = pb.items;
        if (pb.columns !== undefined) patch.buyColumns = pb.columns;
        const legacy: Record<string, unknown> = {};
        for (const key of ["showUnit", "showBadge", "showStock", "showShortDesc", "noteSource", "noteText"] as const) if (pb[key] !== undefined) legacy[key] = pb[key];
        if (Object.keys(legacy).length) patch.buy = { ...theme.product.mobile.buy, ...legacy };
        setMobile(patch);
        return;
      }
      const mk = k as "gallery" | "banner" | "related";
      setMobile({ [mk]: { ...(theme.product.mobile[mk] as Record<string, unknown>), ...p } } as Partial<ProductMobile>);
      return;
    }
    setProduct({ parts: { ...theme.product.parts, [k]: { ...theme.product.parts[k], ...p } } });
  };
  const detailDrag = useDragReorder((from, to) => theme && setProduct({ detailItems: moveItem(theme.product.detailItems, from, to) }));
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  // ป๊อปอัปเลือกฟิลด์ Parent SKU ให้หัวข้อไหน (id ของหัวข้อ) + คำค้น
  const [prodQuery, setProdQuery] = useState("");
  const setDetailItem = (id: string, patch: Partial<DetailItem>) =>
    theme && setProduct({ detailItems: theme.product.detailItems.map((it) => (it.id === id ? { ...it, ...patch } : it)) });

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setTheme((cur) => {
      if (cur) redoStack.current = [...redoStack.current, cur];
      return prev;
    });
    tick((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setTheme((cur) => {
      if (cur) undoStack.current = [...undoStack.current, cur];
      return next;
    });
    tick((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ส่งธีมเข้า iframe แบบสด
  useEffect(() => {
    if (!theme) return;
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({ type: "storefront-theme-preview", theme }, "*");
    }, 120);
    return () => clearTimeout(t);
  }, [theme]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "storefront-preview-ready" && menuPin.current) {
        iframeRef.current?.contentWindow?.postMessage({ type: "storefront-menu-pin", id: menuPin.current }, "*");
      }
      if ((e.data as { type?: string })?.type === "storefront-preview-ready" && theme) {
        iframeRef.current?.contentWindow?.postMessage({ type: "storefront-theme-preview", theme }, "*");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [theme]);

  const dirtyFields = useMemo(() => {
    if (!theme || !published) return [] as string[];
    const out: string[] = [];
    for (const f of COLOR_FIELDS) if (theme.colors[f.key] !== published.colors[f.key]) out.push(f.label);
    if (FINE_COLOR_KEYS.some((k) => theme.colors[k] !== published.colors[k])) out.push(FINE_COLOR_LABEL);
    if (theme.fonts.display !== published.fonts.display) out.push("ฟอนต์หัวข้อ");
    if (theme.fonts.body !== published.fonts.body) out.push("ฟอนต์เนื้อหา");
    if (theme.radius !== published.radius) out.push("ความมนขอบ");
    if (!eq(theme.typography, published.typography)) out.push("ตัวอักษร");
    if (!eq(theme.shape, published.shape)) out.push("รูปทรง");
    {
      const { placeholder: ph, ...lg } = theme.logo;
      const { placeholder: php, ...lgp } = published.logo;
      if (!eq(lg, lgp)) out.push("โลโก้");
      if (!eq(ph, php)) out.push("รอรูปโหลด");
    }
    if (!eq(theme.header, published.header)) out.push("Header");
    if (!eq(theme.menu, published.menu)) out.push("เมนู");
    if (!eq(theme.footer, published.footer)) out.push("Footer");
    if (!eq(theme.listing, published.listing)) out.push("หน้ารายการสินค้า");
    if (!eq(theme.card, published.card)) out.push("การ์ดสินค้า");
    // หน้าสินค้า (Style/ชุดรายละเอียด/⚙️/ขนาดตัวอักษร/ค่ามือถือ) — เดิมไม่ถูกนับ ทำให้แถบล่างบอก "ไม่มีการเปลี่ยนแปลง" ทั้งที่แก้แล้ว
    if (!eq(theme.product, published.product)) out.push("หน้าสินค้า");
    return out;
  }, [theme, published]);

  const isDirty = dirtyFields.length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  const save = async (mode: "draft" | "publish") => {
    if (!theme) return;
    if (mode === "publish" && !confirm("ยืนยันเผยแพร่ธีมนี้ไปยังเว็บไซต์จริง?\nผู้เข้าชมจะเห็นการเปลี่ยนแปลงภายในประมาณ 1 นาที")) return;
    setBusy(mode);
    try {
      const r = await apiFetch("/api/website/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, theme, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      if (mode === "publish") {
        setPublished(j.theme);
        setHadDraft(false);
        setLastVersion({ version_no: j.version, created_at: new Date().toISOString() });
        toast.success(`เผยแพร่แล้ว (เวอร์ชัน ${j.version}) — เว็บจะอัปเดตภายใน ~1 นาที`);
      } else {
        setHadDraft(true);
        toast.success("บันทึกร่างแล้ว — เว็บไซต์จริงยังไม่เปลี่ยน");
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!confirm("ละทิ้งการเปลี่ยนแปลงทั้งหมด กลับไปใช้ธีมที่เผยแพร่อยู่?")) return;
    try {
      await apiFetch(`/api/website/theme?shopId=${encodeURIComponent(shopId)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    await load();
    toast.info("ละทิ้งการเปลี่ยนแปลงแล้ว");
  };

  const loadVersions = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/website/theme/versions?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      setVersions(j.versions ?? []);
    } catch {
      toast.error("โหลดประวัติไม่สำเร็จ");
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    if (tab === "history") void loadVersions();
  }, [tab, loadVersions]);

  const restore = async (versionNo: number) => {
    if (!confirm(`ดึงเวอร์ชัน ${versionNo} กลับมาเป็นร่าง?\n(ยังไม่เปลี่ยนเว็บจริงจนกว่าจะกดเผยแพร่)`)) return;
    try {
      const r = await apiFetch("/api/website/theme/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, versionNo }),
      });
      const j = await r.json();
      if (j.ok) {
        apply(j.theme);
        setHadDraft(true);
        setTab("colors");
        toast.success(`กู้คืนเวอร์ชัน ${versionNo} เป็นร่างแล้ว`);
      } else toast.error(j.error ?? "กู้คืนไม่สำเร็จ");
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (!theme || !published || !choices) return <div className="py-16 text-center text-sm text-slate-400">โหลดธีมไม่สำเร็จ</div>;
  // ค่าที่กำลังแก้ (คอม = ค่าหลัก · มือถือ = ค่าหลัก + ที่ตั้งแยก)
  const pv = viewProduct(theme);
  const mob = theme.product.mobile;
  const isMobileEdit = editDevice === "mobile";
  // ขนาดรูปในกรอบ: "cover" = เต็มกรอบ (ตัดรูป) · ตัวเลข = เห็นรูปครบทั้งใบ (% ของกรอบ) · "__pc" = มือถือตามคอม
  // ใช้ร่วม 2 ที่: ช่องในแท็บหน้าสินค้า + ⚙️ ชื่อรุ่น + รูปใหญ่
  // "auto" = อัตโนมัติตามรูป (รูปสัดส่วนใกล้กรอบเต็มกรอบ · ที่เหลือย่อพอดีตาม %)
  const fitOf = (fit: ProductImageFit, size: number) => (fit === "cover" || fit === "auto" ? fit : String(size));
  const imageFitValue = isMobileEdit
    ? !mob.imageFit && !mob.imageSize ? "__pc" : fitOf(mob.imageFit ?? theme.product.imageFit, mob.imageSize ?? theme.product.imageSize)
    : fitOf(theme.product.imageFit, theme.product.imageSize);
  const setImageFitValue = (v: string) => {
    if (isMobileEdit) {
      if (v === "__pc") setMobile({ imageFit: null, imageSize: null });
      else if (v === "cover" || v === "auto") setMobile({ imageFit: v });
      else setMobile({ imageFit: "contain", imageSize: Number(v) });
    } else if (v === "cover" || v === "auto") setProduct({ imageFit: v });
    else setProduct({ imageFit: "contain", imageSize: Number(v) });
  };
  const fitLabel = (fit: ProductImageFit, size: number) => (fit === "cover" ? "เต็มกรอบ" : fit === "auto" ? "อัตโนมัติตามรูป" : `${size}%`);
  const mobCount = mobileOverrideCount(mob);

  const dev = DEVICES.find((d) => d.k === device)!;
  const previewSrc = siteUrl ? `${siteUrl}${page}?preview=1` : null;
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.1, (boxW - 16) / dev.w)) : zoom;
  // สูงพอให้เนื้อเว็บเต็มกล่องหลังย่อแล้ว (ไม่งั้นเหลือที่ว่างข้างล่าง)
  const frameH = Math.max(dev.h, Math.round((boxH - 16) / scale));

  // 🔎 ตรวจความอ่านง่าย — ทุกคู่สีที่ลูกค้าเห็นจริง · fix = ช่องที่จะเปลี่ยนเมื่อกด "ใช้ #xxx"
  const tc = theme.colors;
  const onBrand = resolveOnBrand(tc);
  const checks = (
    [
      { label: "ตัวอักษรบนพื้นหลังเว็บ", fg: tc.ink, bg: tc.page, fix: (v: string) => setColor("ink", v) },
      { label: "ตัวอักษรรองบนพื้นการ์ด", fg: tc.muted, bg: tc.surface, fix: (v: string) => setColor("muted", v) },
      { label: "ตัวอักษรบนปุ่มสีหลัก", fg: onBrand, bg: tc.brand, fix: (v: string) => setColor("onBrand", v) },
      { label: "สีแบรนด์บนพื้นหลังเว็บ", fg: tc.brand, bg: tc.page, fix: (v: string) => setColor("brand", v) },
      tc.link ? { label: "ลิงก์บนพื้นหลังเว็บ", fg: tc.link, bg: tc.page, fix: (v: string) => setColor("link", v) } : null,
      tc.price ? { label: "ราคาบนพื้นการ์ด", fg: tc.price, bg: tc.surface, fix: (v: string) => setColor("price", v) } : null,
      tc.sale ? { label: "ราคาลดบนพื้นการ์ด", fg: tc.sale, bg: tc.surface, fix: (v: string) => setColor("sale", v) } : null,
      { label: "“พร้อมส่ง” บนพื้นการ์ด", fg: tc.stockIn, bg: tc.surface, fix: (v: string) => setColor("stockIn", v) },
      { label: "“เหลือน้อย” บนพื้นการ์ด", fg: tc.stockLow, bg: tc.surface, fix: (v: string) => setColor("stockLow", v) },
      { label: "ตัวอักษรขาวบนป้ายลดราคา", fg: "#FFFFFF", bg: theme.card.autoBadges.saleColor, fix: null },
    ].filter((c): c is { label: string; fg: string; bg: string; fix: ((v: string) => void) | null } => !!c)
  ).map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    const level = wcagLevel(ratio);
    return { ...c, ratio, level, suggest: level === "fail" ? suggestReadable(c.fg, c.bg) : null };
  });
  const failCount = checks.filter((c) => c.level === "fail").length;

  // ✏️ ตัวแก้ 1 บทบาทตัวอักษร — ใช้ร่วม แท็บตัวอักษร + แท็บเมนู (เมนูด้านบน/เมนูย่อย) → แก้ที่ไหนก็ค่าเดียวกัน
  const roleEditor = (d: (typeof TEXT_ROLE_DEFS)[number]) => (
    <TextRoleEditor
      key={d.key}
      def={d}
      value={roleOf(theme, d.key)}
      pub={roleOf(published, d.key)}
      theme={theme}
      onChange={(patch) => apply({ ...theme, typography: { ...theme.typography, [d.key]: { ...roleOf(theme, d.key), ...patch } } })}
      onReset={() => apply({ ...theme, typography: { ...theme.typography, [d.key]: { ...roleOf(published, d.key) } } })}
    />
  );

  const ResetBtn = ({ onClick, show }: { onClick: () => void; show: boolean }) =>
    show ? (
      <button onClick={onClick} title="คืนค่าที่เผยแพร่อยู่" className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-400 text-xs">
        ↺
      </button>
    ) : null;

  const tabDirty = (k: TabKey) =>
    (k === "colors" && dirtyFields.some((d) => d === FINE_COLOR_LABEL || COLOR_FIELDS.some((c) => c.label === d))) ||
    (k === "fonts" && dirtyFields.some((d) => d.startsWith("ฟอนต์") || d === "ตัวอักษร")) ||
    (k === "logo" && dirtyFields.includes("โลโก้")) ||
    (k === "header" && dirtyFields.includes("Header")) ||
    (k === "menu" && dirtyFields.includes("เมนู")) ||
    (k === "footer" && dirtyFields.includes("Footer")) ||
    (k === "card" && (dirtyFields.includes("การ์ดสินค้า") || dirtyFields.includes("รอรูปโหลด"))) ||
    (k === "listing" && dirtyFields.includes("หน้ารายการสินค้า")) ||
    (k === "shape" && (dirtyFields.includes("ความมนขอบ") || dirtyFields.includes("รูปทรง"))) ||
    (k === "product" && dirtyFields.includes("หน้าสินค้า"));

  // 🔤 เนื้อหาแท็บโลโก้ — ใช้ร่วม แท็บโลโก้ + ป๊อป ⚙ โลโก้ ในตำแหน่งชิ้นส่วน Header (ค่าเดียวกัน)
  const logoSettings = (
    <>
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-3">รูปแบบโลโก้</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>แสดงแบบ</label>
            <select className={inputCls} value={theme.logo.mode} onChange={(e) => setLogo({ mode: e.target.value as LogoMode })}>
              {choices.logoModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ความสูงโลโก้ · {theme.logo.height}px</label>
            <input type="range" min={20} max={80} value={theme.logo.height} onChange={(e) => setLogo({ height: Number(e.target.value) })} className="w-full accent-blue-600" />
          </div>
          <div>
            <label className={labelCls}>อักษรในกล่อง (1-4 ตัว)</label>
            <input className={inputCls} maxLength={4} value={theme.logo.mark} onChange={(e) => setLogo({ mark: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>ชื่อร้าน</label>
            <input className={inputCls} value={theme.logo.text} onChange={(e) => setLogo({ text: e.target.value })} />
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">รูปโลโก้ &amp; ไอคอน</h3>
        <p className="text-[11px] text-slate-500 mb-3">อัปโหลดแล้วเลือก &quot;แสดงแบบ: รูปโลโก้&quot; ด้านบน · รองรับ PNG/JPG/WebP (โปร่งใสแนะนำ PNG)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploadField label="โลโก้หลัก" hint="ใช้บนพื้นสว่าง" value={theme.logo.imageKey} onChange={(k) => setLogo({ imageKey: k })} previewBg={theme.colors.page} />
          <ImageUploadField label="โลโก้สำหรับพื้นเข้ม" hint="ใช้ตอน Header สีเข้ม" value={theme.logo.imageDarkKey} onChange={(k) => setLogo({ imageDarkKey: k })} previewBg={theme.colors.ink} />
          <ImageUploadField label="ไอคอนแท็บเบราว์เซอร์ (Favicon)" hint="จัตุรัส 64px+" value={theme.logo.faviconKey} onChange={(k) => setLogo({ faviconKey: k })} height={44} />
        </div>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>ดูบนพื้นหลังต่าง ๆ</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { bg: "#FFFFFF", label: "พื้นขาว", dark: false },
            { bg: theme.colors.ink, label: "พื้นเข้ม", dark: true },
            { bg: theme.colors.brand, label: "พื้นแบรนด์", dark: true },
          ].map((v) => {
            const img = v.dark && theme.logo.imageDarkKey ? theme.logo.imageDarkKey : theme.logo.imageKey;
            const showImg = theme.logo.mode === "image" && img;
            return (
              <div key={v.label} className="rounded-lg p-3 border border-slate-200 text-center" style={{ background: v.bg }}>
                <span className="inline-flex items-center gap-1.5">
                  {showImg ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={keyUrl(img, 200)!} alt="โลโก้" style={{ height: Math.min(theme.logo.height, 34) }} />
                  ) : (
                    <>
                      {(theme.logo.mode === "icon-text" || theme.logo.mode === "icon") && (
                        <span className="inline-flex items-center justify-center text-white font-semibold" style={{ width: 22, height: 22, borderRadius: 6, background: theme.colors.brand, fontSize: 10 }}>
                          {theme.logo.mark}
                        </span>
                      )}
                      {(theme.logo.mode === "icon-text" || theme.logo.mode === "text") && (
                        <span className="text-xs font-semibold" style={{ color: v.dark ? "#fff" : theme.colors.ink }}>{theme.logo.text}</span>
                      )}
                    </>
                  )}
                </span>
                <p className="text-[9px] mt-1.5" style={{ color: v.dark ? "rgba(255,255,255,.6)" : "#94a3b8" }}>{v.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {/* แถบสถานะ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isDirty || hadDraft ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {isDirty ? "● มีการแก้ไขที่ยังไม่บันทึก" : hadDraft ? "● มีร่างที่ยังไม่เผยแพร่" : "✓ เผยแพร่แล้ว"}
        </span>
        {lastVersion && (
          <span className="text-[11px] text-slate-400">
            เผยแพร่ล่าสุด: เวอร์ชัน {lastVersion.version_no} · {timeAgo(lastVersion.created_at)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} disabled={!undoStack.current.length} title="ย้อนกลับ (Ctrl+Z)" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↶</button>
          <button onClick={redo} disabled={!redoStack.current.length} title="ทำซ้ำ" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↷</button>
        </div>
      </div>

      <div className="rounded-xl bg-blue-50/60 border border-blue-200 px-4 py-2.5">
        <p className="text-sm text-slate-700 font-medium">กำลังแก้ไขธีมของเว็บไซต์จริง</p>
        <p className="text-xs text-slate-500 mt-0.5">
          กด &quot;บันทึกร่าง&quot; จะยังไม่เปลี่ยนหน้าเว็บ จนกว่าจะกด &quot;เผยแพร่&quot;
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,38%)] items-start">
        {/* ── ซ้าย: ตั้งค่า ── */}
        <div className="min-w-0 space-y-3">
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-3.5 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition ${
                  tab === t.k ? "border-blue-600 text-blue-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
                {tabDirty(t.k) && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />}
              </button>
            ))}
          </div>

          {/* ── สี ── */}
          {tab === "colors" && (
            <>
              {/* 💾 ธีมที่บันทึกไว้ (ของกลาง components/website-saved-themes · ใช้ข้ามร้านได้) */}
              <SavedThemesCard shopId={shopId} theme={theme} onApply={(s) => apply(applySavedTheme(theme, s))} />
              {/* 🎨 ธีมทั้งชุด (lib/website-theme-presets) — สี ฟอนต์ ปุ่ม การ์ด หัวเว็บ การเปลี่ยนหน้า ในคลิกเดียว */}
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">🎨 ธีมทั้งชุด (กดครั้งเดียว)</h3>
                <p className="text-[11px] text-slate-500 mb-3">เปลี่ยน สี · ฟอนต์ · ปุ่ม · การ์ดสินค้า · หัวเว็บ · การเปลี่ยนหน้า พร้อมกัน — ไม่แตะโลโก้/เมนู/เนื้อหา · กดแล้วปรับต่อได้ · ↶ ย้อนกลับได้ก่อนบันทึก</p>
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                  {FULL_THEME_PRESETS.map((p) => {
                    const on = theme.colors.brand === p.colors.brand && theme.colors.page === p.colors.page && theme.fonts.display === p.fonts.display;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          apply(applyFullPreset(theme, p));
                          toast.success(`ใช้ธีม "${p.label}" แล้ว — ปรับต่อได้ · กด ↶ เพื่อย้อนกลับ`);
                        }}
                        className={`text-left rounded-xl border p-2 transition ${on ? "border-blue-600 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-400"}`}
                      >
                        <div className="rounded-lg h-16 px-3 flex flex-col justify-center gap-1.5 border border-black/5" style={{ background: p.colors.page }}>
                          <span style={{ fontFamily: `"${p.fonts.display}", serif`, color: p.colors.ink, fontSize: 15, letterSpacing: p.key === "luxury" ? "0.12em" : undefined }}>LOUIS MONTINI</span>
                          <span className="inline-block w-fit text-[10px] px-2.5 py-0.5" style={{ background: p.colors.brand, color: "#fff", borderRadius: p.shape.button === "pill" ? 999 : p.shape.button === "square" ? 0 : 6 }}>
                            ช้อปเลย
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 mt-1.5">{p.label}</p>
                        <p className="text-[11px] text-slate-500 leading-snug">{p.hint}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">ชุดสีสำเร็จรูป</h3>
                <p className="text-[11px] text-slate-500 mb-3">เลือกแล้วปรับต่อได้ · ย้อนกลับได้ก่อนบันทึก</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.name} onClick={() => apply({ ...theme, ...p.theme, colors: { ...theme.colors, ...p.theme.colors } })} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-500">
                      <span className="flex gap-0.5">
                        {[p.theme.colors?.brand, p.theme.colors?.ink, p.theme.colors?.page].map((c, i) => (
                          <span key={i} style={{ background: c, width: 10, height: 10, borderRadius: 3, border: "1px solid rgba(0,0,0,.1)" }} />
                        ))}
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className={cardCls}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800">สี</h3>
                  <button onClick={() => apply({ ...theme, colors: { ...theme.colors, brandDeep: darken(theme.colors.brand) } })} className="text-[11px] text-blue-600 hover:underline">
                    สร้างสีเข้มจากสีหลักอัตโนมัติ
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {COLOR_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className={labelCls}>
                        {f.label} <span className="text-slate-400">· {f.hint}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={theme.colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer shrink-0 p-0.5" aria-label={f.label} />
                        <input value={theme.colors[f.key]} onChange={(e) => setColor(f.key, e.target.value)} className={inputCls} />
                        <ResetBtn show={theme.colors[f.key] !== published.colors[f.key]} onClick={() => setColor(f.key, published.colors[f.key])} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className={labelCls}>เฉดสีจากสีหลัก (ระบบสร้างให้อัตโนมัติ)</p>
                  <div className="flex rounded-lg overflow-hidden border border-slate-200">
                    {Object.entries(shades(theme.colors.brand)).map(([k, v]) => (
                      <div key={k} className="flex-1 h-8" style={{ background: v }} title={`${k} · ${v}`} />
                    ))}
                  </div>
                </div>
              </div>

              <FineColorsCard
                theme={theme}
                published={published}
                sample={sampleItems[0] ?? null}
                setColor={setColor}
                setSoft={(n) => apply({ ...theme, colors: { ...theme.colors, softPct: n } })}
                setSaleBadge={(v) => setCard({ autoBadges: { ...theme.card.autoBadges, saleColor: v } })}
                onResetAll={() => apply({ ...theme, colors: { ...theme.colors, ...FINE_COLOR_DEFAULTS } })}
              />

              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">ตรวจความอ่านง่าย (WCAG)</h3>
                <p className="text-[11px] text-slate-500 mb-3">{failCount ? `⚠️ พบ ${failCount} จุดที่อ่านยาก` : "✓ ผ่านทุกจุด"}</p>
                <ul className="space-y-2">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center justify-center px-2 py-1 rounded shrink-0" style={{ background: c.bg, color: c.fg, minWidth: 46 }}>Aa</span>
                      <span className="flex-1 text-slate-600">{c.label}</span>
                      <span className={c.level === "fail" ? "text-red-600" : c.level === "AA-large" ? "text-amber-600" : "text-emerald-600"}>
                        {c.ratio}:1 · {WCAG_LABEL[c.level]}
                      </span>
                      {c.suggest && c.fix && (
                        <button onClick={() => c.fix!(c.suggest!)} className="text-blue-600 hover:underline whitespace-nowrap">
                          ใช้ {c.suggest}
                        </button>
                      )}
                      {c.level === "fail" && !c.fix && <span className="text-[10px] text-slate-400 whitespace-nowrap">ปรับสีป้ายในช่องด้านบน</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ── ตัวอักษร ── */}
          {tab === "fonts" && (
            <>
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">ฟอนต์หลัก</h3>
                <p className="text-xs text-slate-500 mb-3">ฟอนต์หัวข้อใช้กับหัวข้อ/ชื่อสินค้า · ฟอนต์เนื้อหาใช้กับข้อความทั่วไป ปุ่ม เมนู · ฟอนต์อังกฤษ: ตัวไทยจะใช้ฟอนต์หลักแทน</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["display", "body"] as const).map((fk) => (
                    <div key={fk}>
                      <label className={labelCls}>{fk === "display" ? "ฟอนต์หัวข้อ" : "ฟอนต์เนื้อหา"}</label>
                      <div className="flex items-center gap-2">
                        <FontSelect value={theme.fonts[fk]} onChange={(v) => apply({ ...theme, fonts: { ...theme.fonts, [fk]: v } })} options={webFontOptions()} googleFonts={WEB_FONT_NAMES} sample="กขค งานหนัง Aa 123" />
                        <ResetBtn show={theme.fonts[fk] !== published.fonts[fk]} onClick={() => apply({ ...theme, fonts: { ...theme.fonts, [fk]: published.fonts[fk] } })} />
                      </div>
                      <p className="mt-1.5 text-base leading-snug" style={{ fontFamily: `"${theme.fonts[fk]}", ${fk === "display" ? `"${theme.fonts.body}",` : ""} sans-serif`, color: theme.colors.ink, fontWeight: fk === "display" ? 600 : 400 }}>
                        งานหนังคุณภาพ Premium leather 0123456789
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">ปรับละเอียดรายบทบาท</h3>
                <p className="text-xs text-slate-500 mb-3">แต่ละชนิดข้อความตั้งแยกได้: ฟอนต์ น้ำหนัก เอียง ขนาด (คอม/มือถือ) ระยะห่าง ตัวพิมพ์ใหญ่ สี พื้นหลัง · ตัวอย่างด้านล่างเปลี่ยนตามทันที</p>
                <div className="space-y-3">
                  {TEXT_ROLE_DEFS.map(roleEditor)}
                </div>
              </div>
            </>
          )}

          {/* ── โลโก้ ── */}
          {tab === "logo" && logoSettings}

          {/* ── Header ── */}
          {tab === "header" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">แถบเมนูด้านบน (Header)</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>ความสูง · {theme.header.height}px</label>
                  <input type="range" min={48} max={120} value={theme.header.height} onChange={(e) => setHeader({ height: Number(e.target.value) })} className="w-full accent-blue-600" />
                </div>
                <div>
                  <label className={labelCls}>สีพื้นหลัง</label>
                  <select className={inputCls} value={theme.header.bg} onChange={(e) => setHeader({ bg: e.target.value as HeaderBg })}>
                    {choices.headerBg.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ตำแหน่งเมนู</label>
                  <select className={inputCls} value={theme.header.menuAlign} onChange={(e) => setHeader({ menuAlign: e.target.value as MenuAlign })}>
                    {choices.menuAligns.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2 justify-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.sticky} onChange={(e) => setHeader({ sticky: e.target.checked })} />
                    ตรึงแถบเมนูไว้ด้านบนเมื่อเลื่อน
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.showCart} onChange={(e) => setHeader({ showCart: e.target.checked })} />
                    แสดงไอคอนตะกร้า
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.border} onChange={(e) => setHeader({ border: e.target.checked })} />
                    มีเส้นคั่นด้านล่าง
                  </label>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
                <div>
                  <label className={labelCls}>สีพื้น Header</label>
                  <select className={inputCls} value={theme.header.bgKind} onChange={(e) => setHeader({ bgKind: e.target.value as "preset" | "custom" })}>
                    <option value="preset">ตามตัวเลือกด้านบน</option>
                    <option value="custom">กำหนดสีเอง</option>
                  </select>
                  {theme.header.bgKind === "custom" && (
                    <div className="mt-2">
                      <ColorPicker value={theme.header.bgColor} onChange={(hex) => setHeader({ bgColor: hex })} />
                    </div>
                  )}
                </div>
                <ColorField label="สีตัวอักษร/ไอคอนใน Header" value={theme.header.textColor} onChange={(hex) => setHeader({ textColor: hex })} emptyLabel="อัตโนมัติ (ขาว/ดำตามพื้น)" />
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <label className={labelCls}>ตำแหน่งชิ้นส่วน (ซ้าย · กลาง · ขวา) — ลาก ⠿ จัดลำดับในโซน · ◀ ▶ ย้ายโซน · ✕ เอาออก</label>
                <ZonesEditor zones={theme.header.zones} onChange={(zones) => setHeader({ zones })} onConfig={setZoneCfg} />
                <p className="text-[11px] text-slate-400 mt-1.5">กดชื่อชิ้นที่มี ⚙ (โลโก้ · เมนู · ค้นหา · ตะกร้า · โซเชียล) เพื่อตั้งค่าในป๊อปได้เลย · “บัญชีสมาชิก” โชว์เมื่อเว็บเปิดระบบสมาชิกแล้ว (ตั้งช่องทางเข้าสู่ระบบ)</p>
                {/* ⚙ ป๊อปตั้งค่าชิ้นส่วน: เมนู = แก้ในธีม (บันทึกร่าง/เผยแพร่พร้อมดีไซน์) · โซเชียล = ข้อมูลร้าน บันทึกทันที */}
                <ERPModal
                  open={zoneCfg === "menu"}
                  onClose={() => setZoneCfg(null)}
                  title="☰ เมนูด้านบน"
                  description="จัดลำดับ ลิงก์ไปหน้า/หมวด/สินค้า/URL · ป้ายเล็ก · เมนูย่อย · ชุดมือถือแยกได้ — แก้แล้วเห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบนเหมือนการแก้ดีไซน์อื่น"
                  size="xl"
                  footer={
                    <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
                      เสร็จ
                    </button>
                  }
                >
                  <MenuSettings menu={theme.menu} setMenu={setMenu} choices={choices} pages={storePages} megaCtx={megaCtx} typo={{ nav: roleOf(theme, "nav").uppercase, menu: roleOf(theme, "menu").uppercase, setUpper: (k, v) => apply({ ...theme, typography: { ...theme.typography, [k]: { ...roleOf(theme, k), uppercase: v } } }), editors: TEXT_ROLE_DEFS.filter((d) => d.key === "nav" || d.key === "menu").map(roleEditor) }} />
                </ERPModal>
                {/* ⚙ โลโก้ = เนื้อหาเดียวกับแท็บโลโก้ · ⚙ ตะกร้า/ค้นหา = theme.header.cart / .search (บันทึกร่าง/เผยแพร่พร้อมดีไซน์) */}
                <ERPModal
                  open={zoneCfg === "logo"}
                  onClose={() => setZoneCfg(null)}
                  title="🏷 โลโก้"
                  description="ค่าเดียวกับแท็บโลโก้ — แก้ตรงนี้ แท็บโลโก้เปลี่ยนตาม · เห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบน"
                  size="xl"
                  footer={
                    <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
                      เสร็จ
                    </button>
                  }
                >
                  <div className="space-y-3">{logoSettings}</div>
                </ERPModal>
                <ERPModal
                  open={zoneCfg === "cart" || zoneCfg === "search"}
                  onClose={() => setZoneCfg(null)}
                  title={zoneCfg === "cart" ? "🛒 ตะกร้า" : "🔍 ค้นหา"}
                  description="เห็นในพรีวิวทันที อย่าลืมกดบันทึก/เผยแพร่ด้านบนเหมือนการแก้ดีไซน์อื่น"
                  size="md"
                  footer={
                    <button type="button" onClick={() => setZoneCfg(null)} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
                      เสร็จ
                    </button>
                  }
                >
                  {zoneCfg === "cart" ? (
                    <HeaderCartSettings value={theme.header.cart ?? DEFAULT_HEADER_CART} onChange={(p) => setHeader({ cart: { ...(theme.header.cart ?? DEFAULT_HEADER_CART), ...p } })} theme={theme} />
                  ) : (
                    <HeaderSearchSettings value={theme.header.search ?? DEFAULT_HEADER_SEARCH} onChange={(p) => setHeader({ search: { ...(theme.header.search ?? DEFAULT_HEADER_SEARCH), ...p } })} theme={theme} />
                  )}
                </ERPModal>
                <SocialLinksModal
                  open={zoneCfg === "social"}
                  onClose={() => setZoneCfg(null)}
                  shopSlug={shopSlug}
                  shopId={shopId}
                  onSaved={() => setTimeout(() => { if (iframeRef.current) iframeRef.current.src = iframeRef.current.src; }, 1500)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
                <div>
                  <label className={labelCls}>ข้อความปุ่มใน Header (ว่าง = ไม่มีปุ่ม)</label>
                  <input className={inputCls} value={theme.header.button.text} maxLength={30} placeholder="เช่น ช้อปเลย" onChange={(e) => setHeader({ button: { ...theme.header.button, text: e.target.value } })} />
                </div>
                <div>
                  <label className={labelCls}>ลิงก์ของปุ่ม</label>
                  <LinkTargetPicker value={theme.header.button.href} onChange={(href) => setHeader({ button: { ...theme.header.button, href } })} ctx={linkCtx} />
                </div>
                <div>
                  <label className={labelCls}>เมนูมือถือเปิดจาก</label>
                  <select className={inputCls} value={theme.header.mobileMenuSide} onChange={(e) => setHeader({ mobileMenuSide: e.target.value as "left" | "right" | "top" })}>
                    <option value="top">คลี่ลงใต้แถบเมนู</option>
                    <option value="left">ลิ้นชักจากซ้าย</option>
                    <option value="right">ลิ้นชักจากขวา</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2 justify-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.overHero} onChange={(e) => setHeader({ overHero: e.target.checked })} />
                    โปร่งใสทับแบนเนอร์แรก (เลื่อนแล้วกลับเป็นสีปกติ)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.header.hideOnScroll} onChange={(e) => setHeader({ hideOnScroll: e.target.checked })} />
                    เลื่อนลงซ่อนแถบเมนู · เลื่อนขึ้นโผล่
                  </label>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3">* รายการในเมนูตั้งที่แท็บ "เมนู" · ยังไม่ตั้ง = อัตโนมัติ (สินค้าทั้งหมด + หน้าที่สร้างเอง + ติดต่อ)</p>
            </div>
          )}

          {/* ── เมนู ── */}
          {tab === "menu" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">เมนูด้านบน</h3>
              <p className="text-xs text-slate-500 mb-3">จัดลำดับ ลิงก์ไปหน้า/หมวด/สินค้า/URL · ใส่ป้ายเล็ก · เมนูย่อย (dropdown หรือแผง Mega มีรูป) · ตั้งชุดมือถือแยกได้</p>
              <MenuSettings menu={theme.menu} setMenu={setMenu} choices={choices} pages={storePages} megaCtx={megaCtx} typo={{ nav: roleOf(theme, "nav").uppercase, menu: roleOf(theme, "menu").uppercase, setUpper: (k, v) => apply({ ...theme, typography: { ...theme.typography, [k]: { ...roleOf(theme, k), uppercase: v } } }), editors: TEXT_ROLE_DEFS.filter((d) => d.key === "nav" || d.key === "menu").map(roleEditor) }} />
            </div>
          )}

          {/* ── Footer ── */}
          {tab === "footer" && (
            <>
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">ท้ายเว็บ (Footer) — สี</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>สีพื้น</label>
                    <select className={inputCls} value={theme.footer.bg} onChange={(e) => setFooter({ bg: e.target.value as FooterConfig["bg"] })}>
                      {FOOTER_BGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {theme.footer.bg === "custom" && (
                      <div className="mt-2">
                        <ColorPicker value={theme.footer.bgColor} onChange={(hex) => setFooter({ bgColor: hex })} />
                      </div>
                    )}
                  </div>
                  <ColorField label="สีตัวอักษร" value={theme.footer.textColor} onChange={(hex) => setFooter({ textColor: hex })} emptyLabel="อัตโนมัติ (ขาว/ดำตามพื้น)" />
                  <div>
                    <label className={labelCls}>จัดข้อความ</label>
                    <select className={inputCls} value={theme.footer.align} onChange={(e) => setFooter({ align: e.target.value as "left" | "center" })}>
                      <option value="left">ชิดซ้าย</option>
                      <option value="center">กึ่งกลาง (เหมาะกับ 1-2 คอลัมน์)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">คอลัมน์</h3>
                <p className="text-xs text-slate-500 mb-3">เลือกชนิดคอลัมน์ ตั้งหัวข้อ ลาก ⠿ จัดลำดับ · กว้าง 1 หรือ 2 ช่อง (ทั้งแถวมี 4 ช่อง) · มือถือเรียงลงมาทีละคอลัมน์</p>
                {theme.footer.columns === null ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                    ตอนนี้ใช้แบบ<b>อัตโนมัติ</b>: โลโก้ + คำอธิบายร้าน (2 ช่อง) · เมนู · ติดต่อ
                    <div className="mt-3">
                      <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => setFooter({ columns: [newFooterColumn("about"), newFooterColumn("links"), newFooterColumn("contact")] })}>
                        จัดคอลัมน์เอง (เริ่มจากชุดอัตโนมัติ)
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <FooterColumnsEditor columns={theme.footer.columns} onChange={(columns) => setFooter({ columns })} choices={choices} pages={storePages} />
                    <button type="button" className="mt-3 text-xs text-slate-500 hover:text-rose-600 hover:underline" onClick={() => { if (confirm("กลับไปใช้ท้ายเว็บแบบอัตโนมัติ? (คอลัมน์ที่จัดไว้จะหาย)")) setFooter({ columns: null }); }}>กลับไปใช้แบบอัตโนมัติ</button>
                  </>
                )}
              </div>

              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">แถวล่างสุด</h3>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-3">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.footer.showCopyright} onChange={(e) => setFooter({ showCopyright: e.target.checked })} />
                  แสดง © ปี + ชื่อร้าน (ข้อความท้ายเว็บตั้งที่แท็บข้อมูลร้าน)
                </label>
                <label className={labelCls}>ไอคอนช่องทางชำระเงิน</label>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
                  {PAYMENT_ICONS.map((pm) => (
                    <label key={pm.value} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={theme.footer.payments.includes(pm.value)} onChange={(e) => setFooter({ payments: e.target.checked ? [...theme.footer.payments, pm.value] : theme.footer.payments.filter((v) => v !== pm.value) })} />
                      {pm.label}
                    </label>
                  ))}
                </div>
                <label className={labelCls}>ลิงก์แถวล่าง (เช่น นโยบายความเป็นส่วนตัว · เงื่อนไข)</label>
                <MenuEditor items={theme.footer.bottomLinks} onChange={(bottomLinks) => setFooter({ bottomLinks })} choices={choices} pages={storePages} depth={1} />
                <button type="button" className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:border-slate-500" onClick={() => setFooter({ bottomLinks: [...theme.footer.bottomLinks, newMenuItem("ลิงก์ใหม่", "page")] })}>+ เพิ่มลิงก์</button>
              </div>
            </>
          )}

          {/* ── การ์ดสินค้า ── */}
          {tab === "card" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">การ์ดสินค้า</h3>

              <label className={labelCls}>รูปแบบการ์ด</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {choices.cardPresets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setCard({ preset: p.value })}
                    title={p.hint}
                    className={`px-3.5 py-2 rounded-lg border text-sm transition ${
                      theme.card.preset === p.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>สัดส่วนรูปสินค้า</label>
                  <select className={inputCls} value={theme.card.imageRatio} onChange={(e) => setCard({ imageRatio: e.target.value as ImageRatio })}>
                    {choices.imageRatios.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ชื่อสินค้าแสดงกี่บรรทัด</label>
                  <WheelSelect value={theme.card.titleLines} onChange={(e) => setCard({ titleLines: Number(e.target.value) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n} บรรทัด</option>)}
                  </WheelSelect>
                </div>
                <div>
                  <label className={labelCls}>เอฟเฟกต์ตอนชี้เมาส์</label>
                  <select className={inputCls} value={theme.card.hover} onChange={(e) => setCard({ hover: e.target.value as CardHover })}>
                    {choices.cardHovers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 mt-3">
                <div>
                  <label className={labelCls}>รูปในกรอบ</label>
                  <select className={inputCls} value={theme.card.imageFit} onChange={(e) => setCard({ imageFit: e.target.value as Theme["card"]["imageFit"] })}>
                    <option value="cover">เต็มกรอบ (ตัดขอบ)</option>
                    <option value="contain">ย่อให้เห็นทั้งรูป</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ปุ่ม "เพิ่มลงตะกร้า" บนรูป</label>
                  <select className={inputCls} value={theme.card.quickAdd} onChange={(e) => setCard({ quickAdd: e.target.value as Theme["card"]["quickAdd"] })}>
                    <option value="hover">โผล่ตอนชี้เมาส์ (มือถือไม่มี)</option>
                    <option value="always">โชว์ตลอด</option>
                    <option value="none">ไม่มีปุ่ม</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>จัดข้อความ</label>
                  <select className={inputCls} value={theme.card.align} onChange={(e) => setCard({ align: e.target.value as Theme["card"]["align"] })}>
                    <option value="left">ชิดซ้าย</option>
                    <option value="center">กึ่งกลาง</option>
                  </select>
                </div>
              </div>

              {/* ⬜ ความมน/เหลี่ยมของกรอบ — ค่าเดียวกับแท็บรูปทรง (theme.shape) แก้ที่ไหนก็เปลี่ยนตาม */}
              <div className="grid gap-3 sm:grid-cols-2 mt-3">
                {([
                  ["cardRadius", "ความมนของกรอบการ์ด", "มีผลกับแบบ มีกรอบ / เงานุ่ม / ลอย"],
                  ["imageRadius", "ความมนของรูปสินค้า", "มีผลกับแบบ เรียบ / มินิมอล (รูปไม่มีกรอบการ์ด)"],
                ] as const).map(([k, label, hint]) => (
                  <div key={k}>
                    <label className={labelCls}>{label}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {([null, 0, 4, 8, 12, 20, 32] as const).map((n) => {
                        const on = theme.shape[k] === n;
                        const preview = n == null ? (theme.radius === "sharp" ? 4 : theme.radius === "round" ? 20 : 12) : n;
                        return (
                          <button key={String(n)} type="button" onClick={() => setShape({ [k]: n } as Partial<Shape>)}
                            title={n == null ? "ตามค่ารวมของธีม (แท็บรูปทรง)" : n === 0 ? "เหลี่ยม" : `มน ${n}px`}
                            className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                            <span className="block w-6 h-6 border-2 border-current" style={{ borderRadius: Math.min(preview, 12) }} />
                            {n == null ? "ตามธีม" : n === 0 ? "เหลี่ยม" : n}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-4 mt-3">
                <div>
                  <label className={labelCls}>คอลัมน์ · คอม</label>
                  <WheelSelect value={theme.card.columns.desktop} onChange={(e) => setCard({ columns: { ...theme.card.columns, desktop: Number(e.target.value) } })}>
                    {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </WheelSelect>
                </div>
                <div>
                  <label className={labelCls}>คอลัมน์ · แท็บเล็ต</label>
                  <WheelSelect value={theme.card.columns.tablet} onChange={(e) => setCard({ columns: { ...theme.card.columns, tablet: Number(e.target.value) } })}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </WheelSelect>
                </div>
                <div>
                  <label className={labelCls}>คอลัมน์ · มือถือ</label>
                  <WheelSelect value={theme.card.columns.mobile} onChange={(e) => setCard({ columns: { ...theme.card.columns, mobile: Number(e.target.value) } })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </WheelSelect>
                </div>
                <div>
                  <label className={labelCls}>ระยะห่างการ์ด</label>
                  <WheelSelect value={theme.card.gap} onChange={(e) => setCard({ gap: e.target.value as Theme["card"]["gap"] })}>
                    <option value="sm">ชิด</option>
                    <option value="md">ปกติ</option>
                    <option value="lg">ห่าง</option>
                  </WheelSelect>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 mt-3">
                <div>
                  <label className={labelCls}>ขนาดชื่อสินค้า ({theme.card.nameSize}%)</label>
                  <input type="range" min={60} max={180} step={5} value={theme.card.nameSize} onChange={(e) => setCard({ nameSize: Number(e.target.value) })} className="w-full" />
                </div>
                <div>
                  <label className={labelCls}>ขนาดราคา ({theme.card.priceSize}%)</label>
                  <input type="range" min={60} max={180} step={5} value={theme.card.priceSize} onChange={(e) => setCard({ priceSize: Number(e.target.value) })} className="w-full" />
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-slate-100">
                {([
                  ["showBadge", "ป้าย (ขายดี/แนะนำ)"],
                  ["showStock", "สถานะสต๊อก"],
                  ["showCategory", "ชื่อหมวดเหนือชื่อสินค้า"],
                  ["showUnit", "หน่วย (/ ใบ)"],
                  ["showCompare", "ราคาเต็มขีดฆ่า (fake_price)"],
                  ["showSwatches", "จุดสีตัวเลือก"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card[k]} onChange={(e) => setCard({ [k]: e.target.checked } as Partial<Theme["card"]>)} />
                    {label}
                  </label>
                ))}
                {/* หน้าตาจุดสีมาจากทะเบียนสีกลาง (ใช้ทุกร้าน) — บันทึกแล้วเว็บเปลี่ยนทันที ไม่ต้องกดเผยแพร่ธีม */}
                <span className="ml-auto"><ColorSwatchButton /></span>
              </div>

              {/* 🎨 จุดสีบนการ์ด */}
              {theme.card.showSwatches && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      จุดสีสูงสุด
                      <WheelSelect value={theme.card.swatchMax} onChange={(e) => setCard({ swatchMax: Number(e.target.value) })}>
                        {[3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n} จุด</option>)}
                      </WheelSelect>
                      <span className="text-[11px] text-slate-400">เกินโชว์ +N</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.swatchSwap} onChange={(e) => setCard({ swatchSwap: e.target.checked })} />
                      ชี้ (คอม) / แตะ (มือถือ) จุดสี แล้วรูปการ์ดเปลี่ยนเป็นสีนั้น
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.showColorCount} onChange={(e) => setCard({ showColorCount: e.target.checked })} />
                      โชว์จำนวนสี (เช่น &quot;4 สี&quot;)
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400">เลือกว่าแต่ละรุ่นโชว์สีไหนบ้าง + ★ สีหลัก (รูปแรกบนการ์ด) ได้ที่ Parent SKU → แท็บ 🛍 เว็บไซต์ · ไม่ตั้ง = ทุกสีตามลำดับเดิม · กดการ์ดหลังเลือกสี = เปิดหน้าสินค้าโดยเลือกสีนั้นไว้</p>
                </div>
              )}

              <CardExtras card={theme.card} setCard={setCard} />

              {/* 🖼 ระหว่างรอรูปโหลด — ใช้ทั้งการ์ดและหน้าสินค้า (เก็บใน logo.placeholder) */}
              <PlaceholderSettings
                value={theme.logo.placeholder}
                onChange={(p) => setLogo({ placeholder: { ...theme.logo.placeholder, ...p } })}
                logoKey={theme.logo.imageKey}
                surface={theme.colors.surface}
                colors={theme.colors}
                ratio={RATIO_CSS[theme.card.imageRatio] ?? "4 / 5"}
              />

              {/* การ์ดจำลองจากสินค้าจริง — เปลี่ยนค่าแล้วเห็นทันที (ชี้เมาส์ดูเอฟเฟกต์) */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <label className={labelCls}>ตัวอย่างการ์ด (จากสินค้าจริงในร้าน · ชี้เมาส์เพื่อดูเอฟเฟกต์)</label>
                {sampleItems.length ? (
                  <div className="rounded-xl p-4" style={{ background: theme.colors.page }}>
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(sampleItems.length, theme.card.columns.desktop)}, minmax(0, 1fr))`, gap: theme.card.gap === "sm" ? 8 : theme.card.gap === "lg" ? 24 : 16, maxWidth: 560 }}>
                      {sampleItems.slice(0, Math.min(sampleItems.length, theme.card.columns.desktop)).map((it, i) => (
                        <SampleCard key={i} item={it} card={theme.card} colors={theme.colors} fonts={theme.fonts} radius={theme.radius} shape={theme.shape} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">ยังไม่มีสินค้าบนเว็บ — การ์ดจำลองจะโชว์เมื่อมีสินค้าที่เผยแพร่แล้ว</p>
                )}
              </div>
            </div>
          )}

          {/* ── หน้าสินค้า (Style) ── */}
          {tab === "product" && (
            <div className={cardCls}>
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-800">หน้าสินค้า — เลือก Style</h3>
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs" title="ตั้งค่าแยกตามจอ: ช่องที่ยังเป็น 'ตามคอม' ใช้ค่าเดียวกับคอม">
                  <button type="button" onClick={() => { setEditDevice("pc"); setDevice("desktop"); }} className={`px-2.5 py-1 ${!isMobileEdit ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🖥 คอม</button>
                  <button type="button" onClick={() => { setEditDevice("mobile"); setDevice("mobile"); }} className={`px-2.5 py-1 ${isMobileEdit ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    📱 มือถือ{mobCount > 0 && <span className={`ml-1 rounded-full px-1.5 text-[10px] ${isMobileEdit ? "bg-white/20" : "bg-blue-100 text-blue-700"}`}>{mobCount}</span>}
                  </button>
                </div>
              </div>
              {isMobileEdit && (
                <div className="mb-3 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-[11px] text-blue-800 flex items-center justify-between gap-2 flex-wrap">
                  <span>📱 กำลังตั้งค่าสำหรับ <b>มือถือ</b> (จอแคบกว่า 768px) — ช่องที่เป็น "ตามคอม" ใช้ค่าเดียวกับคอม · ตั้งแยกได้ทุกอย่าง: วิธีโชว์รายละเอียด, พับ/เปิด, ลำดับ/ซ่อนส่วนประกอบ, ⚙️ ทุกส่วน (รูปใหญ่ · ราคา-ตะกร้าทั้งชุด · แบนเนอร์ · คุณอาจชอบ), เอฟเฟกต์/ขนาดรูป, ขนาดตัวอักษร</span>
                  {mobCount > 0 && <button type="button" onClick={() => setProduct({ mobile: normalizeMobile(null) })} className="text-blue-700 hover:underline whitespace-nowrap">ล้างค่ามือถือทั้งหมด (ตามคอม)</button>}
                </div>
              )}
              <p className="text-[11px] text-slate-400 mb-3">Style เป็นของกลาง ทุกร้าน/ทุกแบรนด์เลือกใช้ได้ สลับกลับได้ตลอด · ข้อมูลสินค้าชุดเดิม ไม่ต้องกรอกเพิ่ม</p>

              <div className="grid gap-3 sm:grid-cols-2">
                {(choices.productLayouts ?? []).map((p) => {
                  const on = theme.product.layout === p.value;
                  return (
                    <button
                      key={p.value}
                      onClick={() => setProduct({ layout: p.value })}
                      className={`text-left rounded-xl border p-3 transition ${on ? "border-blue-600 bg-blue-50/60" : "border-slate-200 hover:border-slate-400"}`}
                    >
                      {/* ภาพจำลองโครงหน้า */}
                      <div className="rounded-lg bg-white border border-slate-200 p-2 mb-2" style={{ height: 96 }}>
                        {p.value === "classic" ? (
                          <div className="flex gap-2 h-full">
                            <div className="w-1/2 rounded-md" style={{ background: theme.colors.surface, border: "1px solid #e5e7eb" }} />
                            <div className="w-1/2 flex flex-col gap-1.5 pt-1">
                              <div className="h-2.5 w-4/5 rounded bg-slate-300" />
                              <div className="h-2 w-1/3 rounded" style={{ background: theme.colors.brand }} />
                              <div className="h-1.5 w-full rounded bg-slate-200" />
                              <div className="h-1.5 w-5/6 rounded bg-slate-200" />
                              <div className="mt-auto h-4 w-2/3 rounded" style={{ background: theme.colors.brand }} />
                            </div>
                          </div>
                        ) : (
                          <div className="relative h-full flex flex-col items-center">
                            <div className="h-3 w-1/3 rounded italic" style={{ background: theme.colors.brand }} />
                            <div className="mt-1.5 w-11 h-11 rounded-full" style={{ background: `color-mix(in srgb, ${theme.colors.brand} 12%, white)`, border: "1px solid #e5e7eb" }} />
                            <div className="absolute left-1 bottom-1 flex flex-col gap-1 w-1/4">
                              <div className="h-2 w-2/3 rounded bg-slate-400" />
                              <div className="h-1.5 w-full rounded bg-slate-200" />
                            </div>
                            <div className="absolute right-1 bottom-1 flex flex-col gap-1 w-1/4 items-end">
                              <div className="flex gap-0.5">{[0, 1, 2, 3].map((i) => <span key={i} className="w-2 h-2 rounded-full bg-slate-300" />)}</div>
                              <div className="h-3.5 w-full rounded" style={{ background: theme.colors.brand }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <p className={`text-sm font-medium ${on ? "text-blue-700" : "text-slate-800"}`}>{p.label}{on && " ✓"}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.hint}</p>
                    </button>
                  );
                })}
              </div>

              {theme.product.layout === "showcase" && (
                <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
                  <div>
                    <label className={labelCls}>แกลเลอรีรูปสินค้า</label>
                    <select className={inputCls} value={theme.product.galleryStyle} onChange={(e) => setProduct({ galleryStyle: e.target.value as ProductGalleryStyle })}>
                      {(choices.productGalleryStyles ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">{(choices.productGalleryStyles ?? []).find((o) => o.value === theme.product.galleryStyle)?.hint}</p>
                  </div>
                  <div>
                    <label className={labelCls}>รายละเอียดสินค้า</label>
                    <select
                      className={`${inputCls} ${isMobileEdit && mob.detailsStyle ? "border-blue-400" : ""}`}
                      value={isMobileEdit ? (mob.detailsStyle ?? "__pc") : theme.product.detailsStyle}
                      onChange={(e) => (isMobileEdit ? setMobile({ detailsStyle: e.target.value === "__pc" ? null : (e.target.value as ProductDetailsStyle) }) : setProduct({ detailsStyle: e.target.value as ProductDetailsStyle }))}
                    >
                      {isMobileEdit && <option value="__pc">ตามคอม ({(choices.productDetailsStyles ?? []).find((o) => o.value === theme.product.detailsStyle)?.label})</option>}
                      {(choices.productDetailsStyles ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {pv.detailsStyle === "accordion" && (
                      <select
                        className={`${inputCls} mt-1.5 ${isMobileEdit && mob.detailsOpen ? "border-blue-400" : ""}`}
                        value={isMobileEdit ? (mob.detailsOpen ?? "__pc") : theme.product.detailsOpen}
                        onChange={(e) => (isMobileEdit ? setMobile({ detailsOpen: e.target.value === "__pc" ? null : (e.target.value as ProductDetailsOpen) }) : setProduct({ detailsOpen: e.target.value as ProductDetailsOpen }))}
                        title="หัวข้อพับเก็บเริ่มต้น"
                      >
                        {isMobileEdit && <option value="__pc">ค่าเริ่มต้น: ตามคอม ({(choices.productDetailsOpen ?? []).find((o) => o.value === theme.product.detailsOpen)?.label})</option>}
                        {(choices.productDetailsOpen ?? []).map((o) => <option key={o.value} value={o.value}>ค่าเริ่มต้น: {o.label}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>🔠 ขนาดตัวอักษร (% ของปกติ){isMobileEdit && " — สำหรับมือถือ"}</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {FONT_LABELS.map((f) => {
                        const pcVal = theme.product.fonts[f.k];
                        const mVal = mob.fonts[f.k];
                        const val = isMobileEdit ? (mVal != null ? String(mVal) : "__pc") : String(pcVal);
                        return (
                          <div key={f.k}>
                            <span className="block text-[11px] text-slate-500 mb-0.5" title={f.hint}>{f.label}</span>
                            <WheelSelect
                              highlight={!!(isMobileEdit && mVal != null)}
                              value={val}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (isMobileEdit) {
                                  const next = { ...mob.fonts };
                                  if (v === "__pc") delete next[f.k];
                                  else next[f.k] = Number(v);
                                  setMobile({ fonts: next });
                                } else setProduct({ fonts: { ...theme.product.fonts, [f.k]: Number(v) } });
                              }}
                            >
                              {isMobileEdit && <option value="__pc">ตามคอม ({pcVal}%)</option>}
                              {FONT_SIZES.map((n) => <option key={n} value={n}>{n}%{n === 100 ? " (ปกติ)" : ""}</option>)}
                            </WheelSelect>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">ใช้กับหน้าสินค้าแบบโชว์เคส · เนื้อหา = คำอธิบาย/รายละเอียด/ข้อความแบนเนอร์ · หัวข้อ = หัวข้อพับเก็บ/แท็บ/แบนเนอร์/คุณอาจชอบ</p>
                  </div>
                  <div>
                    <label className={labelCls}>ชื่อรุ่น</label>
                    <select className={inputCls} value={theme.product.titleStyle} onChange={(e) => setProduct({ titleStyle: e.target.value as ProductTitleStyle })}>
                      {(choices.productTitleStyles ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>เอฟเฟกต์รูปสินค้า</label>
                    <select
                      className={`${inputCls} ${isMobileEdit && mob.imageEffect ? "border-blue-400" : ""}`}
                      value={isMobileEdit ? (mob.imageEffect ?? "__pc") : theme.product.imageEffect}
                      onChange={(e) => (isMobileEdit ? setMobile({ imageEffect: e.target.value === "__pc" ? null : (e.target.value as ProductImageEffect) }) : setProduct({ imageEffect: e.target.value as ProductImageEffect }))}
                    >
                      {isMobileEdit && <option value="__pc">ตามคอม ({PRODUCT_IMAGE_EFFECTS.find((o) => o.value === theme.product.imageEffect)?.label})</option>}
                      {PRODUCT_IMAGE_EFFECTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>ขนาดรูปในกรอบ</label>
                    <WheelSelect
                      highlight={!!(isMobileEdit && (mob.imageFit || mob.imageSize))}
                      value={imageFitValue}
                      onChange={(e) => setImageFitValue(e.target.value)}
                    >
                      {isMobileEdit && <option value="__pc">ตามคอม ({fitLabel(theme.product.imageFit, theme.product.imageSize)})</option>}
                      {PRODUCT_IMAGE_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      {theme.product.imageFit === "contain" && !PRODUCT_IMAGE_SIZES.some((o) => o.value === String(theme.product.imageSize)) && (
                        <option value={String(theme.product.imageSize)}>{theme.product.imageSize}%</option>
                      )}
                    </WheelSelect>
                    <p className="text-[11px] text-slate-400 mt-1">อัตโนมัติ = รูปที่สัดส่วนใกล้กรอบ (นายแบบ/จัตุรัส) เต็มกรอบ ส่วนรูปที่ต้องตัดเยอะย่อพอดี · เต็มกรอบ = ทุกรูปกางเต็ม (ตัดขอบ) · % = ย่อรูปให้อยู่ในกรอบ</p>
                  </div>
                  <div>
                    <label className={labelCls}>พื้นหลังหลังรูปสินค้า</label>
                    <select className={inputCls} value={theme.product.imageBgKind} onChange={(e) => setProduct({ imageBgKind: e.target.value as ProductImageBgKind })}>
                      <option value="preset">สีตามตัวเลือก (สีแบรนด์จาง / สีพื้นการ์ด / ไม่มี)</option>
                      <option value="color">สีเดียว เลือกเอง</option>
                      <option value="gradient">ไล่สี 2 สี</option>
                      <option value="image">รูปภาพ</option>
                    </select>
                    {theme.product.imageBgKind === "preset" && (
                      <select className={`${inputCls} mt-1.5`} value={theme.product.imageBg} onChange={(e) => setProduct({ imageBg: e.target.value as ProductImageBg })}>
                        {(choices.productImageBgs ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                  <div>
                    {theme.product.imageBgKind === "color" && (
                      <>
                        <label className={labelCls}>สีพื้นหลัง</label>
                        <div className="flex items-center gap-2">
                          <ColorPicker value={theme.product.imageBgColor} onChange={(hex) => setProduct({ imageBgColor: hex })} />
                          <div className="h-9 flex-1 rounded-lg border border-slate-200" style={{ background: theme.product.imageBgColor }} title="ตัวอย่าง" />
                        </div>
                      </>
                    )}
                    {theme.product.imageBgKind === "gradient" && (
                      <>
                        <label className={labelCls}>ไล่สี (สีเริ่ม → สีปลาย · ทิศทาง)</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <ColorPicker value={theme.product.imageBgGradient.from} onChange={(hex) => setProduct({ imageBgGradient: { ...theme.product.imageBgGradient, from: hex } })} />
                          <span className="text-slate-400 text-xs">→</span>
                          <ColorPicker value={theme.product.imageBgGradient.to} onChange={(hex) => setProduct({ imageBgGradient: { ...theme.product.imageBgGradient, to: hex } })} />
                          <select className={inputCls} style={{ width: "auto" }} value={theme.product.imageBgGradient.angle} onChange={(e) => setProduct({ imageBgGradient: { ...theme.product.imageBgGradient, angle: Number(e.target.value) } })}>
                            {GRADIENT_ANGLES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </div>
                        <div className="h-9 mt-1.5 rounded-lg border border-slate-200" style={{ background: `linear-gradient(${theme.product.imageBgGradient.angle}deg, ${theme.product.imageBgGradient.from}, ${theme.product.imageBgGradient.to})` }} title="ตัวอย่าง" />
                      </>
                    )}
                  </div>
                  {theme.product.imageBgKind === "image" && (
                  <div className="sm:col-span-2">
                    <ImageUploadField
                      label="รูปพื้นหลังหลังรูปสินค้า"
                      hint="แนะนำรูปโทนอ่อน ไม่รก (เช่น พื้นผิวหนัง/ผ้า หรือฉากสตูดิโอ) กว้าง 1600px+ · ใช้กับทุกสินค้า"
                      value={theme.product.imageBgKey}
                      onChange={(k) => setProduct({ imageBgKey: k })}
                      previewBg={theme.colors.page}
                      height={64}
                    />
                  </div>
                  )}
                </div>
              )}

              {theme.product.layout === "showcase" && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelCls} style={{ marginBottom: 0 }}>ลำดับส่วนประกอบ (ลากที่ ⠿ เพื่อสลับ · ⚙️ เลือกจับคู่ข้อมูล · 👁️ ซ่อน/แสดง)</label>
                    {isMobileEdit ? (
                      (mob.sections || mob.hidden) && (
                        <button onClick={() => setMobile({ sections: null, hidden: null })} className="text-[11px] text-blue-600 hover:underline">มือถือ: ใช้ตามคอม</button>
                      )
                    ) : (
                      (JSON.stringify(theme.product.sections) !== JSON.stringify(published.product.sections) || theme.product.hidden.length > 0) && (
                        <button onClick={() => setProduct({ sections: ["gallery", "buy", "details", "banner", ...theme.product.parts.extraBanners.map((x) => extraBannerSection(x.id) as ProductSection), "related"], hidden: [] })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">คืนค่าเริ่มต้น</button>
                      )
                    )}
                  </div>
                  <ul className="space-y-1">
                    {pv.sections.map((k, i) => {
                      const xid = extraBannerId(k);
                      const xb = xid ? pv.parts.extraBanners.find((x) => x.id === xid) ?? null : null;
                      const meta = xb
                        ? { label: `🖼 ${xb.name}`, hint: `แบนเนอร์เพิ่ม · ${PART_CHOICES.bannerImages.find((o) => o.value === xb.imageSource)?.label ?? ""}`, hideable: true }
                        : (choices.productSections ?? []).find((x) => x.value === k);
                      const isHidden = pv.hidden.includes(k);
                      const hasPart = true;
                      const partOpen = openPart === k;
                      return (
                        <li key={k} {...sectionDrag.rowProps(i)} className={`rounded-lg border bg-white px-2 py-1.5 ${sectionDrag.rowCls(i)} ${isHidden ? "opacity-60" : ""} ${partOpen ? "border-blue-300" : "border-slate-200"}`}>
                        <div className="flex items-center gap-2">
                          <DragHandle {...sectionDrag.handleProps(i)} />
                          <span className="w-5 text-[11px] text-slate-400 text-center">{i + 1}</span>
                          <span className="flex-1 min-w-0">
                            <span className={`block text-sm ${isHidden ? "line-through text-slate-400" : "text-slate-800"}`}>{meta?.label ?? k}</span>
                            <span className="block text-[11px] text-slate-400 truncate">{meta?.hint}</span>
                          </span>
                          {hasPart ? (
                            <button
                              onClick={() => setOpenPart(partOpen ? null : k)}
                              title="เลือกว่าส่วนนี้จับคู่กับข้อมูลไหน / โชว์อะไรบ้าง"
                              className={`w-7 h-7 rounded-lg border text-xs ${partOpen ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                            >
                              ⚙️
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 px-1" title="ตั้งค่าที่กล่อง ชุดรายละเอียดสินค้า ด้านล่าง">↓ ด้านล่าง</span>
                          )}
                          {xb && !isMobileEdit && (
                            <button onClick={() => setDelExtra(xb)} title="ลบแบนเนอร์นี้" className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-400 hover:border-rose-300 hover:text-rose-600">🗑</button>
                          )}
                          {meta?.hideable ? (
                            <button
                              onClick={() => setHidden(isHidden ? pv.hidden.filter((x) => x !== k) : [...pv.hidden, k])}
                              title={isHidden ? "แสดงส่วนนี้" : "ซ่อนส่วนนี้"}
                              className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-500 hover:border-slate-400"
                            >
                              {isHidden ? "🚫" : "👁️"}
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 px-1" title="ส่วนหลัก ซ่อนไม่ได้">หลัก</span>
                          )}
                        </div>
                        {partOpen && (
                          <PartBoxControls
                            k={k}
                            value={theme.product.partBox[k]}
                            onChange={(p) => {
                              const base: PartBox = theme.product.partBox[k] ?? { width: "auto", spaceTop: "auto" };
                              const cur: PartBox = { ...base, ...p };
                              const next = { ...theme.product.partBox };
                              if (cur.width === "auto" && cur.spaceTop === "auto") delete next[k];
                              else next[k] = cur;
                              setProduct({ partBox: next });
                            }}
                            mobile={isMobileEdit}
                          />
                        )}
                        {partOpen && k === "details" && <p className="mt-2 text-[11px] text-slate-400">เนื้อหา/หัวข้อของรายละเอียด ตั้งที่กล่อง &quot;ชุดรายละเอียดสินค้า&quot; ด้านล่าง</p>}
                        {partOpen && k !== "details" && (
                          <PartSettings
                            part={k}
                            parts={pv.parts}
                            setPart={setPart}
                            mobile={isMobileEdit ? mob : null}
                            onResetMobile={(k) => (k === "buy" ? setMobile({ buyItems: null, buyColumns: null, buy: {} }) : setMobile({ [k]: {} } as Partial<ProductMobile>))}
                            onCopyBuyToMobile={() => setMobile({ buyItems: pv.parts.buy.items.map((it) => ({ ...it })), buyColumns: pv.parts.buy.columns, buy: {} })}
                            products={choices.products ?? []}
                            fields={choices.specFields ?? []}
                            fieldGroups={choices.fieldGroups}
                            imageFields={choices.imageFields ?? []}
                            onCreateImageField={() => setImgFieldCreator(true)}
                            imageFitValue={imageFitValue}
                            onImageFit={setImageFitValue}
                            pcImageFitLabel={fitLabel(theme.product.imageFit, theme.product.imageSize)}
                            onGalleryPreset={() => setProduct({ galleryStyle: "editorial", imageFit: "contain", imageSize: 90, parts: { ...theme.product.parts, gallery: { ...theme.product.parts.gallery, width: "full", height: "screen", perView: 2 } } })}
                            extra={xb}
                            setExtra={xb ? (p) => setExtraBanner(xb.id, p) : undefined}
                            previewBg={theme.colors.page}
                          />
                        )}
                        </li>
                      );
                    })}
                  </ul>
                  {isMobileEdit ? (
                    <p className="text-[11px] text-slate-400 mt-2">➕ เพิ่ม/ลบแบนเนอร์ได้ที่โหมด 🖥 คอม (มือถือจัดลำดับ/ซ่อนแยกได้)</p>
                  ) : pv.parts.extraBanners.length < MAX_EXTRA_BANNERS ? (
                    <button type="button" onClick={addExtraBanner} className="mt-2 w-full rounded-lg border border-dashed border-orange-300 text-orange-700 text-xs py-2 hover:bg-orange-50">
                      ＋ เพิ่มแบนเนอร์ <span className="text-orange-400">({pv.parts.extraBanners.length}/{MAX_EXTRA_BANNERS})</span>
                    </button>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-2">เพิ่มแบนเนอร์ได้สูงสุด {MAX_EXTRA_BANNERS} อัน</p>
                  )}
                  <ConfirmDialog
                    open={!!delExtra}
                    onClose={() => setDelExtra(null)}
                    onConfirm={() => { if (delExtra) removeExtraBanner(delExtra.id); setDelExtra(null); }}
                    title="ลบแบนเนอร์นี้?"
                    message={`ลบ "${delExtra?.name ?? ""}" ออกจากหน้าสินค้า — ยังไม่หายจากเว็บจริงจนกว่าจะกดเผยแพร่ (ย้อนได้ด้วยปุ่มเลิกทำ)`}
                    confirmText="ลบแบนเนอร์"
                    variant="danger"
                  />
                  {imgFieldCreator && (
                    <FieldCreatorModal
                      moduleKey="parent-skus-v2"
                      moduleTitle="Parent SKU"
                      onClose={() => setImgFieldCreator(false)}
                      onCreated={() => { setImgFieldCreator(false); void reloadImageFields(); toast.success("สร้างฟิลด์แล้ว — ไปอัปโหลดรูปในแต่ละ Parent SKU ได้เลย"); }}
                    />
                  )}
                </div>
              )}


              {theme.product.layout === "showcase" && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <label className={labelCls} style={{ marginBottom: 0 }}>ชุดรายละเอียดสินค้า — หัวข้อที่โชว์ใต้ราคา (พับเก็บ/แท็บ ตามที่เลือกด้านบน)</label>
                    <button
                      onClick={() => {
                        const id = `d${Date.now().toString(36).slice(-5)}`;
                        setProduct({ detailItems: [...theme.product.detailItems, { id, label: "หัวข้อใหม่", source: "text", fields: [], text: "", applyTo: "all", categories: [], products: [], enabled: true, defaultOpen: "auto" }] });
                        setOpenDetail(id);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                    >
                      + เพิ่มหัวข้อ
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2">ตั้งที่เดียว ใช้ทุกสินค้า · แต่ละหัวข้อเลือกได้ว่าเอาข้อมูลจากไหน และใช้กับรุ่นไหน · สินค้าที่ไม่มีข้อมูลในหัวข้อนั้น หัวข้อจะหายไปเอง</p>
                  <ul className="space-y-1.5">
                    {theme.product.detailItems.map((it, i) => {
                      const open = openDetail === it.id;
                      const src = (choices.detailSources ?? []).find((x) => x.value === it.source);
                      const scope = it.applyTo === "all" ? "ทุกสินค้า" : it.applyTo === "categories" ? `${it.categories.length} หมวด` : `${it.products.length} รุ่น`;
                      return (
                        <li key={it.id} {...detailDrag.rowProps(i)} className={`rounded-lg border border-slate-200 bg-white ${detailDrag.rowCls(i)} ${it.enabled ? "" : "opacity-60"}`}>
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <DragHandle {...detailDrag.handleProps(i)} />
                            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={it.enabled} onChange={(e) => setDetailItem(it.id, { enabled: e.target.checked })} title="แสดง/ซ่อนหัวข้อนี้" />
                            <button onClick={() => setOpenDetail(open ? null : it.id)} className="flex-1 min-w-0 text-left">
                              <span className={`block text-sm ${it.enabled ? "text-slate-800" : "line-through text-slate-400"}`}>{it.label}</span>
                              <span className="block text-[11px] text-slate-400 truncate">{src?.label ?? it.source} · {scope}</span>
                            </button>
                            {pv.detailsStyle === "accordion" && (
                              <select
                                value={isMobileEdit ? (mob.itemsOpen[it.id] ?? "__pc") : it.defaultOpen}
                                onChange={(e) => {
                                  if (!isMobileEdit) return setDetailItem(it.id, { defaultOpen: e.target.value as DetailOpen });
                                  const next = { ...mob.itemsOpen };
                                  if (e.target.value === "__pc") delete next[it.id];
                                  else next[it.id] = e.target.value as DetailOpen;
                                  setMobile({ itemsOpen: next });
                                }}
                                title="หัวข้อนี้เริ่มต้นพับหรือเปิด"
                                className={`h-7 rounded-lg border text-[11px] px-1.5 bg-white ${(isMobileEdit ? !mob.itemsOpen[it.id] : it.defaultOpen === "auto") ? "border-slate-200 text-slate-500" : "border-blue-300 text-blue-700"}`}
                              >
                                {isMobileEdit ? <option value="__pc">ตามคอม</option> : <option value="auto">ตามค่ารวม</option>}
                                <option value="open">▾ เปิดไว้</option>
                                <option value="closed">▸ พับไว้</option>
                              </select>
                            )}
                            <button onClick={() => setOpenDetail(open ? null : it.id)} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-500 hover:border-slate-400" title={open ? "พับ" : "ตั้งค่า"}>{open ? "▾" : "✎"}</button>
                            <button onClick={() => { if (confirm(`ลบหัวข้อ "${it.label}"?`)) setProduct({ detailItems: theme.product.detailItems.filter((x) => x.id !== it.id) }); }} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-400 hover:text-red-600 hover:border-red-300" title="ลบ">🗑️</button>
                          </div>
                          {open && (
                            <div className="border-t border-slate-100 px-3 py-3 grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className={labelCls}>ชื่อหัวข้อ</label>
                                <input className={inputCls} value={it.label} onChange={(e) => setDetailItem(it.id, { label: e.target.value })} maxLength={60} />
                              </div>
                              <div>
                                <label className={labelCls}>เอาข้อมูลจาก</label>
                                <select className={inputCls} value={it.source} onChange={(e) => setDetailItem(it.id, { source: e.target.value as DetailSource })}>
                                  {(choices.detailSources ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                {src?.hint && <p className="text-[11px] text-slate-400 mt-1">{src.hint}</p>}
                              </div>
                              {it.source === "fields" && (
                                <div className="sm:col-span-2">
                                  <label className={labelCls}>ฟิลด์ที่โชว์ ({it.fields.length}) — เรียงตามที่เลือก</label>
                                  <FieldChipsPicker
                                    value={it.fields}
                                    onChange={(f) => setDetailItem(it.id, { fields: f })}
                                    fields={choices.specFields ?? []}
                                    groups={choices.fieldGroups}
                                    description="ติ๊กฟิลด์ที่จะโชว์ในหัวข้อนี้ — เรียงตามลำดับที่ติ๊ก · ฟิลด์ที่สินค้าไม่ได้กรอกจะไม่โชว์เอง"
                                  />
                                  <p className="text-[11px] text-slate-400 mt-1">เลือกได้ทุกฟิลด์ของ Parent SKU (ยกเว้นต้นทุน/ข้อมูลภายใน) · ช่องที่ว่างจะไม่โชว์ · เปลี่ยนป้ายชื่อได้ที่ทะเบียนฟิลด์กลาง</p>
                                  {/* 📏 หัวข้อที่มีฟิลด์ขนาด → ปุ่มเทียบขนาด (เว็บร้าน: SIZE_FIELD_KEYS ใน src/lib/product-details.ts) */}
                                  {it.fields.some((k) => ["size_summary", "custom_size", "size_length_cm", "size_height_cm", "size_thickness_cm"].includes(k)) && (
                                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-2">
                                      <input type="checkbox" className="accent-orange-500" checked={it.sizeCompare !== false} onChange={(e) => setDetailItem(it.id, { sizeCompare: e.target.checked })} />
                                      📏 ปุ่ม &quot;เทียบขนาด&quot; (ป๊อปภาพเทียบกับ มือถือ / iPad / A4 / โน้ตบุ๊ก / ขวดน้ำ · ใช้ กว้าง/สูง/หนา ของสินค้า)
                                    </label>
                                  )}
                                </div>
                              )}
                              {it.source === "text" && (
                                <div className="sm:col-span-2">
                                  <label className={labelCls}>ข้อความ</label>
                                  <textarea className={`${inputCls} min-h-[96px]`} value={it.text} onChange={(e) => setDetailItem(it.id, { text: e.target.value })} maxLength={4000} placeholder={"เช่น รับประกันงานเย็บ 6 เดือน\nเช็ดด้วยผ้าแห้ง หลีกเลี่ยงแสงแดดจัด"} />
                                  <p className="text-[11px] text-slate-400 mt-1">ขึ้นบรรทัดใหม่ได้ · ใช้กับทุกรุ่นที่เลือกด้านล่าง</p>
                                </div>
                              )}
                              {it.source === "dimensions" && (
                                <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2">
                                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input type="checkbox" className="accent-orange-500" checked={it.showInch !== false} onChange={(e) => setDetailItem(it.id, { showInch: e.target.checked })} />
                                    โชว์เป็นนิ้วด้วย (ระบบแปลงให้เอง)
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-1">
                                    <input type="checkbox" className="accent-orange-500" checked={it.sizeCompare !== false} onChange={(e) => setDetailItem(it.id, { sizeCompare: e.target.checked })} />
                                    📏 ปุ่ม &quot;เทียบขนาด&quot; (ป๊อปภาพเทียบกับ มือถือ / iPad / A4 / โน้ตบุ๊ก / ขวดน้ำ)
                                  </label>
                                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                    ตัวอย่าง: • ใส่ได้: สมาร์ทโฟน (ถึง 6.7 นิ้ว), กระเป๋าสตางค์ (ใบยาว) · • กว้าง: 23 ซม.{it.showInch !== false ? ' | 9.1"' : ""} · • ความยาวสายสะพาย: 50–60 ซม. (ปรับได้){it.showInch !== false ? ' | 19.7–23.6"' : ""}
                                  </p>
                                  <p className="text-[11px] text-slate-400 mt-1">ข้อมูลมาจากหน้า Parent SKU: กว้าง/สูง/หนา · ความสูงหูหิ้ว · ความยาวสายสะพาย (+ ปรับได้ถึง) · ใส่อะไรได้บ้าง</p>
                                </div>
                              )}
                              <div>
                                <label className={labelCls}>ใช้กับรุ่นไหน</label>
                                <select className={inputCls} value={it.applyTo} onChange={(e) => setDetailItem(it.id, { applyTo: e.target.value as DetailApply })}>
                                  <option value="all">ทุกสินค้า</option>
                                  <option value="categories">เฉพาะหมวด</option>
                                  <option value="products">เลือกเป็นรายตัว</option>
                                </select>
                              </div>
                              {it.applyTo === "categories" && (
                                <div>
                                  <label className={labelCls}>หมวด ({it.categories.length})</label>
                                  <div className="flex flex-wrap gap-1.5">
                                    {(choices.categories ?? []).map((c) => {
                                      const on = it.categories.includes(c.key);
                                      return (
                                        <button key={c.key} onClick={() => setDetailItem(it.id, { categories: on ? it.categories.filter((k) => k !== c.key) : [...it.categories, c.key] })} className={`px-2.5 py-1 rounded-full border text-xs ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                                          {on ? "✓ " : ""}{c.label}
                                        </button>
                                      );
                                    })}
                                    {!(choices.categories ?? []).length && <span className="text-[11px] text-slate-400">ยังไม่มีหมวด — ตั้งที่แท็บจับคู่ฟิลด์</span>}
                                  </div>
                                </div>
                              )}
                              {it.applyTo === "products" && (
                                <div className="sm:col-span-2">
                                  <label className={labelCls}>รุ่นที่ใช้ ({it.products.length} รุ่น)</label>
                                  <input className={`${inputCls} mb-1.5`} value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} placeholder="ค้นหารหัส/ชื่อรุ่น" />
                                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                                    {(choices.products ?? [])
                                      .filter((pr) => !prodQuery.trim() || `${pr.code} ${pr.name}`.toLowerCase().includes(prodQuery.trim().toLowerCase()))
                                      .slice(0, 80)
                                      .map((pr) => {
                                        const on = it.products.includes(pr.code.toUpperCase());
                                        return (
                                          <label key={pr.code} className="flex items-center gap-2 px-2 py-1 text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
                                            <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={on} onChange={(e) => setDetailItem(it.id, { products: e.target.checked ? [...it.products, pr.code.toUpperCase()] : it.products.filter((k) => k !== pr.code.toUpperCase()) })} />
                                            <span className="font-mono text-[11px] text-slate-500">{pr.code}</span>
                                            <span className="truncate">{pr.name}</span>
                                          </label>
                                        );
                                      })}
                                    {!(choices.products ?? []).length && <p className="px-2 py-2 text-[11px] text-slate-400">ยังไม่มีสินค้าบนเว็บร้านนี้</p>}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                    {!theme.product.detailItems.length && <li className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">ยังไม่มีหัวข้อ — กด "+ เพิ่มหัวข้อ"</li>}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-slate-400 mt-3">ดูผล: พรีวิวด้านขวาเปิด &quot;หน้าสินค้า (ตัวอย่าง)&quot; ให้แล้ว (เลือกหน้าอื่นได้จากเมนูบนพรีวิว) — ยังไม่ขึ้นเว็บจริงจนกว่าจะกดเผยแพร่</p>
            </div>
          )}

          {/* ── รูปทรง ── */}
          {/* ── หน้ารายการสินค้า: รูปแทรกในกริด ── */}
          {tab === "listing" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">หน้ารายการสินค้า — แทรกรูปในกริดสินค้า</h3>
              <ListingPanel value={theme.listing} onChange={(listing) => apply({ ...theme, listing })} categories={choices.categories ?? []} products={choices.products ?? []} fields={choices.specFields ?? []} linkCtx={linkCtx} />
            </div>
          )}

          {tab === "shape" && (
            <>
              {/* ✨ การเคลื่อนไหวทั้งเว็บ — เว็บร้าน: PageMotion + ::view-transition (globals.css) */}
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">✨ การเคลื่อนไหวทั้งเว็บ</h3>
                <p className="text-xs text-slate-500 mb-3">ตอนลูกค้ากดไปหน้าอื่น · ลูกค้าที่ตั้งเครื่องให้ลดการเคลื่อนไหว จะไม่เห็นแอนิเมชันเสมอ</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {([
                    ["fade", "จางเปลี่ยนหน้า", "หน้าเก่าจางออก หน้าใหม่จางเข้า (แนะนำ)"],
                    ["rise", "เลื่อนขึ้น", "หน้าใหม่ลอยขึ้นพร้อมจางเข้า ดูหรูขึ้น"],
                    ["none", "ไม่มี", "เปลี่ยนหน้าทันที"],
                  ] as const).map(([v, l, d]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => apply({ ...theme, page: { ...theme.page, transition: v } })}
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition ${theme.page.transition === v ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    >
                      <span className="block font-medium">{l}</span>
                      <span className="block text-[11px] text-slate-500">{d}</span>
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.page.smoothScroll} onChange={(e) => apply({ ...theme, page: { ...theme.page, smoothScroll: e.target.checked } })} />
                  เลื่อนจอนุ่ม (Smooth scroll)
                </label>
                <p className="text-[11px] text-slate-400 mt-1">เลื่อนลูกกลิ้งเมาส์แล้วหน้าเว็บไหลนุ่มแบบเว็บแบรนด์หรู · ใช้กับคอมที่ใช้เมาส์/ทัชแพด (มือถือเลื่อนแบบปกติ) · ไม่ทำงานในพรีวิวนี้ — ดูผลบนเว็บจริง</p>
              </div>
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">ความมนของขอบ (ค่ารวมทั้งเว็บ)</h3>
                <div className="flex flex-wrap gap-2">
                  {choices.radius.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => apply({ ...theme, radius: o.value })}
                      className={`px-4 py-3 border text-sm transition ${theme.radius === o.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                      style={{ borderRadius: o.value === "sharp" ? 2 : o.value === "soft" ? 12 : 22 }}
                    >
                      {o.label}
                    </button>
                  ))}
                  <ResetBtn show={theme.radius !== published.radius} onClick={() => apply({ ...theme, radius: published.radius })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3 mt-4 pt-3 border-t border-slate-100">
                  {([
                    ["cardRadius", "ขอบการ์ด/กล่อง"],
                    ["imageRadius", "ขอบรูปบนการ์ด"],
                    ["inputRadius", "ขอบช่องกรอก"],
                  ] as const).map(([k, label]) => (
                    <div key={k}>
                      <label className={labelCls}>{label}</label>
                      <WheelSelect value={theme.shape[k] == null ? "" : String(theme.shape[k])} onChange={(e) => setShape({ [k]: e.target.value === "" ? null : Number(e.target.value) } as Partial<Shape>)}>
                        <option value="">ตามค่ารวม</option>
                        {RADIUS_PX_CHOICES.map((n) => <option key={n} value={n}>{n === 0 ? "เหลี่ยม (0)" : `${n} px`}</option>)}
                      </WheelSelect>
                    </div>
                  ))}
                </div>
              </div>

              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3">ปุ่ม · เส้นขอบ · เงา</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>รูปทรงปุ่ม</label>
                    <div className="flex flex-wrap gap-2">
                      {BUTTON_SHAPES.map((o) => (
                        <button key={o.value} onClick={() => setShape({ button: o.value })} className={`px-3.5 py-2 border text-xs transition ${theme.shape.button === o.value ? "border-blue-600 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-600 hover:border-slate-400"}`} style={{ borderRadius: o.value === "pill" ? 99 : o.value === "rounded" ? 10 : 2 }}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>ขนาดปุ่ม</label>
                    <WheelSelect value={theme.shape.buttonSize} onChange={(e) => setShape({ buttonSize: e.target.value as Shape["buttonSize"] })}>
                      {BUTTON_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </WheelSelect>
                  </div>
                  <div>
                    <label className={labelCls}>ความหนาเส้นขอบ (การ์ด/ช่องกรอก)</label>
                    <WheelSelect value={theme.shape.borderWidth} onChange={(e) => setShape({ borderWidth: Number(e.target.value) === 2 ? 2 : 1 })}>
                      <option value={1}>บาง (1 px)</option>
                      <option value={2}>หนา (2 px)</option>
                    </WheelSelect>
                  </div>
                  <div>
                    <label className={labelCls}>เงาของการ์ด</label>
                    <WheelSelect value={theme.shape.shadow} onChange={(e) => setShape({ shadow: e.target.value as Shape["shadow"] })}>
                      {SHADOW_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </WheelSelect>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <p className={labelCls}>ตัวอย่าง (ปุ่ม · ช่องกรอก · การ์ด)</p>
                  <div className="flex flex-wrap items-center gap-3 rounded-xl p-4" style={{ background: theme.colors.page }}>
                    {(() => {
                      const r = theme.radius === "sharp" ? { sm: 2, lg: 4 } : theme.radius === "soft" ? { sm: 8, lg: 20 } : { sm: 14, lg: 30 };
                      const br = theme.shape.button === "pill" ? 99 : theme.shape.button === "rounded" ? 10 : 2;
                      const pad = theme.shape.buttonSize === "sm" ? "8px 16px" : theme.shape.buttonSize === "lg" ? "14px 28px" : "11px 22px";
                      const fs = theme.shape.buttonSize === "sm" ? 10 : theme.shape.buttonSize === "lg" ? 13 : 11;
                      const shadow = theme.shape.shadow === "none" ? "none" : theme.shape.shadow === "soft" ? "0 1px 2px rgba(20,21,23,.06)" : "0 12px 32px rgba(20,21,23,.14)";
                      const tr = theme.typography.button;
                      const btnFont = { fontFamily: `"${tr.font || theme.fonts.body}", sans-serif`, fontWeight: tr.weight, letterSpacing: `${tr.spacing / 100}em`, textTransform: tr.uppercase ? ("uppercase" as const) : ("none" as const), fontStyle: tr.italic ? "italic" : "normal" };
                      return (
                        <>
                          <span className="text-white" style={{ background: theme.colors.brand, borderRadius: br, padding: pad, fontSize: fs, ...btnFont }}>เพิ่มลงตะกร้า</span>
                          <span style={{ border: `1px solid #D6D6D2`, color: theme.colors.ink, borderRadius: br, padding: pad, fontSize: fs, ...btnFont }}>ดูเพิ่มเติม</span>
                          <span className="text-xs text-slate-400 px-3 py-2 bg-white" style={{ border: `${theme.shape.borderWidth}px solid #DEDEDA`, borderRadius: theme.shape.inputRadius ?? r.sm, minWidth: 120 }}>ช่องกรอก…</span>
                          <span className="inline-block w-24 h-16" style={{ background: theme.colors.surface, border: `${theme.shape.borderWidth}px solid #e7e7e4`, borderRadius: theme.shape.cardRadius ?? r.lg, boxShadow: shadow }} />
                          <span className="inline-block w-16 h-16 bg-slate-300" style={{ borderRadius: theme.shape.imageRadius ?? r.lg }} />
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── ประวัติ ── */}
          {tab === "history" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">ประวัติการเผยแพร่</h3>
              {!versions.length ? (
                <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีประวัติ — จะบันทึกทุกครั้งที่กดเผยแพร่</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {versions.map((v) => (
                    <li key={v.versionNo} className="flex items-center gap-3 py-2.5">
                      <span className="text-xs text-slate-400 w-10">#{v.versionNo}</span>
                      <span className="flex gap-1">
                        {[v.theme.colors.brand, v.theme.colors.ink, v.theme.colors.page].map((c, i) => (
                          <span key={i} style={{ background: c, width: 14, height: 14, borderRadius: 4, border: "1px solid rgba(0,0,0,.1)" }} />
                        ))}
                      </span>
                      <span className="flex-1 text-xs text-slate-600">
                        {v.theme.fonts.display} / {v.theme.fonts.body} · {timeAgo(v.createdAt)}
                      </span>
                      <button onClick={() => void restore(v.versionNo)} className="text-xs text-blue-600 hover:underline">กู้คืนเป็นร่าง</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── ขวา: พรีวิวเว็บจริง ── */}
        <div className="lg:sticky lg:top-4 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {DEVICES.map((d) => (
              <button key={d.k} onClick={() => setDevice(d.k)} title={`${d.label} ${d.w}px`} className={`px-2.5 py-1 rounded-lg border text-xs transition ${device === d.k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                {d.icon}
              </button>
            ))}
            <select value={page} onChange={(e) => setPage(e.target.value)} className={inputCls} style={{ width: "auto" }}>
              {[...PAGES, ...(sampleProduct ? [{ path: `/product/${sampleProduct}`, label: "หน้าสินค้า (ตัวอย่าง)" }] : [])].map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
            </select>
            <select
              value={String(zoom)}
              onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as Zoom))}
              title="ขนาดที่แสดง"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
            >
              <option value="fit">พอดีจอ</option>
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
            </select>
            {previewSrc && <a href={previewSrc} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↗</a>}
            <button onClick={() => iframeRef.current?.contentWindow?.location.reload()} title="โหลดใหม่" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↻</button>
            <span className="text-[10px] text-slate-400 ml-auto">{dev.w}px · {Math.round(scale * 100)}%</span>
          </div>

          {/* 🔗 ลิงก์พรีวิว — คัดลอกส่งทีม/เปิดบนมือถือ เห็น "ร่างที่บันทึกแล้ว" ก่อนเผยแพร่ (ลูกค้าทั่วไปไม่เห็น) */}
          {previewSrc && (
            <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 shrink-0">🔗 ลิงก์พรีวิว</span>
                <input readOnly value={previewSrc} onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600" />
                <CopyButton value={previewSrc} label="คัดลอก" title="คัดลอกลิงก์พรีวิว (ส่งให้ทีม หรือเปิดในมือถือ)" />
                <a href={previewSrc} target="_blank" rel="noreferrer" title="เปิดในแท็บใหม่" className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-400">↗</a>
              </div>
              <p className={`mt-1 text-[10px] ${isDirty ? "text-amber-700" : "text-slate-400"}`}>
                {isDirty
                  ? "⚠️ มีการแก้ที่ยังไม่ได้กด \"บันทึกร่าง\" — คนเปิดลิงก์จะยังไม่เห็นส่วนนี้"
                  : "คนเปิดลิงก์จะเห็นร่างล่าสุดที่บันทึกไว้ (ยังไม่เผยแพร่) · ลูกค้าทั่วไปยังเห็นแบบเดิม"}
              </p>
            </div>
          )}

          <div ref={previewBoxRef} className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: "72vh", minHeight: 420 }}>
            {previewSrc ? (
              <div className="w-full h-full overflow-auto py-2">
                {/* กล่องนอกกว้างเท่า "ขนาดหลังย่อ" — transform ไม่ย่อกล่อง layout ถ้าไม่ครอบแบบนี้จะเหลือที่ว่างมหาศาล */}
                <div style={{ width: dev.w * scale, height: frameH * scale, margin: "0 auto", overflow: "hidden" }}>
                  <iframe
                    ref={iframeRef}
                    src={previewSrc}
                    title="พรีวิวเว็บไซต์"
                    className="bg-white border-0 shadow-sm"
                    style={{
                      width: dev.w,
                      height: frameH,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      // ⚠️ สำคัญ: ถ้าไม่ล็อก iframe จะโดนบีบให้แคบตามกล่อง → เว็บข้างในสลับไปหน้าตามือถือ
                      flexShrink: 0,
                      display: "block",
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                <span className="text-3xl">🔗</span>
                <p className="text-sm text-slate-500">ยังไม่ได้ผูกโดเมนเว็บกับร้านนี้</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">
            สี/ฟอนต์เปลี่ยนทันที · โลโก้/Header/การ์ด กด ↻ หลังบันทึกร่างเพื่อดูผล
          </p>
        </div>
      </div>

      {/* ── แถบปุ่มล่าง ── */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs text-slate-500">
          {isDirty ? (
            <>
              มีการแก้ไขที่ยังไม่บันทึก <span className="font-medium text-amber-700">{dirtyFields.length} รายการ</span>
              <span className="text-slate-400"> · {dirtyFields.slice(0, 3).join(", ")}{dirtyFields.length > 3 ? "…" : ""}</span>
            </>
          ) : hadDraft ? "มีร่างบันทึกไว้ — ยังไม่เผยแพร่" : "ไม่มีการเปลี่ยนแปลง"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void discard()} disabled={!isDirty && !hadDraft} className="px-3.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40">ละทิ้งการเปลี่ยนแปลง</button>
          <button onClick={() => void save("draft")} disabled={busy !== null} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:border-slate-500 disabled:opacity-50">
            {busy === "draft" ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </button>
          <button onClick={() => void save("publish")} disabled={busy !== null} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}
          </button>
        </div>
      </div>

    </div>
  );
}

/* ─────────── ⚙️ ตั้งค่าต่อส่วนประกอบของหน้าสินค้า (จับคู่ข้อมูล) ─────────── */
const partInputCls = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-400 bg-white";
function PartToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-blue-600" />
      {label}
    </label>
  );
}
/** 📐 ความกว้าง + ระยะห่างด้านบน ของส่วนประกอบหน้าสินค้า (ของกลาง ทุกส่วน · lib/website-theme PartBox) */
function PartBoxControls({ k, value, onChange, mobile }: { k: string; value?: PartBox; onChange: (p: Partial<PartBox>) => void; mobile: boolean }) {
  const v: PartBox = { width: "auto", spaceTop: "auto", ...value };
  return (
    <div className="mt-2 pt-2 border-t border-slate-100 grid gap-2 sm:grid-cols-2">
      {partHasWidth(k) ? (
        <label className="block">
          <span className="block text-[11px] text-slate-500 mb-1">ความกว้าง</span>
          <WheelSelect value={v.width} onChange={(e) => onChange({ width: e.target.value as PartBox["width"] })} highlight={!!(v.width !== "auto")}>
            {PART_WIDTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </WheelSelect>
        </label>
      ) : (
        <p className="text-[11px] text-slate-400 self-end pb-1.5">ความกว้างของส่วนนี้ตั้งในตัวเลือกด้านล่าง (เต็มจอ/ในกรอบ)</p>
      )}
      <label className="block">
        <span className="block text-[11px] text-slate-500 mb-1">ระยะห่างจากส่วนด้านบน</span>
        <WheelSelect value={v.spaceTop} onChange={(e) => onChange({ spaceTop: e.target.value as PartBox["spaceTop"] })} highlight={!!(v.spaceTop !== "auto")}>
          {PART_SPACE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </WheelSelect>
      </label>
      {mobile && <p className="sm:col-span-2 text-[11px] text-blue-700">📱 ใช้ค่าเดียวกับคอม — มือถือระยะห่างย่อลงให้เองตามจอ</p>}
    </div>
  );
}

function PartSettings({
  part,
  parts,
  setPart,
  products,
  fields = [],
  fieldGroups,
  imageFields = [],
  onCreateImageField,
  onGalleryPreset,
  imageFitValue,
  onImageFit,
  pcImageFitLabel,
  extra = null,
  setExtra,
  previewBg,
  mobile = null,
  onResetMobile,
  onCopyBuyToMobile,
}: {
  part: ProductSection;
  parts: ProductParts;
  setPart: <K extends keyof ProductParts>(k: K, p: Partial<ProductParts[K]>) => void;
  products: { code: string; name: string }[];
  /** ฟิลด์ Parent SKU (จากทะเบียนฟิลด์) ให้คำอธิบายย่อเลือกดึง */
  fields?: { key: string; label: string; group?: string }[];
  fieldGroups?: Record<string, string>;
  /** ฟิลด์รูปของ Parent SKU (แบนเนอร์ source = field) */
  imageFields?: { key: string; label: string }[];
  /** เปิดตัวสร้างฟิลด์ใหม่ใน Parent SKU (ชนิดรูปภาพ) */
  onCreateImageField?: () => void;
  /** ✨ ตั้งแกลเลอรีแบบเต็มจอในคลิกเดียว (แตะค่าระดับหน้าสินค้าด้วย จึงให้ผู้เรียกทำ) */
  onGalleryPreset?: () => void;
  /** การแสดงรูป (ตัด/ไม่ตัด) — ค่าระดับหน้าสินค้า ผู้เรียกจัดการคอม/มือถือ */
  imageFitValue?: string;
  onImageFit?: (v: string) => void;
  pcImageFitLabel?: string;
  /** แบนเนอร์เพิ่ม (part = banner:<id>) */
  extra?: ExtraBanner | null;
  setExtra?: (p: Partial<ExtraBanner>) => void;
  previewBg: string;
  /** กำลังตั้งค่าสำหรับมือถือ → ค่ามือถือที่ตั้งแยกไว้ (null = กำลังตั้งคอม) */
  mobile?: ProductMobile | null;
  onResetMobile?: (k: "gallery" | "buy" | "banner" | "related") => void;
  /** มือถือ: คัดลอกชุดราคา-ตะกร้าของคอมมาตั้งแยก */
  onCopyBuyToMobile?: () => void;
}) {
  const [q, setQ] = useState("");
  const lbl = "block text-[11px] text-slate-500 mb-1";
  const mobileCount = (k: "gallery" | "buy" | "banner" | "related") =>
    !mobile ? 0 : k === "buy" ? (mobile.buyItems ? 1 : 0) + (mobile.buyColumns ? 1 : 0) + Object.keys(mobile.buy).length : Object.keys(mobile[k]).length;
  const mobileNote = (k: "gallery" | "buy" | "banner" | "related") =>
    mobile ? (
      <div className="flex items-center justify-between gap-2 text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2 py-1">
        <span>📱 ค่าสำหรับมือถือ{mobileCount(k) ? ` (ตั้งแยกไว้ ${mobileCount(k)} ${k === "buy" ? "รายการ" : "ช่อง"})` : " — ยังตามคอมทั้งหมด (แก้ช่องไหน = ตั้งแยกช่องนั้น)"}</span>
        {mobileCount(k) > 0 && <button type="button" onClick={() => onResetMobile?.(k)} className="hover:underline">ใช้ตามคอม</button>}
      </div>
    ) : null;
  if (part === "gallery") {
    const g = parts.gallery;
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
        {mobileNote("gallery")}
        {!mobile && (
        <div>
          <label className={lbl}>จอคอมโชว์กี่รูปพร้อมกัน (แกลเลอรีเลื่อนซ้าย-ขวา · มือถือทีละรูปเสมอ)</label>
          <WheelSelect value={g.perView} onChange={(e) => setPart("gallery", { perView: Number(e.target.value) === 2 ? 2 : 1 })}>
            {PART_CHOICES.perViews.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </WheelSelect>
        </div>
        )}
        <div>
          <label className={lbl}>กดเลือกสีแล้วรูปใหญ่ทำอย่างไร</label>
          <select className={partInputCls} value={g.colorMode} onChange={(e) => setPart("gallery", { colorMode: e.target.value as ProductParts["gallery"]["colorMode"] })}>
            {PART_CHOICES.colorModes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{PART_CHOICES.colorModes.find((o) => o.value === g.colorMode)?.hint}</p>
        </div>
        {onImageFit && (
          <div>
            <label className={lbl}>การแสดงรูป</label>
            <WheelSelect warn={!!(imageFitValue === "cover")} value={imageFitValue ?? ""} onChange={(e) => onImageFit(e.target.value)}>
              {mobile && <option value="__pc">ตามคอม ({pcImageFitLabel})</option>}
              <option value="auto">อัตโนมัติตามรูป — รูปนายแบบเต็มกรอบ · รูปที่ต้องตัดเยอะย่อพอดี</option>
              {PRODUCT_IMAGE_SIZES.filter((o) => o.value !== "cover" && o.value !== "auto").map((o) => (
                <option key={o.value} value={o.value}>เห็นรูปครบทั้งใบ — ไม่ตัดรูป ({o.value}% ของกรอบ)</option>
              ))}
              {imageFitValue && imageFitValue !== "cover" && imageFitValue !== "auto" && imageFitValue !== "__pc" && !PRODUCT_IMAGE_SIZES.some((o) => o.value === imageFitValue) && (
                <option value={imageFitValue}>เห็นรูปครบทั้งใบ ({imageFitValue}%)</option>
              )}
              <option value="cover">เต็มกรอบ — ตัดขอบรูปให้เต็มพื้นที่</option>
            </WheelSelect>
            {imageFitValue === "cover" && <p className="text-[11px] text-amber-600 mt-1">⚠️ รูปจะถูกตัดบน-ล่าง/ซ้าย-ขวาให้เต็มกรอบ — เลือก “เห็นรูปครบทั้งใบ” ถ้าไม่อยากให้ตัด</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>ความกว้างแกลเลอรี</label>
            <WheelSelect value={g.width} onChange={(e) => setPart("gallery", { width: e.target.value as ProductParts["gallery"]["width"] })}>
              {PART_CHOICES.galleryWidths.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className={lbl}>ความสูงแกลเลอรี</label>
            <WheelSelect value={g.height} onChange={(e) => setPart("gallery", { height: e.target.value as ProductParts["gallery"]["height"] })}>
              {PART_CHOICES.galleryHeights.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </WheelSelect>
          </div>
        </div>
        {!mobile && onGalleryPreset && (
          <button type="button" onClick={onGalleryPreset} className="w-full text-xs rounded-lg border border-dashed border-blue-300 text-blue-700 py-1.5 hover:bg-blue-50">
            ✨ ตั้งแบบเต็มจอ (Gucci): เต็มขอบจอ · สูงเต็มจอ · 2 รูปคู่กัน · เห็นรูปครบทั้งใบ (ไม่ตัดรูป)
          </button>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <PartToggle label="เส้นทางหน้า (หน้าแรก / สินค้า / หมวด)" on={g.showBreadcrumb} onChange={(v) => setPart("gallery", { showBreadcrumb: v })} />
          <PartToggle label="ชื่อรุ่นตัวใหญ่เหนือรูป" on={g.showTitle} onChange={(v) => setPart("gallery", { showTitle: v })} />
          <PartToggle label="ชื่อรองใต้ชื่อรุ่น" on={g.showSubtitle} onChange={(v) => setPart("gallery", { showSubtitle: v })} />
          {!mobile && <PartToggle label="แถบลอยล่างรูป (ชื่อ · สี · ราคา · ใส่ตะกร้า) — หายเมื่อเลื่อนลง (จอคอม)" on={g.bar} onChange={(v) => setPart("gallery", { bar: v })} />}
        </div>
        <p className="text-[11px] text-slate-400">รูปมาจากไหน (ปก Parent / SKU ลูก) ตั้งที่แท็บ ⚙️ จับคู่ฟิลด์ · รูปรายสีหลายรูป ตั้งที่ Parent SKU → แท็บ 🛍 เว็บไซต์</p>
      </div>
    );
  }
  if (part === "buy") {
    const b = parts.buy;
    if (mobile && !mobile.buyItems) {
      // โหมดมือถือ ยังตามคอม: ให้กดคัดลอกชุดของคอมมาตั้งแยกก่อน (จะได้แก้ทุกอย่างได้เหมือนคอม)
      return (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
          {mobileNote("buy")}
          <div className="rounded-lg border border-dashed border-blue-200 p-3 text-center">
            <p className="text-xs text-slate-600 mb-2">มือถือใช้ชุดชิ้นส่วนเดียวกับคอมอยู่ (เรียงเป็นคอลัมน์เดียว ซ้ายก่อนขวา)</p>
            <button type="button" onClick={() => onCopyBuyToMobile?.()} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">📱 ตั้งแยกสำหรับมือถือ (คัดลอกค่าคอมมาแก้)</button>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
        {mobileNote("buy")}
        <BuyItemsEditor buy={b} onChange={(p) => setPart("buy", p)} fields={fields} />
      </div>
    );
  }
  if (part === "banner" || extra) {
    const bn: BannerPart = extra ?? parts.banner;
    const set = (p: Partial<ExtraBanner>) => (extra ? setExtra?.(p) : setPart("banner", p));
    const needsIndex = bn.imageSource === "nth" || bn.imageSource === "parent";
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2.5">
        {extra ? (
          <div className="flex items-center gap-2">
            <label className={`${lbl} mb-0 shrink-0`}>ชื่อในรายการ</label>
            <input className={partInputCls} value={extra.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="เช่น แบนเนอร์ไลฟ์สไตล์" />
          </div>
        ) : (
          mobileNote("banner")
        )}
        {extra && mobile && <p className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2 py-1">📱 แบนเนอร์เพิ่มใช้ค่าเดียวกันทั้งคอมและมือถือ — สัดส่วนบนมือถือตั้งได้ที่ช่อง “มือถือ” ใน 📐 ขนาด</p>}

        {/* 🖼 รูป */}
        <div>
          <label className={lbl}>รูปแบนเนอร์เอาจาก</label>
          <div className="flex gap-1.5">
            <select className={partInputCls} value={bn.imageSource} onChange={(e) => set({ imageSource: e.target.value as BannerPart["imageSource"] })}>
              {PART_CHOICES.bannerImages.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {needsIndex && (
              <label className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                รูปที่
                <input type="number" min={1} max={20} value={bn.imageIndex} onChange={(e) => set({ imageIndex: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} className="w-14 rounded-lg border border-slate-200 px-1.5 py-1.5 text-xs text-center" />
              </label>
            )}
          </div>
          {bn.imageSource === "field" && (
            <div className="mt-1.5 space-y-1">
              <div className="flex gap-1.5">
                <select className={partInputCls} value={bn.imageField} onChange={(e) => set({ imageField: e.target.value })}>
                  <option value="">— เลือกฟิลด์รูป —</option>
                  {imageFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                {onCreateImageField && (
                  <button type="button" onClick={onCreateImageField} className="shrink-0 text-[11px] px-2 rounded-lg border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-700" title="เพิ่มฟิลด์ชนิดรูปภาพให้ Parent SKU">＋ ฟิลด์รูปใหม่</button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">อัปโหลดรูปต่อรุ่นในหน้า Parent SKU (ช่องของฟิลด์นี้) · รุ่นที่ยังไม่มีรูปในช่องนี้ = ไม่โชว์แบนเนอร์</p>
            </div>
          )}
          {bn.imageSource === "fixed" && (
            <div className="mt-1.5">
              <ImageUploadField label="รูปกลาง (ใช้ทุกสินค้า)" hint="แนะนำแนวนอน 16:10" value={bn.imageKey} onChange={(k) => set({ imageKey: k })} previewBg={previewBg} height={56} />
            </div>
          )}
          {bn.imageSource !== "field" && <p className="text-[11px] text-slate-400 mt-1">ไม่มีรูปตามแหล่งที่เลือก = ส่วนนี้ไม่โชว์สำหรับสินค้านั้น</p>}
        </div>

        {/* 📐 ขนาด */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>📐 ความกว้าง</label>
            <WheelSelect value={bn.width} onChange={(e) => set({ width: e.target.value as BannerPart["width"] })}>
              {PART_CHOICES.bannerWidths.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className={lbl}>สัดส่วนรูป · คอม</label>
            <select className={partInputCls} value={bn.ratio} onChange={(e) => set({ ratio: e.target.value as BannerPart["ratio"] })}>
              {PART_CHOICES.bannerRatios.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>สัดส่วนรูป · มือถือ</label>
            <select className={partInputCls} value={bn.ratioMobile} onChange={(e) => set({ ratioMobile: e.target.value as BannerPart["ratioMobile"] })}>
              <option value="same">เท่าคอม</option>
              {PART_CHOICES.bannerRatios.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* ✍️ ข้อความ + จัดวาง */}
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className={lbl}>หัวข้อ</label>
            <select className={partInputCls} value={bn.titleSource} onChange={(e) => set({ titleSource: e.target.value as BannerPart["titleSource"] })}>
              {PART_CHOICES.bannerTitles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {bn.titleSource === "text" && <input className={`${partInputCls} mt-1.5`} value={bn.titleText} onChange={(e) => set({ titleText: e.target.value })} placeholder="หัวข้อแบนเนอร์" />}
          </div>
          <div>
            <label className={lbl}>ข้อความ</label>
            <select className={partInputCls} value={bn.textSource} onChange={(e) => set({ textSource: e.target.value as BannerPart["textSource"] })}>
              {PART_CHOICES.bannerTexts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {bn.textSource === "text" && <textarea rows={3} className={`${partInputCls} mt-1.5`} value={bn.text} onChange={(e) => set({ text: e.target.value })} placeholder="ข้อความใต้หัวข้อ" />}
          </div>
          <div>
            <label className={lbl}>จัดวาง</label>
            <select className={partInputCls} value={bn.layout} onChange={(e) => { const layout = e.target.value as BannerLayout; set({ layout, textPos: fixTextPos(layout, bn.textPos) }); }}>
              {BANNER_LAYOUTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>ตำแหน่งข้อความ</label>
            <select className={partInputCls} value={bn.textPos} onChange={(e) => set({ textPos: e.target.value as BannerTextPos })}>
              {textPosFor(bn.layout).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* ฟิลด์ (กะทัดรัด: ชิป + ป๊อปอัปเลือก) */}
        <div>
          <label className={lbl}>ฟิลด์ Parent SKU ที่โชว์ในแบนเนอร์ ({bn.fields.length}/12)</label>
          <FieldChipsPicker compact value={bn.fields} onChange={(f) => set({ fields: f })} fields={fields} groups={fieldGroups} max={12} description="ติ๊กฟิลด์ที่จะโชว์เป็นตารางในแบนเนอร์ — เรียงตามลำดับที่ติ๊ก · ช่องที่สินค้าไม่ได้กรอกจะไม่โชว์" />
        </div>
        {!extra && <p className="text-[11px] text-slate-400">สินค้าที่ตั้ง &quot;🖼 แบนเนอร์หน้าสินค้า&quot; ไว้เองในแท็บ 🛍 เว็บไซต์ ของ Parent SKU จะใช้ของตัวเองแทนแบนเนอร์นี้ (แบนเนอร์เพิ่มยังโชว์ตามปกติ)</p>}
      </div>
    );
  }
  if (part === "related") {
    const r = parts.related;
    const ql = q.trim().toLowerCase();
    const list = products.filter((p) => !ql || p.code.toLowerCase().includes(ql) || p.name.toLowerCase().includes(ql)).slice(0, 30);
    const toggle = (code: string) => setPart("related", { codes: r.codes.includes(code) ? r.codes.filter((c) => c !== code) : [...r.codes, code] });
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
        {mobileNote("related")}
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <div>
            <label className={lbl}>เอาสินค้าจาก</label>
            <select className={partInputCls} value={r.source} onChange={(e) => setPart("related", { source: e.target.value as ProductParts["related"]["source"] })}>
              {PART_CHOICES.relatedSources.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>จำนวน</label>
            <WheelSelect value={r.count} onChange={(e) => setPart("related", { count: Number(e.target.value) })}>
              {[2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} ชิ้น</option>)}
            </WheelSelect>
          </div>
        </div>
        <div>
          <label className={lbl}>หัวข้อ (ว่าง = "สินค้าที่เกี่ยวข้อง")</label>
          <input className={partInputCls} value={r.title} onChange={(e) => setPart("related", { title: e.target.value })} placeholder="เช่น คุณอาจชอบ · จับคู่กับรุ่นนี้" />
        </div>
        {r.source === "manual" && (
          <div>
            <label className={lbl}>เลือกรุ่น ({r.codes.length} รุ่น) — เรียงตามที่เลือก</label>
            {r.codes.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {r.codes.map((c) => (
                  <button key={c} type="button" onClick={() => toggle(c)} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200" title="เอาออก">{c} ✕</button>
                ))}
              </div>
            )}
            <input className={partInputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส / ชื่อรุ่น" />
            <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-100 divide-y divide-slate-50">
              {list.map((p) => (
                <label key={p.code} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" className="accent-blue-600" checked={r.codes.includes(p.code.toUpperCase())} onChange={() => toggle(p.code.toUpperCase())} />
                  <span className="font-mono text-slate-500">{p.code}</span>
                  <span className="truncate text-slate-700">{p.name}</span>
                </label>
              ))}
              {list.length === 0 && <div className="px-2 py-2 text-[11px] text-slate-400">ไม่พบรุ่น</div>}
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-400">ถ้าสินค้าตามแหล่งที่เลือกมีไม่ครบจำนวน ระบบเติมด้วยสินค้าหมวดเดียวกันให้ · "ขายดี" นับจากออเดอร์บนเว็บ ยังไม่มีออเดอร์ = เติมด้วยหมวดเดียวกัน</p>
      </div>
    );
  }
  return null;
}

/* ─────────── 🧩 จัดชิ้นส่วนในส่วน "ราคา · ตัวเลือก · ใส่ตะกร้า" ─────────── */
const BUY_SIZES = [70, 80, 90, 100, 110, 125, 150, 175, 200];
function BuyItemsEditor({ buy, onChange, fields = [] }: { buy: ProductParts["buy"]; onChange: (p: Partial<ProductParts["buy"]>) => void; fields?: { key: string; label: string }[] }) {
  const items = buy.items;
  const [openId, setOpenId] = useState<string | null>(null);
  const drag = useDragReorder((from, to) => onChange({ items: moveItem(items, from, to) }));
  const setItem = (id: string, patch: Partial<BuyItem>) => onChange({ items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const lbl = "block text-[11px] text-slate-500 mb-1";
  const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
  const ColorBtn = ({ value, onChange: oc, title }: { value: string | null; onChange: (v: string | null) => void; title: string }) => (
    <span className="inline-flex items-center gap-1">
      <input type="color" value={value ?? "#000000"} onChange={(e) => oc(e.target.value.toUpperCase())} title={title} className="w-7 h-7 rounded-lg border border-slate-200 cursor-pointer p-0.5 bg-white" />
      {value ? <button type="button" onClick={() => oc(null)} className="text-[11px] text-slate-500 hover:text-rose-600" title="ใช้สีตามธีม">✕</button> : <span className="text-[10px] text-slate-400">ตามธีม</span>}
    </span>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className={`${lbl} mb-0`}>จัดเป็น</label>
          <WheelSelect value={buy.columns} onChange={(e) => onChange({ columns: Number(e.target.value) === 1 ? 1 : 2 })}>
            <option value={2}>2 คอลัมน์ (ซ้าย / ขวา)</option>
            <option value={1}>1 คอลัมน์ (เรียงตามลำดับ)</option>
          </WheelSelect>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const it = defaultBuyItem("text", "right"); onChange({ items: [...items, it] }); setOpenId(it.id); }} className="text-[11px] px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700">+ ข้อความอิสระ</button>
          <button type="button" onClick={() => { if (confirm("คืนค่าเริ่มต้นของส่วนราคา-ตะกร้า?")) onChange({ items: DEFAULT_BUY_ITEMS(), columns: 2 }); }} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">คืนค่าเริ่มต้น</button>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">ลาก ⠿ สลับลำดับ · ติ๊กเปิด/ปิด · เลือกคอลัมน์ · ✎ ตั้งค่าขนาด/สี/จัดชิด และค่าเฉพาะชิ้น · มือถือเรียงเป็นคอลัมน์เดียว (ซ้ายก่อนขวา)</p>
      <ul className="space-y-1">
        {items.map((it, i) => {
          const def = BUY_ITEM_DEFS[it.key];
          const open = openId === it.id;
          const title = it.key === "text" ? (it.text.trim().split("\n")[0] || "ข้อความอิสระ") : def.label;
          return (
            <li key={it.id} {...drag.rowProps(i)} className={`rounded-lg border bg-white ${drag.rowCls(i)} ${it.enabled ? "border-slate-200" : "border-slate-100 opacity-60"} ${open ? "border-blue-300" : ""}`}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={it.enabled} onChange={(e) => setItem(it.id, { enabled: e.target.checked })} title="แสดง/ซ่อน" />
                <button type="button" onClick={() => setOpenId(open ? null : it.id)} className="flex-1 min-w-0 text-left">
                  <span className={`block text-sm truncate ${it.enabled ? "text-slate-800" : "line-through text-slate-400"}`}>{title}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{def.hint}{it.size !== 100 ? ` · ${it.size}%` : ""}{it.color ? " · สี" : ""}{it.align !== "left" ? (it.align === "center" ? " · กลาง" : " · ขวา") : ""}</span>
                </button>
                {buy.columns === 2 && (
                  <select className={mini} value={it.col} onChange={(e) => setItem(it.id, { col: e.target.value as BuyItem["col"] })} title="อยู่คอลัมน์ไหน">
                    <option value="left">ซ้าย</option>
                    <option value="right">ขวา</option>
                  </select>
                )}
                <button type="button" onClick={() => setOpenId(open ? null : it.id)} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-500 hover:border-slate-400" title={open ? "พับ" : "ตั้งค่า"}>{open ? "▾" : "✎"}</button>
                {it.key === "text" && (
                  <button type="button" onClick={() => onChange({ items: items.filter((x) => x.id !== it.id) })} className="w-7 h-7 rounded-lg border border-slate-200 text-xs text-slate-400 hover:text-red-600 hover:border-red-300" title="ลบ">🗑️</button>
                )}
              </div>
              {open && (
                <div className="border-t border-slate-100 px-3 py-2 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className={lbl}>จัดชิด</label>
                      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                        {([["left", "⇤"], ["center", "☰"], ["right", "⇥"]] as const).map(([a, ic]) => (
                          <button key={a} type="button" onClick={() => setItem(it.id, { align: a })} className={`w-8 h-7 text-xs ${it.align === a ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`} title={a === "left" ? "ชิดซ้าย" : a === "center" ? "กึ่งกลาง" : "ชิดขวา"}>{ic}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>ขนาด</label>
                      <WheelSelect value={it.size} onChange={(e) => setItem(it.id, { size: Number(e.target.value) })}>
                        {[...new Set([...BUY_SIZES, it.size])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}%{n === 100 ? " (ปกติ)" : ""}</option>)}
                      </WheelSelect>
                    </div>
                    <div>
                      <label className={lbl}>สีตัวอักษร</label>
                      <ColorBtn value={it.color} onChange={(v) => setItem(it.id, { color: v })} title="สีตัวอักษรของชิ้นนี้" />
                    </div>
                    <div>
                      <label className={lbl}>ระยะห่างด้านบน</label>
                      <WheelSelect value={it.gap} onChange={(e) => setItem(it.id, { gap: e.target.value as BuyItem["gap"] })}>
                        <option value="sm">ชิด</option>
                        <option value="md">ปกติ</option>
                        <option value="lg">ห่าง</option>
                      </WheelSelect>
                    </div>
                  </div>

                  {it.key === "price" && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <PartToggle label="หน่วย (/ ใบ)" on={it.showUnit} onChange={(v) => setItem(it.id, { showUnit: v })} />
                      <PartToggle label="ป้าย (ใหม่/ลดราคา)" on={it.showBadge} onChange={(v) => setItem(it.id, { showBadge: v })} />
                      <PartToggle label="ราคาเต็มขีดฆ่า (fake_price ใน Parent SKU)" on={it.showCompare} onChange={(v) => setItem(it.id, { showCompare: v })} />
                    </div>
                  )}
                  {it.key === "desc" && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>ดึงข้อความจาก</label>
                        <select className={partInputCls} value={it.field} onChange={(e) => setItem(it.id, { field: e.target.value })}>
                          <option value="">คำอธิบาย (ตามที่จับคู่ฟิลด์)</option>
                          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                      </div>
                    <div>
                      <label className={lbl}>ตัดกี่บรรทัด</label>
                      <WheelSelect value={it.lines} onChange={(e) => setItem(it.id, { lines: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} บรรทัด</option>)}
                      </WheelSelect>
                      <div className="mt-1.5"><PartToggle label="ปุ่ม “ดูเพิ่มเติม” เมื่อยาวเกิน" on={it.more} onChange={(v) => setItem(it.id, { more: v })} /></div>
                    </div>
                    </div>
                  )}
                  {def.styles && (
                    <div>
                      <label className={lbl}>รูปแบบ</label>
                      <select className={mini} value={it.style} onChange={(e) => setItem(it.id, { style: e.target.value })}>
                        {def.styles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {it.key === "options" && it.style === "swatches" && <div className="mt-1.5"><ColorSwatchButton /></div>}
                    </div>
                  )}
                  {(it.key === "qty" || it.key === "options") && (
                    <div>
                      <label className={lbl}>ป้ายกำกับ (ว่าง = ค่าเดิม)</label>
                      <input className={partInputCls} value={it.label} onChange={(e) => setItem(it.id, { label: e.target.value })} placeholder={it.key === "qty" ? "จำนวน" : "สี / ตัวเลือก"} />
                    </div>
                  )}
                  {it.key === "button" && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>ข้อความบนปุ่ม (ว่าง = "ใส่ตะกร้า · ราคา")</label>
                        <input className={partInputCls} value={it.label} onChange={(e) => setItem(it.id, { label: e.target.value })} placeholder="ใส่ตะกร้า · ฿890" />
                      </div>
                      <div className="flex items-end gap-4 flex-wrap">
                        <div>
                          <label className={lbl}>สีพื้นปุ่ม</label>
                          <ColorBtn value={it.bg} onChange={(v) => setItem(it.id, { bg: v })} title="สีพื้นปุ่ม (ว่าง = สีแบรนด์)" />
                        </div>
                        <PartToggle label="เต็มความกว้าง" on={it.fullWidth} onChange={(v) => setItem(it.id, { fullWidth: v })} />
                      </div>
                    </div>
                  )}
                  {it.key === "note" && (
                    <div>
                      <label className={lbl}>เอาข้อความจาก</label>
                      <select className={partInputCls} value={buy.noteSource} onChange={(e) => onChange({ noteSource: e.target.value as ProductParts["buy"]["noteSource"] })}>
                        {PART_CHOICES.buyNotes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {buy.noteSource === "text" && (
                        <input className={`${partInputCls} mt-1.5`} value={buy.noteText} onChange={(e) => onChange({ noteText: e.target.value })} placeholder="เช่น ส่งฟรีเมื่อครบ ฿1,500 · จัดส่งใน 1–2 วัน" />
                      )}
                    </div>
                  )}
                  {it.key === "text" && (
                    <div>
                      <label className={lbl}>ข้อความ (ขึ้นบรรทัดใหม่ได้)</label>
                      <textarea rows={3} className={partInputCls} value={it.text} onChange={(e) => setItem(it.id, { text: e.target.value })} placeholder={"✓ ส่งฟรีเมื่อครบ ฿1,500\n✓ รับประกันงานเย็บ 6 เดือน"} />
                      <div className="mt-1"><PartToggle label="ตัวหนา" on={it.bold} onChange={(v) => setItem(it.id, { bold: v })} /></div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────── การ์ดสินค้าจำลอง (แท็บการ์ดสินค้า) — เลียนแบบ storefront ProductCard ให้ใกล้ที่สุด ─────────── */
const RATIO_CSS: Record<string, string> = { "1:1": "1 / 1", "4:3": "4 / 3", "4:5": "4 / 5", "3:4": "3 / 4", "16:9": "16 / 9" };
const STOCK_TH: Record<string, { text: string; color: string }> = { in: { text: "พร้อมส่ง", color: "#1F9254" }, low: { text: "เหลือน้อย", color: "#C77A0A" }, preorder: { text: "สั่งจอง", color: "#8A8F97" } };
/* ─────────── การ์ดสินค้า: ป้ายอัตโนมัติ · รูปบนการ์ด · ชื่อ/ราคา · ดูด่วน ─────────── */
function CardExtras({ card, setCard }: { card: Theme["card"]; setCard: (p: Partial<Theme["card"]>) => void }) {
  const ab = card.autoBadges;
  const setAb = (p: Partial<typeof ab>) => setCard({ autoBadges: { ...ab, ...p } });
  const mini = "rounded-lg border border-slate-200 px-2 py-1 text-xs bg-white";
  const badgeRow = (
    on: boolean,
    label: string,
    text: string,
    color: string,
    param: React.ReactNode,
    set: (p: { on?: boolean; text?: string; color?: string }) => void,
    placeholder: string
  ) => (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 ${on ? "bg-white border border-slate-200" : "bg-slate-50"}`}>
      <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer w-24 shrink-0">
        <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={on} onChange={(e) => set({ on: e.target.checked })} />
        {label}
      </label>
      <input className={`${mini} w-28`} value={text} maxLength={24} onChange={(e) => set({ text: e.target.value })} placeholder={placeholder} disabled={!on} />
      {param}
      <span className="w-36"><ColorInput value={color} onChange={(v) => set({ color: v })} /></span>
      <span className="text-[11px] px-2 py-0.5 text-white" style={{ background: color, borderRadius: ab.shape === "pill" ? 99 : 3 }}>{text.replace("{pct}", "20") || placeholder}</span>
    </div>
  );
  return (
    <>
      {/* 🏷 ป้ายอัตโนมัติ */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>🏷 ป้ายอัตโนมัติ (ซ้อนกับป้ายที่ตั้งเองรายรุ่น)</label>
        <div className="space-y-1.5">
          {badgeRow(ab.sale, "ลดราคา", ab.saleText, ab.saleColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">ลดอย่างน้อย
              <WheelSelect value={ab.saleMin} disabled={!ab.sale} onChange={(e) => setAb({ saleMin: Number(e.target.value) })}>
                {[1, 5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}%</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { sale: p.on } : {}), ...(p.text !== undefined ? { saleText: p.text } : {}), ...(p.color !== undefined ? { saleColor: p.color } : {}) }),
            "ลด {pct}%")}
          {badgeRow(ab.new, "สินค้าใหม่", ab.newText, ab.newColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">ขึ้นเว็บภายใน
              <WheelSelect value={ab.newDays} disabled={!ab.new} onChange={(e) => setAb({ newDays: Number(e.target.value) })}>
                {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} วัน</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { new: p.on } : {}), ...(p.text !== undefined ? { newText: p.text } : {}), ...(p.color !== undefined ? { newColor: p.color } : {}) }),
            "ใหม่")}
          {badgeRow(ab.best, "ขายดี", ab.bestText, ab.bestColor,
            <label className="flex items-center gap-1 text-[11px] text-slate-500">อันดับ 1 –
              <WheelSelect value={ab.bestTop} disabled={!ab.best} onChange={(e) => setAb({ bestTop: Number(e.target.value) })}>
                {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
              </WheelSelect>
            </label>,
            (p) => setAb({ ...(p.on !== undefined ? { best: p.on } : {}), ...(p.text !== undefined ? { bestText: p.text } : {}), ...(p.color !== undefined ? { bestColor: p.color } : {}) }),
            "ขายดี")}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">มุมป้าย
            <select className={mini} value={ab.pos} onChange={(e) => setAb({ pos: e.target.value as typeof ab.pos })}>
              <option value="top-left">บนซ้าย</option>
              <option value="top-right">บนขวา</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">รูปทรงป้าย
            <select className={mini} value={ab.shape} onChange={(e) => setAb({ shape: e.target.value as typeof ab.shape })}>
              <option value="pill">มน</option>
              <option value="square">เหลี่ยม</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">ลด % คิดจาก “ราคาเต็มขีดฆ่า (fake_price)” · {"{pct}"} = เลขเปอร์เซ็นต์ · ใหม่ = นับจากวันที่เพิ่มรุ่นเข้าร้าน · ขายดี = อันดับยอดขายบนเว็บ (ยังไม่มีออเดอร์ = ยังไม่ขึ้น)</p>
      </div>

      {/* 🖼 รูปบนการ์ด */}
      <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-3 border-t border-slate-100">
        <div>
          <label className={labelCls}>🖼 สีพื้นหลังหลังรูปสินค้า</label>
          <div className="flex items-center gap-2">
            <span className="flex-1"><ColorInput value={card.imageBg} onChange={(v) => setCard({ imageBg: v })} /></span>
            {card.imageBg && <button type="button" onClick={() => setCard({ imageBg: "" })} className="text-xs text-slate-500 hover:text-red-600">ล้าง (ตามสินค้า)</button>}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">เช่น เทาอ่อน #F2F2F0 ให้รูปพื้นขาวดูเป็นชุดเดียวกัน · ว่าง = แบบเดิม</p>
        </div>
        <div>
          <label className={labelCls}>ระยะห่างรูปจากขอบกรอบ</label>
          <WheelSelect value={card.imagePad == null ? "" : String(card.imagePad)} onChange={(e) => setCard({ imagePad: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">อัตโนมัติ (ย่อพอดี = เว้นนิดหน่อย · เต็มกรอบ = ชิดขอบ)</option>
            {[0, 2, 4, 6, 8, 12, 16].map((n) => <option key={n} value={n}>{n === 0 ? "ชิดขอบ (0)" : `${n}%`}</option>)}
          </WheelSelect>
        </div>
      </div>

      {/* 🔤 ชื่อ / ราคา */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>🔤 ชื่อสินค้า / ราคา</label>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">ความหนาชื่อ</label>
            <WheelSelect value={card.nameWeight} onChange={(e) => setCard({ nameWeight: Number(e.target.value) as Theme["card"]["nameWeight"] })}>
              <option value={400}>ปกติ</option>
              <option value={500}>กลาง</option>
              <option value={600}>หนา</option>
              <option value={700}>หนามาก</option>
            </WheelSelect>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">ระยะห่างตัวอักษร</label>
            <WheelSelect value={card.nameTracking} onChange={(e) => setCard({ nameTracking: Number(e.target.value) })}>
              {[0, 2, 4, 8, 12].map((n) => <option key={n} value={n}>{n === 0 ? "ปกติ" : `+${n}`}</option>)}
            </WheelSelect>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">ชื่อหมวด</label>
            <select className={inputCls} value={card.categoryPos} onChange={(e) => setCard({ categoryPos: e.target.value as Theme["card"]["categoryPos"] })}>
              <option value="above">เหนือชื่อสินค้า</option>
              <option value="below">ใต้ราคา</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={card.nameUpper} onChange={(e) => setCard({ nameUpper: e.target.checked })} />
            ชื่อเป็นตัวพิมพ์ใหญ่ (ชื่ออังกฤษ แบบแบรนด์หรู)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={card.priceFrom} onChange={(e) => setCard({ priceFrom: e.target.checked })} />
            ราคา “เริ่มต้น ฿…” เมื่อแต่ละสีราคาไม่เท่ากัน
          </label>
        </div>
      </div>

      {/* 👁 ดูด่วน */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <label className={labelCls}>👁 ดูด่วน (Quick view) — เลือกสี/จำนวนแล้วใส่ตะกร้าได้โดยไม่ต้องเข้าหน้าสินค้า</label>
        <select className={inputCls} value={card.quickView} onChange={(e) => setCard({ quickView: e.target.value as Theme["card"]["quickView"] })}>
          <option value="none">ไม่มี</option>
          <option value="button">ปุ่ม 👁 มุมรูป (คอมโผล่ตอนชี้ · มือถือโชว์ตลอด)</option>
          <option value="replace">ปุ่มบนรูป &quot;เลือกสี / ใส่ตะกร้า&quot; เปิดดูด่วน (แทนใส่ตะกร้าทันที)</option>
        </select>
      </div>
    </>
  );
}

/** 🖼 ระหว่างรอรูปโหลด: โลโก้จาง ๆ กลางกรอบรูป (การ์ด + หน้าสินค้า) — ตัวอย่างสดด้านขวา */
function PlaceholderSettings({
  value,
  onChange,
  logoKey,
  surface,
  colors,
  ratio,
}: {
  value: ImagePlaceholder;
  onChange: (p: Partial<ImagePlaceholder>) => void;
  logoKey: string | null;
  surface: string;
  colors: Theme["colors"];
  ratio: string;
}) {
  const k = value.imageKey ?? logoKey;
  const url = k ? keyUrl(k, 400) : null;
  // สีพื้นตอนรอ: ชื่อสีธีม (เปลี่ยนธีมแล้วตาม) — แบรนด์จาง = สูตรเดียวกับเว็บร้าน (แบรนด์ 14% บนขาว)
  const soft = `color-mix(in srgb, ${colors.brand} 14%, white)`;
  const BG_CHOICES: { v: string; l: string; css: string }[] = [
    { v: "page", l: "พื้นเว็บ", css: colors.page },
    { v: "surface", l: "พื้นการ์ด", css: colors.surface },
    { v: "brandSoft", l: "แบรนด์จาง", css: soft },
    { v: "brand", l: "แบรนด์", css: colors.brand },
    { v: "muted", l: "ตัวอักษรรอง", css: colors.muted },
    { v: "ink", l: "เข้ม", css: colors.ink },
    { v: "white", l: "ขาว", css: "#ffffff" },
  ];
  const custom = /^#[0-9a-f]{6}$/i.test(value.bg);
  const bgCss = !value.bg ? surface : custom ? value.bg : BG_CHOICES.find((c) => c.v === value.bg)?.css ?? surface;
  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <label className={labelCls}>🖼 ระหว่างรอรูปโหลด (การ์ดสินค้า + หน้าสินค้า)</label>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-2">
          <select className={inputCls} value={value.mode} onChange={(e) => onChange({ mode: e.target.value as ImagePlaceholder["mode"] })}>
            <option value="logo">โลโก้แบรนด์จาง ๆ กลางกรอบ แล้วรูปจริงค่อย ๆ ขึ้นทับ</option>
            <option value="none">พื้นเปล่า (ไม่มีโลโก้)</option>
          </select>
          {value.mode === "logo" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500">ความจาง ({value.opacity}%)</label>
                  <input type="range" min={4} max={40} step={2} value={value.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} className="w-full" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">ขนาดโลโก้ ({value.size}% ของกรอบ)</label>
                  <input type="range" min={20} max={70} step={2} value={value.size} onChange={(e) => onChange({ size: Number(e.target.value) })} className="w-full" />
                </div>
              </div>
              <ImageUploadField label="โลโก้สำหรับจุดนี้ (ว่าง = ใช้โลโก้หลัก)" hint="แนะนำโลโก้สีเดียว พื้นใส" value={value.imageKey} onChange={(key) => onChange({ imageKey: key })} height={44} />
              {!k && <p className="text-[11px] text-amber-600">ยังไม่มีรูปโลโก้ — อัปโหลดที่แท็บ “โลโก้” หรือช่องด้านบน (ไม่มีรูป = พื้นเปล่า)</p>}
            </>
          )}
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">สีพื้นตอนรอ (หายไปเมื่อรูปจริงขึ้น)</label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ bg: "" })}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${!value.bg ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                title="ใช้พื้นหลังรูปเดิม (ตั้งที่ “พื้นหลังหลังรูปสินค้า”)"
              >
                ตามพื้นหลังรูป
              </button>
              {BG_CHOICES.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  title={c.l}
                  onClick={() => onChange({ bg: c.v })}
                  className={`w-6 h-6 rounded-full border border-black/10 ${value.bg === c.v ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                  style={{ background: c.css }}
                />
              ))}
              {/* สีเอง: ตัวเลือกสีของกลาง (มีปุ่ม 💧 ดูดสีจากหน้าจอ/พรีวิว) */}
              <span title="สีเอง (มี 💧 ดูดสีจากหน้าจอ)" className={`rounded ${custom ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}>
                <ColorInput
                  value={custom ? value.bg : "#f4e3e6"}
                  allowText={false}
                  onChange={(hex) => {
                    if (/^#[0-9a-f]{6}$/i.test(hex)) onChange({ bg: hex.toLowerCase() });
                  }}
                />
              </span>
            </div>
            {custom && <p className="mt-1 text-[11px] text-amber-600">สีที่เลือกเองจะไม่เปลี่ยนตามธีมร้าน</p>}
          </div>
        </div>
        <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ aspectRatio: ratio, background: bgCss }} title="ตัวอย่างตอนรูปยังโหลดไม่เสร็จ">
          {value.mode === "logo" && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain" style={{ width: `${value.size}%`, opacity: value.opacity / 100, filter: "grayscale(1)" }} />
          )}
          <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-slate-400">ตัวอย่าง</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────── 🎨 สีละเอียด + การ์ดตัวอย่างสด (แท็บสี) ─────────── */
const ON_BRAND_CHOICES: { v: string; label: string }[] = [
  { v: "#FFFFFF", label: "ขาว" },
  { v: ON_BRAND_DARK, label: "ดำ" },
  { v: "auto", label: "อัตโนมัติ" },
];
function FineColorsCard({
  theme,
  published,
  sample,
  setColor,
  setSoft,
  setSaleBadge,
  onResetAll,
}: {
  theme: Theme;
  published: Theme;
  sample: SampleItem | null;
  setColor: (k: ColorKey, v: string) => void;
  setSoft: (n: number) => void;
  setSaleBadge: (v: string) => void;
  onResetAll: () => void;
}) {
  const c = theme.colors;
  const d = FINE_COLOR_DEFAULTS;
  const changed = FINE_COLOR_KEYS.filter((k) => c[k] !== d[k]).length;
  const pubChanged = FINE_COLOR_KEYS.some((k) => c[k] !== published.colors[k]);
  // ช่องที่ "ว่าง = ค่าเริ่มต้น": โชว์ว่างเมื่อเท่าค่าเริ่มต้น · ล้าง = กลับค่าเริ่มต้น
  const fine = (k: "line" | "stockIn" | "stockLow", label: string) => (
    <ColorField label={label} value={c[k] === d[k] ? "" : c[k]} emptyLabel={`ค่าเริ่มต้น ${d[k]}`} onChange={(v) => setColor(k, v || d[k])} />
  );
  const customOn = c.onBrand !== "auto" && !ON_BRAND_CHOICES.some((o) => o.v === c.onBrand);
  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-800">🎨 ปรับสีละเอียด</h3>
        {changed > 0 && (
          <button type="button" onClick={onResetAll} className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0" title="สีละเอียดทั้งหมดกลับเป็นค่าเริ่มต้น">
            ↺ ค่าเริ่มต้นทั้งหมด
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        ไม่ตั้ง = หน้าตาเดิมของเว็บ · ตัวอย่างด้านล่างเปลี่ยนตามทันที {pubChanged && <span className="text-amber-600">· มีค่าที่ยังไม่เผยแพร่</span>}
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,260px)]">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">ปุ่ม · เส้นขอบ · ลิงก์</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>ตัวอักษรบนปุ่ม/ป้ายสีหลัก</label>
                <div className="flex flex-wrap items-center gap-1">
                  {ON_BRAND_CHOICES.map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setColor("onBrand", o.v)}
                      className={`h-7 px-2.5 rounded-lg border text-xs ${c.onBrand === o.v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    >
                      {o.v !== "auto" && <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-[-1px] border border-black/10" style={{ background: o.v }} />}
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5">
                  <ColorField label="" value={customOn ? c.onBrand : ""} emptyLabel="เลือกสีเอง…" onChange={(v) => setColor("onBrand", v || d.onBrand)} />
                </div>
                {c.onBrand === "auto" && <p className="mt-1 text-[10px] text-slate-400">ตอนนี้ใช้ {resolveOnBrand(c) === "#FFFFFF" ? "ขาว" : "ดำ"} (เปลี่ยนเองตามสีหลัก)</p>}
              </div>
              {fine("line", "เส้นขอบ / เส้นคั่น (ทั้งเว็บ)")}
              <ColorField label="สีลิงก์ (ลิงก์ในข้อความ + ตอนชี้ชื่อสินค้า/เมนูย่อย)" value={c.link} emptyLabel="ใช้สีหลัก" onChange={(v) => setColor("link", v)} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">ราคา · ป้ายลดราคา</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField label="สีราคา" value={c.price} emptyLabel="ตามเดิม" onChange={(v) => setColor("price", v)} />
              <ColorField label="สีราคาตอนลดราคา" value={c.sale} emptyLabel="เท่าสีราคา" onChange={(v) => setColor("sale", v)} />
              <div>
                <ColorField label="สีป้ายลดราคา (ลด xx%)" value={theme.card.autoBadges.saleColor} emptyLabel="ค่าเริ่มต้น" onChange={(v) => setSaleBadge(v || "#C62828")} />
                {!theme.card.autoBadges.sale && <p className="mt-1 text-[10px] text-amber-600">ป้ายลด % ยังปิดอยู่ — เปิดที่แท็บ การ์ดสินค้า → ป้ายอัตโนมัติ</p>}
              </div>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-2">สถานะสต๊อก</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fine("stockIn", "“พร้อมส่ง”")}
              {fine("stockLow", "“เหลือน้อย”")}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-600 mb-1">ความเข้มสีอ่อน (พื้นป้าย/กล่องเน้น)</p>
            <div className="flex items-center gap-3">
              <input type="range" min={SOFT_PCT_RANGE.min} max={SOFT_PCT_RANGE.max} value={c.softPct} onChange={(e) => setSoft(Number(e.target.value))} className="flex-1" aria-label="ความเข้มสีอ่อน" />
              <span className="text-xs text-slate-600 w-10 text-right">{c.softPct}%</span>
              {c.softPct !== d.softPct && (
                <button type="button" onClick={() => setSoft(d.softPct)} className="text-[11px] text-slate-400 hover:text-slate-700" title={`กลับค่าเริ่มต้น ${d.softPct}%`}>
                  ↺
                </button>
              )}
            </div>
            <div className="mt-1.5 flex gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${c.brand} ${c.softPct}%, white)`, color: c.brandDeep }}>สีอ่อน</span>
              <span className="px-2.5 py-1 rounded-full border border-black/5" style={{ background: `color-mix(in srgb, ${c.brand} ${tintPctOf(c.softPct)}%, white)`, color: c.ink }}>สีจางมาก</span>
            </div>
          </div>
        </div>
        <ColorsLivePreview theme={theme} sample={sample} />
      </div>
    </div>
  );
}

/** 👁 ตัวอย่างสด: การ์ดราคาปกติ + การ์ดลดราคา + ปุ่ม/ลิงก์/เส้น — ใช้สีจริงของธีมที่กำลังแก้ */
function ColorsLivePreview({ theme, sample }: { theme: Theme; sample: SampleItem | null }) {
  const [hoverBtn, setHoverBtn] = useState(false);
  const [hoverName, setHoverName] = useState<number | null>(null);
  const c = theme.colors;
  const name = sample?.name || "กระเป๋าหนังแท้ รุ่นตัวอย่าง";
  const img = sample?.images[0] ?? null;
  const price = sample?.price || 1290;
  const compare = sample?.comparePrice && sample.comparePrice > price ? sample.comparePrice : Math.round((price * 1.25) / 10) * 10;
  const pct = Math.round((1 - price / compare) * 100);
  const ab = theme.card.autoBadges;
  const soft = `color-mix(in srgb, ${c.brand} ${c.softPct}%, white)`;
  const tint = `color-mix(in srgb, ${c.brand} ${tintPctOf(c.softPct)}%, white)`;
  const card = (i: number, sale: boolean) => (
    <div key={i} className="rounded-lg overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
      <div className="relative" style={{ aspectRatio: "1 / 1", background: tint }}>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {sale && (
          <span className="absolute top-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 text-white" style={{ background: ab.saleColor, borderRadius: ab.shape === "pill" ? 99 : 2 }}>
            {ab.saleText.replace("{pct}", String(pct))}
          </span>
        )}
      </div>
      <div className="p-1.5">
        <span className="inline-flex items-center gap-1 text-[8px]" style={{ color: sale ? c.stockLow : c.stockIn }}>
          <span className="w-1 h-1 rounded-full" style={{ background: sale ? c.stockLow : c.stockIn }} />
          {sale ? "เหลือน้อย" : "พร้อมส่ง"}
        </span>
        <div
          className="text-[10px] leading-snug line-clamp-2 cursor-pointer"
          style={{ fontFamily: theme.fonts.display, color: hoverName === i ? c.link || c.brand : c.ink }}
          onMouseEnter={() => setHoverName(i)}
          onMouseLeave={() => setHoverName(null)}
        >
          {name}
        </div>
        <div className="mt-0.5 text-[10px]">
          <span className="font-semibold" style={{ fontFamily: theme.fonts.display, color: (sale && c.sale) || c.price || c.ink }}>฿{price.toLocaleString("th-TH")}</span>
          {sale && <s className="ml-1 text-[8px]" style={{ color: c.muted }}>฿{compare.toLocaleString("th-TH")}</s>}
        </div>
      </div>
    </div>
  );
  return (
    <div className="rounded-xl p-2.5 self-start" style={{ background: c.page, border: `1px solid ${c.line}`, fontFamily: theme.fonts.body }}>
      <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: c.muted }}>ตัวอย่างสด</p>
      <div className="grid grid-cols-2 gap-1.5">{[card(0, false), card(1, true)]}</div>
      <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: `1px solid ${c.line}` }}>
        <button
          type="button"
          onMouseEnter={() => setHoverBtn(true)}
          onMouseLeave={() => setHoverBtn(false)}
          className="w-full h-7 rounded-md text-[11px] font-medium transition-colors"
          style={{ background: hoverBtn ? c.brandDeep : c.brand, color: resolveOnBrand(c) }}
        >
          ใส่ตะกร้า
        </button>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] underline cursor-pointer" style={{ color: c.link || c.brand }}>ดูรายละเอียดเพิ่มเติม</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: soft, color: c.brandDeep }}>ส่งฟรี</span>
        </div>
        <p className="text-[9px]" style={{ color: c.muted }}>ชี้ปุ่ม/ชื่อสินค้าเพื่อดูสีตอนชี้</p>
      </div>
    </div>
  );
}

function SampleCard({ item, card, colors, fonts, radius, shape }: { item: SampleItem; card: Theme["card"]; colors: Theme["colors"]; fonts: Theme["fonts"]; radius: Theme["radius"]; shape?: Shape }) {
  const [hover, setHover] = useState(false);
  const base = radius === "sharp" ? 4 : radius === "round" ? 20 : 12;
  // ความมนจริงตามแท็บรูปทรง/การ์ด (null = ตามค่ารวม) — การ์ดย่อส่วน จึงหารครึ่งให้ดูสมจริง
  const rCard = Math.round((shape?.cardRadius ?? base) * 0.6);
  const r = Math.round((shape?.imageRadius ?? base) * 0.6);
  const boxed = card.preset === "border" || card.preset === "shadow" || card.preset === "floating";
  const lift = card.hover === "lift" || card.hover === "lift-swap";
  const swap = (card.hover === "swap" || card.hover === "lift-swap") && item.images.length > 1;
  const wrap: React.CSSProperties = {
    background: boxed ? colors.surface : "transparent",
    border: card.preset === "border" ? `1px solid ${colors.line}` : undefined,
    boxShadow: card.preset === "shadow" ? "0 2px 10px rgba(20,21,23,.06)" : card.preset === "floating" ? "0 14px 34px rgba(20,21,23,.14)" : undefined,
    borderRadius: boxed ? rCard : undefined,
    overflow: boxed ? "hidden" : undefined,
    transform: hover && lift ? "translateY(-4px)" : undefined,
    transition: "transform .25s, box-shadow .25s",
    textAlign: card.align === "center" ? "center" : "left",
    fontFamily: fonts.body,
  };
  const stock0 = STOCK_TH[item.stock] ?? STOCK_TH.in;
  const stock = { ...stock0, color: item.stock === "low" ? colors.stockLow : item.stock === "preorder" ? stock0.color : colors.stockIn };
  const onSale = !!item.comparePrice && item.comparePrice > item.price;
  return (
    <div style={wrap} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="relative overflow-hidden" style={{ aspectRatio: RATIO_CSS[card.imageRatio] ?? "4 / 5", background: card.imageBg || "#eee", borderRadius: boxed ? undefined : r }}>
        {item.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.images[0]} alt="" className={`absolute inset-0 w-full h-full transition-all duration-500 ${card.imageFit === "contain" ? "object-contain" : "object-cover"} ${card.imagePad == null && card.imageFit === "contain" ? "p-2" : ""}`} style={{ transform: hover && card.hover === "zoom" ? "scale(1.05)" : undefined, opacity: hover && swap ? 0 : 1, padding: card.imagePad != null ? `${card.imagePad}%` : undefined }} />
        )}
        {swap && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.images[1]} alt="" className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${card.imageFit === "contain" ? "object-contain p-2" : "object-cover"}`} style={{ opacity: hover ? 1 : 0 }} />
        )}
        {card.showBadge && item.badge && <span className="absolute top-2 left-2 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/90" style={{ color: colors.ink, letterSpacing: ".08em" }}>{item.badge}</span>}
        {card.autoBadges.sale && item.comparePrice && item.comparePrice > item.price && Math.round((1 - item.price / item.comparePrice) * 100) >= card.autoBadges.saleMin && (
          <span className={`absolute top-2 ${card.autoBadges.pos === "top-right" ? "right-2" : "left-2"} text-[9px] font-bold px-2 py-0.5 text-white`} style={{ background: card.autoBadges.saleColor, borderRadius: card.autoBadges.shape === "pill" ? 99 : 2, marginTop: item.badge && card.showBadge && card.autoBadges.pos === "top-left" ? 18 : 0 }}>
            {card.autoBadges.saleText.replace("{pct}", String(Math.round((1 - item.price / item.comparePrice) * 100)))}
          </span>
        )}
        {card.quickAdd !== "none" && (
          <span className="absolute left-2 right-2 bottom-2 text-[11px] text-center rounded-md py-1 bg-white/95 transition-all duration-300" style={{ color: colors.ink, opacity: card.quickAdd === "always" || hover ? 1 : 0, transform: card.quickAdd === "always" || hover ? "none" : "translateY(6px)" }}>เพิ่มลงตะกร้า</span>
        )}
      </div>
      <div className={boxed ? "p-3" : "pt-2.5"}>
        <div className={`flex items-center text-[9px] mb-0.5 ${card.align === "center" ? "justify-center gap-2" : "justify-between"}`}>
          {card.showCategory && <span className="uppercase tracking-wider" style={{ color: colors.muted }}>{item.category}</span>}
          {card.showStock && <span className="inline-flex items-center gap-1" style={{ color: stock.color }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: stock.color }} />{stock.text}</span>}
        </div>
        <div className="leading-snug" style={{ fontFamily: fonts.display, color: hover ? colors.link || colors.brand : colors.ink, fontWeight: card.nameWeight, textTransform: card.nameUpper ? "uppercase" : undefined, letterSpacing: card.nameTracking ? `${card.nameTracking / 100}em` : undefined, fontSize: `${0.8 * card.nameSize / 100}rem`, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: card.titleLines, overflow: "hidden" }}>{item.name}</div>
        <div className="mt-1" style={{ fontSize: `${0.82 * card.priceSize / 100}rem` }}>
          <span className="font-semibold" style={{ fontFamily: fonts.display, color: (onSale && colors.sale) || colors.price || colors.ink }}>฿{item.price.toLocaleString("th-TH")}</span>
          {card.showCompare && item.comparePrice && item.comparePrice > item.price && <s className="ml-1.5 text-[0.8em]" style={{ color: colors.muted }}>฿{item.comparePrice.toLocaleString("th-TH")}</s>}
          {card.showUnit && <span className="text-[0.8em]" style={{ color: colors.muted }}> / {item.unit}</span>}
        </div>
        {card.showSwatches && item.swatches.length > 0 && (
          <div className={`flex items-center gap-1 mt-1.5 ${card.align === "center" ? "justify-center" : ""}`}>
            {item.swatches.slice(0, card.swatchMax).map((c, i) => <span key={i} className="inline-block w-3 h-3 rounded-full bg-cover bg-center" style={{ background: c.color, backgroundImage: c.color ? undefined : `url(${c.img})`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />)}
            {item.swatches.length > card.swatchMax && <span className="text-[9px]" style={{ color: colors.muted }}>+{item.swatches.length - card.swatchMax}</span>}
          </div>
        )}
        {card.showColorCount && item.swatches.length > 1 && <div className="text-[9px] mt-0.5" style={{ color: colors.muted }}>{item.swatches.length} สี</div>}
      </div>
    </div>
  );
}

/* ─────────── สีแบบเลือกได้/ล้างได้ (ตามธีม) — ใช้ในแท็บตัวอักษร ─────────── */
function ColorField({ label, value, onChange, emptyLabel = "ตามธีม" }: { label: string; value: string; onChange: (hex: string) => void; emptyLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {label && <label className={labelCls}>{label}</label>}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:border-slate-400 bg-white" title="เลือกสี">
          <span className="inline-block w-4 h-4 rounded border border-black/10" style={{ backgroundColor: value || "transparent", backgroundImage: value ? undefined : "linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0,4px 4px" }} />
          {value || emptyLabel}
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="text-xs text-slate-400 hover:text-red-600 px-1" title="ล้าง → ตามธีม">✕</button>
        )}
      </div>
      {open && (
        <div className="mt-2">
          <ColorPicker value={value || "#333333"} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/* ─────────── ตัวแก้ 1 บทบาทตัวอักษร + ตัวอย่างสด ─────────── */
const WEIGHT_CHOICES = [300, 400, 500, 600, 700];
function TextRoleEditor({ def, value, pub, theme, onChange, onReset }: { def: (typeof TEXT_ROLE_DEFS)[number]; value: TextRole; pub: TextRole; theme: Theme; onChange: (p: Partial<TextRole>) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(pub);
  const isDefault = JSON.stringify(value) === JSON.stringify(defaultTextRole(def.key));
  const baseFont = def.base === "display" ? theme.fonts.display : theme.fonts.body;
  const fam = value.font ? `"${value.font}", "${baseFont}", sans-serif` : `"${baseFont}", sans-serif`;
  const scale = (mobile && value.sizeMobile ? value.sizeMobile : value.size) / 100;
  const defaultColor = def.key === "eyebrow" ? theme.colors.brand : def.key === "button" ? "#fff" : theme.colors.ink;
  const sample: React.CSSProperties = {
    fontFamily: fam,
    fontWeight: value.weight,
    fontStyle: value.italic ? "italic" : "normal",
    letterSpacing: `${value.spacing / 100}em`,
    textTransform: value.uppercase ? "uppercase" : "none",
    fontSize: def.px * scale,
    color: value.color || defaultColor,
    background: def.key === "button" ? theme.colors.brand : value.bg || undefined,
    padding: def.key === "button" ? "0.7em 1.6em" : value.bg ? "0.08em 0.35em" : undefined,
    borderRadius: def.key === "button" ? 99 : undefined,
    width: "fit-content",
    lineHeight: 1.3,
  };
  return (
    <div className={`rounded-lg border ${dirty ? "border-amber-300" : "border-slate-200"} bg-slate-50/50`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">{def.label}</span>
            {!isDefault && <span className="text-[10px] text-blue-600 bg-blue-50 rounded-full px-1.5">ปรับแล้ว</span>}
            <span className="text-[10px] text-slate-400">{open ? "▲" : "▼"}</span>
          </div>
          <div className="mt-1 overflow-hidden" style={{ background: theme.colors.page, padding: "6px 8px", borderRadius: 6 }}>
            <span style={sample}>{def.sample}</span>
          </div>
        </button>
        {!isDefault && (
          <button type="button" onClick={() => onChange(defaultTextRole(def.key))} className="text-[11px] text-slate-400 hover:text-slate-700 shrink-0" title="กลับค่าเริ่มต้น">↺ ค่าเริ่มต้น</button>
        )}
        {dirty && (
          <button type="button" onClick={onReset} className="text-[11px] text-amber-700 hover:underline shrink-0" title="คืนค่าที่เผยแพร่อยู่">คืนค่าเดิม</button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-200 pt-3">
          <p className="text-[11px] text-slate-500">{def.hint}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>ฟอนต์</label>
              <FontSelect
                value={value.font}
                onChange={(v) => onChange({ font: v })}
                options={webFontOptions([{ value: "", label: `ตาม${def.base === "display" ? "ฟอนต์หัวข้อ" : "ฟอนต์เนื้อหา"} (${baseFont})`, family: `"${baseFont}", sans-serif` }])}
                googleFonts={WEB_FONT_NAMES}
                sample={def.sample.slice(0, 18)}
              />
            </div>
            <div>
              <label className={labelCls}>น้ำหนัก</label>
              <WheelSelect value={value.weight} onChange={(e) => onChange({ weight: Number(e.target.value) })}>
                {WEIGHT_CHOICES.map((w) => <option key={w} value={w}>{w === 300 ? "บาง (300)" : w === 400 ? "ปกติ (400)" : w === 500 ? "กลาง (500)" : w === 600 ? "หนา (600)" : "หนามาก (700)"}</option>)}
              </WheelSelect>
            </div>
            <div className="flex items-end gap-4 pb-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.italic} onChange={(e) => onChange({ italic: e.target.checked })} />เอียง</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-blue-600" checked={value.uppercase} onChange={(e) => onChange({ uppercase: e.target.checked })} />ตัวพิมพ์ใหญ่ (อังกฤษ)</label>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>🖥 ขนาดบนคอม ({value.size}%)</label>
              <input type="range" min={50} max={250} step={5} value={value.size} onChange={(e) => onChange({ size: Number(e.target.value) })} className="w-full" onMouseEnter={() => setMobile(false)} />
            </div>
            <div>
              <label className={labelCls}>📱 ขนาดบนมือถือ ({value.sizeMobile ? `${value.sizeMobile}%` : "เท่าคอม"})</label>
              <input type="range" min={0} max={250} step={5} value={value.sizeMobile} onChange={(e) => onChange({ sizeMobile: Number(e.target.value) })} className="w-full" onMouseEnter={() => setMobile(true)} />
            </div>
            <div>
              <label className={labelCls}>ระยะห่างตัวอักษร ({value.spacing / 100}em)</label>
              <input type="range" min={-10} max={40} step={1} value={value.spacing} onChange={(e) => onChange({ spacing: Number(e.target.value) })} className="w-full" />
            </div>
          </div>
          {def.key !== "button" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField label="สีตัวอักษร" value={value.color} onChange={(hex) => onChange({ color: hex })} />
              {def.key !== "body" && <ColorField label="พื้นหลังไฮไลต์" value={value.bg} onChange={(hex) => onChange({ bg: hex })} emptyLabel="ไม่มี" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────── Header: จัดชิ้นส่วน 3 โซน ─────────── */
/** ชิ้นที่กดแล้วเปิดป๊อปตั้งค่าได้ */
const ZONE_CONFIGURABLE: HeaderEl[] = ["logo", "menu", "search", "cart", "social"];
export function ZonesEditor({ zones, onChange, onConfig }: { zones: HeaderZones; onChange: (z: HeaderZones) => void; onConfig?: (el: HeaderEl) => void }) {
  const ZK = ["left", "center", "right"] as const;
  const ZL: Record<(typeof ZK)[number], string> = { left: "ซ้าย", center: "กลาง", right: "ขวา" };
  const placed = new Set([...zones.left, ...zones.center, ...zones.right]);
  const missing = HEADER_EL_DEFS.filter((d) => !placed.has(d.key));
  const label = (k: HeaderEl) => HEADER_EL_DEFS.find((d) => d.key === k)?.label ?? k;
  const move = (from: (typeof ZK)[number], idx: number, dir: -1 | 1) => {
    const to = ZK[ZK.indexOf(from) + dir];
    if (!to) return;
    const el = zones[from][idx];
    onChange({ ...zones, [from]: zones[from].filter((_, i) => i !== idx), [to]: dir === 1 ? [el, ...zones[to]] : [...zones[to], el] });
  };
  const remove = (z: (typeof ZK)[number], idx: number) => onChange({ ...zones, [z]: zones[z].filter((_, i) => i !== idx) });
  const add = (z: (typeof ZK)[number], el: HeaderEl) => onChange({ ...zones, [z]: [...zones[z], el] });
  return (
    <div className="grid grid-cols-3 gap-2">
      {ZK.map((z) => (
        <ZoneColumn key={z} title={ZL[z]} items={zones[z]} label={label} onConfig={onConfig} canLeft={z !== "left"} canRight={z !== "right"} missing={missing} onReorder={(from, to) => onChange({ ...zones, [z]: moveItem(zones[z], from, to) })} onMove={(i, d) => move(z, i, d)} onRemove={(i) => remove(z, i)} onAdd={(el) => add(z, el)} />
      ))}
    </div>
  );
}
function ZoneColumn({ title, items, label, onConfig, canLeft, canRight, missing, onReorder, onMove, onRemove, onAdd }: { title: string; items: HeaderEl[]; label: (k: HeaderEl) => string; onConfig?: (el: HeaderEl) => void; canLeft: boolean; canRight: boolean; missing: { key: HeaderEl; label: string }[]; onReorder: (from: number, to: number) => void; onMove: (i: number, dir: -1 | 1) => void; onRemove: (i: number) => void; onAdd: (el: HeaderEl) => void }) {
  const drag = useDragReorder(onReorder);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 min-h-[96px]">
      <div className="text-[11px] font-semibold text-slate-500 mb-1.5 text-center">{title}</div>
      <ul className="space-y-1">
        {items.map((el, i) => (
          <li key={el} {...drag.rowProps(i)} className={`flex items-center gap-1 bg-white border border-slate-200 rounded-md px-1.5 py-1 text-xs text-slate-700 ${drag.rowCls(i)}`}>
            <DragHandle {...drag.handleProps(i)} />
            {onConfig && ZONE_CONFIGURABLE.includes(el) ? (
              <button type="button" onClick={() => onConfig(el)} className="flex-1 min-w-0 flex items-center gap-1 text-left text-blue-700 hover:underline" title={`ตั้งค่า${label(el)}`}>
                <span className="truncate">{label(el)}</span>
                <span aria-hidden className="text-[10px] text-slate-400">⚙</span>
              </button>
            ) : (
              <span className="flex-1 truncate" title={HEADER_EL_DEFS.find((d) => d.key === el)?.hint}>{label(el)}</span>
            )}
            <button type="button" disabled={!canLeft} onClick={() => onMove(i, -1)} className="text-slate-400 hover:text-blue-600 disabled:opacity-20 px-0.5" title="ย้ายไปโซนซ้าย">◀</button>
            <button type="button" disabled={!canRight} onClick={() => onMove(i, 1)} className="text-slate-400 hover:text-blue-600 disabled:opacity-20 px-0.5" title="ย้ายไปโซนขวา">▶</button>
            <button type="button" onClick={() => onRemove(i)} className="text-slate-300 hover:text-rose-600 px-0.5" title="เอาออก">✕</button>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <select className="mt-1.5 w-full h-7 rounded-md border border-dashed border-slate-300 text-[11px] text-slate-500 bg-white px-1" value="" onChange={(e) => e.target.value && onAdd(e.target.value as HeaderEl)}>
          <option value="">+ เพิ่มชิ้นส่วน…</option>
          {missing.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      )}
    </div>
  );
}

/* ─────────── เมนู: ชุดตั้งค่าทั้งก้อน (แท็บ "เมนู" + ป๊อปจากชิ้น "เมนู" ใน Header ใช้ตัวเดียวกัน) ─────────── */
/** ✨ ตัวอย่างเอฟเฟกต์ตอนชี้ (CSS ชุดเดียวกับเว็บร้าน globals.css .nav-hv-* / .mm-hv-*) */
function HoverDemo({ b }: { b: MenuBehavior }) {
  const c = b.hoverColor || "#1D4ED8";
  const top = (k: string) =>
    k === "fade" ? "hover:opacity-60" : k === "color" ? "hd-color" : k === "underline" ? "hd-under hd-color" : "hd-grow";
  const sub = (k: string) => (k === "color" ? "hd-color" : k === "underline" ? "hd-under2 hd-color" : k === "grow" ? "hd-grow" : "");
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800" style={{ ["--hd" as string]: c }}>
      <style>{`.hd-color{transition:color .2s}.hd-color:hover{color:var(--hd)}.hd-under{background-image:linear-gradient(var(--hd),var(--hd));background-size:0 1.5px;background-repeat:no-repeat;background-position:0 100%;padding-bottom:2px;transition:background-size .25s,color .2s}.hd-under:hover{background-size:100% 1.5px}.hd-under2{text-decoration:underline;text-decoration-color:transparent;text-underline-offset:4px;transition:text-decoration-color .2s,color .2s}.hd-under2:hover{text-decoration-color:var(--hd)}.hd-grow{display:inline-block;transition:transform .2s;transform-origin:left center}.hd-grow:hover{transform:scale(1.07)}`}</style>
      <p className="text-[10px] text-slate-400 mb-1">ตัวอย่าง (ชี้เมาส์ดู)</p>
      <div className="flex gap-3 font-semibold uppercase tracking-wider text-[11px] mb-1.5">
        {["Bags", "Wallets", "ติดต่อ"].map((t) => (
          <span key={t} className={`cursor-pointer transition-opacity ${top(b.navHover)}`}>{t}</span>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {["กระเป๋าเป้", "กระเป๋าคาดอก"].map((t) => (
          <span key={t} className={`cursor-pointer w-fit ${sub(b.subHover)}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** ⚙️ พฤติกรรมเมนูทั้งชุด (lib/website-mega-menu MenuBehavior) — ใช้กับทุกเมนูที่มีเมนูย่อย/แผง */
function MenuBehaviorSettings({ value, onChange, typo }: { value: MenuBehavior; onChange: (p: Partial<MenuBehavior>) => void; typo?: MenuTypo }) {
  const [typoOpen, setTypoOpen] = useState(false);
  const seg = (on: boolean) => `text-[11px] px-2.5 h-7 rounded-md border ${on ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-400"}`;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
      <p className="text-xs font-semibold text-slate-700">⚙️ หน้าตา + พฤติกรรมเมนู (ใช้กับทุกเมนู)</p>
      {/* 🔠 ตัวอักษรเมนู — ค่าเดียวกับแท็บตัวอักษร (เมนูด้านบน / เมนูย่อย-แผงเมนู) แก้ที่ไหนก็ตรงกัน */}
      {typo && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500">🔠 เมนูด้านบน</span>
              <button type="button" className={seg(typo.nav)} onClick={() => typo.setUpper("nav", true)}>ตัวพิมพ์ใหญ่ทั้งหมด (BAGS)</button>
              <button type="button" className={seg(!typo.nav)} onClick={() => typo.setUpper("nav", false)}>ตามที่พิมพ์ (Bags)</button>
            </div>
            <div className="flex items-center gap-1.5" title="หัวคอลัมน์ ลิงก์ แท็บ และชื่อการ์ดในเมนูย่อย/แผงเมนู (คำอธิบายและชื่อสินค้าไม่เปลี่ยน)">
              <span className="text-[11px] text-slate-500">เมนูย่อย/แผง</span>
              <button type="button" className={seg(typo.menu)} onClick={() => typo.setUpper("menu", true)}>ใหญ่ทั้งหมด</button>
              <button type="button" className={seg(!typo.menu)} onClick={() => typo.setUpper("menu", false)}>ตามที่พิมพ์</button>
            </div>
          </div>
          <div>
            <button type="button" onClick={() => setTypoOpen((v) => !v)} className="text-[11px] text-blue-600 hover:underline">
              {typoOpen ? "▲" : "▼"} ฟอนต์ · สี · ขนาด · น้ำหนัก · ระยะตัวอักษร ของเมนู
            </button>
            {typoOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-slate-500">ตัวเดียวกับ แท็บตัวอักษร → ปรับละเอียดรายบทบาท — แก้ตรงนี้ แท็บตัวอักษรเปลี่ยนตาม (และกลับกัน)</p>
                {typo.editors}
              </div>
            )}
          </div>
        </>
      )}
      {/* ✨ เอฟเฟกต์ตอนชี้ลิงก์ — ตัวอย่างสดด้านขวา (ชี้เมาส์ดู) */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 w-24">✨ ชี้เมนูด้านบน</span>
            {NAV_HOVERS.map((o) => (
              <button key={o.value} type="button" className={seg(value.navHover === o.value)} onClick={() => onChange({ navHover: o.value })}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 w-24">✨ ชี้เมนูย่อย/แผง</span>
            {SUB_HOVERS.map((o) => (
              <button key={o.value} type="button" className={seg(value.subHover === o.value)} onClick={() => onChange({ subHover: o.value })}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 w-24">สีตอนชี้</span>
            <span className="w-32">
              <ColorInput value={value.hoverColor || "#1D4ED8"} onChange={(v) => onChange({ hoverColor: v })} />
            </span>
            {value.hoverColor ? (
              <button type="button" className="text-[11px] text-slate-400 hover:text-rose-600" onClick={() => onChange({ hoverColor: "" })}>
                ✕ ใช้สีลิงก์ของธีม
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">= สีลิงก์ของธีม (แท็บสี → ปรับละเอียด)</span>
            )}
          </div>
        </div>
        <HoverDemo b={value} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">เปิดแผงเมื่อ</span>
          <button type="button" className={seg(value.open === "hover")} onClick={() => onChange({ open: "hover" })}>ชี้เมาส์</button>
          <button type="button" className={seg(value.open === "click")} onClick={() => onChange({ open: "click" })}>กดก่อน</button>
        </div>
        {value.open === "hover" && (
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500" title="ชี้ค้างนานเท่านี้ก่อนแผงเปิด — กันแผงเด้งตอนแค่เลื่อนเมาส์ผ่านเมนู">
            หน่วงก่อนเปิด
            <WheelSelect value={value.delay} onChange={(e) => onChange({ delay: Number(e.target.value) })}>
              {MENU_DELAYS.map((ms) => (
                <option key={ms} value={ms}>{ms === 0 ? "ไม่หน่วง" : `${(ms / 1000).toFixed(ms % 100 ? 2 : 1)} วินาที`}</option>
              ))}
            </WheelSelect>
          </label>
        )}
        <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
          <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.dim} onChange={(e) => onChange({ dim: e.target.checked })} />
          ฉากหลังมืดลงตอนแผงเปิด
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">📱 มือถือ</span>
          <button type="button" className={seg(value.mobileStyle === "accordion")} onClick={() => onChange({ mobileStyle: "accordion" })}>พับ-กาง</button>
          <button type="button" className={seg(value.mobileStyle === "drill")} onClick={() => onChange({ mobileStyle: "drill" })}>เลื่อนเข้าหน้าถัดไป (แบบแอป)</button>
        </div>
        <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer" title="รูปหมวดวงกลมเลื่อนแนวนอนบนสุดของเมนูมือถือ (ต้องใส่รูปหมวดในแท็บหมวดหมู่)">
          <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.mobileCats} onChange={(e) => onChange({ mobileCats: e.target.checked })} />
          แถบรูปหมวดวงกลมบนสุด
        </label>
      </div>
    </div>
  );
}

/** 🔠 ตัวอักษรเมนู (theme.typography.nav / .menu) ที่ส่งจากหน้าดีไซน์ — ค่าเดียวกับแท็บตัวอักษร */
type MenuTypo = { nav: boolean; menu: boolean; setUpper: (k: "nav" | "menu", v: boolean) => void; editors: React.ReactNode };
function MenuSettings({ menu, setMenu, choices, pages, megaCtx, typo }: { menu: MenuConfig; setMenu: (p: Partial<MenuConfig>) => void; choices: Choices; pages: { slug: string; title: string }[]; megaCtx?: MegaEditorCtx; typo?: MenuTypo }) {
  const [askAuto, setAskAuto] = useState(false);
  return (
    <>
      {menu.items === null ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          ตอนนี้ใช้เมนู<b>อัตโนมัติ</b>: สินค้าทั้งหมด → หน้าที่สร้างเอง → ติดต่อ (ถ้ากรอกช่องทางติดต่อแล้ว)
          <div className="mt-3">
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => setMenu({ items: [newMenuItem("สินค้าทั้งหมด", "shop"), ...pages.map((pg) => newMenuItem(pg.title, "page", pg.slug)), newMenuItem("ติดต่อ", "contact")] })}
            >
              จัดเมนูเอง (เริ่มจากชุดอัตโนมัติ)
            </button>
          </div>
        </div>
      ) : (
        <>
          <MenuEditor items={menu.items} onChange={(items) => setMenu({ items })} choices={choices} pages={pages} megaCtx={megaCtx} />
          <button type="button" className="mt-3 text-xs text-slate-500 hover:text-rose-600 hover:underline" onClick={() => setAskAuto(true)}>
            กลับไปใช้เมนูอัตโนมัติ
          </button>
        </>
      )}

      <MenuBehaviorSettings value={menu.behavior ?? DEFAULT_MENU_BEHAVIOR} onChange={(p) => setMenu({ behavior: { ...DEFAULT_MENU_BEHAVIOR, ...menu.behavior, ...p } })} typo={typo} />

      <div className="mt-5 pt-3 border-t border-slate-100">
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={menu.mobileItems !== null} onChange={(e) => setMenu({ mobileItems: e.target.checked ? (menu.items ?? []).map((it) => ({ ...it, id: `mb${it.id}`, children: it.children.map((c) => ({ ...c, id: `mb${c.id}` })) })) : null })} />
          📱 มือถือใช้เมนูคนละชุด
        </label>
        {menu.mobileItems !== null && (
          <div className="mt-3">
            <MenuEditor items={menu.mobileItems} onChange={(mobileItems) => setMenu({ mobileItems })} choices={choices} pages={pages} megaCtx={megaCtx} />
          </div>
        )}
      </div>
      <ConfirmDialog
        open={askAuto}
        onClose={() => setAskAuto(false)}
        onConfirm={() => {
          setMenu({ items: null, mobileItems: null });
          setAskAuto(false);
        }}
        title="กลับไปใช้เมนูอัตโนมัติ?"
        message="รายการเมนูที่จัดไว้ (รวมชุดมือถือ) จะหาย แล้วเว็บใช้เมนูอัตโนมัติแทน"
        confirmText="ใช้เมนูอัตโนมัติ"
        variant="danger"
      />
    </>
  );
}

/* ─────────── เมนู: รายการ + รายการย่อย (ลึก 1 ชั้น) ─────────── */
function MenuEditor({ items, onChange, choices, pages, depth = 0, parentMega = false, megaCtx }: { items: MenuItem[]; onChange: (items: MenuItem[]) => void; choices: Choices; pages: { slug: string; title: string }[]; depth?: number; parentMega?: boolean; /** มี = เมนูบนสุดเลือกแผงเมนูใหญ่ A/B/C ได้ */ megaCtx?: MegaEditorCtx }) {
  const drag = useDragReorder((from, to) => onChange(moveItem(items, from, to)));
  const [openId, setOpenId] = useState<string | null>(null);
  const setItem = (id: string, patch: Partial<MenuItem>) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
  const valueField = (it: MenuItem) => {
    switch (it.kind) {
      case "category":
        return (
          <select className={`${mini} w-full`} value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value })}>
            <option value="">— เลือกหมวด —</option>
            {(choices.categories ?? []).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        );
      case "product":
        return (
          <select className={`${mini} w-full`} value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value })}>
            <option value="">— เลือกสินค้า —</option>
            {(choices.products ?? []).map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
          </select>
        );
      case "page":
        return (
          <select className={`${mini} w-full`} value={it.value} onChange={(e) => setItem(it.id, { value: e.target.value })}>
            <option value="">— เลือกหน้า —</option>
            {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          </select>
        );
      case "url":
        return <input className={`${mini} w-full`} value={it.value} placeholder="https://… หรือ /path" onChange={(e) => setItem(it.id, { value: e.target.value })} />;
      default:
        return <span className="text-[11px] text-slate-400">{menuItemHref(it)}</span>;
    }
  };
  return (
    <div>
      <ul className="space-y-1">
        {items.map((it, i) => {
          const open = openId === it.id;
          return (
            <li key={it.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-blue-300" : "border-slate-200"} bg-white ${drag.rowCls(i)}`}>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <input className={`${mini} flex-1 min-w-0`} value={it.label} maxLength={60} onChange={(e) => setItem(it.id, { label: e.target.value })} placeholder="ชื่อเมนู" />
                <select className={mini} value={it.kind} onChange={(e) => setItem(it.id, { kind: e.target.value as MenuKind, value: "" })}>
                  {MENU_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <button type="button" onClick={() => setOpenId(open ? null : it.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`} title="ตั้งค่าเพิ่ม">✎{it.children.length ? ` ${it.children.length}` : ""}</button>
                <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="text-slate-300 hover:text-rose-600 px-1" title="ลบ">✕</button>
              </div>
              {open && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">ลิงก์ไป</label>
                      {valueField(it)}
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">ป้ายเล็ก (เช่น ใหม่ / ลด)</label>
                      <input className={`${mini} w-full`} value={it.badge} maxLength={20} onChange={(e) => setItem(it.id, { badge: e.target.value })} />
                    </div>
                  </div>
                  <ShowWindowFields from={it.showFrom} until={it.showUntil} onChange={(p) => setItem(it.id, p)} />
                  {depth === 0 && megaCtx && (
                    <MegaMenuEditor itemId={it.id} panel={it.panel} onChange={(panel) => setItem(it.id, { panel })} ctx={megaCtx} />
                  )}
                  {depth === 0 && it.kind === "categories" && !it.panel && (
                    <div className="rounded-md bg-blue-50 border border-blue-100 px-2 py-1.5 space-y-1">
                      <p className="text-[11px] text-blue-800">📂 เมนูย่อย = ทุกหมวดในแท็บ &quot;หมวดหมู่&quot; เรียงตามนั้น (เพิ่ม/ลบหมวดแล้วเมนูเปลี่ยนเอง)</p>
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                        <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={it.mega} onChange={(e) => setItem(it.id, { mega: e.target.checked })} />
                        แผง Mega (กว้าง โชว์รูปหมวด)
                      </label>
                    </div>
                  )}
                  {depth === 0 && it.kind !== "categories" && !it.panel && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] text-slate-500">เมนูย่อย ({it.children.length})</label>
                        <div className="flex items-center gap-3">
                          {it.children.length > 0 && (
                            <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer"><input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={it.mega} onChange={(e) => setItem(it.id, { mega: e.target.checked })} />แผง Mega (กว้าง มีรูป)</label>
                          )}
                          <button type="button" className="text-[11px] text-blue-600 hover:underline" onClick={() => setItem(it.id, { children: [...it.children, newMenuItem("รายการย่อย", "shop")] })}>+ เพิ่มรายการย่อย</button>
                        </div>
                      </div>
                      {it.children.length > 0 && (
                        <div className="pl-3 border-l-2 border-slate-100">
                          <MenuEditor items={it.children} onChange={(children) => setItem(it.id, { children })} choices={choices} pages={pages} depth={1} parentMega={it.mega} />
                        </div>
                      )}
                    </div>
                  )}
                  {depth === 1 && parentMega && (
                    <ImageUploadField label="รูปในแผง Mega" hint="สัดส่วน 4:3" value={it.imageKey} onChange={(key) => setItem(it.id, { imageKey: key })} height={48} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {depth === 0 && (
        <button type="button" className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => { const it = newMenuItem(); onChange([...items, it]); setOpenId(it.id); }}>+ เพิ่มเมนู</button>
      )}
    </div>
  );
}

/* ─────────── Footer: คอลัมน์ ─────────── */
function FooterColumnsEditor({ columns, onChange, choices, pages }: { columns: FooterColumn[]; onChange: (c: FooterColumn[]) => void; choices: Choices; pages: { slug: string; title: string }[] }) {
  const drag = useDragReorder((from, to) => onChange(moveItem(columns, from, to)));
  const [openId, setOpenId] = useState<string | null>(null);
  const setCol = (id: string, patch: Partial<FooterColumn>) => onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const mini = "h-7 rounded-lg border border-slate-200 text-[11px] px-1.5 bg-white text-slate-700";
  const used = columns.reduce((n, c) => n + c.width, 0);
  return (
    <div>
      <ul className="space-y-1">
        {columns.map((c, i) => {
          const def = FOOTER_COL_DEFS.find((d) => d.key === c.kind)!;
          const open = openId === c.id;
          return (
            <li key={c.id} {...drag.rowProps(i)} className={`rounded-lg border ${open ? "border-blue-300" : "border-slate-200"} bg-white ${drag.rowCls(i)}`}>
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <select className={mini} value={c.kind} onChange={(e) => setCol(c.id, { kind: e.target.value as FooterColKind })}>
                  {FOOTER_COL_DEFS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
                <input className={`${mini} flex-1 min-w-0`} value={c.title} maxLength={60} placeholder={def.defaultTitle || "หัวข้อ (ไม่บังคับ)"} onChange={(e) => setCol(c.id, { title: e.target.value })} />
                <select className={mini} value={c.width} onChange={(e) => setCol(c.id, { width: Number(e.target.value) === 2 ? 2 : 1 })} title="ความกว้าง">
                  <option value={1}>กว้าง 1</option>
                  <option value={2}>กว้าง 2</option>
                </select>
                <button type="button" onClick={() => setOpenId(open ? null : c.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`} title="ตั้งค่าเพิ่ม">✎</button>
                <button type="button" onClick={() => onChange(columns.filter((x) => x.id !== c.id))} className="text-slate-300 hover:text-rose-600 px-1" title="ลบ">✕</button>
              </div>
              {open && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                  <p className="text-[11px] text-slate-400">{def.hint}</p>
                  {(c.kind === "text" || c.kind === "about" || c.kind === "newsletter") && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">{c.kind === "about" ? "คำอธิบาย (ว่าง = ใช้คำอธิบายร้านจากแท็บข้อมูลร้าน)" : "ข้อความ"}</label>
                      <textarea className="w-full rounded-lg border border-slate-200 text-xs px-2 py-1.5 bg-white text-slate-700" rows={3} value={c.text} onChange={(e) => setCol(c.id, { text: e.target.value })} />
                    </div>
                  )}
                  {c.kind === "links" && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">ลิงก์ (ว่าง = อัตโนมัติ)</label>
                      <MenuEditor items={c.links} onChange={(links) => setCol(c.id, { links })} choices={choices} pages={pages} depth={1} />
                      <button type="button" className="mt-2 text-[11px] text-blue-600 hover:underline" onClick={() => setCol(c.id, { links: [...c.links, newMenuItem("ลิงก์ใหม่", "page")] })}>+ เพิ่มลิงก์</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3 mt-2">
        <button type="button" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={() => { const c = newFooterColumn(); onChange([...columns, c]); setOpenId(c.id); }}>+ เพิ่มคอลัมน์</button>
        <span className="text-[11px] text-slate-400">ใช้ไป {used} / 4 ช่องต่อแถว{used > 4 ? " — เกินจะขึ้นแถวใหม่" : ""}</span>
      </div>
    </div>
  );
}
