"use client";

// ============================================================
// สินค้าเพิ่มเติมในโพสต์ (ของกลาง — ใช้ทั้งฟอร์มสร้างคอนเทนต์และ drawer)
// 1 คอนเทนต์โปรโมทได้หลายสินค้า: ตัวหลัก = ช่อง SKU/Parent เดิม (สี/ราคา/ลิงก์เต็มรูปแบบ)
// ตัวที่เหลือ = รายการนี้ (Parent + เลือกสีย่อยได้) · ลากสลับลำดับ · ⭐ สลับขึ้นเป็นตัวหลัก · ✕ เอาออก
// เก็บลง erp_creative_content_products (ตัวหลัก is_primary แถวแรก) ผ่าน payload `products`
// ============================================================

import { useEffect, useRef } from "react";
import { ParentSkuPicker, type ParentSkuPickerValue, type SkuPickerValue } from "@/components/pickers";
import { useDragReorder, moveItem, DragHandle } from "@/components/sortable-list";
import { r2ImageUrl } from "@/lib/r2-image";
import { useT } from "@/components/i18n";
import { getParentSkuChildren, type ParentSkuChild, type ContentProduct } from "../data";
import { platformLabel } from "../use-options";

export type ProductLink = { platform: string; url: string };
export type ExtraProduct = {
  key: string;
  parent: ParentSkuPickerValue | null;
  sku: ParentSkuChild | null;          // เลือกสีเดียว (null = ทุกสีของ Parent)
  children: ParentSkuChild[];          // SKU ลูกของ Parent (โหลดให้เองเมื่อยังไม่มี)
  childrenLoaded?: boolean;
  links: ProductLink[];                // ลิงก์ร้านที่เก็บไว้ที่ Parent (shopee/lazada/tiktok) — ใช้ใน {link}
};

/** แปลงแถวจาก API (products) → รายการ "สินค้าเพิ่มเติม" (ตัดตัวหลักออก — ตัวหลักอยู่ที่ช่อง SKU/Parent เดิม) */
export function extrasFromDetail(products: ContentProduct[] | null | undefined): ExtraProduct[] {
  return (products ?? []).filter((p) => !p.is_primary).map((p) => ({
    key: p.id ?? `${p.parent_sku_id ?? ""}|${p.sku_id ?? ""}`,
    parent: p.parent_sku_id ? { id: p.parent_sku_id, code: p.parent_code ?? "", name: p.parent_name ?? "", image_url: p.parent_image_url ?? null } : null,
    sku: p.sku_id ? { id: p.sku_id, code: p.sku_code ?? "", name: p.sku_name ?? "", color_en: p.sku_color_en ?? null, color_th: p.sku_color_th ?? null, list_price: p.sku_price ?? null, fake_price: p.sku_fake_price ?? null, image_key: null } : null,
    children: [], childrenLoaded: false, links: p.parent_links ?? [],
  }));
}

/** payload ที่ API รับ (ตัวหลักต้องอยู่หน้าสุด — ผู้เรียกใส่เอง) */
export const extraToPayload = (e: ExtraProduct) => ({ parent_sku_id: e.parent?.id ?? null, sku_id: e.sku?.id ?? null });

/** SKU ลูก → ค่าของ SkuPicker (ตอนสลับขึ้นเป็นตัวหลัก) */
export function childToSkuValue(c: ParentSkuChild, parent: ParentSkuPickerValue | null): SkuPickerValue {
  return { id: c.id, code: c.code, name: c.name, color: c.color_th ?? c.color_en ?? null, list_price: c.list_price, fake_price: c.fake_price, image_key: c.image_key, image_url: c.image_key ? r2ImageUrl(c.image_key, 80) : null,
    parent_sku_id: parent?.id ?? null, parent_code: parent?.code ?? null, parent_name: parent?.name ?? null } as SkuPickerValue;
}
/** ค่าของ SkuPicker → SKU ลูก (ตอนตัวหลักเดิมถอยไปเป็นสินค้าเพิ่มเติม) */
export function skuValueToChild(s: SkuPickerValue): ParentSkuChild {
  const sv = s as SkuPickerValue & { color_en?: string | null; color_th?: string | null };
  return { id: s.id, code: s.code, name: s.name, color_en: sv.color_en ?? null, color_th: sv.color_th ?? s.color ?? null, list_price: s.list_price ?? null, fake_price: s.fake_price ?? null, image_key: s.image_key ?? null };
}

