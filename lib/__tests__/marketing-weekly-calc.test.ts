import { describe, expect, it } from "vitest";
import { cleanWeeklyEdit, lastFullWeek, movers, parseWeeklyAi, pushWeeklyHistory, reviewSamples, weekLabel, weekStartOf } from "@/lib/marketing-weekly-calc";

describe("marketing-weekly-calc", () => {
  it("weekStartOf = วันจันทร์ · lastFullWeek = จันทร์สัปดาห์ก่อน", () => {
    expect(weekStartOf("2026-11-27")).toBe("2026-11-23");   // ศุกร์
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23");   // จันทร์
    expect(weekStartOf("2026-11-29")).toBe("2026-11-23");   // อาทิตย์
    expect(lastFullWeek("2026-11-30")).toBe("2026-11-23");  // จันทร์ถัดไป → สัปดาห์ที่จบแล้ว
  });
  it("weekLabel ข้ามเดือน/ปี", () => {
    expect(weekLabel("2026-11-16")).toBe("16–22 พ.ย. 2569");
    expect(weekLabel("2026-10-26")).toBe("26 ต.ค. – 1 พ.ย. 2569");
    expect(weekLabel("2026-12-28")).toBe("28 ธ.ค. 2569 – 3 ม.ค. 2570");
  });
  it("movers ตัดของเล็ก + แยกขึ้น/ลง", () => {
    const m = movers([{ name: "A", cur: 5000, prev: 1000 }, { name: "B", cur: 200, prev: 900 }, { name: "C", cur: 1000, prev: 4000 }, { name: "D", cur: 3000, prev: 2900 }]);
    expect(m.rising.map((x) => x.name)).toEqual(["A"]);
    expect(m.falling.map((x) => x.name)).toEqual(["C"]);
  });
  it("reviewSamples ดาวต่ำก่อน ตัดข้อความสั้น", () => {
    const s = reviewSamples([{ rating: 5, comment: "ดีมากครับ" }, { rating: 1, comment: "ของไม่ตรงปก" }, { rating: 4, comment: "ok" }, { rating: null, comment: "xxxx" }], 10);
    expect(s).toEqual([{ rating: 1, text: "ของไม่ตรงปก" }, { rating: 5, text: "ดีมากครับ" }]);
  });
  it("parseWeeklyAi ทนคำตอบแปลก", () => {
    const p = parseWeeklyAi({ summary: " ดี ", actions: ["ทำ A", { text: "ทำ B", why: "เพราะ" }, { text: "" }, 5], praise: ["ส่งไว", 3], complaints: "x" });
    expect(p.summary).toBe("ดี");
    expect(p.actions).toEqual([{ text: "ทำ A", done: false }, { text: "ทำ B", why: "เพราะ", done: false }]);
    expect(p.review).toEqual({ praise: ["ส่งไว"], complaints: [] });
    expect(parseWeeklyAi(null)).toEqual({ summary: "", actions: [], review: { praise: [], complaints: [] } });
  });
  it("cleanWeeklyEdit เก็บเฉพาะช่องที่ส่งมา", () => {
    expect(cleanWeeklyEdit({ actions: [{ text: " x ", done: true }, { text: "" }] })).toEqual({ actions: [{ text: "x", why: undefined, done: true }] });
    expect(Object.keys(cleanWeeklyEdit({}))).toEqual([]);
  });
  it("pushWeeklyHistory ล่าสุดก่อน เก็บ keep", () => {
    let h = pushWeeklyHistory(null, { at: "1", by: null, summary: "a", actions: [], review: {}, reason: "r" }, 2);
    h = pushWeeklyHistory(h, { at: "2", by: null, summary: "b", actions: [], review: {}, reason: "r" }, 2);
    h = pushWeeklyHistory(h, { at: "3", by: null, summary: "c", actions: [], review: {}, reason: "r" }, 2);
    expect(h.map((v) => v.at)).toEqual(["3", "2"]);
  });
});
import { campaignLabels } from "@/lib/marketing-weekly-calc";
describe("campaignLabels", () => {
  it("บอกวัน 11.11 / 15 ในสัปดาห์", () => {
    expect(campaignLabels({ from: "2026-11-09", to: "2026-11-15" })).toEqual(["11.11", "กลางเดือน 15.11"]);
    expect(campaignLabels({ from: "2026-11-16", to: "2026-11-22" })).toEqual([]);
  });
});
