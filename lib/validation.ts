/**
 * Validation Service กลาง
 *
 * **Rule**: ทุก form/import ที่ต้องการ validate field ใช้ service นี้
 *
 * Architecture:
 *   - Built-in registry — รู้ validator type 5 ตัว (regex/min_max/length/required/function)
 *   - Rules อยู่ใน DB (erp_validation_rules) — fetch ผ่าน API
 *   - validateValue(rules, value, ruleKeys) → error message[] (ว่างถ้าผ่าน)
 *
 * Function validators (whitelist):
 *   thai_id_checksum   — ตรวจ 13 หลัก + Luhn-like checksum
 *   tax_id_checksum    — เหมือน thai_id (ใช้ algorithm เดียวกัน)
 */

// ============================================================
// Types
// ============================================================

export type ValidatorType = "regex" | "min_max" | "length" | "required" | "function";

export type ValidationRule = {
  key:             string;
  label:           string;
  description?:    string | null;
  category:        "format" | "range" | "required" | "business" | "custom";
  validator_type:  ValidatorType;
  config:          Record<string, unknown>;
  default_message: string | null;
  is_builtin:      boolean;
  active:          boolean;
};

export type ValidationError = {
  field?:    string;
  rule_key:  string;
  message:   string;
};

// ============================================================
// Built-in function validators
// ============================================================

const FUNCTION_VALIDATORS: Record<string, (v: unknown) => boolean> = {
  /** ตรวจเลขประจำตัวประชาชนไทย 13 หลัก + checksum */
  thai_id_checksum: (val) => {
    if (val == null) return false;
    const s = String(val).replace(/\D/g, "");
    if (s.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(s[i]) * (13 - i);
    const checkDigit = (11 - (sum % 11)) % 10;
    return checkDigit === parseInt(s[12]);
  },
  /** Tax ID ใช้ algorithm เดียวกับบัตรประชาชน */
  tax_id_checksum: (val) => FUNCTION_VALIDATORS.thai_id_checksum(val),
};

// ============================================================
// Single validator runner
// ============================================================

function runValidator(rule: ValidationRule, value: unknown): string | null {
  // ถ้า value ว่าง + ไม่ใช่ required → ผ่าน
  const isEmpty = value == null || value === "" || (typeof value === "string" && value.trim() === "");
  if (isEmpty && rule.validator_type !== "required") return null;

  const cfg = rule.config ?? {};
  const msg = (cfg.message as string) ?? rule.default_message ?? `ไม่ผ่าน ${rule.label}`;

  switch (rule.validator_type) {
    case "required": {
      return isEmpty ? msg : null;
    }
    case "regex": {
      const pattern = cfg.pattern as string;
      const flags   = (cfg.flags as string) ?? "";
      if (!pattern) return null;
      try {
        const re = new RegExp(pattern, flags);
        return re.test(String(value)) ? null : msg;
      } catch { return `regex ผิดพลาด: ${pattern}`; }
    }
    case "min_max": {
      const n = typeof value === "number" ? value : parseFloat(String(value).replace(/,/g, ""));
      if (isNaN(n)) return "ค่าต้องเป็นตัวเลข";
      const min = cfg.min as number | undefined;
      const max = cfg.max as number | undefined;
      if (min != null && n < min) return (cfg.message_min as string) ?? msg;
      if (max != null && n > max) return (cfg.message_max as string) ?? msg;
      return null;
    }
    case "length": {
      const len = String(value).length;
      const min = cfg.min as number | undefined;
      const max = cfg.max as number | undefined;
      if (min != null && len < min) return msg;
      if (max != null && len > max) return msg;
      return null;
    }
    case "function": {
      const name = cfg.name as string;
      const fn   = FUNCTION_VALIDATORS[name];
      if (!fn) return `function "${name}" ไม่มีใน registry`;
      return fn(value) ? null : msg;
    }
    default:
      return null;
  }
}

// ============================================================
// Public API
// ============================================================

/** validate ค่าตามชุด rule keys */
export function validateValue(
  value:    unknown,
  ruleKeys: string[],
  rules:    Record<string, ValidationRule>,
): string[] {
  const errors: string[] = [];
  for (const key of ruleKeys) {
    const rule = rules[key];
    if (!rule || !rule.active) continue;
    const err = runValidator(rule, value);
    if (err) errors.push(err);
  }
  return errors;
}

/** validate object ทั้งก้อน */
export function validateObject(
  obj:    Record<string, unknown>,
  schema: Record<string, string[]>,   // field → rule keys
  rules:  Record<string, ValidationRule>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const [field, ruleKeys] of Object.entries(schema)) {
    const value = obj[field];
    const msgs  = validateValue(value, ruleKeys, rules);
    for (const m of msgs) {
      errors.push({ field, rule_key: ruleKeys.find(k => rules[k]?.default_message === m) ?? "?", message: m });
    }
  }
  return errors;
}

// ============================================================
// Convenience: rules cache loader
// ============================================================

let _cache: Record<string, ValidationRule> | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 1000;   // 60s

export async function loadValidationRules(forceRefresh = false): Promise<Record<string, ValidationRule>> {
  const now = (typeof Date !== "undefined" && Date.now) ? Date.now() : 0;
  if (!forceRefresh && _cache && now - _cacheTime < CACHE_TTL) return _cache;
  try {
    const { apiFetch } = await import("@/lib/api");
    const res = await apiFetch("/api/validation-rules");
    const json = await res.json();
    const map: Record<string, ValidationRule> = {};
    (json.data ?? []).forEach((r: ValidationRule) => { map[r.key] = r; });
    _cache = map;
    _cacheTime = now;
    return map;
  } catch {
    return _cache ?? {};
  }
}

export function clearValidationCache() {
  _cache = null; _cacheTime = 0;
}
