"use client";

/**
 * WebsiteListingsPanel — แท็บ "สินค้าบนเว็บ" ของหน้าจัดการเว็บร้าน (/website/<slug>)
 * --------------------------------------------------------------------------
 * - ตัวกรองบน: ทั้งหมด · ขึ้นเว็บ · ซ่อนอยู่ · แนะนำ · ⚠️ ต้องแก้ (นับจากกฎกลาง lib/website-listing-health)
 * - 📄 แบ่งหน้า (2026-11-10) ด้วย Pager ของกลาง 25/50/100/200 ต่อหน้า (จำต่อคน) — ตัวกรอง/ตัวเลข/พิมพ์ยังคิดทุกรุ่น · ติ๊กจำข้ามหน้า · ลากเรียงได้ในหน้าเดียวกัน · เปิด/ซ่อนเกิน 20 รุ่นถามก่อน (100+ พิมพ์ CONFIRM)
 * - 🙈 สวิตช์ "ซ่อนรายการที่ไม่ขึ้นเว็บ" (2026-11-11 · ค่าเริ่มเปิด · จำต่อคน useViewPref website_listings_hide_off) — ไม่โชว์/ไม่นับในชิปต้องแก้-รูป-แนะนำ/ไม่อยู่ในเช็กลิสต์ · ชิป "ซ่อนอยู่" ยังดูได้
 * - ค้นหา (ชื่อ/รหัส) + เลือกหมวด + สลับมุมมอง รายการ/การ์ด/🗂 จัดหมวด (จำต่อคนด้วย useViewPref)
 * - 🗂 จัดหมวด = components/website-category-sorter (ขั้น 1 ใส่หมวดหลักจากหมวด ERP · ขั้น 2 กระดานจัดหมวดย่อย) — ทั้งร้าน ไม่สนตัวกรอง
 * - แถว: ชื่อ/ราคา/รูป/จุดสี "ที่ลูกค้าเห็นจริง" (API ส่ง display) · ป้ายรูปเปิด · ป้ายเตือนข้อมูลไม่ครบ
 * - 📸 ลงรูปทีละมาก (หัวตาราง = ทั้งร้าน · แถบล่าง = เฉพาะที่ติ๊ก · แถบเหลืองตอนกรองรูปบนเว็บ = รุ่นที่กรองอยู่ · ลากโฟลเดอร์วางบนแถว = รุ่นนั้น) → components/website-image-mass-upload
 * - ▦ แก้ไขทีละมาก (ตาราง · ทุกช่องจากทะเบียนฟิลด์ · หัวตาราง/แถบล่าง) → components/website-listings-grid-edit
 * - 🎨 ทะเบียนสี (หัวตาราง) + ป้าย "สียังไม่ผูกทะเบียนสี" กดได้ = ColorSwatchButton (focusNames = สีของสินค้านั้น) · ปิดแล้วโหลดรายการใหม่เงียบ ๆ
 * - ติ๊กหลายรายการ → แถบล่าง (BulkActionBar) ขึ้นเว็บ/ซ่อน/แนะนำ + ✏️ แก้หลายรายการ (ช่องจากทะเบียนกลาง lib/website-listing-fields) · ลาก ⠿ เรียงลำดับบนเว็บ (useDragReorder)
 * - ↕ เรียงในตาราง (รหัส SKU / สถานะ / ราคา) — กดหัวคอลัมน์ (SortButton) หรือช่อง "เรียง:" · ดูอย่างเดียว ไม่แตะลำดับบนเว็บ · เรียงอยู่ = ลาก ⠿ ไม่ได้
 * - ▸ ขยาย SKU ย่อยใต้แถว (โหลดตอนกด · /api/website/listings/grid?parentIds= ตัวกลางทะเบียนฟิลด์) · กดแถว SKU = drawer เลื่อนไปแถว SKU นั้น (focusSkuId)
 * - กดการ์ด/ชื่อ/รูป/✏️ = drawer "ตั้งค่าเว็บของสินค้า" — ของกลางตัวเดียวกับแท็บ 🛍 ใน Parent SKU (ParentWebListings shopId)
 *     แท็บ ขายบนเว็บ · รูป สี และรูปเปิด · ปั๊มชื่อ/แบนเนอร์/รายละเอียด · ต้องแก้ · ◀ ▶ เลื่อนตามรายการที่เห็น · 💾 บันทึกแถบล่าง
 * - 📦 เปิด Parent SKU = MasterRecordDrawer ตัวจริง (ทุกแท็บ · ◀ ▶ เลื่อนตามรายการที่เห็น · ปิดแล้วกลับมาที่ drawer เว็บ)
 * ของกลาง: BulkActionBar · useDragReorder/DragHandle · CopyButton · Drawer/ConfirmDialog · footer-save · ParentWebListings
 * ข้อมูล: /api/website/listings (guardApi products.view/edit + audit) — โหลดที่ manager-client แล้วส่งเข้ามา
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Drawer, ConfirmDialog } from "@/components/modal";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { Pager } from "@/components/pager";
import { ToggleSwitch } from "@/components/toggle-switch";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { SortButton, sortRows, type SortState } from "@/components/sort-th";
import { CopyButton } from "@/components/copy-button";
import { FooterSaveProvider, FooterSaveButton, useFooterSaveHost } from "@/components/footer-save";
import { useViewPref } from "@/lib/use-view-pref";
import { colorWebImages, listingIssues, type HealthColor, type ListingIssue } from "@/lib/website-listing-health";
import { WEB_FIX_PRINT_STORE, type WebFixGroupKey, type WebFixPayload, type WebFixRow } from "@/lib/website-fix-print-payload";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { getLang, tr } from "@/lib/lang";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { WebsiteAddProductsModal } from "@/components/website-add-products-modal";
import { WebsiteListingsMassEdit } from "@/components/website-listings-mass-edit";
import { WebsiteImageMassUpload } from "@/components/website-image-mass-upload";
import { ColorSwatchButton } from "@/components/color-swatch-manager";
import { webForm } from "@/lib/website-form-styles";

const ParentWebListings = dynamic(() => import("@/components/parent-web-listings").then((m) => m.ParentWebListings), { ssr: false });
// ⚠️ ต้อง dynamic — master-crud import relation-multi อยู่ (import ตรงจะวนกัน) ดู memory unify_drawer
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
const WebsiteListingsGridEdit = dynamic(() => import("@/components/website-listings-grid-edit").then((m) => m.WebsiteListingsGridEdit), { ssr: false });
const WebsiteCategorySorter = dynamic(() => import("@/components/website-category-sorter").then((m) => m.WebsiteCategorySorter), { ssr: false });

export type ShopInfo = { id: string; name: string; slug: string; isDefault: boolean; siteUrl?: string | null };

/** ค่าที่เว็บจะใช้อัตโนมัติถ้าไม่กรอกทับ (มาจากการจับคู่ฟิลด์) */
type Mapped = {
  name: string;
  price: number;
  description: string;
  unit: string;
  category: string;
  images: string[];
  options: { label: string; items: { id: string; label: string }[] } | null;
} | null;
type OptionItem = { id: string; label: string; swatch?: string | null };
type WebOptions = { label: string; items: OptionItem[] } | null;

/** ค่าที่ "ลูกค้าเห็นจริง" (รวมที่กรอกทับ) — API คำนวณด้วย resolveProduct ตัวเดียวกับเว็บ */
type Display = {
  name: string;
  price: number;
  priceVaries: boolean;
  imageKey: string | null;
  imageCount: number;
  /** img = รูปของสีบนเว็บมาจากไหน (web/sku/none) · skuId = SKU ตัวแทนของสี — lib/website-listing-display */
  colors: HealthColor[];
  hero: boolean;
  productUrl: string | null;
  compartmentsMissing?: boolean;
} | null;

export type Listing = {
  display: Display;
  mapped: Mapped;
  id: string;
  parentId: string;
  code: string;
  erpName: string;
  /** 🌐 ชื่ออังกฤษ (Parent SKU name_en) · "" = ยังไม่มี → โหมด EN โชว์ชื่อไทย + ป้าย "No EN name" */
  nameEn?: string;
  erpPrice: number;
  erpDescription: string;
  erpImageKey: string | null;
  /** 🗂 ชื่อหมวดใน ERP (หน้าจัดหมวด ขั้น 1) */
  erpCategory?: string | null;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  webName: string;
  webPrice: number | null;
  webDescription: string;
  webImages: string[];
  webUnit: string;
  webCategory: string;
  /** 📂 หลายหมวด — null = ยังไม่เคยจัด (ใช้หมวดแบบเดิม) */
  webCategories: string[] | null;
  /** หมวดที่เว็บใช้จริงตอนนี้ */
  categories: string[];
  webBadge: string;
  webStockStatus: string;
  webSwatch: string;
  webOptions: WebOptions;
};

/** ▸ SKU ย่อยของรุ่น (ขยายในตาราง) — อ่านผ่าน /api/website/listings/grid (ทะเบียนฟิลด์ · ราคาซ่อนตามสิทธิ์) */
type SubSku = { id: string; code: string | null; color?: string | null; color_th?: string | null; list_price?: number | string | null; cover_image_r2_key?: string | null };
const SUB_SKU_COLS = "color,color_th,list_price,cover_image_r2_key";

/** หมวดของร้าน — มาจาก API (ตั้งได้เองในแท็บ ⚙️ จับคู่ฟิลด์) */
export type CategoryDef = { key: string; label: string; icon: string; parent?: string | null };

