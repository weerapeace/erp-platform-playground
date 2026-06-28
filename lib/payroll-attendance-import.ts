import { isPayrollContractor } from "@/lib/payroll-attendance-rules";

export type AttendanceRuleConfig = {
  morningCheckInCutoff: string;
  noonCheckInCutoff: string;
  checkoutRequiredAt: string;
  morningWorkStart: string;
  morningWorkEnd: string;
  afternoonWorkStart: string;
  afternoonWorkEnd: string;
  noonScanWindowStart: string;
  noonScanWindowEnd: string;
  finalCheckoutWindowStart: string;
  earlyCheckoutGraceMinutes: number;
};

export type AttendanceImportEmployee = {
  id?: string;
  employee_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  scanner_employee_code?: string | null;
};

export type AttendanceImportContract = {
  status?: string | null;
  contract_type?: string | null;
  employment_type?: string | null;
  wage_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  work_schedule_id?: string | null;
  attendance_scan_exempt?: boolean | null;
  morning_check_in_cutoff?: string | null;
  noon_check_in_cutoff?: string | null;
  checkout_required_at?: string | null;
  early_checkout_grace_minutes?: number | string | null;
  work_time_profile?: AttendanceWorkTimeProfile | null;
  work_time_profiles?: AttendanceWorkTimeProfile | null;
};

export type AttendanceWorkTimeProfile = {
  morning_check_in_cutoff?: string | null;
  noon_check_in_cutoff?: string | null;
  checkout_required_at?: string | null;
  early_checkout_grace_minutes?: number | string | null;
};

export type AttendanceParsedRow = {
  rowKey?: string;
  sourceType?: string;
  scannerCode: string;
  scannerName?: string;   // ชื่อพนักงานตามที่เครื่องสแกนบันทึก (ถ้าไฟล์มีคอลัมน์ชื่อ) — ช่วยจับคู่ตอนยังไม่ผูก
  date: string;
  rawScans: string[];
  sourceLine?: string;
  sourceLines?: string[];
};

export type AttendanceDayResult = {
  morningIn?: string;
  noonIn?: string;
  finalOut?: string;
  rawScans: string[];
  ignoredScans: string[];
  flags: string[];
  absent: boolean;
  abnormal: boolean;
  earlyOutMinutes: number;
  importStatus: "ready" | "needs_review" | "skipped";
  lateMorningMinutes: number;
  lateNoonMinutes: number;
  totalLateMinutes: number;
};

export type AttendanceImportStatus = "ready" | "needs_review" | "unmapped" | "blocked" | "skipped";

export type AttendancePreviewRow = AttendanceParsedRow & {
  rowKey: string;
  sourceType: string;
  employee: AttendanceImportEmployee | null;
  contract: AttendanceImportContract;
  ruleConfig: AttendanceRuleConfig;
  periodId: string;
  scheduleStatus: string;
  result: Omit<AttendanceDayResult, "importStatus"> & { importStatus: AttendanceImportStatus };
  importStatus: AttendanceImportStatus;
  readyToCommit: boolean;
  sourceLines: string[];
};

export type AttendanceImportPreview = {
  rows: AttendancePreviewRow[];
  summary: {
    total: number;
    ready: number;
    needsReview: number;
    unmapped: number;
    blocked: number;
    skipped: number;
  };
};

export type AttendanceManualPayload = {
  employee_id: string;
  work_date: string;
  status: "draft" | "approved";
  note: string;
  entry_type: "absence" | "late" | "early_leave";
  absence_hours: number;
  minutes: number;
  late_minutes: number;
};

export const defaultAttendanceRuleConfig: AttendanceRuleConfig = {
  morningCheckInCutoff: "07:50",
  noonCheckInCutoff: "12:50",
  checkoutRequiredAt: "17:00",
  morningWorkStart: "08:00",
  morningWorkEnd: "12:00",
  afternoonWorkStart: "13:00",
  afternoonWorkEnd: "17:00",
  noonScanWindowStart: "12:01",
  noonScanWindowEnd: "13:10",
  finalCheckoutWindowStart: "13:30",
  earlyCheckoutGraceMinutes: 5,
};

