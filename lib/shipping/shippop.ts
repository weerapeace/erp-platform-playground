/**
 * 🚚 ตัวเสียบ SHIPPOP ของชั้นกลางขนส่ง (lib/shipping/provider.ts) — ห่อ lib/shippop.ts เดิม ไม่เปลี่ยนพฤติกรรม
 */
import {
  SHIPPOP_COURIERS, courierLabel, isKnownCourier, shippopBookAndConfirm, shippopCancel, shippopEnv, shippopLabelHtml, shippopMode, shippopQuote,
  shippopStatusLabel, shippopTrack,
} from "@/lib/shippop";
import type { ShippingProvider } from "@/lib/shipping/provider";

export const shippopProvider: ShippingProvider = {
  code: "shippop",
  label: "SHIPPOP",
  couriers: SHIPPOP_COURIERS,
  mode: shippopMode,
  env: shippopEnv,
  quote: shippopQuote,
  book: shippopBookAndConfirm,
  labelHtml: shippopLabelHtml,
  track: shippopTrack,
  cancel: shippopCancel,
  courierLabel,
  isKnownCourier,
  statusLabel: shippopStatusLabel,
};
