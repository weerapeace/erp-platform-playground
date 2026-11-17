"use client";

/**
 * ParentWebListings — ⭐ ตัวตั้งค่าเว็บของสินค้า (ของกลาง · 1 รุ่น ทุกร้าน หรือเฉพาะร้านเดียว)
 * ใช้ 2 ที่ (หน้าตา/ช่อง/กฎเดียวกัน — แก้ที่ไหนก็เหมือนกัน):
 *   1) แท็บ "🛍 เว็บไซต์" ใน Parent SKU (drawer + หน้าเต็ม) → ทุกร้านที่ขายรุ่นนี้
 *   2) drawer หน้า "สินค้าบนเว็บ" (กดการ์ด/แถว) → shopId = เฉพาะร้านนั้น
 * แท็บต่อร้าน:
 *   🛒 ขายบนเว็บ — ขึ้นร้าน · แนะนำ · ชื่อ (+กฎชื่อร้าน) · ราคา · หมวด · หน่วย · สต๊อก · ป้าย · 📐 ตาราง สี×ไซส์ · คำอธิบาย · ตัวเลือกกรอกเอง/สีตัวอย่าง
 *   🖼 รูป สี และรูปเปิด — รูปเปิด (Hero) · รูปรุ่น · รูปรายสี + จุดสีบนการ์ด/สีหลัก
 *   🔤 ปั๊มชื่อ · แบนเนอร์ · รายละเอียด — ตั้งเฉพาะรุ่นนี้ · 📐 ช่องใส่ของ (ของตัวสินค้า ทุกร้านเห็นเหมือนกัน · components/compartments-editor)
 *   ⚠️ ต้องแก้ — กฎกลาง lib/website-listing-health (ตัวเดียวกับป้ายเหลืองในหน้าสินค้าบนเว็บ) + ปุ่มพาไปแก้
 * เว้นว่าง = ใช้ของ ERP / ค่ากลางตามเดิม
 * ของกลาง: AssetPicker · uploadImagesWithDupCheck (ถามรูปซ้ำ) · UploadProgress (แถบกำลังอัปในแถว) · MediaUploadField · PersonalizeEditor · ProductBannersEditor · footer-save (ปุ่มบันทึกแถบล่าง) · ColorSwatchButton
 * API: /api/parent-web-listings (guardApi products.edit + audit + ล้างแคชเว็บร้าน · ฟิลด์ชุดเดียวกับ lib/website-listing-patch)
 */
