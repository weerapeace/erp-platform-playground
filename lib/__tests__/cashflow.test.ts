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
  filterEventsByCompany,
  openingForCompany,
  summarizeByCompany,
  summarizeDays,
  unassignedBySource,
} from "@/lib/cashflow";
import {
  COMPANY_ALL, COMPANY_NONE, UNASSIGNED_TONE, companyLabel, companyTone, validCompanyFilter, type CompanyRef,
} from "@/lib/company-filter";

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

describe("cashflow — แยกบริษัท", () => {
  const ISG: CompanyRef = { id: "isg", code: "ISG", name: "ไอ.เอส.จี. เทรดดิ้ง", isDefault: true };
  const LM: CompanyRef = { id: "lm", code: "LOUIS", name: "หลุยส์ มอนตินี่", isDefault: false };
  const of = (e: CashflowEvent, companyId: string | null): CashflowEvent => ({ ...e, companyId });

  const events = [
    of(ev("a", "2026-09-05", "in", 1000), "isg"),
    of(ev("b", "2026-09-06", "out", 300, "payroll"), "lm"),
    of(ev("c", "2026-09-07", "out", 200, "purchase_order"), null),
  ];
  const accounts = [
    { company_id: "isg", amount: 500 },
    { company_id: "lm", amount: 100 },
    { company_id: null, amount: 50 },
  ];

  it("ตัวกรอง: ทั้งกลุ่ม / บริษัทเดียว / ยังไม่ระบุ", () => {
    expect(filterEventsByCompany(events, COMPANY_ALL).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(filterEventsByCompany(events, "isg").map((e) => e.id)).toEqual(["a"]);
    expect(filterEventsByCompany(events, COMPANY_NONE).map((e) => e.id)).toEqual(["c"]);
  });

  it("ยังไม่ระบุบริษัท ต้องไม่ถูกนับเป็นของบริษัทตั้งต้น (ไม่งั้นยอด ISG เกินจริงเงียบ ๆ)", () => {
    expect(filterEventsByCompany(events, "isg").some((e) => !e.companyId)).toBe(false);
    expect(openingForCompany(accounts, "isg")).toBe(500);
  });

  it("ยอดตั้งต้น: ทั้งกลุ่มรวมทุกบัญชี · บัญชีไม่ระบุบริษัทนับเฉพาะกองยังไม่ระบุ", () => {
    expect(openingForCompany(accounts, COMPANY_ALL)).toBe(650);
    expect(openingForCompany(accounts, "lm")).toBe(100);
    expect(openingForCompany(accounts, COMPANY_NONE)).toBe(50);
  });

  it("สรุปรายบริษัท: แต่ละบริษัทมีเส้นเงินของตัวเอง — หลุยส์ติดลบได้แม้ทั้งกลุ่มยังบวก", () => {
    const rows = summarizeByCompany(events, accounts, [ISG, LM], "2026-09-01", "2026-09-30");
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.isg.low).toBe(500);
    expect(byKey.isg.red).toBe(0);
    expect(byKey.lm.low).toBe(-200);
    expect(byKey.lm.red).toBe(1);
    expect(byKey[COMPANY_NONE].count).toBe(1);
    // ทั้งกลุ่ม: 650 + 1000 - 300 - 200 = 1150 → ไม่ติดลบเลย
    const all = buildDailySeries(events, 650, "2026-09-01", "2026-09-30");
    expect(summarizeDays(all.days, all.startBalance).red).toBe(0);
  });

  it("บริษัทที่ยังไม่มีรายการก็ต้องโผล่ (จะได้เห็นว่ายังไม่กรอกเงินในบัญชี) · กองยังไม่ระบุโผล่เฉพาะตอนมีของ", () => {
    const rows = summarizeByCompany([], [], [ISG, LM], "2026-09-01", "2026-09-30");
    expect(rows.map((r) => r.key)).toEqual(["isg", "lm"]);
    expect(rows[0].accountCount).toBe(0);
  });

  it("นับรายการยังไม่ระบุแยกตามแหล่ง — บอกได้ว่าต้องไปตั้งที่ไหน", () => {
    expect(unassignedBySource(events, "2026-09-30")).toEqual([{ source: "purchase_order", in: 0, out: 200, count: 1 }]);
  });

  it("ตัวกรองที่จำไว้แต่บริษัทถูกปิดไปแล้ว → กลับไปดูทั้งกลุ่ม", () => {
    expect(validCompanyFilter("isg", [ISG])).toBe("isg");
    expect(validCompanyFilter("gone", [ISG])).toBe(COMPANY_ALL);
    expect(validCompanyFilter(null, [ISG])).toBe(COMPANY_ALL);
    expect(validCompanyFilter(COMPANY_NONE, [ISG])).toBe(COMPANY_NONE);
  });

  it("สี/ชื่อบริษัท: ไล่ตามลำดับในทะเบียน · ไม่รู้จัก = ยังไม่ระบุ", () => {
    expect(companyTone([ISG, LM], "isg")).not.toEqual(companyTone([ISG, LM], "lm"));
    expect(companyTone([ISG, LM], null)).toEqual(UNASSIGNED_TONE);
    expect(companyLabel([ISG, LM], "lm")).toBe("LOUIS");
    expect(companyLabel([ISG, LM], "lm", "full")).toBe("หลุยส์ มอนตินี่");
    expect(companyLabel([ISG, LM], "x")).toBe("ยังไม่ระบุ");
  });
});
