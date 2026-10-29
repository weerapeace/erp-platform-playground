"use client";

/**
 * WebsiteThemePanel — แท็บ "🎨 ดีไซน์" ในหน้า /website/<slug>
 *
 * เมนูซ้ายจัดหมวด (ของกลาง SettingsNavLayout · สารบัญ lib/website-design-nav): ภาพรวม · ทั้งเว็บ · หัว-ท้ายเว็บ · สินค้า · ซื้อขาย · หน้าอื่น ๆ
 * เนื้อหาแต่ละหน้าอยู่ components/website-design/* (ดึงค่าผ่าน DesignCtx) · ?d=<หน้า> ในลิงก์ = เปิดหน้านั้น
 * ร่าง/เผยแพร่ · undo/redo (Ctrl+Z) · คืนค่ารายช่อง · ตรวจ contrast (WCAG) ·
 * พรีวิว = เว็บจริงใน iframe (?preview=1) ส่งธีมสดผ่าน postMessage
 *
 * ข้อมูล: /api/website/theme · /api/website/theme/versions · อัปโหลดรูปผ่าน /api/admin/upload (R2)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useReportUnsaved } from "@/components/save-bar";
import { useToast } from "@/components/toast";
import { ListingPanel } from "@/components/website-listing-panel";
import { PathsLangBar, TranslateButton } from "@/components/translation-table";
import { ContentLangProvider } from "@/components/bilingual-field";
import { previewInEnglish } from "@/lib/website-i18n";
import { type ContentLang } from "@/lib/content-i18n";
import { THEME_TEXT_KEYS, themeCrumb, googleFontsHref, themeFontNames, type Shape, type MenuConfig, type FooterConfig } from "@/lib/website-theme";
import { CopyButton } from "@/components/copy-button";
import { type MegaEditorCtx } from "@/components/website-mega-menu-editor";
import { RelatedSettings } from "@/components/website-related-settings";
import { SitePagesSetting } from "@/components/website-site-design-setting";
import { CampaignTab, ScheduleBanner, SchedulePublishModal, cancelSchedule, useThemeSchedules } from "@/components/website-theme-schedule";
import { withPreviewKey } from "@/lib/storefront-preview-link";
import { type MegaAutoData } from "@/lib/website-mega-menu";
import { setPreviewFrame, usePreviewMessages } from "@/lib/storefront-preview-bus";
import { ProductTab } from "@/components/website-design/product-tab";
import { CardTab } from "@/components/website-design/card-tab";
import { ColorsTab } from "@/components/website-design/colors-tab";
import { type SampleItem, type Theme, type Choices, type ColorKey, FINE_COLOR_KEYS, COLOR_FIELDS, inputCls, timeAgo } from "@/components/website-design/shared";
import { FontsTab } from "@/components/website-design/fonts-tab";
import { HeaderTab } from "@/components/website-design/header-tab";
import { MenuTab } from "@/components/website-design/menu-tab";
import { PageHealthCtx } from "@/components/website-design/link-health";
import { FooterTab } from "@/components/website-design/footer-tab";
import { ShapeTab } from "@/components/website-design/shape-tab";
import { HistoryTab } from "@/components/website-design/history-tab";
import { CheckoutTab, CartTab } from "@/components/website-design/sell-tabs";
import { LogoSettings } from "@/components/website-design/logo-tab";
import { DesignCtx, type DesignCtxValue } from "@/components/website-design/context";
import { MotionTab, MobileSalesTab } from "@/components/website-design/shape-tab";
import { DesignOverview } from "@/components/website-design/overview";
import { DesignCard, DesignCardsProvider, DesignCardsToggleAll } from "@/components/website-design/design-card";
import { SettingsNavLayout, type SettingsNavGroup } from "@/components/settings-nav";
import { Icon } from "@/components/icon";
import { SPLIT_HANDLE_W, SplitHandle, useSplitWidth } from "@/components/split-handle";
import { DESIGN_GROUPS, DESIGN_PAGES, PREVIEW_PART_RULES, designGroupOf, dirtyDesignPages, isDesignPageKey, normTitle, previewFocusOf, previewRuleOf, searchDesign, type DesignPageKey } from "@/lib/website-design-nav";
const FINE_COLOR_LABEL = "สีละเอียด";
/** หน้าในแท็บดีไซน์ = ทะเบียนกลาง lib/website-design-nav (เมนูซ้ายจัดหมวด) */
type TabKey = DesignPageKey;
type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { k: Device; label: string; w: number; h: number; icon: string }[] = [
  { k: "desktop", label: "คอมพิวเตอร์", w: 1440, h: 900, icon: "🖥️" },
  { k: "tablet", label: "แท็บเล็ต", w: 768, h: 1024, icon: "📱" },
  { k: "mobile", label: "มือถือ", w: 390, h: 844, icon: "📲" },
];

/** path พรีวิว + ?preview=1 (path มี ?query อยู่แล้ว เช่น หน้าขอบคุณ = ต่อด้วย &) */
const withPreview = (path: string, pk: string | null) => withPreviewKey(`${path}${path.includes("?") ? "&" : "?"}preview=1`, pk);

/** ระดับการย่อพรีวิว — "fit" = ย่อให้พอดีกล่อง (เหมือนแท็บจัดหน้าแรก) */
/** "fit" = ย่อให้พอดีกล่อง · ตัวเลข = ซูมเอง (Ctrl+ลูกกลิ้ง / ปุ่ม − + · 25%–150%) */
type Zoom = "fit" | number;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;

