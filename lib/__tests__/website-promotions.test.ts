import { describe, it, expect } from "vitest";
import { evaluatePromotions, groupMatches, isLive, itemDealPrice, promoBadge, roundPrice, sanitizePromotion, unitDeal, withGroupDefs, type ProductGroup, type Promotion, type PromoLine } from "../website-promotions";

/** 🏷 โปรโมชันอัตโนมัติ (ชุด 3 · 2026-10-22) — กฎเดียวกับเว็บร้าน src/lib/promotions.ts */
const NOW = new Date("2026-10-22T10:00:00Z");
const P = (kind: Promotion["kind"], rule: Partial<Promotion["rule"]>, extra: Partial<Promotion> = {}): Promotion => ({
  id: `${kind}-${Math.random().toString(36).slice(2, 6)}`,
  name: kind,
  kind,
  active: true,
  startsAt: null,
  endsAt: null,
  rule: { scope: { mode: "all", codes: [], categories: [] }, ...rule },
  ...extra,
});
const L = (code: string, unitPrice: number, qty = 1, categories: string[] = []): PromoLine => ({ code, unitPrice, qty, categories });

describe("โปรโมชัน: ช่วงเวลา", () => {
  it("เปิด + อยู่ในช่วง = ใช้ได้ · ยังไม่เริ่ม/หมดแล้ว/ปิด = ไม่ได้", () => {
    expect(isLive({ active: true, startsAt: null, endsAt: null }, NOW)).toBe(true);
    expect(isLive({ active: true, startsAt: "2026-10-23T00:00:00Z", endsAt: null }, NOW)).toBe(false);
    expect(isLive({ active: true, startsAt: null, endsAt: "2026-10-22T10:00:00Z" }, NOW)).toBe(false);
    expect(isLive({ active: false, startsAt: null, endsAt: null }, NOW)).toBe(false);
  });
});

describe("โปรโมชัน: คิดส่วนลด", () => {
  it("ซื้อครบ 2 ชิ้น ลด 10% (นับรวมหลายรุ่น) · 1 ชิ้นไม่ลด", () => {
    const p = P("qty_percent", { minQty: 2, percent: 10 });
    expect(evaluatePromotions([p], [L("A", 500), L("B", 300)], NOW).total).toBe(80);
    expect(evaluatePromotions([p], [L("A", 500)], NOW).total).toBe(0);
  });

  it("ซื้อ 2 แถม 1: ชิ้นถูกสุดในแต่ละชุดฟรี · 5 ชิ้น = 1 ชุด", () => {
    const p = P("bxgy", { buyQty: 2, getQty: 1, getPercent: 100 });
    expect(evaluatePromotions([p], [L("A", 300, 2), L("B", 200)], NOW).total).toBe(200);
    expect(evaluatePromotions([p], [L("A", 100, 5)], NOW).total).toBe(100);
    expect(evaluatePromotions([P("bxgy", { buyQty: 1, getQty: 1, getPercent: 50 })], [L("A", 400), L("B", 200)], NOW).total).toBe(100);
  });

  it("ขั้นบันได: ใช้ขั้นสูงสุดที่ถึง · บาทไม่เกินยอด", () => {
    const p = P("tier", { tiers: [{ min: 1000, kind: "fixed", value: 100 }, { min: 3000, kind: "percent", value: 10 }] });
    expect(evaluatePromotions([p], [L("A", 1200)], NOW).total).toBe(100);
    expect(evaluatePromotions([p], [L("A", 3500)], NOW).total).toBe(350);
    expect(evaluatePromotions([p], [L("A", 900)], NOW).total).toBe(0);
  });

  it("เซ็ต: ต้องครบทุกรุ่น · ลดต่อเซ็ต (จำนวนเซ็ต = รุ่นที่น้อยสุด)", () => {
    const p = P("bundle", { bundleCodes: ["BAG", "BELT"], bundleKind: "fixed", bundleValue: 200, scope: { mode: "codes", codes: ["BAG", "BELT"], categories: [] } });
    expect(evaluatePromotions([p], [L("BAG", 2000), L("BELT", 900)], NOW).total).toBe(200);
    expect(evaluatePromotions([p], [L("BAG", 2000, 2), L("BELT", 900, 2)], NOW).total).toBe(400);
    expect(evaluatePromotions([p], [L("BAG", 2000)], NOW).total).toBe(0);
  });

  it("⚡ Flash sale ลดต่อชิ้นเฉพาะรุ่นที่ร่วม แล้วโปรตะกร้าคิดจากราคาที่ลดแล้ว", () => {
    const flash = P("flash", { percent: 20, scope: { mode: "codes", codes: ["A"], categories: [] } }, { endsAt: "2026-10-23T00:00:00Z" });
    const qty = P("qty_percent", { minQty: 2, percent: 10 });
    const r = evaluatePromotions([flash, qty], [L("a", 1000), L("B", 500)], NOW);
    expect(r.flashUnit).toEqual([800, 500]);
    expect(r.applied.map((a) => [a.kind, a.amount])).toEqual([["flash", 200], ["qty_percent", 130]]);
    expect(r.total).toBe(330);
  });

  it("โปรตะกร้าหลายตัว = ใช้ตัวที่ลดได้มากสุดตัวเดียว", () => {
    const a = P("qty_percent", { minQty: 2, percent: 10 });
    const b = P("tier", { tiers: [{ min: 1000, kind: "fixed", value: 300 }] });
    const r = evaluatePromotions([a, b], [L("A", 800), L("B", 800)], NOW);
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0].kind).toBe("tier");
    expect(r.total).toBe(300);
  });

  it("ตามหมวด: นับเฉพาะชิ้นในหมวด · ห้ามคูปอง", () => {
    const p = P("qty_percent", { minQty: 2, percent: 10, noCoupon: true, scope: { mode: "categories", codes: [], categories: ["belts"] } });
    const r = evaluatePromotions([p], [L("A", 500, 1, ["belts"]), L("B", 500, 1, ["bags"])], NOW);
    expect(r.total).toBe(0);
    const r2 = evaluatePromotions([p], [L("A", 500, 2, ["belts"])], NOW);
    expect(r2.total).toBe(100);
    expect(r2.blocksCoupon).toBe(true);
  });

  it("โปรหมดเวลา/ยังไม่เริ่ม ไม่นับ · ส่วนลดไม่เกินยอดสินค้า", () => {
    const old = P("qty_percent", { minQty: 2, percent: 50 }, { endsAt: "2026-10-01T00:00:00Z" });
    expect(evaluatePromotions([old], [L("A", 500, 2)], NOW).total).toBe(0);
    const big = P("tier", { tiers: [{ min: 1, kind: "fixed", value: 9999 }] });
    expect(evaluatePromotions([big], [L("A", 50)], NOW).total).toBe(50);
  });
});