type Filter = "all" | "pub" | "hide" | "feat" | "fix" | "fit" | "noimg" | "partimg";
const VIEWS = ["list", "grid", "sort"] as const;
/** 📄 จำนวนต่อหน้า (จำต่อคนด้วย useViewPref) */
const PAGE_SIZES = ["25", "50", "100", "200"] as const;
/** 🙈 ซ่อนรายการที่ไม่ขึ้นเว็บ (จำต่อคนด้วย useViewPref · ค่าเริ่ม on) */
const HIDE_OFF = ["on", "off"] as const;
/** เปิด/ซ่อนทีละมากเกินนี้ = ถามก่อน · ตั้งแต่ BULK_TYPED ขึ้นไป = ต้องพิมพ์ยืนยัน (กฎ Bulk Edit Safety) */
const BULK_CONFIRM = 20;
const BULK_TYPED = 100;
/** ↕ เรียงในตาราง (ดูอย่างเดียว ไม่เปลี่ยนลำดับบนเว็บ) · "" = ลำดับบนเว็บ (ลาก ⠿ ได้) — ค่า = `${key}:${dir}` ของ SortState */
const SORT_OPTS = [
  { v: "", get label() { return tr("ลำดับบนเว็บ (ลาก ⠿ ได้)", "Web order (drag ⠿)"); } },
  { v: "code:asc", get label() { return tr("รหัส SKU A→Z", "SKU code A→Z"); } },
  { v: "code:desc", get label() { return tr("รหัส SKU Z→A", "SKU code Z→A"); } },
  { v: "status:asc", get label() { return tr("สถานะ: ขึ้นเว็บก่อน", "Status: live first"); } },
  { v: "status:desc", get label() { return tr("สถานะ: ซ่อนอยู่ก่อน", "Status: hidden first"); } },
  { v: "price:asc", get label() { return tr("ราคา: ถูก→แพง", "Price: low→high"); } },
  { v: "price:desc", get label() { return tr("ราคา: แพง→ถูก", "Price: high→low"); } },
];

const baht = (n: number) => `฿${(Number(n) || 0).toLocaleString("th-TH")}`;
const inputCls = webForm.input;
const keyUrl = (key: string, w = 120) => `/api/r2-image?key=${encodeURIComponent(key)}&w=${w}`;

/** ชื่อ/ราคาที่โชว์ในรายการ = ที่ลูกค้าเห็นจริง (เดิมโชว์ชื่อดิบ ERP + ราคา Parent ซึ่งเป็น ฿0) */
const shownName = (l: Listing) => (getLang() === "en" && l.nameEn) || l.display?.name || l.webName || l.mapped?.name || l.erpName;
const shownPrice = (l: Listing) => l.display?.price ?? l.webPrice ?? l.mapped?.price ?? l.erpPrice;
const issuesOf = (l: Listing): ListingIssue[] =>
  l.display
    ? listingIssues({ price: l.display.price, imageCount: l.display.imageCount, categories: l.categories ?? [], colors: l.display.colors, compartmentsMissing: l.display.compartmentsMissing })
    : [];
/** ค่าที่ใช้เรียง · สถานะ: ขึ้นเว็บ+แนะนำ → ขึ้นเว็บ → ซ่อน+แนะนำ → ซ่อน (สถานะเดียวกัน = คงลำดับบนเว็บ) · ไม่มีราคา = ท้ายสุดเสมอ */
const sortVal = (l: Listing, key: string) =>
  key === "code" ? l.code : key === "status" ? (l.published ? 0 : 2) + (l.featured ? 0 : 1) : key === "price" ? shownPrice(l) || null : null;

/** จุดสี · 🖼 สีที่ยังไม่ได้ลงรูปเว็บ = วงรอบจุด (เหลือง = ตอนนี้ใช้รูปปก SKU แทน · แดง = SKU ก็ไม่มีรูป) */
function ColorDots({ colors, max = 5 }: { colors: HealthColor[]; max?: number }) {
  const t = useT();
  if (!colors.length) return <span className="text-[11px] text-slate-300">—</span>;
  const miss = new Set(colorWebImages(colors).missing.map((c) => c.label));
  return (
    <span className={`inline-flex items-center ${miss.size ? "gap-1.5" : "gap-0.5"}`} title={colors.map((c) => c.label).join(", ")}>
      {colors.slice(0, max).map((c, i) => {
        const m = miss.has(c.label);
        return (
          <span
            key={`${c.label}-${i}`}
            title={m ? t(`${c.label} — ยังไม่มีรูปบนเว็บ${c.img === "none" ? " (SKU ก็ไม่มีรูป)" : " (ตอนนี้ใช้รูปปก SKU แทน)"}`, `${c.label} — no web image yet${c.img === "none" ? " (the SKU has no image either)" : " (using the SKU cover for now)"}`) : c.label}
            className={`inline-block w-3 h-3 rounded-full ${c.swatch ? "ring-1 ring-black/10" : "border border-dashed border-slate-400"} ${
              m ? `ring-2 ring-offset-1 ${c.img === "none" ? "!ring-rose-500" : "!ring-amber-400"}` : ""
            }`}
            style={c.swatch ? { background: c.swatch, backgroundSize: "cover" } : undefined}
          />
        );
      })}
      {colors.length > max && <span className="text-[11px] text-slate-400 ml-0.5">+{colors.length - max}</span>}
    </span>
  );
}

function Thumb({ l, size = 48 }: { l: Listing; size?: number }) {
  const t = useT();
  const key = l.display?.imageKey ?? l.erpImageKey;
  const n = l.display?.imageCount ?? 0;
  return (
    <div className="relative shrink-0 rounded-lg overflow-hidden bg-slate-100" style={{ width: size, height: size, ...(key ? {} : l.webSwatch ? { background: l.webSwatch } : {}) }}>
      {key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={keyUrl(key, size * 2)} alt="" className="w-full h-full object-cover" loading="lazy" />
      )}
      {/* 🖼 ยังไม่มีรูปเลย — กรอบประแดง (กดรูป = เปิดหน้าแก้ไปเพิ่มรูป) */}
      {!key && !l.webSwatch && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-rose-300 bg-rose-50 text-[10px] leading-none text-rose-600" title={t("ยังไม่มีรูป — กดเพื่อเพิ่มรูป", "No image yet — click to add")}>
          <Icon name="image" size={size >= 64 ? 18 : 14} />
          <span>{t("เพิ่มรูป", "Add image")}</span>
        </span>
      )}
      {n > 0 && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-1 text-[10px] leading-4 text-white">{n}</span>}
    </div>
  );
}

