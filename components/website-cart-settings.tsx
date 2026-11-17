"use client";

/**
 * 🛒 ตั้งค่าดีไซน์ตะกร้า (แท็บ ดีไซน์ → 🛒 ตะกร้า) — ค่าใน theme.cart (lib/website-cart · มิเรอร์ storefront src/lib/cart-config.ts)
 * เว็บร้านวาดที่ components/cart/* — ลิ้นชักตะกร้า + หน้า /cart ใช้ตัววาดเดียวกัน
 * พรีวิว: ตอนอยู่แท็บนี้ หน้าตั้งค่าสั่งให้เว็บในพรีวิวเปิดตะกร้าค้างไว้ (ตะกร้าว่าง = ใส่สินค้าตัวอย่างให้ดู ไม่ใส่ตะกร้าจริง)
 * 🧾 หน้าตะกร้าเต็มหน้า: แบบแยกรายการ · ปุ่มในลิ้นชัก · ติ๊กเลือกชิ้น · เปลี่ยนสี/ไซส์ · สลักชื่อ · ห่อ/การ์ดรายชิ้น (giftMode)
 * 🔗 เข้าชุดกับชิ้นนี้ (lineRelated) · 🗂 แท็บในชุดแนะนำ (ดูล่าสุด/รายการโปรด/ซื้อคู่กันบ่อย) · 🏷 ป้ายซื้อคู่ลดเพิ่ม
 */
import { LangInput, LangTag } from "@/components/bilingual-field";
import { useState, type ReactNode } from "react";
import { Seg } from "@/components/website-block-editor";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import {
  CART_IMAGE_RADIUS_DEFAULT,
  CART_IMAGE_RADIUS_MAX,
  CART_IMAGE_SIZES,
  CART_PAGE_BTNS,
  CART_PAGE_LAYOUTS,
  CART_RECS_LAYOUTS,
  CART_RECS_POSITIONS,
  CART_RECS_SOURCES,
  CART_RECS_WHENS,
  CART_STYLES,
  CART_TAB_LABELS,
  CART_WIDTHS,
  DEFAULT_CART_ICONS,
  EMOJI_CART_ICONS,
  DEFAULT_RECS_SET,
  DEFAULT_TRUST_ITEMS,
  MAX_RECS_SETS,
  TRUST_ICON_SIZE,
  etaLine,
  freeShipLine,
  type CartConfig,
  type CartIcons,
  type CartRecsSet,
  type CartStyle,
  type CartTrustIconColor,
  type CartUnitPriceWhen,
} from "@/lib/website-cart";
import { webForm } from "@/lib/website-form-styles";
import { RangeInput } from "@/components/range-input";
import { SiteIcon, SiteIconPicker } from "@/components/site-icon-picker";
import { DesignCard, useInDesignCards } from "@/components/website-design/design-card";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

const lbl = webForm.label;
const input = "w-full h-8 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-400";
const card = "rounded-xl border border-slate-200 bg-white p-4 space-y-3";

/** ชื่อ/คำอธิบายตัวเลือกจาก lib/website-cart (ไฟล์มิเรอร์ storefront — คงไทย) → แปลตอนแสดงในหน้าแอดมิน */
const CART_LIB_EN: Record<string, string> = {
  "ลิ้นชักขวา (เดิม)": "Right drawer (original)",
  "ลิ้นชักซ้าย": "Left drawer",
  "หน้าต่างกลางจอ": "Center window",
  "แคบ": "Narrow",
  "กลาง (เดิม)": "Medium (original)",
  "กว้าง": "Wide",
  "เล็ก": "Small",
  "ใหญ่": "Large",
  "บนสุด": "Top",
  "เห็นก่อนรายการสินค้า — ตะกร้าว่างก็ขึ้นบนสุด": "Seen before the items — also on top when the cart is empty",
  "ต่อจากรายการสินค้า": "After the items",
  "อยู่ก่อนโค้ดส่วนลด / หมายเหตุ / ห่อของขวัญ": "Before discount code / note / gift wrap",
  "ท้ายรายการ (แบบเดิม)": "End of list (original)",
  "ต่อจากโค้ดส่วนลด / หมายเหตุ — ต้องเลื่อนลงถึงจะเห็น": "After discount code / note — needs scrolling to see",
  "ติดเหนือยอดรวม": "Pinned above total",
  "เห็นตลอดไม่ต้องเลื่อน (การ์ดเล็กลง) · หน้า /cart = ใต้กล่องยอดรวม": "Always visible, no scrolling (smaller cards) · /cart page = under the total box",
  "เลื่อนข้าง": "Side scroll",
  "การ์ดรูปเรียงแถวเดียว ปัดดูได้": "Image cards in one swipeable row",
  "ตาราง": "Grid",
  "การ์ดรูปหลายคอลัมน์": "Image cards in several columns",
  "แถวรายการ": "List rows",
  "รูปเล็ก + ชื่อ + ราคา + ปุ่ม เรียงลงมา": "Small image + name + price + button, stacked",
  "ติ๊กเพิ่ม": "Tick to add",
  'ช่องติ๊ก "เพิ่ม +฿X" — เหมาะกับของซื้อคู่ (ติ๊ก = ใส่ตะกร้า · เอาติ๊กออก = เอาออก)': 'An "Add +฿X" checkbox — good for add-ons (tick = add to cart · untick = remove)',
  "ทุกครั้ง (เดิม)": "Always (original)",
  "เฉพาะมีของในตะกร้า": "Only when cart has items",
  "เฉพาะตะกร้าว่าง": "Only when cart is empty",
  "อัตโนมัติ": "Auto",
  "หมวดเดียวกับของในตะกร้า + ที่ติ๊กแนะนำ/ขายดี (ไม่ซ้ำของในตะกร้า)": "Same categories as cart items + featured/best sellers (no repeats of cart items)",
  "เฉพาะที่ติ๊กแนะนำ": "Featured only",
  "สินค้าที่ติ๊ก ⭐ แนะนำในหน้าสินค้าบนเว็บ": "Products ticked ⭐ Featured in Web products",
  "เลือกเอง": "Pick manually",
  "เลือกรุ่นที่จะโชว์ (เรียงตามที่เลือก)": "Pick models to show (in picked order)",
  "ตามหมวด": "By category",
  "สินค้าในหมวดที่เลือก (เช่น ของแต่งกระเป๋า) — แนะนำ/ขายดีขึ้นก่อน": "Products in picked categories (e.g. bag accessories) — featured/best sellers first",
  "ดูล่าสุด": "Recently viewed",
  "สินค้าที่ลูกค้าคนนั้นเปิดดูแล้วยังไม่ได้ซื้อ (จำในเครื่องลูกค้า · ยังไม่เคยดู = ไม่โชว์)": "Products this customer viewed but didn't buy (stored on their device · nothing viewed = hidden)",
  "รายการโปรด": "Wishlist",
  "สินค้าที่สมาชิกกด ♡ ไว้ (ต้องเปิดระบบสมาชิก · ยังไม่เข้าสู่ระบบ = ไม่โชว์)": "Products the member hearted ♡ (needs membership on · not logged in = hidden)",
  "ซื้อคู่กันบ่อย": "Often bought together",
  "จากออเดอร์จริงที่มีของในตะกร้า (ออเดอร์ยังน้อย = อาจว่าง)": "From real orders containing the cart items (few orders = may be empty)",
  "แบบเดิม": "Original",
  "รายการซ้าย · ยอดรวมขวา": "Items left · total right",
  "แยกรายการ + สรุปขวา": "Split items + summary right",
  "ป้ายหมวด · ราคาชิดขวา · ไอคอนโปรด/ลบท้ายแถว · กล่องสรุปแบบตาราง": "Category labels · right-aligned prices · wishlist/delete icons at row end · table-style summary",
  "อัตโนมัติ (เดิม)": "Auto (original)",
  "ปุ่มเต็ม": "Full button",
  "ลิงก์เล็ก": "Small link",
  "ไม่มี": "None",
};
const cartEn = (th: string) => tr(th, CART_LIB_EN[th] ?? th);
/** ชื่อแท็บชุดแนะนำ — lib มีทั้งไทย/อังกฤษอยู่แล้ว ([th, en]) */
const tabLabel = (k: keyof typeof CART_TAB_LABELS) => tr(CART_TAB_LABELS[k][0], CART_TAB_LABELS[k][1]);

