export type ReportLayoutSettings = {
  topMarginMm: number;
  horizontalMarginMm: number;
  bottomMarginMm: number;
  fontSizePx: number;
  rowHeightMm: number;
  signatureGapMm: number;
  signatureToBottom: boolean;
  showSku: boolean;
  showImage: boolean;
  showPhone: boolean;
  showResponsible: boolean;
  showNote: boolean;
};

export const DEFAULT_REPORT_LAYOUT: ReportLayoutSettings = {
  topMarginMm: 13,
  horizontalMarginMm: 12,
  bottomMarginMm: 11,
  fontSizePx: 11,
  rowHeightMm: 24,
  signatureGapMm: 22,
  signatureToBottom: true,
  showSku: true,
  showImage: true,
  showPhone: true,
  showResponsible: true,
  showNote: true,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

export function normalizeReportLayout(input: Partial<ReportLayoutSettings> = {}): ReportLayoutSettings {
  return {
    topMarginMm: clamp(input.topMarginMm, 0, 30, DEFAULT_REPORT_LAYOUT.topMarginMm),
    horizontalMarginMm: clamp(input.horizontalMarginMm, 6, 25, DEFAULT_REPORT_LAYOUT.horizontalMarginMm),
    bottomMarginMm: clamp(input.bottomMarginMm, 0, 30, DEFAULT_REPORT_LAYOUT.bottomMarginMm),
    fontSizePx: clamp(input.fontSizePx, 8, 14, DEFAULT_REPORT_LAYOUT.fontSizePx),
    rowHeightMm: clamp(input.rowHeightMm, 10, 36, DEFAULT_REPORT_LAYOUT.rowHeightMm),
    signatureGapMm: clamp(input.signatureGapMm, 0, 45, DEFAULT_REPORT_LAYOUT.signatureGapMm),
    signatureToBottom: input.signatureToBottom ?? DEFAULT_REPORT_LAYOUT.signatureToBottom,
    showSku: input.showSku ?? DEFAULT_REPORT_LAYOUT.showSku,
    showImage: input.showImage ?? DEFAULT_REPORT_LAYOUT.showImage,
    showPhone: input.showPhone ?? DEFAULT_REPORT_LAYOUT.showPhone,
    showResponsible: input.showResponsible ?? DEFAULT_REPORT_LAYOUT.showResponsible,
    showNote: input.showNote ?? DEFAULT_REPORT_LAYOUT.showNote,
  };
}

export function compactReportLayout(input: Partial<ReportLayoutSettings> = DEFAULT_REPORT_LAYOUT): ReportLayoutSettings {
  const current = normalizeReportLayout(input);
  return normalizeReportLayout({
    ...current,
    topMarginMm: Math.min(current.topMarginMm, 8),
    horizontalMarginMm: Math.min(current.horizontalMarginMm, 10),
    bottomMarginMm: Math.min(current.bottomMarginMm, 8),
    fontSizePx: Math.min(current.fontSizePx, 10),
    rowHeightMm: Math.min(current.rowHeightMm, 18),
    signatureGapMm: Math.min(current.signatureGapMm, 10),
    signatureToBottom: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function reportLayoutFromStoredValue(value: unknown): ReportLayoutSettings {
  if (!isRecord(value)) return DEFAULT_REPORT_LAYOUT;
  return normalizeReportLayout(value as Partial<ReportLayoutSettings>);
}

export function prepareReportLayoutForSave(value: Partial<ReportLayoutSettings>): ReportLayoutSettings {
  return normalizeReportLayout(value);
}
