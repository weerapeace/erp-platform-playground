"use client";
/**
 * ป๊อป "เชื่อมอัลบั้มกับสินค้า" (หน้า SAMPLE Images)
 * รอบ 2 (เจ้าของเลือกจาก widget 2026-11-17 ข้อ 1-5): ตารางการ์ดรูป = ของกลาง MarketingSkuPickerModal แบบเลือกรุ่นเดียว (single)
 *   - เปิดที่แบรนด์ของอัลบั้มก่อน (สลับ "ทุกแบรนด์" ได้ · ค้นได้) · Ctrl + ลูกกลิ้ง ปรับขนาดการ์ด (จำรายคน)
 *   - กดการ์ด → SKU ลูกขึ้นใต้ตารางให้ติ๊ก (ไม่ติ๊ก = ทั้งรุ่น) · เลิกเชื่อมได้
 * บันทึกที่ POST /api/sample-images {action:"link"} (สิทธิ์ assets.edit · ลงประวัติ)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { findParentSkuByCode } from "@/components/pickers";
import { MarketingSkuPickerModal, type SkuPickerCatalog, type SkuPickerItem } from "@/components/marketing-sku-picker-modal";
import { LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import { withImageWidth } from "@/lib/r2-image";
import { linkAlbumProduct, loadChildSkus, type ChildSku } from "./api";

const thumb = (key: string | null, w = 80) => (key ? withImageWidth(`/api/r2-image?key=${encodeURIComponent(key)}`, w) : null);

/** SKU ลูกของรุ่นที่เลือก (ใต้ตาราง) */
function ChildChips({ parent, picked, onToggle, onAll }: { parent: SkuPickerItem; picked: Set<string>; onToggle: (code: string) => void; onAll: (codes: string[]) => void }) {
  const t = useT();
  const [kids, setKids] = useState<ChildSku[] | null>(null);
  useEffect(() => {
    let alive = true;
    setKids(null);
    loadChildSkus(parent.parent_sku_id).then((k) => { if (alive) setKids(k); }).catch(() => { if (alive) setKids([]); });
    return () => { alive = false; };
  }, [parent.parent_sku_id]);
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
        <b>{parent.code}</b><span className="truncate text-slate-500">{parent.name}</span>
        <span className="text-[12px] text-slate-400">· {t("SKU ลูกที่ตรงกับอัลบั้มนี้ (ไม่ติ๊ก = ทั้งรุ่น)", "Child SKUs for this album (none = whole model)")}</span>
        {kids && kids.length > 1 && <button type="button" onClick={() => onAll(picked.size === kids.length ? [] : kids.map((k) => k.code))} className="ml-auto text-[12px] text-violet-700 hover:underline">{picked.size === kids.length ? t("ไม่เลือกเลย", "Clear") : t("เลือกทั้งหมด", "All")}</button>}
      </div>
      {!kids ? <LoadingState className="py-4 text-sm" />
        : !kids.length ? <p className="text-[13px] text-slate-500">{t("รุ่นนี้ยังไม่มี SKU ลูก — เชื่อมทั้งรุ่น", "No child SKUs — linking the whole model")}</p>
        : (
          <div className="flex flex-wrap gap-1.5">
            {kids.map((k) => {
              const on = picked.has(k.code), src = thumb(k.image_key, 60);
              return (
                <button key={k.id} type="button" onClick={() => onToggle(k.code)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[12px] ${on ? "border-violet-500 bg-violet-100 text-violet-900" : "border-slate-200 bg-white text-slate-700 hover:border-violet-300"}`}>
                  {src
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={src} alt="" className="h-6 w-6 rounded-full object-cover" />
                    : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-300"><Icon value="i:photo" /></span>}
                  {k.code.startsWith(parent.code) ? k.code.slice(parent.code.length).replace(/^[-_\s]+/, "") || k.code : k.code}{k.name ? ` · ${k.name}` : ""}
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}

export function LinkProductDialog({ open, albumId, albumName, brandId, parentCodes, skuCodes, onClose, onSaved }: {
  open: boolean; albumId: string; albumName: string;
  /** แบรนด์ของอัลบั้ม — เปิดที่แบรนด์นี้ก่อน */
  brandId?: string | null;
  parentCodes: string[]; skuCodes: string[];
  onClose: () => void;
  onSaved: (link: { parent_sku_codes: string[]; sku_codes: string[] }) => void;
}) {
  const t = useT();
  const [initId, setInitId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const cur = useRef<SkuPickerItem | null>(null);   // รุ่นที่เลือกอยู่ (ไว้เอารหัสตอนบันทึก)
  const lastParent = useRef<string | null>(null);

  // เปิดมา: เชื่อมไว้แล้ว = ติ๊กรุ่นเดิม + SKU เดิม
  useEffect(() => {
    if (!open) return;
    setPicked(new Set(skuCodes)); setInitId(null); cur.current = null; lastParent.current = null;
    if (parentCodes[0]) void findParentSkuByCode(parentCodes[0]).then((p) => { if (p) { setInitId(p.id); lastParent.current = p.id; } });
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (): Promise<SkuPickerCatalog> => {
    let j: { data?: SkuPickerCatalog; error?: string };
    try { j = await (await apiFetch("/api/parent-skus/spec-export?catalog=1")).json(); }
    catch { throw new Error(t("โหลดรายการสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง", "Couldn't load products — try again")); }
    if (j.error || !j.data) throw new Error(j.error || t("โหลดรายการสินค้าไม่สำเร็จ", "Couldn't load products"));
    return { ...j.data, startBrandId: brandId ?? null, takenIds: [] };
  }, [brandId, t]);

  const save = async (codes: string[], skus: string[]) => {
    setBusy(true);
    try { const r = await linkAlbumProduct(albumId, codes, skus); onSaved(r); return true; }
    finally { setBusy(false); }
  };

  return (
    <MarketingSkuPickerModal open={open} onClose={onClose} single
      title={t(`เชื่อม "${albumName}" กับสินค้า`, `Link "${albumName}" to a product`)}
      description={t("กดการ์ดสินค้า แล้วติ๊ก SKU ลูกด้านล่าง (ไม่ติ๊ก = ทั้งรุ่น) · รูปในอัลบั้มจะโชว์ในส่วน \"รูป SAMPLE\" ของหน้าสินค้า", "Pick a product, then tick child SKUs below")}
      load={load} startBrandId={brandId ?? null} initialSelected={initId ? [initId] : []}
      taken={{ badge: "", short: "", hide: t("ซ่อนที่เลือกแล้ว", "Hide picked"), row: "" }}
      confirmText={() => t("บันทึก", "Save")} busyText={t("กำลังบันทึก…", "Saving…")}
      footerExtra={parentCodes.length > 0 ? (
        <button type="button" disabled={busy} onClick={() => void save([], []).then(() => onClose())} className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-60">{t("เลิกเชื่อม", "Unlink")}</button>
      ) : undefined}
      below={(sel) => {
        const p = sel[0] ?? null;
        cur.current = p;
        if (!p) return <p className="text-[12px] text-slate-400">{t("ยังไม่ได้เลือกสินค้า — กดการ์ดด้านบน", "Pick a product card above")}</p>;
        // เปลี่ยนรุ่น = ล้าง SKU ที่ติ๊กไว้
        if (lastParent.current !== p.parent_sku_id) { lastParent.current = p.parent_sku_id; queueMicrotask(() => setPicked(new Set())); }
        return <ChildChips parent={p} picked={picked}
          onToggle={(c) => setPicked((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
          onAll={(codes) => setPicked(new Set(codes))} />;
      }}
      onConfirm={async () => {
        const p = cur.current;
        if (!p) return false;
        return save([p.code], [...picked]);
      }}
      tabPrefKey="sample_link_pick_tab" colsPrefKey="sample-link-pick" showFullPageLink={false} />
  );
}
