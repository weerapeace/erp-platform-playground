"use client";

/** ของใช้ร่วมหน้าดีไซน์ — ชนิดข้อมูล · ค่าคงที่ · หน้าตาช่องกรอก · ปุ่มคืนค่า (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { useState } from "react";
import type { SiteTheme, ProductDetailItem, LogoMode, HeaderBg, MenuAlign, CardPreset, ImageRatio, CardHover, ProductLayout, ProductTitleStyle, ProductImageBg, ProductSection, ProductGalleryStyle, ProductDetailsStyle, ProductDetailsOpen, DetailSource } from "@/lib/website-theme";
import { defaultTextRole, FINE_COLOR_DEFAULTS, type ProductFonts, type Typography, type TextRole, type TextRoleKey } from "@/lib/website-theme";
import { type ShippingAutoKey } from "@/lib/website-content-sources";
import { type BaseColors } from "@/lib/website-theme-presets";
import { type DropStatus } from "@/lib/website-new-drops";
import { ColorPicker } from "@/components/color-picker";
import { type CheckoutPayInfo } from "@/components/website-checkout-settings";
import { PartStyleFold } from "@/components/website-part-style-editor";
import { type PartDef } from "@/lib/website-page-parts";
import { type PartArea } from "@/lib/website-site-design";
import { useDesign } from "./context";

/** 🔠 ขนาดตัวอักษรหน้าสินค้า — ตัวเลือก % */
export const FONT_LABELS: { k: keyof ProductFonts; label: string; hint: string }[] = [
  { k: "title", label: "ชื่อรุ่น", hint: "หัวเรื่องใหญ่ + ชื่อรอง" },
  { k: "price", label: "ราคา", hint: "ตัวเลขราคา" },
  { k: "heading", label: "หัวข้อ", hint: "หัวข้อพับเก็บ/แท็บ · แบนเนอร์ · คุณอาจชอบ" },
  { k: "body", label: "เนื้อหา", hint: "คำอธิบาย · รายละเอียด · ข้อความแบนเนอร์" },
];
export const FONT_SIZES = [70, 80, 90, 100, 110, 120, 130, 150];
/** ชนิดข้อมูลธีม = ของกลาง lib/website-theme (เดิมประกาศซ้ำในไฟล์นี้) */
export type Theme = SiteTheme;
export type Radius = SiteTheme["radius"];
export type DetailItem = ProductDetailItem;
export type { LogoMode, HeaderBg, MenuAlign, CardPreset, ImageRatio, CardHover, ProductLayout, ProductTitleStyle, ProductImageBg, ProductSection, ProductGalleryStyle, ProductDetailsStyle, ProductDetailsOpen, DetailSource, DetailApply, DetailOpen } from "@/lib/website-theme";
/** 📚 แหล่งในช่อง "เอาข้อมูลจาก" แบ่ง 2 กลุ่ม — ดึงจากสินค้า (ลบไม่ได้) / ข้อความของร้าน (คลังแหล่งข้อมูล ⚙) */
export const PRODUCT_DETAIL_SOURCES: DetailSource[] = ["description", "fields", "details", "dimensions"];
export const SHOP_DETAIL_SOURCES: DetailSource[] = ["shipping", "text"];
export interface SampleItem { name: string; price: number; comparePrice: number | null; unit: string; category: string; badge: string; stock: string; images: string[]; swatches: { color?: string; img?: string }[] }
export interface Choices {
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
  /** บรรทัดอัตโนมัติของ "การจัดส่ง & ชำระเงิน" ตามข้อมูลร้านตอนนี้ */
  shippingAuto?: { key: ShippingAutoKey; text: string }[];
  /** 💳 ช่องทางจ่ายที่เปิดอยู่ (เตือนในแท็บหน้าชำระเงิน) */
  payInfo?: CheckoutPayInfo;
  specFields?: { key: string; label: string; group?: string }[];
  fieldGroups?: Record<string, string>;
  /** ฟิลด์รูปของ Parent SKU (แบนเนอร์ source = field) */
  imageFields?: { key: string; label: string }[];
  categories?: { key: string; label: string }[];
  products?: { code: string; name: string }[];
  /** 🆕 ชุดมาใหม่ของร้าน (เมนู "หน้ามาใหม่" เลือกชุดเอง) — ล่าสุดก่อน */
  newDrops?: { id: string; title: string; status: DropStatus }[];
}
/** ช่องสีที่เป็นสี (ไม่รวมความเข้มสีอ่อน softPct ที่เป็นตัวเลข) */
export type ColorKey = Exclude<keyof Theme["colors"], "softPct">;
/** สีละเอียด (lib/website-theme FINE_COLOR_DEFAULTS) — ไว้นับ "แก้แล้ว" */
export const FINE_COLOR_KEYS = Object.keys(FINE_COLOR_DEFAULTS) as (keyof typeof FINE_COLOR_DEFAULTS)[];
/** บทบาทตัวอักษร — ธีมเก่าที่ยังไม่มีบทบาทใหม่ (เช่น เมนูย่อย) = ค่าเริ่มต้น */
export const roleOf = (t: { typography: Partial<Typography> }, k: TextRoleKey): TextRole => t.typography[k] ?? defaultTextRole(k);
export const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: "brand", label: "สีหลักแบรนด์", hint: "ปุ่มหลัก ราคา ลิงก์สำคัญ" },
  { key: "brandDeep", label: "สีหลักเข้ม", hint: "ตอนชี้เมาส์ปุ่ม" },
  { key: "ink", label: "สีตัวอักษรหลัก", hint: "หัวข้อและเนื้อหา" },
  { key: "muted", label: "สีตัวอักษรรอง", hint: "คำอธิบายจาง ๆ" },
  { key: "page", label: "สีพื้นหลังเว็บ", hint: "พื้นหลังทั้งหน้า" },
  { key: "surface", label: "สีพื้นการ์ด", hint: "กล่อง/การ์ดสินค้า" },
];
export const PRESETS: { name: string; theme: { colors: BaseColors; fonts: Pick<Theme["fonts"], "display" | "body">; radius: Radius } }[] = [
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
export const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
export const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
export const cardCls = "rounded-xl border border-slate-200 bg-white p-4";
export const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};
/* ─────────── สีแบบเลือกได้/ล้างได้ (ตามธีม) — ใช้ในแท็บตัวอักษร ─────────── */
export function ColorField({ label, value, onChange, emptyLabel = "ตามธีม" }: { label: string; value: string; onChange: (hex: string) => void; emptyLabel?: string }) {
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
// 🎨 ปรับละเอียดทีละชิ้นของ ตะกร้า/ชำระเงิน/หัวเว็บ/ท้ายเว็บ (ค่าเก็บที่ theme.page.areaParts · ของกลาง PartStyleFold · เปิดครั้งแรก = พาพรีวิวไป path)
export function useAreaFold() {
  const { theme, apply, setPage } = useDesign();
  return (area: PartArea, parts: PartDef[], hint: string, path?: string) =>
  theme ? (
    <div className={cardCls}>
      <PartStyleFold parts={parts} value={theme.page.areaParts[area]} onChange={(v) => apply({ ...theme, page: { ...theme.page, areaParts: { ...theme.page.areaParts, [area]: v } } })} colors={theme.colors} onOpen={path ? () => setPage(path) : undefined} hint={hint} testId={area} />
    </div>
  ) : null;
}

/** ↺ คืนค่าที่เผยแพร่อยู่ (โชว์เฉพาะตอนค่าต่างจากที่เผยแพร่) */
export const ResetBtn = ({ onClick, show }: { onClick: () => void; show: boolean }) =>
  show ? (
    <button onClick={onClick} title="คืนค่าที่เผยแพร่อยู่" className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-400 text-xs">
      ↺
    </button>
  ) : null;
