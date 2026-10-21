import { describe, it, expect } from "vitest";
import { csvCell, inSegment, membersCsv } from "../website-member-segments";

/** 🎯 กลุ่มลูกค้า + CSV (ชุด 6 · 2026-10-22) */
describe("🎯 กลุ่มลูกค้า", () => {
  const now = new Date("2026-10-22T00:00:00Z");
  const m = (o: Partial<{ marketingOptIn: boolean; orderCount: number; lastOrderAt: string | null; tier: { key: string } | null }>) => ({ marketingOptIn: false, orderCount: 0, lastOrderAt: null, tier: null, ...o });
  it("รับข่าวสาร / ซื้อซ้ำ / ยังไม่ซื้อ / ห่างหาย 90 วัน / ระดับ", () => {
    expect(inSegment(m({ marketingOptIn: true }), "optin", now)).toBe(true);
    expect(inSegment(m({ orderCount: 2 }), "repeat", now)).toBe(true);
    expect(inSegment(m({ orderCount: 1 }), "repeat", now)).toBe(false);
    expect(inSegment(m({}), "new", now)).toBe(true);
    expect(inSegment(m({ orderCount: 1, lastOrderAt: "2026-07-01T00:00:00Z" }), "lapsed", now)).toBe(true);
    expect(inSegment(m({ orderCount: 1, lastOrderAt: "2026-10-01T00:00:00Z" }), "lapsed", now)).toBe(false);
    expect(inSegment(m({ orderCount: 0 }), "lapsed", now)).toBe(false);
    expect(inSegment(m({ tier: { key: "gold" } }), "tier:gold", now)).toBe(true);
    expect(inSegment(m({ tier: null }), "tier:gold", now)).toBe(false);
    expect(inSegment(m({}), "all", now)).toBe(true);
  });
});

describe("📄 CSV", () => {
  it("ครอบ \"\" · กันสูตร Excel · มี BOM · วันที่เวลาไทย", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("+66812345678")).toBe(`"'+66812345678"`);
    const csv = membersCsv([{ name: "อร", email: null, phone: "0812345678", marketingOptIn: true, orderCount: 2, orderTotal: 1500.5, lastOrderAt: "2026-10-21T18:00:00Z", tierName: "Silver", createdAt: "2026-01-01T00:00:00Z" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")[1]).toBe(['"อร"', '""', '"0812345678"', '"ใช่"', '"2"', '"1500.5"', '"2026-10-22"', '"Silver"', '"2026-01-01"'].join(","));
  });
});
