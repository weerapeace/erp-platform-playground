import { describe, expect, it } from "vitest";
import { editDistance, looksLikeMaterial, similarGroups, skuCodeColors, skuCodesIn, trailingNumberFix, typoFix } from "./color-name-tools";

describe("① เลขท้ายชื่อ", () => {
  it.each([
    ["Soft Rose (05)", "Soft Rose"], ["ดำ (01)", "ดำ"], ["ครีม 02", "ครีม"], ["Metallic Rosey (3)", "Metallic Rosey"], ["เชอรี่เรด 01", "เชอรี่เรด"],
  ])("%s → %s", (a, b) => expect(trailingNumberFix(a)).toBe(b));
  it.each(["ดำ", "10 รู", "2.5 cm", "ดำ (Special)", "M (20.5 cm.)", "A4 21*30 cm"])("%s = ไม่แตะ", (a) => expect(trailingNumberFix(a)).toBeNull());
});

describe("② ชื่อคล้ายกัน", () => {
  it("แก้คำสะกด เ+เ → แ · ช่องว่างซ้อน", () => {
    expect(typoFix("เเทน")).toBe("แทน");
    expect(typoFix("แดง  ไวน์")).toBe("แดง ไวน์");
    expect(typoFix("แทน")).toBeNull();
  });
  it("ระยะห่างตัวอักษร", () => {
    expect(editDistance("โรสโกล", "โรสโกลด์", 2)).toBe(2);
    expect(editDistance("rosegold", "rosegol", 1)).toBe(1);
  });
  it("จับกลุ่ม: สะกดต่าง/เว้นวรรค = exact · ต่าง 1 ตัว = near · คนละภาษาไม่รวม · เลขท้ายไม่รวม", () => {
    const g = similarGroups([
      { name: "แทน", skus: 126 }, { name: "เเทน", skus: 13 },
      { name: "ฟ้าพาสเทล", skus: 21 }, { name: "ฟ้า พาสเทล", skus: 1 },
      { name: "Rose Gold", skus: 3 }, { name: "Rose Gol", skus: 1 },
      { name: "ดำ", skus: 300 }, { name: "Black", skus: 30 },
      { name: "Soft Rose (05)", skus: 4 }, { name: "Soft Rose (11)", skus: 1 },
    ]);
    const by = (m: string) => g.find((x) => x.main === m);
    expect(by("แทน")).toMatchObject({ kind: "exact", members: [{ name: "แทน" }, { name: "เเทน" }] });
    expect(by("ฟ้าพาสเทล")?.kind).toBe("exact");
    expect(by("Rose Gold")?.kind).toBe("near");
    expect(g.some((x) => x.members.some((m) => m.name === "Black"))).toBe(false);
    expect(g.some((x) => x.members.some((m) => m.name.startsWith("Soft Rose")))).toBe(false);
  });
  it("ชื่อหลักไม่เลือกตัวสะกดผิด แม้ SKU มากกว่า", () => {
    expect(similarGroups([{ name: "เเดงไวน์", skus: 5 }, { name: "แดงไวน์", skus: 4 }])[0].main).toBe("แดงไวน์");
  });
});

describe("④ รหัส SKU แทนสี", () => {
  const colorOf = new Map([["WK21-02", "น้ำตาล"], ["WK18-02", "เขียว"], ["WK21-01", "ดำ"]]);
  it("แปลงเป็นสีของชิ้นในเซ็ต", () => {
    expect(skuCodeColors("WK21-02,WK18-02", colorOf)?.suggestion).toBe("น้ำตาล-เขียว");
  });
  it("รหัสที่หาไม่เจอ = ไม่แนะนำ + บอกตัวที่หาย", () => {
    expect(skuCodeColors("WK21-01,K19-03", colorOf)).toMatchObject({ suggestion: null, missing: ["K19-03"] });
  });
  it("ชื่อสีธรรมดา = ไม่ใช่รหัส", () => {
    expect(skuCodesIn("แดง-ดำ")).toEqual([]);
    expect(skuCodeColors("ดำ (01)", colorOf)).toBeNull();
  });
});

describe("⑤ วัสดุ/ลายหนัง", () => {
  it.each(["ซาเฟียโน่", "หนังเรียบ", "ลายจระเข้", "Saffiano", "Crocodile Print", "Crocodile Embossed Leather", "Smooth Leather", "ผ้าไนล่อน"])("%s = วัสดุ", (p) => expect(looksLikeMaterial(p)).toBe(true));
  it.each(["ดำ", "Black", "น้ำตาลอ่อน", "Rose Gold"])("%s = ไม่ใช่", (p) => expect(looksLikeMaterial(p)).toBe(false));
});

import { renamedField } from "./color-name-tools";
describe("🔁 เปลี่ยนชื่อในช่องสีของ SKU", () => {
  it("ตรงทั้งช่อง (ไม่สนตัวพิมพ์/ช่องว่าง) → ชื่อใหม่", () => {
    expect(renamedField("Soft Rose (05)", "soft rose (05)", "Soft Rose")).toBe("Soft Rose");
    expect(renamedField("เเทน", "เเทน", "แทน")).toBe("แทน");
  });
  it("คงท้าย / ไซส์ ของ SKU ไซส์", () => {
    expect(renamedField("แดง/ซาเฟียโน่ / S", "แดง/ซาเฟียโน่", "แดง/หนังซาเฟียโน่", "S")).toBe("แดง/หนังซาเฟียโน่ / S");
  });
  it("ไม่ตรง / ว่าง = ไม่แตะ", () => {
    expect(renamedField("Black/Saffiano", "ดำ/ซาเฟียโน่", "ดำ")).toBeNull();
    expect(renamedField(null, "ดำ", "Black")).toBeNull();
  });
});
