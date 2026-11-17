"use client";
/**
 * 🖼 แท็บ "หน้ารายการสินค้า" ในหน้าดีไซน์เว็บ — รูปแทรกในกริดสินค้า (theme.listing)
 * ของกลาง: useDragReorder/DragHandle (ลากเรียง) · ImageUploadField (อัปโหลดรูป) · WebsiteVideoField (วิดีโอ) · WebsiteProductPicker / WebsiteSkuPicker (📌 ผูกกับสินค้า) · ConfirmDialog (ลบ)
 * ตรรกะ/ค่าที่เลือกได้อยู่ lib/website-listing.ts · storefront วาดใน ShopClient + ListingInsertTile
 */
import { LangInput } from "@/components/bilingual-field";
import { useState } from "react";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { categoryChoiceLabel } from "@/lib/website-category-tree";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ConfirmDialog } from "@/components/modal";
import { categoryHref } from "@/lib/website-links";
import { ShopFiltersEditor } from "@/components/website-shop-filters-editor";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { ListingLayoutSettings } from "@/components/website-listing-layout";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { WebsiteSkuPicker } from "@/components/website-sku-picker";
import { WebsiteVideoField } from "@/components/website-video-field";
import { ListingCardSettings } from "@/components/website-listing-cards";
import type { SchemaFormContext } from "@/components/website-schema-form";
import {
  LISTING_SIZES, LISTING_SCOPES, LISTING_TEXT_POS, LISTING_RATIOS, LISTING_RATIOS_MOBILE, MAX_LISTING_INSERTS,
  newListingInsert, type ListingConfig, type ListingInsert,
} from "@/lib/website-listing";
import { webForm } from "@/lib/website-form-styles";
import { useT } from "@/components/i18n";

const inputCls = webForm.inputXs;
const lbl = webForm.labelPlain;

export function ListingPanel({
  value,
  onChange,
  categories,
  products,
  fields = [],
  linkCtx,
  cardColumns = { desktop: 4, tablet: 3, mobile: 2 },
  shopSlug,
}: {
  value: ListingConfig;
  onChange: (v: ListingConfig) => void;
  categories: { key: string; label: string; parent?: string | null }[];
  products: { code: string; name: string }[];
  /** ฟิลด์สินค้าที่ส่งออกเว็บ — เลือกทำตัวกรองเพิ่มได้ */
  fields?: { key: string; label: string }[];
  /** ตัวเลือกลิงก์ปลายทาง (ของกลาง) — ไม่ส่ง = ช่องพิมพ์เอง */
  linkCtx?: SchemaFormContext;
  /** ค่าต่อแถวของ "การ์ดสินค้า" ทั้งเว็บ (ตัวตั้งต่อแถวเฉพาะหน้านี้เริ่มจากค่านี้) */
  cardColumns?: { desktop: number; tablet: number; mobile: number };
  /** ร้าน (นับรุ่น/สีต่อหมวดจากสินค้าที่ขึ้นเว็บ) */
  shopSlug?: string;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      {/* 📐 หัวหน้า · ต่อแถว · แบ่งหน้า · การเรียง */}
      <ListingLayoutSettings value={value} onChange={onChange} cardColumns={cardColumns} />
      {/* 🎨 การ์ดแบบรุ่น / ทีละสี (SKU) + ตั้งรายหมวด */}
      <ListingCardSettings value={value} onChange={onChange} categories={categories} shopSlug={shopSlug} />
      {/* 🧭 ตัวกรอง — ตำแหน่ง + กลุ่มตัวกรอง (ลำดับ/เปิดปิด/ชื่อ/ตั้งค่า) · โทนสีเป็นของกลางทุกร้าน จัดในป๊อป "จัดโทนสี" */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
        <p className="text-xs font-semibold text-slate-800">{t("🧭 ตัวกรองสินค้า", "🧭 Product filters")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-700">{t("ตำแหน่งตัวกรอง", "Filter position")}</span>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {([
              ["side", t("◧ แถบซ้าย", "◧ Left sidebar")],
              ["top", t("▤ แถวบน", "▤ Top row")],
            ] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ ...value, filterLayout: v })}
                className={`px-3 py-1 text-xs ${value.filterLayout === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            {value.filterLayout === "side" ? t("จอคอม: ตัวกรองอยู่แถบซ้าย (ติดจอเวลาเลื่อน · พับ/กางทีละกลุ่ม) · มือถือ: ปุ่ม “ตัวกรอง” เปิดจากด้านล่าง", "Desktop: filters in the left sidebar (sticky while scrolling · collapse/expand per group) · Mobile: a “Filters” button opens from the bottom") : t("ตัวกรองเป็นแถวปุ่มเหนือรายการสินค้า", "Filters shown as a row of buttons above the products")}
          </span>
        </div>
        {value.filterLayout === "side" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-700">{t("เปิดหน้ามา (จอคอม)", "On page load (desktop)")}</span>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              {([
                ["open", t("▣ โชว์แถบตัวกรอง", "▣ Show filter bar")],
                ["collapsed", t("◁ พับเข้าซ้าย", "◁ Collapsed")],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ ...value, filterSidebar: v })}
                  className={`px-3 py-1 text-xs ${(value.filterSidebar ?? "open") === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-400">
              {value.filterSidebar === "collapsed" ? t("สินค้าเต็มความกว้าง · ลูกค้ากดปุ่ม “ตัวกรอง” เพื่อกางแถบออกมา", "Products use full width · customers click “Filters” to open the bar") : t("แถบตัวกรองกางอยู่ · ลูกค้ากด “« ซ่อน” เพื่อพับเข้าซ้ายได้", "Filter bar open · customers can click “« Hide” to collapse it")}
            </span>
          </div>
        )}
        <ShopFiltersEditor value={value} onChange={onChange} fields={fields} />
      </div>

      {/* 🖼 รูปแทรกในกริดสินค้า — ของกลาง ListingInsertsEditor (ชุดมาใหม่รายชุดใช้ตัวเดียวกัน) */}
      <ListingInsertsEditor list={value.inserts} onChange={(inserts) => onChange({ ...value, inserts })} categories={categories} products={products} linkCtx={linkCtx} />
    </div>
  );
}

