"use client";
/**
 * 🔗 ใส่ SKU แบบ Mass (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-19 ข้อ 3-5)
 * - แผงสินค้าของแบรนด์ (การ์ดรูป + ค้น) ลอยขวา (มือถือ = แผงล่าง) · รายการรุ่นจากตัวโหลดกลางเดียวกับหน้าเชื่อมสินค้า
 *   (/api/parent-skus/spec-export?catalog=1)
 * - กดสินค้า = onPick (หน้าเอาไปเชื่อมกับอัลบั้มที่เลือกไว้) · ลากการ์ดสินค้าไปวางบนอัลบั้มได้ (MIME PRODUCT_DRAG)
 * - SkuChipsDialog = ติ๊ก SKU ลูกของอัลบั้มที่เชื่อมแล้ว (กดชิปรหัสบนการ์ด)
 * ไม่บันทึกเอง — หน้าเป็นคนเชื่อม (linkAlbumProduct) + ย้อนกลับ
 */
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import type { SkuPickerCatalog, SkuPickerItem } from "@/components/marketing-sku-picker-modal";
import { ChildChips } from "./link-product-dialog";

export const PRODUCT_DRAG = "application/x-sample-product";

let cache: Promise<SkuPickerCatalog> | null = null;
/** รายการรุ่นทั้งหมด (โหลดครั้งเดียวต่อการเปิดหน้า) */
export function loadProductCatalog(): Promise<SkuPickerCatalog> {
  cache = cache ?? apiFetch("/api/parent-skus/spec-export?catalog=1").then((r) => r.json()).then((j: { data?: SkuPickerCatalog; error?: string }) => {
    if (j.error || !j.data) throw new Error(j.error || tr("โหลดรายการสินค้าไม่สำเร็จ", "Failed to load products"));
    return j.data;
  }).catch((e) => { cache = null; throw e; });
  return cache;
}