/**
 * การ์ดตั้งค่า (หัว + คำอธิบาย + สวิตช์เปิด/ปิด) — ใช้ร่วมกับแท็บ 💳 หน้าชำระเงิน (website-checkout-settings) · 🔗 แนะนำสินค้า
 * อยู่ในหน้าดีไซน์ = การ์ดพับ/กางได้ (DesignCard · ตอนพับโชว์ เปิด/ปิด + คำอธิบาย)
 */
export function Card({ title, hint, children, on, onToggle }: { title: string; hint?: string; children?: ReactNode; on?: boolean; onToggle?: (v: boolean) => void }) {
  const t = useT();
  const foldable = useInDesignCards();
  const toggle = onToggle && (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer shrink-0">
      <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={!!on} onChange={(e) => onToggle(e.target.checked)} />
      {on ? t("เปิด", "On") : t("ปิด", "Off")}
    </label>
  );
  if (foldable)
    return (
      <DesignCard title={title} hint={hint} summary={onToggle ? `${on ? t("เปิดอยู่", "On") : t("ปิดอยู่", "Off")}${hint ? ` · ${hint}` : ""}` : undefined} right={toggle}>
        {(on ?? true) && <div className="space-y-3">{children}</div>}
      </DesignCard>
    );
  return (
    <div className={card}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
        </div>
        {toggle}
      </div>
      {(on ?? true) && children}
    </div>
  );
}

export function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * ช่องข้อความมีหัวข้อ (ตะกร้า / หน้าชำระเงิน) — ส่ง obj + k + onPatch = สลับ ไทย | EN ตามสวิตช์ทั้งหน้าดีไซน์ (LangInput · เก็บ k_en)
 * ส่ง value + onChange แบบเดิม = ช่องไทยอย่างเดียว
 */
export function Text({
  label,
  value,
  onChange,
  placeholder,
  max = 80,
  obj,
  k,
  onPatch,
  enPlaceholder,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  max?: number;
  obj?: object;
  k?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPatch?: (patch: { [key: string]: any }) => void;
  enPlaceholder?: string;
}) {
  return (
    <label className="block">
      <span className={lbl}>
        {label}
        {obj && <LangTag />}
      </span>
      {obj && k && onPatch ? (
        <LangInput className={input} obj={obj} k={k} onPatch={onPatch} maxLength={max} placeholder={placeholder} enPlaceholder={enPlaceholder} />
      ) : (
        <input className={input} value={value ?? ""} maxLength={max} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} />
      )}
    </label>
  );
}

/** ภาพย่อรูปแบบตะกร้า (ลิ้นชักขวา/ซ้าย/กลางจอ) */
function StyleThumb({ style }: { style: CartStyle }) {
  const panel = style === "modal" ? { left: "22%", width: "56%", top: "18%", height: "64%", borderRadius: 4 } : style === "drawer-left" ? { left: 0, width: "42%", top: 0, height: "100%" } : { right: 0, width: "42%", top: 0, height: "100%" };
  return (
    <span className="relative block w-full h-12 rounded-md bg-slate-200 overflow-hidden">
      <span className="absolute bg-white shadow" style={panel}>
        <span className="block mx-1.5 mt-1.5 h-1 rounded bg-slate-300" />
        <span className="block mx-1.5 mt-1 h-2.5 rounded bg-slate-100" />
        <span className="block mx-1.5 mt-1 h-2.5 rounded bg-slate-100" />
      </span>
    </span>
  );
}

