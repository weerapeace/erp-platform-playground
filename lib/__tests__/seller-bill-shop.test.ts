import { describe, it, expect } from "vitest";
import { phoneMatch, accountMatch, rankShops, autoPick, voucherCurrency, type ShopLite } from "@/lib/seller-bill-shop";
import { groupKey, normalizeBillLine, type PoGroup } from "@/lib/seller-bill-match";

const shops: ShopLite[] = [
  { id: "b242", name: "ร้านอี้หลงเจียห่าว (B242)", account_number: "6222 0212 3456 0418", phone: null },
  { id: "dg", name: "ร้านอี้หลงตงก่วน", account_number: "6217 0000 1111 2222", phone: "0769-8888-1234" },
  { id: "yj", name: "ร้านผ้า YIJUN FFB02", name_en: "亿骏特材" },
  { id: "x", name: "ร้านอื่น" },
];
const g = (po: string, code: string, name: string, price: number): PoGroup => ({ key: groupKey(po, code, name), po_id: po, po_no: po, order_date: "2026-11-03", item_sku_id: code, code, item_name: name, name_cn: null, uom: "Units",
  unit_price: price, qty_total: 300, remaining: 300, lines: [{ id: `${po}-1`, qty: 300, remaining: 300, qty_received: 0, sort_order: 0, note: null, voucher_line_id: null, from_gr: false }], in_voucher: false, image_url: null });
const L = (o: Record<string, unknown>) => normalizeBillLine(o);

describe("หาร้านจากบิล — เบอร์ / เลขบัญชี", () => {
  it("เบอร์ตรง = 8 หลักท้ายเท่ากัน (มีรหัสประเทศ/ขีด/หลายเบอร์ได้)", () => {
    expect(phoneMatch("+86 769 8888 1234", "0769-8888-1234")).toBe(true);
    expect(phoneMatch("138 0000 1111 / 0769-8888-1234", "07698888 1234")).toBe(true);
    expect(phoneMatch("13800001111", "0769-8888-1234")).toBe(false);
    expect(phoneMatch(null, "0769-8888-1234")).toBe(false);
  });
  it("เลขบัญชี: ตรงทั้งหมด / บิลพิมพ์ปิดบางส่วน (4 หน้า + 4 ท้าย)", () => {
    expect(accountMatch("6222021234560418", "6222 0212 3456 0418")).toBe("exact");
    expect(accountMatch("6222 **** **** 0418", "6222 0212 3456 0418")).toBe("partial");
    expect(accountMatch("6222 **** **** 9999", "6222 0212 3456 0418")).toBeNull();
    expect(accountMatch("6222021234560418", "")).toBeNull();
  });
  it("สกุลในบิล → สกุลของใบ", () => {
    expect(voucherCurrency("CNY")).toBe("RMB");
    expect(voucherCurrency("¥")).toBe("RMB");
    expect(voucherCurrency(null)).toBe("RMB");
    expect(voucherCurrency("THB")).toBe("THB");
  });
});

describe("หาร้านจากบิล — เรียงร้านที่น่าจะใช่", () => {
  const groupsByShop = new Map<string, PoGroup[]>([["b242", [g("PO-1", "A069-2/9MM#N", "คอหมามาเวล 9 mm. สีเงิน", 4.5)]], ["dg", [g("PO-2", "A037-3", "คอหมา 1 cm. สีนิเกิ้ล", 0.9)]]]);
  const lines = [L({ name_cn: "狗扣", spec_cn: "9mm 银色", name_th: "คอหมามาเวล 9 มม.", spec_th: "สีเงิน", qty: 300, unit_price: 4.5 })];
  it("เลขบัญชีตรง + ของตรง PO = ร้านนั้นมั่นใจ และเลือกให้ล่วงหน้าได้", () => {
    const c = rankShops({ seller_name: "义隆嘉豪五金", seller_phone: null, seller_account: "6222021234560418", ai_shop: null, ai_conf: null }, lines, shops, groupsByShop);
    expect(c[0].partner_id).toBe("b242");
    expect(c[0].reasons).toEqual(expect.arrayContaining(["เลขบัญชีตรง"]));
    expect(c[0].reasons.some((r) => r.startsWith("ของตรง PO"))).toBe(true);
    expect(autoPick(c)?.partner_id).toBe("b242");
  });
  it("ชื่อจีนในทะเบียน (name_en/company_name) ตรงกับบิล", () => {
    const c = rankShops({ seller_name: "亿骏特材", seller_phone: null, seller_account: null, ai_shop: null, ai_conf: null }, [], shops, groupsByShop);
    expect(c[0].partner_id).toBe("yj");
    expect(c[0].reasons).toContain("ชื่อจีนตรง");
  });
  it("ไม่มีสัญญาณเลย = ไม่เสนอร้าน (ไม่เดา) · สองร้านคะแนนใกล้กัน = ไม่เลือกให้ล่วงหน้า", () => {
    expect(rankShops({ seller_name: "广州恒达", seller_phone: null, seller_account: null, ai_shop: null, ai_conf: null }, [], shops, new Map())).toEqual([]);
    expect(autoPick([{ partner_id: "a", name: "A", score: 0.7, reasons: [] }, { partner_id: "b", name: "B", score: 0.62, reasons: [] }])).toBeNull();
    expect(autoPick([{ partner_id: "a", name: "A", score: 0.5, reasons: [] }])).toBeNull();
  });
  it("AI เลือกอย่างเดียว (ไม่มีหลักฐานอื่น) = อาจใช่ ไม่ถึงขั้นเลือกให้", () => {
    const c = rankShops({ seller_name: "义隆嘉豪五金", seller_phone: null, seller_account: null, ai_shop: "dg", ai_conf: 0.5 }, [], shops, groupsByShop);
    expect(c[0].partner_id).toBe("dg");
    expect(autoPick(c)).toBeNull();
  });
});
