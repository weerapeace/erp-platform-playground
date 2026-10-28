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
  return (
    <div className="space-y-3">
      {/* 📐 หัวหน้า · ต่อแถว · แบ่งหน้า · การเรียง */}
      <ListingLayoutSettings value={value} onChange={onChange} cardColumns={cardColumns} />
      {/* 🎨 การ์ดแบบรุ่น / ทีละสี (SKU) + ตั้งรายหมวด */}
      <ListingCardSettings value={value} onChange={onChange} categories={categories} shopSlug={shopSlug} />
      {/* 🧭 ตัวกรอง — ตำแหน่ง + กลุ่มตัวกรอง (ลำดับ/เปิดปิด/ชื่อ/ตั้งค่า) · โทนสีเป็นของกลางทุกร้าน จัดในป๊อป "จัดโทนสี" */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-2">
        <p className="text-xs font-semibold text-slate-800">🧭 ตัวกรองสินค้า</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-700">ตำแหน่งตัวกรอง</span>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {([
              ["side", "◧ แถบซ้าย"],
              ["top", "▤ แถวบน"],
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
            {value.filterLayout === "side" ? "จอคอม: ตัวกรองอยู่แถบซ้าย (ติดจอเวลาเลื่อน · พับ/กางทีละกลุ่ม) · มือถือ: ปุ่ม “ตัวกรอง” เปิดจากด้านล่าง" : "ตัวกรองเป็นแถวปุ่มเหนือรายการสินค้า"}
          </span>
        </div>
        {value.filterLayout === "side" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-700">เปิดหน้ามา (จอคอม)</span>
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
              {([
                ["open", "▣ โชว์แถบตัวกรอง"],
                ["collapsed", "◁ พับเข้าซ้าย"],
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
              {value.filterSidebar === "collapsed" ? "สินค้าเต็มความกว้าง · ลูกค้ากดปุ่ม “ตัวกรอง” เพื่อกางแถบออกมา" : "แถบตัวกรองกางอยู่ · ลูกค้ากด “« ซ่อน” เพื่อพับเข้าซ้ายได้"}
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
    return `${x.anchorSide === "before" ? "ก่อน" : "หลัง"} ${x.anchorKind === "sku" ? "SKU " : ""}${codes.length ? `${codes.slice(0, 3).join(", ")}${codes.length > 3 ? ` +${codes.length - 3}` : ""}` : "(ยังไม่เลือกสินค้า)"}`;
  };
  const summary = (x: ListingInsert) =>
    [
      x.placeBy === "product" ? anchorText(x) : x.after === 0 ? "ก่อนสินค้าชิ้นแรก" : `หลังสินค้าชิ้นที่ ${x.after}`,
      x.videoKey || x.mobileVideoKey ? "🎬 วิดีโอ" : null,
      LISTING_SIZES.find((s) => s.value === x.size)?.label.replace(/ \(.*\)$/, ""),
      where === "listing" ? (x.scope === "all" ? "ทุกหน้า" : x.scope === "shop" ? "เฉพาะหน้าทั้งหมด" : x.categories.map(catLabel).join(", ") || "ยังไม่เลือกหมวด") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-3">
      {where === "listing" ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
          แทรกรูป (เช่น รูปนายแบบ/ไลฟ์สไตล์) ระหว่างการ์ดสินค้าในหน้า <b>สินค้าทั้งหมด</b> และหน้าหมวด · เพิ่มได้หลายรูป ลาก ⠿ เพื่อเรียง
          <br />
          กฎบนเว็บ: แบบ &quot;ตามลำดับ&quot; โชว์เฉพาะตอนลูกค้าเรียงแบบ &quot;แนะนำ&quot; และไม่ได้ค้นหา/กดตัวกรอง · ถ้าหมวดนั้นมีสินค้าน้อยกว่าลำดับที่ตั้ง รูปนั้นจะไม่โชว์ · ระบบดึงการ์ดมาเติมช่องว่างให้เอง (ไม่มีรูโหว่) · มือถือ: รูปที่ใหญ่กว่า 1 ช่องจะเป็นเต็มแถว
          <br />
          📌 แบบ &quot;ผูกกับสินค้า&quot; = วางก่อน/หลังการ์ดของสินค้า (หรือ SKU) ที่เลือก ถ้าหน้านั้นมีสินค้านั้น · ตามไปด้วยตอนลูกค้าเรียง/กรองได้ · 🎬 ใส่วิดีโอเล่นแทนรูปได้
        </div>

      ) : (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
          แทรกรูป (เช่น รูปลุค/นายแบบของชุดนี้) ระหว่างการ์ดสินค้าในตารางของชุดนี้ — Section ชุดมาใหม่ + หน้า /new/&lt;ชุด&gt; · เพิ่มได้หลายรูป ลาก ⠿ เพื่อเรียง
          <br />
          ชุดมีสินค้าน้อยกว่าลำดับที่ตั้ง = รูปต่อท้ายสุด · มือถือ: รูปที่ใหญ่กว่า 1 ช่องจะเป็นเต็มแถว · บันทึกชุดแล้วเว็บอัปเดตภายใน ~1 นาที
          <br />
          📌 ผูกกับสินค้า (หรือ SKU) ในชุดได้ = วางก่อน/หลังการ์ดนั้น · 🎬 ใส่วิดีโอเล่นแทนรูปได้
        </div>
      )}
      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">ยังไม่มีรูปแทรก — กด “＋ เพิ่มรูปแทรก” ด้านล่าง</div>
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
                    "ไม่มีรูป"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-700 truncate">{x.title || `รูปแทรก ${i + 1}`}</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {summary(x)}
                    {!thumb && !x.videoKey && !x.mobileVideoKey && <span className="ml-1 text-rose-500">· ยังไม่มีรูป — เว็บจะไม่โชว์</span>}
                    {x.placeBy === "product" && !x.anchors.length && <span className="ml-1 text-rose-500">· ยังไม่เลือกสินค้าที่ผูก — เว็บจะไม่โชว์</span>}
                  </div>
                </div>
                <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer shrink-0" title="เปิด/ปิดชั่วคราว">
                  <input type="checkbox" className="accent-blue-600" checked={x.enabled} onChange={(e) => patch(x.id, { enabled: e.target.checked })} />
                  โชว์
                </label>
                <button type="button" onClick={() => setOpenId(open ? null : x.id)} className={`text-xs px-1.5 h-7 rounded-md border ${open ? "border-blue-500 text-blue-700 bg-blue-50" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>✎</button>
                <button type="button" onClick={() => setDel(x)} className="text-slate-300 hover:text-rose-600 px-1" title="ลบ">🗑</button>
              </div>

              {open && (
                <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ImageUploadField label="รูปบนคอม" hint="แนะนำแนวนอนสำหรับ 2 ช่อง/เต็มแถว" value={x.imageKey} onChange={(k) => patch(x.id, { imageKey: k })} height={56} />
                    <ImageUploadField label="รูปบนมือถือ (ว่าง = ใช้รูปคอม)" hint="แนะนำแนวตั้ง 4:5" value={x.mobileImageKey} onChange={(k) => patch(x.id, { mobileImageKey: k })} height={56} />
                  </div>

                  {/* 🎬 วิดีโอ (ไม่บังคับ) — มี = เล่นแทนรูป เงียบ วนซ้ำ · รูปด้านบน = ภาพปกระหว่างโหลด · ของกลาง WebsiteVideoField */}
                  <details open={!!(x.videoKey || x.mobileVideoKey)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                    <summary className="cursor-pointer text-xs text-slate-700">🎬 วิดีโอแทนรูป (ไม่บังคับ){x.videoKey || x.mobileVideoKey ? " · ตั้งแล้ว" : ""}</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className={lbl}>วิดีโอบนคอม</label>
                        <WebsiteVideoField slot="🖥 วิดีโอบนคอม" value={x.videoKey} onChange={(k) => patch(x.id, { videoKey: k })} />
                      </div>
                      <div>
                        <label className={lbl}>วิดีโอบนมือถือ (ว่าง = ใช้ของคอม)</label>
                        <WebsiteVideoField slot="📱 วิดีโอบนมือถือ" value={x.mobileVideoKey} onChange={(k) => patch(x.id, { mobileVideoKey: k })} />
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">เล่นเองแบบเงียบ วนซ้ำ (เล่นเฉพาะตอนเห็นบนจอ) · รูปด้านบน = ภาพปกระหว่างโหลด · แนะนำ MP4 ≤ 15 MB 6–10 วินาที</p>
                  </details>

                  {/* 📌 ตำแหน่ง: ตามลำดับ (เดิม) / ผูกกับสินค้า (Parent หรือ SKU) — ตำแหน่งจริงคิดที่ resolveInsertAt (lib/website-listing ใช้ร่วมเว็บร้าน) */}
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-700">📌 ตำแหน่ง</span>
                      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                        {([
                          ["pos", "ตามลำดับ (หลังชิ้นที่ N)"],
                          ["product", "ผูกกับสินค้า"],
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
                          <span className="text-xs text-slate-700">ผูกกับ</span>
                          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                            {([
                              ["parent", "สินค้า (Parent) — ทุกสีของรุ่น"],
                              ["sku", "SKU — สีเดียว"],
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
                          <p className="text-[11px] text-rose-600">ไม่รู้ว่าเป็นร้านไหน — เปิดจากหน้าเว็บของร้านเพื่อเลือกสินค้า</p>
                        ) : x.anchorKind === "parent" ? (
                          <WebsiteProductPicker shopSlug={slug} value={x.anchors} max={30} onChange={(codes) => patch(x.id, { anchors: codes })} />
                        ) : (
                          <WebsiteSkuPicker shopSlug={slug} value={x.anchors} max={30} onChange={(refs) => patch(x.id, { anchors: refs })} />
                        )}
                        <p className="text-[10px] text-slate-400">
                          เลือกได้หลายตัว · หน้านั้นมีหลายตัว = วางที่ตัวแรกที่เจอ (รูปโผล่ครั้งเดียว) · หน้าการ์ดแบบรุ่น + ผูก SKU = ติดการ์ดรุ่นของสีนั้น · หน้าการ์ดแตกสี + ผูก Parent = ติดการ์ดสีแรกที่เจอ
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <div>
                            <label className={lbl}>วางรูป</label>
                            <select className={inputCls} value={x.anchorSide} onChange={(e) => patch(x.id, { anchorSide: e.target.value === "before" ? "before" : "after" })}>
                              <option value="after">หลังสินค้านั้น</option>
                              <option value="before">ก่อนสินค้านั้น</option>
                            </select>
                          </div>
                          <div>
                            <label className={lbl}>ถ้าหน้านั้นไม่มีสินค้าที่เลือก</label>
                            <select className={inputCls} value={x.anchorFallback} onChange={(e) => patch(x.id, { anchorFallback: e.target.value === "pos" ? "pos" : "hide" })}>
                              <option value="hide">ไม่โชว์รูปนี้</option>
                              <option value="pos">ใช้ตำแหน่งหลังชิ้นที่ {x.after} แทน</option>
                            </select>
                          </div>
                          {x.anchorFallback === "pos" && (
                            <div>
                              <label className={lbl}>ตำแหน่งสำรอง (หลังชิ้นที่)</label>
                              <input type="number" min={0} max={500} value={x.after} onChange={(e) => patch(x.id, { after: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))) })} className={inputCls} />
                            </div>
                          )}
                        </div>
                        {where === "listing" && (
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input type="checkbox" className="accent-blue-600" checked={x.anchorFollow} onChange={(e) => patch(x.id, { anchorFollow: e.target.checked })} />
                            ตามสินค้าไปด้วยตอนลูกค้าเรียง/กรอง <span className="text-[10px] text-slate-400">(ค้นหาด้วยคำ = ไม่โชว์เหมือนเดิม)</span>
                          </label>
                        )}
                      </>
                    ) : (
                      <div className="max-w-[14rem]">
                        <label className={lbl}>แทรกหลังสินค้าชิ้นที่</label>
                        <input type="number" min={0} max={500} value={x.after} onChange={(e) => patch(x.id, { after: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))) })} className={inputCls} />
                        <p className="text-[10px] text-slate-400 mt-0.5">0 = ก่อนสินค้าชิ้นแรก</p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <label className={lbl}>ขนาด</label>
                      <select className={inputCls} value={x.size} onChange={(e) => patch(x.id, { size: e.target.value as ListingInsert["size"] })}>
                        {LISTING_SIZES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">{LISTING_SIZES.find((o) => o.value === x.size)?.hint}</p>
                    </div>
                    {where === "listing" && (
                    <div>
                      <label className={lbl}>โชว์ในหน้า</label>
                      <select className={inputCls} value={x.scope} onChange={(e) => patch(x.id, { scope: e.target.value as ListingInsert["scope"] })}>
                        {LISTING_SCOPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    )}
                  </div>

                  {where === "listing" && x.scope === "categories" && (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.length === 0 && <span className="text-[11px] text-slate-400">ร้านนี้ยังไม่มีหมวด (ตั้งที่แท็บ ⚙️ จับคู่ฟิลด์)</span>}
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
                          <label className={lbl}>สัดส่วนรูปเต็มแถว · คอม</label>
                          <select className={inputCls} value={x.ratio} onChange={(e) => patch(x.id, { ratio: e.target.value as ListingInsert["ratio"] })}>
                            {LISTING_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className={lbl}>สัดส่วนบนมือถือ (เต็มแถว)</label>
                        <select className={inputCls} value={x.ratioMobile} onChange={(e) => patch(x.id, { ratioMobile: e.target.value as ListingInsert["ratioMobile"] })}>
                          {LISTING_RATIOS_MOBILE.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={lbl}>ลิงก์เมื่อกดรูป (ไม่มีลิงก์ = กดไม่ได้)</label>
                    {linkCtx ? (
                      <LinkTargetPicker value={x.link} onChange={(link) => patch(x.id, { link })} ctx={linkCtx} />
                    ) : (
                    <div className="grid gap-1.5 sm:grid-cols-[1fr_auto_auto]">
                      <input className={inputCls} value={x.link} onChange={(e) => patch(x.id, { link: e.target.value })} placeholder="/c/backpack · /product/bbp10 · https://…" />
                      <select className={inputCls} value="" onChange={(e) => e.target.value && patch(x.id, { link: e.target.value })} title="เลือกหมวดแทนการพิมพ์">
                        <option value="">↳ ลิงก์ไปหมวด…</option>
                        {categories.map((c) => <option key={c.key} value={categoryHref(c.key)}>{categoryChoiceLabel(c)}</option>)}
                      </select>
                      <select className={inputCls} value="" onChange={(e) => e.target.value && patch(x.id, { link: e.target.value })} title="เลือกสินค้าแทนการพิมพ์">
                        <option value="">↳ ลิงก์ไปสินค้า…</option>
                        {products.map((p) => <option key={p.code} value={`/product/${p.code.toLowerCase()}`}>{p.code} {p.name.slice(0, 30)}</option>)}
                      </select>
                    </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={lbl}>หัวข้อทับรูป (ไม่บังคับ)</label>
                      <LangInput className={inputCls} obj={x} k="title" maxLength={120} onPatch={(p) => patch(x.id, p)} placeholder="เช่น NEW ARRIVAL" />
                    </div>
                    <div>
                      <label className={lbl}>ข้อความรอง (ไม่บังคับ)</label>
                      <LangInput className={inputCls} obj={x} k="text" maxLength={300} onPatch={(p) => patch(x.id, p)} placeholder="เช่น คอลเลกชันใหม่ ช้อปเลย →" />
                    </div>
                    {(x.title || x.text) && (
                      <>
                        <div>
                          <label className={lbl}>ตำแหน่งข้อความ</label>
                          <select className={inputCls} value={x.textPos} onChange={(e) => patch(x.id, { textPos: e.target.value as ListingInsert["textPos"] })}>
                            {LISTING_TEXT_POS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>สีข้อความ</label>
                          <select className={inputCls} value={x.textColor} onChange={(e) => patch(x.id, { textColor: e.target.value as ListingInsert["textColor"] })}>
                            <option value="light">ขาว (บนรูปเข้ม)</option>
                            <option value="dark">ดำ (บนรูปสว่าง)</option>
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
          ＋ เพิ่มรูปแทรก <span className="text-blue-400">({list.length}/{MAX_LISTING_INSERTS})</span>
        </button>
      ) : (
        <p className="text-[11px] text-slate-400">เพิ่มได้สูงสุด {MAX_LISTING_INSERTS} รูป</p>
      )}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) set(list.filter((x) => x.id !== del.id));
          setDel(null);
        }}
        title="ลบรูปแทรกนี้?"
        message={where === "listing" ? `ลบ "${del?.title || "รูปแทรก"}" ออกจากหน้ารายการสินค้า — ยังไม่หายจากเว็บจริงจนกว่าจะกดเผยแพร่ (ย้อนได้ด้วยปุ่มเลิกทำ)` : `ลบ "${del?.title || "รูปแทรก"}" ออกจากชุดนี้ — ยังไม่หายจากเว็บจริงจนกว่าจะกดบันทึกชุด`}
        confirmText="ลบรูป"
        variant="danger"
      />
    </div>
  );
}
