import { describe, it, expect } from "vitest";
import { qvMatch, qvSort, parseViews, qvVisible, qvSummary, QV_DEFAULT_SIMPLE, QV_DEFAULT_NORMAL, qvNew, parseTeamViews, parseMine, qvAudienceOk, QV_DEFAULT_TEAM, type QvRow, type QuickView, type TeamView } from "../../app/master/work-board/quick-views";

// มุมมองด่วนแท็บรอจ่าย — กติกากลาง (กรอง/เรียง/อ่านค่า)
const row = (p: Partial<QvRow>): QvRow => ({ brand: "Good Goods", oem: true, late: 0, dueIn: null, flag: 0, short: false, ready: false, noprice: null, age: 10, stage: 1, buy: 0, left: 10, value: 0, sku: "A", ...p });
const view = (p: Partial<QuickView>): QuickView => ({ ...qvNew(), ...p });

describe("qvMatch — แบรนด์ / OEM / เงื่อนไข", () => {
  it("เลือกแบรนด์หลายอัน · __none__ = ไม่ระบุแบรนด์", () => {
    const v = view({ brands: ["Good Goods", "__none__"] });
    expect(qvMatch(v, row({ brand: "Good Goods" }))).toBe(true);
    expect(qvMatch(v, row({ brand: null }))).toBe(true);
    expect(qvMatch(v, row({ brand: "Louis Montini", oem: false }))).toBe(false);
  });
  it("งานลูกค้า OEM / แบรนด์เรา (ไม่ระบุแบรนด์ ไม่นับเป็นแบรนด์เรา)", () => {
    expect(qvMatch(view({ own: "oem" }), row({ oem: true }))).toBe(true);
    expect(qvMatch(view({ own: "oem" }), row({ oem: false, brand: "Pixie Dustie" }))).toBe(false);
    expect(qvMatch(view({ own: "own" }), row({ oem: false, brand: "Pixie Dustie" }))).toBe(true);
    expect(qvMatch(view({ own: "own" }), row({ oem: false, brand: null }))).toBe(false);
  });
  it("ของด่วน = เกินกำหนด หรือ ส่งใน 7 วัน หรือ ติดธง", () => {
    const hot = QV_DEFAULT_SIMPLE.find((v) => v.id === "hot")!;
    expect(qvMatch(hot, row({ late: 3 }))).toBe(true);
    expect(qvMatch(hot, row({ dueIn: 5 }))).toBe(true);
    expect(qvMatch(hot, row({ flag: 1 }))).toBe(true);
    expect(qvMatch(hot, row({ dueIn: 20 }))).toBe(false);
  });
  it("ตรงทุกข้อ (และ) · ยังไม่ตั้งราคาที่ยังไม่รู้ = ไม่ผ่าน", () => {
    const v = view({ mode: "all", conds: ["short", "nodue"] });
    expect(qvMatch(v, row({ short: true, dueIn: null }))).toBe(true);
    expect(qvMatch(v, row({ short: true, dueIn: 3 }))).toBe(false);
    expect(qvMatch(view({ conds: ["noprice"] }), row({ noprice: null }))).toBe(false);
  });
});

describe("qvSort — เรียงหลัก / รอง / ทิศ", () => {
  const a = row({ sku: "A", late: 53, value: 100 }), b = row({ sku: "B", late: 53, value: 900 }), c = row({ sku: "C", late: 4, value: 5000 });
  it("เลยกำหนดมากก่อน แล้วมูลค่ามากก่อน", () => {
    const v = view({ sort1: "late", dir1: "desc", sort2: "value", dir2: "desc" });
    expect(qvSort([a, c, b], (x) => x, v).map((x) => x.sku)).toEqual(["B", "A", "C"]);
  });
  it("กำหนดส่งใกล้สุดก่อน — ไม่มีวันส่งอยู่ท้ายเสมอ (ทั้งสองทิศ)", () => {
    const rs = [row({ sku: "N", dueIn: null }), row({ sku: "F", dueIn: 30 }), row({ sku: "S", dueIn: 2 })];
    expect(qvSort(rs, (x) => x, view({ sort1: "due", dir1: "asc" })).map((x) => x.sku)).toEqual(["S", "F", "N"]);
    expect(qvSort(rs, (x) => x, view({ sort1: "due", dir1: "desc" })).map((x) => x.sku)).toEqual(["F", "S", "N"]);
  });
  it("ไม่เรียง = ลำดับเดิม", () => {
    expect(qvSort([c, a, b], (x) => x, view({})).map((x) => x.sku)).toEqual(["C", "A", "B"]);
  });
});

