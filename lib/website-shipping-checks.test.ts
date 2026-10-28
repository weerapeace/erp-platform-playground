import { describe, expect, it } from "vitest";
import { methodIssues, shippingIssues, isSeriousIssue } from "./website-shipping-checks";
import { normalizeMethod, type ShippingMethod } from "./website-shipping";

const ship = (p: Partial<ShippingMethod> = {}, i = 0): ShippingMethod => normalizeMethod({ kind: "ship", name: "ส่งธรรมดา", fee: { kind: "flat", amount: 50 }, ...p }, i);
const cfgOf = (methods: ShippingMethod[], remotePostals: string[] = ["94"]) => ({ methods, remotePostals });
const texts = (m: ShippingMethod, methods: ShippingMethod[], opts = { shopCod: true }, remote?: string[]) =>
  methodIssues(m, cfgOf(methods, remote), opts).map((x) => `${x.level}:${x.group}`);

describe("methodIssues", () => {
  it("วิธีปกติ ตั้งครบ = ไม่มีอะไรเตือน", () => {
    const m = ship({ id: "a" });
    expect(texts(m, [m])).toEqual([]);
  });
  it("ชื่อว่าง / ชื่อซ้ำ (ไม่สนตัวพิมพ์)", () => {
    const blank = { ...ship({ id: "a" }), name: "  " };
    expect(texts(blank, [blank])).toContain("warn:customer");
    const a = ship({ id: "a", name: "EMS" });
    const b = ship({ id: "b", name: "ems " });
    expect(texts(a, [a, b])).toContain("warn:customer");
  });
  it("รับเองที่ร้านแต่ไม่บอกที่อยู่", () => {
    const p = normalizeMethod({ id: "p", kind: "pickup", name: "รับที่ร้าน", note: "" });
    expect(texts(p, [p])).toContain("warn:customer");
    const ok = normalizeMethod({ id: "p", kind: "pickup", name: "รับที่ร้าน", note: "สีลม 10:00–19:00" });
    expect(texts(ok, [ok])).toEqual([]);
  });
  it("ขั้นตามจำนวนชิ้น: ขั้นหลังถูกกว่า + ไม่ได้เลือกกล่อง", () => {
    const m = ship({ id: "a", fee: { kind: "tiers", tiers: [{ upTo: 1, fee: 60, box: "A" }, { upTo: null, fee: 40, box: "" }] } });
    expect(texts(m, [m])).toEqual(["warn:fee", "tip:fee"]);
    // ไม่มีกล่องมาตรฐานในระบบ = ไม่เตือนเรื่องกล่อง
    expect(methodIssues(m, cfgOf([m]), { shopCod: true, hasBoxes: false }).map((x) => x.level)).toEqual(["warn"]);
  });
  it("ส่งฟรีเมื่อยอดถึง แต่ค่าส่ง 0 อยู่แล้ว", () => {
    const m = ship({ id: "a", fee: { kind: "flat", amount: 0 }, freeMin: 500 });
    expect(texts(m, [m])).toEqual(["tip:fee"]);
  });
  it("บวกพื้นที่ห่างไกล แต่ไม่มีรหัสในรายการ", () => {
    const m = ship({ id: "a", remoteFee: 50 });
    expect(texts(m, [m], { shopCod: true }, [])).toEqual(["warn:area"]);
    expect(texts(m, [m], { shopCod: true }, ["94"])).toEqual([]);
  });
  it("ติ๊ก COD แต่ร้านปิด COD = แค่แจ้ง (ไม่นับเป็นปัญหาจริงจัง)", () => {
    const m = ship({ id: "a", codAllowed: true });
    const list = methodIssues(m, cfgOf([m]), { shopCod: false });
    expect(list.map((x) => `${x.level}:${x.group}`)).toEqual(["info:cod"]);
    expect(list.some(isSeriousIssue)).toBe(false);
  });
  it("ส่งเฉพาะ กทม. แต่ไม่มีรอบตัด = แนะนำ", () => {
    const m = ship({ id: "a", area: "bkk" });
    expect(texts(m, [m])).toEqual(["tip:time"]);
    expect(texts({ ...m, cutoff: "14:00" }, [m])).toEqual([]);
  });
});

describe("shippingIssues", () => {
  it("ไม่มีวิธีที่เปิด = สั่งไม่ได้", () => {
    const m = ship({ id: "a", enabled: false });
    expect(shippingIssues({ methods: [m] }, { shopCod: false }).map((x) => x.level)).toEqual(["error"]);
  });
  it("เปิดแต่วิธีส่งในเมือง → ต่างจังหวัดเลือกไม่ได้ · รับที่ร้านช่วยได้", () => {
    const city = ship({ id: "a", area: "metro" });
    expect(shippingIssues({ methods: [city] }, { shopCod: false }).map((x) => x.level)).toEqual(["warn"]);
    const pick = normalizeMethod({ id: "p", kind: "pickup", name: "รับที่ร้าน" });
    expect(shippingIssues({ methods: [city, pick] }, { shopCod: false })).toEqual([]);
  });
  it("ร้านเปิด COD แต่ไม่มีวิธีไหนรับ", () => {
    const m = ship({ id: "a", codAllowed: false });
    expect(shippingIssues({ methods: [m] }, { shopCod: true }).map((x) => x.level)).toEqual(["warn"]);
    expect(shippingIssues({ methods: [{ ...m, codAllowed: true }] }, { shopCod: true })).toEqual([]);
  });
});