/** แท็บ → หน้าที่พรีวิว ("product" = สินค้าตัวอย่างของร้าน) · ไม่อยู่ในรายการ = อยู่หน้าเดิม */
const TAB_PREVIEW_PAGE: Partial<Record<TabKey, string>> = { card: "/shop", listing: "/shop", product: "product", related: "product", checkout: "/checkout", pages: "/zz-page-not-found", campaign: "/" };

const PAGES = [
  { path: "/", label: "หน้าแรก" },
  { path: "/shop", label: "สินค้าทั้งหมด (ร้านค้า)" },
  { path: "/oem", label: "รับผลิต" },
  { path: "/quote", label: "ขอใบเสนอราคา" },
  { path: "/contact", label: "ติดต่อ" },
  { path: "/cart", label: "ตะกร้า (เต็มหน้า)" },
  { path: "/new", label: "มาใหม่" },
  { path: "/checkout", label: "หน้าชำระเงิน" },
  { path: "/checkout?pv=thanks", label: "หน้าขอบคุณ (หลังสั่ง)" },
  { path: "/zz-page-not-found", label: "หน้า 404 (ไม่พบหน้า)" },
  { path: "/?pv=popup", label: "ป๊อปอัปรับส่วนลด (ตัวอย่าง)" },
  { path: "/account/login", label: "หน้าเข้าสู่ระบบ" },
];

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** กฎป้ายในพรีวิว (prefix → "แก้: <ชื่อ>") ส่งให้เว็บร้านตอนเปิดโหมดคลิกเลือกส่วน */
const AREA_RULES = PREVIEW_PART_RULES.map(({ prefix, label }) => ({ prefix, label }));

