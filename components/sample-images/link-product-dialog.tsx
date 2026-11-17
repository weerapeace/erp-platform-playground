"use client";
/**
 * ป๊อป "เชื่อมอัลบั้มกับสินค้า" (หน้า SAMPLE Images · เจ้าของเลือกจาก widget 2026-11-17 ระดับ A)
 * เลือก Parent SKU ด้วยตัวเลือกกลาง ParentSkuPicker → ติ๊ก SKU ลูกที่ตรงกับอัลบั้ม (ไม่ติ๊ก = ทั้งรุ่น) · เลิกเชื่อมได้
 * บันทึกที่ POST /api/sample-images {action:"link"} (สิทธิ์ assets.edit · ลงประวัติ)
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ParentSkuPicker, findParentSkuByCode, type ParentSkuPickerValue } from "@/components/pickers";
import { LoadingState } from "@/components/state-views";
import { withImageWidth } from "@/lib/r2-image";
import { linkAlbumProduct, loadChildSkus, type ChildSku } from "./api";

const thumb = (key: string | null, w = 80) => (key ? withImageWidth(`/api/r2-image?key=${encodeURIComponent(key)}`, w) : null);

export function LinkProductDialog({ open, albumId, albumName, parentCodes, skuCodes, onClose, onSaved }: {
  open: boolean; albumId: string; albumName: string;
  parentCodes: string[]; skuCodes: string[];
  onClose: () => void;
  onSaved: (link: { parent_sku_codes: string[]; sku_codes: string[] }) => void;
}) {
  const t = useT();
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [kids, setKids] = useState<ChildSku[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // เปิดมา: เชื่อมไว้แล้ว = โหลด Parent เดิม + SKU ที่ติ๊กไว้
  useEffect(() => {
    if (!open) return;
    setErr(null); setPicked(new Set(skuCodes)); setParent(null); setKids(null);
    if (parentCodes[0]) void findParentSkuByCode(parentCodes[0]).then((p) => setParent(p));
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!parent) { setKids(null); return; }
    let alive = true;
    setKids(null);
    loadChildSkus(parent.id).then((k) => { if (alive) setKids(k); }).catch((e) => { if (alive) { setKids([]); setErr((e as Error).message); } });
    return () => { alive = false; };
  }, [parent]);

  const toggle = (code: string) => setPicked((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const save = async (unlink = false) => {
    if (!unlink && !parent) { setErr(t("เลือก Parent SKU ก่อน", "Pick a Parent SKU first")); return; }
    setBusy(true); setErr(null);
    try {
      const kidCodes = new Set((kids ?? []).map((k) => k.code));
      const r = await linkAlbumProduct(albumId, unlink ? [] : [parent!.code], unlink ? [] : [...picked].filter((c) => kidCodes.has(c)));
      onSaved(r); onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <ERPModal open={open} onClose={onClose} size="md" defaultExpanded={false} storageKey="sample-link-product"
      title={t(`เชื่อม "${albumName}" กับสินค้า`, `Link "${albumName}" to a product`)}
      description={t("รูปในอัลบั้มนี้จะโชว์ในส่วน \"รูป SAMPLE\" ของหน้า Parent / SKU ที่เลือก (ไม่ปนรูปขาย)", "Photos show in the SAMPLE section of the chosen Parent / SKU pages")}
      footer={<div className="flex w-full flex-wrap items-center gap-2">
        {parentCodes.length > 0 && <button type="button" disabled={busy} onClick={() => void save(true)} className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-60">{t("เลิกเชื่อม", "Unlink")}</button>}
        <span className="flex-1" />
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={busy} onClick={() => void save()} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
      </div>}>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[13px] text-slate-600">{t("Parent SKU", "Parent SKU")}</div>
          <ParentSkuPicker value={parent} onChange={(v) => { setParent(v); setPicked(new Set()); setErr(null); }} disableCreate />
        </div>
        {parent && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-[13px] text-slate-600">
              <span>{t("SKU ลูกที่ตรงกับอัลบั้มนี้", "Child SKUs for this album")}</span>
              <span className="text-[12px] text-slate-400">{t("ไม่ติ๊ก = ทั้งรุ่น", "none = whole model")}</span>
              {kids && kids.length > 1 && <button type="button" onClick={() => setPicked(picked.size === kids.length ? new Set() : new Set(kids.map((k) => k.code)))} className="ml-auto text-[12px] text-violet-700 hover:underline">{picked.size === kids.length ? t("ไม่เลือกเลย", "Clear") : t("เลือกทั้งหมด", "All")}</button>}
            </div>
            {!kids ? <LoadingState className="py-6 text-sm" />
              : !kids.length ? <p className="rounded-lg border border-dashed border-slate-200 p-3 text-[13px] text-slate-500">{t("รุ่นนี้ยังไม่มี SKU ลูก — เชื่อมทั้งรุ่น", "No child SKUs — linking the whole model")}</p>
              : (
                <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {kids.map((k) => {
                    const src = thumb(k.image_key);
                    return (
                      <label key={k.id} className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-slate-50">
                        <input type="checkbox" checked={picked.has(k.code)} onChange={() => toggle(k.code)} />
                        {src
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-md border border-slate-200 object-cover" />
                          : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300"><Icon value="i:photo" /></span>}
                        <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{k.code}{k.name ? <span className="text-slate-500"> · {k.name}</span> : null}</span>
                      </label>
                    );
                  })}
                </div>
              )}
          </div>
        )}
        {err && <p className="text-[13px] text-rose-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
