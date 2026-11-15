/**
 * 🧾 ใบสำคัญรับ — กติกากลาง (pure) ของ "เช็กลิสต์ก่อนยืนยัน" + "งานถัดไปหลังยืนยัน" (หน้า /purchasing/vouchers/[id] แบบ B)
 * เจ้าของเลือก 2026-11-04: หน้าเดียว + เช็กลิสต์ด้านขวา + ป๊อปยืนยันบอกว่ากดแล้วเกิดอะไร + การ์ดงานถัดไป
 * กติกายืนยันจริงอยู่ที่ API /api/purchasing/vouchers/[id]/confirm (ราคาครบ · สกุลต่างประเทศต้องมีเรท) — ไฟล์นี้แค่บอกล่วงหน้าให้ตรงกัน
 * ทดสอบ: lib/__tests__/purchase-voucher-checklist.test.ts
 */

export type CheckLevel = "ok" | "block" | "warn" | "info";
export type CheckItem = { key: string; level: CheckLevel; label: string; hint?: string };

export type ChecklistInput = {
  line_count: number;
  foreign: boolean;
  currency_label: string;
  fx_rate: number;
  missing_price_count: number;
  /** มีค่าส่งให้คิดไหม (ใบไม่ได้ตั้ง "ไม่คิดค่าส่ง" หรือมีบรรทัดระบุเอง) */
  any_ship: boolean;
  ship_total_thb: number;
  missing_basis_count: number;
  missing_rate_count: number;
  dirty: boolean;
  /** เรทอ้างอิง = เรทหยวนของวันที่ใบ (แอปโอนเงินจีน) · ไม่มี = ไม่เช็กว่าเรทผิดปกติ */
  ref_fx_rate?: number | null;
  /** ★ 2026-11-15 ยอดจ่ายจริงตามบิล (实付款 ฿) · ยอดจ่ายร้านของใบ (ค่าสินค้า + ค่าส่งในจีน + ค่าธรรมเนียม) — ไม่มียอดจ่ายจริง = ไม่เช็ก */
  paid_total_thb?: number | null;
  shop_total_thb?: number;
};

/** ยอดใบกับยอดจ่ายจริงต่างกันไม่เกินเท่านี้ (บาท) ถือว่าตรง — เศษปัดเรท/สตางค์ */
export const PAID_TOLERANCE_THB = 1;
/** ยอดใบ − ยอดจ่ายจริง (บวก = ใบสูงกว่า) · ไม่มียอดจ่ายจริง = null */
export const paidDiff = (shopTotalThb: number | null | undefined, paidThb: number | null | undefined): number | null =>
  Number(paidThb) > 0 ? Math.round((Number(shopTotalThb ?? 0) - Number(paidThb)) * 100) / 100 : null;

/**
 * ★ 2026-11-15 เจ้าของ: "อยากให้เตือนเวลาพิมพ์เกินไปเยอะ" (ยอดบาท ¥600 → ฿5,000 = เรท 8.33 ทั้งที่เรทจริง ~5.2)
 * เรทต่างจากเรทอ้างอิงเกินกี่ % ถึงเตือน — เจ้าของเลือก 10% (เรทจริงขยับไม่ถึง 5% จึงไม่เตือนพร่ำเพรื่อ)
 */
export const FX_WARN_PCT = 10;
/** เรทต่างจากเรทอ้างอิงกี่ % (บวก = สูงกว่า) · ไม่มีเรทตัวใดตัวหนึ่ง = null */
export function fxDeviationPct(rate: number, ref: number | null | undefined): number | null {
  const r = Number(ref);
  if (!(Number(rate) > 0) || !(r > 0)) return null;
  return ((Number(rate) - r) / r) * 100;
}
/** เรทผิดปกติ = ต่างจากเรทอ้างอิงเกิน FX_WARN_PCT */
export const fxAbnormal = (pct: number | null) => pct != null && Math.abs(pct) > FX_WARN_PCT;
/** ข้อความสั้น เช่น "สูงกว่าเรทวันที่ใบ (5.21) 60%" */
export const fxDeviationText = (pct: number, ref: number) => `${pct > 0 ? "สูง" : "ต่ำ"}กว่าเรทวันที่ใบ (${ref}) ${Math.round(Math.abs(pct))}%`;

