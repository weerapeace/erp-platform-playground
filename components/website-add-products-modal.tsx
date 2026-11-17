"use client";
/**
 * ➕ ป๊อป "เพิ่มสินค้าเข้าเว็บ" (แท็บ สินค้าบนเว็บ ของหน้า /website/<slug>)
 *   ใช้ป๊อปกลาง MarketingSkuPickerModal (การ์ดแบบหน้า SKU การตลาด + แท็บรายการสินค้า) — ตัวเดียวกับ 🛠 เพิ่มรุ่นเข้างาน
 *   เปิดที่แบรนด์ของร้าน · รุ่นที่อยู่บนเว็บแล้ว = ติ๊กไม่ได้ · ป้าย Out Of Stock / ไม่ใช่สินค้าสำหรับขาย = เตือนก่อนเพิ่ม
 *   ค่าเริ่มต้น "ซ่อนไว้ก่อน" (เจ้าของเลือก) ไปตั้งรูป/ราคา/หมวดก่อนค่อยขึ้นเว็บ
 * ข้อมูล: GET /api/website/listings/catalog (ตัวโหลดกลางเดียวกับหน้า SKU การตลาด) · POST /api/website/listings action addMany (audit)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";
import { MarketingSkuPickerModal, type SkuPickerCatalog } from "@/components/marketing-sku-picker-modal";

/** ป้ายที่ควรเตือนก่อนเอาขึ้นเว็บ */
const WARN_LABEL = /out of stock|ไม่ใช่สินค้าสำหรับขาย/i;
const takenText = () => ({ badge: tr("อยู่บนเว็บแล้ว", "Already on web"), short: tr("เว็บ", "Web"), hide: tr("ซ่อนที่อยู่บนเว็บแล้ว", "Hide ones already on web"), row: tr("✓ อยู่แล้ว", "✓ Already added") });

export function WebsiteAddProductsModal({ open, onClose, shop, onAdded }: { open: boolean; onClose: () => void; shop: { id: string; slug: string; name: string }; onAdded: () => void | Promise<void> }) {
  const toast = useToast();
  const t = useT();
  const [publish, setPublish] = useState(false);
  useEffect(() => { if (open) setPublish(false); }, [open]);

  const load = useCallback(async (): Promise<SkuPickerCatalog> => {
    let j: Record<string, unknown>;
    try {
      j = await (await apiFetch(`/api/website/listings/catalog?shop=${encodeURIComponent(shop.slug)}`)).json();
    } catch {
      throw new Error(tr("โหลดรายการสินค้าไม่สำเร็จ", "Failed to load products"));
    }
    if (j.error) throw new Error(String(j.error));
    const c = j as unknown as SkuPickerCatalog & { onShop?: string[]; shopBrandId?: string | null };
    return { ...c, takenIds: c.onShop ?? [], startBrandId: c.shopBrandId ?? null };
  }, [shop.slug]);

  const add = async (ids: string[]): Promise<boolean> => {
    try {
      const j = await (await apiFetch("/api/website/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId: shop.id, action: "addMany", parentIds: ids, publish }) })).json();
      if (!j.ok) { toast.error(j.error ?? t("เพิ่มไม่สำเร็จ", "Add failed")); return false; }
      toast.success(t(`เพิ่ม ${j.added} รุ่นเข้าเว็บแล้ว${publish ? " (ขึ้นเว็บทันที)" : " — ซ่อนไว้ก่อน ไปตั้งรูป/ราคา/หมวดแล้วค่อยเปิด"}${j.skipped ? ` · ข้าม ${j.skipped} (อยู่แล้ว)` : ""}`, `Added ${j.added} models to the web${publish ? " (live now)" : " — hidden for now; set images/price/category, then publish"}${j.skipped ? ` · skipped ${j.skipped} (already added)` : ""}`));
      await onAdded();
      return true;
    } catch {
      toast.error(t("เชื่อมต่อไม่ได้", "Connection failed"));
      return false;
    }
  };

  return (
    <MarketingSkuPickerModal
      open={open}
      onClose={onClose}
      title={t(`➕ เพิ่มสินค้าเข้าเว็บ — ${shop.name}`, `➕ Add products — ${shop.name}`)}
      description={t("ติ๊กได้หลายรุ่น (จำข้ามแท็บ/ข้ามหน้า) แล้วกดเพิ่มทีเดียว", "Tick several models (kept across tabs/pages), then add them all at once")}
      load={load}
      taken={takenText()}
      warn={{ label: WARN_LABEL, note: t("ยังเพิ่มได้ แนะนำซ่อนไว้ก่อน", "Can still be added; best keep hidden for now") }}
      footerExtra={
        <select value={publish ? "pub" : "hide"} onChange={(e) => setPublish(e.target.value === "pub")} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
          <option value="hide">{t("ซ่อนไว้ก่อน (ไปตั้งรูป/ราคา/หมวด)", "Keep hidden (set images/price/category first)")}</option>
          <option value="pub">{t("ขึ้นเว็บทันที", "Go live now")}</option>
        </select>
      }
      confirmText={(n) => (n ? t(`เพิ่ม ${n} รุ่นเข้าเว็บ`, `Add ${n} models`) : t("เพิ่มเข้าเว็บ", "Add to web"))}
      busyText={t("กำลังเพิ่ม…", "Adding…")}
      onConfirm={add}
      tabPrefKey="website_add_products_tab"
      colsPrefKey="website-add-products"
    />
  );
}