/** ช่องไอคอนอีโมจิ (ว่าง = ไม่มีไอคอน) */
/** 🛍 ตั้งค่าสินค้าแนะนำ 1 ชุด */
/** หมวดเว็บของร้าน (ชิปเลือกหลายหมวด) */
export type CartCatChoice = { key: string; label: string; parent?: string | null };
function CatChips({ cats, value, onChange, empty }: { cats: CartCatChoice[]; value: string[]; onChange: (v: string[]) => void; empty: string }) {
  const t = useT();
  if (!cats.length) return <p className="text-[11px] text-slate-400">{t("ยังไม่มีหมวด — ตั้งที่แท็บ 📂 หมวดหมู่", "No categories yet — set them in the 📂 Categories tab")}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {cats.map((c) => {
        const on = value.includes(c.key);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(on ? value.filter((k) => k !== c.key) : [...value, c.key])}
            className={`px-2.5 py-1 rounded-full border text-xs ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
          >
            {on ? "✓ " : ""}
            {c.parent ? "↳ " : ""}
            {c.label}
          </button>
        );
      })}
      {!value.length && <span className="text-[11px] text-slate-400 self-center">{empty}</span>}
    </div>
  );
}

function RecsSetEditor({ value: r, onChange, shopSlug, categories, index, onRemove, dragHandle }: { value: CartRecsSet; onChange: (v: CartRecsSet) => void; shopSlug: string; categories: CartCatChoice[]; index: number; onRemove?: () => void; dragHandle?: ReactNode }) {
  const t = useT();
  const set = (p: Partial<CartRecsSet>) => onChange({ ...r, ...p });
  const layouts = CART_RECS_LAYOUTS.map((o) => ({ v: o.value, l: cartEn(o.label) }));
  const hint = (v: string) => cartEn(CART_RECS_LAYOUTS.find((o) => o.value === v)?.hint ?? "");
  const usesCards = r.layout !== "addon" || r.pageLayout !== "addon";
  // หน้าตาช่องเดียว = เปลี่ยนทั้งลิ้นชัก + หน้า /cart (พรีวิวเปิดหน้าไหนก็เห็นผล) · กด "ตั้งหน้า /cart แยก" เมื่ออยากให้ต่างกัน
  const [split, setSplit] = useState(r.layout !== r.pageLayout);
  return (
    <div className={`rounded-xl border p-3 space-y-3 ${r.on ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-slate-50/60"}`}>
      <div className="flex items-center gap-2">
        {dragHandle}
        <span className="text-xs font-semibold text-slate-700">{t("ชุดที่", "Set")} {index + 1}</span>
        <span className="text-xs text-slate-500 truncate">{r.title || t("(ไม่มีหัวข้อ)", "(no title)")}</span>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer shrink-0">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={r.on} onChange={(e) => set({ on: e.target.checked })} />
          {r.on ? t("เปิด", "On") : t("ปิด", "Off")}
        </label>
        {onRemove && (
          <button type="button" onClick={onRemove} className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300" title={t("ลบชุดนี้", "Delete this set")}>
            ×
          </button>
        )}
      </div>
      {r.on && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label={t("หัวข้อ (ว่าง = ไม่มีหัวข้อ)", "Title (empty = no title)")} obj={r} k="title" onPatch={set} placeholder="คุณอาจชอบ / ซื้อคู่กัน" max={40} />
            <div>
              <span className={lbl}>{t("จำนวนสูงสุด", "Max items")}</span>
              <Seg value={String(r.limit)} onChange={(v) => set({ limit: Number(v) })} options={[1, 2, 3, 4, 6, 8, 10, 12].map((n) => ({ v: String(n), l: String(n) }))} wheel />
            </div>
          </div>
          <div>
            <span className={lbl}>{t("เลือกสินค้าจาก", "Pick products from")}</span>
            <Seg value={r.source} onChange={(source) => set({ source })} options={CART_RECS_SOURCES.map((o) => ({ v: o.value, l: cartEn(o.label) }))} />
            <p className="text-[11px] text-slate-500 mt-1">{cartEn(CART_RECS_SOURCES.find((o) => o.value === r.source)?.hint ?? "")}</p>
          </div>
          <div>
            <span className={lbl}>{t("🗂 แท็บเพิ่มในชุดนี้ (ลูกค้าสลับดูได้ · สูงสุด 3 · แท็บที่ไม่มีของซ่อนเอง)", "🗂 Extra tabs in this set (customers can switch · max 3 · empty tabs hide)")}</span>
            <div className="flex flex-wrap gap-1.5">
              {CART_RECS_SOURCES.filter((o) => o.value !== r.source && o.value !== "manual" && o.value !== "category").map((o) => {
                const on = r.tabs.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set({ tabs: on ? r.tabs.filter((x) => x !== o.value) : [...r.tabs, o.value].slice(0, 3) })}
                    className={`px-2.5 py-1 rounded-full border text-xs ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    title={cartEn(o.hint)}
                  >
                    {on ? "✓ " : "+ "}
                    {tabLabel(o.value)}
                  </button>
                );
              })}
            </div>
            {r.tabs.length > 0 && <p className="text-[11px] text-slate-500 mt-1">{t("แท็บแรก = “", "First tab = “")}{tabLabel(r.source)}{t("” (ที่มาหลักด้านบน) แล้วตามด้วย", "” (main source above), then")} {r.tabs.map((x) => tabLabel(x)).join(" · ")}</p>}
          </div>
          {r.source === "category" && (
            <div>
              <span className={lbl}>{t("หมวดที่ดึงสินค้ามาแนะนำ", "Categories to recommend from")}</span>
              <CatChips cats={categories} value={r.cats} onChange={(cats) => set({ cats })} empty={t("ยังไม่ได้เลือก = ไม่โชว์ชุดนี้", "None picked = set hidden")} />
            </div>
          )}
          <div>
            <span className={lbl}>{t("🎯 โชว์เฉพาะเมื่อในตะกร้ามีสินค้าหมวด… (ไม่เลือก = โชว์ทุกครั้ง)", "🎯 Show only when the cart has products in… (none = always show)")}</span>
            <CatChips cats={categories} value={r.ifCats} onChange={(ifCats) => set({ ifCats })} empty={t("ทุกตะกร้า", "Every cart")} />
            {r.ifCats.length > 0 && <p className="text-[11px] text-slate-500 mt-1">{t("เช่น ในตะกร้ามีกระเป๋า → โชว์ “ของแต่งกระเป๋า” · ตะกร้าว่าง = ไม่โชว์ชุดนี้", "e.g. cart has a bag → show “bag accessories” · empty cart = set hidden")}</p>}
          </div>
          {r.source === "manual" && (
            <div>
              <span className={lbl}>{t("รุ่นที่จะโชว์ (เรียงตามที่เลือก · สูงสุด 24)", "Models to show (in picked order · max 24)")}</span>
              <WebsiteProductPicker shopSlug={shopSlug} value={r.codes} max={24} onChange={(codes) => set({ codes })} />
              {!r.codes.length && <p className="text-[11px] text-amber-700 mt-1">{t("⚠ ยังไม่ได้เลือกรุ่น — ลูกค้าจะไม่เห็นชุดนี้", "⚠ No models picked — customers won't see this set")}</p>}
            </div>
          )}
          {split ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className={lbl}>{t("หน้าตาในลิ้นชัก/หน้าต่าง", "Look in drawer/window")}</span>
                <Seg value={r.layout} onChange={(layout) => set({ layout })} options={layouts} />
                <p className="text-[11px] text-slate-500 mt-1">{hint(r.layout)}</p>
              </div>
              <div>
                <span className={lbl}>{t("หน้าตาในหน้า /cart", "Look on /cart page")}</span>
                <Seg value={r.pageLayout} onChange={(pageLayout) => set({ pageLayout })} options={layouts} />
                <p className="text-[11px] text-slate-500 mt-1">{hint(r.pageLayout)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  set({ pageLayout: r.layout });
                  setSplit(false);
                }}
                className="sm:col-span-2 text-left text-xs text-blue-600 hover:underline"
              >
                {t("↺ ใช้หน้าตาเดียวกันทั้งลิ้นชักและหน้า /cart", "↺ Use the same look for drawer and /cart")}
              </button>
            </div>
          ) : (
            <div>
              <span className={lbl}>{t("หน้าตา (ลิ้นชัก + หน้า /cart)", "Look (drawer + /cart page)")}</span>
              <Seg value={r.layout} onChange={(layout) => set({ layout, pageLayout: layout })} options={layouts} />
              <p className="text-[11px] text-slate-500 mt-1">
                {hint(r.layout)} ·{" "}
                <button type="button" onClick={() => setSplit(true)} className="text-blue-600 hover:underline">
                  {t("ตั้งหน้า /cart แยก", "Set /cart separately")}
                </button>
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={lbl}>{t("ตำแหน่ง", "Position")}</span>
              <Seg value={r.place} onChange={(place) => set({ place })} options={CART_RECS_POSITIONS.map((o) => ({ v: o.value, l: cartEn(o.label) }))} />
              <p className="text-[11px] text-slate-500 mt-1">{cartEn(CART_RECS_POSITIONS.find((o) => o.value === r.place)?.hint ?? "")}</p>
            </div>
            <div>
              <span className={lbl}>{t("โชว์เมื่อ", "Show when")}</span>
              <Seg value={r.when} onChange={(when) => set({ when })} options={CART_RECS_WHENS.map((o) => ({ v: o.value, l: cartEn(o.label) }))} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className={lbl}>{t("ขนาดรูป", "Image size")}</span>
              <Seg value={r.imageSize} onChange={(imageSize) => set({ imageSize })} options={[{ v: "sm", l: t("เล็ก", "Small") }, { v: "md", l: t("กลาง (เดิม)", "Medium (original)") }, { v: "lg", l: t("ใหญ่", "Large") }]} wheel />
            </div>
            <div>
              <span className={lbl}>{t("ทรงรูป", "Image shape")}</span>
              <Seg value={r.imageShape} onChange={(imageShape) => set({ imageShape })} options={[{ v: "rounded", l: t("มน (เดิม)", "Rounded (original)") }, { v: "square", l: t("เหลี่ยม", "Square") }, { v: "circle", l: t("วงกลม", "Circle") }]} />
            </div>
            {(r.layout === "grid" || r.pageLayout === "grid") && (
              <div>
                <span className={lbl}>{t("คอลัมน์ตาราง (หน้า /cart บนคอม)", "Grid columns (/cart on desktop)")}</span>
                <Seg value={String(r.cols)} onChange={(v) => set({ cols: Number(v) })} options={[{ v: "0", l: t("อัตโนมัติ", "Auto") }, ...["2", "3", "4", "5", "6"].map((v) => ({ v, l: v }))]} wheel />
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Check label={t("ชื่อสินค้า", "Product name")} checked={r.showName} onChange={(showName) => set({ showName })} />
            <Check label={t("ราคา", "Price")} checked={r.showPrice} onChange={(showPrice) => set({ showPrice })} />
            <Check label={t("ราคาเต็มขีดฆ่า", "Strikethrough full price")} checked={r.showCompare} onChange={(showCompare) => set({ showCompare })} />
          </div>
          {usesCards && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label={t("ข้อความปุ่ม (ว่าง = + ใส่ตะกร้า)", "Button text (empty = default)")} obj={r} k="btnText" onPatch={set} placeholder="+ ใส่ตะกร้า" max={30} />
              <div>
                <span className={lbl}>{t("หน้าตาปุ่ม", "Button look")}</span>
                <Seg value={r.btnStyle} onChange={(btnStyle) => set({ btnStyle })} options={[{ v: "outline", l: t("ขอบมน (เดิม)", "Rounded outline (original)") }, { v: "brand", l: t("ทึบสีแบรนด์", "Solid brand color") }, { v: "text", l: t("ข้อความ", "Text") }]} />
              </div>
            </div>
          )}
          <Check
            label={t("ยอดยังไม่ถึงส่งฟรี → ดันสินค้าที่ราคาพอดีให้ถึงส่งฟรีขึ้นก่อน", "Below free shipping → push products that reach free shipping first")}
            hint={t("เช่น ขาดอีก ฿150 → สินค้าราคา ฿150 ขึ้นไปที่ใกล้ที่สุดขึ้นหน้า (ต้องตั้งยอดส่งฟรีในข้อมูลร้าน)", "e.g. ฿150 short → closest products from ฿150 up come first (needs a free-shipping amount in Shop info)")}
            checked={r.freeShip}
            onChange={(freeShip) => set({ freeShip })}
          />
        </>
      )}
    </div>
  );
}

export function CartSettings({
  value: c,
  onChange,
  shopSlug,
  categories = [],
  onPreviewPage,
}: {
  value: CartConfig;
  onChange: (v: CartConfig) => void;
  shopSlug: string;
  /** หมวดเว็บของร้าน (ชุดสินค้าแนะนำตามหมวด) */
  categories?: CartCatChoice[];
  /** สั่งพรีวิวไปหน้า (เช่น /cart) */
  onPreviewPage?: (path: string) => void;
}) {
  const t = useT();
  const set = (p: Partial<CartConfig>) => onChange({ ...c, ...p });
  const trust = c.trustItems;
  const setTrust = (items: CartConfig["trustItems"]) => set({ trustItems: items });
  const drag = useDragReorder((from, to) => setTrust(moveItem(trust, from, to)));
  // 🛍 ชุดสินค้าแนะนำ (≤ 3)
  const sets = c.recsSets;
  const setSets = (recsSets: CartRecsSet[]) => set({ recsSets });
  const setsDrag = useDragReorder((from, to) => setSets(moveItem(sets, from, to)));
  const newSetId = () => {
    for (let i = 1; i < 99; i++) if (!sets.some((x) => x.id === `s${i}`)) return `s${i}`;
    return `s${Date.now() % 100000}`;
  };
  const icon = (k: keyof CartIcons) => c.icons[k];
  const setIcon = (k: keyof CartIcons, v: string) => set({ icons: { ...c.icons, [k]: v } });
  // ตัวอย่างข้อความส่งฟรี (ยอดขาด ฿350)
  const fsSample = freeShipLine(c.freeShipText, "฿350");

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">
        {t("👁 อยู่แท็บนี้ → พรีวิวเปิดตะกร้าค้างไว้ให้ดู (ตะกร้าว่าง = ใส่สินค้าตัวอย่างให้ ไม่ใช่ตะกร้าจริง)", "👁 While on this tab the preview keeps the cart open (empty cart = sample products, not a real cart)")}
        {onPreviewPage && (
          <>
            {" · "}
            <button type="button" onClick={() => onPreviewPage("/cart")} className="text-blue-600 hover:underline">
              {t("ดูหน้าตะกร้าเต็มหน้า (/cart)", "View full cart page (/cart)")}
            </button>
          </>
        )}
      </p>

      {/* ── หน้าตา ── */}
      <Card title={t("🧺 หน้าตาตะกร้า", "🧺 Cart look")} hint={t("ค่าเริ่มต้น = แบบเดิม (ลิ้นชักขวา กว้างกลาง)", "Default = original (right drawer, medium width)")}>
        <div>
          <span className={lbl}>{t("เปิดแบบ", "Opens as")}</span>
          <div className="grid grid-cols-3 gap-2">
            {CART_STYLES.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set({ style: o.value })}
                className={`rounded-lg border p-1.5 text-[11px] text-center ${c.style === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                <StyleThumb style={o.value} />
                <span className="block mt-1">{cartEn(o.label)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={lbl}>{t("ความกว้าง (มือถือ = เต็มจอเสมอ)", "Width (mobile = always full screen)")}</span>
            <Seg value={c.width} onChange={(width) => set({ width })} options={CART_WIDTHS.map((w) => ({ v: w.value, l: `${cartEn(w.label)} ${w.px}px` }))} wheel />
          </div>
          <Text label={t("หัวข้อ", "Title")} obj={c} k="title" onPatch={set} placeholder="ตะกร้า" max={40} />
        </div>
        <div>
          <span className={lbl}>{t("กดไอคอนตะกร้าที่หัวเว็บ", "Header cart icon click")}</span>
          <Seg
            value={c.openMode}
            onChange={(openMode) => set({ openMode })}
            options={[
              { v: "drawer", l: t("เปิดลิ้นชัก (เดิม)", "Open drawer (original)") },
              { v: "page", l: t("ไปหน้าตะกร้าเต็มหน้า /cart", "Go to full cart page /cart") },
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-1">{t("หน้า /cart ใช้ได้เสมอ (ส่งลิงก์ให้ลูกค้าได้) · กดใส่ตะกร้าจากการ์ดสินค้ายังเด้งลิ้นชักให้เห็นทันที", "/cart always works (you can send the link) · add-to-cart from product cards still pops the drawer")}</p>
        </div>
      </Card>

      {/* ── รายการสินค้า ── */}
      <Card title={t("🧾 รายการสินค้าในตะกร้า", "🧾 Cart items")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className={lbl}>{t("ขนาดรูป", "Image size")}</span>
            <Seg value={c.imageSize} onChange={(imageSize) => set({ imageSize })} options={CART_IMAGE_SIZES.map((s) => ({ v: s.value, l: cartEn(s.label) }))} wheel />
          </div>
          <div>
            <span className={lbl}>{t("ทรงรูป", "Image shape")}</span>
            <Seg
              value={c.imageShape}
              onChange={(imageShape) => set({ imageShape })}
              options={[
                { v: "rounded", l: t("มน (เดิม)", "Rounded (original)") },
                { v: "square", l: t("เหลี่ยม", "Square") },
                { v: "circle", l: t("วงกลม", "Circle") },
              ]}
            />
            {/* มนแค่ไหน — 12 = เดิม · มากสุด = เกือบวงกลม */}
            {c.imageShape === "rounded" && (
              <div className="mt-2" data-cart-radius>
                <span className="text-[11px] text-slate-500 flex items-center gap-2">
                  {t("ความมน", "Roundness")} {c.imageRadius}px
                  {c.imageRadius !== CART_IMAGE_RADIUS_DEFAULT && (
                    <button type="button" onClick={() => set({ imageRadius: CART_IMAGE_RADIUS_DEFAULT })} className="text-blue-600 hover:underline">
                      {t("↺ เดิม (", "↺ Original (")}{CART_IMAGE_RADIUS_DEFAULT})
                    </button>
                  )}
                </span>
                <RangeInput min={0} max={CART_IMAGE_RADIUS_MAX} value={c.imageRadius} onChange={(imageRadius) => set({ imageRadius })} unit="px" className="w-full accent-blue-600" />
              </div>
            )}
          </div>
          <div>
            <span className={lbl}>{t("รูปในกรอบ", "Image fit")}</span>
            <Seg
              value={c.imageFit}
              onChange={(imageFit) => set({ imageFit })}
              options={[
                { v: "cover", l: t("เต็มกรอบ (เดิม)", "Fill frame (original)") },
                { v: "contain", l: t("เห็นครบ", "Show whole image") },
              ]}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check label={t("โชว์ตัวเลือกที่ลูกค้าเลือก (สี/ขนาด/ปั๊มชื่อ)", "Show chosen options (color/size/name stamp)")} checked={c.showOptions} onChange={(showOptions) => set({ showOptions })} />
          <div>
            <Check label={t("โชว์ราคาต่อชิ้น", "Show unit price")} hint={t("เช่น ฿320 / ชิ้น ใต้ชื่อ", "e.g. ฿320 / pc under the name")} checked={c.showUnitPrice} onChange={(showUnitPrice) => set({ showUnitPrice })} />
            {c.showUnitPrice && (
              <div className="mt-1.5 ml-6" data-cart-unit-when>
                <Seg<CartUnitPriceWhen>
                  value={c.unitPriceWhen}
                  onChange={(unitPriceWhen) => set({ unitPriceWhen })}
                  options={[
                    { v: "all", l: t("ทุกรายการ (เดิม)", "Every item (original)") },
                    { v: "multi", l: t("เฉพาะที่มี 2 ชิ้นขึ้นไป", "Only qty 2 or more") },
                  ]}
                />
              </div>
            )}
          </div>
          <Check label={t("โชว์ราคาเต็มขีดฆ่า + “ประหยัด ฿X”", "Show strikethrough price + “Save ฿X”")} hint={t("เฉพาะสินค้าที่ตั้งราคาเต็มไว้", "Only products with a full price set")} checked={c.showCompare} onChange={(showCompare) => set({ showCompare })} />
          <Check label={t("♡ ปุ่ม “ย้ายไปรายการโปรด”", "♡ “Move to wishlist” button")} hint={t("เอาออกจากตะกร้า + เก็บในรายการโปรด · ใครกดได้ตั้งที่ หน้าสินค้า › ♡ รายการโปรด (เฉพาะสมาชิก = ต้องเปิดระบบสมาชิก · ไม่ต้องสมัคร = ทุกคน)", "Removes from cart + saves to wishlist · who can use it is set in Product page › ♡ Wishlist (members only = needs membership on · no sign-up = everyone)")} checked={c.wishlist} onChange={(wishlist) => set({ wishlist })} />
        </div>
      </Card>

      {/* ── หน้าตะกร้าเต็มหน้า ── */}
      <Card title={t("🧾 หน้าตะกร้าเต็มหน้า (/cart) + ตัวเลือกต่อชิ้น", "🧾 Full cart page (/cart) + per-item options")} hint={t("ค่าเริ่มต้น = แบบเดิม · ติ๊กเลือกชิ้น/เปลี่ยนสี/สลักชื่อ ใช้ได้ทั้งลิ้นชักและหน้า /cart", "Default = original · item select/change color/engraving work in both drawer and /cart")}>
        <div>
          <span className={lbl}>{t("หน้าตาหน้า /cart", "/cart page look")}</span>
          <Seg value={c.pageLayout} onChange={(pageLayout) => set({ pageLayout })} options={CART_PAGE_LAYOUTS.map((o) => ({ v: o.value, l: cartEn(o.label) }))} />
          <p className="text-[11px] text-slate-500 mt-1">
            {cartEn(CART_PAGE_LAYOUTS.find((o) => o.value === c.pageLayout)?.hint ?? "")}
            {onPreviewPage && (
              <>
                {" · "}
                <button type="button" onClick={() => onPreviewPage("/cart")} className="text-blue-600 hover:underline">
                  {t("ดูในพรีวิว", "View in preview")}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={lbl}>{t("ปุ่มในลิ้นชักไปหน้านี้", "Drawer button to this page")}</span>
            <Seg value={c.pageBtn} onChange={(pageBtn) => set({ pageBtn })} options={CART_PAGE_BTNS.map((o) => ({ v: o.value, l: cartEn(o.label) }))} />
            <p className="text-[11px] text-slate-500 mt-1">{t("อัตโนมัติ = ลิงก์เล็กเฉพาะตอนตั้ง “กดไอคอนตะกร้า → ไปหน้า /cart”", "Auto = small link only when “cart icon → /cart page” is set")}</p>
          </div>
          {(c.pageBtn === "button" || c.pageBtn === "link") && <Text label={t("ข้อความปุ่ม (ว่าง = ดูตะกร้าเต็มหน้า)", "Button text (empty = default)")} obj={c} k="pageBtnText" onPatch={set} placeholder="ดูตะกร้าเต็มหน้า" max={40} />}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check label={t("☑ ติ๊กเลือกชิ้นที่จะชำระ", "☑ Select items to check out")} hint={t("ไม่ติ๊ก = ยังอยู่ในตะกร้า ไม่ไปหน้าชำระเงิน (ซื้อทีหลังได้) · มีปุ่มเลือกทั้งหมด", "Unticked = stays in cart, not sent to checkout (buy later) · has a select-all button")} checked={c.select} onChange={(select) => set({ select })} />
          <Check label={t("ป้ายหมวดเหนือชื่อสินค้า", "Category label above product name")} hint={t("เช่น HANDBAGS · WALLETS (หมวดแรกของสินค้า)", "e.g. HANDBAGS · WALLETS (product's first category)")} checked={c.showCategory} onChange={(showCategory) => set({ showCategory })} />
          <Check label={t("เปลี่ยนสี/ไซส์ในตะกร้า", "Change color/size in cart")} hint={t("dropdown ในแถวสินค้า — ไม่ต้องลบแล้วใส่ใหม่ (โชว์เฉพาะสี/ไซส์ที่มีขาย)", "Dropdown in the item row — no need to remove and re-add (only colors/sizes on sale)")} checked={c.changeOption} onChange={(changeOption) => set({ changeOption })} />
          <Check label={t("🔤 สลักชื่อในตะกร้า", "🔤 Engraving in cart")} hint={t("เฉพาะรุ่นที่เปิดปั๊มชื่อไว้ (แท็บ 🛍 เว็บไซต์ของรุ่น) — พิมพ์/แก้/เอาออกได้ในตะกร้า", "Only models with name stamping on (model's 🛍 Website tab) — type/edit/remove in the cart")} checked={c.personalize} onChange={(personalize) => set({ personalize })} />
          <Check label={t("ปุ่ม “เข้าสู่ระบบสมาชิก” ใต้ปุ่มสั่งซื้อ", "“Member login” button under checkout button")} hint={t("โชว์เฉพาะลูกค้าที่ยังไม่เข้าสู่ระบบ (ต้องเปิดระบบสมาชิก)", "Only for customers not logged in (needs membership on)")} checked={c.memberBtn} onChange={(memberBtn) => set({ memberBtn })} />
        </div>
      </Card>

      {/* ── ตอนว่าง ── */}
      <Card title={t("🫙 ตอนตะกร้าว่าง", "🫙 Empty cart")} hint={t("เปิดสินค้าแนะนำไว้ → ตอนว่างก็โชว์สินค้าแนะนำให้ด้วย", "With recommendations on → they also show when the cart is empty")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label={t("ข้อความ", "Text")} obj={c} k="emptyText" onPatch={set} placeholder="ยังไม่มีสินค้าในตะกร้า" max={120} />
          <Text label={t("ปุ่ม (เว้นว่าง = ข้อความเดิมของร้าน)", "Button (empty = shop default text)")} obj={c} k="emptyButton" onPatch={set} placeholder="เลือกซื้อสินค้า" max={40} />
        </div>
      </Card>

      {/* ── ท้ายตะกร้า ── */}
      <Card title={t("💳 ท้ายตะกร้า (ยอดรวม + ปุ่ม)", "💳 Cart footer (total + buttons)")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label={t("ปุ่มสั่งซื้อ", "Checkout button")} obj={c} k="checkoutText" onPatch={set} placeholder="ดำเนินการสั่งซื้อ" max={40} />
          <Text label={t("ปุ่ม “เลือกซื้อต่อ” (เว้นว่าง = ไม่มีปุ่ม)", "“Continue shopping” button (empty = no button)")} obj={c} k="continueText" onPatch={set} placeholder="เช่น เลือกซื้อต่อ" max={40} />
        </div>
        <Text label={t("ข้อความใต้ยอดรวม (เว้นว่าง = ไม่โชว์)", "Text under total (empty = hidden)")} obj={c} k="noteText" onPatch={set} placeholder="ยังไม่รวมค่าจัดส่ง · คำนวณตอนชำระเงิน" max={120} />
        <Check label={t("ปุ่ม “ล้างตะกร้า”", "“Clear cart” button")} checked={c.showClear} onChange={(showClear) => set({ showClear })} />
      </Card>

      <Card title={t("🚚 แถบ “อีก ฿X ส่งฟรี”", "🚚 “฿X more for free shipping” bar")} hint={t("ยอดส่งฟรีตั้งที่แท็บ 🏪 ข้อมูลร้าน (ส่งฟรีเมื่อยอดถึง) — ยังไม่ตั้ง = ไม่โชว์แถบ", "Free-shipping amount is set in 🏪 Shop info — not set = bar hidden")} on={c.freeShip} onToggle={(freeShip) => set({ freeShip })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label={t("ข้อความตอนยังไม่ถึง ({amount} = ยอดที่ขาด)", "Text before reaching it ({amount} = amount short)")} obj={c} k="freeShipText" onPatch={set} placeholder="อีก {amount} ส่งฟรี" />
          <Text label={t("ข้อความตอนถึงแล้ว", "Text once reached")} obj={c} k="freeShipDone" onPatch={set} placeholder="🎉 ได้ส่งฟรีแล้ว" />
        </div>
        <p className="text-[11px] text-slate-500">
          {t("ตัวอย่าง:", "Sample:")} <b className="text-slate-700">{fsSample}</b>
          {!c.freeShipText.includes("{amount}") && <span className="text-amber-700"> {t("· ⚠ ไม่มี", "· ⚠ No")} {"{amount}"} {t("ลูกค้าจะไม่เห็นว่าขาดอีกเท่าไร", "customers won't see how much is left")}</span>}
        </p>
      </Card>

      {/* ── สินค้าแนะนำ (หลายชุด) ── */}
      <Card title={t("🛍 สินค้าแนะนำในตะกร้า", "🛍 Cart recommendations")} hint={t(`ชวนซื้อเพิ่ม — ตั้งได้ ${MAX_RECS_SETS} ชุด (เช่น "คุณอาจชอบ" อัตโนมัติ + "ซื้อคู่กัน" ติ๊กเพิ่ม) · ไม่โชว์ของที่อยู่ในตะกร้าแล้ว · ข้ามสินค้าหมด/ไม่มีราคา · ลาก ⠿ เพื่อเรียง`, `Upsell — up to ${MAX_RECS_SETS} sets (e.g. "You may like" auto + "Bought together" add-on) · items already in the cart are not shown · sold-out/no-price items skipped · drag ⠿ to reorder`)}>
        <div className="space-y-2">
          {sets.map((r, i) => (
            <div key={r.id} {...setsDrag.rowProps(i)} className={setsDrag.rowCls(i)}>
              <RecsSetEditor
                value={r}
                index={i}
                shopSlug={shopSlug}
                categories={categories}
                onChange={(v) => setSets(sets.map((x, j) => (j === i ? v : x)))}
                onRemove={sets.length > 1 ? () => setSets(sets.filter((_, j) => j !== i)) : undefined}
                dragHandle={sets.length > 1 ? <DragHandle {...setsDrag.handleProps(i)} /> : undefined}
              />
            </div>
          ))}
          {sets.length < MAX_RECS_SETS && (
            <button
              type="button"
              onClick={() => setSets([...sets, { ...DEFAULT_RECS_SET, id: newSetId(), on: true, title: "ซื้อคู่กัน", source: "manual", layout: "addon", pageLayout: "addon", limit: 3 }])}
              className="text-xs text-blue-600 hover:underline"
            >
              {t("+ เพิ่มชุดสินค้าแนะนำ", "+ Add recommendation set")}
            </button>
          )}
          <Check
            label={t("🏷 ป้าย “ซื้อคู่ลดเพิ่ม” บนการ์ดสินค้าแนะนำ", "🏷 “Extra discount together” badge on recommendation cards")}
            hint={t("ใส่ชิ้นนั้นแล้วโปรโมชันที่ตั้งไว้ (แท็บ 🏷 โปรโมชัน) ลดเพิ่มเท่าไร — ไม่มีโปรที่เข้าเงื่อนไข = ไม่ขึ้นป้าย", "How much more your promotions (🏷 Promotions tab) take off if that item is added — no matching promo = no badge")}
            checked={c.recsPromoBadge}
            onChange={(recsPromoBadge) => set({ recsPromoBadge })}
          />
        </div>
      </Card>

      <Card title={t("🔗 เข้าชุดกับชิ้นนี้ (ใต้แต่ละรายการ)", "🔗 Goes with this (under each item)")} hint={t("ใช้ “สินค้าที่เกี่ยวข้อง” ที่ตั้งไว้รายรุ่น (แท็บ 🛍 ของรุ่น) ก่อน — ไม่ได้ตั้ง = กฎเดียวกับหน้าสินค้า (แท็บ 🔗 แนะนำสินค้า) · ไม่ซ้ำของในตะกร้า", "Uses each model's “related products” (model's 🛍 tab) first — not set = same rules as the product page (🔗 Recommendations tab) · never repeats cart items")} on={c.lineRelated} onToggle={(lineRelated) => set({ lineRelated })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label={t("หัวข้อ (ว่าง = เข้าชุดกับชิ้นนี้)", "Title (empty = default)")} obj={c} k="lineRelatedTitle" onPatch={set} placeholder="เข้าชุดกับชิ้นนี้" max={40} />
          <div>
            <span className={lbl}>{t("จำนวนต่อรายการ", "Per item")}</span>
            <Seg value={String(c.lineRelatedCount)} onChange={(v) => set({ lineRelatedCount: Number(v) })} options={["1", "2", "3", "4"].map((v) => ({ v, l: v }))} />
          </div>
        </div>
        <Check label={t("โชว์ในลิ้นชักตะกร้าด้วย", "Also show in the cart drawer")} hint={t("ปิด = หน้า /cart อย่างเดียว (ลิ้นชักแคบ รายการยาวขึ้น)", "Off = /cart page only (drawer is narrow, list gets long)")} checked={c.lineRelatedDrawer} onChange={(lineRelatedDrawer) => set({ lineRelatedDrawer })} />
      </Card>

      {/* ── ฟังก์ชันเพิ่ม ── */}
      <Card title={t("✨ ฟังก์ชันเพิ่มในตะกร้า", "✨ Extra cart features")} hint={t("ลูกค้ากรอก/เลือกในตะกร้า → ไปต่อหน้าชำระเงินให้เอง (ไม่ต้องกรอกซ้ำ)", "What customers fill/pick in the cart carries over to checkout (no re-entry)")}>
        <p className="text-[11px] text-slate-500">{t("ช่องซ้าย = ไอคอน (กดเลือก ไอคอนเส้น/อีโมจิ/อัปโหลด · ไอคอนเส้นเปลี่ยนสีตามตัวอักษรของร้าน) · ข้อความว่าง = ใช้ข้อความเริ่มต้น", "Left box = icon (pick line icon/emoji/upload · line icons follow the shop text color) · empty text = default text")}</p>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <SiteIconPicker label={t("ไอคอนโค้ดส่วนลด", "Discount code icon")} value={icon("coupon")} onChange={(v) => setIcon("coupon", v)} />
            <Check label={t("ช่องโค้ดส่วนลด", "Discount code box")} hint={t("ตรวจโค้ด + โชว์ส่วนลดให้ดูก่อน (ใช้คูปองในแท็บ 🎟️ คูปอง)", "Checks the code + previews the discount (uses coupons from the 🎟️ Coupons tab)")} checked={c.coupon} onChange={(coupon) => set({ coupon })} />
          </div>
          <div className="flex items-start gap-2">
            <SiteIconPicker label={t("ไอคอนแต้ม", "Points icon")} value={icon("points")} onChange={(v) => setIcon("points", v)} />
            <Check label={t("แต้มที่จะได้", "Points to earn")} hint={t("สมาชิก: “สั่งครั้งนี้ได้ ~N แต้ม” · ยังไม่สมัคร: ชวนสมัคร (ต้องเปิดระบบแต้มในข้อมูลร้าน)", "Members: “earn ~N points on this order” · guests: invite to sign up (needs points on in Shop info)")} checked={c.points} onChange={(points) => set({ points })} />
          </div>
          <div className="flex items-start gap-2">
            <SiteIconPicker label={t("ไอคอนห่อของขวัญ", "Gift wrap icon")} value={icon("gift")} onChange={(v) => setIcon("gift", v)} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Check label={t("ห่อของขวัญ", "Gift wrap")} hint={t("ติ๊กห่อในตะกร้า (ต้องเปิดห่อของขวัญในข้อมูลร้าน · ค่าห่อตั้งที่ข้อมูลร้าน)", "Tick to wrap in the cart (needs gift wrap on in Shop info · fee set there)")} checked={c.gift} onChange={(gift) => set({ gift })} />
              {c.gift && <Text label={t("ข้อความ (ว่าง = ชื่อบริการในข้อมูลร้าน)", "Text (empty = service name in Shop info)")} obj={c.labels} k="gift" onPatch={(p) => set({ labels: { ...c.labels, ...p } })} placeholder="ห่อเป็นของขวัญ" max={60} />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <SiteIconPicker label={t("ไอคอนการ์ด", "Card icon")} value={icon("card")} onChange={(v) => setIcon("card", v)} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Check
                label={t("เขียนการ์ดอวยพร (แยกจากห่อ)", "Greeting card (separate from wrap)")}
                hint={t("ลูกค้าติ๊กแล้วเขียนข้อความบนการ์ดในตะกร้าได้เลย ไม่ห่อก็ได้ · ต้องเปิด “💌 ขายการ์ดอวยพรแยก” ในข้อมูลร้าน (ตั้งราคาการ์ดที่นั่น) · เลือกลายการ์ดตอนชำระเงิน", "Customers tick and write a card message right in the cart, no wrap needed · needs “💌 Sell greeting cards” on in Shop info (card price set there) · card design is picked at checkout")}
                checked={c.card}
                onChange={(card) => set({ card })}
              />
              {c.card && <Text label={t("ข้อความ (ว่าง = ชื่อบริการการ์ดในข้อมูลร้าน)", "Text (empty = card service name in Shop info)")} obj={c.labels} k="card" onPatch={(p) => set({ labels: { ...c.labels, ...p } })} placeholder="เขียนการ์ดอวยพร" max={60} />}
            </div>
          </div>
          {(c.gift || c.card) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <span className={lbl}>{t("🎀 ห่อของขวัญ / 💌 การ์ด คิดแบบ", "🎀 Gift wrap / 💌 card applies to")}</span>
              <Seg
                value={c.giftMode}
                onChange={(giftMode) => set({ giftMode })}
                options={[
                  { v: "order", l: t("ทั้งออเดอร์ (เดิม)", "Whole order (original)") },
                  { v: "item", l: t("เลือกรายชิ้น", "Per item") },
                ]}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {c.giftMode === "item"
                  ? t("ลูกค้าเลือกห่อ/การ์ดทีละชิ้นในตะกร้า · ค่าห่อ × จำนวนชิ้น · การ์ด 1 ใบต่อรายการ (เขียนข้อความในแถวนั้น) · ใบออเดอร์บอกว่าชิ้นไหนห่อ/มีการ์ด", "Customers pick wrap/card per item in the cart · wrap fee × qty · 1 card per line (message in that row) · the order shows which items are wrapped/carded")
                  : t("ติ๊กครั้งเดียวใช้กับทั้งออเดอร์ · เลือกลายการ์ด/ถึง-จาก ได้ตอนชำระเงิน", "One tick for the whole order · card design/to-from picked at checkout")}
              </p>
            </div>
          )}
          <div className="flex items-start gap-2">
            <SiteIconPicker label={t("ไอคอนหมายเหตุ", "Note icon")} value={icon("note")} onChange={(v) => setIcon("note", v)} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Check label={t("หมายเหตุถึงร้าน", "Note to shop")} hint={t("เช่น โทรก่อนส่ง — ไปเติมช่องหมายเหตุหน้าชำระเงิน", "e.g. call before delivery — fills the checkout note field")} checked={c.note} onChange={(note) => set({ note })} />
              {c.note && <Text label={t("ข้อความ (ว่าง = เพิ่มหมายเหตุถึงร้าน)", "Text (empty = default)")} obj={c.labels} k="note" onPatch={(p) => set({ labels: { ...c.labels, ...p } })} placeholder="เพิ่มหมายเหตุถึงร้าน" max={60} />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SiteIconPicker label={t("ไอคอนวันที่คาดว่าได้รับ", "Delivery date icon")} value={icon("eta")} onChange={(v) => setIcon("eta", v)} />
            <span className="text-[11px] text-slate-500">{t("ไอคอนหน้า “วันที่คาดว่าได้รับ” (ตั้งเปิด/ปิดด้านล่าง)", "Icon before “estimated delivery” (turn on/off below)")}</span>
            <span className="ml-auto flex gap-3 shrink-0">
              <button type="button" onClick={() => set({ icons: { ...DEFAULT_CART_ICONS } })} className="text-xs text-slate-500 hover:underline" data-cart-icons-line>
                {t("↺ ชุดไอคอนเส้น", "↺ Line icon set")}
              </button>
              <button type="button" onClick={() => set({ icons: { ...EMOJI_CART_ICONS } })} className="text-xs text-slate-500 hover:underline">
                {t("😀 ชุดอีโมจิเดิม", "😀 Original emoji set")}
              </button>
            </span>
          </div>
        </div>
      </Card>

      <Card title={t("🛡 แถบความมั่นใจ (ใต้ปุ่มสั่งซื้อ)", "🛡 Trust bar (under checkout button)")} hint={t("สูงสุด 4 ข้อ · ลาก ⠿ เพื่อเรียง", "Max 4 items · drag ⠿ to reorder")} on={c.trust} onToggle={(v) => set({ trust: v })}>
        <div className="space-y-1.5">
          {trust.map((it, i) => (
            <div key={i} {...drag.rowProps(i)} className={`flex items-center gap-2 ${drag.rowCls(i)}`}>
              <DragHandle {...drag.handleProps(i)} />
              {/* 🔣 ไอคอนเส้น (ชุดกลาง) / อีโมจิ / อัปโหลด — ของกลาง SiteIconPicker */}
              <SiteIconPicker value={it.icon} onChange={(icon) => setTrust(trust.map((x, j) => (j === i ? { ...x, icon } : x)))} />
              <LangInput className={`${input} min-w-0`} obj={it} k="text" maxLength={60} placeholder={t("ข้อความ", "Text")} onPatch={(p) => setTrust(trust.map((x, j) => (j === i ? { ...x, ...p } : x)))} />
              <button type="button" onClick={() => setTrust(trust.filter((_, j) => j !== i))} className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300" title={t("ลบ", "Delete")}>
                ×
              </button>
            </div>
          ))}
          <div className="flex gap-3">
            {trust.length < 4 && (
              <button type="button" onClick={() => setTrust([...trust, { icon: "i:circle-check", text: "" }])} className="text-xs text-blue-600 hover:underline">
                {t("+ เพิ่มข้อ", "+ Add item")}
              </button>
            )}
            <button type="button" onClick={() => setTrust(DEFAULT_TRUST_ITEMS.map((x) => ({ ...x })))} className="text-xs text-slate-500 hover:underline">
              {t("↺ ใช้ชุดเริ่มต้น", "↺ Use default set")}
            </button>
          </div>
          {trust.some((x) => !x.text.trim()) && <p className="text-[11px] text-amber-700">{t("⚠ ข้อที่ไม่มีข้อความจะไม่โชว์บนเว็บ", "⚠ Items without text won't show on the site")}</p>}
          {/* ขนาด/สีไอคอน — ใช้กับไอคอนเส้นและรูป (อีโมจิใช้ขนาดตัวอักษรเท่าเดิม) */}
          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-slate-100" data-trust-icon-style>
            <div>
              <span className={lbl}>{t("ขนาดไอคอน", "Icon size")} {c.trustIconSize}px</span>
              <RangeInput min={TRUST_ICON_SIZE.min} max={TRUST_ICON_SIZE.max} value={c.trustIconSize} onChange={(trustIconSize) => set({ trustIconSize })} unit="px" className="w-full accent-blue-600" />
            </div>
            <div>
              <span className={lbl}>{t("สีไอคอน", "Icon color")}</span>
              <Seg<CartTrustIconColor>
                value={c.trustIconColor}
                onChange={(trustIconColor) => set({ trustIconColor })}
                options={[
                  { v: "text", l: t("ตามตัวอักษร", "Text color") },
                  { v: "brand", l: t("สีหลักของร้าน", "Shop brand color") },
                ]}
              />
            </div>
          </div>
          {/* ตัวอย่างแถบ (สีจริงตามธีมร้าน — ดูในพรีวิวด้านข้าง) */}
          {trust.some((x) => x.text.trim()) && (
            <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500" data-trust-sample>
              {trust
                .filter((x) => x.text.trim())
                .map((x, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <SiteIcon value={x.icon} size={c.trustIconSize} className={c.trustIconColor === "brand" ? "text-orange-600" : undefined} />
                    {x.text}
                  </span>
                ))}
            </div>
          )}
        </div>
      </Card>

      <Card title={t("📅 วันที่คาดว่าได้รับ", "📅 Estimated delivery")} hint={t("นับวันทำการ (จ.–ศ.) จากวันที่ลูกค้าดูตะกร้า — เป็นค่าประมาณ", "Counts business days (Mon–Fri) from when the customer views the cart — an estimate")} on={c.eta} onToggle={(eta) => set({ eta })}>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <label className="block">
            <span className={lbl}>{t("เร็วสุด (วันทำการ)", "Earliest (business days)")}</span>
            <input type="number" min={0} max={60} className={input} value={c.etaMin} onChange={(e) => set({ etaMin: Math.max(0, Math.min(60, Number(e.target.value) || 0)), etaMax: Math.max(c.etaMax, Number(e.target.value) || 0) })} />
          </label>
          <label className="block">
            <span className={lbl}>{t("ช้าสุด (วันทำการ)", "Latest (business days)")}</span>
            <input type="number" min={c.etaMin} max={90} className={input} value={c.etaMax} onChange={(e) => set({ etaMax: Math.max(c.etaMin, Math.min(90, Number(e.target.value) || 0)) })} />
          </label>
          <div className="col-span-2">
            <Text label={t("ข้อความ ({from} {to} = วันที่)", "Text ({from} {to} = dates)")} obj={c} k="etaText" onPatch={set} placeholder="ได้รับประมาณ {from} – {to}" />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          {t("ถ้าลูกค้าดูวันนี้จะเห็น:", "A customer viewing today sees:")} <b className="text-slate-700"><SiteIcon value={c.icons.eta} size={14} className="inline-block align-[-2px] mr-1" />{etaLine(c)}</b>
        </p>
      </Card>
    </div>
  );
}
