import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  buildDailySeries,
  dayOfMonthISO,
  daysBetween,
  endOfMonthISO,
  firstNegativeDay,
  monthLabelTH,
  isMovableSource,
  monthsBetween,
  MOVABLE_SOURCES,
  THB,
  THBShort,
  totals,
  totalsByMonth,
  totalsBySource,
  type CashflowEvent,
} from "@/lib/cashflow";

/** ตัวช่วยสร้างรายการเงินแบบสั้น ๆ ในเทสต์ */
const ev = (
  id: string, date: string, direction: "in" | "out", amount: number,
  source: CashflowEvent["source"] = "sales_order",
): CashflowEvent => ({
  id, date, direction, amount, source,
  certainty: "expected", ref: id, party: "ทดสอบ", dateConfident: true,
});

describe("cashflow — วันที่ (ต้องไม่เพี้ยนเพราะเวลาไทย UTC+7)", () => {
  it("บวกวันแล้วข้ามเดือน/ข้ามปีถูกต้อง", () => {
    expect(addDaysISO("2026-08-20", 30)).toBe("2026-09-19");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("หาวันสุดท้ายของเดือนได้ รวมเดือนกุมภาพันธ์ปีอธิกสุรทิน", () => {
    expect(endOfMonthISO("2026-08-01")).toBe("2026-08-31");
    expect(endOfMonthISO("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonthISO("2028-02-10")).toBe("2028-02-29");
  });

  it("วันที่ N ของเดือน — ถ้าเดือนสั้นกว่าให้ตกวันสุดท้ายของเดือน", () => {
    expect(dayOfMonthISO("2026-08-01", 15)).toBe("2026-08-15");
    expect(dayOfMonthISO("2026-02-01", 31)).toBe("2026-02-28");
  });

  it("ไล่เดือนในช่วงได้ครบ ไม่ตกเดือนสุดท้าย", () => {
    expect(monthsBetween("2026-08-20", "2026-11-18"))
      .toEqual(["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(monthsBetween("2026-08-20", "2026-08-25")).toEqual(["2026-08-01"]);
  });

  it("นับจำนวนวันระหว่าง 2 วันได้", () => {
    expect(daysBetween("2026-08-20", "2026-08-30")).toBe(10);
    expect(daysBetween("2026-08-30", "2026-08-20")).toBe(-10);
  });
});

describe("cashflow — เส้นเงินคงเหลือ", () => {
  const from = "2026-08-20";
  const to = "2026-09-30";

  it("รายการก่อนวันเริ่มต้นต้องถูกทบเข้ายอดยกมา ไม่ถูกทิ้ง", () => {
    const events = [
      ev("เก่า-รับ", "2026-07-01", "in", 100),
      ev("เก่า-จ่าย", "2026-07-05", "out", 40),
      ev("ใหม่", "2026-09-01", "in", 10),
    ];
    const s = buildDailySeries(events, 1000, from, to);
    expect(s.carriedIn).toBe(100);
    expect(s.carriedOut).toBe(40);
    expect(s.startBalance).toBe(1060);          // 1000 + 100 - 40
    expect(s.days).toHaveLength(1);             // เหลือเฉพาะรายการในช่วง
    expect(s.days[0].balance).toBe(1070);
  });

  it("รายการหลังวันสิ้นสุดต้องถูกตัดทิ้ง ไม่ปนเข้ายอดยกมา", () => {
    const s = buildDailySeries([ev("อนาคตไกล", "2026-12-01", "in", 999)], 0, from, to);
    expect(s.days).toHaveLength(0);
    expect(s.carriedIn).toBe(0);
    expect(s.startBalance).toBe(0);
  });

  it("รวมหลายรายการในวันเดียวกัน แล้วสะสมยอดต่อเนื่องข้ามวัน", () => {
    const events = [
      ev("a", "2026-08-25", "in", 500),
      ev("b", "2026-08-25", "out", 200),
      ev("c", "2026-09-10", "out", 400),
    ];
    const s = buildDailySeries(events, 0, from, to);
    expect(s.days.map((d) => d.date)).toEqual(["2026-08-25", "2026-09-10"]);
    expect(s.days[0]).toMatchObject({ in: 500, out: 200, net: 300, balance: 300 });
    expect(s.days[1]).toMatchObject({ in: 0, out: 400, net: -400, balance: -100 });
  });

  it("เรียงวันให้ถูกเสมอ แม้รายการที่ส่งเข้ามาจะสลับกัน", () => {
    const events = [ev("หลัง", "2026-09-15", "out", 50), ev("ก่อน", "2026-08-21", "in", 80)];
    const s = buildDailySeries(events, 0, from, to);
    expect(s.days.map((d) => d.date)).toEqual(["2026-08-21", "2026-09-15"]);
    expect(s.days[1].balance).toBe(30);
  });

  it("หาวันแรกที่เงินติดลบเจอ (ใช้เตือนว่าเงินจะไม่พอวันไหน)", () => {
    const events = [
      ev("จ่ายก้อนใหญ่", "2026-08-22", "out", 1500),
      ev("รับทีหลัง", "2026-09-05", "in", 2000),
    ];
    const s = buildDailySeries(events, 1000, from, to);
    const neg = firstNegativeDay(s.days);
    expect(neg?.date).toBe("2026-08-22");
    expect(neg?.balance).toBe(-500);
    // รับเงินทีหลังแล้วกลับมาบวก แต่ยังต้องเตือนวันที่ติดลบวันแรกอยู่ดี
    expect(s.days[1].balance).toBe(1500);
  });

  it("ไม่ติดลบเลย → คืน null", () => {
    const s = buildDailySeries([ev("x", "2026-08-25", "out", 100)], 1000, from, to);
    expect(firstNegativeDay(s.days)).toBeNull();
  });
});

describe("cashflow — รวมยอด", () => {
  const events = [
    ev("so1", "2026-08-25", "in", 1000, "sales_order"),
    ev("bn1", "2026-08-26", "in", 500, "billing_note"),
    ev("po1", "2026-08-27", "out", 300, "purchase_order"),
    ev("pay1", "2026-09-30", "out", 700, "payroll"),
  ];

  it("รวมเงินเข้า/ออก/สุทธิ", () => {
    expect(totals(events)).toEqual({ in: 1500, out: 1000, net: 500, count: 4 });
  });

  it("แยกยอดตามแหล่งที่มา", () => {
    const bySource = totalsBySource(events);
    expect(bySource.find((s) => s.source === "sales_order")).toMatchObject({ in: 1000, out: 0, count: 1 });
    expect(bySource.find((s) => s.source === "payroll")).toMatchObject({ in: 0, out: 700, count: 1 });
    expect(bySource[0].source).toBe("sales_order");   // เรียงจากยอดมากไปน้อย
  });

  it("แยกยอดรายเดือน + ยอดคงเหลือสิ้นเดือน", () => {
    const s = buildDailySeries(events, 0, "2026-08-20", "2026-10-31");
    const months = totalsByMonth(s.days);
    expect(months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(months[0]).toMatchObject({ in: 1500, out: 300, net: 1200, endBalance: 1200 });
    expect(months[1]).toMatchObject({ in: 0, out: 700, net: -700, endBalance: 500 });
  });
});

describe("cashflow — แสดงผลเป็นภาษาคน", () => {
  it("จัดรูปเงินบาทแบบมีลูกน้ำ และติดลบขึ้นหน้า", () => {
    expect(THB(1234567)).toBe("฿1,234,567");
    expect(THB(-500)).toBe("-฿500");
    expect(THB(0)).toBe("฿0");
  });

  it("ย่อตัวเลขใหญ่สำหรับแกนกราฟ", () => {
    expect(THBShort(2_500_000)).toBe("2.5 ล้าน");
    expect(THBShort(45_000)).toBe("45k");
    expect(THBShort(-1_000_000)).toBe("-1.0 ล้าน");
  });

  it("ชื่อเดือนไทยย่อ + ปี พ.ศ.", () => {
    expect(monthLabelTH("2026-08")).toBe("ส.ค. 69");
    expect(monthLabelTH("2027-01")).toBe("ม.ค. 70");
  });
});

describe("cashflow — การ์ดไหนเลื่อนวันได้ (กระดานเงินสด)", () => {
  it("เลื่อนได้เฉพาะเอกสารที่เราคุมวันจ่าย/วันรับเองได้", () => {
    expect(isMovableSource("purchase_order")).toBe(true);
    expect(isMovableSource("billing_note")).toBe(true);
    expect(isMovableSource("sales_order")).toBe(true);
    expect(isMovableSource("china")).toBe(true);
  });

  it("งวดผ่อน / เงินเดือน / ดอกเบี้ย OD ต้องเลื่อนไม่ได้ — ธนาคารกับพนักงานรอไม่ได้", () => {
    expect(isMovableSource("loan")).toBe(false);
    expect(isMovableSource("payroll")).toBe(false);
    expect(isMovableSource("od_interest")).toBe(false);
    expect(isMovableSource("ค่าที่ไม่รู้จัก")).toBe(false);
  });

  it("ทุกชนิดที่เลื่อนได้ต้องระบุตาราง + ช่องวันที่ครบ (API ใช้ชื่อนี้เขียนลง DB ตรง ๆ)", () => {
    for (const [key, cfg] of Object.entries(MOVABLE_SOURCES)) {
      expect(cfg, key).toBeTruthy();
      expect(cfg!.table, key).toMatch(/^[a-z0-9_]+$/);
      expect(cfg!.dateField, key).toMatch(/^[a-z0-9_]+$/);
      expect(cfg!.label.length, key).toBeGreaterThan(0);
    }
  });
});