const money = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("th-TH"));
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];

export type PrimaryProductVars = { code: string | null; name: string | null; color: string | null; price: number | null; fake: number | null; links: ProductLink[] };
/**
 * ตัวแปรแคปชั่นเมื่อมีหลายสินค้า — คืน null ถ้าไม่มีสินค้าเพิ่มเติม (ใช้ค่าเดิมของตัวหลักตามปกติ หน้าตาเหมือนเดิมเป๊ะ)
 * มีหลายตัว: {product} = ชื่อคั่น " / " · {color}/{price}/{fake_price}/{real_price} = บรรทัดละสินค้า "ชื่อ: ค่า" (ขึ้นบรรทัดใหม่หลังป้าย เช่น "Colors:")
 * {link} = "แพลตฟอร์ม (ชื่อสินค้า): ลิงก์" ต่อบรรทัด
 */
export function multiProductVars(primary: PrimaryProductVars, extras: ExtraProduct[], colorSource: "th" | "en") {
  if (extras.length === 0) return null;
  type Row = { code: string; name: string; color: string | null; price: number | null; fake: number | null; links: ProductLink[] };
  const rows: Row[] = [
    { code: primary.code ?? "", name: primary.name ?? "", color: primary.color, price: primary.price, fake: primary.fake, links: primary.links },
    ...extras.map((e): Row => {
      const pick = (c: ParentSkuChild) => (colorSource === "en" ? c.color_en : c.color_th) ?? c.color_th ?? c.color_en ?? null;
      const color = e.sku ? pick(e.sku) : (uniq(e.children.map(pick)).join(", ") || null);
      const priceFrom = e.sku ?? e.children[0] ?? null;
      return { code: e.sku?.code ?? e.parent?.code ?? "", name: e.sku?.name ?? e.parent?.name ?? "", color, price: priceFrom?.list_price ?? null, fake: priceFrom?.fake_price ?? null, links: e.links };
    }),
  ];
  const label = (r: Row) => r.name || r.code;
  const lines = (f: (r: Row) => string | null) => { const ls = rows.map((r) => { const v = f(r); return v ? `${label(r)}: ${v}` : null; }).filter(Boolean) as string[]; return ls.length ? (ls.length > 1 ? "\n" : "") + ls.join("\n") : null; };
  return {
    product: rows.map(label).filter(Boolean).join(" / ") || null,
    sku: rows.map((r) => r.code).filter(Boolean).join(", ") || null,
    color: lines((r) => r.color),
    price: lines((r) => (r.price != null ? money(r.price) : null)),
    real_price: lines((r) => (r.price != null ? money(r.price) : null)),
    fake_price: lines((r) => (r.fake != null ? money(r.fake) : null)),
    link: rows.flatMap((r) => r.links.filter((l) => l.url.trim()).map((l) => `${platformLabel(l.platform)} (${label(r)}): ${l.url.trim()}`)).join("\n") || null,
  };
}