/**
 * 🖼 ตัวจัดรูปแทรกในกริดสินค้า (ของกลาง) — หน้ารายการสินค้า (ListingPanel) + ชุดมาใหม่รายชุด (website-new-drops-panel)
 *   where "listing" = มีช่อง "โชว์ในหน้า" (ทุกหน้า/เฉพาะหน้าทั้งหมด/เลือกหมวด) · "drop" = ตารางสินค้าของชุดนั้น (ไม่มีช่องหน้า)
 *   ค่า = ListingInsert[] (lib/website-listing) · เว็บร้านวาดด้วย ListingInsertTile
 */
export function ListingInsertsEditor({
  list,
  onChange,
  categories,
  products,
  linkCtx,
  where = "listing",
  shopSlug,
}: {
  list: ListingInsert[];
  onChange: (inserts: ListingInsert[]) => void;
  categories: { key: string; label: string; parent?: string | null }[];
  products: { code: string; name: string }[];
  linkCtx?: SchemaFormContext;
  where?: "listing" | "drop";
  /** ร้าน (ป๊อปเลือกสินค้า/SKU ที่ผูกรูป) — ไม่ส่ง = ใช้ของ linkCtx */
  shopSlug?: string;
}) {
  const t = useT();
  const slug = shopSlug ?? linkCtx?.shopSlug ?? "";
  const set = (inserts: ListingInsert[]) => onChange(inserts);
  const patch = (id: string, p: Partial<ListingInsert>) => set(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const drag = useDragReorder((from, to) => set(moveItem(list, from, to)));
  const [openId, setOpenId] = useState<string | null>(null);
  const [del, setDel] = useState<ListingInsert | null>(null);

  const catLabel = (k: string) => categories.find((c) => c.key === k)?.label ?? k;
  // 📌 ผูกกับสินค้า: "หลัง PIX28, PIX01" · SKU = รหัสรุ่นของสีนั้น
  const anchorText = (x: ListingInsert) => {
    const codes = x.anchors.map((a) => a.split(":")[0]);
    return `${x.anchorSide === "before" ? t("ก่อน", "Before") : t("หลัง", "After")} ${x.anchorKind === "sku" ? "SKU " : ""}${codes.length ? `${codes.slice(0, 3).join(", ")}${codes.length > 3 ? ` +${codes.length - 3}` : ""}` : t("(ยังไม่เลือกสินค้า)", "(no product picked)")}`;
  };
  const summary = (x: ListingInsert) =>
    [
      x.placeBy === "product" ? anchorText(x) : x.after === 0 ? t("ก่อนสินค้าชิ้นแรก", "Before the first product") : t(`หลังสินค้าชิ้นที่ ${x.after}`, `After product #${x.after}`),
      x.videoKey || x.mobileVideoKey ? t("🎬 วิดีโอ", "🎬 Video") : null,
      LISTING_SIZES.find((s) => s.value === x.size)?.label.replace(/ \(.*\)$/, ""),
      where === "listing" ? (x.scope === "all" ? t("ทุกหน้า", "All pages") : x.scope === "shop" ? t("เฉพาะหน้าทั้งหมด", "All-products page only") : x.categories.map(catLabel).join(", ") || t("ยังไม่เลือกหมวด", "No category picked")) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-3">
      {where === "listing" ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
          {t("แทรกรูป (เช่น รูปนายแบบ/ไลฟ์สไตล์) ระหว่างการ์ดสินค้าในหน้า ", "Insert images (e.g. model/lifestyle shots) between product cards on the ")}<b>{t("สินค้าทั้งหมด", "All products")}</b>{t(" และหน้าหมวด · เพิ่มได้หลายรูป ลาก ⠿ เพื่อเรียง", " page and category pages · add several, drag ⠿ to reorder")}
          <br />
          {t(`กฎบนเว็บ: แบบ "ตามลำดับ" โชว์เฉพาะตอนลูกค้าเรียงแบบ "แนะนำ" และไม่ได้ค้นหา/กดตัวกรอง · ถ้าหมวดนั้นมีสินค้าน้อยกว่าลำดับที่ตั้ง รูปนั้นจะไม่โชว์ · ระบบดึงการ์ดมาเติมช่องว่างให้เอง (ไม่มีรูโหว่) · มือถือ: รูปที่ใหญ่กว่า 1 ช่องจะเป็นเต็มแถว`, `Site rules: "By position" shows only when the customer sorts by "Featured" and isn't searching/filtering · if the category has fewer products than the set position, the image won't show · cards fill gaps automatically (no holes) · Mobile: images larger than 1 cell become full row`)}
          <br />
          {t(`📌 แบบ "ผูกกับสินค้า" = วางก่อน/หลังการ์ดของสินค้า (หรือ SKU) ที่เลือก ถ้าหน้านั้นมีสินค้านั้น · ตามไปด้วยตอนลูกค้าเรียง/กรองได้ · 🎬 ใส่วิดีโอเล่นแทนรูปได้`, `📌 "Linked to product" = placed before/after the picked product's (or SKU's) card if that page has it · can follow it when customers sort/filter · 🎬 a video can play instead of the image`)}
        </div>

      ) : (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
          {t("แทรกรูป (เช่น รูปลุค/นายแบบของชุดนี้) ระหว่างการ์ดสินค้าในตารางของชุดนี้ — Section ชุดมาใหม่ + หน้า /new/<ชุด> · เพิ่มได้หลายรูป ลาก ⠿ เพื่อเรียง", "Insert images (e.g. this drop's look/model shots) between product cards in this drop's grid — New drops section + /new/<drop> page · add several, drag ⠿ to reorder")}
          <br />
          {t("ชุดมีสินค้าน้อยกว่าลำดับที่ตั้ง = รูปต่อท้ายสุด · มือถือ: รูปที่ใหญ่กว่า 1 ช่องจะเป็นเต็มแถว · บันทึกชุดแล้วเว็บอัปเดตภายใน ~1 นาที", "Drop has fewer products than the set position = image goes last · Mobile: images larger than 1 cell become full row · the site updates within ~1 min after saving the drop")}
          <br />
          {t("📌 ผูกกับสินค้า (หรือ SKU) ในชุดได้ = วางก่อน/หลังการ์ดนั้น · 🎬 ใส่วิดีโอเล่นแทนรูปได้", "📌 Can link to a product (or SKU) in the drop = placed before/after that card · 🎬 a video can play instead of the image")}
        </div>
      )}
      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">{t("ยังไม่มีรูปแทรก — กด “＋ เพิ่มรูปแทรก” ด้านล่าง", "No inserted images yet — click “＋ Add image” below")}</div>
      )}

      <ul className="space-y-1.5">
        {list.map((x, i) => {
          const open = openId === x.id;
          const thumb = x.imageKey ?? x.mobileImageKey;
          return (
            <li key={x.id} {...drag.rowProps(i)} className={`rounded-lg border bg-white ${open ? "border-blue-300" : "border-slate-200"} ${drag.rowCls(i)} ${x.enabled ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <DragHandle {...drag.handleProps(i)} />
                <div className="w-14 h-9 rounded bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center text-[10px] text-slate-400">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={keyUrl(thumb, 160) ?? ""} alt="" className="w-full h-full object-cover" />
                  ) : (
                    t("ไม่มีรูป", "No image")
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-700 truncate">{x.title || t(`รูปแทรก ${i + 1}`, `Inserted image ${i + 1}`)}</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {summary(x)}
                    {!thumb && !x.videoKey && !x.mobileVideoKey && <span className="ml-1 text-rose-500">{t("· ยังไม่มีรูป — เว็บจะไม่โชว์", "· No image yet — won't show on site")}</span>}
                    {x.placeBy === "product" && !x.anchors.length && <span className="ml-1 text-rose-500">{t("· ยังไม่เลือกสินค้าที่ผูก — เว็บจะไม่โชว์", "· No linked product picked — won't show on site")}</span>}
                  </div>
                </div>
                <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer shrink-0" title={t("เปิด/ปิดชั่วคราว", "Temporarily show/hide")}>
                  <input type="checkbox" className="accent-blue-600" checked={x.enabled} onChange={(e) => patch(x.id, { enabled: e.target.checked })} />
                  {t("โชว์", "Show")}
                </label>
                <button type="button" onClick={() => setOpenId(open ? null : x.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>✎</button>
                <button type="button" onClick={() => setDel(x)} className="text-slate-300 hover:text-rose-600 px-1" title={t("ลบ", "Delete")}>🗑</button>
              </div>

              {open && (
                <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ImageUploadField label={t("รูปบนคอม", "Desktop image")} hint={t("แนะนำแนวนอนสำหรับ 2 ช่อง/เต็มแถว", "Landscape recommended for 2-cell/full row")} value={x.imageKey} onChange={(k) => patch(x.id, { imageKey: k })} height={56} />
                    <ImageUploadField label={t("รูปบนมือถือ (ว่าง = ใช้รูปคอม)", "Mobile image (empty = use desktop image)")} hint={t("แนะนำแนวตั้ง 4:5", "Portrait 4:5 recommended")} value={x.mobileImageKey} onChange={(k) => patch(x.id, { mobileImageKey: k })} height={56} />
                  </div>

                  {/* 🎬 วิดีโอ (ไม่บังคับ) — มี = เล่นแทนรูป เงียบ วนซ้ำ · รูปด้านบน = ภาพปกระหว่างโหลด · ของกลาง WebsiteVideoField */}
                  <details open={!!(x.videoKey || x.mobileVideoKey)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <summary className="cursor-pointer text-xs text-slate-700">{t("🎬 วิดีโอแทนรูป (ไม่บังคับ)", "🎬 Video instead of image (optional)")}{x.videoKey || x.mobileVideoKey ? t(" · ตั้งแล้ว", " · set") : ""}</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={lbl}>{t("วิดีโอบนคอม", "Desktop video")}</label>
                        <WebsiteVideoField slot={t("🖥 วิดีโอบนคอม", "🖥 Desktop video")} value={x.videoKey} onChange={(k) => patch(x.id, { videoKey: k })} />
                      </div>
                      <div>
                        <label className={lbl}>{t("วิดีโอบนมือถือ (ว่าง = ใช้ของคอม)", "Mobile video (empty = use desktop)")}</label>
                        <WebsiteVideoField slot={t("📱 วิดีโอบนมือถือ", "📱 Mobile video")} value={x.mobileVideoKey} onChange={(k) => patch(x.id, { mobileVideoKey: k })} />
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">{t("เล่นเองแบบเงียบ วนซ้ำ (เล่นเฉพาะตอนเห็นบนจอ) · รูปด้านบน = ภาพปกระหว่างโหลด · แนะนำ MP4 ≤ 15 MB 6–10 วินาที", "Autoplays muted, loops (only while on screen) · the image above = poster while loading · MP4 ≤ 15 MB, 6–10 s recommended")}</p>
                  </details>

                  {/* 📌 ตำแหน่ง: ตามลำดับ (เดิม) / ผูกกับสินค้า (Parent หรือ SKU) — ตำแหน่งจริงคิดที่ resolveInsertAt (lib/website-listing ใช้ร่วมเว็บร้าน) */}
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-700">{t("📌 ตำแหน่ง", "📌 Position")}</span>
                      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                        {([
                          ["pos", t("ตามลำดับ (หลังชิ้นที่ N)", "By position (after item N)")],
                          ["product", t("ผูกกับสินค้า", "Linked to product")],
                        ] as const).map(([v, l]) => (
                          <button key={v} type="button" onClick={() => patch(x.id, { placeBy: v })} className={`px-2.5 py-1 text-xs ${x.placeBy === v ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    {x.placeBy === "product" ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-700">{t("ผูกกับ", "Link to")}</span>
                          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                            {([
                              ["parent", t("สินค้า (Parent) — ทุกสีของรุ่น", "Product (Parent) — all colors")],
                              ["sku", t("SKU — สีเดียว", "SKU — one color")],
                            ] as const).map(([v, l]) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() =>
                                  v !== x.anchorKind &&
                                  // SKU → Parent = เหลือรหัสรุ่น · Parent → SKU = เลือกสีใหม่
                                  patch(x.id, { anchorKind: v, anchors: v === "parent" ? [...new Set(x.anchors.map((a) => a.split(":")[0]))] : [] })
                                }
                                className={`px-2.5 py-1 text-xs ${x.anchorKind === v ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>
                        {!slug ? (
                          <p className="text-[11px] text-rose-600">{t("ไม่รู้ว่าเป็นร้านไหน — เปิดจากหน้าเว็บของร้านเพื่อเลือกสินค้า", "Shop unknown — open from the shop's website page to pick products")}</p>
                        ) : x.anchorKind === "parent" ? (
                          <WebsiteProductPicker shopSlug={slug} value={x.anchors} max={30} onChange={(codes) => patch(x.id, { anchors: codes })} />
                        ) : (
                          <WebsiteSkuPicker shopSlug={slug} value={x.anchors} max={30} onChange={(refs) => patch(x.id, { anchors: refs })} />
                        )}
                        <p className="text-[10px] text-slate-400">
                          {t("เลือกได้หลายตัว · หน้านั้นมีหลายตัว = วางที่ตัวแรกที่เจอ (รูปโผล่ครั้งเดียว) · หน้าการ์ดแบบรุ่น + ผูก SKU = ติดการ์ดรุ่นของสีนั้น · หน้าการ์ดแตกสี + ผูก Parent = ติดการ์ดสีแรกที่เจอ", "Pick several · if the page has several = placed at the first one found (image shows once) · model cards + SKU link = sticks to that color's model card · per-color cards + Parent link = sticks to the first color card found")}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div>
                            <label className={lbl}>{t("วางรูป", "Place image")}</label>
                            <select className={inputCls} value={x.anchorSide} onChange={(e) => patch(x.id, { anchorSide: e.target.value === "before" ? "before" : "after" })}>
                              <option value="after">{t("หลังสินค้านั้น", "After that product")}</option>
                              <option value="before">{t("ก่อนสินค้านั้น", "Before that product")}</option>
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>{t("ถ้าหน้านั้นไม่มีสินค้าที่เลือก", "If the page doesn't have the picked product")}</label>
                            <select className={inputCls} value={x.anchorFallback} onChange={(e) => patch(x.id, { anchorFallback: e.target.value === "pos" ? "pos" : "hide" })}>
                              <option value="hide">{t("ไม่โชว์รูปนี้", "Don't show this image")}</option>
                              <option value="pos">{t(`ใช้ตำแหน่งหลังชิ้นที่ ${x.after} แทน`, `Use position after item ${x.after} instead`)}</option>
                            </select>
                          </div>
                          {x.anchorFallback === "pos" && (
                            <div>
                              <label className={lbl}>{t("ตำแหน่งสำรอง (หลังชิ้นที่)", "Fallback position (after item)")}</label>
                              <input type="number" min={0} max={500} value={x.after} onChange={(e) => patch(x.id, { after: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))) })} className={inputCls} />
                            </div>
                          )}
                        </div>
                        {where === "listing" && (
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input type="checkbox" className="accent-blue-600" checked={x.anchorFollow} onChange={(e) => patch(x.id, { anchorFollow: e.target.checked })} />
                            {t("ตามสินค้าไปด้วยตอนลูกค้าเรียง/กรอง", "Follow the product when customers sort/filter")} <span className="text-[10px] text-slate-400">{t("(ค้นหาด้วยคำ = ไม่โชว์เหมือนเดิม)", "(keyword search = still hidden)")}</span>
                          </label>
                        )}
                      </>
                    ) : (
                      <div className="max-w-[14rem]">
                        <label className={lbl}>{t("แทรกหลังสินค้าชิ้นที่", "Insert after product #")}</label>
                        <input type="number" min={0} max={500} value={x.after} onChange={(e) => patch(x.id, { after: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))) })} className={inputCls} />
                        <p className="text-[10px] text-slate-400 mt-0.5">{t("0 = ก่อนสินค้าชิ้นแรก", "0 = before the first product")}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className={lbl}>{t("ขนาด", "Size")}</label>
                      <select className={inputCls} value={x.size} onChange={(e) => patch(x.id, { size: e.target.value as ListingInsert["size"] })}>
                        {LISTING_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">{LISTING_SIZES.find((o) => o.value === x.size)?.hint}</p>
                    </div>
                    {where === "listing" && (
                    <div>
                      <label className={lbl}>{t("โชว์ในหน้า", "Show on")}</label>
                      <select className={inputCls} value={x.scope} onChange={(e) => patch(x.id, { scope: e.target.value as ListingInsert["scope"] })}>
                        {LISTING_SCOPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    )}
                  </div>

                  {where === "listing" && x.scope === "categories" && (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.length === 0 && <span className="text-[11px] text-slate-400">{t("ร้านนี้ยังไม่มีหมวด (ตั้งที่แท็บ ⚙️ จับคู่ฟิลด์)", "This shop has no categories yet (set in the ⚙️ Field mapping tab)")}</span>}
                      {categories.map((c) => {
                        const on = x.categories.includes(c.key);
                        return (
                          <button key={c.key} type="button" onClick={() => patch(x.id, { categories: on ? x.categories.filter((k) => k !== c.key) : [...x.categories, c.key] })}
                            className={`text-[11px] rounded-full border px-2.5 py-1 ${on ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                            {on ? "✓ " : ""}{c.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(x.size === "full" || x.size !== "1x1") && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {x.size === "full" && (
                        <div>
                          <label className={lbl}>{t("สัดส่วนรูปเต็มแถว · คอม", "Full-row image ratio · desktop")}</label>
                          <select className={inputCls} value={x.ratio} onChange={(e) => patch(x.id, { ratio: e.target.value as ListingInsert["ratio"] })}>
                            {LISTING_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={lbl}>{t("สัดส่วนบนมือถือ (เต็มแถว)", "Mobile ratio (full row)")}</label>
                        <select className={inputCls} value={x.ratioMobile} onChange={(e) => patch(x.id, { ratioMobile: e.target.value as ListingInsert["ratioMobile"] })}>
                          {LISTING_RATIOS_MOBILE.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={lbl}>{t("ลิงก์เมื่อกดรูป (ไม่มีลิงก์ = กดไม่ได้)", "Link on click (no link = not clickable)")}</label>
                    {linkCtx ? (
                      <LinkTargetPicker value={x.link} onChange={(link) => patch(x.id, { link })} ctx={linkCtx} />
                    ) : (
                    <div className="grid gap-1.5 sm:grid-cols-[1fr_auto_auto]">
                      <input className={inputCls} value={x.link} onChange={(e) => patch(x.id, { link: e.target.value })} placeholder="/c/backpack · /product/bbp10 · https://…" />
                      <select className={inputCls} value="" onChange={(e) => e.target.value && patch(x.id, { link: e.target.value })} title={t("เลือกหมวดแทนการพิมพ์", "Pick a category instead of typing")}>
                        <option value="">{t("↳ ลิงก์ไปหมวด…", "↳ Link to category…")}</option>
                        {categories.map((c) => <option key={c.key} value={categoryHref(c.key)}>{categoryChoiceLabel(c)}</option>)}
                      </select>
                      <select className={inputCls} value="" onChange={(e) => e.target.value && patch(x.id, { link: e.target.value })} title={t("เลือกสินค้าแทนการพิมพ์", "Pick a product instead of typing")}>
                        <option value="">{t("↳ ลิงก์ไปสินค้า…", "↳ Link to product…")}</option>
                        {products.map((p) => <option key={p.code} value={`/product/${p.code.toLowerCase()}`}>{p.code} {p.name.slice(0, 30)}</option>)}
                      </select>
                    </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={lbl}>{t("หัวข้อทับรูป (ไม่บังคับ)", "Overlay title (optional)")}</label>
                      <LangInput className={inputCls} obj={x} k="title" maxLength={120} onPatch={(p) => patch(x.id, p)} placeholder={t("เช่น NEW ARRIVAL", "e.g. NEW ARRIVAL")} />
                    </div>
                    <div>
                      <label className={lbl}>{t("ข้อความรอง (ไม่บังคับ)", "Subtext (optional)")}</label>
                      <LangInput className={inputCls} obj={x} k="text" maxLength={300} onPatch={(p) => patch(x.id, p)} placeholder={t("เช่น คอลเลกชันใหม่ ช้อปเลย →", "e.g. New collection, shop now →")} />
                    </div>
                    {(x.title || x.text) && (
                      <>
                        <div>
                          <label className={lbl}>{t("ตำแหน่งข้อความ", "Text position")}</label>
                          <select className={inputCls} value={x.textPos} onChange={(e) => patch(x.id, { textPos: e.target.value as ListingInsert["textPos"] })}>
                            {LISTING_TEXT_POS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>{t("สีข้อความ", "Text color")}</label>
                          <select className={inputCls} value={x.textColor} onChange={(e) => patch(x.id, { textColor: e.target.value as ListingInsert["textColor"] })}>
                            <option value="light">{t("ขาว (บนรูปเข้ม)", "White (on dark images)")}</option>
                            <option value="dark">{t("ดำ (บนรูปสว่าง)", "Black (on light images)")}</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {list.length < MAX_LISTING_INSERTS ? (
        <button
          type="button"
          onClick={() => {
            const nx = newListingInsert(list.length ? Math.max(...list.map((x) => x.after)) + 6 : 4);
            set([...list, nx]);
            setOpenId(nx.id);
          }}
          className="w-full rounded-lg border border-dashed border-blue-300 text-blue-700 text-xs py-2 hover:bg-blue-50"
        >
          {t("＋ เพิ่มรูปแทรก", "＋ Add image")} <span className="text-blue-400">({list.length}/{MAX_LISTING_INSERTS})</span>
        </button>
      ) : (
        <p className="text-[11px] text-slate-400">{t(`เพิ่มได้สูงสุด ${MAX_LISTING_INSERTS} รูป`, `Up to ${MAX_LISTING_INSERTS} images`)}</p>
      )}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) set(list.filter((x) => x.id !== del.id));
          setDel(null);
        }}
        title={t("ลบรูปแทรกนี้?", "Delete this inserted image?")}
        message={where === "listing" ? t(`ลบ "${del?.title || "รูปแทรก"}" ออกจากหน้ารายการสินค้า — ยังไม่หายจากเว็บจริงจนกว่าจะกดเผยแพร่ (ย้อนได้ด้วยปุ่มเลิกทำ)`, `Remove "${del?.title || "inserted image"}" from the listing page — stays on the live site until you publish (undo available)`) : t(`ลบ "${del?.title || "รูปแทรก"}" ออกจากชุดนี้ — ยังไม่หายจากเว็บจริงจนกว่าจะกดบันทึกชุด`, `Remove "${del?.title || "inserted image"}" from this drop — stays on the live site until you save the drop`)}
        confirmText={t("ลบรูป", "Delete image")}

        variant="danger"
      />
    </div>
  );
}
