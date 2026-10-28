"use client";
/**
 * 🎨 การ์ดสินค้าในหน้ารายการ (แท็บ "หน้ารายการสินค้า" ในหน้าดีไซน์เว็บ) — แบบรุ่น / ทีละสี (SKU) / อัตโนมัติ + ตั้งรายหมวด
 *   2026-10-28 เจ้าของ: "บางหมวดมีของน้อย อยากให้เปลี่ยนเป็นโชว์แบบ SKU ได้ เลือกได้ว่าจะโชว์แบบไหน"
 * ค่า: lib/website-listing.ts (cardMode · cardAutoMax · skuOrder · cardModeByCat · cardSwitch · listingCardModeFor) — มิเรอร์ storefront src/lib/listing.ts
 * เว็บร้าน: ShopClient แตกการ์ดด้วยของกลาง src/lib/sku-cards.ts (ตัวเดียวกับ Section ตารางสินค้า)
 * ตัวเลขรุ่น/สีต่อหมวด = สินค้าที่ขึ้นเว็บจริง (loadStorefrontProducts ของกลาง) · นับแบบเดียวกับหน้าเว็บ (หมวดหลักหรือหมวดใดก็ได้)
 */
import { useEffect, useMemo, useState } from "react";
import { Seg } from "@/components/website-block-editor";
import { RangeInput } from "@/components/range-input";
import { categoryTree } from "@/lib/website-category-tree";
import { loadStorefrontProducts } from "@/lib/website-data";
import { LISTING_ALL_KEY, LISTING_CARD_AUTO_RANGE, LISTING_CARD_MODES, LISTING_SKU_ORDERS, listingCardModeFor, type ListingConfig } from "@/lib/website-listing";
import { webForm } from "@/lib/website-form-styles";

const box = "rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2";
type Cat = { key: string; label: string; parent?: string | null };
type WebProduct = { code: string; category?: string; categories?: string[]; options?: unknown };

/** จำนวนสีของรุ่น (API ส่งตัวเลือกเป็น { label, items[] } หรือ array) — ไม่มีสี = 1 การ์ด */
const colorCount = (opts: unknown): number => {
  const list = Array.isArray(opts) ? opts : opts && typeof opts === "object" && Array.isArray((opts as { items?: unknown }).items) ? (opts as { items: unknown[] }).items : [];
  return Math.max(1, list.length);
};

