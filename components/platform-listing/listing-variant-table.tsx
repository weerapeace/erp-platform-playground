"use client";

/**
 * ตารางตัวเลือก & ราคา ของหน้าลงสินค้าใหม่บนร้าน (ของกลาง · Shopee + Lazada ใช้ตัวเดียวกัน · TikTok ต่อได้)
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-20 (ทดสอบ LY22): "สองร้านให้เหมือนกัน ใช้ชิ้นส่วนร่วมกัน"
 *   - แก้ราคาต่อแถว (MoneyInput) · ชื่อสีเลือกจาก Color Platform [TH] หรือพิมพ์ใหม่ (SearchableSelect) · สต๊อกล็อก 0 (BigSeller ยังคุม)
 *   - รูป: imageMode "single" = รูปประจำสี 1 รูป (Shopee · กดเลือก/ย้อนได้) · "all" = โชว์รูปทุกรูปของตัวเลือก ไม่พับ (Lazada ≤ 8 · กดเพื่อจัดรูป)
 *   - แก้ค้างไว้ในเครื่อง → ปุ่ม "บันทึกลงร่าง <ร้าน>" ครั้งเดียว (onSave ได้ prices / names / imgs) · ปุ่มย้อนต่อช่อง + "กลับไปใช้ค่าจากระบบทั้งหมด"
 *   - PC = ตาราง · มือถือ = การ์ดซ้อน
 * ไม่เขียนกลับข้อมูลสินค้าในระบบ — หน้าที่ใช้เก็บลงร่างของร้านเอง (เช่น extra.shopee_prices / extra.lazada_prices)
 * ของกลางที่ใช้: MoneyInput · SearchableSelect · HoverPreview · Icon · listingImgSrc
 */
import type { ReactNode } from "react";
import { Icon } from "@/components/icon";
import { MoneyInput } from "@/components/money-input";
import { SearchableSelect } from "@/components/searchable-select";
import { HoverPreview } from "@/components/hover-image";
import { listingImgSrc } from "@/components/platform-catalog/listing-images";

/** แก้ค้างต่อ SKU: ราคา (null = กลับไปราคาจากระบบ) · ชื่อสี ("" = กลับไปชื่อจากระบบ) · รูปสี ("" = กลับไปรูปอัตโนมัติ · เฉพาะ single) */
export type VariantEdit = { price: Record<string, number | null>; name: Record<string, string>; img: Record<string, string> };
export const NO_VARIANT_EDIT: VariantEdit = { price: {}, name: {}, img: {} };
export type VariantTableRow = {
  sku_id: string; code: string;
  /** ชื่อสีตอนนี้ (ที่บันทึกไว้/จากระบบ) · null = ไม่มีชั้นสี */
  color: string | null; color_base: string | null; color_custom: boolean;
  /** ค่าชั้นอื่น (เช่น ไซซ์) ตามลำดับ otherLabels */
  others: string[];
  price: number | null; price_base: number | null; price_custom: boolean;
  /** บรรทัดเล็กใต้ราคา (เช่น ราคาลด / ขายในระบบ) */
  price_note?: string | null;
  images: string[]; image_base?: string | null; image_custom: boolean;
  /** รูปของตัวเลือกในระบบที่ยังไม่ได้ส่ง (โชว์ "+N") */
  images_more?: number;
};
/** prices { sku_id: บาท } · names { sku_id: ชื่อสี } · imgs { ชื่อสี: ref } (เฉพาะ single) — เฉพาะที่ต่างจากระบบ */
export type VariantSaveResult = { prices: Record<string, number>; names: Record<string, string>; imgs: Record<string, string> };

const baht = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("th-TH"));
/** ชื่อสีของแถว (ที่แก้ค้างอยู่ → ที่บันทึก/จากระบบ) */
export function variantName(v: VariantTableRow, e: VariantEdit): string {
  if (v.color == null && v.color_base == null) return "";
  return v.sku_id in e.name ? (e.name[v.sku_id] || v.color_base || "") : (v.color ?? "");
}

