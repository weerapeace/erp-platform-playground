import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePayrollGlobalRules, type PayrollGlobalRules } from "@/lib/payroll-global-rules";

type Admin = ReturnType<typeof supabaseAdmin>;

type PayrollModuleRow = {
  id: string;
  module_key: string;
  label: string | null;
  config: Record<string, unknown> | null;
};

export type PayrollGlobalRulesRecord = {
  storageReady: boolean;
  storageReason: string;
  module: { id: string; key: string; label: string } | null;
  rules: PayrollGlobalRules;
  updatedAt: string | null;
};

async function findPayrollModule(admin: Admin): Promise<PayrollModuleRow | null> {
  const primary = await admin
    .from("erp_modules")
    .select("id, module_key, label, config")
    .or("module_key.eq.payroll,table_name.eq.payroll")
    .limit(1);
  if (!primary.error && primary.data?.[0]) return primary.data[0] as PayrollModuleRow;

  const fallback = await admin
    .from("erp_modules")
    .select("id, module_key, label, config")
    .ilike("module_key", "%payroll%")
    .limit(1);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data?.[0] as PayrollModuleRow | undefined) ?? null;
}

export async function getPayrollGlobalRules(admin: Admin): Promise<PayrollGlobalRulesRecord> {
  const mod = await findPayrollModule(admin);
  if (!mod) {
    return {
      storageReady: false,
      storageReason: "ยังไม่พบ erp_modules ของ Payroll จึงใช้ค่า default ให้ดูก่อน",
      module: null,
      rules: normalizePayrollGlobalRules(null),
      updatedAt: null,
    };
  }

  const config = (mod.config ?? {}) as Record<string, unknown>;
  return {
    storageReady: true,
    storageReason: "เก็บกฎกลางไว้ใน erp_modules.config.payroll_rules",
    module: { id: mod.id, key: mod.module_key, label: mod.label ?? mod.module_key },
    rules: normalizePayrollGlobalRules(config.payroll_rules),
    updatedAt: typeof config.payroll_rules_updated_at === "string" ? config.payroll_rules_updated_at : null,
  };
}

export async function updatePayrollGlobalRules(admin: Admin, rulesInput: unknown) {
  const mod = await findPayrollModule(admin);
  if (!mod) throw new Error("ยังไม่พบ erp_modules ของ Payroll จึงยังบันทึกกฎกลางไม่ได้");

  const currentConfig = (mod.config ?? {}) as Record<string, unknown>;
  const previous = normalizePayrollGlobalRules(currentConfig.payroll_rules);
  const next = normalizePayrollGlobalRules(rulesInput);
  const updatedAt = new Date().toISOString();
  const config = { ...currentConfig, payroll_rules: next, payroll_rules_updated_at: updatedAt };

  const { error } = await admin.from("erp_modules").update({ config }).eq("id", mod.id);
  if (error) throw new Error(error.message);

  return {
    module: { id: mod.id, key: mod.module_key, label: mod.label ?? mod.module_key },
    previous,
    rules: next,
    updatedAt,
  };
}