describe("parseViews / qvVisible / qvSummary", () => {
  it("ค่าเพี้ยนถูกตัด/เติมค่าตั้งต้น · id ซ้ำตัดทิ้ง", () => {
    const vs = parseViews([{ id: "x", name: "", conds: ["late", "bogus"], sort1: "nope", layout: "cards" }, { id: "x" }, "junk"]);
    expect(vs).toHaveLength(1);
    expect(vs![0].name).toBe("มุมมอง");
    expect(vs![0].conds).toEqual(["late"]);
    expect(vs![0].sort1).toBe("none");
    expect(vs![0].layout).toBe("cards");
    expect(parseViews("x")).toBeNull();
  });
  it("ยังไม่ตั้งราคา = เฉพาะคนเห็นเงิน · ปิดโชว์ = ไม่อยู่บนแถบ", () => {
    expect(qvVisible(QV_DEFAULT_NORMAL, false).some((v) => v.id === "noprice")).toBe(false);
    expect(qvVisible(QV_DEFAULT_NORMAL, true).some((v) => v.id === "noprice")).toBe(true);
    expect(qvVisible([view({ show: false })], true)).toHaveLength(0);
  });
  it("สรุปภาษาคน", () => {
    expect(qvSummary(QV_DEFAULT_SIMPLE.find((v) => v.id === "hot")!)).toContain("เกินกำหนดส่ง หรือ ส่งภายใน 7 วัน");
  });
});

describe("มุมมองทีม / ของฉัน / ใครเห็น", () => {
  const tv = (p: Partial<TeamView>): TeamView => ({ ...qvNew({ name: "x" }), aud: "all", roles: [], users: [], ...p });
  it("ใครเห็น: ทุกคน · เฉพาะตำแหน่ง · เฉพาะคน (ไม่ล็อกอิน = เห็นแค่ทุกคน)", () => {
    const staff = { id: "u1", role: "staff" };
    expect(qvAudienceOk(tv({ aud: "all" }), staff)).toBe(true);
    expect(qvAudienceOk(tv({ aud: "roles", roles: ["admin", "manager"] }), staff)).toBe(false);
    expect(qvAudienceOk(tv({ aud: "roles", roles: ["staff"] }), staff)).toBe(true);
    expect(qvAudienceOk(tv({ aud: "users", users: ["u2"] }), staff)).toBe(false);
    expect(qvAudienceOk(tv({ aud: "users", users: ["u1"] }), staff)).toBe(true);
    expect(qvAudienceOk(tv({ aud: "roles", roles: ["staff"] }), null)).toBe(false);
    expect(qvAudienceOk(tv({ aud: "all" }), null)).toBe(true);
  });
  it("parseTeamViews: รับทั้ง array และ {views} · ค่าใครเห็นเพี้ยน = ทุกคน · ว่าง/ผิดรูป = null (ใช้ค่าตั้งต้น)", () => {
    const a = parseTeamViews({ views: [{ id: "a", name: "A", aud: "roles", roles: ["staff", 3] }, { id: "b", name: "B", aud: "zzz" }] })!;
    expect(a.map((v) => [v.id, v.aud, v.roles])).toEqual([["a", "roles", ["staff"]], ["b", "all", []]]);
    expect(parseTeamViews([{ id: "c", name: "C", aud: "users", users: ["u1"] }])![0].users).toEqual(["u1"]);
    expect(parseTeamViews({})).toBeNull();
    expect(parseTeamViews("x")).toBeNull();
    expect(QV_DEFAULT_TEAM.every((v) => v.aud === "all")).toBe(true);
  });
  it("ความกว้างคอลัมน์ + พอดีเนื้อหา เก็บในมุมมอง (ค่าเพี้ยน/เล็กเกิน/ใหญ่เกิน ถูกตัด)", () => {
    const [v] = parseTeamViews([{ id: "w", name: "W", fit: true, widths: { sku: 180, bad: "x", tiny: 5, huge: 99999 } }])!;
    expect(v.fit).toBe(true);
    expect(v.widths.sku).toBe(180);
    expect(v.widths.bad).toBeUndefined();
    expect(Object.values(v.widths).every((n) => n >= 40 && n <= 2000)).toBe(true);
  });
  it("parseMine: มุมมองของฉัน + ปุ่มทีมที่ซ่อน + ความกว้างเฉพาะตัว", () => {
    const m = parseMine({ views: [{ id: "m1", name: "ของฉัน" }], hidden: ["hot", 1], widthOverride: { oem: { sku: 200 } } })!;
    expect(m.views.map((v) => v.id)).toEqual(["m1"]);
    expect(m.hidden).toEqual(["hot"]);
    expect(m.widthOverride.oem.sku).toBe(200);
    expect(parseMine(null)).toBeNull();
    expect(parseMine({})).toEqual({ views: [], hidden: [], widthOverride: {} });
  });
});
