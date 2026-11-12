import { describe, expect, it } from "vitest";
import { unClean, unTick, unTarget, unSummary, unLast } from "./update-note";

describe("ร่างงานถึงไหน (update-note)", () => {
  it("ติ๊กขั้นหลัง = เติมขั้นก่อนหน้าให้ · เอาออกทีละขั้น", () => {
    const s = unTick({}, "ret", true, 30);
    expect(Object.keys(s)).toEqual(["prep", "disp", "ret"]);
    expect(s.disp?.qty).toBe(30);
    expect(s.ret).toEqual({ qty: 30, bad: 0 });
    const s2 = unTick(s, "disp", false, 30);
    expect(s2.disp).toBeUndefined();
    expect(s2.ret).toBeDefined();
  });

  it("ค่าเริ่ม QC = รับคืนหักของเสีย · ส่งของ = ของดี QC", () => {
    let s = unTick({}, "ret", true, 30);
    s = { ...s, ret: { qty: 20, bad: 2 } };
    s = unTick(s, "ship", true, 30);
    expect(s.qc?.good).toBe(18);
    expect(s.ship?.qty).toBe(18);
  });

  it("ขั้นที่ป๊อปอัปเดตควรเปิด", () => {
    expect(unTarget({})).toBeNull();
    expect(unTarget({ prep: { date: null } })).toBe("cut");
    expect(unTarget({ disp: { deptId: "", crewIds: [], qty: 30 } })).toBe("dispatch");
    expect(unTarget({ disp: { deptId: "", crewIds: [], qty: 30 }, ret: { qty: 20, bad: 0 } })).toBe("return_part");
    expect(unTarget({ disp: { deptId: "", crewIds: [], qty: 30 }, ret: { qty: 30, bad: 1 } })).toBe("return");
    expect(unTarget({ ret: { qty: 10, bad: 0 } }, 30)).toBe("return_part");
    expect(unTarget({ qc: { good: 10 } })).toBe("qc_in");
    expect(unTarget({ ship: { qty: 10 } })).toBe("ship");
  });

  it("ทำความสะอาดข้อมูล — ตัดช่องแปลก ตัวเลขติดลบ = 0 วันที่ผิดรูป = null", () => {
    const s = unClean({ prep: { date: "12/11/2026" }, disp: { deptId: "d1", crewIds: ["a", 2], qty: -5 }, hack: { x: 1 } });
    expect(s).toEqual({ prep: { date: null }, disp: { deptId: "d1", crewIds: ["a", "2"], qty: 0 } });
    expect(unClean(null)).toEqual({});
  });

  it("สรุปสั้นในช่อง", () => {
    const s = { disp: { deptId: "d1", crewIds: [], qty: 30 }, ret: { qty: 20, bad: 1 } };
    expect(unLast(s)).toBe("ret");
    expect(unSummary(s, () => "ช่างเหมา")).toEqual({ last: "รับคืน", detail: "จ่าย 30 → ช่างเหมา · คืน 20 (เสีย 1)" });
  });
});