describe("โปรโมชัน: ตั้งค่าจาก ERP", () => {
  it("ตรวจค่า: ชื่อ/ชนิด/ส่วนลด/ช่วงเวลา · Flash ต้องมีเวลาจบ · เซ็ต ≥2 รุ่น", () => {
    expect(sanitizePromotion({ kind: "qty_percent", name: "", rule: { percent: 10, minQty: 2 } })).toMatchObject({ ok: false });
    expect(sanitizePromotion({ kind: "qty_percent", name: "ซื้อ 2 ลด 10", rule: { percent: 120, minQty: 2 } })).toMatchObject({ ok: false });
    expect(sanitizePromotion({ kind: "flash", name: "11.11", rule: { percent: 20 } })).toMatchObject({ ok: false });
    expect(sanitizePromotion({ kind: "bundle", name: "เซ็ต", rule: { bundleCodes: ["A"], bundleValue: 100 } })).toMatchObject({ ok: false });
    expect(sanitizePromotion({ kind: "tier", name: "ครบลด", startsAt: "2026-10-25T00:00:00+07:00", endsAt: "2026-10-24T00:00:00+07:00", rule: { tiers: [{ min: 1000, value: 100 }] } })).toMatchObject({ ok: false });
    const ok = sanitizePromotion({ kind: "bundle", name: "กระเป๋า+เข็มขัด", rule: { bundleCodes: "bag01, belt02", bundleKind: "fixed", bundleValue: 200 } });
    expect(ok.ok && ok.promo.rule.scope).toEqual({ mode: "codes", codes: ["BAG01", "BELT02"], categories: [] });
  });

  it("ป้ายบนเว็บสร้างให้เอง · ตั้งเองได้", () => {
    expect(promoBadge(P("qty_percent", { minQty: 2, percent: 10 }))).toBe("ซื้อ 2 ชิ้น ลด 10%");
    expect(promoBadge(P("bxgy", { buyQty: 2, getQty: 1 }))).toBe("ซื้อ 2 แถม 1");
    expect(promoBadge(P("flash", { percent: 30 }), "en")).toBe("⚡ 30% off");
    expect(promoBadge(P("tier", { tiers: [{ min: 1500, kind: "fixed", value: 100 }], badge: "ส่งฟรี+ลด" }))).toBe("ส่งฟรี+ลด");
  });
});

