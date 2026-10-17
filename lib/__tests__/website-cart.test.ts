import { describe, expect, it } from "vitest";
import { normalizeCart, pickCartRecs, addBusinessDays, freeShipLine, DEFAULT_CART } from "@/lib/website-cart";

describe("website-cart", () => {
  it("normalizeCart: ค่าเริ่ม = หน้าตาเดิม · ค่าผิดกลับค่าเริ่ม · etaMax ≥ etaMin", () => {
    expect(normalizeCart(null)).toEqual(DEFAULT_CART);
    const c = normalizeCart({ style: "zz", width: "lg", etaMin: 5, etaMax: 2, recsLimit: 99, recsCodes: ["bbp10", "BBP10", "bad code!"], trustItems: [{ icon: "🔒", text: "" }, { icon: "🚚", text: "ส่งไว" }] });
    expect(c.style).toBe("drawer-right");
    expect(c.width).toBe("lg");
    expect(c.etaMax).toBe(5);
    expect(c.recsLimit).toBe(12);
    expect(c.recsCodes).toEqual(["BBP10"]);
    expect(c.trustItems).toEqual([{ icon: "🚚", text: "ส่งไว" }]);
  });
  const P = (id: string, price: number, extra: Record<string, unknown> = {}) => ({ id, code: id.toUpperCase(), price, ...extra });
  const all = [P("a", 100, { category: "bag" }), P("b", 500, { category: "bag", featured: true }), P("c", 300, { category: "wallet", salesRank: 1 }), P("d", 900, { stock: "out", category: "bag" }), P("e", 0, { category: "bag" })];
  it("pickCartRecs auto: หมวดเดียวกัน+แนะนำขึ้นก่อน · ไม่ซ้ำตะกร้า · ข้ามหมด/ไม่มีราคา", () => {
    const r = pickCartRecs(all, ["a"], { recsSource: "auto", recsCodes: [], recsLimit: 6, recsFreeShip: false });
    expect(r.map((p) => p.id)).toEqual(["b", "c"]);
  });
  it("pickCartRecs: อีกนิดส่งฟรี → ราคาที่ถึงพอดีขึ้นก่อน · manual ตามที่เลือก", () => {
    const r = pickCartRecs(all, [], { recsSource: "auto", recsCodes: [], recsLimit: 6, recsFreeShip: true }, 250);
    expect(r[0].id).toBe("c");
    const m = pickCartRecs(all, [], { recsSource: "manual", recsCodes: ["C", "A", "D"], recsLimit: 6, recsFreeShip: false });
    expect(m.map((p) => p.id)).toEqual(["c", "a"]);
  });
  it("addBusinessDays ข้ามเสาร์อาทิตย์ · freeShipLine", () => {
    // ศุกร์ 16 ต.ค. 2026 + 1 วันทำการ = จันทร์ 19
    expect(addBusinessDays(new Date(2026, 9, 16), 1).getDate()).toBe(19);
    expect(freeShipLine("อีก {amount} ส่งฟรี", "฿200")).toBe("อีก ฿200 ส่งฟรี");
  });
});
