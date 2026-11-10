import { describe, it, expect } from "vitest";
import { DEFAULT_LINE_GIFT, giftFromExtra, giftFromLine, giftGroupIds, giftOptionOf, giftStatusOfOption, sameGift } from "@/lib/line-gift";

describe("line-gift", () => {
  it("giftFromExtra: ยังไม่ตั้ง = ค่าเริ่มของร้าน (เปิด + For Her/For Him/Couples)", () => {
    expect(giftFromExtra({})).toEqual({ ...DEFAULT_LINE_GIFT, isDefault: true });
    expect(giftFromExtra(null).status).toBe("on");
  });

  it("giftFromExtra: ค่าที่ตั้งไว้ + ตัดหมวดแปลก/เกิน 3", () => {
    expect(giftFromExtra({ gift_status: "off", gift_categories: [] })).toEqual({ status: "off", categories: [], isDefault: false });
    expect(giftFromExtra({ gift_status: "gift_only", gift_categories: ["For Her", "อะไรก็ไม่รู้", "Seniors", "Couples", "Pet Lovers"] }).categories).toEqual(["For Her", "Seniors", "Couples"]);
    expect(giftFromExtra({ gift_status: "weird" }).status).toBe("on");
  });

  it("giftFromLine: อ่านจากข้อมูล LINE", () => {
    expect(giftFromLine({ giftOption: "ALLOW_GIFT", giftGroups: [{ id: 1, nameEn: "For Her" }, { id: 5, nameEn: "Couples" }] })).toEqual({ status: "on", categories: ["For Her", "Couples"] });
    expect(giftFromLine({ giftOption: "NO_GIFT", giftGroups: null })).toEqual({ status: "off", categories: [] });
    expect(giftFromLine(null)).toEqual({ status: "off", categories: [] });
  });

  it("แปลงสถานะ ↔ LINE + ชื่อหมวด → id", () => {
    expect(giftOptionOf("gift_only")).toBe("GIFT_ONLY");
    expect(giftStatusOfOption("ALLOW_GIFT")).toBe("on");
    expect(giftGroupIds(["For Her", "For Him", "Couples"])).toEqual([1, 2, 5]);
  });

  it("sameGift: ปิด = ไม่สนหมวด · ลำดับหมวดไม่สำคัญ", () => {
    expect(sameGift({ status: "off", categories: ["For Her"] }, { status: "off", categories: [] })).toBe(true);
    expect(sameGift({ status: "on", categories: ["Couples", "For Her"] }, { status: "on", categories: ["For Her", "Couples"] })).toBe(true);
    expect(sameGift({ status: "on", categories: ["For Her"] }, { status: "gift_only", categories: ["For Her"] })).toBe(false);
  });
});