export function ListingVariantTable({ rows, platformName, colorLabel, otherLabels, colorChoices, stock, canEdit, saving, edit, setEdit, imageMode, onImageClick, imageTitle, onSave, onRevertAll, header, footnote }: {
  rows: VariantTableRow[];
  platformName: string;
  /** หัวคอลัมน์ชื่อสี · null = ไม่มีชั้นสี (ไม่โชว์คอลัมน์) */
  colorLabel: string | null;
  otherLabels: string[];
  colorChoices: string[];
  stock: number;
  canEdit: boolean; saving: boolean;
  edit: VariantEdit; setEdit: (f: (e: VariantEdit) => VariantEdit) => void;
  imageMode: "single" | "all";
  /** กดรูปของแถว (single = เลือกรูปสี · all = จัดรูปของตัวเลือก) · ไม่ส่ง = กดไม่ได้ */
  onImageClick?: (row: VariantTableRow) => void;
  imageTitle?: string;
  onSave: (r: VariantSaveResult) => void;
  onRevertAll: () => void;
  /** ส่วนบนตาราง (เช่น เลือกชั้นตัวเลือกของ Lazada) */
  header?: ReactNode;
  footnote?: ReactNode;
}) {
  const hasColor = colorLabel != null;
  const dirty = Object.keys(edit.price).length + Object.keys(edit.name).length + Object.keys(edit.img).length > 0;
  const anyCustom = rows.some((v) => v.price_custom || v.color_custom || (imageMode === "single" && v.image_custom));
  const priceOf = (v: VariantTableRow) => (v.sku_id in edit.price ? (edit.price[v.sku_id] ?? v.price_base) : v.price);
  const imgsOf = (v: VariantTableRow): string[] => (imageMode === "single" && v.sku_id in edit.img ? [edit.img[v.sku_id] || v.image_base || ""].filter(Boolean) : v.images);
  const nameOf = (v: VariantTableRow) => variantName(v, edit);
  const priceCustom = (v: VariantTableRow) => (v.sku_id in edit.price ? edit.price[v.sku_id] != null : v.price_custom);
  const nameCustom = (v: VariantTableRow) => (v.sku_id in edit.name ? !!edit.name[v.sku_id] && edit.name[v.sku_id] !== v.color_base : v.color_custom);
  const imgCustom = (v: VariantTableRow) => (imageMode === "single" && v.sku_id in edit.img ? !!edit.img[v.sku_id] : v.image_custom);
  const colorOpts = [...new Set([...colorChoices, ...rows.map(nameOf)].filter(Boolean))].map((c) => ({ value: c, label: c }));
  const setPrice = (v: VariantTableRow, raw: string) => { const n = Number(raw); setEdit((e) => ({ ...e, price: { ...e.price, [v.sku_id]: raw.trim() && n > 0 ? n : null } })); };
  const setName = (v: VariantTableRow, name: string) => setEdit((e) => ({ ...e, name: { ...e.name, [v.sku_id]: name === v.color_base ? "" : name } }));
  const resetImg = (v: VariantTableRow) => { const nm = nameOf(v); const same = rows.filter((x) => nameOf(x) === nm); setEdit((e) => ({ ...e, img: { ...e.img, ...Object.fromEntries(same.map((x) => [x.sku_id, ""])) } })); };
  const badPrice = rows.some((v) => { const p = priceOf(v); return p != null && !Number.isInteger(p); });

  const save = () => {
    const prices: Record<string, number> = {}; const names: Record<string, string> = {}; const imgs: Record<string, string> = {};
    for (const v of rows) {
      const p = v.sku_id in edit.price ? edit.price[v.sku_id] : (v.price_custom ? v.price : null);
      if (p != null && p > 0) prices[v.sku_id] = p;
      const n = v.sku_id in edit.name ? edit.name[v.sku_id] : (v.color_custom ? v.color ?? "" : "");
      if (n && n !== v.color_base) names[v.sku_id] = n;
      if (imageMode === "single") {
        const im = v.sku_id in edit.img ? edit.img[v.sku_id] : (v.image_custom ? v.images[0] ?? "" : "");
        const nm = nameOf(v);
        if (im && nm) imgs[nm] = im;
      }
    }
    onSave({ prices, names, imgs });
  };

  const priceCell = (v: VariantTableRow) => (
    <div className="leading-tight">
      {canEdit ? (
        <div className="flex items-center gap-1">
          <MoneyInput value={priceOf(v) == null ? "" : String(priceOf(v))} onChange={(raw) => setPrice(v, raw)} placeholder="ราคา" formula={false}
            className={`h-8 w-24 rounded-md border px-2 text-right text-sm ${priceCustom(v) ? "border-violet-400 bg-violet-50" : !priceOf(v) ? "border-rose-300" : "border-slate-200"}`} />
          <span className="text-xs text-slate-500">฿</span>
          {priceCustom(v) && <button type="button" onClick={() => setEdit((e) => ({ ...e, price: { ...e.price, [v.sku_id]: null } }))} title={`กลับไปใช้ราคาจากระบบ (${baht(v.price_base)}฿)`} aria-label="กลับไปใช้ราคาจากระบบ" className="rounded p-0.5 text-slate-500 hover:bg-slate-100"><Icon name="back" /></button>}
        </div>
      ) : <span className={v.price ? "font-medium" : "text-rose-600"}>{v.price ? `${baht(v.price)}฿` : "ไม่มีราคา"}</span>}
      {(priceCustom(v) || v.price_note) && <span className={`block text-[11px] ${priceCustom(v) ? "text-violet-700" : "text-slate-400"}`}>{[priceCustom(v) ? `ระบบ ${baht(v.price_base)}฿` : null, v.price_note].filter(Boolean).join(" · ")}</span>}
    </div>
  );
  const colorCell = (v: VariantTableRow) => !hasColor ? null : canEdit ? (
    <div className="flex min-w-0 items-center gap-1">
      <div className={`min-w-0 flex-1 rounded-md ${nameCustom(v) ? "ring-2 ring-violet-300" : ""}`}>
        <SearchableSelect value={nameOf(v)} options={colorOpts} onChange={(c) => setName(v, c)} onCreate={(q) => setName(v, q)} createLabel="ใช้ชื่อนี้" placeholder="ชื่อสี" />
      </div>
      {nameCustom(v) && <button type="button" onClick={() => setName(v, v.color_base ?? "")} title={`กลับไปใช้ชื่อจากระบบ (${v.color_base ?? "-"})`} aria-label="กลับไปใช้ชื่อสีจากระบบ" className="rounded p-0.5 text-slate-500 hover:bg-slate-100"><Icon name="back" /></button>}
    </div>
  ) : <span className="truncate">{nameOf(v)}</span>;
  const imgCell = (v: VariantTableRow) => {
    const refs = imgsOf(v);
    const thumb = (ref: string, i: number, size: string) => (
      <HoverPreview key={`${ref}-${i}`} url={listingImgSrc(ref, 800)} previewW={360}>
        <img src={listingImgSrc(ref, 120)} alt="" loading="lazy" className={`${size} rounded object-cover ${i === 0 && imageMode === "all" ? "ring-1 ring-violet-300" : ""}`} />
      </HoverPreview>
    );
    const body = imageMode === "single"
      ? (refs[0] ? thumb(refs[0], 0, "h-10 w-10") : <span className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-rose-300 text-[10px] text-rose-500">ไม่มีรูป</span>)
      : refs.length
        ? <div className="flex flex-wrap gap-1">{refs.map((r, i) => thumb(r, i, "h-8 w-8"))}{!!v.images_more && <span className="flex h-8 items-center px-1 text-[11px] text-slate-400">+{v.images_more}</span>}</div>
        : <span className="text-[11px] text-slate-400">ไม่มีรูป</span>;
    return (
      <div className="relative min-w-0">
        {canEdit && onImageClick ? (
          <button type="button" onClick={() => onImageClick(v)} title={imageTitle ?? "เลือกรูป"} className={`block rounded p-0.5 text-left ${imgCustom(v) ? "ring-2 ring-violet-400" : "hover:bg-violet-50"}`}>{body}</button>
        ) : body}
        {imageMode === "single" && canEdit && imgCustom(v) && <button type="button" onClick={() => resetImg(v)} title="กลับไปใช้รูปอัตโนมัติ (ปก SKU)" aria-label="กลับไปใช้รูปอัตโนมัติ" className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-[10px] text-slate-500 shadow hover:text-slate-800"><Icon name="cancel" /></button>}
        {imageMode === "all" && v.image_custom && <span className="mt-0.5 block text-[10px] text-violet-700">เลือกเอง</span>}
      </div>
    );
  };
  const stockCell = <span className="inline-flex items-center gap-1 text-slate-400" title="ล็อกไว้ที่ 0 — BigSeller ยังคุมสต๊อกอยู่ · ใส่สต๊อกหลังเลิกใช้ BigSeller"><Icon name="lock" />{stock}</span>;

  return (
    <div className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">ตัวเลือก & ราคา ({rows.length.toLocaleString()} SKU)</span>
        {canEdit && (dirty ? (
          <div className="flex gap-1.5">
            <button type="button" disabled={saving || badPrice} onClick={save} className="h-7 rounded-md bg-violet-600 px-2 text-xs text-white hover:bg-violet-700 disabled:opacity-50">บันทึกลงร่าง {platformName}</button>
            <button type="button" onClick={() => setEdit(() => NO_VARIANT_EDIT)} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">ยกเลิก</button>
          </div>
        ) : anyCustom ? <button type="button" disabled={saving} onClick={onRevertAll} className="h-7 rounded-md border border-slate-200 px-2 text-xs hover:bg-slate-50">กลับไปใช้ค่าจากระบบทั้งหมด</button> : null)}
      </div>
      {header}
      {/* PC: ตาราง */}
      <div className="hidden max-h-96 overflow-auto rounded-lg border border-slate-100 sm:block">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-normal">{imageMode === "single" ? "รูปสี" : "รูปของตัวเลือก"}</th>
              <th className="px-2 py-1.5 text-left font-normal">SKU</th>
              {hasColor && <th className="px-2 py-1.5 text-left font-normal">{colorLabel}</th>}
              {otherLabels.map((l) => <th key={l} className="px-2 py-1.5 text-left font-normal">{l}</th>)}
              <th className="px-2 py-1.5 text-left font-normal">ราคาตั้ง</th>
              <th className="px-2 py-1.5 text-right font-normal">สต๊อก</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((v) => (
              <tr key={v.sku_id} className="align-middle">
                <td className={`px-2 py-1.5 ${imageMode === "all" ? "max-w-[18rem]" : ""}`}>{imgCell(v)}</td>
                <td className="px-2 py-1.5 font-mono">{v.code}</td>
                {hasColor && <td className="w-48 px-2 py-1.5">{colorCell(v)}</td>}
                {otherLabels.map((l, i) => <td key={l} className="px-2 py-1.5 text-slate-600">{v.others[i] || "—"}</td>)}
                <td className="px-2 py-1.5">{priceCell(v)}</td>
                <td className="px-2 py-1.5 text-right">{stockCell}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* มือถือ: การ์ดซ้อน */}
      <div className="max-h-[32rem] space-y-1.5 overflow-auto sm:hidden">
        {rows.map((v) => (
          <div key={v.sku_id} className="rounded-lg border border-slate-100 p-2 text-xs">
            <div className="flex items-center justify-between gap-2"><span className="truncate font-mono">{v.code}</span>{stockCell}</div>
            <div className="mt-1">{imgCell(v)}</div>
            {hasColor && <div className="mt-1">{colorCell(v)}</div>}
            {v.others.some(Boolean) && <div className="mt-1 truncate text-slate-500">{v.others.filter(Boolean).join(" · ")}</div>}
            <div className="mt-1.5 flex justify-end">{priceCell(v)}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-slate-400">
        แก้ที่นี่ = ใช้กับ {platformName} เท่านั้น (ไม่แก้ระบบ) · ชื่อสีเริ่มจาก Color Platform [TH] · สต๊อกล็อก 0 จนกว่าจะเลิกใช้ BigSeller{footnote ? <> · {footnote}</> : null}
        {badPrice && <span className="text-rose-600"> · รับเฉพาะราคาเต็มบาท</span>}
      </div>
    </div>
  );
}