export function WebsiteThemePanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [theme, setTheme] = useState<Theme | null>(null);
  const [published, setPublished] = useState<Theme | null>(null);
  /** ค่าที่บันทึกล่าสุด (ร่างถ้ามี ไม่มี = ที่เผยแพร่) — ใช้ตัดสินว่า "ยังไม่บันทึก" (เทียบกับ published = บันทึกร่างแล้วก็ยังฟ้องค้าง) */
  const [saved, setSaved] = useState<Theme | null>(null);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null); // 🔑 รหัสพรีวิว (ผ่านหน้าปิดเว็บ)
  const [choices, setChoices] = useState<Choices | null>(null);
  const [lastVersion, setLastVersion] = useState<{ version_no: number; created_at: string } | null>(null);
  const [hadDraft, setHadDraft] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [tab, setTabState] = useState<TabKey>("overview");
  // 🔗 ?d=<หน้า> ในลิงก์ = เปิดหน้านั้นเลย · เปลี่ยนหน้าแล้วอัปเดตลิงก์ (ไม่ใช้ useSearchParams — อยู่ใน PlaygroundShell)
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("d");
    if (isDesignPageKey(d)) setTabState(d);
  }, []);
  const setTab = useCallback((k: TabKey) => {
    setTabState(k);
    try {
      const url = new URL(window.location.href);
      if (k === "overview") url.searchParams.delete("d");
      else url.searchParams.set("d", k);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* เปลี่ยนลิงก์ไม่ได้ก็ไม่เป็นไร */
    }
  }, []);
  // 🔎 ไปหน้า + การ์ดที่ค้นเจอ → เลื่อนให้เห็นแล้วกะพริบกรอบ (หาจากหัวการ์ดบนจอ)
  const settingsColRef = useRef<HTMLDivElement>(null);
  const goTo = useCallback((k: TabKey, card?: string) => {
    setTab(k);
    if (!card) return;
    const want = normTitle(card);
    const tryFocus = (left: number) => {
      const col = settingsColRef.current;
      const head = col ? Array.from(col.querySelectorAll("h3, h4")).find((h) => normTitle(h.textContent ?? "").startsWith(want)) : undefined;
      if (!head) {
        if (left > 0) window.setTimeout(() => tryFocus(left - 1), 120);
        return;
      }
      // การ์ดพับอยู่ → กางก่อน (DesignCard ฟัง event นี้) แล้วค่อยเลื่อน
      window.dispatchEvent(new CustomEvent("website-design-focus", { detail: card }));
      window.setTimeout(() => {
        const box = (head.closest("[data-design-card]") ?? head.closest(".rounded-xl") ?? head) as HTMLElement;
        box.scrollIntoView({ behavior: "smooth", block: "start" });
        box.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
        window.setTimeout(() => box.classList.remove("ring-2", "ring-amber-400", "ring-offset-2"), 1600);
      }, 80);
    };
    window.setTimeout(() => tryFocus(8), 60);
  }, [setTab]);
  // ⏰🎪 ชุด 5: งานตั้งเวลา/แคมเปญ (components/website-theme-schedule) · campPreview = ดูตัวอย่างแคมเปญในพรีวิว (ไม่บันทึก)
  const { list: schedules, reload: reloadSchedules } = useThemeSchedules(shopSlug);
  const pendingSchedule = (schedules ?? []).find((s) => s.kind === "publish" && s.status === "pending") ?? null;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [campPreview, setCampPreview] = useState<{ id: string; name: string; theme: unknown } | null>(null);
  useEffect(() => {
    if (tab !== "campaign") setCampPreview(null);
  }, [tab]);
  // 🌐 ภาษาที่กำลังแก้ทั้งหน้าดีไซน์ (ไทย | EN) — ช่องข้อความ LangInput / Text สลับตาม · พรีวิวเป็นหน้า /en
  const [contentLang, setContentLang] = useState<ContentLang>("th");
  const [device, setDevice] = useState<Device>("desktop");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [page, setPage] = useState("/");
  /** สินค้าตัวแรกบนเว็บร้านนี้ — ไว้เปิดพรีวิว "หน้าสินค้า (ตัวอย่าง)" */
  const [sampleProduct, setSampleProduct] = useState<string | null>(null);
  // สินค้าตัวอย่างสำหรับการ์ดจำลองในแท็บการ์ดสินค้า
  const [sampleItems, setSampleItems] = useState<SampleItem[]>([]);
  const [liveProducts, setLiveProducts] = useState<(MegaEditorCtx["liveProducts"][number] & { collection?: string | null })[]>([]);
  // 🧭 หมวด(+รูป)/คอลเลกชัน/โทนสี ของร้าน (API สาธารณะชุดเดียวกับเว็บร้าน) — รายการอัตโนมัติในแผงเมนู
  const [shopLists, setShopLists] = useState<{ categories: { key: string; label: string; imageKey: string | null; parent?: string | null }[]; collections: { id: string; slug: string; label: string; imageKey: string | null }[]; tones: { key: string; name: string; hex: string }[] } | null>(null);
  useEffect(() => {
    fetch(`/api/public/storefront/site?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j) => {
        const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        setShopLists({
          categories: arr(j?.categories).map((c) => ({ key: str(c.key), label: str(c.label), imageKey: str(c.imageKey) || null, parent: str(c.parent) || null })).filter((c) => c.key),
          collections: arr(j?.collections).map((c) => ({ id: str(c.id), slug: str(c.slug), label: str(c.title) || str(c.name), imageKey: str(c.bannerKey) || null })).filter((c) => c.slug),
          tones: arr(j?.colorTones).map((t) => ({ key: str(t.key), name: str(t.name), hex: str(t.hex) || "#888888" })).filter((t) => t.key),
        });
      })
      .catch(() => setShopLists(null));
  }, [shopSlug]);
  // หน้าที่สร้างเอง (ไว้ให้เมนูลิงก์ถึง)
  // preview=1 → รวมหน้าที่ยังเป็นร่าง (help = ชื่อกลุ่มศูนย์ช่วยเหลือ ไว้ให้คอลัมน์ท้ายเว็บ "ศูนย์ช่วยเหลือ" เลือกกลุ่ม)
  const [storePages, setStorePages] = useState<{ slug: string; title: string; help?: string; status?: string }[]>([]);
  // 🩺 โหลดสำเร็จแล้วเท่านั้นถึงเตือน "ไม่ขึ้นเว็บจริง" (โหลดพลาด = ไม่รู้ = ไม่เตือนมั่ว)
  const [pagesReady, setPagesReady] = useState(false);
  useEffect(() => {
    apiFetch(`/api/public/storefront/page?shop=${encodeURIComponent(shopSlug)}&preview=1`)
      .then((r) => r.json())
      .then((j) => {
        setStorePages((j?.pages as { slug: string; title: string }[]) ?? []);
        setPagesReady(Array.isArray(j?.pages));
      })
      .catch(() => setStorePages([]));
  }, [shopSlug]);
  const [versions, setVersions] = useState<{ versionNo: number; createdAt: string; theme: Theme }[]>([]);

  const undoStack = useRef<Theme[]>([]);
  const redoStack = useRef<Theme[]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** ตัวเลือกลิงก์ปลายทาง (ของกลาง) ในหน้าดีไซน์: ปุ่มหัวเว็บ · รูปแทรกในกริด */
  const linkCtx = useMemo(() => ({ shopSlug, shopId, categories: choices?.categories ?? [] }), [shopSlug, shopId, choices]);
  /** 🧭 ตัวจัดแผงเมนูใหญ่ (components/website-mega-menu-editor) */
  const megaAuto = useMemo<MegaAutoData | null>(() => {
    if (!shopLists) return null;
    const inCat = (k: string) => liveProducts.filter((p) => p.category === k || (p.categories ?? []).includes(k)).length;
    return {
      categories: shopLists.categories.filter((c) => !c.parent).map((c) => ({ key: c.key, label: c.label, imageKey: c.imageKey, count: inCat(c.key) })),
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
  // 🛒 อยู่แท็บตะกร้า → สั่งพรีวิวเปิดตะกร้าค้างไว้ (ตะกร้าว่าง = เว็บใส่สินค้าตัวอย่างให้ดู) · ออกจากแท็บ = ปิด
  const cartPin = useRef(false);
  useEffect(() => {
    const open = tab === "cart";
    if (cartPin.current === open) return;
    cartPin.current = open;
    iframeRef.current?.contentWindow?.postMessage({ type: "storefront-cart-pin", open }, "*");
  }, [tab]);
  // 🎯 โหมดคลิกเลือกส่วน: คลิกชิ้นในพรีวิว → เปิดหน้าตั้งค่านั้น (เว็บร้าน DesignAreaBridge · กฎ PREVIEW_PART_RULES)
  const [areaPick, setAreaPick] = useState(false);
  const areaPickRef = useRef(false);
  useEffect(() => {
    areaPickRef.current = areaPick;
    iframeRef.current?.contentWindow?.postMessage({ type: "storefront-area-pick", on: areaPick, rules: AREA_RULES }, "*");
  }, [areaPick]);
  // 👁 เปิดหน้าตั้งค่า → พรีวิวเลื่อนไปส่วนที่กำลังแก้ (มาจากคลิกในพรีวิว = เห็นอยู่แล้ว ไม่เลื่อน · ไม่พาพรีวิวไปหน้าอื่น)
  const fromPick = useRef(false);
  const focusRef = useRef<string[]>([]);
  useEffect(() => {
    focusRef.current = fromPick.current ? [] : previewFocusOf(tab);
    if (focusRef.current.length) iframeRef.current?.contentWindow?.postMessage({ type: "storefront-area-focus", prefixes: focusRef.current }, "*");
  }, [tab]);
  usePreviewMessages((d) => {
    // 🔍 Ctrl+ลูกกลิ้ง/บีบนิ้วบนพรีวิว → เว็บร้าน (DesignAreaBridge) ส่งมาให้ซูมเฉพาะพรีวิว
    if (d.type === "storefront-preview-zoom" && typeof d.deltaY === "number") {
      zoomBy(d.deltaY < 0 ? 0.05 : -0.05);
      return;
    }
    if (d.type !== "storefront-area-picked" || typeof d.part !== "string") return;
    const rule = previewRuleOf(d.part);
    if (!rule) return;
    if (rule.page !== tab) fromPick.current = true;
    goTo(rule.page, rule.card);
  });
  // วัดกล่องพรีวิวจริง เพื่อย่อ "พอดีจอ" (เดิม hardcode 400px → จอคอมถูกบีบเหลือ ~28%)
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(420);
  const [boxH, setBoxH] = useState(600);
  // 🔍 ซูมเฉพาะพรีวิว: เริ่มจากขนาดที่เห็นอยู่ (พอดีจอ = scale ปัจจุบัน) แล้วขยับทีละ 5%
  const scaleRef = useRef(1);
  const zoomBy = useCallback((d: number) => {
    // อัปเดต ref ทันที — หมุนลูกกลิ้งเร็ว ๆ หลายครั้งก่อน render จะได้สะสมต่อกัน
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((scaleRef.current + d) * 20) / 20));
    scaleRef.current = next;
    setZoom(next);
  }, []);
  // Ctrl+ลูกกลิ้งตรงขอบ/พื้นรอบพรีวิว (บนตัวเว็บ เบราว์เซอร์ส่งให้หน้าในกรอบ → มาทาง storefront-preview-zoom)
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 0.05 : -0.05);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loading, zoomBy]);
  // ↔ ความกว้างพรีวิว — ลากเส้นแบ่ง (ของกลาง components/split-handle · จำต่อคน · ดับเบิลคลิก = ค่าเริ่ม 40%)
  const split = useSplitWidth("website-design-preview", { min: 300, reserve: 420 + SPLIT_HANDLE_W });

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
      setSaved(j.draft ?? j.published);
      setPublished(j.published);
      setSiteUrl(j.shop?.siteUrl ?? null);
      setPreviewKey(j.shop?.previewKey ?? null);
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
    if (fromPick.current) {
      fromPick.current = false;
      return;
    }
    const path = TAB_PREVIEW_PAGE[tab] === "product" ? (sampleProduct ? `/product/${sampleProduct}` : null) : TAB_PREVIEW_PAGE[tab] ?? null;
    if (!path) return;
    if (page !== path) setPage(path);
    else if (siteUrl && iframeRef.current) iframeRef.current.src = `${siteUrl}${withPreview(path, previewKey)}`;
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

  // ส่งธีมเข้า iframe แบบสด (กำลังดูตัวอย่างแคมเปญ = ส่งธีมแคมเปญแทน)
  const shownTheme = campPreview?.theme ?? theme;
  useEffect(() => {
    if (!shownTheme) return;
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({ type: "storefront-theme-preview", theme: shownTheme }, "*");
    }, 120);
    return () => clearTimeout(t);
  }, [shownTheme]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "storefront-preview-ready" && menuPin.current) {
        iframeRef.current?.contentWindow?.postMessage({ type: "storefront-menu-pin", id: menuPin.current }, "*");
      }
      if ((e.data as { type?: string })?.type === "storefront-preview-ready" && cartPin.current) {
        iframeRef.current?.contentWindow?.postMessage({ type: "storefront-cart-pin", open: true }, "*");
      }
      if ((e.data as { type?: string })?.type === "storefront-preview-ready" && shownTheme) {
        iframeRef.current?.contentWindow?.postMessage({ type: "storefront-theme-preview", theme: shownTheme }, "*");
      }
      // 🎯 พรีวิวโหลดหน้าใหม่ → ส่งโหมดคลิกเลือกส่วน + ส่วนที่กำลังแก้ซ้ำ
      if ((e.data as { type?: string })?.type === "storefront-preview-ready") {
        if (areaPickRef.current) iframeRef.current?.contentWindow?.postMessage({ type: "storefront-area-pick", on: true, rules: AREA_RULES }, "*");
        if (focusRef.current.length) iframeRef.current?.contentWindow?.postMessage({ type: "storefront-area-focus", prefixes: focusRef.current }, "*");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [shownTheme]);

  // ส่วนที่แก้แล้วยังไม่ได้บันทึก — เทียบกับที่บันทึกล่าสุด (ร่าง/เผยแพร่) ไม่ใช่กับที่เผยแพร่อยู่
  const dirtyFields = useMemo(() => {
    const base = saved;
    if (!theme || !base) return [] as string[];
    const out: string[] = [];
    for (const f of COLOR_FIELDS) if (theme.colors[f.key] !== base.colors[f.key]) out.push(f.label);
    if (FINE_COLOR_KEYS.some((k) => theme.colors[k] !== base.colors[k])) out.push(FINE_COLOR_LABEL);
    if (theme.fonts.display !== base.fonts.display) out.push("ฟอนต์หัวข้อ");
    if (theme.fonts.body !== base.fonts.body) out.push("ฟอนต์เนื้อหา");
    if (theme.fonts.displayLatin !== base.fonts.displayLatin || theme.fonts.bodyLatin !== base.fonts.bodyLatin) out.push("ฟอนต์อังกฤษ");
    if (theme.radius !== base.radius) out.push("ความมนขอบ");
    if (!eq(theme.typography, base.typography)) out.push("ตัวอักษร");
    if (!eq(theme.shape, base.shape)) out.push("รูปทรง");
    {
      const { placeholder: ph, ...lg } = theme.logo;
      const { placeholder: php, ...lgp } = base.logo;
      if (!eq(lg, lgp)) out.push("โลโก้");
      if (!eq(ph, php)) out.push("รอรูปโหลด");
    }
    if (!eq(theme.header, base.header)) out.push("Header");
    if (!eq(theme.menu, base.menu)) out.push("เมนู");
    if (!eq(theme.footer, base.footer)) out.push("Footer");
    if (!eq(theme.listing, base.listing)) out.push("หน้ารายการสินค้า");
    if (!eq(theme.card, base.card)) out.push("การ์ดสินค้า");
    // หน้าสินค้า (Style/ชุดรายละเอียด/⚙️/ขนาดตัวอักษร/ค่ามือถือ) — เดิมไม่ถูกนับ ทำให้แถบล่างบอก "ไม่มีการเปลี่ยนแปลง" ทั้งที่แก้แล้ว
    if (!eq(theme.product, base.product)) out.push("หน้าสินค้า");
    if (!eq(theme.cart, base.cart)) out.push("ตะกร้า");
    if (!eq(theme.checkout, base.checkout)) out.push("หน้าชำระเงิน");
    // ✨ การเคลื่อนไหว + 🧱 ทั้งเว็บ (แท็บรูปทรง) — เดิมไม่ถูกนับ
    if (!eq(theme.page, base.page)) out.push("ทั้งเว็บ (รูปทรง)");
    return out;
  }, [theme, saved]);

  const isDirty = dirtyFields.length > 0;
  // แจ้งหน้าแม่: ยังไม่บันทึก → ถามก่อนสลับแท็บ (แถบล่างของหน้านี้ยังเป็นของตัวเอง: ร่าง/เผยแพร่)
  useReportUnsaved(isDirty);

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
    // ค่าที่ส่งจริง — ถ้าแก้ต่อระหว่างรอบันทึก ส่วนที่แก้เพิ่มยังนับเป็น "ยังไม่บันทึก"
    const sent = theme;
    setBusy(mode);
    try {
      const r = await apiFetch("/api/website/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, theme: sent, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setSaved(sent);
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
        setSaved(j.theme); // เซิร์ฟเวอร์บันทึกเป็นร่างให้แล้ว
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

  const dev = DEVICES.find((d) => d.k === device)!;
  const previewSrcTh = siteUrl ? `${siteUrl}${withPreview(page, previewKey)}` : null;
  // 🌐 กำลังแก้ภาษาอังกฤษ → พรีวิวหน้าเว็บฉบับ /en (ลูกค้าภาษาอังกฤษเห็นแบบนี้)
  const previewSrc = previewSrcTh && contentLang === "en" ? previewInEnglish(previewSrcTh) : previewSrcTh;
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.1, (boxW - 16) / dev.w)) : zoom;
  scaleRef.current = scale;
  // สูงพอให้เนื้อเว็บเต็มกล่องหลังย่อแล้ว (ไม่งั้นเหลือที่ว่างข้างล่าง)
  const frameH = Math.max(dev.h, Math.round((boxH - 16) / scale));

  // 🟠 หน้าที่แก้แล้วยังไม่บันทึก (เทียบค่าในธีมตามทะเบียน lib/website-design-nav)
  const dirtyPages = dirtyDesignPages(theme, saved);
  // 🧭 เมนูซ้ายจัดหมวด (ของกลาง SettingsNavLayout) — ภาพรวม + 5 หมวด
  const navGroups: SettingsNavGroup<TabKey>[] = [
    { label: "", items: [{ key: "overview", label: "ภาพรวม", desc: "สถานะ · สิ่งที่ควรทำ · ทางลัด", icon: <Icon name="home" /> }] },
    ...DESIGN_GROUPS.map((g) => ({
      label: g.label,
      icon: <Icon name={g.icon} />,
      items: g.pages.map((k) => ({ key: k, label: DESIGN_PAGES[k].label, desc: DESIGN_PAGES[k].desc, keywords: `${DESIGN_PAGES[k].keywords ?? ""} ${DESIGN_PAGES[k].cards.map((c) => c.title).join(" ")}`, dot: dirtyPages.includes(k) })),
    })),
  ];
  const curPage = tab === "overview" ? null : DESIGN_PAGES[tab];

  // 🧩 ของที่แท็บย่อย (components/website-design/*) ใช้ร่วม — ส่งผ่าน DesignCtx แทน props ยาว ๆ
  const designCtx: DesignCtxValue = {
    shopSlug, shopId, theme, published, choices, setChoices, apply, toast,
    setColor, setLogo, setHeader, setMenu, setFooter, setCard, setShape, setProduct,
    page, setPage, setDevice, sampleProduct, sampleItems, storePages, iframeRef, linkCtx, megaCtx,
    schedules, reloadSchedules, setScheduleOpen, campPreview, setCampPreview,
    versions, restore, editDevice, setEditDevice,
  };

  return (
    <ContentLangProvider lang={contentLang} onLangChange={setContentLang}>
    <DesignCtx.Provider value={designCtx}>
    <PageHealthCtx.Provider value={pagesReady ? storePages : null}>
    <div className="space-y-3">
      {/* แถบสถานะ — รวมคำเตือน "แก้เว็บจริง" ไว้บรรทัดเดียว (เดิมเป็นกล่องฟ้าแยก) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isDirty || hadDraft ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {isDirty ? "● มีการแก้ไขที่ยังไม่บันทึก" : hadDraft ? "● มีร่างที่ยังไม่เผยแพร่" : "✓ เผยแพร่แล้ว"}
        </span>
        <span className="text-[11px] text-slate-500">
          กำลังแก้ธีมของเว็บจริง · “บันทึกร่าง” ยังไม่เปลี่ยนหน้าเว็บ จนกว่าจะกด “เผยแพร่”
          {lastVersion && <span className="text-slate-400"> · เผยแพร่ล่าสุด เวอร์ชัน {lastVersion.version_no} · {timeAgo(lastVersion.created_at)}</span>}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {/* 🌐 ข้อความในธีมภาษาอังกฤษ (เมนู · ท้ายเว็บ · แผงเมนู · หัวเว็บ · หน้าสินค้า · ตะกร้า) — ตารางคำแปลของกลาง */}
          <TranslateButton
            className="shrink-0"
            value={theme}
            onChange={(next) => apply(next)}
            keys={THEME_TEXT_KEYS}
            crumbOf={themeCrumb}
            title="ข้อความในธีม — เมนู · ท้ายเว็บ · แผงเมนูใหญ่ · หัวเว็บ · หน้าสินค้า · ตะกร้า"
            description="แก้แล้วกด บันทึกร่าง / เผยแพร่ ของหน้านี้ตามปกติ · ช่องที่ยังว่าง ลูกค้าหน้า /en เห็นภาษาไทยแทน"
          />
          <button onClick={undo} disabled={!undoStack.current.length} title="ย้อนกลับ (Ctrl+Z)" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↶</button>
          <button onClick={redo} disabled={!redoStack.current.length} title="ทำซ้ำ" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↷</button>
        </div>
      </div>

      <SettingsNavLayout
        groups={navGroups}
        active={tab}
        onSelect={(k) => setTab(k)}
        showHeader={false}
        compact
        searchPlaceholder="ค้นหา เช่น โลโก้ ส่งฟรี favicon"
        searchHits={(q) => searchDesign(q).filter((h) => h.card).map((h) => ({ id: `${h.page}|${h.card}`, label: h.label, crumb: h.crumb, onPick: () => goTo(h.page, h.card) }))}
      >
      <div ref={split.containerRef} className="grid gap-4 xl:gap-x-0 xl:grid-cols-[minmax(0,1fr)_14px_var(--pv-w)] items-start" style={split.style("minmax(320px,40%)")}>
        {/* ── ซ้าย: ตั้งค่า ── */}
        <div ref={settingsColRef} className="min-w-0 space-y-3">
          {/* 🗂 การ์ดในหน้านี้พับ/กางได้ + จำต่อคน (components/website-design/design-card) */}
          <DesignCardsProvider page={tab}>
          {curPage && (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400">{designGroupOf(tab)?.label} ›</p>
                <h2 className="text-lg font-semibold text-slate-800 leading-tight">{curPage.label}</h2>
                <p className="text-xs text-slate-500">{curPage.desc}</p>
              </div>
              <DesignCardsToggleAll />
            </div>
          )}

          {/* 🌐 สลับภาษาที่กำลังแก้ทั้งหน้า (เหมือนตัวจัดหน้า) — EN = ทุกช่องข้อความเป็นภาษาอังกฤษ + พรีวิวหน้า /en · แปลที่ยังขาดทั้งธีม */}
          <PathsLangBar value={theme} onChange={(next) => apply(next)} keys={THEME_TEXT_KEYS} />
          {contentLang === "en" && (
            <p className="text-[11px] text-indigo-700 bg-indigo-50/60 border border-indigo-100 rounded-lg px-2.5 py-1.5">
              🌐 กำลังแก้ภาษาอังกฤษ — ช่องกรอบม่วง = ข้อความที่ลูกค้าหน้า /en เห็น · ช่องที่ยังว่าง ลูกค้าเห็นภาษาไทย (ตัวจางในช่อง) · สี / รูป / สวิตช์ ใช้ร่วมกันทั้ง 2 ภาษา · พรีวิวขวาเป็นหน้า /en
            </p>
          )}

          {tab === "overview" && (
            <DesignOverview dirty={dirtyPages} hadDraft={hadDraft} lastVersion={lastVersion} onGo={goTo} onEnglish={() => setContentLang("en")} />
          )}

          {/* ── สี ── */}
          {tab === "colors" && <ColorsTab />}

          {/* ── ตัวอักษร ── */}
          {tab === "fonts" && <FontsTab />}

          {/* ── โลโก้ ── */}
          {tab === "logo" && <LogoSettings />}

          {/* ── Header ── */}
          {tab === "header" && <HeaderTab />}

          {/* ── เมนู ── */}
          {tab === "menu" && <MenuTab />}

          {/* ── Footer ── */}
          {tab === "footer" && <FooterTab />}

          {/* ── การ์ดสินค้า ── */}
          {tab === "card" && <CardTab />}

          {/* ── หน้าสินค้า (Style) ── */}
          {tab === "product" && <ProductTab />}

          {/* ── รูปทรง ── */}
          {/* ── หน้ารายการสินค้า: รูปแทรกในกริด ── */}
          {tab === "listing" && (
            <DesignCard title="หน้ารายการสินค้า" hint="หัวหน้า · ต่อแถว · แบ่งหน้า · การเรียง · ตัวกรอง · รูปแทรก" defaultOpen>
              <ListingPanel value={theme.listing} onChange={(listing) => apply({ ...theme, listing })} categories={choices.categories ?? []} products={choices.products ?? []} fields={choices.specFields ?? []} linkCtx={linkCtx} cardColumns={theme.card.columns} shopSlug={shopSlug} />
            </DesignCard>
          )}

          {/* ── 🛒 ตะกร้า: หน้าตา · รายการ · ท้ายตะกร้า · สินค้าแนะนำ · ฟังก์ชันเพิ่ม (components/website-cart-settings) ── */}
          {/* ── 🔗 แนะนำสินค้า: สินค้าที่เกี่ยวข้อง (กฎหลายชั้น) + 👀 ดูล่าสุด (components/website-related-settings) ── */}
          {tab === "related" && <RelatedSettings product={theme.product} onChange={setProduct} shopSlug={shopSlug} />}
          {tab === "cart" && <CartTab />}
          {/* ── 💳 หน้าชำระเงิน: ข้อความ · ช่องกรอก · การจัดวาง · ช่องทางจ่าย · แถบความมั่นใจ · หน้าขอบคุณ (components/website-checkout-settings) ── */}
          {tab === "checkout" && <CheckoutTab />}

          {tab === "shape" && <ShapeTab />}
          {tab === "motion" && <MotionTab />}
          {tab === "mobile" && <MobileSalesTab />}

          {/* ── 📄 หน้าพิเศษ (ชุด 4): 404 · ขอบคุณ · ป๊อปอัป · รูปแชร์ · เข้าสู่ระบบ — components/website-site-design-setting ── */}
          {/* ── 🎪 แคมเปญ (ชุด 5): ตั้งเวลาเผยแพร่ · ธีมแคมเปญ · ของตกแต่ง · ป้ายคนดู/ขายแล้ว — components/website-theme-schedule ── */}
          {tab === "campaign" && (
            <CampaignTab
              shopId={shopId}
              theme={theme as unknown as import("@/lib/website-theme").SiteTheme}
              schedules={schedules}
              reload={reloadSchedules}
              onSchedule={() => setScheduleOpen(true)}
              onPage={(p) => apply({ ...theme, page: { ...theme.page, ...p } })}
              onPreview={setCampPreview}
              previewing={campPreview?.id ?? null}
            />
          )}

          {tab === "pages" && <SitePagesSetting value={theme.page} onChange={(p) => apply({ ...theme, page: { ...theme.page, ...p } })} shopSlug={shopSlug} onPreview={setPage} colors={theme.colors} />}

          {/* ── ประวัติ ── */}
          {tab === "history" && <HistoryTab />}
          </DesignCardsProvider>
        </div>

        {/* ↔ ลากปรับความกว้างพรีวิว */}
        <SplitHandle split={split} className="hidden xl:flex xl:sticky xl:top-4 xl:h-[72vh]" />

        {/* ── ขวา: พรีวิวเว็บจริง ── */}
        <div className="xl:sticky xl:top-4 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {DEVICES.map((d) => (
              <button key={d.k} onClick={() => setDevice(d.k)} title={`${d.label} ${d.w}px`} className={`px-2.5 py-1 rounded-lg border text-xs transition ${device === d.k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                {d.icon}
              </button>
            ))}
            <select value={page} onChange={(e) => setPage(e.target.value)} className={inputCls} style={{ width: "auto" }}>
              {[...PAGES, ...(sampleProduct ? [{ path: `/product/${sampleProduct}`, label: "หน้าสินค้า (ตัวอย่าง)" }] : [])].map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
            </select>
            {/* 🔍 ซูมพรีวิว: − ขนาด + (Ctrl+ลูกกลิ้ง/บีบนิ้วบนพรีวิวก็ได้) */}
            <div className="inline-flex items-center rounded-lg border border-slate-200" data-preview-zoom>
              <button type="button" onClick={() => zoomBy(-0.1)} title="ย่อพรีวิว (หรือ Ctrl+เลื่อนลูกกลิ้งลงบนพรีวิว)" className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900">−</button>
              <select
                value={zoom === "fit" ? "fit" : String(zoom)}
                onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
                title="ขนาดที่แสดง · Ctrl+เลื่อนลูกกลิ้งบนพรีวิวเพื่อซูม"
                className="border-x border-slate-200 px-1.5 py-1 text-xs text-slate-700 bg-white"
              >
                <option value="fit">พอดีจอ</option>
                {zoom !== "fit" && ![0.5, 0.75, 1].includes(zoom) && <option value={String(zoom)}>{Math.round(zoom * 100)}%</option>}
                <option value="0.5">50%</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
              </select>
              <button type="button" onClick={() => zoomBy(0.1)} title="ขยายพรีวิว (หรือ Ctrl+เลื่อนลูกกลิ้งขึ้นบนพรีวิว)" className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900">+</button>
            </div>
            <button type="button" onClick={split.toggleMax} title={split.isMax ? "คืนความกว้างพรีวิวเริ่มต้น" : "พรีวิวกว้างสุด — หรือลากเส้นแบ่งเอง"} className={`hidden xl:inline-flex px-2.5 py-1 rounded-lg border text-xs ${split.isMax ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
              ⇔
            </button>
            {campPreview && (
              <button type="button" onClick={() => setCampPreview(null)} className="px-2.5 py-1 rounded-lg border border-blue-400 bg-blue-50 text-xs text-blue-700" title="กลับไปดูธีมปกติ" data-camp-preview>
                👁 ตัวอย่างแคมเปญ &quot;{campPreview.name}&quot; ✕
              </button>
            )}
            {previewSrc && <a href={previewSrc} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↗</a>}
            {/* โหลดใหม่ = ตั้ง src ซ้ำ (เว็บร้านอยู่คนละโดเมน — contentWindow.location.reload() ถูกเบราว์เซอร์บล็อก) */}
            <button onClick={() => { if (iframeRef.current) iframeRef.current.src = iframeRef.current.src; }} title="โหลดใหม่" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↻</button>
            {previewSrc && (
              <button
                type="button"
                onClick={() => setAreaPick((v) => !v)}
                aria-pressed={areaPick}
                title="เปิดแล้วคลิกส่วนในพรีวิว (หัวเว็บ · เมนู · การ์ดสินค้า · ท้ายเว็บ ฯลฯ) → ไปหน้าตั้งค่าของส่วนนั้น"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition ${areaPick ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                data-area-pick-btn
              >
                <Icon name="target" />
                คลิกเลือกส่วน
              </button>
            )}
            <span className="text-[10px] text-slate-400 ml-auto cursor-pointer" title="ดับเบิลคลิก = พอดีจอ" onDoubleClick={() => setZoom("fit")}>
              {dev.w}px · {Math.round(scale * 100)}%
            </span>
          </div>
          {areaPick && (
            <p className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-800">
              <Icon name="target" /> ชี้ส่วนในพรีวิวแล้วคลิก → เมนูซ้ายไปหน้าตั้งค่านั้น + กางการ์ดให้ · ลิงก์ในส่วนที่มีกรอบจะไม่เปลี่ยนหน้าระหว่างนี้ · กดปุ่มอีกครั้งเพื่อปิด
            </p>
          )}

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
                    ref={(el) => {
                      iframeRef.current = el;
                      // 📡 ให้แผงตั้งค่าลูก ๆ คุยกับพรีวิวได้ (lib/storefront-preview-bus — เช่น คลิกเลือกชิ้นส่วน)
                      setPreviewFrame(el);
                    }}
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
                      // ระหว่างลากเส้นแบ่ง: กันพรีวิวกินเมาส์ (ลากผ่านพรีวิวแล้วหลุด)
                      pointerEvents: split.dragging ? "none" : undefined,
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
            สี/ฟอนต์เปลี่ยนทันที · โลโก้/Header/การ์ด กด ↻ หลังบันทึกร่างเพื่อดูผล · Ctrl+เลื่อนลูกกลิ้ง = ซูมพรีวิว · ลากเส้นแบ่งซ้าย = ปรับความกว้าง
          </p>
        </div>
      </div>
      </SettingsNavLayout>

      {/* ⏰ ตั้งเวลาเผยแพร่ไว้ (ชุด 5) */}
      <ScheduleBanner pending={tab === "campaign" ? null : pendingSchedule} onCancel={async (s) => (await cancelSchedule(s, toast)) && reloadSchedules()} />
      <SchedulePublishModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        shopId={shopId}
        theme={theme}
        pending={pendingSchedule}
        onDone={() => {
          // ฝั่งเซิร์ฟเวอร์บันทึกชุดนี้เป็นร่างให้ด้วย
          setSaved(theme);
          setHadDraft(true);
          reloadSchedules();
        }}
      />

      {/* ── แถบปุ่มล่าง ── */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs text-slate-500">
          {isDirty ? (
            <>
              มีการแก้ไขที่ยังไม่บันทึก <span className="font-medium text-amber-700">{dirtyPages.length || dirtyFields.length} หัวข้อ</span>
              {/* กดชื่อหัวข้อ = ไปหน้านั้น */}
              {dirtyPages.map((k) => (
                <button key={k} type="button" onClick={() => setTab(k)} className="ml-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 hover:border-amber-400">
                  {DESIGN_PAGES[k].label}
                </button>
              ))}
            </>
          ) : hadDraft ? "มีร่างบันทึกไว้ — ยังไม่เผยแพร่" : "ไม่มีการเปลี่ยนแปลง"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void discard()} disabled={!isDirty && !hadDraft} className="px-3.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40 whitespace-nowrap"><span className="hidden sm:inline">ละทิ้งการเปลี่ยนแปลง</span><span className="sm:hidden">ละทิ้ง</span></button>
          <button onClick={() => void save("draft")} disabled={busy !== null} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:border-slate-500 disabled:opacity-50 whitespace-nowrap">
            {busy === "draft" ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </button>
          <button onClick={() => setScheduleOpen(true)} disabled={busy !== null} title="ตั้งเวลาให้ระบบเผยแพร่เอง" className="px-3.5 py-2 rounded-lg border border-blue-300 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap" data-schedule-btn>
            ⏰ ตั้งเวลา
          </button>
          <button onClick={() => void save("publish")} disabled={busy !== null} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
            {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}
          </button>
        </div>
      </div>

    </div>
    </PageHealthCtx.Provider>
    </DesignCtx.Provider>
    </ContentLangProvider>
  );
}
