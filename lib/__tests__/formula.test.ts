import { describe, it, expect } from "vitest";
import { computeField, validateFormula, formulaRefs, formatComputed } from "@/lib/formula";

describe("computeField — basic arithmetic", () => {
  it("multiplies two fields", () => {
    expect(computeField("qty * price", { qty: 10, price: 22 })).toBe(220);
  });
  it("respects operator precedence", () => {
    expect(computeField("a + b * c", { a: 2, b: 3, c: 4 })).toBe(14);
  });
  it("handles parentheses", () => {
    expect(computeField("(a + b) * c", { a: 2, b: 3, c: 4 })).toBe(20);
  });
  it("handles subtraction and division", () => {
    expect(computeField("(total - discount) / 2", { total: 100, discount: 20 })).toBe(40);
  });
  it("supports unary minus", () => {
    expect(computeField("-a + b", { a: 5, b: 8 })).toBe(3);
  });
  it("string numbers are coerced", () => {
    expect(computeField("qty * price", { qty: "10", price: "2.5" })).toBe(25);
  });
  it("missing field counts as 0", () => {
    expect(computeField("qty * price", { qty: 10 })).toBe(0);
  });
});

describe("computeField — functions", () => {
  it("round with decimals", () => {
    expect(computeField("round(a / b, 2)", { a: 10, b: 3 })).toBe(3.33);
  });
  it("min / max", () => {
    expect(computeField("max(a, b, c)", { a: 1, b: 9, c: 4 })).toBe(9);
    expect(computeField("min(a, b)", { a: 1, b: 9 })).toBe(1);
  });
});

describe("computeField — safety / errors", () => {
  it("division by zero → null", () => {
    expect(computeField("a / b", { a: 1, b: 0 })).toBeNull();
  });
  it("rejects unknown characters (no code injection)", () => {
    expect(computeField("a; drop table", { a: 1 })).toBeNull();
  });
  it("empty formula → null", () => {
    expect(computeField("", { a: 1 })).toBeNull();
    expect(computeField(null, { a: 1 })).toBeNull();
  });
  it("unbalanced parens → null", () => {
    expect(computeField("(a + b", { a: 1, b: 2 })).toBeNull();
  });
});

describe("validateFormula", () => {
  it("passes a valid formula", () => {
    expect(validateFormula("qty * price_est")).toBeNull();
  });
  it("flags forbidden chars", () => {
    expect(validateFormula("a & b")).not.toBeNull();
  });
  it("flags bad syntax", () => {
    expect(validateFormula("a * * b")).not.toBeNull();
  });
});

describe("formulaRefs", () => {
  it("lists field names, excludes function names", () => {
    expect(formulaRefs("round(qty * price, 2)").sort()).toEqual(["price", "qty"]);
  });
});

describe("formatComputed", () => {
  it("formats with decimals", () => {
    expect(formatComputed(1234.5, "number", 2)).toBe("1,234.50");
  });
  it("percent suffix", () => {
    expect(formatComputed(12.5, "percent", 1)).toBe("12.5%");
  });
  it("null → dash", () => {
    expect(formatComputed(null)).toBe("—");
  });
});