export function normalizeScannerEmployeeCode(value: unknown): string {
  return String(value ?? "").trim();
}

export function isContractActiveOnDate(contract: AttendanceImportContract = {}, isoDate = ""): boolean {
  if (!contract || !isoDate) return true;
  if (["ended", "inactive", "cancelled"].includes(String(contract.status || ""))) return false;
  if (contract.start_date && isoDate < contract.start_date) return false;
  if (contract.end_date && isoDate > contract.end_date) return false;
  return true;
}

export function minutesFromTime(value: unknown): number | null {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function timeFromMinutes(value: number): string {
  if (!Number.isFinite(value)) return "";
  const minutes = Math.max(0, Math.round(value));
  const hoursPart = Math.floor(minutes / 60);
  const minutePart = minutes % 60;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}`;
}

export function attendanceRuleConfigFromContract(
  contract: AttendanceImportContract = {},
  fallbackConfig = defaultAttendanceRuleConfig,
): AttendanceRuleConfig {
  const profile = contract.work_time_profiles || contract.work_time_profile || {};
  const morningCheckInCutoff = profile.morning_check_in_cutoff || contract.morning_check_in_cutoff || fallbackConfig.morningCheckInCutoff;
  const noonCheckInCutoff = profile.noon_check_in_cutoff || contract.noon_check_in_cutoff || fallbackConfig.noonCheckInCutoff;
  const checkoutRequiredAt = profile.checkout_required_at || contract.checkout_required_at || fallbackConfig.checkoutRequiredAt;
  const noonCutoffMinutes = minutesFromTime(noonCheckInCutoff);
  const noonEnd = noonCutoffMinutes === null
    ? fallbackConfig.noonScanWindowEnd
    : timeFromMinutes(Math.max(noonCutoffMinutes + 20, minutesFromTime(fallbackConfig.noonScanWindowEnd) || 0));
  return {
    ...fallbackConfig,
    morningCheckInCutoff,
    noonCheckInCutoff,
    checkoutRequiredAt,
    noonScanWindowEnd: noonEnd,
    earlyCheckoutGraceMinutes: Number(profile.early_checkout_grace_minutes ?? contract.early_checkout_grace_minutes ?? fallbackConfig.earlyCheckoutGraceMinutes ?? 0),
  };
}

function uniqueFlags(flags: string[]): string[] {
  return [...new Set(flags.filter(Boolean))];
}

export function normalizeScanTimes(scans: unknown[] = []): string[] {
  return scans
    .map((scan) => String(scan || "").trim())
    .filter(Boolean)
    .map((scan) => ({ scan, minutes: minutesFromTime(scan) }))
    .filter((item): item is { scan: string; minutes: number } => item.minutes !== null)
    .sort((left, right) => left.minutes - right.minutes)
    .map((item) => item.scan);
}

export function classifyScans(scans: unknown[] = [], config = defaultAttendanceRuleConfig) {
  const rawScans = normalizeScanTimes(scans);
  const flags: string[] = [];
  const minutes = rawScans.map((scan) => ({ scan, minutes: minutesFromTime(scan) as number }));
  const noonStart = minutesFromTime(config.noonScanWindowStart) as number;
  const noonEnd = minutesFromTime(config.noonScanWindowEnd) as number;
  const finalStart = minutesFromTime(config.finalCheckoutWindowStart) as number;
  const morningEnd = minutesFromTime(config.morningWorkEnd) as number;

  const morningScans = minutes.filter((item) => item.minutes < morningEnd);
  const noonScans = minutes.filter((item) => item.minutes >= noonStart && item.minutes <= noonEnd);
  const finalScans = minutes.filter((item) => item.minutes >= finalStart);

  const morningIn = morningScans[0]?.scan;
  const noonIn = noonScans[0]?.scan;
  const finalOut = finalScans[finalScans.length - 1]?.scan;
  const used = new Set([morningIn, noonIn, finalOut].filter(Boolean));
  const ignoredScans = rawScans.filter((scan) => !used.has(scan));

  if (morningScans.length > 1) flags.push("multiple_morning_scans");
  if (noonScans.length > 1) flags.push("multiple_noon_scans");
  if (finalScans.length > 1) flags.push("multiple_final_scans");

  return { morningIn, noonIn, finalOut, rawScans, ignoredScans, flags: uniqueFlags(flags) };
}

export function calculateAttendanceDay(
  input: { rawScans?: unknown[]; scheduleStatus?: string } = {},
  config = defaultAttendanceRuleConfig,
): AttendanceDayResult {
  const scheduleStatus = input.scheduleStatus || "workday";
  const scans = classifyScans(input.rawScans || [], config);
  const flags = [...scans.flags];
  const isHoliday = ["holiday", "paid_holiday", "day_off", "off", "scanner_exempt", "outside_contract", "piecework_contract"].includes(scheduleStatus);

  if (isHoliday) {
    return {
      ...scans,
      absent: false,
      abnormal: false,
      earlyOutMinutes: 0,
      importStatus: "skipped",
      lateMorningMinutes: 0,
      lateNoonMinutes: 0,
      totalLateMinutes: 0,
      flags: uniqueFlags([...flags,
        scheduleStatus === "scanner_exempt" ? "attendance_scan_exempt" : "",
        scheduleStatus === "outside_contract" ? "outside_contract_period" : "",
        scheduleStatus === "piecework_contract" ? "piecework_contract_skipped" : "",
        !["scanner_exempt", "outside_contract", "piecework_contract"].includes(scheduleStatus) ? "holiday_skipped" : "",
      ]),
    };
  }

  if (!scans.rawScans.length) {
    return {
      ...scans,
      absent: true,
      abnormal: true,
      earlyOutMinutes: 0,
      importStatus: "needs_review",
      lateMorningMinutes: 0,
      lateNoonMinutes: 0,
      totalLateMinutes: 0,
      flags: uniqueFlags([...flags, "no_scans_on_workday", "absent", "manual_review_required"]),
    };
  }

  const morningCutoff = minutesFromTime(config.morningCheckInCutoff) as number;
  const noonCutoff = minutesFromTime(config.noonCheckInCutoff) as number;
  const checkoutRequired = minutesFromTime(config.checkoutRequiredAt) as number;
  const morningEnd = minutesFromTime(config.morningWorkEnd) as number;
  const afternoonStart = minutesFromTime(config.afternoonWorkStart) as number;
  const afternoonEnd = minutesFromTime(config.afternoonWorkEnd) as number;
  const noonStart = minutesFromTime(config.noonScanWindowStart) as number;
  const finalStart = minutesFromTime(config.finalCheckoutWindowStart) as number;

  const morningInMinutes = minutesFromTime(scans.morningIn);
  const noonInMinutes = minutesFromTime(scans.noonIn);
  const finalOutMinutes = minutesFromTime(scans.finalOut);
  const rawMinutes = scans.rawScans.map(minutesFromTime).filter((value): value is number => value !== null);
  const lastScan = rawMinutes[rawMinutes.length - 1];

  const lateMorningMinutes = morningInMinutes === null ? 0 : Math.max(0, morningInMinutes - morningCutoff);
  const lateNoonMinutes = noonInMinutes === null ? 0 : Math.max(0, noonInMinutes - noonCutoff);
  let earlyOutMinutes = finalOutMinutes === null ? 0 : Math.max(0, checkoutRequired - finalOutMinutes);
  if (earlyOutMinutes > 0 && earlyOutMinutes <= Number(config.earlyCheckoutGraceMinutes || 0)) earlyOutMinutes = 0;

  if (lastScan !== undefined && lastScan < morningEnd) {
    earlyOutMinutes = (morningEnd - lastScan) + (afternoonEnd - afternoonStart);
    flags.push("left_before_lunch", "early_checkout", "manual_review_required");
  } else if (finalOutMinutes === null && lastScan >= noonStart && lastScan < finalStart) {
    flags.push("ambiguous_noon_or_early_checkout", "manual_review_required");
  } else if (earlyOutMinutes > 0) {
    flags.push("early_checkout");
  }

  if (!scans.morningIn) flags.push("missing_morning_scan", "manual_review_required");
  if (!scans.noonIn) flags.push("missing_noon_scan", "manual_review_required");
  if (!scans.finalOut) flags.push("missing_final_checkout", "manual_review_required");
  if (lateMorningMinutes > 0) flags.push("late_morning");
  if (lateNoonMinutes > 0) flags.push("late_noon");

  const abnormal = flags.includes("manual_review_required");
  return {
    ...scans,
    absent: false,
    abnormal,
    earlyOutMinutes,
    importStatus: abnormal ? "needs_review" : "ready",
    lateMorningMinutes,
    lateNoonMinutes,
    totalLateMinutes: lateMorningMinutes + lateNoonMinutes,
    flags: uniqueFlags(flags),
  };
}

export function normalizeImportDate(value: unknown): string {
  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return "";
  const [, day, month, rawYear] = slashMatch;
  const yearNumber = Number(rawYear);
  const year = yearNumber > 2400 ? yearNumber - 543 : yearNumber;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitDelimitedLine(line: string): string[] | null {
  if (line.includes(",")) return line.split(",").map((item) => item.trim());
  if (line.includes("\t")) return line.split("\t").map((item) => item.trim());
  if (line.includes(";")) return line.split(";").map((item) => item.trim());
  return null;
}

function normalizeHeaderKey(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseDelimitedAttendanceLine(line: string, headers: string[] = []): AttendanceParsedRow | null {
  const cells = splitDelimitedLine(line);
  if (!cells) return null;
  const headerMap = new Map(headers.map((header, index) => [normalizeHeaderKey(header), index]));
  const getByHeader = (...keys: string[]) => {
    for (const key of keys) {
      if (headerMap.has(key)) return cells[headerMap.get(key) as number] || "";
    }
    return "";
  };
  const scannerCode = getByHeader("scanner_employee_code", "scanner_code", "employee_code", "code", "id") || cells[0] || "";
  const date = getByHeader("date", "work_date", "scan_date") || cells[1] || "";
  const scannerName = getByHeader("name", "employee_name", "full_name", "scanner_name", "user_name", "username", "ชื่อ", "ชื่อพนักงาน");
  const scanText = getByHeader("raw_scans", "scans", "scan_times", "times") || cells.slice(2).join(" ");
  const rawScans = scanText.match(/\b\d{1,2}:\d{2}\b/g) || [];
  return { scannerCode: normalizeScannerEmployeeCode(scannerCode), scannerName: String(scannerName || "").trim() || undefined, date: normalizeImportDate(date), rawScans, sourceLine: line };
}

function extractTrailingScannerTimes(text: string): string[] {
  const matches = [...String(text || "").matchAll(/\b\d{1,2}:\d{2}\b/g)];
  if (!matches.length) return [];
  const groups: string[][] = [];
  let current: string[] = [];
  let lastEnd = -1;
  for (const match of matches) {
    const gap = lastEnd === -1 ? "" : text.slice(lastEnd, match.index);
    if (current.length && (gap.trim() || gap.length > 18)) {
      groups.push(current);
      current = [];
    }
    current.push(match[0]);
    lastEnd = (match.index ?? 0) + match[0].length;
  }
  if (current.length) groups.push(current);
  const usefulGroups = groups.filter((group) => group.length && group.length <= 8);
  return usefulGroups[usefulGroups.length - 1] || [];
}

function parseScannerSummaryLine(line: string): AttendanceParsedRow | null {
  const dateMatch = line.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\b/);
  if (!dateMatch) return null;
  const beforeDate = line.slice(0, dateMatch.index).trim();
  const scannerCode = normalizeScannerEmployeeCode((beforeDate.match(/^\s*([A-Za-z0-9_-]+)/) || [])[1] || "");
  if (!scannerCode) return null;
  const afterDate = line.slice((dateMatch.index ?? 0) + dateMatch[0].length);
  return { scannerCode, date: normalizeImportDate(dateMatch[0]), rawScans: extractTrailingScannerTimes(afterDate), sourceLine: line };
}

function parseLooseAttendanceLine(line: string): AttendanceParsedRow | null {
  const scannerSummary = parseScannerSummaryLine(line);
  if (scannerSummary) return scannerSummary;
  const rawScans = line.match(/\b\d{1,2}:\d{2}\b/g) || [];
  const dateMatch = line.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})\b/);
  if (!dateMatch) return null;
  const beforeDate = line.slice(0, dateMatch.index).trim();
  const scannerCode = normalizeScannerEmployeeCode((beforeDate.match(/[A-Za-z0-9_-]+/) || [])[0] || "");
  return { scannerCode, date: normalizeImportDate(dateMatch[0]), rawScans, sourceLine: line };
}

export function parseAttendanceImportText(text = ""): AttendanceParsedRow[] {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  let headers: string[] = [];
  const rows: AttendanceParsedRow[] = [];
  for (const line of lines) {
    const cells = splitDelimitedLine(line);
    if (!cells && /Clock-in\/out|SumWorkTime|เวลาเข้า|เวลาออก/.test(line)) continue;
    const maybeHeader = cells && cells.some((cell) => /scanner|employee|date|scan|time|code/i.test(cell)) && !line.match(/\b\d{1,2}:\d{2}\b/);
    if (maybeHeader) {
      headers = cells;
      continue;
    }
    const parsed = (cells ? parseDelimitedAttendanceLine(line, headers) : null) || parseLooseAttendanceLine(line);
    if (parsed?.scannerCode && parsed.date) rows.push(parsed);
  }
  const byKey = new Map<string, AttendanceParsedRow & { sourceLines: string[] }>();
  for (const row of rows) {
    const key = `${row.scannerCode}::${row.date}`;
    const current = byKey.get(key) || { ...row, rawScans: [], sourceLines: [] };
    current.rawScans = normalizeScanTimes([...current.rawScans, ...row.rawScans]);
    current.sourceLines = [...(current.sourceLines || []), row.sourceLine].filter(Boolean) as string[];
    byKey.set(key, current);
  }
  return [...byKey.values()].sort((left, right) => left.date.localeCompare(right.date) || left.scannerCode.localeCompare(right.scannerCode));
}

export function buildAttendanceImportPreview({
  activePeriod = {},
  employees = [],
  contractForEmployee = () => ({}),
  scheduleStatusFor = () => "workday",
  text = "",
}: {
  activePeriod?: { id?: string; default_hours_per_day?: number | null };
  employees?: AttendanceImportEmployee[];
  contractForEmployee?: (employee: AttendanceImportEmployee) => AttendanceImportContract;
  scheduleStatusFor?: (date: string, contract: AttendanceImportContract) => string;
  text?: string;
} = {}): AttendanceImportPreview {
  const parsedRows = parseAttendanceImportText(text);
  const employeeMatches = new Map<string, AttendanceImportEmployee[]>();
  for (const employee of employees) {
    const scannerCode = normalizeScannerEmployeeCode(employee.scanner_employee_code);
    if (!scannerCode) continue;
    const current = employeeMatches.get(scannerCode) || [];
    current.push(employee);
    employeeMatches.set(scannerCode, current);
  }
  const importedDates = [...new Set(parsedRows.map((row) => row.date).filter(Boolean))];
  const parsedKeys = new Set(parsedRows.map((row) => `${row.scannerCode}::${row.date}`));
  const missingScanRows: AttendanceParsedRow[] = importedDates.flatMap((date) => employees.flatMap((employee) => {
    const scannerCode = normalizeScannerEmployeeCode(employee.scanner_employee_code);
    if (!scannerCode || parsedKeys.has(`${scannerCode}::${date}`)) return [];
    const contract = contractForEmployee(employee) || {};
    if (isPayrollContractor(contract) || contract.attendance_scan_exempt || !isContractActiveOnDate(contract, date)) return [];
    if (scheduleStatusFor(date, contract) !== "workday") return [];
    return [{
      rowKey: `absence::${employee.id || scannerCode}::${date}`,
      sourceType: "missing_scan_absence",
      scannerCode,
      date,
      rawScans: [],
      sourceLine: `${scannerCode},${date},missing_scan`,
    }];
  }));

  const rows: AttendancePreviewRow[] = [...parsedRows, ...missingScanRows].map((row) => {
    const matches = employeeMatches.get(row.scannerCode) || [];
    const employee = matches.length === 1 ? matches[0] : null;
    const contract = employee ? contractForEmployee(employee) : {};
    const contractorSkipped = Boolean(employee && isPayrollContractor(contract));
    const scannerSkipped = Boolean(employee && (contractorSkipped || contract.attendance_scan_exempt || !isContractActiveOnDate(contract, row.date)));
    const scheduleStatus = scannerSkipped
      ? contractorSkipped ? "piecework_contract" : contract.attendance_scan_exempt ? "scanner_exempt" : "outside_contract"
      : employee ? scheduleStatusFor(row.date, contract) : "workday";
    const ruleConfig = attendanceRuleConfigFromContract(contract);
    const result = calculateAttendanceDay({ rawScans: row.rawScans, scheduleStatus }, ruleConfig);
    const flags = [
      ...result.flags,
      contractorSkipped ? "piecework_contract_skipped" : "",
      scannerSkipped && contract.attendance_scan_exempt ? "attendance_scan_exempt" : "",
      scannerSkipped && !contract.attendance_scan_exempt && !contractorSkipped ? "outside_contract_period" : "",
      !matches.length ? "unmapped_scanner_employee_code" : "",
      matches.length > 1 ? "duplicate_scanner_employee_code" : "",
    ];
    const blocked = !employee || matches.length !== 1 || result.importStatus === "skipped";
    const importStatus: AttendanceImportStatus = matches.length > 1 ? "blocked" : !employee ? "unmapped" : result.importStatus;
    return {
      ...row,
      rowKey: row.rowKey || `scan::${row.scannerCode}::${row.date}`,
      sourceType: row.sourceType || "scan",
      employee,
      contract,
      ruleConfig,
      periodId: activePeriod?.id || "",
      scheduleStatus,
      result: { ...result, flags: uniqueFlags(flags), importStatus },
      importStatus,
      readyToCommit: !blocked && result.importStatus === "ready",
      sourceLines: row.sourceLines || ([row.sourceLine].filter(Boolean) as string[]),
    };
  });
  const summary = rows.reduce((total, row) => ({
    total: total.total + 1,
    ready: total.ready + (row.importStatus === "ready" ? 1 : 0),
    needsReview: total.needsReview + (row.importStatus === "needs_review" ? 1 : 0),
    unmapped: total.unmapped + (row.importStatus === "unmapped" ? 1 : 0),
    blocked: total.blocked + (row.importStatus === "blocked" ? 1 : 0),
    skipped: total.skipped + (row.result.importStatus === "skipped" ? 1 : 0),
  }), { total: 0, ready: 0, needsReview: 0, unmapped: 0, blocked: 0, skipped: 0 });
  return { rows, summary };
}

export function buildAttendanceManualEntryPayloads(
  previewRow: Partial<AttendancePreviewRow> = {},
  activePeriod: { default_hours_per_day?: number | null } = {},
): AttendanceManualPayload[] {
  if (!previewRow.employee?.id || !previewRow.date || !previewRow.result || previewRow.result.importStatus === "skipped") return [];
  const result = previewRow.result;
  const notes = [
    "Imported from attendance scanner preview",
    `scanner=${previewRow.scannerCode || "-"}`,
    `raw=${(result.rawScans || []).join(" ") || "-"}`,
  ].join(" | ");
  const common = {
    employee_id: previewRow.employee.id,
    work_date: previewRow.date,
    status: result.abnormal ? "draft" as const : "approved" as const,
    note: notes,
  };
  const payloads: AttendanceManualPayload[] = [];
  if (result.absent) {
    payloads.push({ ...common, entry_type: "absence", absence_hours: activePeriod?.default_hours_per_day || 8, minutes: 0, late_minutes: 0 });
  }
  if (result.totalLateMinutes > 0) {
    payloads.push({ ...common, entry_type: "late", minutes: result.totalLateMinutes, late_minutes: result.totalLateMinutes, absence_hours: 0 });
  }
  if (result.earlyOutMinutes > 0) {
    payloads.push({ ...common, entry_type: "early_leave", minutes: result.earlyOutMinutes, late_minutes: 0, absence_hours: 0 });
  }
  return payloads;
}
