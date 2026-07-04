/**
 * ตะกร้าขอซื้อกลาง (pr_shop_cart) — ตัวช่วยหย่อนวัตถุดิบลงตะกร้าเดียวกับหน้า "ขอซื้อ" (/purchasing)
 * ใช้ได้จากทุกที่ (ป๊อปอัปเช็กลิสต์บอร์ดจ่ายงาน ฯลฯ) แล้วผู้ใช้ไปกดยืนยันสร้างใบขอซื้อที่หน้าขอซื้อ
 *
 * รูปทรง PrCartLine ต้องตรงกับ type Line ในหน้า /purchasing (อ่านตะกร้าจาก localStorage คีย์เดียวกัน)
 */

export type PrCartLine = {
  label: string;
  qty: number;
  uom: string;
  seller: string;
  price: number;
  currency: string;
  image: string | null;
  variationId: string | null;
  skuRef: string | null;
  skuId: string | null;
  note: string;
  reason?: string | null;
  usedForId?: string | null;
  usedForLabel?: string | null;
  urgent?: boolean;
  useDate?: string | null;
  sourceMoNo?: string | null;
};

const CART_KEY = "pr_shop_cart";

function readCart(): PrCartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as PrCartLine[]) : [];
  } catch {
    return [];
  }
}

/** หย่อนรายการลงตะกร้าขอซื้อ (ต่อท้ายของเดิม) → คืนจำนวนรวมในตะกร้าหลังเพิ่ม */
export function addToPrCart(lines: PrCartLine[]): number {
  if (typeof window === "undefined") return 0;
  const next = [...readCart(), ...lines];
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next.length;
}

/** จำนวนรายการในตะกร้าตอนนี้ */
export function prCartCount(): number {
  return readCart().length;
}
