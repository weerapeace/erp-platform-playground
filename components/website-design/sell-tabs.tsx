"use client";

/** ซื้อขาย — ตะกร้า + หน้าชำระเงิน (ตั้งค่าหลักอยู่ website-cart-settings / website-checkout-settings) (แยกจาก components/website-theme-panel.tsx — ค่าทุกช่องยังอยู่ในธีมเดิม) */
import { CartSettings } from "@/components/website-cart-settings";
import { CheckoutSettings } from "@/components/website-checkout-settings";
import { CART_PARTS, CHECKOUT_PARTS } from "@/lib/website-page-parts";
import { useAreaFold } from "./shared";
import { useDesign } from "./context";

export function CheckoutTab() {
  const { theme, choices, apply, setPage } = useDesign();
  const areaFold = useAreaFold();
  return (
    <>
      <CheckoutSettings value={theme.checkout} onChange={(checkout) => apply({ ...theme, checkout })} payInfo={choices?.payInfo} onPreviewPage={setPage} />
      {areaFold("checkout", CHECKOUT_PARTS, "กล่อง · ช่องกรอก · วิธีชำระ · ปุ่มยืนยัน", "/checkout")}
    </>
  );
}

export function CartTab() {
  const { shopSlug, theme, choices, apply, setPage } = useDesign();
  const areaFold = useAreaFold();
  return (
    <>
      <CartSettings value={theme.cart} onChange={(cart) => apply({ ...theme, cart })} shopSlug={shopSlug} categories={choices?.categories ?? []} onPreviewPage={setPage} />
      {areaFold("cart", CART_PARTS, "ลิ้นชัก/หน้าตะกร้า · แถวสินค้า · ยอดรวม · ปุ่ม")}
    </>
  );
}
