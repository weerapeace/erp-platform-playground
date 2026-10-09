import { describe, it, expect } from "vitest";
import { cleanIds, cleanColor, countBy, isUuid } from "@/lib/marketing/sku-list";

const A = "fd8d1b12-51cb-489f-a37a-352fb87f1278";
const B = "337b58c8-7952-47ab-a671-185224ea7e6f";

describe("marketing sku-list helpers", () => {
  it("isUuid รับเฉพาะ uuid", () => {
    expect(isUuid(A)).toBe(true);
    expect(isUuid("BBM02")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("cleanIds กรองของเสีย ตัดซ้ำ รับได้ทั้ง array และ comma string", () => {
    expect(cleanIds([A, A, "x", B, 5])).toEqual([A, B]);
    expect(cleanIds(`${A}, ${B},,bad`)).toEqual([A, B]);
    expect(cleanIds(undefined)).toEqual([]);
  });

  it("cleanIds จำกัดจำนวน", () => {
    expect(cleanIds([A, B], 1)).toEqual([A]);
  });

  it("cleanColor รับ hex เท่านั้น ไม่งั้นเป็นเทา", () => {
    expect(cleanColor("#F97316")).toBe("#F97316");
    expect(cleanColor("#abc")).toBe("#abc");
    expect(cleanColor("red")).toBe("#64748b");
    expect(cleanColor("url(javascript:1)")).toBe("#64748b");
  });

  it("countBy นับตามคีย์", () => {
    const m = countBy([{ b: "x" }, { b: "y" }, { b: "x" }], (r) => r.b);
    expect(m.get("x")).toBe(2);
    expect(m.get("y")).toBe(1);
  });
});
