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
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { PART_CHOICES, resolveMobileProduct, mobileOverrideCount, normalizeMobile, type ProductParts, type ProductMobile, type ProductFonts } from "@/lib/website-theme";

/** 🔠 ขนาดตัวอักษรหน้าสินค้า — ตัวเลือก % */
const FONT_LABELS: { k: keyof ProductFonts; label: string; hint: string }[] = [
  { k: "title", label: "ชื่อรุ่น", hint: "หัวเรื่องใหญ่ + ชื่อรอง" },
  { k: "price", label: "ราคา", hint: "ตัวเลขราคา" },
  { k: "heading", label: "หัวข้อ", hint: "หัวข้อพับเก็บ/แท็บ · แบนเนอร์ · คุณอาจชอบ" },
  { k: "body", label: "เนื้อหา", hint: "คำอธิบาย · รายละเอียด · ข้อความแบนเนอร์" },
];
const FONT_SIZES = [70, 80, 90, 100, 110, 120, 130, 150];
import { ERPModal } from "@/components/modal";
import { ColorPicker } from "@/components/color-picker";
import { GRADIENT_ANGLES, PRODUCT_IMAGE_EFFECTS, PRODUCT_IMAGE_SIZES, BUY_ITEM_DEFS, DEFAULT_BUY_ITEMS, defaultBuyItem, type ProductImageBgKind, type ProductGradient, type ProductImageEffect, type ProductImageFit, type BuyItem } from "@/lib/website-theme";

type Radius = "sharp" | "soft" | "round";
type LogoMode = "icon-text" | "image" | "text" | "icon";
type HeaderBg = "surface" | "page" | "ink" | "brand" | "transparent";
type MenuAlign = "left" | "center" | "right";
type CardPreset = "flat" | "border" | "shadow" | "floating" | "minimal";
type ImageRatio = "1:1" | "4:3" | "4:5" | "3:4" | "16:9";
type CardHover = "none" | "lift" | "zoom";
type ProductLayout = "classic" | "showcase";
type ProductTitleStyle = "serif" | "display";
type ProductImageBg = "tint" | "surface" | "none";
type ProductSection = "gallery" | "buy" | "details" | "banner" | "related";
type ProductGalleryStyle = "editorial" | "spotlight";
type ProductDetailsStyle = "accordion" | "tabs" | "plain";
type ProductDetailsOpen = "first" | "closed" | "all";
type DetailSource = "description" | "fields" | "details" | "text" | "shipping";
type DetailApply = "all" | "categories" | "products";
type DetailOpen = "auto" | "open" | "closed";
interface DetailItem { id: string; label: string; source: DetailSource; fields: string[]; text: string; applyTo: DetailApply; categories: string[]; products: string[]; enabled: boolean; defaultOpen: DetailOpen }

interface Theme {
  colors: { brand: string; brandDeep: string; ink: string; page: string; surface: string; muted: string };
  fonts: { display: string; body: string };
  radius: Radius;
  logo: {
    mark: string;
    text: string;
    mode: LogoMode;
    imageKey: string | null;
    imageDarkKey: string | null;
    faviconKey: string | null;
    height: number;
  };
  header: { height: number; sticky: boolean; bg: HeaderBg; menuAlign: MenuAlign; showCart: boolean; border: boolean };
  card: { preset: CardPreset; imageRatio: ImageRatio; titleLines: number; showBadge: boolean; showStock: boolean; hover: CardHover };
  product: { layout: ProductLayout; titleStyle: ProductTitleStyle; imageBg: ProductImageBg; imageBgKey: string | null; imageBgKind: ProductImageBgKind; imageBgColor: string; imageBgGradient: ProductGradient; imageEffect: ProductImageEffect; imageFit: ProductImageFit; imageSize: number; showTabs: boolean; galleryStyle: ProductGalleryStyle; detailsStyle: ProductDetailsStyle; detailsOpen: ProductDetailsOpen; detailItems: DetailItem[]; sections: ProductSection[]; hidden: ProductSection[]; parts: ProductParts; mobile: ProductMobile; fonts: ProductFonts };
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
  categories?: { key: string; label: string }[];
  products?: { code: string; name: string }[];
}

type ColorKey = keyof Theme["colors"];
type TabKey = "colors" | "fonts" | "logo" | "header" | "card" | "product" | "shape" | "history";
type Device = "desktop" | "tablet" | "mobile";

