import { describe, it, expect } from "vitest";
import { evaluatePromotions, isLive, promoBadge, sanitizePromotion, type Promotion, type PromoLine } from "../website-promotions";

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