/** ▸ แถว SKU ย่อยใต้รุ่น — คอลัมน์ตรงกับแถวรุ่น (ชื่อ · ราคา · ✏️) · กดแถว = เปิดแก้ที่ drawer เลื่อนไป SKU นั้น */
function SubSkuRows({ rows, onOpen, onRetry }: { rows: SubSku[] | "loading" | "error" | undefined; onOpen: (skuId: string) => void; onRetry: () => void }) {
  const t = useT();
  const pad = "pl-10 md:pl-24 pr-3";
  if (rows === undefined || rows === "loading") return <div className={`${pad} pb-2.5 text-xs text-slate-400`}>{t("กำลังโหลด SKU…", "Loading SKUs…")}</div>;
  if (rows === "error")
    return (
      <div className={`${pad} pb-2.5 text-xs text-rose-600`}>
        {t("โหลด SKU ไม่สำเร็จ", "Failed to load SKUs")}{" "}
        <button type="button" onClick={onRetry} className="underline hover:text-rose-800">
          {t("ลองใหม่", "Retry")}
        </button>
      </div>
    );
  if (!rows.length) return <div className={`${pad} pb-2.5 text-xs text-slate-400`}>{t("รุ่นนี้ยังไม่มี SKU ที่ใช้งานอยู่", "This model has no active SKUs yet")}</div>;
  return (
    <ul className="pb-1.5 bg-slate-50/60 border-t border-slate-100">
      {rows.map((k) => {
        const th = String(k.color_th ?? "").trim();
        const en = String(k.color ?? "").trim();
        const price = k.list_price === undefined ? null : Number(k.list_price) || 0;
        return (
          <li key={k.id}>
            <button type="button" onClick={() => onOpen(k.id)} className={`group w-full flex items-center gap-3 py-1.5 text-left hover:bg-white ${pad}`} title={t(`แก้ SKU ${k.code ?? ""}`, `Edit SKU ${k.code ?? ""}`)}>
              <span className="w-12 shrink-0 flex justify-center">
                {k.cover_image_r2_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={keyUrl(k.cover_image_r2_key, 64)} alt="" className="w-8 h-8 rounded object-cover bg-slate-100" loading="lazy" />
                ) : (
                  <span className="w-8 h-8 rounded bg-slate-100" />
                )}
              </span>
              {/* มือถือ: รหัส / ชื่อสี 2 บรรทัด · จอคอม: บรรทัดเดียว */}
              <span className="flex-1 min-w-0 text-xs md:truncate">
                <span className="block md:inline truncate font-mono text-slate-500">{k.code}</span>
                <span className="hidden md:inline text-slate-300"> · </span>
                <span className="block md:inline truncate text-slate-700">
                  {th || en || t("ไม่มีชื่อสี", "No color name")}
                  {th && en && en !== th && <span className="text-slate-400"> / {en}</span>}
                </span>
              </span>
              <span className="hidden md:block w-24" />
              <span
                className={`md:w-24 text-right text-xs tabular-nums ${price === null ? "text-slate-300" : price > 0 ? "text-slate-700" : "text-rose-500"}`}
                title={price === null ? t("ไม่มีสิทธิ์ดูราคา", "No permission to view price") : undefined}
              >
                {price === null ? "—" : price > 0 ? baht(price) : t("ยังไม่มีราคา", "No price yet")}
              </span>
              <span className="hidden md:block w-28" />
              <span className="w-16 shrink-0 text-center text-[11px] text-slate-400 group-hover:text-blue-700">{t("✏️ แก้", "✏️ Edit")}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function WebsiteListingsPanel({
  shop,
  listings,
  setListings,
  categories,
  loading,
  reload,
  onOpenTranslations,
}: {
  shop: ShopInfo;
  listings: Listing[];
  setListings: Dispatch<SetStateAction<Listing[]>>;
  categories: CategoryDef[];
  loading: boolean;
  reload: () => Promise<void> | void;
  /** 🌐 ไปแท็บ "แปลภาษา" (ไม่มีสิทธิ์ = ไม่ส่งมา → ไม่โชว์ลิงก์) */
  onOpenTranslations?: () => void;
}) {
  const t = useT();
  const isEn = getLang() === "en";
  const noEnCount = useMemo(() => listings.filter((l) => !l.nameEn).length, [listings]);
  const toast = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // ?filter=fix (จากป๊อปตรวจก่อนเผยแพร่ → "ไปแก้") = เปิดตัวกรอง "⚠️ ต้องแก้"
  useEffect(() => {
    const qf = new URLSearchParams(window.location.search).get("filter");
    if (qf === "fix" || qf === "fit") setFilter(qf as Filter);
  }, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  // ↕ เรียงในตาราง (null = ลำดับบนเว็บ) — กดหัวคอลัมน์ หรือเลือกจากช่อง "เรียง:" (มือถือ/การ์ดไม่มีหัวคอลัมน์)
  const [sort, setSort] = useState<SortState>(null);
  const { view, setView, saveDefault } = useViewPref("website_listings_view", VIEWS, "list");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [massOpen, setMassOpen] = useState(false);
  // 📸 ลงรูปเว็บทีละมาก — null = ปิด · [] = ทั้งร้าน · [ids] = เฉพาะที่ติ๊ก / รุ่นที่กรองอยู่ (imgMassLabel = ชื่อชุด)
  const [imgMass, setImgMass] = useState<string[] | null>(null);
  const [imgMassLabel, setImgMassLabel] = useState<string | null>(null);
  // 📥 ไฟล์ที่ลากมาวางบนแถวสินค้า → ส่งเข้าหน้าต่างลงรูปทีละมาก (รุ่นเดียว = ไฟล์ไม่มีรหัสก็เข้ารุ่นนั้น)
  const [imgMassFiles, setImgMassFiles] = useState<File[] | null>(null);
  const openImgMass = (ids: string[], label: string | null = null, files: File[] | null = null) => {
    setImgMassLabel(label);
    setImgMassFiles(files);
    setImgMass(ids);
  };
  const rowDrop = useFileDrop(
    (files, parentId) => {
      const l = listings.find((x) => x.parentId === parentId);
      if (l) openImgMass([parentId], t(`รุ่น ${l.code} (ลากมาวางที่แถว)`, `Model ${l.code} (dropped on row)`), files);
    },
    { accept: ["image/", "video/"], folders: true, onReject: () => toast.warning(t("ลากได้เฉพาะไฟล์รูป (jpg / png / webp) หรือวิดีโอ (mp4 / webm)", "Only image (jpg / png / webp) or video (mp4 / webm) files can be dropped")) }
  );
  // ▦ แก้ไขทีละมาก (ตาราง) — null = ปิด · [] = ทั้งร้าน · [ids] = เฉพาะที่ติ๊ก
  const [gridEdit, setGridEdit] = useState<string[] | null>(null);
  // ปุ่มลัดในแถบล่าง → เปิดป๊อปแก้หลายรายการพร้อมช่องที่ตั้งไว้ (เช่น 📂 ย้ายหมวด)
  const [massPreset, setMassPreset] = useState<{ field: "categories"; categories: { mode: "move"; keys: string[]; from?: string } } | null>(null);
  const [removing, setRemoving] = useState<Listing | null>(null);
  // 🛍 drawer ตั้งค่าเว็บของสินค้า (ของกลาง ParentWebListings) · ปุ่มบันทึกอยู่แถบล่าง (footer-save)
  const webSave = useFooterSaveHost();
  // ◀ ▶ / ปิด ตอนมีของแก้ค้าง → ถามก่อน (ไปไหน: parentId · null = ปิด)
  const [pendingNav, setPendingNav] = useState<{ to: string | null } | null>(null);
  // 📦 เปิด Parent SKU — drawer ตัวจริงของหน้า Parent SKU (ทุกแท็บ) · ◀ ▶ เลื่อนตามรายการที่เห็นอยู่
  const [parentOpen, setParentOpen] = useState<string | null>(null);
  // ▸ ขยาย SKU ย่อยใต้แถว (โหลดตอนกดครั้งแรก · เก็บไว้จนบันทึกรุ่นนั้น) + 🎯 กดแถว SKU = เปิด drawer เลื่อนไปแถว SKU นั้น
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subSkus, setSubSkus] = useState<Record<string, SubSku[] | "loading" | "error">>({});
  const [focus, setFocus] = useState<{ parentId: string; skuId: string } | null>(null);

  // แผงเพิ่มสินค้า
  const [showAdd, setShowAdd] = useState(false);

  const patch = (parentId: string, p: Partial<Listing>) =>
    setListings((ls) => ls.map((l) => (l.parentId === parentId ? { ...l, ...p } : l)));

  const post = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/website/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  };

  const issuesById = useMemo(() => new Map(listings.map((l) => [l.parentId, issuesOf(l)])), [listings]);
  // 🖼 สถานะรูปบนเว็บของรุ่น (นับเฉพาะรูปเว็บ — รูปปก SKU ไม่นับ): none = ยังไม่ได้ลงรูปเว็บเลยสักสี · part = ลงไว้บางสี
  const imgById = useMemo(
    () =>
      new Map(
        listings.map((l) => {
          const keys = new Set((issuesById.get(l.parentId) ?? []).map((i) => i.key));
          const st = keys.has("no_image") || colorWebImages(l.display?.colors ?? []).noWeb ? "none" : keys.has("color_no_web_image") || keys.has("color_no_image") ? "part" : null;
          return [l.parentId, st] as const;
        })
      ),
    [listings, issuesById]
  );
  // 🙈 ซ่อนรายการที่ไม่ขึ้นเว็บ (เจ้าของ 2026-11-11 · ค่าเริ่ม = ซ่อน · จำต่อคน) — "อาจไม่ขายแล้ว ไม่ต้องแก้"
  //    ไม่โชว์ในรายการ · ไม่นับในชิป แนะนำ/ต้องแก้/รูป/วัดช่อง · ไม่อยู่ในเช็กลิสต์ที่พิมพ์ · ชิป "ซ่อนอยู่" ยังกดดู/เปิดกลับได้
  const hideOffPref = useViewPref("website_listings_hide_off", HIDE_OFF, "on");
  const hideOff = hideOffPref.view === "on";
  const setHideOff = (v: boolean) => { const x = v ? "on" : "off"; hideOffPref.setView(x); void hideOffPref.saveDefault(x); };
  const live = useMemo(() => (hideOff ? listings.filter((l) => l.published) : listings), [listings, hideOff]);
  const counts = useMemo(
    () => ({
      all: listings.length,
      pub: listings.filter((l) => l.published).length,
      hide: listings.filter((l) => !l.published).length,
      feat: live.filter((l) => l.featured).length,
      fix: live.filter((l) => (issuesById.get(l.parentId) ?? []).length > 0).length,
      // 📐 รายงาน "ยังไม่วัดช่องใส่ของ" (ร้านเปิดเช็คขนาด · รุ่นที่ไม่ใช่กระเป๋ากด "ไม่มีช่องใส่ของ" แล้วไม่นับ)
      fit: live.filter((l) => l.display?.compartmentsMissing).length,
      noimg: live.filter((l) => imgById.get(l.parentId) === "none").length,
      partimg: live.filter((l) => imgById.get(l.parentId) === "part").length,
    }),
    [listings, live, issuesById, imgById]
  );
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    // ชิป "ซ่อนอยู่" = ดูของที่ซ่อนได้เสมอ (เปิดกลับได้) · ตัวกรองอื่นใช้รายการที่ไม่ซ่อน
    const rows = (filter === "hide" ? listings : live).filter((l) => {
      if (filter === "pub" && !l.published) return false;
      if (filter === "hide" && l.published) return false;
      if (filter === "feat" && !l.featured) return false;
      if (filter === "fix" && !(issuesById.get(l.parentId) ?? []).length) return false;
      if (filter === "fit" && !l.display?.compartmentsMissing) return false;
      if (filter === "noimg" && imgById.get(l.parentId) !== "none") return false;
      if (filter === "partimg" && imgById.get(l.parentId) !== "part") return false;
      if (cat === "__none" ? (l.categories ?? []).length > 0 : cat && !(l.categories ?? []).includes(cat)) return false;
      if (term && !`${shownName(l)} ${l.erpName} ${l.code}`.toLowerCase().includes(term)) return false;
      return true;
    });
    return sortRows(rows, sort, sortVal);
  }, [listings, live, filter, q, cat, sort, issuesById, imgById]);
  // 📄 แบ่งหน้า (เจ้าของ 2026-11-10 "ทำเป็นหน้าๆ จะได้โหลดไม่นาน") — วาดเฉพาะหน้าที่ดู (รูป/แถวน้อยลง) ด้วยของกลาง Pager
  //    ตัวกรอง/ค้นหา/ตัวเลข/พิมพ์เช็กลิสต์/ลงรูปตามตัวกรอง ยังคิดจากทุกรุ่น · ติ๊กเลือกจำข้ามหน้า (sel = รหัสรุ่น) · จำนวนต่อหน้าจำต่อคน
  const pageSizePref = useViewPref("website_listings_page_size", PAGE_SIZES, "50");
  const pageSize = Number(pageSizePref.view);
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [filter, q, cat, sort, pageSize]);
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const curPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => shown.slice(curPage * pageSize, (curPage + 1) * pageSize), [shown, curPage, pageSize]);
  const listTopRef = useRef<HTMLDivElement>(null);
  const filtered = filter !== "all" || !!q.trim() || !!cat;
  // ⠿ ลากได้เฉพาะตอนเห็นครบทุกตัวตามลำดับบนเว็บ (ไม่กรอง · ไม่เรียงแบบอื่น)
  const canDrag = !filtered && !sort;
  const sortLabel = sort ? SORT_OPTS.find((o) => o.v === `${sort.key}:${sort.dir}`)?.label : null;
  const catLabel = (k: string) => categories.find((c) => c.key === k)?.label ?? k;

  // ⠿ ลากเรียงลำดับ (เฉพาะตอนเห็นครบทุกตัว ไม่มีตัวกรอง — ลำดับจะได้ตรงกับเว็บ)
  const reorder = async (from: number, to: number) => {
    const next = moveItem(listings, from, to).map((l, i) => ({ ...l, sortOrder: i }));
    setListings(next);
    try {
      const j = await post({ shopId: shop.id, action: "reorder", order: next.map((l) => l.parentId) });
      if (!j.ok) throw new Error(j.error);
    } catch {
      toast.error(t("เรียงลำดับไม่สำเร็จ — โหลดลำดับเดิมคืน", "Reorder failed — restored the previous order"));
      await reload();
    }
  };
  const drag = useDragReorder((from, to) => void reorder(from, to));

  const toggleSel = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownSelected = shown.length > 0 && shown.every((l) => sel.has(l.parentId));
  const toggleAllShown = () =>
    setSel((s) => {
      const n = new Set(s);
      if (allShownSelected) shown.forEach((l) => n.delete(l.parentId));
      else shown.forEach((l) => n.add(l.parentId));
      return n;
    });
  // ช่องติ๊กหัวตาราง = เฉพาะหน้านี้ · "เลือกทั้งหมดที่ตรงตัวกรอง" อยู่ที่แถบล่าง
  const allPageSelected = pageRows.length > 0 && pageRows.every((l) => sel.has(l.parentId));
  const togglePage = () =>
    setSel((s) => {
      const n = new Set(s);
      if (allPageSelected) pageRows.forEach((l) => n.delete(l.parentId));
      else pageRows.forEach((l) => n.add(l.parentId));
      return n;
    });

  // ⚠️ เปิด/ซ่อนทีละมาก = ถามก่อน (2026-11-10: ติ๊กทั้งหมดแล้วกด "ขึ้นเว็บ" ทีเดียว 389 รุ่น ไม่มีอะไรเตือน)
  const [bulkAsk, setBulkAsk] = useState<{ p: { isPublished?: boolean; featured?: boolean }; msg: string } | null>(null);
  const bulk = async (p: { isPublished?: boolean; featured?: boolean }, msg: string, confirmed = false) => {
    const ids = [...sel];
    if (!ids.length) return;
    if (!confirmed && p.isPublished !== undefined && ids.length > BULK_CONFIRM) { setBulkAsk({ p, msg }); return; }
    setBulkBusy(true);
    try {
      const j = await post({ shopId: shop.id, action: "bulk", parentIds: ids, patch: p });
      if (!j.ok) throw new Error(j.error);
      setListings((ls) =>
        ls.map((l) =>
          sel.has(l.parentId)
            ? { ...l, ...(p.isPublished !== undefined ? { published: p.isPublished } : {}), ...(p.featured !== undefined ? { featured: p.featured } : {}) }
            : l
        )
      );
      toast.success(t(`${msg} ${ids.length} รายการแล้ว`, `${msg}: ${ids.length} items done`));
      setSel(new Set());
    } catch {
      toast.error(t("ทำรายการไม่สำเร็จ", "Action failed"));
    } finally {
      setBulkBusy(false);
    }
  };

  const removeProduct = async (l: Listing) => {
    setSaving(l.parentId);
    try {
      const j = await post({ shopId: shop.id, parentId: l.parentId, action: "remove" });
      if (j.ok) {
        toast.success(t("เอาออกแล้ว", "Removed"));
        setListings((ls) => ls.filter((x) => x.parentId !== l.parentId));
        setOpen(null);
      } else toast.error(j.error ?? t("เอาออกไม่สำเร็จ", "Remove failed"));
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Connection failed"));
    } finally {
      setSaving(null);
      setRemoving(null);
    }
  };

  const togglePublish = async (l: Listing) => {
    const next = !l.published;
    patch(l.parentId, { published: next });
    const j = await post({ shopId: shop.id, parentId: l.parentId, patch: { isPublished: next } }).catch(() => ({ ok: false }));
    if (j.ok) toast.success(next ? t("ขึ้นเว็บแล้ว", "Now live") : t("ซ่อนจากเว็บแล้ว", "Hidden from web"));
    else {
      patch(l.parentId, { published: !next });
      toast.error(t("เปลี่ยนสถานะไม่สำเร็จ", "Status change failed"));
    }
  };
  const toggleFeatured = async (l: Listing) => {
    const next = !l.featured;
    patch(l.parentId, { featured: next });
    const j = await post({ shopId: shop.id, parentId: l.parentId, patch: { featured: next } }).catch(() => ({ ok: false }));
    if (!j.ok) {
      patch(l.parentId, { featured: !next });
      toast.error(t("บันทึกไม่สำเร็จ", "Save failed"));
    }
  };

  // 🛍 drawer เว็บ: เปิด/เลื่อน/ปิด (มีของแก้ค้าง = ถามก่อน)
  const webL = open ? listings.find((l) => l.parentId === open) ?? null : null;
  const navIdx = webL ? shown.findIndex((l) => l.parentId === webL.parentId) : -1;
  const goWeb = (to: string | null) => {
    if (webSave.anyDirty) setPendingNav({ to });
    else setOpen(to);
  };
  /** กดชื่อ/รูป/✏️ = เปิดแก้ทั้งรุ่น · กดแถว SKU ย่อย = เปิดแล้วเลื่อนไปแถว SKU นั้น */
  const openWeb = (parentId: string, skuId?: string) => {
    setFocus(skuId ? { parentId, skuId } : null);
    goWeb(parentId);
  };

  const loadSubSkus = async (parentId: string) => {
    setSubSkus((m) => ({ ...m, [parentId]: "loading" }));
    try {
      const r = await apiFetch(`/api/website/listings/grid?shopId=${encodeURIComponent(shop.id)}&level=color&parentIds=${parentId}&scols=${SUB_SKU_COLS}`);
      const j = (await r.json().catch(() => ({}))) as { skus?: (SubSku & { parent_sku_id?: string })[] };
      if (!r.ok || !Array.isArray(j.skus)) throw new Error();
      setSubSkus((m) => ({ ...m, [parentId]: j.skus!.filter((k) => !k.parent_sku_id || k.parent_sku_id === parentId) }));
    } catch {
      setSubSkus((m) => ({ ...m, [parentId]: "error" }));
    }
  };
  const toggleExpand = (parentId: string) => {
    if (!expanded.has(parentId) && !Array.isArray(subSkus[parentId])) void loadSubSkus(parentId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  // 🖼 ตัวกรองรูปบนเว็บ — โผล่เมื่อมีรุ่นเข้าเงื่อนไข (ครบแล้ว = หายไปเอง)
  const imgFilter = (k: "noimg" | "partimg", label: string, title: string) =>
    counts[k] > 0 || filter === k ? [{ k: k as Filter, label, title, warn: true }] : [];
  const FILTERS: { k: Filter; label: string; warn?: boolean; title?: string }[] = [
    { k: "all", label: t("ทั้งหมด", "All") },
    { k: "pub", label: t("ขึ้นเว็บ", "Live") },
    { k: "hide", label: t("ซ่อนอยู่", "Hidden") },
    { k: "feat", label: t("⭐ แนะนำ", "⭐ Featured") },
    { k: "fix", label: t("⚠️ ต้องแก้", "⚠️ Needs fixing"), warn: true },
    // 📐 โผล่เมื่อร้านเปิดเช็คขนาดและยังมีรุ่นที่ไม่ได้วัด (วัดครบ = หายไปเอง)
    ...(counts.fit > 0 || filter === "fit" ? [{ k: "fit" as Filter, label: t("📐 ยังไม่วัดช่อง", "📐 Compartments not measured"), warn: true }] : []),
    ...imgFilter("noimg", t("ยังไม่มีรูปบนเว็บเลย", "No web images at all"), t("ยังไม่ได้ลงรูปเว็บสักสี — ตอนนี้ลูกค้าเห็นรูปปก SKU สีละ 1 รูป (หรือช่องว่างถ้า SKU ก็ไม่มีรูป)", "No web images for any color — customers now see 1 SKU cover per color (or a blank if the SKU has no image)")),
    ...imgFilter("partimg", t("บางสียังไม่มีรูปเว็บ", "Some colors lack web images"), t("ลงรูปเว็บไว้บางสีแล้ว แต่บางสียังไม่ได้ลง", "Some colors have web images, others don't yet")),
  ];

  // 🖨 เช็กลิสต์ "ต้องแก้" ของรุ่นที่เห็นอยู่ (ตามตัวกรอง/ค้นหา/หมวด) → หน้าพิมพ์ /print/website-fix (lib/website-fix-print · เจ้าของ 2026-11-10)
  const fixShown = view !== "sort" ? shown.filter((l) => (issuesById.get(l.parentId) ?? []).length > 0).length : 0;
  const printFixList = () => {
    const rows: WebFixRow[] = shown.flatMap((l) => {
      const iss = issuesById.get(l.parentId) ?? [];
      if (!iss.length) return [];
      const img = l.display?.imageKey ?? l.erpImageKey;
      const cats = (l.categories ?? []).map(catLabel);
      return [{
        id: l.parentId, code: l.code, name: l.display?.name || l.webName || l.erpName, image_url: img ? keyUrl(img, 96) : null,
        category: cats.length ? cats.join(", ") : l.erpCategory ?? null, published: l.published,
        issues: iss.map((i) => ({ key: i.key, label: i.label, detail: i.detail })),
      }];
    });
    if (!rows.length) { toast.warning(t("รุ่นที่เห็นอยู่ไม่มีเรื่องที่ต้องแก้", "The models shown have nothing to fix")); return; }
    const fLabel = (FILTERS.find((x) => x.k === filter)?.label ?? t("ทั้งหมด", "All")).replace(/^[^\p{L}\p{N}]+/u, "");
    const scope = [t(`ตัวกรอง ${fLabel}`, `Filter ${fLabel}`), q.trim() ? t(`ค้นหา "${q.trim()}"`, `Search "${q.trim()}"`) : "", cat ? t(`หมวด ${cat === "__none" ? "ยังไม่อยู่หมวด" : catLabel(cat)}`, `Category ${cat === "__none" ? "no category" : catLabel(cat)}`) : ""].filter(Boolean).join(" · ");
    const focus: WebFixGroupKey | null = filter === "noimg" ? "web_none" : filter === "partimg" ? "web_part" : filter === "fit" ? "no_compartments" : null;
    const key = Date.now().toString(36);
    try {
      // ล้างชุดเก่าเกิน 1 วัน กันพื้นที่เก็บในเบราว์เซอร์เต็ม
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(WEB_FIX_PRINT_STORE) && Date.now() - parseInt(k.slice(WEB_FIX_PRINT_STORE.length), 36) > 864e5) localStorage.removeItem(k);
      }
      const payload: WebFixPayload = { shop: shop.name, scope, focus, rows, at: Date.now() };
      localStorage.setItem(WEB_FIX_PRINT_STORE + key, JSON.stringify(payload));
    } catch {
      toast.error(t("เปิดหน้าพิมพ์ไม่สำเร็จ — พื้นที่เก็บในเบราว์เซอร์เต็ม ลองกรองให้น้อยลง", "Couldn't open the print page — browser storage is full. Try filtering to fewer items"));
      return;
    }
    window.open(`/print/website-fix?k=${key}`, "_blank");
  };

  const priceText = (l: Listing) => (shownPrice(l) > 0 ? `${l.display?.priceVaries ? t("เริ่ม ", "from ") : ""}${baht(shownPrice(l))}` : "—");

  return (
    <div>
      {/* แถบสรุป + ปุ่มเพิ่ม */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {view === "sort" && <span className="text-sm text-slate-600">{t(`🗂 จัดหมวดสินค้าทั้งร้าน (${listings.length} ตัว)`, `🗂 Sort all shop products into categories (${listings.length})`)}</span>}
          {view !== "sort" && FILTERS.map((f) => {
            const on = filter === f.k;
            const n = counts[f.k];
            return (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                title={f.title}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  on
                    ? "border-slate-900 bg-slate-900 text-white"
                    : f.warn && n > 0
                      ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {f.label} <span className="font-semibold">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {/* 🎨 ทะเบียนสีกลาง (จุดสีทุกร้าน) — เดิมต้องเข้าแท็บดีไซน์ → การ์ดสินค้า */}
          <ColorSwatchButton
            label={t("🎨 ทะเบียนสี", "🎨 Color registry")}
            title={t("ผูกจุดสีให้ชื่อสีของสินค้า (ใช้ทุกร้าน)", "Link color swatches to product color names (all shops)")}
            onClosed={() => void reload()}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:border-slate-400"
          />
          {listings.length > 0 && (
            <button
              onClick={() => setGridEdit([])}
              title={t("แก้หลายสินค้าในตารางเดียว — เลือกได้ทุกช่องจากทะเบียนฟิลด์ · วางจาก Excel ได้", "Edit many products in one table — any field from the field registry · paste from Excel")}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:border-slate-400"
            >
              {t("▦ แก้ไขทีละมาก", "▦ Bulk edit")}
            </button>
          )}
          {listings.length > 0 && (
            <button
              onClick={() => openImgMass([])}
              title={t("ลากโฟลเดอร์รูปมาวาง — จับคู่ชื่อไฟล์กับรหัสสินค้า/สีให้อัตโนมัติ", "Drop an image folder — file names are matched to product/color codes automatically")}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:border-slate-400"
            >
              {t("📸 ลงรูปทีละมาก", "📸 Bulk image upload")}
            </button>
          )}
          {fixShown > 0 && (
            <button
              onClick={printFixList}
              title={t(`พิมพ์เช็กลิสต์เรื่องที่ต้องแก้ของ ${fixShown} รุ่นที่เห็นอยู่ (ตามตัวกรอง/ค้นหา/หมวดที่เลือก) — แยกตามเรื่องหรือ 1 แถวต่อรุ่น · บันทึก PDF/JPG ได้`, `Print a fix checklist for the ${fixShown} models shown (by current filter/search/category) — grouped by issue or 1 row per model · save as PDF/JPG`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:border-slate-400"
            >
              <Icon value="i:printer" /> {t(`พิมพ์เช็กลิสต์ (${fixShown})`, `Print checklist (${fixShown})`)}
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            {t("+ เพิ่มสินค้าเข้าเว็บ", "+ Add products")}
          </button>
        </div>
      </div>

      {/* 🖼 ตัวกรองรูปบนเว็บอยู่ → ลงรูปเฉพาะรุ่นที่เห็นด้วยโฟลเดอร์เดียว (ตัวลงรูปทีละมากตัวเดิม · จำกัดรุ่น = รุ่นที่กรองอยู่) */}
      {(filter === "noimg" || filter === "partimg") && view !== "sort" && shown.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Icon name="image" size={14} />
          <span className="flex-1 min-w-[14rem]">
            {t(`${shown.length} รุ่นที่${filter === "noimg" ? "ยังไม่มีรูปบนเว็บเลย" : "บางสียังไม่มีรูปเว็บ"} — ลากโฟลเดอร์รูปมาทีเดียว ระบบจับคู่ชื่อไฟล์/โฟลเดอร์กับรหัสสีให้ (เช่น`, `${shown.length} models ${filter === "noimg" ? "with no web images at all" : "where some colors lack web images"} — drop one image folder and file/folder names are matched to color codes (e.g.`)} <span className="font-mono">MGN364-02/1.jpg</span>{t(") แล้วลงเฉพาะรุ่นเหล่านี้ · ตรวจก่อนลงทุกครั้ง", ") and only these models get uploaded · always reviewed before upload")}
          </span>
          <button
            type="button"
            onClick={() => openImgMass(shown.map((l) => l.parentId), t(`${shown.length} รุ่นที่${filter === "noimg" ? "ยังไม่มีรูปบนเว็บเลย" : "บางสียังไม่มีรูปเว็บ"}`, `${shown.length} models ${filter === "noimg" ? "with no web images" : "missing some color images"}`))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            <Icon name="camera" size={14} />
            {t(`ลงรูปรุ่นที่กรองอยู่ (${shown.length})`, `Upload images for filtered models (${shown.length})`)}
          </button>
        </div>
      )}

      {/* 📸 ลงรูปเว็บทีละมาก — จับคู่ชื่อไฟล์/โฟลเดอร์ → รูปบนเว็บ/รูปสี/Hero (components/website-image-mass-upload) */}
      <WebsiteImageMassUpload
        open={imgMass !== null}
        onClose={() => {
          setImgMass(null);
          setImgMassFiles(null);
        }}
        shop={shop}
        scopeIds={imgMass}
        scopeLabel={imgMassLabel}
        initialFiles={imgMassFiles}
        onDone={reload}
      />

      {/* ▦ แก้ไขทีละมาก — ตารางแก้ทุกแถว ช่องจากทะเบียนฟิลด์กลาง (components/website-listings-grid-edit) */}
      {gridEdit !== null && (
        <WebsiteListingsGridEdit open onClose={() => setGridEdit(null)} shop={shop} listings={listings} categories={categories} scopeIds={gridEdit} onDone={reload} />
      )}

      {/* ➕ ป๊อปเพิ่มสินค้า: แท็บ 🎯 SKU การตลาด / ☰ รายการสินค้า · ติ๊กหลายรุ่น · ค่าเริ่มต้นซ่อนไว้ก่อน */}
      <WebsiteAddProductsModal open={showAdd} onClose={() => setShowAdd(false)} shop={shop} onAdded={reload} />

      {/* 🌐 โหมด EN: บอกว่ามีกี่รุ่นยังไม่มีชื่ออังกฤษ → พาไปแท็บแปลภาษา (มี AI แปลอยู่แล้ว ไม่สร้างตัวแปลใหม่) */}
      {isEn && noEnCount > 0 && listings.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <Icon value="i:world" size={15} />
          <span>{noEnCount} products have no English name yet — they show the Thai name for now.</span>
          {onOpenTranslations && (
            <button type="button" onClick={onOpenTranslations} className="font-medium underline hover:text-blue-900">Translate in the Translations tab →</button>
          )}
        </div>
      )}

      {/* ค้นหา + หมวด + มุมมอง */}
      {listings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {view === "sort" ? <span className="flex-1" /> : <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาชื่อ หรือ รหัส เช่น BBP10", "Search name or code, e.g. BBP10")} className={`${inputCls} flex-1 min-w-[180px]`} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">{t("ทุกหมวด", "All categories")}</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
            <option value="__none">{t("ไม่อยู่หมวดไหน", "No category")}</option>
          </select>
          <select
            value={sort ? `${sort.key}:${sort.dir}` : ""}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":");
              setSort(key ? { key, dir: dir === "desc" ? "desc" : "asc" } : null);
            }}
            title={t("เรียงรายการที่เห็น — ดูอย่างเดียว ลำดับบนเว็บไม่เปลี่ยน", "Sort the visible list — view only, web order doesn't change")}
            aria-label={t("เรียงตาม", "Sort by")}
            className={`${inputCls} !w-auto ${sort ? "!border-blue-400 !text-blue-700" : ""}`}
          >
            {SORT_OPTS.map((o) => (
              <option key={o.v} value={o.v}>
                {t("เรียง:", "Sort:")} {o.label}
              </option>
            ))}
          </select>
          <ToggleSwitch on={hideOff} onChange={setHideOff} size="sm" label={<span className="text-xs text-slate-600 whitespace-nowrap">{t("ซ่อนรายการที่ไม่ขึ้นเว็บ", "Hide items not live")}</span>}
            title={t("ไม่โชว์รุ่นที่ปิดจากเว็บ และไม่นับในต้องแก้/เช็กลิสต์ (จำค่าไว้ให้คุณ)", "Don't show models turned off on the web, and don't count them in Needs fixing / checklist (remembered for you)")} />
          </>}
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  void saveDefault(v);
                }}
                title={v === "list" ? t("มุมมองรายการ", "List view") : v === "grid" ? t("มุมมองการ์ด (แบบหน้าเว็บ)", "Card view (like the website)") : t("จัดหมวดแบบเร็ว — ใส่หมวดหลักจาก ERP + กระดานจัดหมวดย่อย", "Quick categorize — main categories from ERP + subcategory board")}
                className={`px-3 py-1.5 text-xs ${view === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {v === "list" ? t("☰ รายการ", "☰ List") : v === "grid" ? t("▦ การ์ด", "▦ Cards") : t("🗂 จัดหมวด", "🗂 Categorize")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🙈 บอกเสมอว่าซ่อนอะไรไว้ (กันคนอื่นงงว่าสินค้าหายไปไหน) */}
      {hideOff && counts.hide > 0 && filter !== "hide" && view !== "sort" && !loading && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
          <Icon value="i:eye-off" /> {t(`ไม่โชว์ ${counts.hide} รายการที่ปิดจากเว็บ — ไม่นับใน “ต้องแก้” และไม่อยู่ในเช็กลิสต์`, `${counts.hide} items turned off on the web are hidden — not counted in “Needs fixing” and not in the checklist`)}
          <button type="button" onClick={() => setFilter("hide")} className="underline hover:text-slate-900">{t("ดูรายการที่ซ่อน", "View hidden items")}</button>
          <button type="button" onClick={() => setHideOff(false)} className="underline hover:text-slate-900">{t("โชว์ทั้งหมด", "Show all")}</button>
        </div>
      )}

      {/* รายการสินค้าบนเว็บ (listTopRef = จุดเลื่อนกลับตอนเปลี่ยนหน้า) */}
      <div ref={listTopRef} className="scroll-mt-20" />
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !listings.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <p className="text-slate-400 text-sm">{t("ยังไม่มีสินค้าบนเว็บร้านนี้", "No products on this shop's website yet")}</p>
          <button onClick={() => setShowAdd(true)} className="mt-3 text-sm text-blue-600 hover:underline">
            {t("+ เพิ่มสินค้าเข้าเว็บ", "+ Add products")}
          </button>
        </div>
      ) : view === "sort" ? (
        <WebsiteCategorySorter
          shop={shop}
          listings={listings}
          setListings={setListings}
          categories={categories}
          reload={reload}
          onOpen={(id) => openWeb(id)}
          paused={!!open || !!parentOpen}
        />
      ) : !shown.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
          <p className="text-slate-400 text-sm">{t("ไม่พบสินค้า ลองเปลี่ยนคำค้นหรือตัวกรอง", "No products found. Try a different search or filter")}</p>
          <button
            onClick={() => {
              setFilter("all");
              setQ("");
              setCat("");
            }}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            {t("ล้างตัวกรอง", "Clear filters")}
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {pageRows.map((l) => {
            const key = l.display?.imageKey ?? l.erpImageKey;
            const iss = issuesById.get(l.parentId) ?? [];
            return (
              <button
                key={l.parentId}
                type="button"
                onClick={() => openWeb(l.parentId)}
                className={`text-left rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-400 transition ${l.published ? "" : "opacity-60"}`}
              >
                <div className="relative aspect-square bg-slate-100" style={!key && l.webSwatch ? { background: l.webSwatch } : undefined}>
                  {key && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={keyUrl(key, 360)} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                  <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
                    {!l.published && <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] text-white">{t("ซ่อนอยู่", "Hidden")}</span>}
                    {l.display?.hero && <span className="rounded-full bg-violet-600/90 px-2 py-0.5 text-[10px] text-white">{t("🎬 รูปเปิด", "🎬 Hero")}</span>}
                    {l.featured && <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] text-amber-950">⭐</span>}
                  </div>
                  {iss.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800" title={iss.map((x) => x.label).join(" · ")}>
                      ⚠️ {iss.length}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs text-slate-800 line-clamp-2 min-h-[2rem]">{shownName(l)}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="text-sm font-semibold text-slate-900">{priceText(l)}</span>
                    <ColorDots colors={l.display?.colors ?? []} max={4} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div {...rowDrop.guard} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* หัวตาราง */}
          <div className="hidden md:flex items-center gap-3 px-3 py-2 border-b border-slate-100 bg-slate-50/70 text-[11px] text-slate-500">
            <input type="checkbox" checked={allPageSelected} onChange={togglePage} className="w-4 h-4 accent-blue-600" aria-label={t("เลือกทั้งหน้านี้", "Select this page")} title={t("เลือกทั้งหน้านี้ (เลือกทุกรุ่นที่ตรงตัวกรองได้ที่แถบล่าง)", "Select this page (select all filtered models from the bottom bar)")} />
            <span className="w-3" />
            <span className="w-5" />
            <span className="w-12" />
            <span className="flex-1">
              <SortButton label={t("สินค้า · รหัส SKU", "Product · SKU code")} k="code" sort={sort} onSort={setSort} title={t("กดเรียงตามรหัส SKU (กดซ้ำ = กลับด้าน · กดครั้งที่ 3 = กลับลำดับบนเว็บ)", "Click to sort by SKU code (again = reverse · 3rd click = back to web order)")} />
              <span>{t(" (ชื่อที่ลูกค้าเห็นจริง · กดชื่อเพื่อแก้ · ▸ ดู SKU ย่อย)", " (name customers actually see · click name to edit · ▸ view sub-SKUs)")}</span>
            </span>
            <span className="w-24">{t("สี", "Colors")}</span>
            <span className="w-24 text-right">
              <SortButton label={t("ราคา", "Price")} k="price" sort={sort} onSort={setSort} title={t("กดเรียงตามราคา (ถูก→แพง · กดซ้ำ = แพง→ถูก)", "Click to sort by price (low→high · again = high→low)")} />
            </span>
            <span className="w-28 text-center">
              <SortButton label={t("ขึ้นเว็บ / แนะนำ", "Live / Featured")} k="status" sort={sort} onSort={setSort} title={t("กดเรียงตามสถานะ (ขึ้นเว็บก่อน · กดซ้ำ = ซ่อนอยู่ก่อน)", "Click to sort by status (live first · again = hidden first)")} />
            </span>
            <span className="w-16" />
          </div>
          <ul>
            {pageRows.map((l) => {
              const isOpen = open === l.parentId;
              const isExp = expanded.has(l.parentId);
              const iss = issuesById.get(l.parentId) ?? [];
              const idx = listings.indexOf(l);
              return (
                <li
                  key={l.parentId}
                  {...(canDrag ? drag.rowProps(idx) : {})}
                  className={`border-b border-slate-100 last:border-b-0 ${canDrag ? drag.rowCls(idx) : ""}`}
                >
                  {/* 📥 ลากโฟลเดอร์รูปมาวางที่แถว = ลงรูปรุ่นนี้ (หน้าต่างลงรูปทีละมาก · ไฟล์ไม่มีรหัสก็เข้ารุ่นนี้ · โฟลเดอร์ 01/ = สี -01) */}
                  <div
                    {...rowDrop.zone(l.parentId)}
                    className={`relative flex flex-wrap md:flex-nowrap items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 ${l.published ? "" : "bg-slate-50/60"}`}
                  >
                    <FileDropHint show={rowDrop.over === l.parentId} label={t(`วางรูปลงรุ่น ${l.code} — โฟลเดอร์ 01/ 02/ = รูปของสีนั้น · ตรวจก่อนลง`, `Drop images onto ${l.code} — folders 01/ 02/ = images of that color · reviewed before upload`)} />
                    <input
                      type="checkbox"
                      checked={sel.has(l.parentId)}
                      onChange={() => toggleSel(l.parentId)}
                      className="w-4 h-4 accent-blue-600"
                      aria-label={t(`เลือก ${l.code}`, `Select ${l.code}`)}
                    />
                    {!canDrag ? (
                      <span className="w-3 text-slate-200 select-none" title={sort ? t('เลือก "เรียง: ลำดับบนเว็บ" ก่อน จึงจะลากเรียงลำดับได้', 'Pick "Sort: Web order" first to drag-reorder') : t("ล้างตัวกรองก่อน จึงจะลากเรียงลำดับได้", "Clear filters first to drag-reorder")}>⠿</span>
                    ) : (
                      <DragHandle {...drag.handleProps(idx)} title={t("ลากเพื่อเรียงลำดับบนเว็บ", "Drag to reorder on the web")} className="w-3" />
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExpand(l.parentId)}
                      aria-expanded={isExp}
                      aria-label={isExp ? t(`ซ่อน SKU ย่อยของ ${l.code}`, `Hide sub-SKUs of ${l.code}`) : t(`ดู SKU ย่อยของ ${l.code}`, `Show sub-SKUs of ${l.code}`)}
                      title={isExp ? t("ซ่อน SKU ย่อย", "Hide sub-SKUs") : t("ดู SKU ย่อยของรุ่นนี้", "Show this model's sub-SKUs")}
                      className={`w-5 h-6 shrink-0 rounded text-xs leading-none transition-transform ${isExp ? "rotate-90 text-slate-700" : "text-slate-400 hover:text-slate-700"}`}
                    >
                      ▶
                    </button>
                    <button type="button" onClick={() => openWeb(l.parentId)} className={`shrink-0 ${l.published ? "" : "opacity-50"}`} title={t("เปิดแก้ไข", "Open to edit")} aria-label={t(`เปิดแก้ไข ${l.code}`, `Edit ${l.code}`)}>
                      <Thumb l={l} />
                    </button>

                    {/* มือถือ: ชื่อเต็มบรรทัดแรก ราคา/ปุ่มขึ้นบรรทัดสอง · จอคอม: แถวเดียว */}
                    <div className="flex-1 min-w-0 basis-[calc(100%-9.5rem)] md:basis-0">
                      <button
                        type="button"
                        onClick={() => openWeb(l.parentId)}
                        className={`block max-w-full text-left text-sm font-medium truncate hover:text-blue-700 hover:underline ${l.published ? "text-slate-800" : "text-slate-500"}`}
                        title={t(`${shownName(l)} — กดเพื่อแก้ไข`, `${shownName(l)} — click to edit`)}
                      >
                        {shownName(l)}
                      </button>
                      {isEn && !l.nameEn && <span className="ml-1 inline-block rounded-full border border-amber-300 bg-amber-50 px-1.5 text-[10px] leading-4 text-amber-700 align-middle">{t("ยังไม่มีชื่ออังกฤษ", "No EN name")}</span>}
                      <p className="text-[11px] text-slate-400 truncate">
                        {l.code}
                        {(l.categories ?? []).length > 0 ? ` · ${l.categories.map(catLabel).join(", ")}` : ""}
                        {l.webBadge ? t(` · ป้าย "${l.webBadge}"`, ` · badge "${l.webBadge}"`) : ""}
                      </p>
                      {(l.display?.hero || iss.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {l.display?.hero && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700">{t("🎬 รูปเปิด", "🎬 Hero")}</span>}
                          {iss.map((x) =>
                            x.key === "swatch_missing" ? (
                              // 🎨 กดป้าย = เปิดทะเบียนสี เลือกสีของสินค้านี้ที่ยังไม่ได้ตั้งไว้ก่อน · ปิดแล้วโหลดจุดสี/ป้ายใหม่
                              <ColorSwatchButton
                                key={x.key}
                                label={t(`🎨 ${x.label} — กดเพื่อผูก`, `🎨 ${x.label} — click to link`)}
                                focusNames={x.names}
                                title={x.detail ? t(`สีที่ยังไม่ผูก: ${x.detail}`, `Unlinked colors: ${x.detail}`) : undefined}
                                onClosed={() => void reload()}
                                className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800 hover:bg-amber-100 hover:border-amber-400"
                              />
                            ) : x.key === "no_image" || x.key === "color_no_image" || x.key === "color_no_web_image" ? (
                              // 🖼 กดป้าย = เปิดหน้าแก้ เลื่อนไปแถวสีแรกที่ยังไม่มีรูปเว็บ · ลงไว้บางสี = บอกชื่อสีที่ขาด
                              <button
                                key={x.key}
                                type="button"
                                onClick={() => openWeb(l.parentId, x.skuId)}
                                title={t(`${x.detail ?? x.label} — กดเพื่อไปเพิ่มรูป`, `${x.detail ?? x.label} — click to add images`)}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                                  x.key === "color_no_web_image" ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                }`}
                              >
                                <Icon name="image" size={11} />
                                {x.label}
                                {x.key === "color_no_web_image" && x.names?.length && imgById.get(l.parentId) === "part"
                                  ? t(` · ${x.names.slice(0, 2).join(", ")}${x.names.length > 2 ? ` +${x.names.length - 2}` : ""} ยังไม่มี`, ` · ${x.names.slice(0, 2).join(", ")}${x.names.length > 2 ? ` +${x.names.length - 2}` : ""} missing`)
                                  : ""}{" "}
                                {t("· เพิ่มรูป", "· Add image")}
                              </button>
                            ) : (
                              <span key={x.key} title={x.detail} className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] text-amber-800">
                                ⚠️ {x.label}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </div>

                    <span className="w-24 hidden md:block">
                      <ColorDots colors={l.display?.colors ?? []} />
                    </span>
                    <span className={`ml-auto md:ml-0 md:w-24 text-right text-sm font-semibold ${shownPrice(l) > 0 ? "text-slate-800" : "text-rose-500"}`}>{priceText(l)}</span>

                    <span className="w-28 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void togglePublish(l)}
                        title={l.published ? t("กำลังแสดงบนเว็บ — กดเพื่อซ่อน", "Live on the web — click to hide") : t("ซ่อนอยู่ — กดเพื่อขึ้นเว็บ", "Hidden — click to go live")}
                        className={`shrink-0 w-10 h-[22px] rounded-full transition relative ${l.published ? "bg-emerald-500" : "bg-slate-300"}`}
                      >
                        <span className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full transition-all ${l.published ? "left-5" : "left-0.5"}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleFeatured(l)}
                        title={l.featured ? t("สินค้าแนะนำ — กดเพื่อยกเลิก", "Featured — click to unfeature") : t("ตั้งเป็นสินค้าแนะนำ", "Set as featured")}
                        className={`text-lg leading-none ${l.featured ? "text-amber-400" : "text-slate-300 hover:text-amber-300"}`}
                      >
                        ★
                      </button>
                    </span>

                    <button
                      onClick={() => openWeb(l.parentId)}
                      className={`w-16 shrink-0 px-2 py-1.5 rounded-lg border text-xs ${isOpen ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    >
                      {t("✏️ แก้", "✏️ Edit")}
                    </button>
                  </div>

                  {isExp && <SubSkuRows rows={subSkus[l.parentId]} onOpen={(skuId) => openWeb(l.parentId, skuId)} onRetry={() => void loadSubSkus(l.parentId)} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 📄 แถบแบ่งหน้า (ของกลาง Pager) — เปลี่ยนหน้าแล้วเลื่อนกลับขึ้นหัวรายการ */}
      {view !== "sort" && !loading && shown.length > 0 && (
        <div className="mt-3">
          <Pager
            page={curPage}
            pageSize={pageSize}
            total={shown.length}
            unitLabel={t("รุ่น", "models")}
            onPage={(p) => { setPage(p); listTopRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
            pageSizes={PAGE_SIZES.map(Number)}
            onPageSize={(s) => { const v = String(s) as (typeof PAGE_SIZES)[number]; pageSizePref.setView(v); void pageSizePref.saveDefault(v); }}
          />
        </div>
      )}

      {listings.length > 0 && !loading && (
        <p className="mt-2 text-[11px] text-slate-400">
          {pageCount > 1 ? t(`หน้า ${curPage + 1}/${pageCount} · `, `Page ${curPage + 1}/${pageCount} · `) : ""}{t(`ตรงตัวกรอง ${shown.length} จาก ${listings.length} รายการ`, `${shown.length} of ${listings.length} items match`)} ·{" "}
          {sort ? (
            <>
              {t(`เรียงตาม${sortLabel} (ดูอย่างเดียว ลำดับบนเว็บไม่เปลี่ยน)`, `Sorted by ${sortLabel} (view only, web order unchanged)`)}{" "}
              <button type="button" onClick={() => setSort(null)} className="underline hover:text-slate-600">
                {t("กลับลำดับบนเว็บ", "Back to web order")}
              </button>
            </>
          ) : filtered ? (
            t("ล้างตัวกรองเพื่อลาก ⠿ เรียงลำดับบนเว็บ", "Clear filters to drag ⠿ and reorder on the web")
          ) : pageCount > 1 ? (
            t(`ลาก ⠿ เรียงลำดับบนเว็บได้ภายในหน้าเดียวกัน (ย้ายข้ามหน้า: ตั้ง ${PAGE_SIZES[PAGE_SIZES.length - 1]} ต่อหน้าก่อน)`, `Drag ⠿ to reorder within the same page (to move across pages, set ${PAGE_SIZES[PAGE_SIZES.length - 1]} per page first)`)
          ) : (
            t("ลาก ⠿ เพื่อเรียงลำดับที่โชว์บนเว็บ", "Drag ⠿ to set the order shown on the web")
          )}{" "}
          · {t("ติ๊กหลายรายการเพื่อทำพร้อมกัน", "Tick several items to act on them together")}{view === "list" ? t(" · ลากโฟลเดอร์รูปมาวางบนแถว = ลงรูปรุ่นนั้น", " · Drop an image folder on a row = upload to that model") : ""}
        </p>
      )}

      {/* ☑️ ทำหลายรายการพร้อมกัน — แถบลอยล่างจอ (ของกลาง) */}
      <BulkActionBar
        count={view === "sort" ? 0 : sel.size}
        unit={t("รายการ", "items")}
        onClear={() => setSel(new Set())}
        extra={
          !allShownSelected && shown.length > sel.size ? (
            <button type="button" onClick={toggleAllShown} className="underline text-white/80 hover:text-white">
              {t(`เลือกทั้งหมดที่ตรงตัวกรอง (${shown.length}${pageCount > 1 ? " · ทุกหน้า" : ""})`, `Select all matching filter (${shown.length}${pageCount > 1 ? " · all pages" : ""})`)}
            </button>
          ) : null
        }
      >
        <button disabled={bulkBusy} onClick={() => void bulk({ isPublished: true }, t("ขึ้นเว็บ", "Publish"))} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 disabled:opacity-50">
          {t("ขึ้นเว็บ", "Publish")}
        </button>
        <button disabled={bulkBusy} onClick={() => void bulk({ isPublished: false }, t("ซ่อน", "Hide"))} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          {t("ซ่อน", "Hide")}
        </button>
        <button disabled={bulkBusy} onClick={() => void bulk({ featured: true }, t("ตั้งแนะนำ", "Feature"))} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          {t("⭐ ตั้งแนะนำ", "⭐ Feature")}
        </button>
        <button disabled={bulkBusy} onClick={() => void bulk({ featured: false }, t("เลิกแนะนำ", "Unfeature"))} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          {t("เลิกแนะนำ", "Unfeature")}
        </button>
        <button disabled={bulkBusy || !categories.length} onClick={() => { setMassPreset({ field: "categories", categories: { mode: "move", keys: [] } }); setMassOpen(true); }} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          {t("📂 ย้ายหมวด", "📂 Move category")}
        </button>
        <button disabled={bulkBusy} onClick={() => openImgMass([...sel])} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          {t("📸 ลงรูป", "📸 Upload images")}
        </button>
        <button disabled={bulkBusy} onClick={() => setGridEdit([...sel])} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">
          {t("▦ แก้แบบตาราง", "▦ Table edit")}
        </button>
        <button disabled={bulkBusy} onClick={() => { setMassPreset(null); setMassOpen(true); }} className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-medium hover:bg-slate-100 disabled:opacity-50">
          {t("✏️ แก้หลายรายการ", "✏️ Bulk edit")}
        </button>
      </BulkActionBar>

      {/* ✏️ แก้หลายรายการ — ช่องวาดจากทะเบียนกลาง (lib/website-listing-fields) */}
      <WebsiteListingsMassEdit
        open={massOpen}
        onClose={() => setMassOpen(false)}
        shopId={shop.id}
        rows={listings.filter((l) => sel.has(l.parentId)).map((l) => ({ parentId: l.parentId, categories: l.categories ?? [] }))}
        shopCategories={categories}
        preset={massPreset}
        onDone={async () => {
          await reload();
        }}
      />

      {/* 🛍 ตั้งค่าเว็บของสินค้า — ของกลางตัวเดียวกับแท็บ 🛍 ใน Parent SKU (เฉพาะร้านนี้) */}
      <Drawer
        open={!!webL && !parentOpen}
        onClose={() => goWeb(null)}
        size="xl"
        title={webL ? shownName(webL) : ""}
        description={webL ? `${webL.code} · ${priceText(webL)}${navIdx >= 0 ? ` · ${navIdx + 1}/${shown.length}` : ""}` : ""}
        hasUnsavedChanges={webSave.anyDirty}
        footer={
          <>
            {webL && (
              <button onClick={() => setRemoving(webL)} className="mr-auto text-xs text-red-500 hover:text-red-700 hover:underline">
                {t("🗑 เอาออกจากเว็บร้านนี้", "🗑 Remove from this shop's site")}
              </button>
            )}
            <button onClick={() => goWeb(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
              {t("ปิด", "Close")}
            </button>
            <FooterSaveButton host={webSave} />
          </>
        }
      >
        {webL && (
          <div className="space-y-3">
            {/* หัว: รูป · สถานะ · ลิงก์ · Parent SKU · เลื่อนตัวก่อน/ถัดไป */}
            <div className="flex items-start gap-3">
              <Thumb l={webL} size={64} />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${webL.published ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{webL.published ? t("ขึ้นเว็บอยู่", "Live") : t("ซ่อนอยู่", "Hidden")}</span>
                  {webL.featured && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">{t("★ แนะนำ", "★ Featured")}</span>}
                  {webL.display?.hero && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">{t("🎬 รูปเปิด", "🎬 Hero")}</span>}
                  {(issuesById.get(webL.parentId) ?? []).length > 0 && (
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-800">⚠️ {t("ต้องแก้", "Needs fixing")} {(issuesById.get(webL.parentId) ?? []).length}</span>
                  )}
                  <ColorDots colors={webL.display?.colors ?? []} max={8} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {webL.display?.productUrl && (
                    <>
                      <a href={webL.display.productUrl} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:border-slate-400">
                        {t("👁 ดูบนเว็บ ↗", "👁 View on web ↗")}
                      </a>
                      <CopyButton value={webL.display.productUrl} label={t("คัดลอกลิงก์", "Copy link")} title={t("คัดลอกลิงก์หน้าสินค้านี้", "Copy this product page link")} className="!py-1" />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (webSave.anyDirty) {
                        toast.info(t("บันทึกการแก้ไขก่อน แล้วค่อยเปิด Parent SKU", "Save your changes before opening the Parent SKU"));
                        return;
                      }
                      setParentOpen(webL.parentId);
                    }}
                    title={t("เปิดข้อมูลสินค้าเต็ม (หน้าต่างเดียวกับหน้า Parent SKU — ทุกแท็บ)", "Open full product data (same window as the Parent SKU page — all tabs)")}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:border-slate-500"
                  >
                    {t("📦 เปิด Parent SKU", "📦 Open Parent SKU")}
                  </button>
                  {!webL.published && <span className="text-[11px] text-slate-400">{t("ซ่อนอยู่ — ลูกค้าเปิดหน้านี้ไม่ได้จนกว่าจะขึ้นเว็บ", "Hidden — customers can't open this page until it's live")}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" disabled={navIdx <= 0} onClick={() => openWeb(shown[navIdx - 1].parentId)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title={t("ตัวก่อนหน้า", "Previous")} aria-label={t("ตัวก่อนหน้า", "Previous")}>
                  ◀
                </button>
                <button type="button" disabled={navIdx < 0 || navIdx >= shown.length - 1} onClick={() => openWeb(shown[navIdx + 1].parentId)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30" title={t("ตัวถัดไป", "Next")} aria-label={t("ตัวถัดไป", "Next")}>
                  ▶
                </button>
              </div>
            </div>
            <FooterSaveProvider value={webSave.register}>
              <ParentWebListings
                key={webL.parentId}
                parentId={webL.parentId}
                shopId={shop.id}
                focusSkuId={focus?.parentId === webL.parentId ? focus.skuId : null}
                onChanged={() => {
                  void reload();
                  // ราคา/ชื่อสีที่แก้ใน drawer → แถว SKU ย่อยที่กางอยู่ดึงใหม่ · ที่พับอยู่ล้างแคช (กางครั้งหน้าโหลดใหม่)
                  if (expanded.has(webL.parentId)) void loadSubSkus(webL.parentId);
                  else setSubSkus((m) => { const n = { ...m }; delete n[webL.parentId]; return n; });
                }}
                onOpenParent={() => {
                  if (webSave.anyDirty) {
                    toast.info(t("บันทึกการแก้ไขก่อน แล้วค่อยเปิด Parent SKU", "Save your changes before opening the Parent SKU"));
                    return;
                  }
                  setParentOpen(webL.parentId);
                }}
              />
            </FooterSaveProvider>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={!!pendingNav}
        onClose={() => setPendingNav(null)}
        onConfirm={() => {
          setOpen(pendingNav?.to ?? null);
          setPendingNav(null);
        }}
        title={t("มีข้อมูลที่ยังไม่บันทึก", "You have unsaved changes")}
        message={t("ต้องการออกโดยไม่บันทึกหรือไม่? (กด ยกเลิก แล้วกด 💾 บันทึก ที่แถบล่างก่อนได้)", "Leave without saving? (Click Cancel, then 💾 Save in the bottom bar first)")}
        confirmText={t("ออกโดยไม่บันทึก", "Leave without saving")}
        cancelText={t("อยู่ต่อ", "Stay")}
        variant="danger"
      />

      {/* 📦 Parent SKU ตัวเต็ม (ข้อมูลสินค้า/รูป/BOM/🛍 เว็บไซต์ …) — ปิดแล้วดึงค่าที่เว็บเห็นใหม่ */}
      {parentOpen && (
        <MasterRecordDrawer
          moduleKey="parent-skus-v2"
          apiPath="parent-skus"
          recordId={parentOpen}
          navIds={shown.map((l) => l.parentId)}
          onClose={() => {
            setParentOpen(null);
            void reload();
          }}
          onChanged={() => void reload()}
        />
      )}

      <ConfirmDialog
        open={!!bulkAsk}
        onClose={() => setBulkAsk(null)}
        onConfirm={() => { const a = bulkAsk; setBulkAsk(null); if (a) void bulk(a.p, a.msg, true); }}
        title={t(`${bulkAsk?.msg ?? ""} ${sel.size} รุ่นพร้อมกัน?`, `${bulkAsk?.msg ?? ""} ${sel.size} models at once?`)}
        message={bulkAsk?.p.isPublished
          ? t(`ทั้ง ${sel.size} รุ่นจะโชว์บนเว็บ ${shop.name} ให้ลูกค้าเห็นทันทีที่ร้านเปิด (ตอนนี้ขึ้นเว็บอยู่ ${counts.pub} จาก ${listings.length} รุ่น)${sel.size >= BULK_TYPED ? " — พิมพ์ CONFIRM เพื่อยืนยัน" : ""}`, `All ${sel.size} models will show on ${shop.name} for customers as soon as the shop is open (currently ${counts.pub} of ${listings.length} models live)${sel.size >= BULK_TYPED ? " — type CONFIRM to confirm" : ""}`)
          : t(`ทั้ง ${sel.size} รุ่นจะหายจากหน้าเว็บ ${shop.name} (สินค้าและข้อมูลไม่หาย เปิดกลับได้)${sel.size >= BULK_TYPED ? " — พิมพ์ CONFIRM เพื่อยืนยัน" : ""}`, `All ${sel.size} models will disappear from ${shop.name} (products and data are kept, can be turned back on)${sel.size >= BULK_TYPED ? " — type CONFIRM to confirm" : ""}`)}
        confirmText={t(`${bulkAsk?.msg ?? ""} ${sel.size} รุ่น`, `${bulkAsk?.msg ?? ""} ${sel.size} models`)}
        cancelText={t("ยกเลิก", "Cancel")}
        variant={bulkAsk?.p.isPublished ? "default" : "danger"}
        requireTyped={sel.size >= BULK_TYPED ? "CONFIRM" : undefined}
        loading={bulkBusy}
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && void removeProduct(removing)}
        title={t("เอาออกจากเว็บร้านนี้?", "Remove from this shop's site?")}
        message={removing ? t(`"${shownName(removing)}" จะหายจากเว็บ ${shop.name} (สินค้าใน ERP ไม่หาย · เพิ่มกลับได้ภายหลัง)`, `"${shownName(removing)}" will disappear from ${shop.name} (the ERP product is kept · can be added back later)`) : ""}
        confirmText={t("เอาออก", "Remove")}
        cancelText={t("ยกเลิก", "Cancel")}
        variant="danger"
        loading={!!removing && saving === removing.parentId}
      />
    </div>
  );
}
