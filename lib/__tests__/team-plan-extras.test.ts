import { describe, expect, it } from "vitest";
import { cleanEstimate, cleanPlanTags, cleanPlanWatchers, estimateLabel, myDayLoad, normalizePlanMeta, planTagCounts, PLAN_TAG_MAX } from "@/lib/team-plan";

// แผนงานทีม: แท็ก · คนติดตาม · เวลาที่คาด · ภาระงานวันนี้ (2026-11-12)
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-12T05:00:00Z");   // 12:00 เวลาไทย

describe("แท็ก", () => {
  it("ตัดช่องว่าง/# · ไม่ซ้ำไม่สนตัวพิมพ์ · ยาวสุด 30 · สูงสุด 8", () => {
    expect(cleanPlanTags([" เว็บ  ISG ", "#เว็บ isg", "Pixie", "", 3])).toEqual(["เว็บ ISG", "Pixie"]);
    expect(cleanPlanTags(["x".repeat(50)])[0]).toHaveLength(30);
    expect(cleanPlanTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(PLAN_TAG_MAX);
    expect(cleanPlanTags("เว็บ")).toEqual([]);
  });
  it("นับแท็กที่ใช้ เรียงมากก่อน", () => {
    const m = (tags: string[]) => ({ plan: normalizePlanMeta({ tags }) });
    expect(planTagCounts([m(["เว็บ", "ด่วนลูกค้า"]), m(["เว็บ"]), m([])])).toEqual([{ tag: "เว็บ", n: 2 }, { tag: "ด่วนลูกค้า", n: 1 }]);
  });
});

describe("คนติดตาม", () => {
  it("เฉพาะ uuid · ไม่ซ้ำ · ชื่อว่าง = ผู้ใช้", () => {
    expect(cleanPlanWatchers([{ id: U1, name: " ฝน " }, { id: U1, name: "ซ้ำ" }, { id: "bad", name: "x" }, { id: U2 }]))
      .toEqual([{ id: U1, name: "ฝน" }, { id: U2, name: "ผู้ใช้" }]);
  });
});

describe("เวลาที่คาด", () => {
  it("น้อยกว่า 5 นาที/ว่าง = ไม่ระบุ · สูงสุด 40 ชม. · ป้ายอ่านง่าย", () => {
    expect(cleanEstimate(null)).toBeNull();
    expect(cleanEstimate("")).toBeNull();
    expect(cleanEstimate(2)).toBeNull();
    expect(cleanEstimate("90")).toBe(90);
    expect(cleanEstimate(99999)).toBe(2400);
    expect([30, 60, 90, 240, 480].map(estimateLabel)).toEqual(["30 นาที", "1 ชม.", "1.5 ชม.", "ครึ่งวัน", "1 วัน"]);
  });
  it("งานเก่าไม่มีช่องใหม่ = ค่าว่าง", () => {
    const p = normalizePlanMeta({ important: true });
    expect([p.tags, p.watchers, p.estimate_min]).toEqual([[], [], null]);
  });
});

describe("ภาระงานวันนี้ของฉัน", () => {
  it("นับงานครบวันนี้/เลยกำหนด + ดาววันนี้ ของฉัน · ไม่นับงานเสร็จ/ของคนอื่น/งานอนาคต", () => {
    const it2 = (o: { status?: string; due_at?: string | null; assigned_to?: string | null; est?: number | null; star?: string | null }) => ({
      status: o.status ?? "open", due_at: o.due_at ?? null, assigned_to: o.assigned_to ?? U1,
      plan: normalizePlanMeta({ estimate_min: o.est ?? null, star_date: o.star ?? null }),
    });
    const load = myDayLoad([
      it2({ due_at: "2026-11-12T11:00:00Z", est: 120 }),          // วันนี้ 18:00
      it2({ due_at: "2026-11-10T11:00:00Z", est: 60 }),           // เลยกำหนด
      it2({ star: "2026-11-12" }),                                 // ดาววันนี้ ไม่ประเมิน
      it2({ due_at: "2026-11-15T11:00:00Z", est: 480 }),          // อนาคต
      it2({ due_at: "2026-11-12T11:00:00Z", status: "resolved", est: 60 }),
      it2({ due_at: "2026-11-12T11:00:00Z", assigned_to: U2, est: 60 }),
    ], U1, NOW);
    expect(load).toEqual({ count: 3, minutes: 180, unestimated: 1 });
  });
});

describe("พุธที่ 1–4 ของเดือน (2026-11-13)", () => {
  it("ของเดือนนี้ผ่านแล้ว = เดือนหน้า · ยังไม่ถึง = เดือนนี้ · วันนี้เป็นพุธนั้นพอดี = วันนี้", async () => {
    const { nthWeekdayYmd, quickDue, nthWedLabel } = await import("@/lib/team-plan");
    const fri = new Date("2026-11-13T05:00:00Z");                   // ศุกร์ 13 พ.ย. (พุธของ พ.ย. = 4, 11, 18, 25)
    expect([1, 2, 3, 4].map((n) => nthWeekdayYmd(3, n, fri))).toEqual(["2026-12-02", "2026-12-09", "2026-11-18", "2026-11-25"]);
    expect(nthWeekdayYmd(3, 3, new Date("2026-11-18T03:00:00Z"))).toBe("2026-11-18");   // พุธที่ 3 พอดี
    expect(nthWeekdayYmd(3, 4, new Date("2026-12-28T03:00:00Z"))).toBe("2027-01-27");   // ข้ามปี
    expect(quickDue("wed4", fri)).toBe("2026-11-25T11:00:00.000Z");                      // 18:00 เวลาไทย
    expect(nthWedLabel("wed1", fri)).toBe("พุธที่ 1 ของเดือน · พ. 2 ธ.ค.");
  });
});

describe("ทำซ้ำ: พุธที่ N ของทุกเดือน (2026-11-13)", () => {
  it("รอบหน้า = พุธที่ N ของเดือนถัดไป · คงเวลาเดิม · ข้ามปี · ทุก 2 เดือน", async () => {
    const { nextDue, REPEAT_LABEL, normalizePlanMeta, nthWeekdayOf } = await import("@/lib/team-plan");
    const r = { every: "month" as const, n: 1, nth: 2, wd: 3 };
    const now = new Date("2026-11-11T12:00:00Z");                                       // หลังกำหนด 11 พ.ย. 18:00 (พุธที่ 2)
    expect(nextDue("2026-11-11T11:00:00Z", r, now)).toBe("2026-12-09T11:00:00.000Z");     // พุธที่ 2 ธ.ค. 18:00
    expect(nextDue("2026-12-09T11:00:00Z", r, new Date("2026-12-10T00:00:00Z"))).toBe("2027-01-13T11:00:00.000Z");
    expect(nextDue("2026-11-25T03:00:00Z", { every: "month", n: 2, nth: 4, wd: 3 }, new Date("2026-11-26T00:00:00Z"))).toBe("2027-01-27T03:00:00.000Z");
    expect(REPEAT_LABEL(r)).toBe("ทุกเดือน · พุธที่ 2");
    expect(REPEAT_LABEL({ every: "month", n: 1 })).toBe("ทุก เดือน");                    // แบบเดิมไม่เปลี่ยน
    expect(normalizePlanMeta({ repeat: { every: "month", n: 1, nth: 9, wd: 3 } }).repeat).toEqual({ every: "month", n: 1 });   // nth ผิด = วันที่เดิม
    expect(normalizePlanMeta({ repeat: { every: "week", n: 1, nth: 2, wd: 3 } }).repeat).toEqual({ every: "week", n: 1 });
    expect(normalizePlanMeta({ repeat: r }).repeat).toEqual(r);
    expect(nthWeekdayOf("2026-11-25")).toEqual({ nth: 4, wd: 3 });
    expect(nthWeekdayOf("2026-12-30")).toEqual({ nth: 4, wd: 3 });                       // สัปดาห์ที่ 5 → นับเป็น 4
  });
});
