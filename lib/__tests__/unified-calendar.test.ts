import { describe, it, expect } from "vitest";
import { bkkDate, bkkTime, filterCalItems, monthRange, moveRequest, nextValue, CAL_SOURCES, type CalItem } from "@/lib/unified-calendar";

describe("ปฏิทินรวม — วันที่/เวลาไทย", () => {
  it("timestamp ช่วงตี 1 เวลาไทย ยังเป็นวันเดียวกันของไทย (ไม่ร่นไปเมื่อวาน)", () => {
    expect(bkkDate("2026-11-19T18:30:00Z")).toBe("2026-11-20");   // = 01:30 ไทย วันที่ 20
    expect(bkkTime("2026-11-19T18:30:00Z")).toBe("01:30");
    expect(bkkDate("2026-11-20")).toBe("2026-11-20");
    expect(bkkDate(null)).toBeNull();
  });

  it("เลื่อนงานแผนทีม/คอนเทนต์ คงเวลาเดิม · ไม่มีเวลาเดิมใช้ค่าเริ่มต้น", () => {
    expect(nextValue("plan", "2026-11-20T07:00:00.000Z", "2026-11-25")).toBe("2026-11-25T07:00:00.000Z");   // 14:00 ไทย
    expect(nextValue("plan", null, "2026-11-25")).toBe("2026-11-25T11:00:00.000Z");                          // 18:00 ไทย
    expect(nextValue("content", null, "2026-11-25")).toBe("2026-11-25T03:00:00.000Z");                       // 10:00 ไทย
    expect(nextValue("task", "2026-11-20", "2026-11-25")).toBe("2026-11-25");
    expect(nextValue("mo", "2026-11-20", null)).toBeNull();
  });

  it("ช่วงโหลดของเดือนเผื่อสัปดาห์หัวท้าย (ข้ามปีได้)", () => {
    expect(monthRange(2026, 10)).toEqual({ from: "2026-10-25", to: "2026-12-07" });
    expect(monthRange(2026, 11)).toEqual({ from: "2026-11-24", to: "2027-01-07" });
  });
});

describe("ปฏิทินรวม — เลื่อนวันผ่าน API เดิมของโมดูล", () => {
  it("แหล่งที่เลื่อนได้มีคำขอ · แหล่งดูอย่างเดียวไม่มี", () => {
    expect(moveRequest("plan", "a", "x")).toEqual({ url: "/api/team-plan/a", method: "PATCH", body: { due_at: "x" } });
    expect(moveRequest("mo", "m1", "2026-11-25")).toEqual({ url: "/api/mo/set-due-date", method: "POST", body: { id: "m1", due_date: "2026-11-25" } });
    expect(moveRequest("design", "d", null)?.body).toEqual({ deadline: null });
    for (const s of CAL_SOURCES) expect(moveRequest(s.key, "x", null) === null).toBe(s.movePerm === null);
  });
});

describe("ปฏิทินรวม — กรอง", () => {
  const it2 = (id: string, src: CalItem["src"], who: string[]): CalItem => ({ id, src, rawId: id, title: id, date: null, raw: null, who, link: "/", canMove: true });
  const items = [it2("1", "plan", ["u1"]), it2("2", "task", []), it2("3", "content", ["u1", "u2"])];
  it("ซ่อนแหล่ง + กรองคน + ยังไม่มีผู้รับผิดชอบ", () => {
    expect(filterCalItems(items, new Set(["task"]), "").map((i) => i.id)).toEqual(["1", "3"]);
    expect(filterCalItems(items, new Set(), "u2").map((i) => i.id)).toEqual(["3"]);
    expect(filterCalItems(items, new Set(), "none").map((i) => i.id)).toEqual(["2"]);
  });
});
