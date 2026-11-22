import { describe, it, expect } from "vitest";
import { cleanWizardVisibility, legacyNoBrandOnly, templateShownInWizard, wizardVisibilityOf } from "@/lib/task-template-visibility";

const LM = "brand-lm", PX = "brand-px";

describe("เทมเพลตในหน้าสร้างงาน", () => {
  it("ซ่อน = ไม่โชว์ทุกกรณี", () => {
    expect(templateShownInWizard({ brand_id: LM, wizard_visibility: "hidden" }, LM)).toBe(false);
    expect(templateShownInWizard({ brand_id: null, wizard_visibility: "hidden" }, "")).toBe(false);
  });
  it("เทมเพลตผูกแบรนด์ โชว์เฉพาะแบรนด์นั้น", () => {
    expect(templateShownInWizard({ brand_id: LM }, LM)).toBe(true);
    expect(templateShownInWizard({ brand_id: LM }, PX)).toBe(false);
    expect(templateShownInWizard({ brand_id: LM }, "")).toBe(false);
  });
  it("เทมเพลตทั่วไป: brand = เฉพาะมีแบรนด์ (เปลี่ยนปก)", () => {
    const cover = { brand_id: null, wizard_visibility: "brand" };
    expect(templateShownInWizard(cover, LM)).toBe(true);
    expect(templateShownInWizard(cover, "")).toBe(false);
  });
  it("เทมเพลตทั่วไป: nobrand = เฉพาะไม่ระบุแบรนด์", () => {
    const t = { brand_id: null, wizard_visibility: "nobrand" };
    expect(templateShownInWizard(t, LM)).toBe(false);
    expect(templateShownInWizard(t, null)).toBe(true);
  });
  it("ข้อมูลเก่าไม่มีช่องใหม่ → ใช้ no_brand_only", () => {
    expect(wizardVisibilityOf({ no_brand_only: true })).toBe("nobrand");
    expect(wizardVisibilityOf({})).toBe("all");
    expect(templateShownInWizard({ brand_id: null }, LM)).toBe(true);
  });
  it("ตรวจค่า + ช่องเก่า", () => {
    expect(cleanWizardVisibility("x")).toBeNull();
    expect(cleanWizardVisibility("brand")).toBe("brand");
    expect(legacyNoBrandOnly("nobrand")).toBe(true);
    expect(legacyNoBrandOnly("all")).toBe(false);
    expect(legacyNoBrandOnly("hidden")).toBeUndefined();
  });
});