export function ExtraProductsEditor({ items, onChange, colorSource = "th", onMakePrimary, onOpenParent, excludeParentIds = [], onDuplicate, hint }: {
  items: ExtraProduct[];
  onChange: (next: ExtraProduct[]) => void;
  colorSource?: "th" | "en";
  onMakePrimary?: (index: number) => void;    // ⭐ สลับตัวนี้ขึ้นเป็นตัวหลัก (ผู้เรียกจัดการช่อง SKU/Parent เอง)
  onOpenParent?: (parentId: string) => void;  // ↗ เปิด drawer Parent
  excludeParentIds?: (string | null | undefined)[];   // Parent ที่ห้ามเพิ่มซ้ำ (เช่น ตัวหลัก)
  onDuplicate?: () => void;
  hint?: string;
}) {
  const t = useT();
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => onChange(moveItem(items, from, to)));
  const latest = useRef(items); latest.current = items;

  // โหลด SKU ลูกของ Parent ที่ยังไม่มี (ไว้เลือกสี + สี/ราคาใน {color}/{price}) — ใช้ ref กัน state เก่าทับกันตอนโหลดพร้อมกันหลายตัว
  const pending = items.filter((i) => i.parent?.id && !i.childrenLoaded).map((i) => i.key).join("|");
  useEffect(() => {
    const todo = latest.current.filter((i) => i.parent?.id && !i.childrenLoaded);
    if (!todo.length) return;
    let live = true;
    for (const it of todo) {
      getParentSkuChildren(it.parent!.id).then((cs) => {
        if (!live) return;
        onChange(latest.current.map((x) => x.key === it.key ? { ...x, children: cs, childrenLoaded: true, sku: x.sku ? (cs.find((c) => c.id === x.sku!.id) ?? x.sku) : null } : x));
      }).catch(() => { if (live) onChange(latest.current.map((x) => x.key === it.key ? { ...x, childrenLoaded: true } : x)); });
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const add = (v: ParentSkuPickerValue | null) => {
    if (!v) return;
    if (excludeParentIds.includes(v.id) || items.some((i) => i.parent?.id === v.id)) { onDuplicate?.(); return; }
    onChange([...items, { key: `n-${v.id}-${Date.now()}`, parent: v, sku: null, children: [], childrenLoaded: false, links: [] }]);
  };
  const setChild = (i: number, skuId: string) => onChange(items.map((x, j) => j === i ? { ...x, sku: skuId ? (x.children.find((c) => c.id === skuId) ?? null) : null } : x));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-medium text-slate-600">🛍 {t("สินค้าเพิ่มเติมในโพสต์", "More products in this post")}{items.length > 0 && <span className="ml-1 text-slate-400 font-normal">({items.length})</span>}</span>
        {items.length > 1 && <span className="text-[10px] text-slate-400">{t("ลากที่ ⋮⋮ เพื่อสลับลำดับ", "Drag ⋮⋮ to reorder")}</span>}
      </div>
      {items.length > 0 && (
        <div className="space-y-1.5 mb-1.5">
          {items.map((it, i) => {
            const code = it.sku?.code ?? it.parent?.code ?? "";
            const name = it.sku?.name ?? it.parent?.name ?? "";
            const thumb = it.sku?.image_key ? r2ImageUrl(it.sku.image_key, 80) : (it.parent?.image_url ?? null);
            return (
              <div key={it.key} {...rowProps(i)} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 ${rowCls(i)}`}>
                <DragHandle {...handleProps(i)} title={t("ลากเพื่อสลับลำดับ", "Drag to reorder")} />
                {thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={thumb} alt="" className="h-9 w-9 rounded-md object-cover border border-slate-200 shrink-0" />
                  : <div className="h-9 w-9 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 shrink-0">🛍</div>}
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] text-slate-500 truncate">{code}{it.sku && it.parent ? <span className="text-slate-300"> · Parent {it.parent.code}</span> : null}</div>
                  <div className="text-xs text-slate-800 truncate" title={name}>{name}</div>
                </div>
                {it.parent && it.children.length > 0 && (
                  <select value={it.sku?.id ?? ""} onChange={(e) => setChild(i, e.target.value)} title={t("เลือกสีเดียว หรือใช้ทุกสี", "Pick one color or all")}
                    className="h-7 max-w-[130px] border border-slate-200 rounded-md px-1 text-[11px] bg-white shrink-0">
                    <option value="">🎨 {t("ทุกสี", "All colors")} ({it.children.length})</option>
                    {it.children.map((c) => { const col = (colorSource === "en" ? c.color_en : c.color_th) ?? c.color_th ?? c.color_en; return <option key={c.id} value={c.id}>{col || c.code}</option>; })}
                  </select>
                )}
                {onMakePrimary && <button type="button" onClick={() => onMakePrimary(i)} title={t("ตั้งเป็นสินค้าหลัก (สลับกับตัวหลักปัจจุบัน)", "Make primary (swap)")} className="h-7 w-7 rounded-md text-slate-400 hover:text-amber-500 hover:bg-amber-50 shrink-0">⭐</button>}
                {onOpenParent && it.parent && <button type="button" onClick={() => onOpenParent(it.parent!.id)} title={t("เปิด drawer Parent", "Open Parent")} className="h-7 w-7 rounded-md text-violet-600 hover:bg-violet-50 shrink-0">↗</button>}
                <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} title={t("เอาออกจากโพสต์นี้", "Remove from this post")} className="h-7 w-7 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 shrink-0">✕</button>
              </div>
            );
          })}
        </div>
      )}
      <ParentSkuPicker value={null} onChange={add} placeholder={t("＋ เพิ่มสินค้าอีกตัว (ค้นหา Parent SKU)…", "＋ Add another product (search Parent SKU)…")} disableCreate />
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