describe("🏷 ลดรายชิ้น (2026-10-28)", () => {
  it("ลด % / ลดบาท / ราคาพิเศษ · ตั้งรายตัวทับค่าตั้งต้น · ราคาพิเศษแพงกว่าเดิม = ไม่ลด", () => {
    const p = P("item", { item: { kind: "percent", value: 10 }, items: { B: { kind: "fixed", value: 100 }, C: { kind: "price", value: 590 }, D: { kind: "price", value: 2000 } } });
    const r = evaluatePromotions([p], [L("A", 1000), L("b", 500), L("C", 890), L("D", 1500)], NOW);
    expect(r.flashUnit).toEqual([900, 400, 590, 1500]);
    expect(r.total).toBe(100 + 100 + 300);
    expect(r.applied).toEqual([{ id: p.id, name: "item", kind: "item", amount: 500 }]);
  });

  it("ปัดราคาลงเสมอ: ลงท้าย 9 / 90 / หลักร้อย / บาทเต็ม · ไม่เกินราคาเดิม", () => {
    expect(itemDealPrice(290, { kind: "percent", value: 15 }, 9)).toBe(239);
    expect(itemDealPrice(1290, { kind: "percent", value: 15 }, 90)).toBe(1090);
    expect(itemDealPrice(1590, { kind: "percent", value: 15 }, 100)).toBe(1300);
    expect(itemDealPrice(99.5, { kind: "fixed", value: 0.2 }, 1)).toBe(99);
    expect(itemDealPrice(5, { kind: "percent", value: 10 }, 9)).toBe(4);
    expect(itemDealPrice(890, { kind: "price", value: 999 }, 9)).toBe(890);
    expect(itemDealPrice(890, { kind: "price", value: 690 }, 9)).toBe(690);
    expect(itemDealPrice(890, { kind: "fixed", value: 0 }, 100)).toBe(890);
    expect(roundPrice(249, 9)).toBe(249);
    expect(roundPrice(250, 90)).toBe(190);
  });

  it("ลดต่อชิ้นหลายโปรทับกัน = ใช้ราคาที่ถูกสุดตัวเดียว (ไม่ลดซ้อน) แล้วโปรตะกร้าคิดต่อ", () => {
    const flash = P("flash", { percent: 20 }, { endsAt: "2026-10-23T00:00:00Z" });
    const item = P("item", { items: { A: { kind: "price", value: 700 } }, scope: { mode: "codes", codes: ["A"], categories: [] } });
    const r = evaluatePromotions([flash, item], [L("A", 1000), L("B", 500)], NOW);
    expect(r.flashUnit).toEqual([700, 400]);
    expect(r.applied.map((a) => [a.kind, a.amount])).toEqual([["item", 300], ["flash", 100]]);
    const d = unitDeal([flash, item], { code: "A", categories: [], unitPrice: 1000 }, NOW);
    expect([d.price, d.percent, d.promo?.kind]).toEqual([700, 30, "item"]);
  });

  it("ป้าย: ลดเท่ากันทุกรุ่น = บอกตัวเลข · ตั้งรายตัว = ราคาพิเศษ", () => {
    expect(promoBadge(P("item", { item: { kind: "percent", value: 15 } }))).toBe("ลด 15%");
    expect(promoBadge(P("item", { item: { kind: "fixed", value: 100 } }), "en")).toBe("฿100 off");
    expect(promoBadge(P("item", { item: { kind: "percent", value: 15 }, items: { A: { kind: "price", value: 590 } } }))).toBe("ราคาพิเศษ");
  });

  it("ตั้งค่า: ต้องมีส่วนลดอย่างน้อย 1 รุ่น · % ห้ามถึง 100 · นับถอยหลังต้องมีเวลาจบ · รหัสเป็นตัวใหญ่", () => {
    expect(sanitizePromotion({ kind: "item", name: "ลดรายชิ้น", rule: {} })).toMatchObject({ ok: false });
    expect(sanitizePromotion({ kind: "item", name: "x", rule: { item: { kind: "percent", value: 100 } } })).toMatchObject({ ok: false });
    expect(sanitizePromotion({ kind: "item", name: "x", rule: { item: { kind: "percent", value: 10 }, countdown: true } })).toMatchObject({ ok: false });
    const ok = sanitizePromotion({ kind: "item", name: "x", rule: { item: { kind: "percent", value: "" }, items: { pix19: { kind: "price", value: "199" }, pix30: { kind: "fixed", value: 0 } }, round: 9 } });
    expect(ok.ok && ok.promo.rule).toMatchObject({ items: { PIX19: { kind: "price", value: 199 } }, round: 9 });
    expect(ok.ok && ok.promo.rule.item).toBeUndefined();
  });
});