import { useEffect, useState, useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { AssetPicker } from "@/components/asset-picker";
import type { AssetRow } from "@/app/api/assets/shared";
import type { DetailOverride } from "@/lib/website-detail-overrides";
import { DEFAULT_PERSONALIZE, type PersonalizeConfig } from "@/lib/website-personalize";
import { PersonalizeEditor } from "@/components/personalize-editor";
import { PrintDesignEditor } from "@/components/print-design-editor";
import { DEFAULT_PRINT_DESIGN, printDesignUsable, type PrintDesignConfig } from "@/lib/website-print-design";
import { ProductBannersEditor } from "@/components/product-banners-editor";
import type { ProductBanner } from "@/lib/website-banners";
import type { CardColors } from "@/lib/website-card-colors";
import { HERO_SIZE_HINT, heroOfSku, type ProductHero } from "@/lib/website-hero";
import { MediaUploadField, type MediaValue } from "@/components/media-upload-field";
import { NAME_RULE_EXCLUSIVE, type NameRuleFlag } from "@/lib/website-field-map";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { useFooterSave } from "@/components/footer-save";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icon";
import { colorWebImages } from "@/lib/website-listing-health";
import { askConfirm } from "@/components/modal/ask-dialog";
import { ColorSwatchButton } from "@/components/color-swatch-manager";
import { RestockBadge } from "@/components/website-restock-panel";
import type { ListingIssue } from "@/lib/website-listing-health";
import { CompartmentsEditor } from "@/components/compartments-editor";
import type { Compartment } from "@/lib/fit-check";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { CardBadgeSelect } from "@/components/website-card-badges";
import type { LinkedRow } from "@/lib/website-listing-linked";
import { STOCK_STATUS_OPTIONS } from "@/lib/website-listing-fields";
import { SizeGridEditor, type SizeGridView } from "@/components/website-size-grid";
import { MoneyInput } from "@/components/money-input";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { renameCardColor } from "@/lib/website-card-colors";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

/**
 * label = ชื่อสีที่เว็บโชว์ (ไทยก่อน) · colorTh/colorEn = ค่าดิบใน SKU (สี (ไทย) / ช่อง Color) ให้แก้ในแถวสี
 * labelEn = ชื่ออังกฤษที่เว็บ /en ใช้ตอนนี้ (Color ถ้าเป็นอังกฤษ → ทะเบียนสีกลาง)
 * qty = สต๊อกคงเหลือ · null = ยังไม่มีข้อมูลสต๊อกของ SKU นี้ในระบบ
 */
type Variant = { id: string; code: string; label: string; colorTh: string; colorEn: string; labelEn: string; price: number; qty: number | null; erpImageKey: string | null; gallery: string[] };
/** ✏️ ค่าที่กำลังแก้ในแถวสี (ยังไม่บันทึก) — price เป็นข้อความดิบจาก MoneyInput */
type SkuDraft = { colorTh: string; colorEn: string; price: string };
const THAI_RE = /[฀-๿]/;
type DetailItemInfo = { id: string; label: string; source: string; enabled: boolean; defaultLabel: string };
type OptionItem = { id: string; label: string; swatch?: string | null };
type WebOptions = { label: string; items: OptionItem[] } | null;
type ShopState = {
  shopId: string;
  shopName: string;
  slug: string;
  isDefault: boolean;
  listed: boolean;
  published: boolean;
  featured: boolean;
  webPrice: number | null;
  webName: string;
  /** ชื่อที่เว็บใช้จริงถ้าเว้นช่องชื่อว่าง (คำนวณจากกฎชื่อของร้าน) */
  autoName: string;
  /** กฎชื่อของร้าน — ใช้กับทุกสินค้าในร้าน */
  nameRule: Record<NameRuleFlag, boolean>;
  webDescription: string;
  webImages: string[];
  webSkuImages: Record<string, string[]>;
  webDetails: Record<string, DetailOverride>;
  webPersonalize: PersonalizeConfig | null;
  /** 🖨 ลายรีดบนกระเป๋า */
  webPrint?: PrintDesignConfig | null;
  webBanners: ProductBanner[];
  /** 🎴 สีที่โชว์บนการ์ด + สีหลัก (colors null = ทุกสี) */
  webCardColors: CardColors;
  /** 🎬 รูปเปิดหน้าสินค้า คอม/มือถือ (null = ใช้รูปสินค้า) */
  webHero: ProductHero | null;
  detailItems: DetailItemInfo[];
  // 🛒 ขายบนเว็บ
  webUnit: string;
  /** null = ยังไม่เคยจัดหมวดเอง (ใช้หมวดแบบเดิม = categories) */
  webCategories: string[] | null;
  categories: string[];
  webBadge: string;
  webStockStatus: string;
  webSwatch: string;
  webOptions: WebOptions;
  /** 📐 คู่ สี×ไซส์ ที่ปิดไว้บนเว็บร้านนี้ (id SKU ไซส์) */
  webVariantOff: string[];
  /** ร้านเปิดใช้ตัวเลือกชุดที่ 2 อยู่ (แท็บ ⚙️ จับคู่ฟิลด์) */
  options2On?: boolean;
  /** 📏 ตารางไซส์ที่เลือกทับ ("" = อัตโนมัติตามหมวด · "none" = ไม่แสดง · id) + รายการของร้าน + ตารางอัตโนมัติ */
  webSizeGuide?: string;
  /** 🔗 สินค้าที่เกี่ยวข้องที่เลือกเองรายรุ่น (รหัสรุ่น เรียงตามที่เลือก) — [] = ใช้กฎกลางของธีม */
  webRelated?: string[];
  /** 🔎 SEO รายสินค้า (ว่าง = ใช้ชื่อ/คำอธิบายสินค้า) */
  webSeo?: { title: string; description: string; title_en: string; description_en: string } | null;
  sizeGuides?: { id: string; name: string }[];
  autoSizeGuide?: string | null;
  shopCategories: { key: string; label: string; icon: string }[];
  auto: { price: number; unit: string; description: string };
  display: { name: string; price: number; imageKey: string | null; imageCount: number; hero: boolean; productUrl: string | null } | null;
  issues: ListingIssue[];
  /** 🔗 หน้าเว็บดึงอะไรมาจากไหน (lib/website-listing-linked) */
  linked?: LinkedRow[];
  soldQty: number;
  /** 📐 ร้านนี้เปิดเช็คขนาด */
  fitCheck?: boolean;
  productUrl: string;
};
type Resp = {
  code: string;
  parentName: string;
  erpDescription: string | null;
  nameRefs: { brand: string | null; collection: string | null; code: string };
  adminUrl: string;
  variants: Variant[];
  /** 📐 ตาราง สี×ไซส์ จาก SKU ลูก (null = รุ่นนี้ไม่มี SKU ไซส์) */
  sizeGrid?: SizeGridView | null;
  shops: ShopState[];
  /** ฟิลด์ Parent SKU (ทะเบียนฟิลด์) ให้แบนเนอร์เลือกโชว์ */
  webFields?: { key: string; label: string }[];
  /** 📐 ช่องใส่ของของตัวสินค้า (null = ยังไม่วัด · [] = ไม่มีช่อง) + ขนาดภายนอก */
  compartments?: Compartment[] | null;
  outer?: { w: unknown; h: unknown; d: unknown };
};

type Tab = "sell" | "detail" | "extra" | "fix";

/** ปุ่มกฎชื่อ — ป้ายโชว์คำที่จะถูกลบจริงของรุ่นนี้ */
const NAME_RULE_CHIPS: { flag: NameRuleFlag; label: string; ref?: keyof Resp["nameRefs"] }[] = [
  { flag: "removeBrand", get label() { return tr("ลบแบรนด์", "Remove brand"); }, ref: "brand" },
  { flag: "removeCollection", get label() { return tr("ลบคอลเลกชัน", "Remove collection"); }, ref: "collection" },
  { flag: "removeCode", get label() { return tr("ลบรหัสสินค้า", "Remove product code"); }, ref: "code" },
  { flag: "removeParens", get label() { return tr("ลบข้อความในวงเล็บ", "Remove text in brackets"); } },
  { flag: "removeParenMarks", get label() { return tr("ลบแค่วงเล็บ", "Remove brackets only"); } },
];

/** ตัวเลือกสถานะสต๊อก = ทะเบียนกลาง (ชุดเดียวกับแก้หลายรายการ) */
const STOCKS = STOCK_STATUS_OPTIONS;

/** ค่าที่ปุ่มบันทึกส่ง (saveShop) รวมเป็นข้อความเดียว — ใช้เทียบว่ามีของแก้ค้างไหม */
const snapOf = (s: ShopState) =>
  JSON.stringify([
    s.published, s.featured, s.webPrice, s.webName, s.webDescription, s.webImages, s.webSkuImages, s.webDetails, s.webPersonalize, s.webPrint ?? null, s.webBanners, s.webCardColors, s.webHero,
    s.webUnit, s.webCategories, s.webBadge, s.webStockStatus, s.webSwatch, s.webOptions, s.webVariantOff ?? [], s.webSizeGuide ?? "", s.webRelated ?? [], s.webSeo ?? null,
  ]);

const MAX_SKU_IMAGES = 8;
const keyUrl = (key: string, w = 160) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const SOURCE_LABEL: Record<string, string> = {
  get description() { return tr("คำอธิบายสินค้า", "Product description"); },
  get fields() { return tr("ฟิลด์ Parent SKU", "Parent SKU fields"); },
  get details() { return tr("จุดเด่น", "Highlights"); },
  get text() { return tr("ข้อความตายตัว", "Fixed text"); },
  get shipping() { return tr("การจัดส่ง/ชำระเงิน", "Shipping/payment"); },
};
const inputCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400";
const labelCls = "block text-xs text-slate-500 mb-1";

/** ปัญหาแต่ละชนิด → ไปแก้ที่แท็บไหน */
const FIX_TAB: Record<ListingIssue["key"], Tab> = { no_price: "sell", no_category: "sell", no_image: "sell", color_no_image: "sell", color_no_web_image: "sell", swatch_missing: "fix", no_compartments: "extra" };

export function ParentWebListings({
  parentId,
  shopId,
  onChanged,
  onOpenParent,
  focusSkuId,
}: {
  parentId: string | null;
  /** เฉพาะร้านนี้ (drawer หน้า "สินค้าบนเว็บ") — ไม่ส่ง = ทุกร้าน (แท็บ 🛍 ใน Parent SKU) */
  shopId?: string;
  /** เปิดมาจากแถว SKU ย่อย (หน้าสินค้าบนเว็บ) → เลื่อนไปแถว SKU นั้น + ไฮไลต์ */
  focusSkuId?: string | null;
  /** บันทึก/เพิ่มเข้าร้านสำเร็จ (ให้หน้าที่เปิดอยู่ดึงค่าที่เว็บเห็นใหม่) */
  onChanged?: () => void;
  /** ปุ่ม "ไปเติมที่ Parent SKU" ในกล่องข้อมูลที่เชื่อม (ไม่ส่ง = อยู่ในหน้า Parent SKU อยู่แล้ว → บอกให้ไปแท็บข้อมูล) */
  onOpenParent?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingShop, setSavingShop] = useState<string | null>(null);
  // ตัวเลือกรูปจากคลัง: กำลังเลือกให้ร้านไหน + เป้าหมาย (gallery = รูปรุ่น, หรือ sku id)
  // target: gallery = รูปรุ่น · sku id = รูปสีนั้น · "banner:<id>" = รูปแบนเนอร์
  const [picker, setPicker] = useState<{ shopId: string; target: "gallery" | string } | null>(null);
  // ร้านที่กางแผง "แบนเนอร์หน้าสินค้า" อยู่
  const [bnOpen, setBnOpen] = useState<Set<string>>(new Set());
  // แผงเลือกรูปจากแกลเลอรี SKU ที่เปิดอยู่ (ร้าน + สี)
  const [skuPanel, setSkuPanel] = useState<{ shopId: string; skuId: string } | null>(null);
  // 🎬 แผงตั้ง Hero รายสี (เปิดทีละสี)
  const [heroPanel, setHeroPanel] = useState<{ shopId: string; skuId: string } | null>(null);
  // ร้านที่กางแผง "จับคู่รายละเอียดหน้าเว็บ" อยู่
  const [detailsOpen, setDetailsOpen] = useState<Set<string>>(new Set());
  // 📐 แผง "ช่องใส่ของ" กางอยู่ (ของตัวสินค้า — ไม่แยกร้าน)
  const [fitOpen, setFitOpen] = useState(false);
  // ร้านที่กางแผง "ปั๊มชื่อ" อยู่
  const [pzOpen, setPzOpen] = useState<Set<string>>(new Set());
  const [prOpen, setPrOpen] = useState<Set<string>>(new Set());
  // แท็บที่เปิดอยู่ต่อร้าน (ค่าเริ่ม = ขายบนเว็บ)
  const [tabOf, setTabOf] = useState<Record<string, Tab>>({});
  // ค่าที่บันทึกล่าสุดต่อร้าน (เทียบหา "มีของแก้ค้าง" → ปุ่ม 💾 บันทึก แถบล่าง)
  const [savedSnap, setSavedSnap] = useState<Record<string, string>>({});
  // ✏️ ชื่อสี/ราคา SKU ที่แก้ค้างในแถวสี (key = sku id) + กำลังบันทึก
  const [skuDraft, setSkuDraft] = useState<Record<string, SkuDraft>>({});
  const [savingSkus, setSavingSkus] = useState(false);

  /** silent = ดึงค่าใหม่หลังบันทึก (ไม่ขึ้น "กำลังโหลด" ทั้งแผง) */
  const load = useCallback(
    async (silent = false) => {
      if (!parentId) return;
      if (!silent) setLoading(true);
      try {
        const r = await apiFetch(`/api/parent-web-listings?parentId=${encodeURIComponent(parentId)}`);
        const j = await r.json();
        setData(j?.shops ? (j as Resp) : null);
        if (j?.shops) setSavedSnap(Object.fromEntries((j as Resp).shops.map((s) => [s.shopId, snapOf(s)])));
      } catch {
        /* ignore */
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [parentId]
  );
  useEffect(() => {
    void load();
  }, [load]);

  // 🎯 เปิดมาจากแถว SKU ย่อย → เลื่อนไปแถวนั้น (SKU ไซส์ไม่มีแถวของตัวเอง → ไปหัวรายการ SKU) + ไฮไลต์ชั่วครู่
  const [flashSku, setFlashSku] = useState<string | null>(null);
  const hasData = !!data;
  useEffect(() => {
    if (!focusSkuId || loading || !hasData) return;
    // เลื่อนแบบทันที (smooth โดนยกเลิกระหว่าง drawer กำลังเลื่อนเข้า) · เลื่อนซ้ำอีกรอบหลังรูปโหลดแล้วความสูงเปลี่ยน
    const go = () =>
      (document.querySelector<HTMLElement>(`[data-web-sku="${focusSkuId}"]`) ?? document.querySelector<HTMLElement>("[data-web-skus]"))?.scrollIntoView({ block: "center" });
    const t1 = window.setTimeout(() => {
      go();
      setFlashSku(focusSkuId);
    }, 250);
    const t2 = window.setTimeout(go, 800);
    const off = window.setTimeout(() => setFlashSku(null), 3200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(off);
    };
  }, [focusSkuId, loading, hasData]);

  /** 🖼 ปุ่ม "ไปที่สีนั้น" — เลื่อนไปแถวสีในร้านนี้ + ไฮไลต์ชั่วครู่ */
  const jumpToSku = (shopId: string, skuId: string) => {
    document.querySelector<HTMLElement>(`[data-web-skus="${shopId}"] [data-web-sku="${skuId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashSku(skuId);
    window.setTimeout(() => setFlashSku((f) => (f === skuId ? null : f)), 2500);
  };

  const patchShop = (sid: string, p: Partial<ShopState>) =>
    setData((d) => (d ? { ...d, shops: d.shops.map((s) => (s.shopId === sid ? { ...s, ...p } : s)) } : d));
  const tabFor = (sid: string): Tab => tabOf[sid] ?? "sell";
  const setTab = (sid: string, tab: Tab) => setTabOf((m) => ({ ...m, [sid]: tab }));

  const setSkuImages = (s: ShopState, skuId: string, keys: string[]) => {
    const n = { ...s.webSkuImages };
    const list = [...new Set(keys)].slice(0, MAX_SKU_IMAGES);
    if (list.length) n[skuId] = list;
    else delete n[skuId];
    patchShop(s.shopId, { webSkuImages: n });
  };

  const setDetail = (s: ShopState, itemId: string, p: Partial<DetailOverride> | null) => {
    const n = { ...s.webDetails };
    const cur = { ...(n[itemId] ?? {}), ...(p ?? {}) };
    if (p === null || (cur.show === undefined && !(cur.text ?? "").trim())) delete n[itemId];
    else n[itemId] = cur;
    patchShop(s.shopId, { webDetails: n });
  };

  const addToShop = async (sid: string) => {
    if (!parentId) return;
    setSavingShop(sid);
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, shopId: sid, action: "add" }),
      });
      if ((await r.json()).ok) {
        toast.success(t("เพิ่มเข้าร้านแล้ว (ยังปิดอยู่)", "Added to shop (still hidden)"));
        await load(true);
        onChanged?.();
      } else toast.error(t("เพิ่มไม่สำเร็จ", "Add failed"));
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Can't connect"));
    }
    setSavingShop(null);
  };

  // กฎชื่อของร้าน: บันทึกทันที (ใช้ทุกสินค้าในร้าน) แล้วดึง "ชื่ออัตโนมัติ" ใหม่ — ไม่ทับช่องอื่นที่กำลังแก้อยู่
  const toggleNameRule = async (s: ShopState, flag: NameRuleFlag) => {
    if (!parentId) return;
    const next = !s.nameRule[flag];
    // ลบข้อความในวงเล็บ ↔ ลบแค่วงเล็บ เปิดได้ทีละอัน (เปิดอันหนึ่ง = ปิดอีกอัน)
    const other = next ? NAME_RULE_EXCLUSIVE[flag] : undefined;
    const changes: Partial<Record<NameRuleFlag, boolean>> = { [flag]: next, ...(other ? { [other]: false } : {}) };
    patchShop(s.shopId, { nameRule: { ...s.nameRule, ...changes } });
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, shopId: s.shopId, action: "nameRule", nameRule: changes }),
      });
      if (!(await r.json()).ok) throw new Error();
      const fresh = (await (await apiFetch(`/api/parent-web-listings?parentId=${encodeURIComponent(parentId)}`)).json()) as Resp;
      const f = fresh?.shops?.find((x) => x.shopId === s.shopId);
      if (f) patchShop(s.shopId, { autoName: f.autoName, nameRule: f.nameRule });
      toast.success(t(`กฎชื่อร้าน ${s.shopName} ใช้กับทุกสินค้าในร้านแล้ว`, `Name rule for ${s.shopName} now applies to every product in the shop`));
      onChanged?.();
    } catch {
      patchShop(s.shopId, { nameRule: s.nameRule });
      toast.error(t("บันทึกกฎชื่อไม่สำเร็จ", "Couldn't save the name rule"));
    }
  };

  // ✏️ ชื่อสี ไทย/อังกฤษ + ราคา ของ SKU — แก้ในแถวสี แล้วบันทึกพร้อมปุ่ม 💾 แถบล่าง (แก้ที่ SKU ใน ERP จริง · ทุกร้านเห็น)
  const draftOf = (v: Variant): SkuDraft => skuDraft[v.id] ?? { colorTh: v.colorTh, colorEn: v.colorEn, price: v.price ? String(v.price) : "" };
  const draftChanged = (v: Variant, d: SkuDraft) => d.colorTh.trim() !== v.colorTh || d.colorEn.trim() !== v.colorEn || (d.price.trim() !== "" && Number(d.price) !== v.price);
  const setDraft = (v: Variant, p: Partial<SkuDraft>) => setSkuDraft((m) => ({ ...m, [v.id]: { ...draftOf(v), ...p } }));
  const dirtySkus = (data?.variants ?? []).filter((v) => skuDraft[v.id] && draftChanged(v, skuDraft[v.id]));
  /** บันทึกชื่อสี/ราคาที่แก้ → คืนชื่อสีที่เว็บโชว์ที่เปลี่ยน (ให้การตั้งค่าการ์ดตามไป) · null = ไม่สำเร็จ */
  const saveSkus = async (): Promise<{ from: string; to: string }[] | null> => {
    if (!parentId || !dirtySkus.length) return [];
    for (const v of dirtySkus) {
      const d = skuDraft[v.id];
      if (d.price.trim() !== "" && !(Number(d.price) > 0)) {
        toast.error(t(`ราคา ${v.code} ต้องมากกว่า 0`, `Price for ${v.code} must be greater than 0`));
        return null;
      }
    }
    setSavingSkus(true);
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          action: "skuFields",
          items: dirtySkus.map((v) => {
            const d = skuDraft[v.id];
            return { skuId: v.id, colorTh: d.colorTh.trim(), colorEn: d.colorEn.trim(), ...(d.price.trim() !== "" ? { price: Number(d.price) } : {}) };
          }),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        toast.error(j?.error || t("บันทึกชื่อสี/ราคาไม่สำเร็จ", "Couldn't save color names/prices"));
        return null;
      }
      toast.success(t(`บันทึกชื่อสี/ราคา ${dirtySkus.length} สีแล้ว — แก้ที่ SKU ใน ERP (ทุกร้านเห็นค่าใหม่)`, `Saved color names/prices for ${dirtySkus.length} colors — updated on the ERP SKU (every shop sees the new values)`));
      return (j.renames ?? []) as { from: string; to: string }[];
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Can't connect"));
      return null;
    } finally {
      setSavingSkus(false);
    }
  };

  // 🎴 สีบนการ์ด — เก็บเป็นชื่อสี (ไม่สนตัวพิมพ์) · ติ๊กครบทุกสี = กลับเป็นค่าเริ่มต้น (null)
  const sameColor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const colorLabels = () => {
    const out: string[] = [];
    for (const v of data?.variants ?? []) if (v.label && !out.some((x) => sameColor(x, v.label))) out.push(v.label);
    return out;
  };
  const cardShown = (s: ShopState, label: string) => s.webCardColors.colors === null || s.webCardColors.colors.some((c) => sameColor(c, label));
  const toggleCardColor = (s: ShopState, label: string) => {
    const all = colorLabels();
    const next = all.filter((l) => (sameColor(l, label) ? !cardShown(s, l) : cardShown(s, l)));
    patchShop(s.shopId, { webCardColors: { ...s.webCardColors, colors: next.length === all.length ? null : next } });
  };
  const setCardMain = (s: ShopState, label: string) =>
    patchShop(s.shopId, { webCardColors: { ...s.webCardColors, main: s.webCardColors.main && sameColor(s.webCardColors.main, label) ? null : label } });
  /** 🎬 ตั้ง/เอาออก รูปเปิดหน้าสินค้าของคอมหรือมือถือ (ว่างทั้งคู่ = null → ใช้รูปสินค้า) */
  const heroEmpty = (h: ProductHero) => !h.desktop && !h.mobile && !(h.sku && Object.keys(h.sku).length);
  // 🎨 Hero รายสี — ว่างทั้งคอม/มือถือ = ลบสีนั้นออก (กลับไปใช้ของรุ่น)
  const setSkuHero = (s: ShopState, skuId: string, slot: "desktop" | "mobile", m: MediaValue | null) => {
    const cur: ProductHero = s.webHero ?? { desktop: null, mobile: null };
    const one = { ...(cur.sku?.[skuId] ?? { desktop: null, mobile: null }), [slot]: m ? { kind: m.kind, key: m.key, posterKey: null } : null };
    const sku = { ...(cur.sku ?? {}) };
    if (one.desktop || one.mobile) sku[skuId] = one;
    else delete sku[skuId];
    const next: ProductHero = { desktop: cur.desktop, mobile: cur.mobile, ...(Object.keys(sku).length ? { sku } : {}) };
    patchShop(s.shopId, { webHero: heroEmpty(next) ? null : next });
  };
  const setHero = (s: ShopState, slot: "desktop" | "mobile", m: MediaValue | null) => {
    const cur: ProductHero = s.webHero ?? { desktop: null, mobile: null };
    const next: ProductHero = { ...cur, [slot]: m ? { kind: m.kind, key: m.key, posterKey: null } : null };
    patchShop(s.shopId, { webHero: heroEmpty(next) ? null : next });
  };

  const saveShop = async (s: ShopState): Promise<boolean> => {
    if (!parentId) return false;
    setSavingShop(s.shopId);
    let ok = false;
    try {
      const r = await apiFetch("/api/parent-web-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          shopId: s.shopId,
          patch: {
            isPublished: s.published,
            featured: s.featured,
            webPrice: s.webPrice,
            webName: s.webName,
            webDescription: s.webDescription,
            webImages: s.webImages,
            webSkuImages: s.webSkuImages,
            webDetails: s.webDetails,
            webPersonalize: s.webPersonalize,
            webPrint: s.webPrint ?? null,
            webBanners: s.webBanners,
            webCardColors: s.webCardColors,
            webHero: s.webHero,
            webUnit: s.webUnit,
            webCategories: s.webCategories,
            webBadge: s.webBadge,
            webStockStatus: s.webStockStatus || "in",
            webSwatch: s.webSwatch,
            webOptions: s.webOptions,
            webVariantOff: s.webVariantOff ?? [],
            webSizeGuide: s.webSizeGuide ?? "",
            webRelated: s.webRelated ?? [],
            webSeo: s.webSeo ?? null,
          },
        }),
      });
      ok = !!(await r.json()).ok;
      if (ok) {
        setSavedSnap((p) => ({ ...p, [s.shopId]: snapOf(s) }));
        toast.success(t(`บันทึก ${s.shopName} แล้ว — เว็บเปลี่ยนตามทันที`, `Saved ${s.shopName} — the site updates right away`));
      } else toast.error(t("บันทึกไม่สำเร็จ", "Save failed"));
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Can't connect"));
    }
    setSavingShop(null);
    return ok;
  };

  /** เพิ่มรูป (r2 key) ให้ร้าน/เป้าหมาย — ใช้ทั้ง "เลือกจากคลัง" และ "อัปโหลด" · อ่าน state ล่าสุด (อัปโหลดใช้เวลา ระหว่างนั้นอาจแก้ช่องอื่น) */
  const addImages = (sid: string, target: string, keys: string[]) =>
    setData((d) =>
      d
        ? {
            ...d,
            shops: d.shops.map((s) => {
              if (s.shopId !== sid) return s;
              if (target === "gallery") return { ...s, webImages: [...s.webImages, ...keys].slice(0, 12) };
              if (target.startsWith("banner:")) {
                const id = target.slice(7);
                return { ...s, webBanners: s.webBanners.map((b) => (b.id === id ? { ...b, imageKey: keys[0] } : b)) };
              }
              const list = [...new Set([...(s.webSkuImages[target] ?? []), ...keys])].slice(0, MAX_SKU_IMAGES);
              return { ...s, webSkuImages: { ...s.webSkuImages, [target]: list } };
            }),
          }
        : d
    );

  const onPickImages = (assets: AssetRow[]) => {
    if (!picker) return;
    const keys = assets.map((a) => a.r2_key).filter(Boolean);
    if (keys.length) addImages(picker.shopId, picker.target, keys);
    setPicker(null);
  };

  // ⬆ อัปโหลดรูปจากเครื่อง (หลายรูป) → ย่อด้านยาว ≤ 2000px → ตรวจรูปซ้ำในคลังก่อนส่ง (ของกลาง uploadImagesWithDupCheck) → เข้าคลังไฟล์อัตโนมัติ → ต่อท้ายรูปของเป้าหมาย
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTo = useRef<{ shopId: string; target: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [upProgress, setUpProgress] = useState<UploadProgressState | null>(null);
  const startUpload = (sid: string, target: string) => {
    uploadTo.current = { shopId: sid, target };
    fileRef.current?.click();
  };
  const onUploadFiles = async (files: FileList | null) => {
    const dest = uploadTo.current;
    if (dest) await uploadFilesTo(dest, Array.from(files ?? []));
    if (fileRef.current) fileRef.current.value = "";
  };
  // 📥 ลากรูปจากเครื่องมาวางที่ "รูปบนเว็บ" หรือแถวสี = อัปโหลดเข้าที่นั้น (ของกลาง useFileDrop · key = "<shopId>:<target>")
  const fileDrop = useFileDrop(
    (files, key) => {
      const i = key.indexOf(":");
      void uploadFilesTo({ shopId: key.slice(0, i), target: key.slice(i + 1) }, files);
    },
    {
      accept: "image/",
      disabled: !!uploading,
      onReject: () => toast.error(tr("ลากมาได้เฉพาะไฟล์รูป (jpg / png / webp)", "Only image files can be dropped (jpg / png / webp)")),
      onBusy: () => toast.warning(tr("กำลังอัปโหลดรูปชุดก่อนอยู่ — รอสักครู่แล้วลากใหม่", "Still uploading the previous batch — wait a moment and drop again")),
    }
  );
  // 🔁 ของกลาง uploadImagesWithDupCheck: รูปที่มีในคลังแล้ว → ถาม "ใช้รูปเดิม / อัปโหลดใหม่" ก่อนส่งไฟล์ (ไม่เปลืองที่เก็บไฟล์) · รูปที่อยู่ในช่องนี้แล้ว → เสนอ "ข้าม"
  const uploadFilesTo = async (dest: { shopId: string; target: string }, files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const s = data?.shops.find((x) => x.shopId === dest.shopId);
    const v = data?.variants.find((x) => x.id === dest.target);
    const bannerKey = dest.target.startsWith("banner:") ? s?.webBanners.find((b) => b.id === dest.target.slice(7))?.imageKey : null;
    const here = !s ? [] : dest.target === "gallery" ? s.webImages : bannerKey ? [bannerKey] : s.webSkuImages[dest.target] ?? [];
    const where = v ? tr(`แถวสี ${v.code} · ${v.label}`, `Color row ${v.code} · ${v.label}`) : dest.target === "gallery" ? tr("รูปบนเว็บ", "Web images") : tr("แบนเนอร์", "Banner");
    setUploading(`${dest.shopId}:${dest.target}`);
    try {
      const r = await uploadImagesWithDupCheck(imgs, {
        folder: "storefront-products",
        max: 2000,
        target: s ? `${where} (${s.shopName})` : where,
        existingKeys: here,
        onError: (f, e) => toast.error(tr(`อัปโหลด ${f.name} ไม่สำเร็จ: ${e.message}`, `Upload of ${f.name} failed: ${e.message}`)),
        onProgress: setUpProgress,
      });
      if (r?.keys.length) {
        addImages(dest.shopId, dest.target, r.keys);
        const parts = [r.uploaded && tr(`อัปโหลด ${r.uploaded} รูป`, `Uploaded ${r.uploaded} images`), r.reused && tr(`ใช้รูปเดิม ${r.reused} รูป`, `reused ${r.reused} images`)].filter(Boolean).join(" · ");
        toast.success(tr(`${parts} แล้ว — กดบันทึก เพื่อขึ้นเว็บ`, `${parts} — click Save to publish`));
      } else if (r?.skipped) toast.info(tr("รูปที่เลือกอยู่ในช่องนี้แล้ว — ไม่ได้เพิ่มซ้ำ", "The selected images are already here — not added again"));
    } finally {
      setUploading(null);
      setUpProgress(null);
    }
  };
  /** แถบ "กำลังอัปโหลด" ของกลาง — โชว์เฉพาะช่องที่กำลังอัป (แถวสี / รูปบนเว็บ) */
  const uploadProgressFor = (sid: string, target: string) =>
    uploading === `${sid}:${target}` && upProgress ? <UploadProgress {...upProgress} className="rounded-lg border border-blue-100 bg-blue-50/50 px-2.5 py-1.5" /> : null;
  const uploadBtn = (sid: string, target: string, cls: string) => {
    const busy = uploading === `${sid}:${target}`;
    return (
      <button
        type="button"
        onClick={() => startUpload(sid, target)}
        disabled={!!uploading}
        title={t("อัปโหลดรูปจากเครื่อง (เลือกได้หลายรูป · ย่อให้อัตโนมัติ · เก็บเข้าคลังไฟล์ด้วย) — หรือลากรูปมาวางที่แถวนี้ก็ได้", "Upload images from your computer (multiple · auto-resized · also saved to the file library) — or drop images on this row")}
        className={`${cls} disabled:opacity-50`}
      >
        {busy ? t("กำลังอัป…", "Uploading…") : t("⬆ อัปโหลด", "⬆ Upload")}
      </button>
    );
  };

  // 💾 ปุ่มบันทึกอยู่แถบล่างของหน้าต่าง (ของกลาง footer-save) — เทียบกับค่าที่บันทึกล่าสุดต่อร้าน
  const visibleShops = (data?.shops ?? []).filter((s) => !shopId || s.shopId === shopId);
  const dirtyShops = visibleShops.filter((s) => s.listed && savedSnap[s.shopId] !== undefined && snapOf(s) !== savedSnap[s.shopId]);
  /** ชื่อสีที่เว็บโชว์เปลี่ยน → การตั้งค่าการ์ดของร้านที่แก้ค้างต้องใช้ชื่อใหม่ด้วย (ไม่งั้นบันทึกร้านทับชื่อเก่ากลับ) */
  const withRenames = (s: ShopState, renames: { from: string; to: string }[]): ShopState => {
    const cc = renames.reduce((c, r) => renameCardColor(c, r.from, r.to), s.webCardColors);
    return cc === s.webCardColors ? s : { ...s, webCardColors: cc };
  };
  /** ปุ่มบันทึกในกล่องร้าน (เปิดนอก drawer) — ชื่อสี/ราคา SKU + ร้านนี้ */
  const saveOne = async (s: ShopState) => {
    const renames = await saveSkus();
    if (renames === null) return;
    const ok = await saveShop(withRenames(s, renames));
    if (ok || dirtySkus.length) {
      await load(true);
      if (dirtySkus.length) setSkuDraft({});
      onChanged?.();
    }
  };
  const saveDirty = async () => {
    // ✏️ ชื่อสี/ราคา SKU ก่อน — ไม่สำเร็จ = หยุด (ไม่บันทึกครึ่ง ๆ)
    const renames = await saveSkus();
    if (renames === null) return;
    let any = dirtySkus.length > 0;
    for (const s of dirtyShops) any = (await saveShop(withRenames(s, renames))) || any;
    // ดึงค่าใหม่ (ชื่อ/ราคาที่ลูกค้าเห็น · สิ่งที่ต้องแก้) + บอกหน้าที่เปิดอยู่ · ล้างค่าที่แก้ค้างหลังได้ค่าใหม่ (ช่องไม่กระพริบกลับค่าเก่า)
    if (any) {
      await load(true);
      if (dirtySkus.length) setSkuDraft({});
      onChanged?.();
    }
  };
  const inFooter = useFooterSave(
    parentId && data ? { label: t("เว็บไซต์", "Website"), dirty: dirtyShops.length > 0 || dirtySkus.length > 0, saving: savingShop !== null || savingSkus, onSave: saveDirty } : null
  );

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">{t("บันทึกรุ่นก่อน แล้วค่อยตั้งค่าการขายบนเว็บ", "Save the model first, then set up web selling")}</div>;
  if (loading) return <div className="text-sm text-slate-400 py-8 text-center">{t("กำลังโหลด…", "Loading…")}</div>;
  if (!data) return <div className="text-sm text-slate-400 py-8 text-center">{t("โหลดข้อมูลไม่สำเร็จ", "Couldn't load data")}</div>;

  /* ───────── 🛒 ขายบนเว็บ ───────── */
  const renderSell = (s: ShopState) => {
    const cats = s.webCategories ?? s.categories;
    return (
      <div className="space-y-3">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap flex-1 min-w-0 pb-2">
          <Toggle label={s.published ? t("ขึ้นเว็บอยู่", "Live") : t("ซ่อนอยู่ (ลูกค้าไม่เห็น)", "Hidden (customers can't see it)")} on={s.published} onClick={() => patchShop(s.shopId, { published: !s.published })} />
          <button type="button" onClick={() => patchShop(s.shopId, { featured: !s.featured })} className={`text-xs flex items-center gap-1 ${s.featured ? "text-amber-500" : "text-slate-400 hover:text-amber-400"}`}>
            <span className="text-base leading-none">★</span> {t("สินค้าแนะนำ", "Featured")}
          </button>
          </div>
          <div className="w-44 shrink-0">
            <NumField label={t(`ราคาเว็บ (ว่าง = ${s.auto.price > 0 ? baht(s.auto.price) : "ราคาปกติ"})`, `Web price (empty = ${s.auto.price > 0 ? baht(s.auto.price) : "regular price"})`)} value={s.webPrice} onChange={(v) => patchShop(s.shopId, { webPrice: v })} />
          </div>
        </div>

        <div>
          <span className={labelCls}>{t("หมวดบนเว็บ (เลือกได้หลายหมวด · ตัวแรก = หมวดหลัก)", "Web categories (pick several · first = main category)")}</span>
          {s.shopCategories.length ? (
            <FieldChipsPicker
              value={cats.filter((k) => s.shopCategories.some((c) => c.key === k))}
              onChange={(next) => patchShop(s.shopId, { webCategories: next, categories: next })}
              fields={s.shopCategories.map((c) => ({ key: c.key, label: c.label, icon: c.icon || undefined }))}
              title={t("เลือกหมวดบนเว็บ", "Pick web categories")}
              description={t("ติ๊กได้หลายหมวด · ★ = หมวดหลัก (กด ★ เปลี่ยนได้) — สินค้าโผล่ในทุกหมวดที่ติ๊ก", "Tick several · ★ = main category (click ★ to change) — the product appears in every ticked category")}
              addLabel={t("＋ เลือกหมวด", "＋ Pick category")}
              searchPlaceholder={t("ค้นหาหมวด…", "Search categories…")}
              unit={t("หมวด", "categories")}
              showKeys={false}
              markFirst={t("หมวดหลัก", "Main category")}
              emptyText={t("ยังไม่อยู่หมวดไหน", "Not in any category yet")}
            />
          ) : (
            <p className="text-[11px] text-slate-400">{t("ร้านนี้ยังไม่ได้ตั้งหมวด — ตั้งที่ เว็บไซต์ → 📂 หมวดหมู่", "This shop has no categories yet — set them in Website → 📂 Categories")}</p>
          )}
        </div>

        {/* 🎨 SKU ในรุ่นนี้ — ขึ้นก่อนรูป (เจ้าของขอ "ต้องเห็น SKU และแก้ได้" 2026-10-28) */}
        {renderSkus(s)}

        {/* 🖼 รูปเปิด + รูปบนเว็บ (เดิมแยกแท็บ — เจ้าของขอรวมไว้หน้านี้ 2026-10-20) */}
        {renderMedia(s)}

        {/* 📐 ไซส์ (ตัวเลือกชุดที่ 2) — เปิด/ปิดแต่ละคู่ สี×ไซส์ บนเว็บร้านนี้ · ตัวเลือกกรอกเอง = ไม่ใช้ไซส์จาก SKU */}
        {data.sizeGrid && !s.webOptions?.items?.length && (
          <SizeGridEditor grid={data.sizeGrid} off={s.webVariantOff ?? []} onChange={(next) => patchShop(s.shopId, { webVariantOff: next })} enabled={!!s.options2On} />
        )}
        {/* 📏 ตารางไซส์ของรุ่นนี้ — อัตโนมัติตามหมวด / เลือกเอง / ไม่แสดง (ตั้งตารางที่ เว็บไซต์ → 📏 ตารางไซส์) */}
        {data.sizeGrid && !s.webOptions?.items?.length && (
          <label className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
            <span>{t("📏 ตารางไซส์บนหน้าสินค้า", "📏 Size guide on product page")}</span>
            <select value={s.webSizeGuide ?? ""} onChange={(e) => patchShop(s.shopId, { webSizeGuide: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
              <option value="">{t("อัตโนมัติตามหมวด", "Auto by category")} ({s.autoSizeGuide ?? t("ไม่มีตารางของหมวดนี้", "no guide for this category")})</option>
              {(s.sizeGuides ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="none">{t("ไม่แสดงตารางไซส์", "Don't show a size guide")}</option>
            </select>
            {!(s.sizeGuides ?? []).length && <span className="text-slate-400">{t("ร้านนี้ยังไม่มีตารางไซส์ — ตั้งที่ เว็บไซต์ → 📏 ตารางไซส์", "This shop has no size guides yet — set them in Website → 📏 Size guides")}</span>}
          </label>
        )}
      </div>
    );
  };

  /* ───────── 📝 รายละเอียดบนเว็บ: ชื่อ · หน่วย/สต๊อก/ป้าย · คำอธิบาย · ข้อมูลที่เชื่อม · ตั้งค่าเพิ่มเติม ───────── */
  /** คำอธิบายที่เว็บใช้ตอนช่องว่าง (ตัวจางในช่อง + ปุ่ม "ใช้ข้อความนี้") */
  const autoDescOf = (s: ShopState) => s.auto.description || data.erpDescription || "";
  const renderDetail = (s: ShopState) => (
    <div className="space-y-3">
      <div>
        <Field label={t("ชื่อบนเว็บ (ว่าง = ใช้ชื่ออัตโนมัติด้านล่าง)", "Web name (empty = use the auto name below)")} value={s.webName} onChange={(v) => patchShop(s.shopId, { webName: v })} placeholder={s.autoName} />
        {/* กฎชื่อของร้าน: ประกอบชื่ออัตโนมัติจากชื่อใน ERP โดยตัดส่วนที่ไม่ต้องการออก */}
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400" title={t("ตั้งครั้งเดียว ใช้กับทุกสินค้าในร้านนี้ (แก้ได้ที่ เว็บไซต์ → จับคู่ฟิลด์ ด้วย)", "Set once, applies to every product in this shop (also editable in Website → Field mapping)")}>
            {t("กฎชื่อร้านนี้:", "Shop name rule:")}
          </span>
          {NAME_RULE_CHIPS.map((c) => {
            const ref = c.ref ? data.nameRefs[c.ref] : null;
            if (c.ref && !ref) return null; // รุ่นนี้ไม่มีแบรนด์/คอลเลกชัน → ไม่ต้องโชว์ปุ่ม
            const on = s.nameRule[c.flag];
            return (
              <button
                key={c.flag}
                type="button"
                onClick={() => toggleNameRule(s, c.flag)}
                className={`text-[11px] rounded-full border px-2 py-0.5 ${on ? "bg-slate-700 border-slate-700 text-white" : "border-slate-300 text-slate-500 hover:bg-slate-100"}`}
              >
                {on ? "✓ " : ""}
                {c.label}
                {/* ลบรหัส = รหัสแบบเดียวกันทุกตัว (PIX13 → PIX ทุกเลข · website-field-map removeCodes) */}
                {ref ? (c.flag === "removeCode" && /^[A-Za-z]{2,}\d/.test(ref) ? t(` "${ref.match(/^[A-Za-z]+/)![0]}…" ทุกตัว`, ` "${ref.match(/^[A-Za-z]+/)![0]}…" all`) : ` "${ref}"`) : ""}
              </button>
            );
          })}
        </div>
        <AutoValueRow
          custom={!!s.webName.trim()}
          autoText={s.autoName}
          emptyNote={
            <>
              {t("ชื่อที่เว็บจะโชว์:", "Name shown on web:")} <span className="text-slate-700">{s.autoName}</span>
            </>
          }
          customNote={t("ใช้ชื่อที่พิมพ์เอง — แก้ชื่อที่ Parent SKU แล้วเว็บจะไม่เปลี่ยนตาม", "Using a typed name — changing the Parent SKU name won't update the site")}
          useLabel={t("ใช้ชื่อนี้", "Use this name")}
          useTitle={t("เติมชื่ออัตโนมัติลงช่อง แล้วแก้ต่อได้", "Fill in the auto name, then edit it")}
          resetTitle={t("ลบชื่อที่พิมพ์ — กลับไปใช้ชื่ออัตโนมัติ (เปลี่ยนตาม Parent SKU)", "Clear the typed name — go back to the auto name (follows Parent SKU)")}
          onUse={() => patchShop(s.shopId, { webName: s.autoName })}
          onReset={() => patchShop(s.shopId, { webName: "" })}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Field label={t(`หน่วยขาย${s.auto.unit ? ` (อัตโนมัติ: ${s.auto.unit})` : ""}`, `Sales unit${s.auto.unit ? ` (auto: ${s.auto.unit})` : ""}`)} value={s.webUnit} onChange={(v) => patchShop(s.shopId, { webUnit: v })} placeholder={s.auto.unit || t("ชิ้น / ใบ / หลา", "pc / bag / yard")} />
        <label className="block">
          <span className={`${labelCls} flex items-center gap-1.5 flex-wrap`}>
            {t("สถานะสต๊อกบนเว็บ", "Web stock status")}
            {/* 🔔 ลูกค้าที่ฝากให้แจ้งเมื่อมีของ (โชว์เมื่อมีคนรอ) */}
            {parentId && <RestockBadge shopId={s.shopId} parentId={parentId} soldOut={(s.webStockStatus || "in") === "out"} />}
          </span>
          <select value={s.webStockStatus || "in"} onChange={(e) => patchShop(s.shopId, { webStockStatus: e.target.value })} className={inputCls}>
            {STOCKS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>{t("ป้ายบนการ์ด", "Card badge")}</span>
          <CardBadgeSelect shopId={s.shopId} value={s.webBadge} onChange={(v) => patchShop(s.shopId, { webBadge: v })} />
        </label>
      </div>

      <div>
        <Field textarea rows={s.webDescription.trim() ? 6 : 2} label={t("คำอธิบายบนเว็บ (ว่าง = ใช้จาก ERP)", "Web description (empty = use ERP)")} value={s.webDescription} onChange={(v) => patchShop(s.shopId, { webDescription: v })} placeholder={autoDescOf(s) || "—"} />
        {/* ว่าง = เว็บใช้คำอธิบายจาก ERP → ปุ่มเติมข้อความนั้นลงช่องแล้วแก้ต่อ (เหมือนชื่อบนเว็บ) */}
        <AutoValueRow
          custom={!!s.webDescription.trim()}
          autoText={autoDescOf(s)}
          emptyNote={t("ตอนนี้เว็บใช้คำอธิบายจาก ERP (ตัวจางในช่อง)", "The site currently uses the ERP description (greyed in the box)")}
          customNote={t("ใช้คำอธิบายที่พิมพ์เอง — แก้คำอธิบายใน ERP แล้วเว็บจะไม่เปลี่ยนตาม", "Using a typed description — changing it in ERP won't update the site")}
          useLabel={t("ใช้ข้อความนี้", "Use this text")}
          useTitle={t("เติมคำอธิบายจาก ERP ลงช่อง แล้วแก้ต่อได้", "Fill in the ERP description, then edit it")}
          resetTitle={t("ลบคำอธิบายที่พิมพ์ — กลับไปใช้คำอธิบายจาก ERP", "Clear the typed description — go back to the ERP description")}
          onUse={() => patchShop(s.shopId, { webDescription: autoDescOf(s) })}
          onReset={async () => {
            // ข้อความยาวที่แก้ไปแล้ว → ถามก่อนลบ (ยังไม่ขึ้นเว็บจนกว่าจะบันทึก)
            if (s.webDescription.trim() !== autoDescOf(s).trim() && !(await askConfirm({ title: t("ลบคำอธิบายที่พิมพ์เอง?", "Clear the typed description?"), message: t("ช่องจะว่าง แล้วเว็บกลับไปใช้คำอธิบายจาก ERP (ยังไม่ขึ้นเว็บจนกว่าจะกดบันทึก)", "The box will be empty and the site goes back to the ERP description (not live until you click Save)"), variant: "danger", confirmText: t("ลบ", "Delete") }))) return;
            patchShop(s.shopId, { webDescription: "" });
          }}
        />
      </div>
      {s.linked?.length ? <LinkedPanel rows={s.linked} onOpenParent={onOpenParent} /> : null}

      {/* ตัวเลือกกรอกเอง + สีตัวอย่าง — ใช้กับร้านวัสดุ (ร้านกระเป๋าใช้สีจาก SKU อัตโนมัติ) */}
      <details className="rounded-lg border border-slate-200 bg-white px-3 py-2" open={!!(s.webOptions?.items?.length || s.webSwatch)}>
        <summary className="cursor-pointer text-xs text-slate-500">{t("ตั้งค่าเพิ่มเติม (ตัวเลือกกรอกเอง · สีตัวอย่างแทนรูป)", "More settings (custom options · sample color instead of image)")}</summary>
        <div className="grid gap-2 sm:grid-cols-3 mt-2">
          <Field label={t("ชื่อชุดตัวเลือก", "Option set name")} value={s.webOptions?.label ?? ""} onChange={(v) => patchShop(s.shopId, { webOptions: { label: v, items: s.webOptions?.items ?? [] } })} placeholder={t("ความหนา / สี", "Thickness / Color")} />
          <div className="sm:col-span-2">
            <span className={labelCls}>{t("ตัวเลือก (คั่นด้วยจุลภาค · ว่าง = ใช้สีจาก SKU อัตโนมัติ)", "Options (comma separated · empty = use SKU colors automatically)")}</span>
            <ItemsInput value={s.webOptions} onCommit={(items) => patchShop(s.shopId, { webOptions: items.length ? { label: s.webOptions?.label || "ตัวเลือก", items } : null })} />
          </div>
          <div className="sm:col-span-3">
            <span className={labelCls}>{t("สีตัวอย่าง (ใช้แทนรูปจนกว่าจะมีรูปจริง)", "Sample color (used until a real image exists)")}</span>
            <div className="flex items-center gap-2">
              <input value={s.webSwatch} onChange={(e) => patchShop(s.shopId, { webSwatch: e.target.value })} placeholder={t("#C89A5B หรือ linear-gradient(...)", "#C89A5B or linear-gradient(...)")} className={inputCls} />
              <span className="shrink-0 w-9 h-9 rounded-lg border border-slate-200" style={s.webSwatch ? { background: s.webSwatch } : { background: "#f1f5f9" }} />
            </div>
          </div>
        </div>
      </details>
    </div>
  );

  /* ───────── 🖼 รูป สี และรูปเปิด ───────── */
  const renderMedia = (s: ShopState) => (
    <div className="space-y-3">
      {/* 🎬 รูปเปิดหน้าสินค้า (Hero) — ภาพ/วิดีโอแรกของแกลเลอรี เต็มช่องแบบ Gucci */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-700">{t("🎬 รูปเปิดหน้าสินค้า (Hero) — ภาพแรกเต็มช่อง ไม่มีขอบ", "🎬 Product page hero — first image, full width, no border")}</span>
          <span className="text-[11px] text-slate-500">
            {s.webHero?.desktop || s.webHero?.mobile ? t("ตั้งไว้แล้ว", "Set") : t("ว่าง = ใช้รูปสินค้าตามเดิม", "Empty = use product images as before")}
            {s.webHero?.sku && Object.keys(s.webHero.sku).length > 0 && t(` · Hero รายสี ${Object.keys(s.webHero.sku).length} สี`, ` · per-color hero: ${Object.keys(s.webHero.sku).length} colors`)}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <MediaUploadField label={t("🖥 คอม", "🖥 Desktop")} hint={`${HERO_SIZE_HINT.desktop} · ${HERO_SIZE_HINT.video}`} value={s.webHero?.desktop ?? null} onChange={(m) => setHero(s, "desktop", m)} previewRatio="16 / 9" />
          <MediaUploadField label={t("📱 มือถือ", "📱 Mobile")} hint={HERO_SIZE_HINT.mobile} value={s.webHero?.mobile ?? null} onChange={(m) => setHero(s, "mobile", m)} previewRatio="4 / 5" />
        </div>
      </div>

      {/* รูปเว็บ (รุ่น) — 📥 ลากรูปจากเครื่องมาวางในกล่องนี้ = อัปโหลด */}
      <div {...fileDrop.zone(`${s.shopId}:gallery`)} className="relative">
        <FileDropHint show={fileDrop.over === `${s.shopId}:gallery`} label={t("วางรูปเพื่ออัปโหลดเป็นรูปบนเว็บ", "Drop images to upload as web images")} />
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-600">{t(`รูปบนเว็บ (${s.webImages.length}) — ว่าง = ใช้รูป ERP · ลากรูปมาวางได้`, `Web images (${s.webImages.length}) — empty = use ERP images · drop images here`)}</span>
          <div className="flex items-center gap-1.5">
            {uploadBtn(s.shopId, "gallery", "text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg px-2.5 py-1")}
            <button onClick={() => setPicker({ shopId: s.shopId, target: "gallery" })} className="text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg px-2.5 py-1">
              {t("🖼 เลือกรูปจากคลัง", "🖼 Pick from library")}
            </button>
          </div>
        </div>
        {uploadProgressFor(s.shopId, "gallery")}
        {s.webImages.length > 0 && (
          <SortableThumbs
            keys={s.webImages}
            onChange={(next) => patchShop(s.shopId, { webImages: next })}
            size="w-14 h-14"
            badge={(i) => (i === 0 ? <span className="absolute -top-1.5 -left-1.5 text-[10px] bg-orange-500 text-white rounded px-1">{t("ปก", "Cover")}</span> : null)}
          />
        )}
      </div>
    </div>
  );

  /* ───────── 🎨 SKU ในรุ่นนี้ (แถวสี) — ชื่อสี ไทย/EN + ราคา แก้ได้ในแถว · รูปเว็บรายสี · Hero รายสี ───────── */
  const renderSkus = (s: ShopState) => {
    if (!data.variants.length)
      return (
        <div data-web-skus className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400">
          {t("🎨 รุ่นนี้ยังไม่มี SKU ที่ใช้งานอยู่ — สร้าง/เปิดใช้ SKU ที่ Parent SKU ก่อน", "🎨 This model has no active SKUs — create/activate SKUs on the Parent SKU first")}
        </div>
      );
    const noPrice = data.variants.filter((v) => !(v.price > 0)).length;
    // 🖼 รูปบนเว็บรายสี (กฎเดียวกับป้ายในหน้า "สินค้าบนเว็บ" — lib/website-listing-health colorWebImages) · อัปเดตทันทีที่เพิ่ม/ล้างรูป
    const imgOf = (v: Variant): "web" | "sku" | "none" => ((s.webSkuImages[v.id] ?? []).length ? "web" : v.erpImageKey ? "sku" : "none");
    const web = colorWebImages(data.variants.map((v) => ({ label: v.label, swatch: null, hasImage: imgOf(v) !== "none", img: imgOf(v), skuId: v.id })));
    const noneN = web.missing.filter((c) => c.img === "none").length;
    const missNames = web.missing.slice(0, 3).map((c) => c.label).join(", ") + (web.missing.length > 3 ? t(` และอีก ${web.missing.length - 3} สี`, ` and ${web.missing.length - 3} more`) : "");

    return (
        <div data-web-skus={s.shopId}>
          <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
            <span className="text-sm font-semibold text-slate-800">{t(`🎨 SKU ในรุ่นนี้ (${data.variants.length})`, `🎨 SKUs in this model (${data.variants.length})`)}</span>
            {noPrice > 0 && <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] text-rose-700">{t(`ยังไม่มีราคา ${noPrice} ตัว — ใส่ราคาในแถวได้เลย`, `${noPrice} without a price — enter it in the row`)}</span>}
            {web.missing.length > 0 ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${noneN ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <Icon name="image" size={12} />
                {web.noWeb ? t(`ยังไม่มีรูปบนเว็บเลย (0/${web.total} สี) — ตอนนี้ลูกค้าเห็นรูปปก SKU แทน`, `No web images yet (0/${web.total} colors) — customers see the SKU cover image instead`) : t(`รูปบนเว็บ ${web.webN}/${web.total} สี · ${missNames} ยังไม่มี`, `Web images ${web.webN}/${web.total} colors · ${missNames} missing`)}
                {noneN ? t(` · SKU ก็ไม่มีรูป ${noneN} สี`, ` · ${noneN} colors have no SKU image either`) : ""}
                <button type="button" onClick={() => jumpToSku(s.shopId, web.missing[0].skuId!)} className="underline hover:no-underline">
                  {web.noWeb ? t("ไปลงรูป", "Add images") : t("ไปที่สีนั้น", "Go to that color")}
                </button>
              </span>
            ) : web.total > 0 ? (
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-700">{t("✓ รูปบนเว็บครบทุกสี", "✓ Web images for every color")}</span>
            ) : null}
          </div>
          <div className="text-[11px] text-slate-500 mb-1.5">
            {t("✏️ แก้ชื่อสี ไทย/EN + ราคา ในแถวได้เลย (แก้ที่ SKU ใน ERP — ทุกร้านเห็น · กด 💾 บันทึก) · เลือกรูปเว็บรายสีได้หลายรูป (ว่าง = ใช้รูปปก SKU) · กดเลือกสีบนเว็บแล้วแกลเลอรีจะโชว์รูปชุดนั้น · 📥 ลากรูปจากเครื่องมาวางที่แถวสีได้เลย · กดค้างที่รูปแล้วลาก = สลับตำแหน่ง", "✏️ Edit TH/EN color names + price right in the row (updates the ERP SKU — every shop sees it · click 💾 Save) · pick several web images per color (empty = SKU cover image) · picking a color on the site shows that image set · 📥 drop images from your computer on a color row · press and drag an image = reorder")}
          </div>
          {(() => {
            const all = colorLabels();
            const shown = all.filter((l) => cardShown(s, l)).length;
            const custom = s.webCardColors.colors !== null || s.webCardColors.main !== null;
            return (
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 mb-1.5 rounded-lg bg-emerald-50/60 px-2 py-1">
                <span>
                  {t("🎴 การ์ดสินค้า: โชว์จุดสี", "🎴 Product card: showing color dots")}{" "}
                  <b className="text-slate-700">
                    {shown}/{all.length}
                  </b>{" "}
                  {t("สี · ★ สีหลัก (รูปแรกบนการ์ด):", "colors · ★ main color (first image on card):")} <b className="text-slate-700">{s.webCardColors.main ?? t("ตามลำดับเดิม", "default order")}</b>
                </span>
                {custom && (
                  <button type="button" onClick={() => patchShop(s.shopId, { webCardColors: { colors: null, main: null } })} className="text-blue-600 hover:underline">
                    {t("ใช้ค่าเริ่มต้น (ทุกสี)", "Use default (all colors)")}
                  </button>
                )}
                <span className="text-slate-400">{t("กด 🎴 เพื่อโชว์/ซ่อนบนการ์ด · กด ★ เลือกสีหลัก", "Click 🎴 to show/hide on the card · click ★ to pick the main color")}</span>
              </div>
            );
          })()}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {data.variants.map((v) => {
              const chosen = s.webSkuImages[v.id] ?? [];
              const panelOpen = skuPanel?.shopId === s.shopId && skuPanel.skuId === v.id;
              const skuHero = heroOfSku(s.webHero, v.id);
              const heroOpen = heroPanel?.shopId === s.shopId && heroPanel.skuId === v.id;
              const on = cardShown(s, v.label);
              const isMain = !!s.webCardColors.main && sameColor(s.webCardColors.main, v.label);
              // 🖼 ยังไม่ได้ลงรูปเว็บ (รูปปก SKU ไม่นับ): warn = ตอนนี้ลูกค้าเห็นรูปปก SKU แทน (เหลือง) · none = SKU ก็ไม่มีรูป ลูกค้าเห็นช่องว่าง (แดง)
              const gap = imgOf(v) === "none" ? "none" : imgOf(v) === "sku" ? "warn" : null;
              return (
                <div
                  key={v.id}
                  data-web-sku={v.id}
                  {...fileDrop.zone(`${s.shopId}:${v.id}`)}
                  className={`relative p-2 space-y-1.5 transition-colors duration-700 ${flashSku === v.id ? "bg-amber-50 ring-2 ring-inset ring-amber-300" : gap === "none" ? "bg-rose-50/50" : gap === "warn" ? "bg-amber-50/50" : "bg-white"}`}
                >
                  <FileDropHint show={fileDrop.over === `${s.shopId}:${v.id}`} label={t(`วางรูปเพื่ออัปโหลดเข้าสี ${v.label}`, `Drop images to upload to ${v.label}`)} />
                  <div className="flex items-center gap-2.5">
                    {v.erpImageKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={keyUrl(v.erpImageKey)} alt="" className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-100 shrink-0" />
                    )}
                    {/* ✏️ ชื่อสี ไทย / อังกฤษ + ราคา — แก้ที่ SKU ใน ERP (บันทึกด้วยปุ่ม 💾 แถบล่าง) */}
                    {(() => {
                      const d = draftOf(v);
                      const changed = !!skuDraft[v.id] && draftChanged(v, d);
                      const enTyped = d.colorEn.trim();
                      const enHint = !enTyped || THAI_RE.test(enTyped) ? (v.labelEn ? t(`เว็บ EN ตอนนี้: ${v.labelEn} (แปลจากทะเบียนสี)`, `EN site now: ${v.labelEn} (from the color registry)`) : t("ว่าง = เว็บ EN ใช้ชื่อไทย", "Empty = EN site uses the Thai name")) : "";
                      const box = "flex items-center border border-slate-200 rounded-lg bg-white focus-within:border-orange-400 focus-within:ring-1 focus-within:ring-orange-200";
                      const tag = "text-[10px] font-medium text-slate-400 pl-2 pr-1 shrink-0";
                      return (
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <label className={`${box} w-44 max-w-full`} title={t("ชื่อสีภาษาไทย (ช่อง สี (ไทย) ของ SKU) — เว็บหน้าไทยโชว์ชื่อนี้ · ว่าง = ใช้ชื่ออังกฤษ", "Thai color name (the SKU's Thai color field) — the Thai site shows this · empty = use the English name")}>
                              <span className={tag}>{t("ไทย", "TH")}</span>
                              <input
                                value={d.colorTh}
                                maxLength={80}
                                placeholder={v.colorEn || t("ชื่อสีไทย", "Thai color name")}
                                onChange={(e) => setDraft(v, { colorTh: e.target.value })}
                                aria-label={t(`ชื่อสีภาษาไทย ${v.code}`, `Thai color name ${v.code}`)}
                                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 py-1 pr-2 outline-none"
                              />
                            </label>
                            <label className={`${box} w-44 max-w-full`} title={t("ชื่อสีภาษาอังกฤษ (ช่อง Color ของ SKU) — เว็บหน้า /en โชว์ชื่อนี้ · เป็นภาษาไทย/ว่าง = แปลจากทะเบียนสีกลาง", "English color name (the SKU's Color field) — the /en site shows this · Thai/empty = translated from the color registry")}>
                              <span className={tag}>EN</span>
                              <input
                                value={d.colorEn}
                                maxLength={80}
                                placeholder={v.labelEn || "Color name"}
                                onChange={(e) => setDraft(v, { colorEn: e.target.value })}
                                aria-label={t(`ชื่อสีภาษาอังกฤษ ${v.code}`, `English color name ${v.code}`)}
                                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 py-1 pr-2 outline-none"
                              />
                            </label>
                            <label className={`${box} w-28 ${!(v.price > 0) && !d.price.trim() ? "!border-rose-300 !bg-rose-50/60" : ""}`} title={t("ราคาขายของ SKU นี้ (ราคากลาง ใช้ทุกช่องทาง)", "This SKU's selling price (central price, used on every channel)")}>
                              <span className={tag}>฿</span>
                              <MoneyInput
                                value={d.price}
                                onChange={(raw) => setDraft(v, { price: raw })}
                                placeholder={t("ราคา", "Price")}
                                className="min-w-0 w-full bg-transparent text-sm text-right text-slate-800 py-1 pr-2 outline-none tabular-nums"
                              />
                            </label>
                            {changed && (
                              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                                {t("● ยังไม่บันทึก", "● Unsaved")}
                                <button type="button" onClick={() => setSkuDraft((m) => { const n = { ...m }; delete n[v.id]; return n; })} className="text-slate-400 hover:text-slate-600 underline">
                                  {t("คืนค่าเดิม", "Revert")}
                                </button>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {v.code} ·{" "}
                            {v.qty === null ? (
                              <span title={t("ระบบยังไม่มียอดสต๊อกของ SKU นี้ — เว็บใช้ป้ายสถานะสินค้าที่ตั้งเอง", "No stock figure for this SKU yet — the site uses the stock status you set")}>{t("ยังไม่มีข้อมูลสต๊อก", "No stock data")}</span>
                            ) : v.qty <= 0 ? (
                              <span className="rounded-full bg-rose-50 border border-rose-200 px-1.5 text-rose-700" title={t("ยอดคงเหลือในระบบ = 0", "Stock on hand = 0")}>
                                {t("สต๊อกหมด", "Out of stock")}
                              </span>
                            ) : (
                              <>{t("สต๊อก", "Stock")} {v.qty.toLocaleString("th-TH")}</>
                            )}{" "}
                            {t(`· รูปใน SKU ${v.gallery.length}`, `· SKU images ${v.gallery.length}`)}
                            {!(v.price > 0) && <span className="text-rose-500">{t(" · ยังไม่มีราคา (เว็บใช้ราคารุ่นแทน)", " · no price (site uses the model price)")}</span>}
                            {enHint && <span className="text-slate-400"> · 🌐 {enHint}</span>}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => toggleCardColor(s, v.label)}
                        title={on ? t("โชว์เป็นจุดสีบนการ์ดสินค้า — กดเพื่อซ่อน", "Shown as a color dot on the product card — click to hide") : t("ไม่โชว์บนการ์ด — กดเพื่อโชว์", "Not shown on the card — click to show")}
                        className={`text-xs border rounded-lg px-1.5 py-1 ${on ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-300 line-through"}`}
                      >
                        🎴
                      </button>
                      <button
                        type="button"
                        onClick={() => setCardMain(s, v.label)}
                        title={isMain ? t("สีหลักของการ์ด — กดเพื่อยกเลิก", "Card's main color — click to unset") : t("ตั้งเป็นสีหลัก (รูปแรกบนการ์ดเป็นรูปสีนี้)", "Set as main color (first card image uses this color)")}
                        className={`text-base leading-none px-0.5 ${isMain ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                      >
                        ★
                      </button>
                      <button
                        onClick={() => setSkuPanel(panelOpen ? null : { shopId: s.shopId, skuId: v.id })}
                        disabled={!v.gallery.length}
                        title={v.gallery.length ? t("เลือกจากรูปที่อัปโหลดไว้ในหน้า SKU", "Pick from images uploaded on the SKU page") : t("SKU นี้ยังไม่มีรูป — อัปโหลดในหน้า SKU ก่อน", "This SKU has no images — upload on the SKU page first")}
                        className={`text-xs border rounded-lg px-2 py-1 disabled:opacity-40 ${panelOpen ? "bg-orange-500 border-orange-500 text-white" : "border-orange-300 text-orange-600 hover:bg-orange-50"}`}
                      >
                        {t("📷 จากรูป SKU", "📷 From SKU images")}
                      </button>
                      {/* 🎬 Hero ของสีนี้ (ลูกค้าเลือกสีนี้ = รูปเปิดเปลี่ยนเป็นภาพนี้) */}
                      <button
                        type="button"
                        onClick={() => setHeroPanel(heroOpen ? null : { shopId: s.shopId, skuId: v.id })}
                        title={skuHero ? t("สีนี้มี Hero ของตัวเอง — กดเพื่อแก้", "This color has its own hero — click to edit") : t("ตั้งรูปเปิดหน้าสินค้า (Hero) เฉพาะสีนี้ · ไม่ตั้ง = ใช้ Hero ของรุ่น", "Set a product page hero for this color only · not set = use the model's hero")}
                        className={`text-xs border rounded-lg px-2 py-1 ${heroOpen ? "bg-violet-600 border-violet-600 text-white" : skuHero ? "border-violet-300 bg-violet-50 text-violet-700" : "border-violet-200 text-violet-600 hover:bg-violet-50"}`}
                      >
                        🎬 Hero{skuHero ? " ✓" : ""}
                      </button>
                      {uploadBtn(s.shopId, v.id, "text-xs border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg px-2 py-1")}
                      <button onClick={() => setPicker({ shopId: s.shopId, target: v.id })} className="text-xs border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg px-2 py-1">
                        {t("🖼 จากคลัง", "🖼 From library")}
                      </button>
                      {chosen.length > 0 && (
                        <button onClick={() => setSkuImages(s, v.id, [])} className="text-xs text-rose-500 hover:underline">
                          {t("ล้าง", "Clear")}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ⬆ กำลังอัปรูปเข้าสีนี้ — ของกลาง UploadProgress (ย่อรูป → ตรวจรูปซ้ำ → อัปโหลด · รูปที่เท่าไร) */}
                  {uploadProgressFor(s.shopId, v.id) && <div className="pl-12">{uploadProgressFor(s.shopId, v.id)}</div>}

                  {/* รูปเว็บที่เลือกไว้ของสีนี้ (เรียงตามลำดับที่จะโชว์) */}
                  {chosen.length > 0 ? (
                    <SortableThumbs
                      className="pl-12"
                      keys={chosen}
                      onChange={(next) => setSkuImages(s, v.id, next)}
                      size="w-12 h-12"
                      badge={(i) => <span className="absolute -top-1.5 -left-1.5 text-[10px] bg-slate-700 text-white rounded px-1">{i + 1}</span>}
                      onAdd={chosen.length < MAX_SKU_IMAGES ? () => setPicker({ shopId: s.shopId, target: v.id }) : undefined}
                    />
                  ) : (
                    // 🖼 ยังไม่มีรูปบนเว็บ — ช่องเส้นประให้กดเลือกจากคลัง (ลากไฟล์มาวางทั้งแถวได้อยู่แล้ว)
                    <div className="pl-12">
                      <button
                        type="button"
                        onClick={() => setPicker({ shopId: s.shopId, target: v.id })}
                        className={`w-full flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed bg-white px-3 py-2.5 text-xs ${
                          gap === "none" ? "border-rose-300 text-rose-700 hover:bg-rose-50" : "border-amber-300 text-amber-800 hover:bg-amber-50"
                        }`}
                      >
                        <Icon name="image" size={16} />
                        <span>
                          {gap === "none" ? t("ยังไม่มีรูปบนเว็บ — SKU ก็ไม่มีรูป ลูกค้าเห็นช่องว่าง", "No web images — the SKU has none either, customers see a blank") : t("ยังไม่มีรูปบนเว็บ — ตอนนี้ลูกค้าเห็นรูปปก SKU 1 รูปแทน", "No web images — customers currently see 1 SKU cover image instead")} {t("· ลากรูปมาวาง หรือกดเลือกจากคลัง", "· drop images here or pick from library")}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* 🎬 แผง Hero ของสีนี้ — คอม 16:9 · มือถือ 4:5 (ว่าง = ใช้ของคอม) · รูปหรือวิดีโอ */}
                  {heroOpen && (
                    <div className="ml-12 rounded-lg border border-violet-200 bg-violet-50/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                        <span>
                          {t("🎬 Hero ของสี", "🎬 Hero for")} <b>{v.label}</b> {t("— ลูกค้าเลือกสีนี้ (หรือกดการ์ดสีนี้มา) รูปเปิดจะเป็นภาพนี้ · ว่าง = ใช้ Hero ของรุ่น", "— when a customer picks this color (or comes from its card) the hero shows this · empty = model hero")}
                        </span>
                        <button type="button" onClick={() => setHeroPanel(null)} className="text-slate-500 hover:underline shrink-0">
                          {t("ปิด", "Close")}
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MediaUploadField label={t("🖥 คอม (16:9)", "🖥 Desktop (16:9)")} hint={`${HERO_SIZE_HINT.desktop} · ${HERO_SIZE_HINT.video}`} value={skuHero?.desktop ?? null} onChange={(m) => setSkuHero(s, v.id, "desktop", m)} previewRatio="16 / 9" />
                        <MediaUploadField label={t("📱 มือถือ (4:5)", "📱 Mobile (4:5)")} hint={HERO_SIZE_HINT.mobile} value={skuHero?.mobile ?? null} onChange={(m) => setSkuHero(s, v.id, "mobile", m)} previewRatio="4 / 5" />
                      </div>
                    </div>
                  )}

                  {/* แผงแกลเลอรี SKU: กดรูปเพื่อเลือก/ยกเลิก */}
                  {panelOpen && (
                    <div className="ml-12 rounded-lg border border-orange-200 bg-orange-50/50 p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {t(`รูปในหน้า SKU ${v.code} — กดเพื่อเลือก (สูงสุด ${MAX_SKU_IMAGES} รูป · เลือกแล้ว ${chosen.length})`, `Images on SKU ${v.code} — click to pick (max ${MAX_SKU_IMAGES} · picked ${chosen.length})`)}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setSkuImages(s, v.id, v.gallery)} className="text-orange-600 hover:underline">
                            {t("เลือกทั้งหมด", "Select all")}
                          </button>
                          <button onClick={() => setSkuPanel(null)} className="text-slate-500 hover:underline">
                            {t("ปิด", "Close")}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {v.gallery.map((k) => {
                          const idx = chosen.indexOf(k);
                          const sel = idx >= 0;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setSkuImages(s, v.id, sel ? chosen.filter((x) => x !== k) : [...chosen, k])}
                              disabled={!sel && chosen.length >= MAX_SKU_IMAGES}
                              className={`relative rounded-lg overflow-hidden border-2 disabled:opacity-40 ${sel ? "border-orange-500" : "border-transparent hover:border-orange-300"}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={keyUrl(k)} alt="" className="w-14 h-14 object-cover" />
                              {sel && <span className="absolute top-0.5 left-0.5 text-[10px] bg-orange-500 text-white rounded px-1">{idx + 1}</span>}
                              {k === v.erpImageKey && <span className="absolute bottom-0 inset-x-0 text-[9px] bg-black/50 text-white text-center">{t("ปก SKU", "SKU cover")}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
    );
  };

  /* ───────── 🔤 ปั๊มชื่อ · แบนเนอร์ · รายละเอียด ───────── */
  const imageOptionsOf = (s: ShopState) =>
    [
      ...s.webImages.map((k, i) => ({ key: k, label: t(`รูปเว็บ ${i + 1}`, `Web image ${i + 1}`) })),
      ...data.variants.flatMap((v) => (s.webSkuImages[v.id] ?? v.gallery).map((k, i) => ({ key: k, label: t(`${v.label} · รูป ${i + 1}`, `${v.label} · image ${i + 1}`) }))),
    ].filter((o, i, arr) => arr.findIndex((x) => x.key === o.key) === i);
  const flip = (setter: typeof setPzOpen, sid: string) =>
    setter((prev) => {
      const n = new Set(prev);
      if (n.has(sid)) n.delete(sid);
      else n.add(sid);
      return n;
    });

  const renderExtra = (s: ShopState) => {
    const overrideCount = Object.keys(s.webDetails).length;
    const detailsShown = detailsOpen.has(s.shopId);
    const comps = data.compartments ?? null;
    const fitShown = fitOpen || (s.fitCheck && comps === null);
    return (
      <div className="space-y-3">
        {/* 🔗 สินค้าที่เกี่ยวข้องของรุ่นนี้ — ขึ้นก่อนตามกฎ "📌 เลือกเองรายรุ่น" (หน้าดีไซน์ → แท็บ 🔗 แนะนำสินค้า) · ว่าง = ใช้กฎกลาง */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-600">
              {t("🔗 สินค้าที่เกี่ยวข้องของรุ่นนี้", "🔗 Related products for this model")}
              {(s.webRelated ?? []).length > 0 && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5">{t(`เลือกไว้ ${(s.webRelated ?? []).length} รุ่น`, `${(s.webRelated ?? []).length} models picked`)}</span>}
            </span>
            <span className="text-[11px] text-slate-400">{t(`ขึ้นก่อนในหัวข้อ "สินค้าที่เกี่ยวข้อง" ของหน้าสินค้านี้ · ไม่เลือก = ใช้กฎกลาง (หน้าดีไซน์ → 🔗 แนะนำสินค้า)`, `Shown first under "Related products" on this product page · none picked = central rule (Design → 🔗 Product recommendations)`)}</span>
          </div>
          <WebsiteProductPicker
            shopSlug={s.slug}
            value={s.webRelated ?? []}
            max={12}
            onChange={(codes) => patchShop(s.shopId, { webRelated: codes.filter((c) => c.toUpperCase() !== data.code.toUpperCase()) })}
          />
        </div>

        {/* 🔎 SEO ของรุ่นนี้ — ชื่อ/คำอธิบายใน Google + ตอนแชร์ลิงก์ · ว่าง = ใช้ชื่อ/คำอธิบายสินค้า */}
        <div className="rounded-lg border border-slate-200 p-3 space-y-2" data-web-seo>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-600">{t("🔎 SEO ของรุ่นนี้ (Google · แชร์ลิงก์)", "🔎 SEO for this model (Google · link sharing)")}</span>
            <span className="text-[11px] text-slate-400">{t("ว่าง = ใช้ชื่อสินค้า/คำอธิบายบนเว็บตามเดิม · ชื่อไม่เกิน ~60 ตัว · คำอธิบาย ~150 ตัวกำลังดี", "Empty = use the web product name/description · title up to ~60 chars · description ~150 chars is ideal")}</span>
          </div>
          {(() => {
            const seo = s.webSeo ?? { title: "", description: "", title_en: "", description_en: "" };
            const set = (k: keyof typeof seo, v: string) => patchShop(s.shopId, { webSeo: { ...seo, [k]: v } });
            const cnt = (v: string, max: number) => <span className={`text-[10px] ${v.length > max ? "text-amber-600" : "text-slate-400"}`}>{v.length}/{max}</span>;
            return (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[11px] text-slate-500">{t("ชื่อใน Google", "Google title")} {cnt(seo.title, 60)}
                  <input value={seo.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder={s.display?.name ?? s.webName} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                </label>
                <label className="block text-[11px] text-slate-500">{t("ชื่อใน Google (อังกฤษ)", "Google title (English)")}
                  <input value={seo.title_en} maxLength={120} onChange={(e) => set("title_en", e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                </label>
                <label className="block text-[11px] text-slate-500">{t("คำอธิบายใน Google", "Google description")} {cnt(seo.description, 160)}
                  <textarea value={seo.description} maxLength={320} rows={2} onChange={(e) => set("description", e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                </label>
                <label className="block text-[11px] text-slate-500">{t("คำอธิบายใน Google (อังกฤษ)", "Google description (English)")}
                  <textarea value={seo.description_en} maxLength={320} rows={2} onChange={(e) => set("description_en", e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                </label>
              </div>
            );
          })()}
        </div>

        {/* 📐 ช่องใส่ของ (ขนาดด้านใน) — ของตัวสินค้า ทุกร้านใช้ร่วม · คำนวณว่าใส่ตุ๊กตา/ของอะไรได้ (lib/fit-check) */}
        <div className="rounded-lg border border-slate-200" data-fit-section>
          <button type="button" onClick={() => setFitOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className="text-xs font-medium text-slate-600">
              {t("📐 ช่องใส่ของ (ใส่ตุ๊กตา/ของได้ไหม)", "📐 Compartments (what fits inside)")}
              {comps === null ? (
                <span className={`ml-2 text-[10px] rounded-full px-1.5 py-0.5 ${s.fitCheck ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{t("ยังไม่ได้วัด", "Not measured")}</span>
              ) : comps.length ? (
                <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5">{t(`${comps.length} ช่อง`, `${comps.length} compartments`)}</span>
              ) : (
                <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{t("ไม่มีช่อง", "No compartments")}</span>
              )}
            </span>
            <span className="text-xs text-slate-400">{fitShown ? t("▴ ซ่อน", "▴ Hide") : t("▾ ตั้งค่า", "▾ Settings")}</span>
          </button>
          {fitShown && (
            <div className="border-t border-slate-100 p-3">
              {!s.fitCheck && <p className="text-[11px] text-slate-400 mb-2">{t(`ร้านนี้ยังไม่เปิด "เช็คขนาด" (ข้อมูลร้าน → 📐) — วัดเก็บไว้ก่อนได้`, `This shop hasn't turned on "Fit check" (Shop info → 📐) — you can measure ahead of time`)}</p>}
              <CompartmentsEditor value={comps} parentId={parentId} outer={data.outer ?? null} onSaved={() => void load(true)} />
            </div>
          )}
        </div>

        {/* 🖨 ลายรีดบนกระเป๋า (DTF/UV) — ลูกค้าเลือกลาย/อัปรูป วางบนส่วนที่พิมพ์ได้ */}
        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => flip(setPrOpen, s.shopId)} className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className="text-xs font-medium text-slate-600">
              {t("🖨 ลายรีดบนกระเป๋า (DTF/UV)", "🖨 Bag print transfer (DTF/UV)")}
              {s.webPrint?.enabled && (
                <span className={`ml-2 text-[10px] rounded-full px-1.5 py-0.5 ${printDesignUsable(s.webPrint) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                  {printDesignUsable(s.webPrint) ? t(`เปิดอยู่ · ${s.webPrint.method} · ${s.webPrint.zones.length} ส่วน`, `On · ${s.webPrint.method} · ${s.webPrint.zones.length} zones`) : t("เปิดแต่ยังตั้งค่าไม่ครบ", "On but not fully set up")}
                </span>
              )}
            </span>
            <span className="text-xs text-slate-400">{prOpen.has(s.shopId) ? t("▴ ซ่อน", "▴ Hide") : t("▾ ตั้งค่า", "▾ Settings")}</span>
          </button>
          {prOpen.has(s.shopId) && (
            <div className="border-t border-slate-100 p-3">
              <PrintDesignEditor
                value={s.webPrint ?? DEFAULT_PRINT_DESIGN}
                onChange={(next) => patchShop(s.shopId, { webPrint: next })}
                imageOptions={imageOptionsOf(s)}
                fallbackImageKey={s.webImages[0] ?? data.variants[0]?.erpImageKey ?? null}
              />
              <p className="text-[11px] text-slate-400 mt-2">
                {t(`ลูกค้าเห็นกล่อง "ออกแบบลายเอง" ในหน้าสินค้า · ออเดอร์ที่มีรูปอัปเองเข้าคิว 🖨 รอตรวจลาย ในแท็บออเดอร์ · กด "บันทึก" ด้านล่างเพื่อใช้งาน`, `Customers see a "Design your own" box on the product page · orders with uploaded images go to the 🖨 print review queue in the Orders tab · click "Save" below to turn it on`)}
              </p>
            </div>
          )}
        </div>

        {/* 🔤 ปั๊มชื่อ (Personalize) — ตั้งตำแหน่ง/ขนาด/แบบ ต่อรุ่น */}
        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => flip(setPzOpen, s.shopId)} className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className="text-xs font-medium text-slate-600">
              {t("🔤 ปั๊มชื่อ (Personalize)", "🔤 Name stamping (Personalize)")}
              {s.webPersonalize?.enabled && (
                <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5">{t(`เปิดอยู่ · ${s.webPersonalize.positions.filter((p) => p.enabled).length} ตำแหน่ง`, `On · ${s.webPersonalize.positions.filter((p) => p.enabled).length} positions`)}</span>
              )}
            </span>
            <span className="text-xs text-slate-400">{pzOpen.has(s.shopId) ? t("▴ ซ่อน", "▴ Hide") : t("▾ ตั้งค่า", "▾ Settings")}</span>
          </button>
          {pzOpen.has(s.shopId) && (
            <div className="border-t border-slate-100 p-3">
              <PersonalizeEditor
                value={s.webPersonalize ?? DEFAULT_PERSONALIZE}
                onChange={(next) => patchShop(s.shopId, { webPersonalize: next })}
                imageOptions={imageOptionsOf(s)}
                fallbackImageKey={s.webImages[0] ?? data.variants[0]?.erpImageKey ?? null}
                // 🎨 สีของรุ่น (ค่าแยกตามสี) — รูป = รูปเว็บรายสีที่เลือกไว้ / แกลเลอรี / ปก SKU (ลำดับเดียวกับที่เว็บใช้ตอนเลือกสี)
                colors={data.variants.map((v) => ({ id: v.id, label: v.label || v.code, imageKey: s.webSkuImages[v.id]?.[0] ?? v.gallery[0] ?? v.erpImageKey, images: s.webSkuImages[v.id] ?? v.gallery }))}
              />
              <p className="text-[11px] text-slate-400 mt-2">
                {t(`ลูกค้าจะพิมพ์ข้อความ เลือกแบบ และเลือกตำแหน่งได้ในหน้าสินค้า (ชิ้นส่วน "ปั๊มชื่อ" ในส่วนราคา-ตะกร้า) และในบล็อก "ปั๊มชื่อ" ของตัวจัดหน้า · กด "บันทึก" ด้านล่างเพื่อใช้งาน`, `Customers type text, pick a style and position on the product page (the "Name stamping" part in the price/cart area) and in the page builder's "Name stamping" block · click "Save" below to turn it on`)}
              </p>
            </div>
          )}
        </div>

        {/* 🖼 แบนเนอร์หน้าสินค้า (หลายรูป) — ทับแบนเนอร์กลางของธีมเฉพาะรุ่นนี้ */}
        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => flip(setBnOpen, s.shopId)} className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className="text-xs font-medium text-slate-600">
              {t("🖼 แบนเนอร์หน้าสินค้า", "🖼 Product page banners")}
              {s.webBanners.length > 0 && <span className="ml-2 text-[10px] bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5">{t(`${s.webBanners.length} แบนเนอร์`, `${s.webBanners.length} banners`)}</span>}
            </span>
            <span className="text-xs text-slate-400">{bnOpen.has(s.shopId) ? t("▴ ซ่อน", "▴ Hide") : t("▾ ตั้งค่า", "▾ Settings")}</span>
          </button>
          {bnOpen.has(s.shopId) && (
            <div className="border-t border-slate-100 p-3 space-y-2">
              <p className="text-[11px] text-slate-500">
                {t("ไม่ตั้ง = ใช้แบนเนอร์กลางของธีม (ดีไซน์ → หน้าสินค้า → ⚙️ แบนเนอร์) · ตั้งแล้วจะโชว์ตามลำดับนี้แทน หลายรูปได้ แต่ละรูปเลือกครึ่งจอ/เต็มจอ ตำแหน่งข้อความ ฟิลด์ และค่ามือถือแยก", "Not set = theme's central banners (Design → Product page → ⚙️ Banners) · once set, these show in this order instead · several allowed, each with half/full width, text position, fields and separate mobile settings")}
              </p>
              <ProductBannersEditor
                banners={s.webBanners}
                onChange={(webBanners) => patchShop(s.shopId, { webBanners })}
                imageOptions={imageOptionsOf(s)}
                fields={data.webFields ?? []}
                onPickFromLibrary={(id) => setPicker({ shopId: s.shopId, target: `banner:${id}` })}
              />
            </div>
          )}
        </div>

        {/* 📋 จับคู่รายละเอียดหน้าเว็บ (ทับชุดรายละเอียดของธีมเฉพาะรุ่นนี้) */}
        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => flip(setDetailsOpen, s.shopId)} className="w-full flex items-center justify-between px-3 py-2 text-left">
            <span className="text-xs font-medium text-slate-600">
              {t("📋 จับคู่รายละเอียดหน้าเว็บ", "📋 Web detail mapping")}
              {overrideCount > 0 && <span className="ml-2 text-[10px] bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5">{t(`ปรับไว้ ${overrideCount} หัวข้อ`, `${overrideCount} sections adjusted`)}</span>}
            </span>
            <span className="text-xs text-slate-400">{detailsShown ? t("▴ ซ่อน", "▴ Hide") : t("▾ ตั้งค่า", "▾ Settings")}</span>
          </button>
          {detailsShown && (
            <div className="border-t border-slate-100 p-3 space-y-2">
              <p className="text-[11px] text-slate-500">
                {t(`หัวข้อมาจาก "ชุดรายละเอียดสินค้า" ของธีม (ดีไซน์ → หน้าสินค้า) — ตั้งเฉพาะรุ่นนี้ว่าจะโชว์/ซ่อน หรือใส่ข้อความเฉพาะรุ่นแทนเนื้อหากลาง ·`, `Sections come from the theme's "Product detail set" (Design → Product page) — set show/hide for this model only, or enter model-specific text instead of the central content ·`)}{" "}
                <a href={`/website/${s.slug}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {t("แก้ชุดรายละเอียดกลาง ↗", "Edit central detail set ↗")}
                </a>
              </p>
              {s.detailItems.length === 0 && <div className="text-xs text-slate-400">{t("ธีมร้านนี้ยังไม่มีหัวข้อรายละเอียด", "This shop's theme has no detail sections yet")}</div>}
              {s.detailItems.map((it) => {
                const ov = s.webDetails[it.id];
                const mode: "default" | "show" | "hide" = ov?.show === true ? "show" : ov?.show === false ? "hide" : "default";
                return (
                  <div key={it.id} className="rounded-lg bg-slate-50 p-2 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 truncate">{it.label}</div>
                        <div className="text-[11px] text-slate-400">
                          {SOURCE_LABEL[it.source] ?? it.source} · {t("ค่ากลาง:", "Default:")} {it.defaultLabel}
                        </div>
                      </div>
                      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs shrink-0">
                        {(
                          [
                            ["default", t("ตามค่ากลาง", "Default")],
                            ["show", t("โชว์", "Show")],
                            ["hide", t("ซ่อน", "Hide")],
                          ] as const
                        ).map(([m, label]) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setDetail(s, it.id, m === "default" ? { show: undefined } : { show: m === "show" })}
                            className={`px-2.5 py-1 ${mode === m ? (m === "hide" ? "bg-rose-500 text-white" : m === "show" ? "bg-emerald-500 text-white" : "bg-slate-600 text-white") : "bg-white text-slate-600 hover:bg-slate-100"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {mode !== "hide" && (
                      <textarea
                        value={ov?.text ?? ""}
                        rows={ov?.text ? 3 : 1}
                        onChange={(e) => setDetail(s, it.id, { text: e.target.value })}
                        placeholder={t("ข้อความเฉพาะรุ่นนี้ (ว่าง = ใช้เนื้อหาจากแหล่งข้อมูลกลาง)", "Text for this model only (empty = use central content)")}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ───────── ⚠️ ต้องแก้ ───────── */
  const renderFix = (s: ShopState) =>
    s.issues.length === 0 ? (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-sm text-emerald-700 text-center">{t("✅ ข้อมูลบนเว็บครบแล้ว", "✅ Web data is complete")}</div>
    ) : (
      <div className="space-y-2">
        {s.issues.map((x) => (
          <div key={x.key} className="flex items-center gap-2 flex-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-amber-900">⚠️ {x.label}</p>
              {x.detail && <p className="text-[11px] text-amber-700 truncate" title={x.detail}>{x.detail}</p>}
            </div>
            {x.key === "swatch_missing" ? (
              <ColorSwatchButton label={t("🎨 ผูกจุดสี", "🎨 Link color dots")} focusNames={x.names ?? x.detail?.split(", ")} className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-100" />
            ) : (
              <button type="button" onClick={() => setTab(s.shopId, FIX_TAB[x.key])} className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-amber-800 hover:bg-amber-100">
                {t("ไปแก้ →", "Fix →")}
              </button>
            )}
          </div>
        ))}
        <p className="text-[11px] text-slate-400">{t("รายการนี้อัปเดตหลังกด 💾 บันทึก", "This list updates after you click 💾 Save")}</p>
      </div>
    );

  /* ───────── แท็บต่อร้าน ───────── */
  const TABS: { k: Tab; l: (s: ShopState) => string }[] = [
    { k: "sell", l: () => t("🛒 ขายบนเว็บ", "🛒 Sell on web") },
    { k: "detail", l: () => t("📝 รายละเอียดบนเว็บ", "📝 Web details") },
    { k: "extra", l: () => t("🔤 ปั๊มชื่อ · แบนเนอร์ · รายละเอียด · 🔗 เกี่ยวข้อง", "🔤 Name stamping · Banners · Details · 🔗 Related") },
    { k: "fix", l: (s) => (s.issues.length ? t(`⚠️ ต้องแก้ (${s.issues.length})`, `⚠️ Needs fixing (${s.issues.length})`) : t("✅ ครบแล้ว", "✅ Complete")) },
  ];
  const renderBody = (s: ShopState) => {
    const cur = tabFor(s.shopId);
    return (
      <div>
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-3 -mx-0.5 px-0.5" role="tablist">
          {TABS.map((x) => {
            const on = cur === x.k;
            const warn = x.k === "fix" && s.issues.length > 0;
            return (
              <button
                key={x.k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(s.shopId, x.k)}
                className={`shrink-0 px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap ${on ? "border-orange-500 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"} ${warn && !on ? "text-amber-700" : ""}`}
              >
                {x.l(s)}
              </button>
            );
          })}
        </div>
        {cur === "sell" && renderSell(s)}
        {cur === "detail" && renderDetail(s)}
        {cur === "extra" && renderExtra(s)}
        {cur === "fix" && renderFix(s)}

        {/* อยู่ในหน้าต่าง (drawer) = ปุ่มบันทึกอยู่แถบล่างแล้ว · เปิดนอก drawer = ปุ่มในกล่องตามเดิม */}
        <div className="mt-3">
          {inFooter ? (
            (dirtyShops.some((d) => d.shopId === s.shopId) || dirtySkus.length > 0) && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">{t("มีการแก้ไขที่ยังไม่บันทึก — กด 💾 บันทึก ที่แถบล่าง", "Unsaved changes — click 💾 Save in the bottom bar")}</div>
            )
          ) : (
            <button
              onClick={() => void saveOne(s)}
              disabled={savingShop === s.shopId || savingSkus}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm rounded-lg px-5 py-2"
            >
              {savingShop === s.shopId || savingSkus ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}
            </button>
          )}
        </div>
      </div>
    );
  };

  const focus = shopId ? visibleShops[0] : null;

  return (
    <div className="space-y-4" {...fileDrop.guard}>
      {shopId ? (
        // ✳️ เฉพาะร้านเดียว (drawer หน้า "สินค้าบนเว็บ") — หัว/ปุ่มลิงก์อยู่ที่ drawer แล้ว
        !focus ? (
          <div className="text-sm text-slate-400 py-8 text-center">{t("ไม่พบร้านนี้", "Shop not found")}</div>
        ) : !focus.listed ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center space-y-2">
            <p className="text-sm text-slate-500">{t(`รุ่นนี้ยังไม่อยู่ในร้าน ${focus.shopName}`, `This model isn't in ${focus.shopName} yet`)}</p>
            <button onClick={() => addToShop(focus.shopId)} disabled={savingShop === focus.shopId} className="text-sm border border-orange-300 text-orange-600 hover:bg-orange-50 rounded-lg px-3 py-1.5">
              {savingShop === focus.shopId ? t("กำลังเพิ่ม…", "Adding…") : t(`+ เพิ่มเข้าร้าน ${focus.shopName}`, `+ Add to ${focus.shopName}`)}
            </button>
          </div>
        ) : (
          renderBody(focus)
        )
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-slate-500">{t("ตั้งค่าการขายบนเว็บร้านออนไลน์ — เว้นว่าง = ใช้ชื่อ/รูป/คำอธิบายจาก ERP อัตโนมัติ · ชุดเดียวกับหน้า เว็บไซต์ → สินค้าบนเว็บ", "Online shop selling settings — leave empty = use ERP name/images/description automatically · same as Website → Web products")}</p>
            <a href={data.adminUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
              {t("หลังบ้านร้าน (จัดการรวม) ↗", "Shop admin (manage all) ↗")}
            </a>
          </div>

          {/* ร้านที่ยังไม่ขายรุ่นนี้ — รวมเป็นแถวเดียว กดเพิ่มทีละร้าน */}
          {data.shops.some((s) => !s.listed) && (
            <div className="flex items-center gap-2 flex-wrap rounded-xl border border-dashed border-slate-300 px-3 py-2">
              <span className="text-xs text-slate-500">{t("ยังไม่ขายใน:", "Not sold in:")}</span>
              {data.shops
                .filter((s) => !s.listed)
                .map((s) => (
                  <button
                    key={s.shopId}
                    onClick={() => addToShop(s.shopId)}
                    disabled={savingShop === s.shopId}
                    title={t(`เพิ่มรุ่นนี้เข้าร้าน ${s.shopName} (ยังปิดอยู่ จนกว่าจะเปิด "ขึ้นเว็บ")`, `Add this model to ${s.shopName} (stays hidden until you turn on "Live")`)}
                    className="text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-60 rounded-full px-2.5 py-1"
                  >
                    {savingShop === s.shopId ? t("กำลังเพิ่ม…", "Adding…") : `+ ${s.shopName}`}
                    {s.isDefault && <span className="text-[10px] text-slate-400 ml-1">{t("ร้านหลัก", "Main shop")}</span>}
                  </button>
                ))}
            </div>
          )}

          {data.shops
            .filter((s) => s.listed)
            .map((s) => (
              // overflow-clip (ไม่ใช่ hidden) — ตัดมุมโค้งได้เหมือนเดิม แต่ไม่ทำให้ของ sticky ข้างใน (รูปพรีวิวปั๊มชื่อ) เลื่อนหลุด
              <div key={s.shopId} className="rounded-xl border border-slate-200 overflow-clip">
                {/* หัวการ์ด: ชื่อร้าน + สถานะ + ยอดขาย + ลิงก์ (สวิตช์ขึ้นเว็บ/แนะนำ อยู่ในแท็บ ขายบนเว็บ) */}
                <div className="flex items-center gap-x-2 gap-y-1 bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{s.shopName}</span>
                  {s.isDefault && <span className="text-[11px] text-slate-400">{t("(ร้านหลัก)", "(main shop)")}</span>}
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${s.published ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{s.published ? t("ขึ้นเว็บ", "Live") : t("ซ่อนอยู่", "Hidden")}</span>
                  {s.featured && <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">{t("★ แนะนำ", "★ Featured")}</span>}
                  {s.issues.length > 0 && <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800">{t(`⚠️ ต้องแก้ ${s.issues.length}`, `⚠️ Needs fixing ${s.issues.length}`)}</span>}
                  <span className="text-[11px] text-slate-400 ml-auto">{t(`ขายผ่านเว็บ ${s.soldQty} ชิ้น`, `Sold on web: ${s.soldQty} pcs`)}</span>
                  {s.published && s.productUrl && (
                    <>
                      <a href={s.productUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                        {t("ดูหน้าเว็บ ↗", "View page ↗")}
                      </a>
                      <CopyButton value={s.productUrl} label={t("คัดลอกลิงก์", "Copy link")} title={t("คัดลอกลิงก์หน้าสินค้านี้", "Copy this product page link")} className="!py-0.5" />
                    </>
                  )}
                </div>
                <div className="p-3">{renderBody(s)}</div>
              </div>
            ))}
        </>
      )}

      <AssetPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onSelect={onPickImages}
        multiple={!picker?.target.startsWith("banner:")}
        typeFilter="image"
        title={picker?.target === "gallery" ? t("เลือกรูปสินค้าบนเว็บ", "Pick web product images") : picker?.target.startsWith("banner:") ? t("เลือกรูปแบนเนอร์", "Pick a banner image") : t("เลือกรูปเว็บของสีนี้ (เลือกได้หลายรูป)", "Pick web images for this color (multiple)")}
      />
      {/* ช่องเลือกไฟล์ตัวเดียว ใช้ร่วมทุกปุ่ม ⬆ อัปโหลด (รู้เป้าหมายจาก uploadTo) */}
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onUploadFiles(e.target.files)} />
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
      <button type="button" role="switch" aria-checked={on} onClick={onClick} className={`relative w-8 h-5 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-3" : ""}`} />
      </button>
      {label}
    </label>
  );
}

/** แถวใต้ช่อง "ว่าง = ใช้ค่าอัตโนมัติ" (ชื่อ / คำอธิบายบนเว็บ) — ว่าง: ปุ่มเติมค่าอัตโนมัติลงช่องแล้วแก้ต่อ · พิมพ์เอง: เตือน + ปุ่มกลับเป็นอัตโนมัติ */
function AutoValueRow({
  custom,
  autoText,
  emptyNote,
  customNote,
  useLabel,
  useTitle,
  resetTitle,
  onUse,
  onReset,
}: {
  custom: boolean;
  autoText: string;
  emptyNote: ReactNode;
  customNote: string;
  useLabel: string;
  useTitle: string;
  resetTitle: string;
  onUse: () => void;
  onReset: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 min-w-0">
      <span className="truncate flex-1 min-w-0" title={custom ? undefined : autoText}>
        {custom ? (
          <>
            <Icon name="warning" className="mr-1 align-[-2px]" />
            {customNote}
          </>
        ) : (
          emptyNote
        )}
      </span>
      {custom ? (
        <button type="button" onClick={onReset} className="shrink-0 rounded-md border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50" title={resetTitle}>
          <Icon name="back" className="mr-1 align-[-2px]" />
          {t("กลับเป็นอัตโนมัติ", "Back to auto")}
        </button>
      ) : (
        autoText && (
          <button type="button" onClick={onUse} className="shrink-0 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-blue-700 hover:bg-blue-100" title={useTitle}>
            <Icon name="download" className="mr-1 align-[-2px]" />
            {useLabel}
          </button>
        )
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, textarea, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean; rows?: number }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={inputCls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
      )}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        placeholder="—"
        onChange={(e) => {
          const t = e.target.value.trim();
          const n = t === "" ? null : Number(t);
          if (n !== null && (isNaN(n) || n < 0)) return;
          onChange(n);
        }}
        className={`${inputCls} text-right`}
      />
    </label>
  );
}

/** ตัวเลือกกรอกเอง "1.5 มม., 2.0 มม." — เก็บข้อความระหว่างพิมพ์ แล้วแปลงเป็นรายการตอนออกจากช่อง */
function ItemsInput({ value, onCommit }: { value: WebOptions; onCommit: (items: OptionItem[]) => void }) {
  const t = useT();
  const [txt, setTxt] = useState<string | null>(null);
  const shown = (value?.items ?? []).map((i) => i.label).join(", ");
  return (
    <input
      value={txt ?? shown}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        if (txt != null)
          onCommit(
            txt
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 24)
              .map((label, i) => ({ id: `opt-${i + 1}`, label }))
          );
        setTxt(null);
      }}
      placeholder={t("1.5 มม., 2.0 มม., 3.0 มม.", "1.5 mm, 2.0 mm, 3.0 mm")}
      className={inputCls}
    />
  );
}

/** 🔗 ข้อมูลที่เชื่อม — หน้าเว็บดึงอะไรมาจากไหน + ค่าตอนนี้ · ช่องที่ว่างไปเติมที่ Parent SKU (ข้อมูลจาก lib/website-listing-linked) */
function LinkedPanel({ rows, onOpenParent }: { rows: LinkedRow[]; onOpenParent?: () => void }) {
  const t = useT();
  const missing = rows.flatMap((r) => r.missing ?? []);
  const uniqMissing = [...new Set(missing)];
  const tone: Record<LinkedRow["status"], string> = { ok: "text-emerald-700", empty: "text-rose-600", override: "text-blue-700", hidden: "text-slate-400", none: "text-amber-700" };
  return (
    <details className="rounded-lg border border-slate-200 bg-white px-3 py-2" open={uniqMissing.length > 0}>
      <summary className="cursor-pointer text-xs text-slate-600">
        {t("🔗 ข้อมูลที่เชื่อม — หน้าเว็บดึงอะไรมาจากไหน", "🔗 Linked data — where the web page gets each value")}
        {uniqMissing.length > 0 ? <span className="ml-1.5 text-rose-600">{t(`· ว่าง ${uniqMissing.length} ช่อง`, `· ${uniqMissing.length} empty`)}</span> : <span className="ml-1.5 text-emerald-700">{t("· ครบ", "· complete")}</span>}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-slate-400">
              <th className="py-1 pr-2 font-normal">{t("บนเว็บ", "On web")}</th>
              <th className="py-1 pr-2 font-normal">{t("ดึงจาก (Parent SKU)", "Source (Parent SKU)")}</th>
              <th className="py-1 font-normal">{t("ค่าตอนนี้", "Current value")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2 text-slate-700 whitespace-nowrap">{r.label}</td>
                <td className="py-1.5 pr-2 text-slate-500">{r.from}</td>
                <td className={`py-1.5 ${tone[r.status]}`}>
                  {r.value}
                  {r.missing?.length ? <span className="block text-[11px] text-rose-600">{t("ว่าง:", "Empty:")} {r.missing.join(" · ")}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        {uniqMissing.length > 0 && (onOpenParent ? (
          <button type="button" onClick={onOpenParent} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:border-slate-500">
            {t(`📦 ไปเติมที่ Parent SKU (${uniqMissing.length} ช่องว่าง)`, `📦 Fill in on the Parent SKU (${uniqMissing.length} empty)`)}
          </button>
        ) : (
          <span>{t("เติมช่องที่ว่างได้ที่แท็บข้อมูลของ Parent SKU นี้", "Fill empty fields in this Parent SKU's data tab")}</span>
        ))}
        <span>{t("สีฟ้า = พิมพ์ทับบนเว็บ · สีส้ม = ไม่มีแหล่งข้อมูล · เปลี่ยนแหล่งข้อมูลได้ที่ เว็บไซต์ → ⚙️ จับคู่ฟิลด์ / 🎨 ดีไซน์ → หน้าสินค้า", "Blue = overridden on web · orange = no source · change sources in Website → ⚙️ Field mapping / 🎨 Design → Product page")}</span>
      </div>
    </details>
  );
}

/**
 * แถวรูปย่อ — กดค้างที่รูปแล้วลากไปวางบนรูปอื่น = สลับตำแหน่ง (ของกลาง useDragReorder · เมาส์/นิ้วได้)
 * + ‹ › เลื่อนทีละช่อง · ✕ เอาออก · รูปแรก = กรอบส้ม (รูปที่โชว์ก่อน) · onAdd = ช่อง + ท้ายแถว (เพิ่มรูป)
 */
function SortableThumbs({ keys, onChange, size, badge, className = "", onAdd }: { keys: string[]; onChange: (next: string[]) => void; size: string; badge: (i: number) => ReactNode; className?: string; onAdd?: () => void }) {
  const t = useT();
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => onChange(moveItem(keys, from, to)));
  // ปุ่มบนรูปไม่เริ่มลาก (คลิกได้ตามปกติ)
  const noDrag = { onPointerDown: (e: ReactPointerEvent) => e.stopPropagation() };
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {keys.map((k, i) => (
        <div
          key={`${k}-${i}`}
          {...rowProps(i)}
          {...handleProps(i)}
          onDragStart={(e) => e.preventDefault()}
          title={t("กดค้างแล้วลากไปวางบนรูปอื่น เพื่อสลับตำแหน่ง", "Press and drag onto another image to swap positions")}
          className={`relative group rounded-lg cursor-grab active:cursor-grabbing select-none ${rowCls(i)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={keyUrl(k)} alt="" draggable={false} className={`${size} object-cover rounded-lg border ${i === 0 ? "border-orange-400 ring-1 ring-orange-300" : "border-slate-200"}`} />
          {badge(i)}
          {i > 0 && (
            <button type="button" {...noDrag} title={t("เลื่อนไปซ้าย", "Move left")} onClick={() => onChange(moveItem(keys, i, i - 1))} className="absolute bottom-0 left-0 bg-white/90 text-slate-700 rounded text-[10px] px-1 opacity-0 group-hover:opacity-100">
              ‹
            </button>
          )}
          {i < keys.length - 1 && (
            <button type="button" {...noDrag} title={t("เลื่อนไปขวา", "Move right")} onClick={() => onChange(moveItem(keys, i, i + 1))} className="absolute bottom-0 right-0 bg-white/90 text-slate-700 rounded text-[10px] px-1 opacity-0 group-hover:opacity-100">
              ›
            </button>
          )}
          <button type="button" {...noDrag} title={t("เอาออก", "Remove")} onClick={() => onChange(keys.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full w-4 h-4 text-[10px] leading-none opacity-0 group-hover:opacity-100">
            ✕
          </button>
        </div>
      ))}
      {onAdd && (
        <button type="button" onClick={onAdd} title={t("เพิ่มรูป (เลือกจากคลัง)", "Add image (from library)")} aria-label={t("เพิ่มรูป", "Add image")}
 className={`${size} rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-600 flex items-center justify-center`}>
          <Icon name="add" size={16} />
        </button>
      )}
    </div>
  );
}