export function ListingCardSettings({ value, onChange, categories, shopSlug }: { value: ListingConfig; onChange: (v: ListingConfig) => void; categories: Cat[]; shopSlug?: string }) {
  const set = (p: Partial<ListingConfig>) => onChange({ ...value, ...p });
  const [products, setProducts] = useState<WebProduct[] | null>(null);
  useEffect(() => {
    if (!shopSlug) return;
    let alive = true;
    loadStorefrontProducts<WebProduct>(shopSlug)
      .then((j) => alive && setProducts(j.products ?? []))
      .catch(() => alive && setProducts([]));
    return () => {
      alive = false;
    };
  }, [shopSlug]);

  // รุ่น/สี ต่อหมวด (+ หน้าสินค้าทั้งหมด)
  const counts = useMemo(() => {
    const out: Record<string, { models: number; colors: number }> = {};
    if (!products) return out;
    const add = (k: string, p: WebProduct) => {
      const c = (out[k] ??= { models: 0, colors: 0 });
      c.models++;
      c.colors += colorCount(p.options);
    };
    for (const p of products) {
      add(LISTING_ALL_KEY, p);
      for (const k of new Set([p.category, ...(p.categories ?? [])].filter((x): x is string => !!x))) add(k, p);
    }
    return out;
  }, [products]);

  const rows = [{ key: LISTING_ALL_KEY, label: "🛍 สินค้าทั้งหมด (/shop)", depth: 0 }, ...categoryTree(categories).map(({ cat, depth }) => ({ key: cat.key, label: cat.label, depth }))];
  const setCat = (key: string, m: string) => {
    const next = { ...value.cardModeByCat };
    if (m === "parent" || m === "sku") next[key] = m;
    else delete next[key];
    set({ cardModeByCat: next });
  };
  const anySku = value.cardMode !== "parent" || Object.values(value.cardModeByCat).includes("sku") || value.cardSwitch;

  return (
    <div className={box}>
      <p className="text-xs font-semibold text-slate-800">🎨 การ์ดสินค้าในหน้ารายการ — แบบรุ่น / ทีละสี (SKU)</p>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {LISTING_CARD_MODES.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => set({ cardMode: o.value })}
            className={`text-left px-2.5 py-1.5 rounded-lg border transition ${value.cardMode === o.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
          >
            <span className="block text-xs font-medium">{o.label}</span>
            <span className="block text-[10px] text-slate-500 leading-snug">{o.hint}</span>
          </button>
        ))}
      </div>
      {value.cardMode === "auto" && (
        <div>
          <span className={webForm.labelPlain}>หมวดที่มีไม่ถึงกี่รุ่น → แตกเป็นทีละสี</span>
          <RangeInput value={value.cardAutoMax} min={LISTING_CARD_AUTO_RANGE.min} max={LISTING_CARD_AUTO_RANGE.max} step={1} unit=" รุ่น" onChange={(n) => set({ cardAutoMax: n })} />
        </div>
      )}
      {anySku && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-700">↕ เรียงการ์ดสี</span>
            {/* nowrap: ปุ่ม "ตามรหัส SKU" ไม่หักเป็น 3 บรรทัด */}
            <div className="whitespace-nowrap">
              <Seg<ListingConfig["skuOrder"]> value={value.skuOrder} onChange={(v) => set({ skuOrder: v })} options={LISTING_SKU_ORDERS.map((o) => ({ v: o.value, l: o.label }))} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500" data-sku-order-hint>
            {LISTING_SKU_ORDERS.find((o) => o.value === value.skuOrder)?.hint}
            {(value.skuOrder === "code" || value.skuOrder === "random") && " · ใช้ตอนเรียงแบบ \"แนะนำ\" — ลูกค้าเลือกเรียงราคา/ใหม่ล่าสุด หรือพิมพ์ค้นหา = เรียงตามนั้น"}
          </p>
        </div>
      )}

      <div>
        <p className="text-xs text-slate-700 mb-1">ตั้งรายหมวด <span className="text-[11px] text-slate-400">(ไม่ตั้ง = ตามค่าทั้งเว็บ)</span></p>
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
          <div className="grid grid-cols-[minmax(0,1.6fr)_44px_44px_minmax(0,1.3fr)_minmax(0,1fr)] gap-2 px-2 py-1 text-[10px] text-slate-400">
            <span>หมวด</span>
            <span className="text-right">รุ่น</span>
            <span className="text-right">สี</span>
            <span>แสดงแบบ</span>
            <span>ผลบนเว็บ</span>
          </div>
          {rows.map((r) => {
            const c = counts[r.key];
            const mode = listingCardModeFor(value, r.key, c?.models ?? 0);
            const own = value.cardModeByCat[r.key] ?? "";
            return (
              <div key={r.key} data-cat-row={r.key} className="grid grid-cols-[minmax(0,1.6fr)_44px_44px_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-2 px-2 py-1 text-xs text-slate-700">
                <span className="truncate" style={{ paddingLeft: r.depth ? 14 : 0 }} title={r.key}>
                  {r.depth ? "↳ " : ""}
                  {r.label}
                </span>
                <span className="text-right tabular-nums text-slate-500">{products ? c?.models ?? 0 : "…"}</span>
                <span className="text-right tabular-nums text-slate-500">{products ? c?.colors ?? 0 : "…"}</span>
                <select value={own} onChange={(e) => setCat(r.key, e.target.value)} className={webForm.inputXs} aria-label={`แสดงแบบ: ${r.label}`}>
                  <option value="">ตามค่าทั้งเว็บ</option>
                  <option value="parent">แบบรุ่น</option>
                  <option value="sku">แบบทีละสี</option>
                </select>
                <span className={`text-[11px] ${mode === "sku" ? "text-emerald-700" : "text-slate-500"}`}>
                  {!products ? "" : mode === "sku" ? `${c?.colors ?? 0} การ์ดสี` : `${c?.models ?? 0} การ์ดรุ่น`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
        <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600" checked={value.cardSwitch} onChange={(e) => set({ cardSwitch: e.target.checked })} />
        ให้ลูกค้าสลับเองได้ (ปุ่ม &quot;ดูแบบรุ่น | ดูทีละสี&quot; ข้างช่องเรียง — เริ่มจากแบบที่ตั้งไว้ด้านบน)
      </label>
      <p className="text-[11px] text-slate-400">
        การ์ดสี = รูปของสีนั้น · ชื่อ &quot;รุ่น · สี&quot; · กดแล้วเปิดหน้าสินค้าที่เลือกสีไว้ · กรองสีแล้วเหลือเฉพาะการ์ดสีที่ตรง · สินค้าหมด/ราคายังคิดรายรุ่น (เหมือน Section ตารางสินค้า)
      </p>
    </div>
  );
}
