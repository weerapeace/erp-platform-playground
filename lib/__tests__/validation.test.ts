import { describe, it, expect } from "vitest";
import { validateValue, validateObject, type ValidationRule } from "@/lib/validation";

// ============================================================
// Helpers — สร้าง rule แบบมินิมอล
// ============================================================

function rule(partial: Partial<ValidationRule> & Pick<ValidationRule, "key" | "validator_type" | "config">): ValidationRule {
  return {
    label:           partial.key,
    description:     null,
    category:        "format",
    default_message: `ไม่ผ่าน ${partial.key}`,
    is_builtin:      true,
    active:          true,
    ...partial,
  } as ValidationRule;
}

function rules(...arr: ValidationRule[]): Record<string, ValidationRule> {
  const m: Record<string, ValidationRule> = {};
  arr.forEach(r => { m[r.key] = r; });
  return m;
}

// ============================================================
// required
// ============================================================

describe("validation — required", () => {
  const r = rules(rule({ key: "req", validator_type: "required", config: {}, default_message: "ต้องกรอก" }));

  it("empty string → error", () => {
    expect(validateValue("", ["req"], r)).toEqual(["ต้องกรอก"]);
  });

  it("whitespace-only → error", () => {
    expect(validateValue("   ", ["req"], r)).toEqual(["ต้องกรอก"]);
  });

  it("null/undefined → error", () => {
    expect(validateValue(null, ["req"], r)).toEqual(["ต้องกรอก"]);
    expect(validateValue(undefined, ["req"], r)).toEqual(["ต้องกรอก"]);
  });

  it("non-empty → ok", () => {
    expect(validateValue("hello", ["req"], r)).toEqual([]);
    expect(validateValue(0, ["req"], r)).toEqual([]);    // 0 ไม่ถือว่าว่าง
    expect(validateValue(false, ["req"], r)).toEqual([]); // false ไม่ถือว่าว่าง
  });
});

// ============================================================
// regex
// ============================================================

describe("validation — regex", () => {
  const r = rules(rule({
    key: "email",
    validator_type: "regex",
    config: { pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
    default_message: "อีเมลไม่ถูกต้อง",
  }));

  it("valid email passes", () => {
    expect(validateValue("a@b.co", ["email"], r)).toEqual([]);
  });

  it("invalid email fails", () => {
    expect(validateValue("not-email", ["email"], r)).toEqual(["อีเมลไม่ถูกต้อง"]);
  });

  it("empty value skipped (non-required)", () => {
    expect(validateValue("", ["email"], r)).toEqual([]);
  });

  it("broken regex returns error string", () => {
    const bad = rules(rule({ key: "x", validator_type: "regex", config: { pattern: "[" }, default_message: "x" }));
    const errs = validateValue("any", ["x"], bad);
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch(/regex ผิดพลาด/);
  });
});

// ============================================================
// min_max (numeric)
// ============================================================

describe("validation — min_max", () => {
  const r = rules(rule({
    key: "qty",
    validator_type: "min_max",
    config: { min: 1, max: 100 },
    default_message: "อยู่ในช่วง 1-100",
  }));

  it("inside range — ok", () => {
    expect(validateValue(50, ["qty"], r)).toEqual([]);
  });

  it("below min — fail", () => {
    expect(validateValue(0, ["qty"], r)).toEqual(["อยู่ในช่วง 1-100"]);
  });

  it("above max — fail", () => {
    expect(validateValue(101, ["qty"], r)).toEqual(["อยู่ในช่วง 1-100"]);
  });

  it("non-number string fails with type message", () => {
    expect(validateValue("abc", ["qty"], r)).toEqual(["ค่าต้องเป็นตัวเลข"]);
  });

  it("number-with-commas accepted '1,234' = 1234", () => {
    expect(validateValue("1,234", ["qty"], r)).toEqual(["อยู่ในช่วง 1-100"]);  // > 100 → fail by range
  });
});

// ============================================================
// length
// ============================================================

describe("validation — length", () => {
  const r = rules(rule({
    key: "code",
    validator_type: "length",
    config: { min: 3, max: 10 },
    default_message: "ยาว 3-10",
  }));

  it("inside range — ok", () => {
    expect(validateValue("abcd", ["code"], r)).toEqual([]);
  });

  it("too short — fail", () => {
    expect(validateValue("ab", ["code"], r)).toEqual(["ยาว 3-10"]);
  });

  it("too long — fail", () => {
    expect(validateValue("abcdefghijk", ["code"], r)).toEqual(["ยาว 3-10"]);
  });
});

// ============================================================
// function — Thai ID
// ============================================================

describe("validation — function: thai_id_checksum", () => {
  const r = rules(rule({
    key: "thai_id",
    validator_type: "function",
    config: { name: "thai_id_checksum" },
    default_message: "เลขบัตรประชาชนไม่ถูกต้อง",
  }));

  it("valid Thai ID passes (3100900100871)", () => {
    // public test ID — checksum verified: Σ digit*weight = 176, (11-176%11)%10 = 1
    expect(validateValue("3100900100871", ["thai_id"], r)).toEqual([]);
  });

  it("invalid checksum fails", () => {
    expect(validateValue("3100900100870", ["thai_id"], r)).toEqual(["เลขบัตรประชาชนไม่ถูกต้อง"]);
  });

  it("non-13-digit fails", () => {
    expect(validateValue("123", ["thai_id"], r)).toEqual(["เลขบัตรประชาชนไม่ถูกต้อง"]);
  });

  it("accepts dashes (strips non-digit) — '3-1009-00100-87-1' valid", () => {
    expect(validateValue("3-1009-00100-87-1", ["thai_id"], r)).toEqual([]);
  });

  it("unknown function → error message", () => {
    const bad = rules(rule({ key: "x", validator_type: "function", config: { name: "no_such_fn" }, default_message: "x" }));
    const errs = validateValue("anything", ["x"], bad);
    expect(errs[0]).toMatch(/function "no_such_fn" ไม่มีใน registry/);
  });
});

// ============================================================
// Inactive rule + missing rule
// ============================================================

describe("validation — rule lifecycle", () => {
  it("inactive rule is skipped", () => {
    const r = rules({ ...rule({ key: "req", validator_type: "required", config: {} }), active: false });
    expect(validateValue("", ["req"], r)).toEqual([]);
  });

  it("unknown rule key is skipped silently", () => {
    expect(validateValue("x", ["nonexistent"], {})).toEqual([]);
  });
});

// ============================================================
// validateObject
// ============================================================

describe("validation — validateObject", () => {
  const r = rules(
    rule({ key: "req",   validator_type: "required", config: {}, default_message: "ต้องกรอก" }),
    rule({ key: "email", validator_type: "regex", config: { pattern: "^[^@]+@[^@]+$" }, default_message: "email ผิด" }),
  );

  it("collects errors per field", () => {
    const errs = validateObject(
      { name: "", contact: "bad-email" },
      { name: ["req"], contact: ["email"] },
      r,
    );
    expect(errs.length).toBe(2);
    expect(errs[0].field).toBe("name");
    expect(errs[1].field).toBe("contact");
  });

  it("valid object → no errors", () => {
    const errs = validateObject(
      { name: "John", contact: "a@b.co" },
      { name: ["req"], contact: ["email"] },
      r,
    );
    expect(errs).toEqual([]);
  });
});