const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** รายการเช็กก่อนยืนยัน — block = ยืนยันไม่ได้ (ตรงกับที่ API จะปฏิเสธ) · warn = ยืนยันได้แต่ควรดู */
export function voucherChecklist(i: ChecklistInput): CheckItem[] {
  const out: CheckItem[] = [];
  if (i.line_count === 0) out.push({ key: "lines", level: "block", label: "ยังไม่มีรายการ", hint: "เพิ่มจากใบรับ หรือกด ＋ เพิ่มรายการเอง" });
  else if (i.missing_price_count > 0) out.push({ key: "price", level: "block", label: `ยังไม่มีราคา ${i.missing_price_count} รายการ`, hint: "ใส่ราคาในตาราง (ช่องสีเหลือง) หรือให้ AI อ่านบิลร้าน" });
  else out.push({ key: "price", level: "ok", label: `ทุกรายการมีราคา (${i.line_count})` });

  if (i.foreign) {
    const dev = fxDeviationPct(i.fx_rate, i.ref_fx_rate);
    out.push(!(i.fx_rate > 0)
      ? { key: "fx", level: "block", label: "ยังไม่มีเรทแปลงเป็นบาท", hint: "ใส่เรทที่หัวใบ" }
      : fxAbnormal(dev)
        ? { key: "fx", level: "warn", label: `เรท ${i.fx_rate} ${fxDeviationText(dev as number, Number(i.ref_fx_rate))}`, hint: "ยอดบาทหรือเรทพิมพ์ผิดไหม? ถ้าถูกจริง ยืนยันได้" }
        : { key: "fx", level: "ok", label: `เรท ${i.fx_rate} บาท ต่อ 1 ${i.currency_label}` });
  } else {
    out.push({ key: "fx", level: "ok", label: "สกุลบาท ไม่ต้องใช้เรท" });
  }

  // ★ 2026-11-15 เทียบยอดจ่ายจริงตามบิล (เจ้าของ: "รวมทั้งสิ้นต้องได้ 347.53 ตามบิล") — ยืนยันได้ แต่ควรดู
  const pd = paidDiff(i.shop_total_thb, i.paid_total_thb);
  if (pd != null) {
    out.push(Math.abs(pd) <= PAID_TOLERANCE_THB
      ? { key: "paid", level: "ok", label: `ยอดตรงกับที่จ่ายจริง ฿${money(Number(i.paid_total_thb))}` }
      : { key: "paid", level: "warn", label: `ยอดใบ ฿${money(Number(i.shop_total_thb))} ${pd > 0 ? "มากกว่า" : "น้อยกว่า"}ยอดจ่ายจริง ฿${money(Number(i.paid_total_thb))} (ต่าง ฿${money(Math.abs(pd))})`,
          hint: "เช็กส่วนลดซ้ำ / ค่าส่งในจีน / ค่าธรรมเนียม / เรท — หรือกด \"ปรับเรทให้ตรงยอดจ่าย\" (ยืนยันได้)" });
  }

  if (!i.any_ship) out.push({ key: "ship", level: "info", label: "ไม่คิดค่าส่งรอบนี้", hint: "มีค่าส่ง → เปิดกล่องค่าส่งแล้วเลือกร้านขนส่ง" });
  else if (i.missing_basis_count > 0 || i.missing_rate_count > 0) {
    const parts = [i.missing_basis_count > 0 ? `${i.missing_basis_count} รายการไม่มีคิว/กก.` : "", i.missing_rate_count > 0 ? `${i.missing_rate_count} รายการไม่มีเรท` : ""].filter(Boolean);
    out.push({ key: "ship", level: "warn", label: `ค่าส่ง ฿${money(i.ship_total_thb)} — ${parts.join(" · ")}`, hint: "รายการนั้นจะไม่ได้รับค่าส่ง (ยืนยันได้)" });
  } else if (i.ship_total_thb > 0) out.push({ key: "ship", level: "ok", label: `ค่าส่ง ฿${money(i.ship_total_thb)}` });
  else out.push({ key: "ship", level: "warn", label: "ค่าส่ง ฿0", hint: "ใส่เรท หรือยอดจริงจากบิลขนส่ง (ยืนยันได้)" });

  if (i.dirty) out.push({ key: "dirty", level: "info", label: "มีการแก้ไขที่ยังไม่บันทึก", hint: "กดยืนยัน ระบบบันทึกให้ก่อน" });
  return out;
}

export const canConfirm = (items: CheckItem[]) => !items.some((c) => c.level === "block");

// ---------------- หลังยืนยัน: งานถัดไป ----------------
export type PayRow = { po_no: string; payment_status: string; china_bill_id?: string | null };
export type NextStepState = { goods: "done" | "billed" | "todo" | "none"; shipping: "done" | "todo" | "none" };

/** ค่าสินค้า: จ่ายครบทุกใบ = done · ลงบิลจีนแล้ว (รอโอน) ครบทุกใบที่เหลือ = billed · ไม่มีใบสั่งซื้อ = none */
export function nextSteps(pos: PayRow[], shipTotalThb: number, shippingPaid: boolean): NextStepState {
  const unpaid = pos.filter((p) => String(p.payment_status).toLowerCase() !== "paid");
  const goods = pos.length === 0 ? "none" : unpaid.length === 0 ? "done" : unpaid.every((p) => !!p.china_bill_id) ? "billed" : "todo";
  const shipping = shipTotalThb > 0 ? (shippingPaid ? "done" : "todo") : "none";
  return { goods, shipping };
}
