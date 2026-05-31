import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveDefault, evaluateCondition } from "@/lib/field-helpers";

// ============================================================
// resolveDefault — Sprint 12
// ============================================================

describe("resolveDefault — static value", () => {
  it("text: pass-through string", () => {
    expect(resolveDefault("text", "hello", null, null)).toBe("hello");
  });
  it("text: empty → ''", () => {
    expect(resolveDefault("text", "", null, null)).toBe("");
    expect(resolveDefault("text", null, null, null)).toBe("");
    expect(resolveDefault("text", undefined, null, null)).toBe("");
  });
  it("number: coerce string → number", () => {
    expect(resolveDefault("number", "42", null, null)).toBe(42);
    expect(resolveDefault("number", "3.14", null, null)).toBe(3.14);
  });
  it("number: invalid → ''", () => {
    expect(resolveDefault("number", "abc", null, null)).toBe("");
  });
  it("number: empty/null → ''", () => {
    expect(resolveDefault("number", "", null, null)).toBe("");
    expect(resolveDefault("number", null, null, null)).toBe("");
  });
  it("boolean: 'true'/'1' → true", () => {
    expect(resolveDefault("boolean", "true", null, null)).toBe(true);
    expect(resolveDefault("boolean", "1", null, null)).toBe(true);
  });
  it("boolean: 'false'/other → false", () => {
    expect(resolveDefault("boolean", "false", null, null)).toBe(false);
    expect(resolveDefault("boolean", "anything", null, null)).toBe(false);
    expect(resolveDefault("boolean", "", null, null)).toBe(false);
    expect(resolveDefault("boolean", null, null, null)).toBe(false);
  });
  it("select / textarea: text-like coercion", () => {
    expect(resolveDefault("select", "option_a", null, null)).toBe("option_a");
    expect(resolveDefault("textarea", "long text", null, null)).toBe("long text");
  });
});

describe("resolveDefault — dynamic expression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T12:34:56.000Z"));
  });

  it("now() → ISO timestamp", () => {
    expect(resolveDefault("text", null, "now()", null)).toBe("2026-05-31T12:34:56.000Z");
  });
  it("today() → YYYY-MM-DD", () => {
    expect(resolveDefault("text", null, "today()", null)).toBe("2026-05-31");
  });
  it("current_user() → user email", () => {
    expect(resolveDefault("text", null, "current_user()", "user@x.com")).toBe("user@x.com");
  });
  it("current_user() with no user → ''", () => {
    expect(resolveDefault("text", null, "current_user()", null)).toBe("");
  });
  it("uuid() → 36-char uuid v4 (เมื่อ crypto.randomUUID มี)", () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      const v = resolveDefault("text", null, "uuid()", null);
      expect(typeof v).toBe("string");
      expect((v as string).length).toBe(36);
      expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });
  it("unknown expression → '' (text) / false (boolean)", () => {
    expect(resolveDefault("text", "ignored", "unknown_func()", null)).toBe("");
    expect(resolveDefault("boolean", "ignored", "unknown_func()", null)).toBe(false);
  });
  it("expression ชนะ static value", () => {
    expect(resolveDefault("text", "STATIC", "current_user()", "me@x.com")).toBe("me@x.com");
  });
  it("case-insensitive (NOW() = now())", () => {
    expect(resolveDefault("text", null, "NOW()", null)).toBe("2026-05-31T12:34:56.000Z");
  });
  it("trims whitespace", () => {
    expect(resolveDefault("text", null, "  now()  ", null)).toBe("2026-05-31T12:34:56.000Z");
  });
});

// ============================================================
// evaluateCondition — Sprint 13
// ============================================================

describe("evaluateCondition — no rule", () => {
  it("null → true (always show)", () => {
    expect(evaluateCondition(null, {})).toBe(true);
  });
  it("undefined → true", () => {
    expect(evaluateCondition(undefined, {})).toBe(true);
  });
  it("empty {} → true", () => {
    expect(evaluateCondition({}, {})).toBe(true);
  });
  it("show_if without field → true", () => {
    expect(evaluateCondition({ show_if: {} }, {})).toBe(true);
  });
});

describe("evaluateCondition — operator =", () => {
  it("equal → true", () => {
    expect(evaluateCondition({ show_if: { field: "type", operator: "=", value: "A" } }, { type: "A" })).toBe(true);
  });
  it("not equal → false", () => {
    expect(evaluateCondition({ show_if: { field: "type", operator: "=", value: "A" } }, { type: "B" })).toBe(false);
  });
  it("missing field → false", () => {
    expect(evaluateCondition({ show_if: { field: "type", operator: "=", value: "A" } }, {})).toBe(false);
  });
  it("boolean comparison", () => {
    expect(evaluateCondition({ show_if: { field: "active", operator: "=", value: true } }, { active: true })).toBe(true);
    expect(evaluateCondition({ show_if: { field: "active", operator: "=", value: true } }, { active: false })).toBe(false);
  });
  it("default operator = '='", () => {
    expect(evaluateCondition({ show_if: { field: "type", value: "A" } }, { type: "A" })).toBe(true);
    expect(evaluateCondition({ show_if: { field: "type", value: "A" } }, { type: "B" })).toBe(false);
  });
});

describe("evaluateCondition — operator !=", () => {
  it("different → true", () => {
    expect(evaluateCondition({ show_if: { field: "type", operator: "!=", value: "A" } }, { type: "B" })).toBe(true);
  });
  it("same → false", () => {
    expect(evaluateCondition({ show_if: { field: "type", operator: "!=", value: "A" } }, { type: "A" })).toBe(false);
  });
});

describe("evaluateCondition — operator in / not_in", () => {
  it("in: value in list → true", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "in", value: ["a", "b", "c"] } }, { t: "b" })).toBe(true);
  });
  it("in: value NOT in list → false", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "in", value: ["a", "b"] } }, { t: "c" })).toBe(false);
  });
  it("in: value=non-array → false", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "in", value: "single" } }, { t: "single" })).toBe(false);
  });
  it("not_in: value NOT in list → true", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "not_in", value: ["a", "b"] } }, { t: "c" })).toBe(true);
  });
  it("not_in: value in list → false", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "not_in", value: ["a", "b"] } }, { t: "a" })).toBe(false);
  });
});

describe("evaluateCondition — operator is_set / is_empty", () => {
  it("is_set: non-empty string → true", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_set" } }, { t: "hello" })).toBe(true);
  });
  it("is_set: number 0 → true (0 is set)", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_set" } }, { t: 0 })).toBe(true);
  });
  it("is_set: empty string → false", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_set" } }, { t: "" })).toBe(false);
  });
  it("is_set: null/undefined → false", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_set" } }, { t: null })).toBe(false);
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_set" } }, {})).toBe(false);
  });
  it("is_set: false → false (treated as unset)", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_set" } }, { t: false })).toBe(false);
  });
  it("is_empty: empty/null → true", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_empty" } }, { t: "" })).toBe(true);
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_empty" } }, { t: null })).toBe(true);
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_empty" } }, {})).toBe(true);
  });
  it("is_empty: filled → false", () => {
    expect(evaluateCondition({ show_if: { field: "t", operator: "is_empty" } }, { t: "x" })).toBe(false);
  });
});

describe("evaluateCondition — unknown operator", () => {
  it("unknown op → true (fail-open, ไม่ block render)", () => {
    expect(evaluateCondition(
      { show_if: { field: "t", operator: "xyz" as never, value: "a" } },
      { t: "b" }
    )).toBe(true);
  });
});
