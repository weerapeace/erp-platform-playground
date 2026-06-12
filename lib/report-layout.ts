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
  showAuthorizedSignature: boolean;
  authorizedSignatureUrl: string;
  authorizedSignatureWidthMm: number;
  authorizedSignatureOffsetXMm: number;
  authorizedSignatureOffsetYMm: number;
  showCompanyStamp: boolean;
  companyStampUrl: string;
  companyStampWidthMm: number;
  companyStampOffsetXMm: number;
  companyStampOffsetYMm: number;
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
  showAuthorizedSignature: false,
  authorizedSignatureUrl: "",
  authorizedSignatureWidthMm: 38,
  authorizedSignatureOffsetXMm: 0,
  authorizedSignatureOffsetYMm: -2,
  showCompanyStamp: false,
  companyStampUrl: "",
  companyStampWidthMm: 28,
  companyStampOffsetXMm: 22,
  companyStampOffsetYMm: -8,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const safeAssetUrl = (value: unknown): string => {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return "";
  return url;
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
    showAuthorizedSignature: input.showAuthorizedSignature ?? DEFAULT_REPORT_LAYOUT.showAuthorizedSignature,
    authorizedSignatureUrl: safeAssetUrl(input.authorizedSignatureUrl),
    authorizedSignatureWidthMm: clamp(input.authorizedSignatureWidthMm, 10, 70, DEFAULT_REPORT_LAYOUT.authorizedSignatureWidthMm),
    authorizedSignatureOffsetXMm: clamp(input.authorizedSignatureOffsetXMm, -60, 60, DEFAULT_REPORT_LAYOUT.authorizedSignatureOffsetXMm),
    authorizedSignatureOffsetYMm: clamp(input.authorizedSignatureOffsetYMm, -40, 40, DEFAULT_REPORT_LAYOUT.authorizedSignatureOffsetYMm),
    showCompanyStamp: input.showCompanyStamp ?? DEFAULT_REPORT_LAYOUT.showCompanyStamp,
    companyStampUrl: safeAssetUrl(input.companyStampUrl),
    companyStampWidthMm: clamp(input.companyStampWidthMm, 10, 60, DEFAULT_REPORT_LAYOUT.companyStampWidthMm),
    companyStampOffsetXMm: clamp(input.companyStampOffsetXMm, -60, 60, DEFAULT_REPORT_LAYOUT.companyStampOffsetXMm),
    companyStampOffsetYMm: clamp(input.companyStampOffsetYMm, -40, 40, DEFAULT_REPORT_LAYOUT.companyStampOffsetYMm),
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
