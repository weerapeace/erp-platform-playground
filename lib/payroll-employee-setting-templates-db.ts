import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeEmployeeSettingTemplates,
  templateValuesToSettingsPatch,
  type PayrollEmployeeSettingTemplate,
} from "@/lib/payroll-employee-setting-templates";

type Admin = ReturnType<typeof supabaseAdmin>;

type PayrollModuleRow = {
  id: string;
  module_key: string;
  table_name: string | null;
  label: string | null;
  config: Record<string, unknown> | null;
};

type ContractRow = {
  employee_id: string | null;
  contract_type: string | null;
};

type SettingRow = {
  id: string;
  employee_id: string;
};

export type PayrollEmployeeSettingTemplatesRecord = {
  storageReady: boolean;
  storageReason: string;
  module: { id: string; key: string; label: string } | null;
  templates: PayrollEmployeeSettingTemplate[];
  updatedAt: string | null;
};

export type ApplyEmployeeSettingTemplateResult = {
  templateKey: string;
  matchedEmployees: number;
  created: number;
  updated: number;
};

const TEMPLATE_CONFIG_KEY = "payroll_employee_setting_templates";
const TEMPLATE_UPDATED_AT_KEY = "payroll_employee_setting_templates_updated_at";

function getTemplateUpdatedAt(row: PayrollModuleRow): number {
  const raw = row.config?.[TEMPLATE_UPDATED_AT_KEY];
  if (typeof raw !== "string") return 0;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function hasStoredTemplates(row: PayrollModuleRow): boolean {
  return Array.isArray(row.config?.[TEMPLATE_CONFIG_KEY]);
}

function pickTemplateStorageModule(rows: PayrollModuleRow[]): PayrollModuleRow | null {
  return rows.find((row) => row.module_key === "payroll-employee-settings")
    ?? rows.find((row) => row.table_name === "employee_payroll_settings")
    ?? rows.find((row) => row.module_key === "payroll-employees")
    ?? rows.find((row) => row.module_key === "payroll")
    ?? rows[0]
    ?? null;
}

function pickTemplateSourceModule(rows: PayrollModuleRow[], storage: PayrollModuleRow | null): PayrollModuleRow | null {
  const withTemplates = rows
    .filter(hasStoredTemplates)
    .sort((a, b) => getTemplateUpdatedAt(b) - getTemplateUpdatedAt(a));
  return withTemplates[0] ?? storage;
}

async function listPayrollModules(admin: Admin): Promise<PayrollModuleRow[]> {
  const primary = await admin
    .from("erp_modules")
    .select("id, module_key, table_name, label, config")
    .or("module_key.ilike.%payroll%,table_name.eq.payroll,table_name.eq.employee_payroll_settings")
    .order("module_key", { ascending: true });
  if (!primary.error) return (primary.data ?? []) as PayrollModuleRow[];

  const fallback = await admin
    .from("erp_modules")
    .select("id, module_key, table_name, label, config")
    .ilike("module_key", "%payroll%")
    .order("module_key", { ascending: true });
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as PayrollModuleRow[];
}

async function currentContractStats(admin: Admin): Promise<{ keys: string[]; counts: Record<string, number>; settingCounts: Record<string, number> }> {
  const { data, error } = await admin
    .from("employee_contracts")
    .select("employee_id, contract_type")
    .eq("is_current", true)
    .eq("status", "active");
  if (error) throw new Error(error.message);

  const employeesByType: Record<string, Set<string>> = {};
  const typeByEmployee = new Map<string, string>();
  for (const row of (data ?? []) as ContractRow[]) {
    const key = String(row.contract_type ?? "").trim();
    const employeeId = String(row.employee_id ?? "").trim();
    if (!key || !employeeId) continue;
    if (!employeesByType[key]) employeesByType[key] = new Set<string>();
    employeesByType[key].add(employeeId);
    typeByEmployee.set(employeeId, key);
  }

  const counts: Record<string, number> = {};
  for (const [key, employees] of Object.entries(employeesByType)) counts[key] = employees.size;
  const settingCounts: Record<string, number> = {};
  const employeeIds = Array.from(typeByEmployee.keys());
  if (employeeIds.length > 0) {
    const { data: settings, error: settingsError } = await admin
      .from("employee_payroll_settings")
      .select("employee_id")
      .in("employee_id", employeeIds);
    if (settingsError) throw new Error(settingsError.message);
    for (const row of (settings ?? []) as Pick<SettingRow, "employee_id">[]) {
      const key = typeByEmployee.get(row.employee_id);
      if (!key) continue;
      settingCounts[key] = (settingCounts[key] ?? 0) + 1;
    }
  }
  return { keys: Object.keys(counts).sort(), counts, settingCounts };
}

export async function getPayrollEmployeeSettingTemplates(admin: Admin): Promise<PayrollEmployeeSettingTemplatesRecord> {
  const modules = await listPayrollModules(admin);
  const mod = pickTemplateStorageModule(modules);
  const source = pickTemplateSourceModule(modules, mod);
  const { keys, counts, settingCounts } = await currentContractStats(admin);
  if (!mod) {
    return {
      storageReady: false,
      storageReason: "ยังไม่พบ erp_modules ของ Payroll จึงใช้ template default ให้ดูก่อน",
      module: null,
      templates: normalizeEmployeeSettingTemplates(null, keys).map((t) => ({
        ...t,
        employeeCount: counts[t.key] ?? 0,
        existingSettingCount: settingCounts[t.key] ?? 0,
      })),
      updatedAt: null,
    };
  }

  const config = (source?.config ?? mod.config ?? {}) as Record<string, unknown>;
  const templates = normalizeEmployeeSettingTemplates(config[TEMPLATE_CONFIG_KEY], keys)
    .map((t) => ({
      ...t,
      employeeCount: counts[t.key] ?? 0,
      existingSettingCount: settingCounts[t.key] ?? 0,
    }));

  return {
    storageReady: true,
    storageReason: source && source.id !== mod.id
      ? `โหลดค่าล่าสุดจาก ${source.module_key} แล้วจะบันทึกกลับเข้าที่หลัก ${mod.module_key}`
      : `เก็บ template รายคนตามประเภทสัญญาไว้ใน ${mod.module_key}.config.${TEMPLATE_CONFIG_KEY}`,
    module: { id: mod.id, key: mod.module_key, label: mod.label ?? mod.module_key },
    templates,
    updatedAt: typeof config[TEMPLATE_UPDATED_AT_KEY] === "string"
      ? config[TEMPLATE_UPDATED_AT_KEY]
      : null,
  };
}

export async function updatePayrollEmployeeSettingTemplates(admin: Admin, input: unknown) {
  const modules = await listPayrollModules(admin);
  const mod = pickTemplateStorageModule(modules);
  const source = pickTemplateSourceModule(modules, mod);
  if (!mod) throw new Error("ยังไม่พบ erp_modules ของ Payroll จึงยังบันทึก template ไม่ได้");

  const { keys, counts, settingCounts } = await currentContractStats(admin);
  const storageConfig = (mod.config ?? {}) as Record<string, unknown>;
  const sourceConfig = (source?.config ?? storageConfig) as Record<string, unknown>;
  const previous = normalizeEmployeeSettingTemplates(sourceConfig[TEMPLATE_CONFIG_KEY], keys)
    .map((t) => ({
      ...t,
      employeeCount: counts[t.key] ?? 0,
      existingSettingCount: settingCounts[t.key] ?? 0,
    }));
  const templates = normalizeEmployeeSettingTemplates(input, keys)
    .map((t) => ({
      ...t,
      employeeCount: counts[t.key] ?? 0,
      existingSettingCount: settingCounts[t.key] ?? 0,
    }));
  const updatedAt = new Date().toISOString();
  const config = {
    ...storageConfig,
    [TEMPLATE_CONFIG_KEY]: templates,
    [TEMPLATE_UPDATED_AT_KEY]: updatedAt,
  };

  const { error } = await admin.from("erp_modules").update({ config }).eq("id", mod.id);
  if (error) throw new Error(error.message);

  return {
    module: { id: mod.id, key: mod.module_key, label: mod.label ?? mod.module_key },
    previous,
    templates,
    updatedAt,
  };
}

export async function applyPayrollEmployeeSettingTemplate(admin: Admin, templateKey: string): Promise<ApplyEmployeeSettingTemplateResult> {
  const record = await getPayrollEmployeeSettingTemplates(admin);
  const template = record.templates.find((t) => t.key === templateKey);
  if (!template) throw new Error("ไม่พบ template ที่เลือก");

  const { data: contractRows, error: contractError } = await admin
    .from("employee_contracts")
    .select("employee_id, contract_type")
    .eq("is_current", true)
    .eq("status", "active")
    .eq("contract_type", templateKey);
  if (contractError) throw new Error(contractError.message);

  const employeeIds = Array.from(new Set(((contractRows ?? []) as ContractRow[])
    .map((row) => String(row.employee_id ?? "").trim())
    .filter(Boolean)));
  if (employeeIds.length === 0) {
    return { templateKey, matchedEmployees: 0, created: 0, updated: 0 };
  }

  const { data: settingsRows, error: settingsError } = await admin
    .from("employee_payroll_settings")
    .select("id, employee_id")
    .in("employee_id", employeeIds);
  if (settingsError) throw new Error(settingsError.message);

  const existingByEmployee = new Map<string, string>();
  for (const row of (settingsRows ?? []) as SettingRow[]) {
    existingByEmployee.set(row.employee_id, row.id);
  }

  const patch = templateValuesToSettingsPatch(template.values);
  const rowsToInsert = employeeIds
    .filter((employeeId) => !existingByEmployee.has(employeeId))
    .map((employeeId) => ({ employee_id: employeeId, ...patch }));
  const rowsToUpdate = employeeIds.filter((employeeId) => existingByEmployee.has(employeeId));

  if (rowsToInsert.length > 0) {
    const { error } = await admin.from("employee_payroll_settings").insert(rowsToInsert);
    if (error) throw new Error(error.message);
  }

  for (const employeeId of rowsToUpdate) {
    const id = existingByEmployee.get(employeeId);
    if (!id) continue;
    const { error } = await admin.from("employee_payroll_settings").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  return {
    templateKey,
    matchedEmployees: employeeIds.length,
    created: rowsToInsert.length,
    updated: rowsToUpdate.length,
  };
}
