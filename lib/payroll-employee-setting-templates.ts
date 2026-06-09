export type PayrollEmployeeSettingTemplateValues = {
  tax_calculation_method: string;
  social_security_enabled: boolean;
  withholding_tax_enabled: boolean;
  overtime_enabled: boolean;
  piece_rate_enabled: boolean;
  attendance_bonus_enabled: boolean;
  advance_payment_allowed: boolean;
  max_advance_amount: number;
  default_mid_month_advance_amount: number;
  social_security_employee_amount: number;
  social_security_employer_amount: number;
  withholding_tax_rate: number;
};

export type PayrollEmployeeSettingTemplate = {
  id: string;
  key: string;
  label: string;
  description: string;
  employeeCount: number;
  existingSettingCount: number;
  values: PayrollEmployeeSettingTemplateValues;
};

export type PayrollEmployeeSettingTemplateInput = Partial<Omit<PayrollEmployeeSettingTemplate, "values">> & {
  key?: unknown;
  label?: unknown;
  description?: unknown;
  values?: Partial<Record<keyof PayrollEmployeeSettingTemplateValues, unknown>> | unknown;
};

const LABELS: Record<string, string> = {
  permanent: "ประจำ",
  regular: "ประจำ",
  regular_external: "ประจำนอกระบบ",
  external: "ประจำนอกระบบ",
  daily: "รายวัน",
  hourly: "รายชั่วโมง",
  contractor: "งานเหมา",
  part_time: "พาร์ทไทม์",
};

const DEFAULT_TEMPLATE_VALUES: PayrollEmployeeSettingTemplateValues = {
  tax_calculation_method: "manual",
  social_security_enabled: true,
  withholding_tax_enabled: true,
  overtime_enabled: true,
  piece_rate_enabled: false,
  attendance_bonus_enabled: false,
  advance_payment_allowed: true,
  max_advance_amount: 0,
  default_mid_month_advance_amount: 0,
  social_security_employee_amount: 558,
  social_security_employer_amount: 558,
  withholding_tax_rate: 0,
};

export const DEFAULT_EMPLOYEE_SETTING_TEMPLATE_KEYS = [
  "permanent",
  "regular_external",
  "daily",
  "contractor",
];

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

export function contractTypeLabel(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, " ");
}

export function normalizeTemplateValues(input: unknown): PayrollEmployeeSettingTemplateValues {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    tax_calculation_method: String(raw.tax_calculation_method ?? DEFAULT_TEMPLATE_VALUES.tax_calculation_method),
    social_security_enabled: asBoolean(raw.social_security_enabled, DEFAULT_TEMPLATE_VALUES.social_security_enabled),
    withholding_tax_enabled: asBoolean(raw.withholding_tax_enabled, DEFAULT_TEMPLATE_VALUES.withholding_tax_enabled),
    overtime_enabled: asBoolean(raw.overtime_enabled, DEFAULT_TEMPLATE_VALUES.overtime_enabled),
    piece_rate_enabled: asBoolean(raw.piece_rate_enabled, DEFAULT_TEMPLATE_VALUES.piece_rate_enabled),
    attendance_bonus_enabled: asBoolean(raw.attendance_bonus_enabled, DEFAULT_TEMPLATE_VALUES.attendance_bonus_enabled),
    advance_payment_allowed: asBoolean(raw.advance_payment_allowed, DEFAULT_TEMPLATE_VALUES.advance_payment_allowed),
    max_advance_amount: asNumber(raw.max_advance_amount, DEFAULT_TEMPLATE_VALUES.max_advance_amount),
    default_mid_month_advance_amount: asNumber(raw.default_mid_month_advance_amount, DEFAULT_TEMPLATE_VALUES.default_mid_month_advance_amount),
    social_security_employee_amount: asNumber(raw.social_security_employee_amount, DEFAULT_TEMPLATE_VALUES.social_security_employee_amount),
    social_security_employer_amount: asNumber(raw.social_security_employer_amount, DEFAULT_TEMPLATE_VALUES.social_security_employer_amount),
    withholding_tax_rate: asNumber(raw.withholding_tax_rate, DEFAULT_TEMPLATE_VALUES.withholding_tax_rate),
  };
}

export function createEmployeeSettingTemplate(key: string, overrides: Partial<PayrollEmployeeSettingTemplate> = {}): PayrollEmployeeSettingTemplate {
  const normalizedKey = String(key || "contract").trim() || "contract";
  return {
    id: overrides.id ?? normalizedKey,
    key: normalizedKey,
    label: overrides.label ?? contractTypeLabel(normalizedKey),
    description: overrides.description ?? "ค่าเริ่มต้นสำหรับพนักงานที่มีสัญญาประเภทนี้",
    employeeCount: overrides.employeeCount ?? 0,
    existingSettingCount: overrides.existingSettingCount ?? 0,
    values: normalizeTemplateValues(overrides.values),
  };
}

export function normalizeEmployeeSettingTemplates(input: unknown, contractKeys: string[] = []): PayrollEmployeeSettingTemplate[] {
  const seen = new Set<string>();
  const out: PayrollEmployeeSettingTemplate[] = [];
  const add = (template: PayrollEmployeeSettingTemplate) => {
    const key = template.key.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(template);
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      const raw = (item && typeof item === "object" ? item : {}) as PayrollEmployeeSettingTemplateInput;
      const key = String(raw.key ?? "").trim();
      if (!key) continue;
      add(createEmployeeSettingTemplate(key, {
        id: typeof raw.id === "string" ? raw.id : key,
        label: typeof raw.label === "string" ? raw.label : contractTypeLabel(key),
        description: typeof raw.description === "string" ? raw.description : undefined,
        employeeCount: typeof raw.employeeCount === "number" ? raw.employeeCount : 0,
        existingSettingCount: typeof raw.existingSettingCount === "number" ? raw.existingSettingCount : 0,
        values: normalizeTemplateValues(raw.values),
      }));
    }
  }

  for (const key of [...contractKeys, ...DEFAULT_EMPLOYEE_SETTING_TEMPLATE_KEYS]) {
    add(createEmployeeSettingTemplate(key));
  }

  return out;
}

export function templateValuesToSettingsPatch(values: PayrollEmployeeSettingTemplateValues): Record<string, unknown> {
  return {
    tax_calculation_method: values.tax_calculation_method,
    social_security_enabled: values.social_security_enabled,
    withholding_tax_enabled: values.withholding_tax_enabled,
    overtime_enabled: values.overtime_enabled,
    piece_rate_enabled: values.piece_rate_enabled,
    attendance_bonus_enabled: values.attendance_bonus_enabled,
    advance_payment_allowed: values.advance_payment_allowed,
    max_advance_amount: values.max_advance_amount,
    default_mid_month_advance_amount: values.default_mid_month_advance_amount,
    social_security_employee_amount: values.social_security_employee_amount,
    social_security_employer_amount: values.social_security_employer_amount,
    withholding_tax_rate: values.withholding_tax_rate,
  };
}
