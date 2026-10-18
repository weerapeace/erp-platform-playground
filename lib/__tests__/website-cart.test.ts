import { describe, expect, it } from "vitest";
import { normalizeCart, pickCartRecs, addBusinessDays, freeShipLine, recsAt, DEFAULT_CART } from "@/lib/website-cart";

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

/** 🛍 ตำแหน่งสินค้าแนะนำในตะกร้า — ค่าเดิม (ไม่มีช่องนี้) = ท้ายรายการแบบเดิม */
describe("recsPos", () => {
  it("ไม่ตั้ง = bottom · ตั้งได้ 4 แบบ · ค่ามั่ว = bottom", () => {
    expect(normalizeCart({}).recsPos).toBe("bottom");
    for (const p of ["top", "afterItems", "bottom", "footer"]) expect(normalizeCart({ recsPos: p }).recsPos).toBe(p);
    expect(normalizeCart({ recsPos: "middle" }).recsPos).toBe("bottom");
  });
});

describe("website-cart — สินค้าแนะนำหลายชุด + ไอคอน/ข้อความ + การ์ด", () => {
  it("ข้อมูลเก่า (ช่อง recs* ชุดเดียว) → ชุดแรกเหมือนเดิม · หน้าตาเดิม (ลิ้นชักเลื่อนข้าง · /cart ตาราง · ใต้รายการ · ทุกครั้ง)", () => {
    const c = normalizeCart({ recs: true, recsTitle: "ซื้อคู่กัน", recsSource: "manual", recsCodes: ["bbp10"], recsLimit: 4, recsFreeShip: false });
    expect(c.recsSets).toHaveLength(1);
    expect(c.recsSets[0]).toMatchObject({ on: true, title: "ซื้อคู่กัน", source: "manual", codes: ["BBP10"], limit: 4, freeShip: false, layout: "row", pageLayout: "grid", place: "bottom", when: "always", btnStyle: "outline" });
    expect(normalizeCart({ recsPos: "top" }).recsSets[0].place).toBe("top"); // ตำแหน่งเดิมทั้งตะกร้า → ชุดแรก
    expect(c.icons.gift).toBe("🎀");
    expect(c.card).toBe(false);
  });

  it("หลายชุด ≤ 3 · ช่อง recs* = สำเนาชุดแรก · ค่ามั่ว = ค่าเริ่ม", () => {
    const c = normalizeCart({ recsSets: [{ id: "a", on: true, title: "A", layout: "addon", place: "footer", when: "items", limit: 1 }, { id: "a", layout: "zz" }, {}, {}] });
    expect(c.recsSets).toHaveLength(3);
    expect(c.recsSets[0]).toMatchObject({ id: "a", layout: "addon", place: "footer", when: "items", limit: 1 });
    expect(c.recsSets[1].layout).toBe("row");
    expect(new Set(c.recsSets.map((x) => x.id)).size).toBe(3);
    expect([c.recs, c.recsTitle, c.recsLimit]).toEqual([true, "A", 1]);
  });

  it("recsAt เลือกชุดตามตำแหน่ง + สถานะตะกร้า", () => {
    const c = normalizeCart({ recsSets: [{ on: true, place: "bottom" }, { on: true, place: "footer", when: "items" }, { on: false, place: "bottom" }] });
    expect(recsAt(c, "bottom", false)).toHaveLength(1);
    expect(recsAt(c, "footer", false)).toHaveLength(0);
    expect(recsAt(c, "footer", true)).toHaveLength(1);
    expect(c.recsPos).toBe("bottom"); // สำเนาตำแหน่งชุดแรก (เว็บรุ่นที่อ่าน recsPos)
    // ตะกร้าว่าง: ชุด "ติดเหนือยอดรวม" (โชว์ทุกครั้ง) ไปอยู่ท้ายรายการ
    const e = normalizeCart({ recsSets: [{ on: true, place: "footer" }] });
    expect([recsAt(e, "footer", false).length, recsAt(e, "bottom", false).length]).toEqual([0, 1]);
  });

  it("ไอคอน/ข้อความ ตั้งเองได้ · ว่าง = ไม่มีไอคอน", () => {
    const c = normalizeCart({ card: true, icons: { gift: "🎁", card: "" }, labels: { card: "เขียนการ์ดวันเกิด" } });
    expect(c.icons).toMatchObject({ gift: "🎁", card: "", note: "📝" });
    expect(c.labels.card).toBe("เขียนการ์ดวันเกิด");
    expect(c.card).toBe(true);
  });
});