export function MassLinkPanel({ brandId, selectedCount, linked, total, onlyUnlinked, onOnlyUnlinked, onPick, onClose }: {
  brandId: string | null;
  selectedCount: number;
  linked: number;
  total: number;
  onlyUnlinked: boolean;
  onOnlyUnlinked: (v: boolean) => void;
  onPick: (item: SkuPickerItem) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [cat, setCat] = useState<SkuPickerCatalog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [allBrands, setAllBrands] = useState(false);
  useEffect(() => { loadProductCatalog().then(setCat).catch((e) => setErr((e as Error).message)); }, []);
  const items = useMemo(() => {
    const list = (cat?.items ?? []).filter((i) => allBrands || !brandId || i.brand_id === brandId);
    const s = q.trim().toLowerCase();
    return (s ? list.filter((i) => i.code.toLowerCase().includes(s) || i.name.toLowerCase().includes(s)) : list).slice(0, 200);
  }, [cat, q, allBrands, brandId]);
  const brandName = cat?.brands.find((b) => b.id === brandId)?.name;

  return (
    <aside className="fixed inset-x-2 bottom-2 z-30 flex h-[46vh] flex-col rounded-2xl border border-violet-200 bg-white p-2.5 shadow-2xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-24 lg:h-auto lg:w-[320px]">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-slate-800"><Icon value="i:link" /> {t("ใส่ SKU แบบ Mass", "Mass link products")}</span>
        <button type="button" onClick={onClose} title={t("ปิดโหมด", "Close")} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon value="i:x" /></button>
      </div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-slate-600">{t("เชื่อมแล้ว", "Linked")} <b>{linked}/{total}</b></span>
        <button type="button" onClick={() => onOnlyUnlinked(!onlyUnlinked)} className={`h-6 rounded-full border px-2 ${onlyUnlinked ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{t("เฉพาะที่ยังไม่เชื่อม", "Unlinked only")}</button>
      </div>
      <p className={`mb-1.5 rounded-lg px-2 py-1 text-[12px] ${selectedCount ? "bg-violet-50 text-violet-800" : "bg-slate-50 text-slate-500"}`}>
        {selectedCount ? t(`เลือก ${selectedCount} อัลบั้ม → กดสินค้าด้านล่างเพื่อเชื่อม`, `${selectedCount} album(s) selected → click a product`) : t("กดเลือกอัลบั้ม (Shift / ลากคลุมได้) แล้วกดสินค้า · หรือลากสินค้าไปวางบนอัลบั้ม", "Select albums then click a product · or drag a product onto an album")}
      </p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นรหัส / ชื่อสินค้า…", "Search code / name…")}
        className="mb-1.5 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12.5px] focus:border-violet-400 focus:outline-none" />
      <div className="mb-1.5 flex gap-1 text-[11.5px]">
        {brandId && <button type="button" onClick={() => setAllBrands(false)} className={`h-6 rounded-full border px-2 ${!allBrands ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>{brandName ?? t("แบรนด์นี้", "This brand")}</button>}
        <button type="button" onClick={() => setAllBrands(true)} className={`h-6 rounded-full border px-2 ${allBrands || !brandId ? "border-violet-500 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>{t("ทุกแบรนด์", "All brands")}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {err ? <p className="p-3 text-[12px] text-rose-600">{err}</p>
          : !cat ? <p className="p-3 text-[12px] text-slate-400">{t("กำลังโหลดสินค้า…", "Loading…")}</p>
          : !items.length ? <p className="p-3 text-[12px] text-slate-400">{t("ไม่พบสินค้า", "No products")}</p>
          : (
            <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-2">
              {items.map((i) => {
                const img = r2ImageUrl(i.image_key, 200);
                return (
                  <button key={i.parent_sku_id} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(PRODUCT_DRAG, i.code); e.dataTransfer.effectAllowed = "link"; }}
                    onClick={() => onPick(i)} title={`${i.code} · ${i.name}`}
                    className={`overflow-hidden rounded-lg border bg-white text-left hover:border-violet-400 ${selectedCount ? "border-violet-200" : "border-slate-200"}`}>
                    <span className="relative block w-full bg-slate-50 pt-[100%]">
                      {img
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={img} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
                        : <span className="absolute inset-0 flex items-center justify-center text-slate-300"><Icon value="i:photo" /></span>}
                    </span>
                    <span className="block truncate px-1.5 pt-0.5 font-mono text-[10.5px] text-slate-700">{i.code}</span>
                    <span className="block truncate px-1.5 pb-1 text-[10.5px] text-slate-500">{i.name}</span>
                  </button>
                );
              })}
            </div>
          )}
      </div>
    </aside>
  );
}

/** ติ๊ก SKU ลูกของอัลบั้มที่เชื่อมรุ่นแล้ว (กดชิปรหัสบนการ์ด · โหมด Mass) */
export function SkuChipsDialog({ open, albumName, parentCode, skuCodes, onClose, onSave }: {
  open: boolean; albumName: string; parentCode: string | null; skuCodes: string[];
  onClose: () => void; onSave: (skus: string[]) => Promise<void> | void;
}) {
  const t = useT();
  const [item, setItem] = useState<SkuPickerItem | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !parentCode) return;
    setPicked(new Set(skuCodes)); setItem(null);
    loadProductCatalog().then((c) => setItem(c.items.find((i) => i.code === parentCode) ?? null)).catch(() => setItem(null));
  }, [open, parentCode]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ERPModal open={open} onClose={onClose} size="md" title={t(`SKU ลูกของ "${albumName}"`, `Child SKUs of "${albumName}"`)} description={parentCode ?? ""}
      footer={<div className="flex w-full justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSave([...picked]); onClose(); } finally { setBusy(false); } }}
          className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
      </div>}>
      {item ? <ChildChips parent={item} picked={picked}
        onToggle={(c) => setPicked((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
        onAll={(codes) => setPicked(new Set(codes))} />
        : <p className="py-6 text-center text-[13px] text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>}
    </ERPModal>
  );
}
