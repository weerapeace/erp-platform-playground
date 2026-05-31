import { describe, it, expect } from "vitest";
import {
  toMinor, toMajor, money, zero,
  add, subtract, multiply, divide, sum, percent,
  isZero, isNegative, abs, negate, compare,
  convert, format, formatNumber, parse,
} from "@/lib/money";

describe("money — toMinor / toMajor", () => {
  it("THB scale=2: 100.50 → 10050 minor units", () => {
    expect(toMinor(100.50, "THB")).toBe(10050);
    expect(toMajor(10050, "THB")).toBe(100.5);
  });

  it("JPY scale=0: 1234 → 1234 minor units", () => {
    expect(toMinor(1234, "JPY")).toBe(1234);
    expect(toMajor(1234, "JPY")).toBe(1234);
  });

  it("rounding: half-up by default — 100.555 → 10056", () => {
    expect(toMinor(100.555, "THB")).toBe(10056);
  });

  it("floor mode — 100.999 → 10099", () => {
    expect(toMinor(100.999, "THB", "floor")).toBe(10099);
  });

  it("ceil mode — 100.001 → 10001", () => {
    expect(toMinor(100.001, "THB", "ceil")).toBe(10001);
  });

  it("half-even (Banker's) — 0.5 → 0, 1.5 → 2, 2.5 → 2", () => {
    // ปัดเข้าหาเลขคู่
    expect(toMinor(0.005, "THB", "half-even")).toBe(0);  // 0.5 → 0 (even)
    expect(toMinor(0.015, "THB", "half-even")).toBe(2);  // 1.5 → 2 (even)
    expect(toMinor(0.025, "THB", "half-even")).toBe(2);  // 2.5 → 2 (even)
    expect(toMinor(0.035, "THB", "half-even")).toBe(4);  // 3.5 → 4
  });
});

describe("money — arithmetic", () => {
  it("add: 100.50 + 50.25 = 150.75", () => {
    const r = add(money(100.50), money(50.25));
    expect(r.amount).toBe(15075);
    expect(toMajor(r.amount)).toBe(150.75);
  });

  it("subtract: 100 - 30 = 70", () => {
    expect(subtract(money(100), money(30)).amount).toBe(7000);
  });

  it("multiply: 100 × 3 = 300", () => {
    expect(multiply(money(100), 3).amount).toBe(30000);
  });

  it("divide: 100 / 4 = 25", () => {
    expect(divide(money(100), 4).amount).toBe(2500);
  });

  it("divide by zero throws", () => {
    expect(() => divide(money(100), 0)).toThrow(/divide by zero/);
  });

  it("sum: [10, 20, 30] = 60", () => {
    const r = sum([money(10), money(20), money(30)]);
    expect(r.amount).toBe(6000);
  });

  it("sum: empty list = zero(default)", () => {
    expect(sum([]).amount).toBe(0);
  });

  it("percent: 1000 × 7% = 70", () => {
    expect(percent(money(1000), 7).amount).toBe(7000);
  });
});

describe("money — currency safety", () => {
  it("add different currency throws", () => {
    expect(() => add(money(100, "THB"), money(100, "USD"))).toThrow(/currency mismatch/);
  });

  it("subtract different currency throws", () => {
    expect(() => subtract(money(100, "THB"), money(100, "USD"))).toThrow(/currency mismatch/);
  });

  it("sum different currency throws", () => {
    expect(() => sum([money(10, "THB"), money(20, "USD")])).toThrow(/currency mismatch/);
  });

  it("compare different currency throws", () => {
    expect(() => compare(money(100, "THB"), money(100, "USD"))).toThrow(/currency mismatch/);
  });
});

describe("money — predicates", () => {
  it("isZero, isNegative", () => {
    expect(isZero(zero())).toBe(true);
    expect(isZero(money(0.01))).toBe(false);
    expect(isNegative(money(-5))).toBe(true);
    expect(isNegative(money(5))).toBe(false);
  });

  it("abs, negate", () => {
    expect(abs(money(-100)).amount).toBe(10000);
    expect(negate(money(100)).amount).toBe(-10000);
    expect(negate(money(-100)).amount).toBe(10000);
  });

  it("compare: a > b, a === b, a < b", () => {
    expect(compare(money(100), money(50))).toBeGreaterThan(0);
    expect(compare(money(50), money(50))).toBe(0);
    expect(compare(money(20), money(50))).toBeLessThan(0);
  });
});

describe("money — conversion", () => {
  it("THB → USD rate=0.027 — 1000 THB = 27 USD", () => {
    const r = convert(money(1000, "THB"), "USD", 0.027);
    expect(toMajor(r.amount, "USD")).toBe(27);
    expect(r.currency).toBe("USD");
  });

  it("same currency = no-op", () => {
    const src = money(100, "THB");
    expect(convert(src, "THB", 999).amount).toBe(src.amount);
  });
});

describe("money — format & parse", () => {
  it("format default THB symbol", () => {
    expect(format(money(1234.5))).toBe("฿1,234.50");
  });

  it("format with code", () => {
    expect(format(money(1234.5), { code: true })).toMatch(/1,234\.50 THB/);
  });

  it("format with no symbol", () => {
    expect(format(money(1234.5), { symbol: false })).toBe("1,234.50");
  });

  it("formatNumber omits symbol", () => {
    expect(formatNumber(money(1234.5))).toBe("1,234.50");
  });

  it("parse '฿1,234.56' → 1234.56", () => {
    const r = parse("฿1,234.56");
    expect(toMajor(r.amount)).toBe(1234.56);
  });

  it("parse '1234.56' → 1234.56", () => {
    expect(toMajor(parse("1234.56").amount)).toBe(1234.56);
  });

  it("parse invalid → zero", () => {
    expect(parse("abc").amount).toBe(0);
  });
});
