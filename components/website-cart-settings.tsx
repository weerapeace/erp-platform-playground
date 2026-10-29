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

const lbl = webForm.label;
const input = "w-full h-8 rounded-lg border border-slate-200 px-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-400";
const card = "rounded-xl border border-slate-200 bg-white p-4 space-y-3";

/**
 * การ์ดตั้งค่า (หัว + คำอธิบาย + สวิตช์เปิด/ปิด) — ใช้ร่วมกับแท็บ 💳 หน้าชำระเงิน (website-checkout-settings) · 🔗 แนะนำสินค้า
 * อยู่ในหน้าดีไซน์ = การ์ดพับ/กางได้ (DesignCard · ตอนพับโชว์ เปิด/ปิด + คำอธิบาย)
 */
export function Card({ title, hint, children, on, onToggle }: { title: string; hint?: string; children?: ReactNode; on?: boolean; onToggle?: (v: boolean) => void }) {
  const foldable = useInDesignCards();
  const toggle = onToggle && (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer shrink-0">
      <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={!!on} onChange={(e) => onToggle(e.target.checked)} />
      {on ? "เปิด" : "ปิด"}
    </label>
  );
  if (foldable)
    return (
      <DesignCard title={title} hint={hint} summary={onToggle ? `${on ? "เปิดอยู่" : "ปิดอยู่"}${hint ? ` · ${hint}` : ""}` : undefined} right={toggle}>
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
  if (!cats.length) return <p className="text-[11px] text-slate-400">ยังไม่มีหมวด — ตั้งที่แท็บ 📂 หมวดหมู่</p>;
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
  const set = (p: Partial<CartRecsSet>) => onChange({ ...r, ...p });
  const layouts = CART_RECS_LAYOUTS.map((o) => ({ v: o.value, l: o.label }));
  const hint = (v: string) => CART_RECS_LAYOUTS.find((o) => o.value === v)?.hint;
  const usesCards = r.layout !== "addon" || r.pageLayout !== "addon";
  // หน้าตาช่องเดียว = เปลี่ยนทั้งลิ้นชัก + หน้า /cart (พรีวิวเปิดหน้าไหนก็เห็นผล) · กด "ตั้งหน้า /cart แยก" เมื่ออยากให้ต่างกัน
  const [split, setSplit] = useState(r.layout !== r.pageLayout);
  return (
    <div className={`rounded-xl border p-3 space-y-3 ${r.on ? "border-blue-200 bg-blue-50/30" : "border-slate-200 bg-slate-50/60"}`}>
      <div className="flex items-center gap-2">
        {dragHandle}
        <span className="text-xs font-semibold text-slate-700">ชุดที่ {index + 1}</span>
        <span className="text-xs text-slate-500 truncate">{r.title || "(ไม่มีหัวข้อ)"}</span>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer shrink-0">
          <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={r.on} onChange={(e) => set({ on: e.target.checked })} />
          {r.on ? "เปิด" : "ปิด"}
        </label>
        {onRemove && (
          <button type="button" onClick={onRemove} className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300" title="ลบชุดนี้">
            ×
          </button>
        )}
      </div>
      {r.on && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label="หัวข้อ (ว่าง = ไม่มีหัวข้อ)" obj={r} k="title" onPatch={set} placeholder="คุณอาจชอบ / ซื้อคู่กัน" max={40} />
            <div>
              <span className={lbl}>จำนวนสูงสุด</span>
              <Seg value={String(r.limit)} onChange={(v) => set({ limit: Number(v) })} options={[1, 2, 3, 4, 6, 8, 10, 12].map((n) => ({ v: String(n), l: String(n) }))} wheel />
            </div>
          </div>
          <div>
            <span className={lbl}>เลือกสินค้าจาก</span>
            <Seg value={r.source} onChange={(source) => set({ source })} options={CART_RECS_SOURCES.map((o) => ({ v: o.value, l: o.label }))} />
            <p className="text-[11px] text-slate-500 mt-1">{CART_RECS_SOURCES.find((o) => o.value === r.source)?.hint}</p>
          </div>
          <div>
            <span className={lbl}>🗂 แท็บเพิ่มในชุดนี้ (ลูกค้าสลับดูได้ · สูงสุด 3 · แท็บที่ไม่มีของซ่อนเอง)</span>
            <div className="flex flex-wrap gap-1.5">
              {CART_RECS_SOURCES.filter((o) => o.value !== r.source && o.value !== "manual" && o.value !== "category").map((o) => {
                const on = r.tabs.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set({ tabs: on ? r.tabs.filter((x) => x !== o.value) : [...r.tabs, o.value].slice(0, 3) })}
                    className={`px-2.5 py-1 rounded-full border text-xs ${on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
                    title={o.hint}
                  >
                    {on ? "✓ " : "+ "}
                    {CART_TAB_LABELS[o.value][0]}
                  </button>
                );
              })}
            </div>
            {r.tabs.length > 0 && <p className="text-[11px] text-slate-500 mt-1">แท็บแรก = “{CART_TAB_LABELS[r.source][0]}” (ที่มาหลักด้านบน) แล้วตามด้วย {r.tabs.map((x) => CART_TAB_LABELS[x][0]).join(" · ")}</p>}
          </div>
          {r.source === "category" && (
            <div>
              <span className={lbl}>หมวดที่ดึงสินค้ามาแนะนำ</span>
              <CatChips cats={categories} value={r.cats} onChange={(cats) => set({ cats })} empty="ยังไม่ได้เลือก = ไม่โชว์ชุดนี้" />
            </div>
          )}
          <div>
            <span className={lbl}>🎯 โชว์เฉพาะเมื่อในตะกร้ามีสินค้าหมวด… (ไม่เลือก = โชว์ทุกครั้ง)</span>
            <CatChips cats={categories} value={r.ifCats} onChange={(ifCats) => set({ ifCats })} empty="ทุกตะกร้า" />
            {r.ifCats.length > 0 && <p className="text-[11px] text-slate-500 mt-1">เช่น ในตะกร้ามีกระเป๋า → โชว์ “ของแต่งกระเป๋า” · ตะกร้าว่าง = ไม่โชว์ชุดนี้</p>}
          </div>
          {r.source === "manual" && (
            <div>
              <span className={lbl}>รุ่นที่จะโชว์ (เรียงตามที่เลือก · สูงสุด 24)</span>
              <WebsiteProductPicker shopSlug={shopSlug} value={r.codes} max={24} onChange={(codes) => set({ codes })} />
              {!r.codes.length && <p className="text-[11px] text-amber-700 mt-1">⚠ ยังไม่ได้เลือกรุ่น — ลูกค้าจะไม่เห็นชุดนี้</p>}
            </div>
          )}
          {split ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className={lbl}>หน้าตาในลิ้นชัก/หน้าต่าง</span>
                <Seg value={r.layout} onChange={(layout) => set({ layout })} options={layouts} />
                <p className="text-[11px] text-slate-500 mt-1">{hint(r.layout)}</p>
              </div>
              <div>
                <span className={lbl}>หน้าตาในหน้า /cart</span>
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
                ↺ ใช้หน้าตาเดียวกันทั้งลิ้นชักและหน้า /cart
              </button>
            </div>
          ) : (
            <div>
              <span className={lbl}>หน้าตา (ลิ้นชัก + หน้า /cart)</span>
              <Seg value={r.layout} onChange={(layout) => set({ layout, pageLayout: layout })} options={layouts} />
              <p className="text-[11px] text-slate-500 mt-1">
                {hint(r.layout)} ·{" "}
                <button type="button" onClick={() => setSplit(true)} className="text-blue-600 hover:underline">
                  ตั้งหน้า /cart แยก
                </button>
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={lbl}>ตำแหน่ง</span>
              <Seg value={r.place} onChange={(place) => set({ place })} options={CART_RECS_POSITIONS.map((o) => ({ v: o.value, l: o.label }))} />
              <p className="text-[11px] text-slate-500 mt-1">{CART_RECS_POSITIONS.find((o) => o.value === r.place)?.hint}</p>
            </div>
            <div>
              <span className={lbl}>โชว์เมื่อ</span>
              <Seg value={r.when} onChange={(when) => set({ when })} options={CART_RECS_WHENS.map((o) => ({ v: o.value, l: o.label }))} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className={lbl}>ขนาดรูป</span>
              <Seg value={r.imageSize} onChange={(imageSize) => set({ imageSize })} options={[{ v: "sm", l: "เล็ก" }, { v: "md", l: "กลาง (เดิม)" }, { v: "lg", l: "ใหญ่" }]} wheel />
            </div>
            <div>
              <span className={lbl}>ทรงรูป</span>
              <Seg value={r.imageShape} onChange={(imageShape) => set({ imageShape })} options={[{ v: "rounded", l: "มน (เดิม)" }, { v: "square", l: "เหลี่ยม" }, { v: "circle", l: "วงกลม" }]} />
            </div>
            {(r.layout === "grid" || r.pageLayout === "grid") && (
              <div>
                <span className={lbl}>คอลัมน์ตาราง (หน้า /cart บนคอม)</span>
                <Seg value={String(r.cols)} onChange={(v) => set({ cols: Number(v) })} options={[{ v: "0", l: "อัตโนมัติ" }, ...["2", "3", "4", "5", "6"].map((v) => ({ v, l: v }))]} wheel />
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Check label="ชื่อสินค้า" checked={r.showName} onChange={(showName) => set({ showName })} />
            <Check label="ราคา" checked={r.showPrice} onChange={(showPrice) => set({ showPrice })} />
            <Check label="ราคาเต็มขีดฆ่า" checked={r.showCompare} onChange={(showCompare) => set({ showCompare })} />
          </div>
          {usesCards && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label="ข้อความปุ่ม (ว่าง = + ใส่ตะกร้า)" obj={r} k="btnText" onPatch={set} placeholder="+ ใส่ตะกร้า" max={30} />
              <div>
                <span className={lbl}>หน้าตาปุ่ม</span>
                <Seg value={r.btnStyle} onChange={(btnStyle) => set({ btnStyle })} options={[{ v: "outline", l: "ขอบมน (เดิม)" }, { v: "brand", l: "ทึบสีแบรนด์" }, { v: "text", l: "ข้อความ" }]} />
              </div>
            </div>
          )}
          <Check
            label="ยอดยังไม่ถึงส่งฟรี → ดันสินค้าที่ราคาพอดีให้ถึงส่งฟรีขึ้นก่อน"
            hint="เช่น ขาดอีก ฿150 → สินค้าราคา ฿150 ขึ้นไปที่ใกล้ที่สุดขึ้นหน้า (ต้องตั้งยอดส่งฟรีในข้อมูลร้าน)"
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
        👁 อยู่แท็บนี้ → พรีวิวเปิดตะกร้าค้างไว้ให้ดู (ตะกร้าว่าง = ใส่สินค้าตัวอย่างให้ ไม่ใช่ตะกร้าจริง)
        {onPreviewPage && (
          <>
            {" · "}
            <button type="button" onClick={() => onPreviewPage("/cart")} className="text-blue-600 hover:underline">
              ดูหน้าตะกร้าเต็มหน้า (/cart)
            </button>
          </>
        )}
      </p>

      {/* ── หน้าตา ── */}
      <Card title="🧺 หน้าตาตะกร้า" hint="ค่าเริ่มต้น = แบบเดิม (ลิ้นชักขวา กว้างกลาง)">
        <div>
          <span className={lbl}>เปิดแบบ</span>
          <div className="grid grid-cols-3 gap-2">
            {CART_STYLES.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set({ style: o.value })}
                className={`rounded-lg border p-1.5 text-[11px] text-center ${c.style === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                <StyleThumb style={o.value} />
                <span className="block mt-1">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={lbl}>ความกว้าง (มือถือ = เต็มจอเสมอ)</span>
            <Seg value={c.width} onChange={(width) => set({ width })} options={CART_WIDTHS.map((w) => ({ v: w.value, l: `${w.label} ${w.px}px` }))} wheel />
          </div>
          <Text label="หัวข้อ" obj={c} k="title" onPatch={set} placeholder="ตะกร้า" max={40} />
        </div>
        <div>
          <span className={lbl}>กดไอคอนตะกร้าที่หัวเว็บ</span>
          <Seg
            value={c.openMode}
            onChange={(openMode) => set({ openMode })}
            options={[
              { v: "drawer", l: "เปิดลิ้นชัก (เดิม)" },
              { v: "page", l: "ไปหน้าตะกร้าเต็มหน้า /cart" },
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-1">หน้า /cart ใช้ได้เสมอ (ส่งลิงก์ให้ลูกค้าได้) · กดใส่ตะกร้าจากการ์ดสินค้ายังเด้งลิ้นชักให้เห็นทันที</p>
        </div>
      </Card>

      {/* ── รายการสินค้า ── */}
      <Card title="🧾 รายการสินค้าในตะกร้า">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className={lbl}>ขนาดรูป</span>
            <Seg value={c.imageSize} onChange={(imageSize) => set({ imageSize })} options={CART_IMAGE_SIZES.map((s) => ({ v: s.value, l: s.label }))} wheel />
          </div>
          <div>
            <span className={lbl}>ทรงรูป</span>
            <Seg
              value={c.imageShape}
              onChange={(imageShape) => set({ imageShape })}
              options={[
                { v: "rounded", l: "มน (เดิม)" },
                { v: "square", l: "เหลี่ยม" },
                { v: "circle", l: "วงกลม" },
              ]}
            />
            {/* มนแค่ไหน — 12 = เดิม · มากสุด = เกือบวงกลม */}
            {c.imageShape === "rounded" && (
              <div className="mt-2" data-cart-radius>
                <span className="text-[11px] text-slate-500 flex items-center gap-2">
                  ความมน {c.imageRadius}px
                  {c.imageRadius !== CART_IMAGE_RADIUS_DEFAULT && (
                    <button type="button" onClick={() => set({ imageRadius: CART_IMAGE_RADIUS_DEFAULT })} className="text-blue-600 hover:underline">
                      ↺ เดิม ({CART_IMAGE_RADIUS_DEFAULT})
                    </button>
                  )}
                </span>
                <RangeInput min={0} max={CART_IMAGE_RADIUS_MAX} value={c.imageRadius} onChange={(imageRadius) => set({ imageRadius })} unit="px" className="w-full accent-blue-600" />
              </div>
            )}
          </div>
          <div>
            <span className={lbl}>รูปในกรอบ</span>
            <Seg
              value={c.imageFit}
              onChange={(imageFit) => set({ imageFit })}
              options={[
                { v: "cover", l: "เต็มกรอบ (เดิม)" },
                { v: "contain", l: "เห็นครบ" },
              ]}
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check label="โชว์ตัวเลือกที่ลูกค้าเลือก (สี/ขนาด/ปั๊มชื่อ)" checked={c.showOptions} onChange={(showOptions) => set({ showOptions })} />
          <div>
            <Check label="โชว์ราคาต่อชิ้น" hint="เช่น ฿320 / ชิ้น ใต้ชื่อ" checked={c.showUnitPrice} onChange={(showUnitPrice) => set({ showUnitPrice })} />
            {c.showUnitPrice && (
              <div className="mt-1.5 ml-6" data-cart-unit-when>
                <Seg<CartUnitPriceWhen>
                  value={c.unitPriceWhen}
                  onChange={(unitPriceWhen) => set({ unitPriceWhen })}
                  options={[
                    { v: "all", l: "ทุกรายการ (เดิม)" },
                    { v: "multi", l: "เฉพาะที่มี 2 ชิ้นขึ้นไป" },
                  ]}
                />
              </div>
            )}
          </div>
          <Check label="โชว์ราคาเต็มขีดฆ่า + “ประหยัด ฿X”" hint="เฉพาะสินค้าที่ตั้งราคาเต็มไว้" checked={c.showCompare} onChange={(showCompare) => set({ showCompare })} />
          <Check label="♡ ปุ่ม “ย้ายไปรายการโปรด”" hint="เอาออกจากตะกร้า + เก็บในรายการโปรด · ใครกดได้ตั้งที่ หน้าสินค้า › ♡ รายการโปรด (เฉพาะสมาชิก = ต้องเปิดระบบสมาชิก · ไม่ต้องสมัคร = ทุกคน)" checked={c.wishlist} onChange={(wishlist) => set({ wishlist })} />
        </div>
      </Card>

      {/* ── หน้าตะกร้าเต็มหน้า ── */}
      <Card title="🧾 หน้าตะกร้าเต็มหน้า (/cart) + ตัวเลือกต่อชิ้น" hint="ค่าเริ่มต้น = แบบเดิม · ติ๊กเลือกชิ้น/เปลี่ยนสี/สลักชื่อ ใช้ได้ทั้งลิ้นชักและหน้า /cart">
        <div>
          <span className={lbl}>หน้าตาหน้า /cart</span>
          <Seg value={c.pageLayout} onChange={(pageLayout) => set({ pageLayout })} options={CART_PAGE_LAYOUTS.map((o) => ({ v: o.value, l: o.label }))} />
          <p className="text-[11px] text-slate-500 mt-1">
            {CART_PAGE_LAYOUTS.find((o) => o.value === c.pageLayout)?.hint}
            {onPreviewPage && (
              <>
                {" · "}
                <button type="button" onClick={() => onPreviewPage("/cart")} className="text-blue-600 hover:underline">
                  ดูในพรีวิว
                </button>
              </>
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={lbl}>ปุ่มในลิ้นชักไปหน้านี้</span>
            <Seg value={c.pageBtn} onChange={(pageBtn) => set({ pageBtn })} options={CART_PAGE_BTNS.map((o) => ({ v: o.value, l: o.label }))} />
            <p className="text-[11px] text-slate-500 mt-1">อัตโนมัติ = ลิงก์เล็กเฉพาะตอนตั้ง “กดไอคอนตะกร้า → ไปหน้า /cart”</p>
          </div>
          {(c.pageBtn === "button" || c.pageBtn === "link") && <Text label="ข้อความปุ่ม (ว่าง = ดูตะกร้าเต็มหน้า)" obj={c} k="pageBtnText" onPatch={set} placeholder="ดูตะกร้าเต็มหน้า" max={40} />}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check label="☑ ติ๊กเลือกชิ้นที่จะชำระ" hint="ไม่ติ๊ก = ยังอยู่ในตะกร้า ไม่ไปหน้าชำระเงิน (ซื้อทีหลังได้) · มีปุ่มเลือกทั้งหมด" checked={c.select} onChange={(select) => set({ select })} />
          <Check label="ป้ายหมวดเหนือชื่อสินค้า" hint="เช่น HANDBAGS · WALLETS (หมวดแรกของสินค้า)" checked={c.showCategory} onChange={(showCategory) => set({ showCategory })} />
          <Check label="เปลี่ยนสี/ไซส์ในตะกร้า" hint="dropdown ในแถวสินค้า — ไม่ต้องลบแล้วใส่ใหม่ (โชว์เฉพาะสี/ไซส์ที่มีขาย)" checked={c.changeOption} onChange={(changeOption) => set({ changeOption })} />
          <Check label="🔤 สลักชื่อในตะกร้า" hint="เฉพาะรุ่นที่เปิดปั๊มชื่อไว้ (แท็บ 🛍 เว็บไซต์ของรุ่น) — พิมพ์/แก้/เอาออกได้ในตะกร้า" checked={c.personalize} onChange={(personalize) => set({ personalize })} />
          <Check label="ปุ่ม “เข้าสู่ระบบสมาชิก” ใต้ปุ่มสั่งซื้อ" hint="โชว์เฉพาะลูกค้าที่ยังไม่เข้าสู่ระบบ (ต้องเปิดระบบสมาชิก)" checked={c.memberBtn} onChange={(memberBtn) => set({ memberBtn })} />
        </div>
      </Card>

      {/* ── ตอนว่าง ── */}
      <Card title="🫙 ตอนตะกร้าว่าง" hint="เปิดสินค้าแนะนำไว้ → ตอนว่างก็โชว์สินค้าแนะนำให้ด้วย">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="ข้อความ" obj={c} k="emptyText" onPatch={set} placeholder="ยังไม่มีสินค้าในตะกร้า" max={120} />
          <Text label="ปุ่ม (เว้นว่าง = ข้อความเดิมของร้าน)" obj={c} k="emptyButton" onPatch={set} placeholder="เลือกซื้อสินค้า" max={40} />
        </div>
      </Card>

      {/* ── ท้ายตะกร้า ── */}
      <Card title="💳 ท้ายตะกร้า (ยอดรวม + ปุ่ม)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="ปุ่มสั่งซื้อ" obj={c} k="checkoutText" onPatch={set} placeholder="ดำเนินการสั่งซื้อ" max={40} />
          <Text label="ปุ่ม “เลือกซื้อต่อ” (เว้นว่าง = ไม่มีปุ่ม)" obj={c} k="continueText" onPatch={set} placeholder="เช่น เลือกซื้อต่อ" max={40} />
        </div>
        <Text label="ข้อความใต้ยอดรวม (เว้นว่าง = ไม่โชว์)" obj={c} k="noteText" onPatch={set} placeholder="ยังไม่รวมค่าจัดส่ง · คำนวณตอนชำระเงิน" max={120} />
        <Check label="ปุ่ม “ล้างตะกร้า”" checked={c.showClear} onChange={(showClear) => set({ showClear })} />
      </Card>

      <Card title="🚚 แถบ “อีก ฿X ส่งฟรี”" hint="ยอดส่งฟรีตั้งที่แท็บ 🏪 ข้อมูลร้าน (ส่งฟรีเมื่อยอดถึง) — ยังไม่ตั้ง = ไม่โชว์แถบ" on={c.freeShip} onToggle={(freeShip) => set({ freeShip })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="ข้อความตอนยังไม่ถึง ({amount} = ยอดที่ขาด)" obj={c} k="freeShipText" onPatch={set} placeholder="อีก {amount} ส่งฟรี" />
          <Text label="ข้อความตอนถึงแล้ว" obj={c} k="freeShipDone" onPatch={set} placeholder="🎉 ได้ส่งฟรีแล้ว" />
        </div>
        <p className="text-[11px] text-slate-500">
          ตัวอย่าง: <b className="text-slate-700">{fsSample}</b>
          {!c.freeShipText.includes("{amount}") && <span className="text-amber-700"> · ⚠ ไม่มี {"{amount}"} ลูกค้าจะไม่เห็นว่าขาดอีกเท่าไร</span>}
        </p>
      </Card>

      {/* ── สินค้าแนะนำ (หลายชุด) ── */}
      <Card title="🛍 สินค้าแนะนำในตะกร้า" hint={`ชวนซื้อเพิ่ม — ตั้งได้ ${MAX_RECS_SETS} ชุด (เช่น "คุณอาจชอบ" อัตโนมัติ + "ซื้อคู่กัน" ติ๊กเพิ่ม) · ไม่โชว์ของที่อยู่ในตะกร้าแล้ว · ข้ามสินค้าหมด/ไม่มีราคา · ลาก ⠿ เพื่อเรียง`}>
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
              + เพิ่มชุดสินค้าแนะนำ
            </button>
          )}
          <Check
            label="🏷 ป้าย “ซื้อคู่ลดเพิ่ม” บนการ์ดสินค้าแนะนำ"
            hint="ใส่ชิ้นนั้นแล้วโปรโมชันที่ตั้งไว้ (แท็บ 🏷 โปรโมชัน) ลดเพิ่มเท่าไร — ไม่มีโปรที่เข้าเงื่อนไข = ไม่ขึ้นป้าย"
            checked={c.recsPromoBadge}
            onChange={(recsPromoBadge) => set({ recsPromoBadge })}
          />
        </div>
      </Card>

      <Card title="🔗 เข้าชุดกับชิ้นนี้ (ใต้แต่ละรายการ)" hint="ใช้ “สินค้าที่เกี่ยวข้อง” ที่ตั้งไว้รายรุ่น (แท็บ 🛍 ของรุ่น) ก่อน — ไม่ได้ตั้ง = กฎเดียวกับหน้าสินค้า (แท็บ 🔗 แนะนำสินค้า) · ไม่ซ้ำของในตะกร้า" on={c.lineRelated} onToggle={(lineRelated) => set({ lineRelated })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="หัวข้อ (ว่าง = เข้าชุดกับชิ้นนี้)" obj={c} k="lineRelatedTitle" onPatch={set} placeholder="เข้าชุดกับชิ้นนี้" max={40} />
          <div>
            <span className={lbl}>จำนวนต่อรายการ</span>
            <Seg value={String(c.lineRelatedCount)} onChange={(v) => set({ lineRelatedCount: Number(v) })} options={["1", "2", "3", "4"].map((v) => ({ v, l: v }))} />
          </div>
        </div>
        <Check label="โชว์ในลิ้นชักตะกร้าด้วย" hint="ปิด = หน้า /cart อย่างเดียว (ลิ้นชักแคบ รายการยาวขึ้น)" checked={c.lineRelatedDrawer} onChange={(lineRelatedDrawer) => set({ lineRelatedDrawer })} />
      </Card>

      {/* ── ฟังก์ชันเพิ่ม ── */}
      <Card title="✨ ฟังก์ชันเพิ่มในตะกร้า" hint="ลูกค้ากรอก/เลือกในตะกร้า → ไปต่อหน้าชำระเงินให้เอง (ไม่ต้องกรอกซ้ำ)">
        <p className="text-[11px] text-slate-500">ช่องซ้าย = ไอคอน (กดเลือก ไอคอนเส้น/อีโมจิ/อัปโหลด · ไอคอนเส้นเปลี่ยนสีตามตัวอักษรของร้าน) · ข้อความว่าง = ใช้ข้อความเริ่มต้น</p>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <SiteIconPicker label="ไอคอนโค้ดส่วนลด" value={icon("coupon")} onChange={(v) => setIcon("coupon", v)} />
            <Check label="ช่องโค้ดส่วนลด" hint="ตรวจโค้ด + โชว์ส่วนลดให้ดูก่อน (ใช้คูปองในแท็บ 🎟️ คูปอง)" checked={c.coupon} onChange={(coupon) => set({ coupon })} />
          </div>
          <div className="flex items-start gap-2">
            <SiteIconPicker label="ไอคอนแต้ม" value={icon("points")} onChange={(v) => setIcon("points", v)} />
            <Check label="แต้มที่จะได้" hint="สมาชิก: “สั่งครั้งนี้ได้ ~N แต้ม” · ยังไม่สมัคร: ชวนสมัคร (ต้องเปิดระบบแต้มในข้อมูลร้าน)" checked={c.points} onChange={(points) => set({ points })} />
          </div>
          <div className="flex items-start gap-2">
            <SiteIconPicker label="ไอคอนห่อของขวัญ" value={icon("gift")} onChange={(v) => setIcon("gift", v)} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Check label="ห่อของขวัญ" hint="ติ๊กห่อในตะกร้า (ต้องเปิดห่อของขวัญในข้อมูลร้าน · ค่าห่อตั้งที่ข้อมูลร้าน)" checked={c.gift} onChange={(gift) => set({ gift })} />
              {c.gift && <Text label="ข้อความ (ว่าง = ชื่อบริการในข้อมูลร้าน)" obj={c.labels} k="gift" onPatch={(p) => set({ labels: { ...c.labels, ...p } })} placeholder="ห่อเป็นของขวัญ" max={60} />}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <SiteIconPicker label="ไอคอนการ์ด" value={icon("card")} onChange={(v) => setIcon("card", v)} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Check
                label="เขียนการ์ดอวยพร (แยกจากห่อ)"
                hint="ลูกค้าติ๊กแล้วเขียนข้อความบนการ์ดในตะกร้าได้เลย ไม่ห่อก็ได้ · ต้องเปิด “💌 ขายการ์ดอวยพรแยก” ในข้อมูลร้าน (ตั้งราคาการ์ดที่นั่น) · เลือกลายการ์ดตอนชำระเงิน"
                checked={c.card}
                onChange={(card) => set({ card })}
              />
              {c.card && <Text label="ข้อความ (ว่าง = ชื่อบริการการ์ดในข้อมูลร้าน)" obj={c.labels} k="card" onPatch={(p) => set({ labels: { ...c.labels, ...p } })} placeholder="เขียนการ์ดอวยพร" max={60} />}
            </div>
          </div>
          {(c.gift || c.card) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <span className={lbl}>🎀 ห่อของขวัญ / 💌 การ์ด คิดแบบ</span>
              <Seg
                value={c.giftMode}
                onChange={(giftMode) => set({ giftMode })}
                options={[
                  { v: "order", l: "ทั้งออเดอร์ (เดิม)" },
                  { v: "item", l: "เลือกรายชิ้น" },
                ]}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                {c.giftMode === "item"
                  ? "ลูกค้าเลือกห่อ/การ์ดทีละชิ้นในตะกร้า · ค่าห่อ × จำนวนชิ้น · การ์ด 1 ใบต่อรายการ (เขียนข้อความในแถวนั้น) · ใบออเดอร์บอกว่าชิ้นไหนห่อ/มีการ์ด"
                  : "ติ๊กครั้งเดียวใช้กับทั้งออเดอร์ · เลือกลายการ์ด/ถึง-จาก ได้ตอนชำระเงิน"}
              </p>
            </div>
          )}
          <div className="flex items-start gap-2">
            <SiteIconPicker label="ไอคอนหมายเหตุ" value={icon("note")} onChange={(v) => setIcon("note", v)} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Check label="หมายเหตุถึงร้าน" hint="เช่น โทรก่อนส่ง — ไปเติมช่องหมายเหตุหน้าชำระเงิน" checked={c.note} onChange={(note) => set({ note })} />
              {c.note && <Text label="ข้อความ (ว่าง = เพิ่มหมายเหตุถึงร้าน)" obj={c.labels} k="note" onPatch={(p) => set({ labels: { ...c.labels, ...p } })} placeholder="เพิ่มหมายเหตุถึงร้าน" max={60} />}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SiteIconPicker label="ไอคอนวันที่คาดว่าได้รับ" value={icon("eta")} onChange={(v) => setIcon("eta", v)} />
            <span className="text-[11px] text-slate-500">ไอคอนหน้า “วันที่คาดว่าได้รับ” (ตั้งเปิด/ปิดด้านล่าง)</span>
            <span className="ml-auto flex gap-3 shrink-0">
              <button type="button" onClick={() => set({ icons: { ...DEFAULT_CART_ICONS } })} className="text-xs text-slate-500 hover:underline" data-cart-icons-line>
                ↺ ชุดไอคอนเส้น
              </button>
              <button type="button" onClick={() => set({ icons: { ...EMOJI_CART_ICONS } })} className="text-xs text-slate-500 hover:underline">
                😀 ชุดอีโมจิเดิม
              </button>
            </span>
          </div>
        </div>
      </Card>

      <Card title="🛡 แถบความมั่นใจ (ใต้ปุ่มสั่งซื้อ)" hint="สูงสุด 4 ข้อ · ลาก ⠿ เพื่อเรียง" on={c.trust} onToggle={(v) => set({ trust: v })}>
        <div className="space-y-1.5">
          {trust.map((it, i) => (
            <div key={i} {...drag.rowProps(i)} className={`flex items-center gap-2 ${drag.rowCls(i)}`}>
              <DragHandle {...drag.handleProps(i)} />
              {/* 🔣 ไอคอนเส้น (ชุดกลาง) / อีโมจิ / อัปโหลด — ของกลาง SiteIconPicker */}
              <SiteIconPicker value={it.icon} onChange={(icon) => setTrust(trust.map((x, j) => (j === i ? { ...x, icon } : x)))} />
              <LangInput className={`${input} min-w-0`} obj={it} k="text" maxLength={60} placeholder="ข้อความ" onPatch={(p) => setTrust(trust.map((x, j) => (j === i ? { ...x, ...p } : x)))} />
              <button type="button" onClick={() => setTrust(trust.filter((_, j) => j !== i))} className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300" title="ลบ">
                ×
              </button>
            </div>
          ))}
          <div className="flex gap-3">
            {trust.length < 4 && (
              <button type="button" onClick={() => setTrust([...trust, { icon: "i:circle-check", text: "" }])} className="text-xs text-blue-600 hover:underline">
                + เพิ่มข้อ
              </button>
            )}
            <button type="button" onClick={() => setTrust(DEFAULT_TRUST_ITEMS.map((x) => ({ ...x })))} className="text-xs text-slate-500 hover:underline">
              ↺ ใช้ชุดเริ่มต้น
            </button>
          </div>
          {trust.some((x) => !x.text.trim()) && <p className="text-[11px] text-amber-700">⚠ ข้อที่ไม่มีข้อความจะไม่โชว์บนเว็บ</p>}
          {/* ขนาด/สีไอคอน — ใช้กับไอคอนเส้นและรูป (อีโมจิใช้ขนาดตัวอักษรเท่าเดิม) */}
          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-slate-100" data-trust-icon-style>
            <div>
              <span className={lbl}>ขนาดไอคอน {c.trustIconSize}px</span>
              <RangeInput min={TRUST_ICON_SIZE.min} max={TRUST_ICON_SIZE.max} value={c.trustIconSize} onChange={(trustIconSize) => set({ trustIconSize })} unit="px" className="w-full accent-blue-600" />
            </div>
            <div>
              <span className={lbl}>สีไอคอน</span>
              <Seg<CartTrustIconColor>
                value={c.trustIconColor}
                onChange={(trustIconColor) => set({ trustIconColor })}
                options={[
                  { v: "text", l: "ตามตัวอักษร" },
                  { v: "brand", l: "สีหลักของร้าน" },
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

      <Card title="📅 วันที่คาดว่าได้รับ" hint="นับวันทำการ (จ.–ศ.) จากวันที่ลูกค้าดูตะกร้า — เป็นค่าประมาณ" on={c.eta} onToggle={(eta) => set({ eta })}>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <label className="block">
            <span className={lbl}>เร็วสุด (วันทำการ)</span>
            <input type="number" min={0} max={60} className={input} value={c.etaMin} onChange={(e) => set({ etaMin: Math.max(0, Math.min(60, Number(e.target.value) || 0)), etaMax: Math.max(c.etaMax, Number(e.target.value) || 0) })} />
          </label>
          <label className="block">
            <span className={lbl}>ช้าสุด (วันทำการ)</span>
            <input type="number" min={c.etaMin} max={90} className={input} value={c.etaMax} onChange={(e) => set({ etaMax: Math.max(c.etaMin, Math.min(90, Number(e.target.value) || 0)) })} />
          </label>
          <div className="col-span-2">
            <Text label="ข้อความ ({from} {to} = วันที่)" obj={c} k="etaText" onPatch={set} placeholder="ได้รับประมาณ {from} – {to}" />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          ถ้าลูกค้าดูวันนี้จะเห็น: <b className="text-slate-700"><SiteIcon value={c.icons.eta} size={14} className="inline-block align-[-2px] mr-1" />{etaLine(c)}</b>
        </p>
      </Card>
    </div>
  );
}