describe("📦 กลุ่มสินค้า + ยกเว้น", () => {
  const manual: ProductGroup = { id: "g1", name: "ของขวัญ", mode: "manual", codes: ["A", "B"], match: {} };
  const smart: ProductGroup = { id: "g2", name: "กระเป๋าราคากลาง", mode: "smart", codes: [], match: { categories: ["bags"], priceMin: 800, priceMax: 1500 } };
  const fresh: ProductGroup = { id: "g3", name: "มาใหม่", mode: "smart", codes: [], match: { newDays: 30 } };
  const line = (code: string, unitPrice: number, categories: string[] = [], listedAt: string | null = null): PromoLine => ({ code, unitPrice, qty: 1, categories, listedAt });

  it("กลุ่มเลือกเอง = รหัส · อัตโนมัติ = ทุกเงื่อนไขต้องตรง · ไม่ตั้งเงื่อนไข = ไม่ตรงอะไร", () => {
    expect(groupMatches(manual, line("a", 100))).toBe(true);
    expect(groupMatches(smart, line("X", 1290, ["bags"]))).toBe(true);
    expect(groupMatches(smart, line("X", 1590, ["bags"]))).toBe(false);
    expect(groupMatches(smart, line("X", 1290, ["belts"]))).toBe(false);
    expect(groupMatches(smart, { code: "X", categories: ["bags"] })).toBe(false);
    expect(groupMatches(fresh, line("X", 1, [], "2026-10-01T00:00:00Z"), NOW)).toBe(true);
    expect(groupMatches(fresh, line("X", 1, [], "2026-09-01T00:00:00Z"), NOW)).toBe(false);
    expect(groupMatches({ ...fresh, match: {} }, line("X", 1))).toBe(false);
  });

  it("โปรแบบกลุ่ม + ยกเว้นกลุ่ม/รหัส (นิยามกลุ่มใส่ตอนอ่าน withGroupDefs · ไม่มีนิยาม = ไม่ลด)", () => {
    const raw = P("item", { item: { kind: "percent", value: 10 }, scope: { mode: "groups", codes: [], categories: [], groups: ["g2"], excludeGroups: ["g3"], excludeCodes: ["Z"] } });
    const [p] = withGroupDefs([raw], [manual, smart, fresh]);
    expect(p.rule.scope.groupDefs?.map((g) => g.id)).toEqual(["g2", "g3"]);
    const lines = [line("OLD", 1000, ["bags"], "2026-01-01T00:00:00Z"), line("NEW", 1000, ["bags"], "2026-10-20T00:00:00Z"), line("Z", 1000, ["bags"]), line("CHEAP", 300, ["bags"])];
    expect(evaluatePromotions([p], lines, NOW).flashUnit).toEqual([900, 1000, 1000, 300]);
    expect(evaluatePromotions([raw], lines, NOW).total).toBe(0);
  });

  it("ตั้งค่าโปร: แบบกลุ่มต้องเลือกกลุ่ม · ยกเว้นเก็บเป็นตัวใหญ่ · ไม่เก็บนิยามกลุ่มลงฐานข้อมูล", () => {
    expect(sanitizePromotion({ kind: "qty_percent", name: "x", rule: { percent: 10, minQty: 2, scope: { mode: "groups" } } })).toMatchObject({ ok: false });
    const ok = sanitizePromotion({ kind: "qty_percent", name: "x", rule: { percent: 10, minQty: 2, scope: { mode: "all", excludeCodes: ["pix01"], groupDefs: [smart] } } });
    expect(ok.ok && ok.promo.rule.scope).toEqual({ mode: "all", codes: [], categories: [], excludeCodes: ["PIX01"] });
  });
});
