export type PayrollGlobalRules = {
  workingDaysPerMonth: number;
  hoursPerDay: number;
  lateDeductionUnit: "minute" | "hour";
  lateRoundingMinutes: number;
  absenceFullDayHours: number;
  absenceHalfDayHours: number;
  paidSickLeaveWithMedicalCertificate: boolean;
  deductSickLeaveWithoutMedicalCertificate: boolean;
  requireMedicalCertificateForPaidSickLeave: boolean;
  overtimeWeekdayMultiplier: number;
  overtimeHolidayMultiplier: number;
  socialSecurityEnabled: boolean;
  socialSecurityEmployeeRate: number;
  socialSecurityMaxWage: number;
  withholdingTaxEnabled: boolean;
};

export const DEFAULT_PAYROLL_GLOBAL_RULES: PayrollGlobalRules = {
  workingDaysPerMonth: 26,
  hoursPerDay: 8,
  lateDeductionUnit: "minute",
  lateRoundingMinutes: 1,
  absenceFullDayHours: 8,
  absenceHalfDayHours: 4,
  paidSickLeaveWithMedicalCertificate: true,
  deductSickLeaveWithoutMedicalCertificate: true,
  requireMedicalCertificateForPaidSickLeave: true,
  overtimeWeekdayMultiplier: 1.5,
  overtimeHolidayMultiplier: 2,
  socialSecurityEnabled: true,
  socialSecurityEmployeeRate: 5,
  socialSecurityMaxWage: 15000,
  withholdingTaxEnabled: false,
};

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizePayrollGlobalRules(value: unknown): PayrollGlobalRules {
  const src = (value ?? {}) as Partial<PayrollGlobalRules>;
  const defaults = DEFAULT_PAYROLL_GLOBAL_RULES;
  return {
    workingDaysPerMonth: numberInRange(src.workingDaysPerMonth, defaults.workingDaysPerMonth, 1, 31),
    hoursPerDay: numberInRange(src.hoursPerDay, defaults.hoursPerDay, 1, 24),
    lateDeductionUnit: src.lateDeductionUnit === "hour" ? "hour" : "minute",
    lateRoundingMinutes: numberInRange(src.lateRoundingMinutes, defaults.lateRoundingMinutes, 1, 60),
    absenceFullDayHours: numberInRange(src.absenceFullDayHours, defaults.absenceFullDayHours, 1, 24),
    absenceHalfDayHours: numberInRange(src.absenceHalfDayHours, defaults.absenceHalfDayHours, 0.5, 24),
    paidSickLeaveWithMedicalCertificate: boolValue(src.paidSickLeaveWithMedicalCertificate, defaults.paidSickLeaveWithMedicalCertificate),
    deductSickLeaveWithoutMedicalCertificate: boolValue(src.deductSickLeaveWithoutMedicalCertificate, defaults.deductSickLeaveWithoutMedicalCertificate),
    requireMedicalCertificateForPaidSickLeave: boolValue(src.requireMedicalCertificateForPaidSickLeave, defaults.requireMedicalCertificateForPaidSickLeave),
    overtimeWeekdayMultiplier: numberInRange(src.overtimeWeekdayMultiplier, defaults.overtimeWeekdayMultiplier, 0, 5),
    overtimeHolidayMultiplier: numberInRange(src.overtimeHolidayMultiplier, defaults.overtimeHolidayMultiplier, 0, 5),
    socialSecurityEnabled: boolValue(src.socialSecurityEnabled, defaults.socialSecurityEnabled),
    socialSecurityEmployeeRate: numberInRange(src.socialSecurityEmployeeRate, defaults.socialSecurityEmployeeRate, 0, 15),
    socialSecurityMaxWage: numberInRange(src.socialSecurityMaxWage, defaults.socialSecurityMaxWage, 0, 100000),
    withholdingTaxEnabled: boolValue(src.withholdingTaxEnabled, defaults.withholdingTaxEnabled),
  };
}

