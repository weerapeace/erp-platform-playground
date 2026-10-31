import { describe, expect, it } from "vitest";
import {
  formatOtRangeNote,
  otNetMinutes,
  otRangeCoversBreak,
  otRangeMinutes,
  parseClockMinutes,
  parseOtRangeNote,
} from "@/lib/payroll-ot-range";

describe("payroll-ot-range", () => {
  it("reads the time formats people actually type", () => {
    expect(parseClockMinutes("17.00")).toBe(1020);
    expect(parseClockMinutes("17:30")).toBe(1050);
    expect(parseClockMinutes("1700")).toBe(1020);
    expect(parseClockMinutes("25.00")).toBeNull();
    expect(parseClockMinutes("")).toBeNull();
  });

  it("counts range minutes, including past midnight", () => {
    expect(otRangeMinutes("10.00", "17.00")).toBe(420);
    expect(otRangeMinutes("22.00", "02.00")).toBe(240);
    expect(otRangeMinutes("10.00", "10.00")).toBeNull();
  });

  it("ticks the break only when the range spans the whole lunch break", () => {
    expect(otRangeCoversBreak("10.00", "17.00")).toBe(true);
    expect(otRangeCoversBreak("08.00", "17.00")).toBe(true);
    expect(otRangeCoversBreak("17.00", "20.00")).toBe(false);
    expect(otRangeCoversBreak("12.30", "17.00")).toBe(false);
    expect(otRangeCoversBreak("08.00", "12.00")).toBe(false);
  });

  it("subtracts the break and rejects a break as long as the range", () => {
    expect(otNetMinutes(420, 60)).toBe(360);
    expect(otNetMinutes(420, 0)).toBe(420);
    expect(otNetMinutes(60, 60)).toBeNull();
  });

  it("writes and reads back the auto note", () => {
    expect(formatOtRangeNote("1000", "17:00", 60)).toBe("OT 10.00–17.00 หักพัก 60 นาที");
    expect(formatOtRangeNote("17.00", "20.00", 0)).toBe("OT 17.00–20.00");
    expect(parseOtRangeNote("OT 10.00–17.00 หักพัก 60 นาที · เคลียร์ออเดอร์")).toEqual({
      from: "10.00", to: "17.00", breakMinutes: 60, rest: "เคลียร์ออเดอร์",
    });
    expect(parseOtRangeNote("OT 17.00–20.00")).toEqual({ from: "17.00", to: "20.00", breakMinutes: 0, rest: "" });
    expect(parseOtRangeNote("มาสายรถติด")).toBeNull();
  });
});
