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
import { MarketingSkuPickerModal, type SkuPickerCatalog } from "@/components/marketing-sku-picker-modal";

/** ป้ายที่ควรเตือนก่อนเอาขึ้นเว็บ */
const WARN_LABEL = /out of stock|ไม่ใช่สินค้าสำหรับขาย/i;
const TAKEN_TEXT = { badge: "อยู่บนเว็บแล้ว", short: "เว็บ", hide: "ซ่อนที่อยู่บนเว็บแล้ว", row: "✓ อยู่แล้ว" };

export function WebsiteAddProductsModal({ open, onClose, shop, onAdded }: { open: boolean; onClose: () => void; shop: { id: string; slug: string; name: string }; onAdded: () => void | Promise<void> }) {
  const toast = useToast();
  const [publish, setPublish] = useState(false);
  useEffect(() => { if (open) setPublish(false); }, [open]);

  const load = useCallback(async (): Promise<SkuPickerCatalog> => {
    let j: Record<string, unknown>;
    try {
      j = await (await apiFetch(`/api/website/listings/catalog?shop=${encodeURIComponent(shop.slug)}`)).json();
    } catch {
      throw new Error("โหลดรายการสินค้าไม่สำเร็จ");
    }
    if (j.error) throw new Error(String(j.error));
    const c = j as unknown as SkuPickerCatalog & { onShop?: string[]; shopBrandId?: string | null };
    return { ...c, takenIds: c.onShop ?? [], startBrandId: c.shopBrandId ?? null };
  }, [shop.slug]);

  const add = async (ids: string[]): Promise<boolean> => {
    try {
      const j = await (await apiFetch("/api/website/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId: shop.id, action: "addMany", parentIds: ids, publish }) })).json();
      if (!j.ok) { toast.error(j.error ?? "เพิ่มไม่สำเร็จ"); return false; }
      toast.success(`เพิ่ม ${j.added} รุ่นเข้าเว็บแล้ว${publish ? " (ขึ้นเว็บทันที)" : " — ซ่อนไว้ก่อน ไปตั้งรูป/ราคา/หมวดแล้วค่อยเปิด"}${j.skipped ? ` · ข้าม ${j.skipped} (อยู่แล้ว)` : ""}`);
      await onAdded();
      return true;
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
      return false;
    }
  };

  return (
    <MarketingSkuPickerModal
      open={open}
      onClose={onClose}
      title={`➕ เพิ่มสินค้าเข้าเว็บ — ${shop.name}`}
      description="ติ๊กได้หลายรุ่น (จำข้ามแท็บ/ข้ามหน้า) แล้วกดเพิ่มทีเดียว"
      load={load}
      taken={TAKEN_TEXT}
      warn={{ label: WARN_LABEL, note: "ยังเพิ่มได้ แนะนำซ่อนไว้ก่อน" }}
      footerExtra={
        <select value={publish ? "pub" : "hide"} onChange={(e) => setPublish(e.target.value === "pub")} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
          <option value="hide">ซ่อนไว้ก่อน (ไปตั้งรูป/ราคา/หมวด)</option>
          <option value="pub">ขึ้นเว็บทันที</option>
        </select>
      }
      confirmText={(n) => (n ? `เพิ่ม ${n} รุ่นเข้าเว็บ` : "เพิ่มเข้าเว็บ")}
      busyText="กำลังเพิ่ม…"
      onConfirm={add}
      tabPrefKey="website_add_products_tab"
      colsPrefKey="website-add-products"
    />
  );
}
