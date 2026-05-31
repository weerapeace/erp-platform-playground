/**
 * Field helpers — Sprint 12/13
 *
 * resolveDefault()    — Sprint 12: คำนวณ default value จาก static / expression
 * evaluateCondition() — Sprint 13: เช็คเงื่อนไข show_if สำหรับ conditional field
 *
 * Pure functions — ทดสอบได้ใน lib/__tests__/field-helpers.test.ts
 */

// ============================================================
// Sprint 12: resolveDefault
// ============================================================

export type FieldType = "text" | "number" | "boolean" | "select" | "textarea" | "relation" | "image";

/**
 * Resolve default value สำหรับ Create form
 *
 * Priority:
 *   1. expression (now/today/current_user/uuid) — ชนะ static
 *   2. static value — coerce ตาม fieldType
 *   3. fallback empty (boolean=false, อื่นๆ='')
 *
 * @example
 *   resolveDefault('text', 'hello', null, 'me@x.com')        // 'hello'
 *   resolveDefault('text', null, 'current_user()', 'me@x.com') // 'me@x.com'
 *   resolveDefault('number', '42', null, null)                // 42
 *   resolveDefault('boolean', 'true', null, null)             // true
 *   resolveDefault('text', null, 'uuid()', null)              // crypto.randomUUID()
 */
export function resolveDefault(
  fieldType: FieldType,
  staticVal: string | null | undefined,
  expr: string | null | undefined,
  userEmail: string | null | undefined,
): unknown {
  // expression ชนะ static
  if (expr) {
    const e = expr.trim().toLowerCase();
    if (e === "now()")          return new Date().toISOString();
    if (e === "today()")        return new Date().toISOString().slice(0, 10);
    if (e === "current_user()") return userEmail ?? "";
    if (e === "uuid()") {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
      return "";
    }
    // unknown expr → fallback empty
    return fieldType === "boolean" ? false : "";
  }

  if (staticVal == null || staticVal === "") {
    return fieldType === "boolean" ? false : "";
  }

  // coerce static ตาม fieldType
  if (fieldType === "boolean") return staticVal === "true" || staticVal === "1";
  if (fieldType === "number") {
    const n = Number(staticVal);
    return isNaN(n) ? "" : n;
  }
  return staticVal;
}

// ============================================================
// Sprint 13: evaluateCondition (show_if)
// ============================================================

export type ConditionOperator = "=" | "!=" | "in" | "not_in" | "is_set" | "is_empty";

export type ShowIfRule = {
  field?:    string;
  operator?: ConditionOperator;
  value?:    unknown;
};

export type ConditionRules = {
  show_if?: ShowIfRule;
};

/**
 * Evaluate condition rule ของ field — ใช้ใน MasterCRUDPage FormSections
 *
 * Return true = แสดง field, false = ซ่อน
 *
 * @example
 *   evaluateCondition(null, { foo: 'bar' })                                    // true (no rule → always show)
 *   evaluateCondition({ show_if: { field: 'type', operator: '=', value: 'A' } }, { type: 'A' })  // true
 *   evaluateCondition({ show_if: { field: 'type', operator: '=', value: 'A' } }, { type: 'B' })  // false
 *   evaluateCondition({ show_if: { field: 't', operator: 'in', value: ['a','b'] } }, { t: 'a' }) // true
 *   evaluateCondition({ show_if: { field: 't', operator: 'is_set' } }, { t: '' })                // false
 *   evaluateCondition({ show_if: { field: 't', operator: 'is_empty' } }, { t: null })            // true
 */
export function evaluateCondition(
  rules: ConditionRules | Record<string, unknown> | null | undefined,
  form: Record<string, unknown>,
): boolean {
  if (!rules || typeof rules !== "object") return true;
  const showIf = (rules as ConditionRules).show_if;
  if (!showIf || !showIf.field) return true;

  const fieldVal = form[showIf.field];
  const op       = showIf.operator ?? "=";
  const expected = showIf.value;

  switch (op) {
    case "=":        return fieldVal === expected;
    case "!=":       return fieldVal !== expected;
    case "in":       return Array.isArray(expected) && expected.includes(fieldVal as never);
    case "not_in":   return Array.isArray(expected) && !expected.includes(fieldVal as never);
    case "is_set":   return fieldVal != null && fieldVal !== "" && fieldVal !== false;
    case "is_empty": return fieldVal == null || fieldVal === "" || fieldVal === false;
    default:         return true;
  }
}
