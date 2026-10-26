import { describe, expect, it } from "vitest";
import { appIconUrl, isAppIconKey, nearestIconSize, STANDALONE_APPS } from "@/lib/app-branding";

describe("app-branding", () => {
  it("ที่อยู่รูปไอคอน + เลขรุ่น", () => {
    expect(appIconUrl("notify")).toBe("/api/app-icon/notify?s=192");
    expect(appIconUrl("notify", 512, "1730000000000")).toBe("/api/app-icon/notify?s=512&v=1730000000000");
  });
  it("ปัดขนาดเข้าหาขนาดที่เสิร์ฟ", () => {
    expect(nearestIconSize("180")).toBe(180);
    expect(nearestIconSize("200")).toBe(192);
    expect(nearestIconSize("9999")).toBe(512);
    expect(nearestIconSize("abc")).toBe(192);
    expect(nearestIconSize(null)).toBe(192);
  });
  it("รับเฉพาะไฟล์ในโฟลเดอร์ไอคอนแอป", () => {
    expect(isAppIconKey("app-icons/u1/1730-1.png")).toBe(true);
    expect(isAppIconKey("app-icons/../secret.png")).toBe(false);
    expect(isAppIconKey("invoices/u1/a.pdf")).toBe(false);
    expect(isAppIconKey(null)).toBe(false);
  });
  it("แอปเดี่ยวในทะเบียนมีไอคอนตั้งต้นครบ", () => {
    for (const a of Object.values(STANDALONE_APPS)) {
      expect(a.defaultIcon[192]).toMatch(/^\/.+\.png$/);
      expect(a.defaultIcon[512]).toMatch(/^\/.+\.png$/);
      expect(a.defaultIcon.maskable).toMatch(/^\/.+\.png$/);
    }
  });
});
