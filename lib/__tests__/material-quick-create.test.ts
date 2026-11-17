import { describe, expect, it } from "vitest";
import { similarMaterials } from "@/lib/material-quick-create";
import { boardMatColors, colorFromHex, fitFontSize } from "@/lib/pattern-mat-colors";
import { NAME_COLOR_PALETTE } from "@/lib/dept-color";

const list = [{ id: "a", name: "ซับใน" }, { id: "b", name: "ผ้าตัว Oxford" }, { id: "c", name: "หนัง PU" }, { id: "d", name: "ฟองน้ำ 3mm" }];

describe("เพิ่มวัสดุด่วน — หาชื่อคล้ายก่อนสร้าง", () => {
  it("ต่างแค่ช่องว่าง/เครื่องหมาย = คล้าย (มาก่อน)", () => {
    expect(similarMaterials("ซับ ใน", list).map((m) => m.id)).toEqual(["a"]);
    expect(similarMaterials("หนัง-pu", list).map((m) => m.id)).toEqual(["c"]);
  });
  it("ชื่อหนึ่งอยู่ในอีกชื่อ = คล้าย", () => {
    expect(similarMaterials("ผ้าตัว", list).map((m) => m.id)).toEqual(["b"]);
    expect(similarMaterials("ฟองน้ำ", list).map((m) => m.id)).toEqual(["d"]);
  });
  it("พิมพ์ผิด 1 ตัว = คล้าย · ชื่อไม่เกี่ยว = ไม่มี · สั้นเกิน = ไม่เช็ก", () => {
    expect(similarMaterials("ซับไน", list).map((m) => m.id)).toEqual(["a"]);
    expect(similarMaterials("ซิปไนลอน", list)).toEqual([]);
    expect(similarMaterials("ก", list)).toEqual([]);
  });
});

describe("สีวัสดุบนกระดาน", () => {
  it("สีที่ตั้งในวัสดุมาก่อน · ไม่ตั้ง = สีจากชุดสี · วัสดุเดียวกันสีเดียวกัน", () => {
    const c = boardMatColors([{ id: "a", name: "ซับใน" }, { id: "b", name: "ผ้า" }, { id: "a", name: "ซับใน" }], { b: { color: "#ff0000" } });
    expect(c.b).toEqual(colorFromHex("#ff0000"));
    expect(NAME_COLOR_PALETTE).toContainEqual(c.a);
    expect(Object.keys(c)).toHaveLength(2);
  });
  it("ชื่อเดิมได้สีเดิม · กระดานเดียวกันไม่ซ้ำสี (≤ 10 วัสดุ)", () => {
    const mats = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, name: `วัสดุ ${i}` }));
    const c = boardMatColors(mats);
    expect(new Set(Object.values(c).map((x) => x.dot)).size).toBe(10);
    expect(boardMatColors([mats[3]]).m3).toEqual(boardMatColors([mats[3]]).m3);
  });
  it("สีเอง: พื้นอ่อน ตัวหนังสือเข้ม", () => {
    const c = colorFromHex("#808080");
    expect(parseInt(c.bg.slice(1, 3), 16)).toBeGreaterThan(200);
    expect(parseInt(c.text.slice(1, 3), 16)).toBeLessThan(90);
  });
});

describe("ย่อตัวหนังสือให้พอดีชิ้น", () => {
  it("กว้างพอ = ขนาดเดิม · แคบ = ย่อ · ไม่เล็กกว่าขั้นต่ำ", () => {
    expect(fitFontSize("P1", 100, 5)).toBe(5);
    expect(fitFontSize("P10 ชิ้นจากรูป 1 ×2", 30, 5)).toBeLessThan(5);
    expect(fitFontSize("ชื่อยาวมากมากมากมากมาก", 1, 5)).toBeCloseTo(1.75);
  });
  it("สระบน/ล่าง/วรรณยุกต์ไทยไม่นับความกว้าง", () => {
    expect(fitFontSize("ชิ้น", 10, 50)).toBeCloseTo(fitFontSize("ชน", 10, 50));
  });
});
