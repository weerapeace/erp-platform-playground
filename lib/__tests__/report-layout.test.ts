import { describe, expect, it } from "vitest";

import {
  compactReportLayout,
  DEFAULT_REPORT_LAYOUT,
  normalizeReportLayout,
  prepareReportLayoutForSave,
  reportLayoutFromStoredValue,
} from "@/lib/report-layout";

describe("report layout settings", () => {
  it("keeps layout numbers inside printable ranges", () => {
    const layout = normalizeReportLayout({
      topMarginMm: -10,
      horizontalMarginMm: 40,
      bottomMarginMm: 99,
      fontSizePx: 2,
      rowHeightMm: 80,
      signatureGapMm: -5,
    });

    expect(layout.topMarginMm).toBe(0);
    expect(layout.horizontalMarginMm).toBe(25);
    expect(layout.bottomMarginMm).toBe(30);
    expect(layout.fontSizePx).toBe(8);
    expect(layout.rowHeightMm).toBe(36);
    expect(layout.signatureGapMm).toBe(0);
  });

  it("creates a compact layout that helps short documents fit one page", () => {
    const compact = compactReportLayout(DEFAULT_REPORT_LAYOUT);

    expect(compact.topMarginMm).toBeLessThan(DEFAULT_REPORT_LAYOUT.topMarginMm);
    expect(compact.fontSizePx).toBeLessThan(DEFAULT_REPORT_LAYOUT.fontSizePx);
    expect(compact.rowHeightMm).toBeLessThan(DEFAULT_REPORT_LAYOUT.rowHeightMm);
    expect(compact.signatureToBottom).toBe(true);
  });

  it("normalizes a stored report layout before using it", () => {
    const layout = reportLayoutFromStoredValue({
      topMarginMm: -20,
      horizontalMarginMm: 100,
      fontSizePx: "12",
      signatureToBottom: false,
      showSku: false,
    });

    expect(layout.topMarginMm).toBe(0);
    expect(layout.horizontalMarginMm).toBe(25);
    expect(layout.fontSizePx).toBe(12);
    expect(layout.signatureToBottom).toBe(false);
    expect(layout.showSku).toBe(false);
    expect(layout.showImage).toBe(DEFAULT_REPORT_LAYOUT.showImage);
  });

  it("prepares a clean layout payload for saving as the report default", () => {
    const payload = prepareReportLayoutForSave({
      ...DEFAULT_REPORT_LAYOUT,
      topMarginMm: 7.5,
      showImage: false,
    });

    expect(payload).toEqual({
      ...DEFAULT_REPORT_LAYOUT,
      topMarginMm: 7.5,
      showImage: false,
    });
  });

  it("normalizes signature and stamp assets before saving or printing", () => {
    const layout = normalizeReportLayout({
      showAuthorizedSignature: true,
      authorizedSignatureUrl: "javascript:alert(1)",
      authorizedSignatureWidthMm: 999,
      authorizedSignatureOffsetXMm: -999,
      authorizedSignatureOffsetYMm: 999,
      showCompanyStamp: true,
      companyStampUrl: "data:image/png;base64,abc123",
      companyStampWidthMm: 1,
      companyStampOffsetXMm: 999,
      companyStampOffsetYMm: -999,
    });

    expect(layout.showAuthorizedSignature).toBe(true);
    expect(layout.authorizedSignatureUrl).toBe("");
    expect(layout.authorizedSignatureWidthMm).toBe(70);
    expect(layout.authorizedSignatureOffsetXMm).toBe(-60);
    expect(layout.authorizedSignatureOffsetYMm).toBe(40);
    expect(layout.showCompanyStamp).toBe(true);
    expect(layout.companyStampUrl).toBe("data:image/png;base64,abc123");
    expect(layout.companyStampWidthMm).toBe(10);
    expect(layout.companyStampOffsetXMm).toBe(60);
    expect(layout.companyStampOffsetYMm).toBe(-40);
  });
});
