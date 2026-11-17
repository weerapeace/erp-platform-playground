import { describe, it, expect } from "vitest";
import { bumpProductName, guessSku, splitGroups } from "../sample-sku-split";

const parent = { id: "p1", code: "GG-TOTE24", name: "กระเป๋าผ้าโท้ท" };
const kids = [
  { id: "s1", code: "GG-TOTE24-PK", name: "ชมพู" },
  { id: "s2", code: "GG-TOTE24-BG", name: "เบจ" },
  { id: "s3", code: "GG-TOTE24-BK", name: "ดำ" },
];

describe("เดา SKU จากชื่อไฟล์ / โฟลเดอร์", () => {
  it("รหัส SKU ในชื่อไฟล์หรือชื่อโฟลเดอร์", () => {
    expect(guessSku("GG-TOTE24-PK_01.jpg", parent, kids)).toBe("GG-TOTE24-PK");
    expect(guessSku("GG-TOTE24-BK/IMG_0001.jpg", parent, kids)).toBe("GG-TOTE24-BK");
  });
  it("ชื่อสีของ SKU เป็นทางสำรอง · เดาไม่ได้ = ว่าง", () => {
    expect(guessSku("tote เบจ 2.jpg", parent, kids)).toBe("GG-TOTE24-BG");
    expect(guessSku("IMG_0042.jpg", parent, kids)).toBe("");
    expect(guessSku("GG-TOTE24-PK.jpg", parent, [])).toBe("");
  });
});

describe("แบ่งกลุ่มอัลบั้ม + ชื่อ Product ### ต่อกัน", () => {
  it("เลขต่อกันตามลำดับ SKU ของรุ่น · ทั้งรุ่นท้ายสุด", () => {
    const g = splitGroups(["GG-TOTE24-BG", "", "GG-TOTE24-PK", "GG-TOTE24-BG"], kids, "Product 005");
    expect(g.map((x) => [x.name, x.skuCode, x.indexes])).toEqual([
      ["Product 005", "GG-TOTE24-PK", [2]],
      ["Product 006", "GG-TOTE24-BG", [0, 3]],
      ["Product 007", "", [1]],
    ]);
  });
  it("bumpProductName คงจำนวนหลัก · ไม่มีเลข = ต่อท้าย", () => {
    expect(bumpProductName("Product 009", 1)).toBe("Product 010");
    expect(bumpProductName("ชุดถ่าย", 0)).toBe("ชุดถ่าย");
    expect(bumpProductName("ชุดถ่าย", 1)).toBe("ชุดถ่าย 2");
  });
});
