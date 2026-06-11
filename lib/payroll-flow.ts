export function buildPayrollCalcRunHref(periodId: string, options?: { autoRun?: boolean }): string {
  const params = new URLSearchParams();
  if (periodId) params.set("period_id", periodId);
  if (options?.autoRun) params.set("auto_run", "1");
  const query = params.toString();
  return query ? `/payroll/calc-run?${query}` : "/payroll/calc-run";
}

export function shouldAutoRunPayrollCalc(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("auto_run") === "1";
}
