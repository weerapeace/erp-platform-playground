import { describe, it, expect } from "vitest";
import { nationalityGroup, staffGroupOf, STAFF_GROUPS } from "../staff-group";

describe("กลุ่มพนักงาน (ช่างเหมา / ไทย / พม่า)", () => {
  it("สัญชาติ: TH/MM ตามที่ HR เก็บ + พิมพ์ไทย/อังกฤษก็อ่านได้", () => {
    expect(nationalityGroup("TH")).toBe("th");
    expect(nationalityGroup(" ไทย ")).toBe("th");
    expect(nationalityGroup("MM")).toBe("mm");
    expect(nationalityGroup("Myanmar")).toBe("mm");
    expect(nationalityGroup("พม่า")).toBe("mm");
    expect(nationalityGroup("LA")).toBe("other");
    expect(nationalityGroup("")).toBe("unk");
    expect(nationalityGroup(null)).toBe("unk");
  });
  it("ช่างเหมามาก่อนสัญชาติ (สัญญาเหมา หรือ ติ๊กช่างเหมา)", () => {
    expect(staffGroupOf({ contractType: "contractor", nationality: "TH" })).toBe("hire");
    expect(staffGroupOf({ isSubcontract: true, nationality: "MM" })).toBe("hire");
    expect(staffGroupOf({ contractType: "permanent", nationality: "MM" })).toBe("mm");
    expect(staffGroupOf({ contractType: "daily", nationality: null })).toBe("unk");
  });
  it("ลำดับกลุ่มบนจอ: ช่างเหมา → ไทย → พม่า → อื่น → ยังไม่ระบุ", () => {
    expect(STAFF_GROUPS.map((g) => g.key)).toEqual(["hire", "th", "mm", "other", "unk"]);
  });
});
