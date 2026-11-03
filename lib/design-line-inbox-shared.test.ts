import { describe, it, expect } from "vitest";
import { sanitizeDesignAi, lineTextToDetailHtml } from "./design-line-inbox-shared";

const brands = [
  { id: "b1", name: "Pixie Dustie" },
  { id: "b2", name: "Louis Montini" },
  { id: "b3", name: "Nekomeow" },
];
const TODAY = "2026-11-03";

describe("design-line-inbox · ตรวจคำตอบ AI งานออกแบบจากไลน์", () => {
  it("แบรนด์ต้องตรงรายชื่อจริง (ไม่สนตัวพิมพ์เล็ก/ใหญ่ · สะกดบางส่วนก็ได้)", () => {
    expect(sanitizeDesignAi({ brand: "pixie dustie" }, brands, TODAY).brand_id).toBe("b1");
    expect(sanitizeDesignAi({ brand: "Louis Montini Thailand" }, brands, TODAY).brand_id).toBe("b2");
    expect(sanitizeDesignAi({ brand: "Gucci" }, brands, TODAY).brand_id).toBeNull();
    const withShort = [...brands, { id: "b4", name: "Findig" }, { id: "b5", name: "IG International" }];
    expect(sanitizeDesignAi({ brand: "IG" }, withShort, TODAY).brand_id).toBeNull();          // สั้นเกิน เดาไม่ได้
    expect(sanitizeDesignAi({ brand: "ig international" }, withShort, TODAY).brand_id).toBe("b5");
    expect(sanitizeDesignAi({ brand: null }, brands, TODAY).brand_id).toBeNull();
  });

  it("วันส่ง: ปี พ.ศ. แปลงเป็น ค.ศ. · ย้อนหลังนาน/ไกลเกิน = ไม่ใส่", () => {
    expect(sanitizeDesignAi({ deadline: "2026-11-15" }, brands, TODAY).deadline).toBe("2026-11-15");
    expect(sanitizeDesignAi({ deadline: "2569-11-15" }, brands, TODAY).deadline).toBe("2026-11-15");
    expect(sanitizeDesignAi({ deadline: "2023-11-15" }, brands, TODAY).deadline).toBeNull();
    expect(sanitizeDesignAi({ deadline: "2030-01-01" }, brands, TODAY).deadline).toBeNull();
    expect(sanitizeDesignAi({ deadline: "15 พ.ย." }, brands, TODAY).deadline).toBeNull();
  });

  it("ชื่องาน ตัดช่องว่างซ้ำ + จำกัดความยาว · is_job ต้องเป็น boolean จริง", () => {
    const r = sanitizeDesignAi({ name: "  กระเป๋า   ผ้าลายแมว ", is_job: true }, brands, TODAY);
    expect(r.name).toBe("กระเป๋า ผ้าลายแมว");
    expect(r.is_job).toBe(true);
    expect(sanitizeDesignAi({ name: "x".repeat(200) }, brands, TODAY).name?.length).toBe(80);
    expect(sanitizeDesignAi({ is_job: "yes" }, brands, TODAY).is_job).toBeNull();
    expect(sanitizeDesignAi({ name: "" }, brands, TODAY).name).toBeNull();
  });

  it("ข้อความไลน์ → HTML รายละเอียดงาน (กันแท็กแปลกปลอม)", () => {
    expect(lineTextToDetailHtml("งานใหม่\n\nขอ 2 สี <b>ครีม</b>")).toBe("<p>งานใหม่</p><p>ขอ 2 สี &lt;b&gt;ครีม&lt;/b&gt;</p>");
    expect(lineTextToDetailHtml(null)).toBe("");
  });
});