const TABS: { k: TabKey; label: string }[] = [
  { k: "colors", label: "สี" },
  { k: "fonts", label: "ตัวอักษร" },
  { k: "logo", label: "โลโก้" },
  { k: "header", label: "Header" },
  { k: "card", label: "การ์ดสินค้า" },
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

const PAGES = [
  { path: "/", label: "หน้าแรก" },
  { path: "/shop", label: "ร้านวัสดุ" },
  { path: "/oem", label: "รับผลิต" },
  { path: "/quote", label: "ขอใบเสนอราคา" },
  { path: "/contact", label: "ติดต่อ" },
];

const PRESETS: { name: string; theme: Partial<Theme> }[] = [
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
  const [versions, setVersions] = useState<{ versionNo: number; createdAt: string; theme: Theme }[]>([]);

  const undoStack = useRef<Theme[]>([]);
  const redoStack = useRef<Theme[]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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
        const slug = (j?.products as { slug?: string }[] | undefined)?.find((x) => x.slug)?.slug ?? null;
        if (alive) setSampleProduct(slug);
      })
      .catch(() => {
        /* ไม่มีสินค้า = ไม่มีตัวเลือกนี้ */
      });
    return () => {
      alive = false;
    };
  }, [shopSlug]);

  // เข้าแท็บ "หน้าสินค้า" → พรีวิวเปลี่ยนไปหน้าสินค้าตัวอย่างให้เอง (ถ้ายังดูหน้าแรกอยู่)
  useEffect(() => {
    if (tab === "product" && sampleProduct && page === "/") setPage(`/product/${sampleProduct}`);
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
  const setCard = (p: Partial<Theme["card"]>) => theme && apply({ ...theme, card: { ...theme.card, ...p } });
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
  const [fieldPickerFor, setFieldPickerFor] = useState<string | null>(null);
  const [fieldQuery, setFieldQuery] = useState("");
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
    if (theme.fonts.display !== published.fonts.display) out.push("ฟอนต์หัวข้อ");
    if (theme.fonts.body !== published.fonts.body) out.push("ฟอนต์เนื้อหา");
    if (theme.radius !== published.radius) out.push("ความมนขอบ");
    if (!eq(theme.logo, published.logo)) out.push("โลโก้");
    if (!eq(theme.header, published.header)) out.push("Header");
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
  const mobCount = mobileOverrideCount(mob);

  const dev = DEVICES.find((d) => d.k === device)!;
  const previewSrc = siteUrl ? `${siteUrl}${page}?preview=1` : null;
  const scale = zoom === "fit" ? Math.min(1, Math.max(0.1, (boxW - 16) / dev.w)) : zoom;
  // สูงพอให้เนื้อเว็บเต็มกล่องหลังย่อแล้ว (ไม่งั้นเหลือที่ว่างข้างล่าง)
  const frameH = Math.max(dev.h, Math.round((boxH - 16) / scale));

  const checks = [
    { label: "ตัวอักษรบนพื้นหลังเว็บ", fg: theme.colors.ink, bg: theme.colors.page },
    { label: "ตัวอักษรรองบนพื้นการ์ด", fg: theme.colors.muted, bg: theme.colors.surface },
    { label: "ตัวอักษรขาวบนปุ่มหลัก", fg: "#FFFFFF", bg: theme.colors.brand },
    { label: "สีแบรนด์บนพื้นหลังเว็บ", fg: theme.colors.brand, bg: theme.colors.page },
  ].map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    const level = wcagLevel(ratio);
    return { ...c, ratio, level, suggest: level === "fail" ? suggestReadable(c.fg, c.bg) : null };
  });
  const failCount = checks.filter((c) => c.level === "fail").length;

  const ResetBtn = ({ onClick, show }: { onClick: () => void; show: boolean }) =>
    show ? (
      <button onClick={onClick} title="คืนค่าที่เผยแพร่อยู่" className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-400 text-xs">
        ↺
      </button>
    ) : null;

  const tabDirty = (k: TabKey) =>
    (k === "colors" && dirtyFields.some((d) => COLOR_FIELDS.some((c) => c.label === d))) ||
    (k === "fonts" && dirtyFields.some((d) => d.startsWith("ฟอนต์"))) ||
    (k === "logo" && dirtyFields.includes("โลโก้")) ||
    (k === "header" && dirtyFields.includes("Header")) ||
    (k === "card" && dirtyFields.includes("การ์ดสินค้า")) ||
    (k === "shape" && dirtyFields.includes("ความมนขอบ")) ||
    (k === "product" && dirtyFields.includes("หน้าสินค้า"));

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
              <div className={cardCls}>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">ชุดสีสำเร็จรูป</h3>
                <p className="text-[11px] text-slate-500 mb-3">เลือกแล้วปรับต่อได้ · ย้อนกลับได้ก่อนบันทึก</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.name} onClick={() => apply({ ...theme, ...p.theme } as Theme)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-slate-500">
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
                      {c.suggest && (
                        <button
                          onClick={() => {
                            const key = COLOR_FIELDS.find((f) => theme.colors[f.key] === c.fg)?.key;
                            if (key) setColor(key, c.suggest!);
                          }}
                          className="text-blue-600 hover:underline whitespace-nowrap"
                        >
                          ใช้ {c.suggest}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ── ตัวอักษร ── */}
          {tab === "fonts" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">ตัวอักษร</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>ฟอนต์หัวข้อ</label>
                  <div className="flex items-center gap-2">
                    <select className={inputCls} value={theme.fonts.display} onChange={(e) => apply({ ...theme, fonts: { ...theme.fonts, display: e.target.value } })}>
                      {choices.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <ResetBtn show={theme.fonts.display !== published.fonts.display} onClick={() => apply({ ...theme, fonts: { ...theme.fonts, display: published.fonts.display } })} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>ฟอนต์เนื้อหา</label>
                  <div className="flex items-center gap-2">
                    <select className={inputCls} value={theme.fonts.body} onChange={(e) => apply({ ...theme, fonts: { ...theme.fonts, body: e.target.value } })}>
                      {choices.fonts.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <ResetBtn show={theme.fonts.body !== published.fonts.body} onClick={() => apply({ ...theme, fonts: { ...theme.fonts, body: published.fonts.body } })} />
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                <p className={labelCls}>ตัวอย่าง</p>
                <p className="text-xl font-semibold" style={{ color: theme.colors.ink }}>งานหนังคุณภาพ ครบจบที่เดียว</p>
                <p className="text-lg font-semibold" style={{ color: theme.colors.ink }}>Premium leather manufacturing</p>
                <p className="text-sm" style={{ color: theme.colors.muted }}>หนังวัวแท้ฟอกฝาด ผิวเรียบเนียน — 0123456789</p>
              </div>
            </div>
          )}

          {/* ── โลโก้ ── */}
          {tab === "logo" && (
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
          )}

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
              <p className="text-[11px] text-slate-400 mt-3">* หน้าที่สร้างเองจะเพิ่มเข้าเมนูอัตโนมัติเมื่อเผยแพร่</p>
            </div>
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
                  <select className={inputCls} value={theme.card.titleLines} onChange={(e) => setCard({ titleLines: Number(e.target.value) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n} บรรทัด</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>เอฟเฟกต์ตอนชี้เมาส์</label>
                  <select className={inputCls} value={theme.card.hover} onChange={(e) => setCard({ hover: e.target.value as CardHover })}>
                    {choices.cardHovers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.showBadge} onChange={(e) => setCard({ showBadge: e.target.checked })} />
                  แสดงป้าย (ขายดี/แนะนำ)
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={theme.card.showStock} onChange={(e) => setCard({ showStock: e.target.checked })} />
                  แสดงสถานะสต๊อก
                </label>
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
                            <select
                              className={`${inputCls} ${isMobileEdit && mVal != null ? "border-blue-400" : ""}`}
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
                            </select>
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
                    <select
                      className={`${inputCls} ${isMobileEdit && (mob.imageFit || mob.imageSize) ? "border-blue-400" : ""}`}
                      value={
                        isMobileEdit
                          ? !mob.imageFit && !mob.imageSize ? "__pc" : (mob.imageFit ?? theme.product.imageFit) === "cover" ? "cover" : String(mob.imageSize ?? theme.product.imageSize)
                          : theme.product.imageFit === "cover" ? "cover" : String(theme.product.imageSize)
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        if (isMobileEdit) {
                          if (v === "__pc") setMobile({ imageFit: null, imageSize: null });
                          else if (v === "cover") setMobile({ imageFit: "cover" });
                          else setMobile({ imageFit: "contain", imageSize: Number(v) });
                        } else if (v === "cover") setProduct({ imageFit: "cover" });
                        else setProduct({ imageFit: "contain", imageSize: Number(v) });
                      }}
                    >
                      {isMobileEdit && <option value="__pc">ตามคอม ({theme.product.imageFit === "cover" ? "เต็มกรอบ" : `${theme.product.imageSize}%`})</option>}
                      {PRODUCT_IMAGE_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      {theme.product.imageFit === "contain" && !PRODUCT_IMAGE_SIZES.some((o) => o.value === String(theme.product.imageSize)) && (
                        <option value={String(theme.product.imageSize)}>{theme.product.imageSize}%</option>
                      )}
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">เต็มกรอบ = รูปกางเต็มพื้นที่ (ตัดขอบ) · % = ย่อรูปให้อยู่ในกรอบตามสัดส่วน</p>
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
                        <button onClick={() => setProduct({ sections: ["gallery", "buy", "details", "banner", "related"], hidden: [] })} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">คืนค่าเริ่มต้น</button>
                      )
                    )}
                  </div>
                  <ul className="space-y-1">
                    {pv.sections.map((k, i) => {
                      const meta = (choices.productSections ?? []).find((x) => x.value === k);
                      const isHidden = pv.hidden.includes(k);
                      const hasPart = k !== "details";
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
                          <PartSettings
                            part={k}
                            parts={pv.parts}
                            setPart={setPart}
                            mobile={isMobileEdit ? mob : null}
                            onResetMobile={(k) => (k === "buy" ? setMobile({ buyItems: null, buyColumns: null, buy: {} }) : setMobile({ [k]: {} } as Partial<ProductMobile>))}
                            onCopyBuyToMobile={() => setMobile({ buyItems: pv.parts.buy.items.map((it) => ({ ...it })), buyColumns: pv.parts.buy.columns, buy: {} })}
                            products={choices.products ?? []}
                            fields={choices.specFields ?? []}
                            previewBg={theme.colors.page}
                          />
                        )}
                        </li>
                      );
                    })}
                  </ul>
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
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {it.fields.map((k) => {
                                      const f = (choices.specFields ?? []).find((x) => x.key === k);
                                      return (
                                        <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-xs">
                                          {f?.label ?? k}
                                          <button type="button" onClick={() => setDetailItem(it.id, { fields: it.fields.filter((x) => x !== k) })} className="text-blue-400 hover:text-rose-600" title="เอาออก">✕</button>
                                        </span>
                                      );
                                    })}
                                    <button type="button" onClick={() => { setFieldQuery(""); setFieldPickerFor(it.id); }} className="px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-xs text-slate-600 hover:border-blue-400 hover:text-blue-700">
                                      ＋ เลือกฟิลด์…
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-1">เลือกได้ทุกฟิลด์ของ Parent SKU (ยกเว้นต้นทุน/ข้อมูลภายใน) · ช่องที่ว่างจะไม่โชว์ · เปลี่ยนป้ายชื่อได้ที่ทะเบียนฟิลด์กลาง</p>
                                </div>
                              )}
                              {it.source === "text" && (
                                <div className="sm:col-span-2">
                                  <label className={labelCls}>ข้อความ</label>
                                  <textarea className={`${inputCls} min-h-[96px]`} value={it.text} onChange={(e) => setDetailItem(it.id, { text: e.target.value })} maxLength={4000} placeholder={"เช่น รับประกันงานเย็บ 6 เดือน\nเช็ดด้วยผ้าแห้ง หลีกเลี่ยงแสงแดดจัด"} />
                                  <p className="text-[11px] text-slate-400 mt-1">ขึ้นบรรทัดใหม่ได้ · ใช้กับทุกรุ่นที่เลือกด้านล่าง</p>
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
          {tab === "shape" && (
            <div className={cardCls}>
              <h3 className="text-sm font-semibold text-slate-800 mb-3">ความมนของขอบ (ทั้งเว็บ)</h3>
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
              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className={labelCls}>ตัวอย่างปุ่มและการ์ด</p>
                <div className="flex items-center gap-3">
                  <span className="px-4 py-2 text-xs font-semibold text-white" style={{ background: theme.colors.brand, borderRadius: theme.radius === "sharp" ? 2 : theme.radius === "soft" ? 10 : 99 }}>ปุ่มหลัก</span>
                  <span className="px-4 py-2 text-xs border" style={{ borderColor: "#d6d6d2", color: theme.colors.ink, borderRadius: theme.radius === "sharp" ? 2 : theme.radius === "soft" ? 10 : 99 }}>ปุ่มรอง</span>
                  <span className="w-16 h-12 border inline-block" style={{ background: theme.colors.surface, borderColor: "#e7e7e4", borderRadius: theme.radius === "sharp" ? 3 : theme.radius === "soft" ? 14 : 24 }} />
                </div>
              </div>
            </div>
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
      {/* ป๊อปอัปเลือกฟิลด์ Parent SKU (ของกลาง ERPModal) — ทุกฟิลด์จากทะเบียน จัดกลุ่ม ค้นหาได้ ติ๊กแล้วเรียงตามลำดับที่ติ๊ก */}
      <ERPModal
        open={!!fieldPickerFor}
        onClose={() => setFieldPickerFor(null)}
        title="เลือกฟิลด์จาก Parent SKU"
        description="ติ๊กฟิลด์ที่จะโชว์ในหัวข้อนี้ — เรียงตามลำดับที่ติ๊ก · ฟิลด์ที่สินค้าไม่ได้กรอกจะไม่โชว์เอง"
        size="md"
        defaultExpanded={false}
        storageKey="theme-field-picker"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500">
              เลือกแล้ว {theme?.product.detailItems.find((d) => d.id === fieldPickerFor)?.fields.length ?? 0} ฟิลด์
            </span>
            <button type="button" onClick={() => setFieldPickerFor(null)} className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">เสร็จ</button>
          </div>
        }
      >
        {theme && fieldPickerFor && (() => {
          const item = theme.product.detailItems.find((d) => d.id === fieldPickerFor);
          if (!item) return null;
          const q = fieldQuery.trim().toLowerCase();
          const all = (choices?.specFields ?? []).filter((f) => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
          const groups = new Map<string, typeof all>();
          for (const f of all) {
            const g = f.group ?? "other";
            groups.set(g, [...(groups.get(g) ?? []), f]);
          }
          const toggle = (key: string) => setDetailItem(item.id, { fields: item.fields.includes(key) ? item.fields.filter((k) => k !== key) : [...item.fields, key] });
          return (
            <div className="space-y-3">
              <input autoFocus value={fieldQuery} onChange={(e) => setFieldQuery(e.target.value)} placeholder="ค้นหาชื่อฟิลด์…" className={inputCls} />
              {item.fields.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.fields.map((k, i) => (
                    <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px]">
                      <span className="text-blue-400">{i + 1}</span> {(choices?.specFields ?? []).find((x) => x.key === k)?.label ?? k}
                      <button type="button" onClick={() => toggle(k)} className="text-blue-400 hover:text-rose-600">✕</button>
                    </span>
                  ))}
                </div>
              )}
              {[...groups.entries()].map(([g, list]) => (
                <div key={g}>
                  <div className="text-[11px] font-medium text-slate-500 mb-1">{choices?.fieldGroups?.[g] ?? g}</div>
                  <div className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
                    {list.map((f) => {
                      const on = item.fields.includes(f.key);
                      return (
                        <label key={f.key} className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm cursor-pointer ${on ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>
                          <input type="checkbox" className="accent-blue-600" checked={on} onChange={() => toggle(f.key)} />
                          <span className="truncate">{f.label}</span>
                          <span className="ml-auto text-[10px] text-slate-300 font-mono truncate max-w-[40%]">{f.key}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {all.length === 0 && <div className="text-sm text-slate-400 py-6 text-center">ไม่พบฟิลด์ที่ค้นหา</div>}
            </div>
          );
        })()}
      </ERPModal>

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
function PartSettings({
  part,
  parts,
  setPart,
  products,
  fields = [],
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
  fields?: { key: string; label: string }[];
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
          <select className={partInputCls} value={g.perView} onChange={(e) => setPart("gallery", { perView: Number(e.target.value) === 2 ? 2 : 1 })}>
            {PART_CHOICES.perViews.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        )}
        <div>
          <label className={lbl}>กดเลือกสีแล้วรูปใหญ่ทำอย่างไร</label>
          <select className={partInputCls} value={g.colorMode} onChange={(e) => setPart("gallery", { colorMode: e.target.value as ProductParts["gallery"]["colorMode"] })}>
            {PART_CHOICES.colorModes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{PART_CHOICES.colorModes.find((o) => o.value === g.colorMode)?.hint}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <PartToggle label="เส้นทางหน้า (หน้าแรก / สินค้า / หมวด)" on={g.showBreadcrumb} onChange={(v) => setPart("gallery", { showBreadcrumb: v })} />
          <PartToggle label="ชื่อรองใต้ชื่อรุ่น" on={g.showSubtitle} onChange={(v) => setPart("gallery", { showSubtitle: v })} />
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
  if (part === "banner") {
    const bn = parts.banner;
    return (
      <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
        {mobileNote("banner")}
        <div>
          <label className={lbl}>รูปแบนเนอร์เอาจาก</label>
          <select className={partInputCls} value={bn.imageSource} onChange={(e) => setPart("banner", { imageSource: e.target.value as ProductParts["banner"]["imageSource"] })}>
            {PART_CHOICES.bannerImages.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {bn.imageSource === "fixed" && (
            <div className="mt-1.5">
              <ImageUploadField label="รูปกลาง (ใช้ทุกสินค้า)" hint="แนะนำแนวนอน 16:10" value={bn.imageKey} onChange={(k) => setPart("banner", { imageKey: k })} previewBg={previewBg} height={56} />
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">ไม่มีรูปตามแหล่งที่เลือก = ส่วนนี้ไม่โชว์สำหรับสินค้านั้น</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className={lbl}>หัวข้อ</label>
            <select className={partInputCls} value={bn.titleSource} onChange={(e) => setPart("banner", { titleSource: e.target.value as ProductParts["banner"]["titleSource"] })}>
              {PART_CHOICES.bannerTitles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {bn.titleSource === "text" && <input className={`${partInputCls} mt-1.5`} value={bn.titleText} onChange={(e) => setPart("banner", { titleText: e.target.value })} placeholder="หัวข้อแบนเนอร์" />}
          </div>
          <div>
            <label className={lbl}>ข้อความ</label>
            <select className={partInputCls} value={bn.textSource} onChange={(e) => setPart("banner", { textSource: e.target.value as ProductParts["banner"]["textSource"] })}>
              {PART_CHOICES.bannerTexts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {bn.textSource === "text" && <textarea rows={3} className={`${partInputCls} mt-1.5`} value={bn.text} onChange={(e) => setPart("banner", { text: e.target.value })} placeholder="ข้อความใต้หัวข้อ" />}
          </div>
        </div>
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
            <select className={partInputCls} value={r.count} onChange={(e) => setPart("related", { count: Number(e.target.value) })}>
              {[2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} ชิ้น</option>)}
            </select>
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
          <select className={mini} value={buy.columns} onChange={(e) => onChange({ columns: Number(e.target.value) === 1 ? 1 : 2 })}>
            <option value={2}>2 คอลัมน์ (ซ้าย / ขวา)</option>
            <option value={1}>1 คอลัมน์ (เรียงตามลำดับ)</option>
          </select>
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
                      <select className={mini} value={it.size} onChange={(e) => setItem(it.id, { size: Number(e.target.value) })}>
                        {[...new Set([...BUY_SIZES, it.size])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}%{n === 100 ? " (ปกติ)" : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>สีตัวอักษร</label>
                      <ColorBtn value={it.color} onChange={(v) => setItem(it.id, { color: v })} title="สีตัวอักษรของชิ้นนี้" />
                    </div>
                    <div>
                      <label className={lbl}>ระยะห่างด้านบน</label>
                      <select className={mini} value={it.gap} onChange={(e) => setItem(it.id, { gap: e.target.value as BuyItem["gap"] })}>
                        <option value="sm">ชิด</option>
                        <option value="md">ปกติ</option>
                        <option value="lg">ห่าง</option>
                      </select>
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
                      <select className={mini} value={it.lines} onChange={(e) => setItem(it.id, { lines: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} บรรทัด</option>)}
                      </select>
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
