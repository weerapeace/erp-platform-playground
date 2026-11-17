import { describe, expect, it } from "vitest";
import { DEVICE_PREVIEW_ZOOMS, autoZoom, devicePreviewDims, parseDevicePreviewPrefs } from "@/lib/device-preview";

describe("device-preview (หน้าต่างลอย iPhone/iPad)", () => {
  it("หมุนแนวนอน = สลับกว้าง/สูง", () => {
    expect(devicePreviewDims("iphone", false)).toEqual({ w: 390, h: 844 });
    expect(devicePreviewDims("ipad", true)).toEqual({ w: 1180, h: 820 });
  });
  it("ยังไม่เลือกขนาด = เลือกใหญ่สุดที่พอดีจอ · ไม่พอเลย = 50%", () => {
    expect(autoZoom(844, 1080)).toBe(1);
    expect(autoZoom(1180, 1080)).toBe(0.75);
    expect(autoZoom(1180, 700)).toBe(0.5);
    expect(autoZoom(5000, 700)).toBe(DEVICE_PREVIEW_ZOOMS[0]);
  });
  it("ค่าที่จำไว้เพี้ยน = ค่าเริ่ม (iPhone แนวตั้ง ขนาดอัตโนมัติ)", () => {
    expect(parseDevicePreviewPrefs(null)).toEqual({ device: "iphone", landscape: false, zoom: null });
    expect(parseDevicePreviewPrefs({ device: "x", landscape: "yes", zoom: 0.6 })).toEqual({ device: "iphone", landscape: false, zoom: null });
    expect(parseDevicePreviewPrefs({ device: "ipad", landscape: true, zoom: 0.75 })).toEqual({ device: "ipad", landscape: true, zoom: 0.75 });
  });
});
