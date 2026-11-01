import { describe, it, expect } from "vitest";
import { brandProfileFilled, brandProfileLines, cleanBrandProfile } from "@/lib/marketing/brand-profile";

describe("การ์ดรู้จักแบรนด์", () => {
  it("ล้างค่าดิบ: ตัดช่องว่าง · ตัวอย่างไม่เกิน 3 · ค่าแปลก ๆ = ว่าง", () => {
    const p = cleanBrandProfile({ about: "  กระเป๋าหนัง  ", customers: 42, examples: ["a", "", "b", "c", "d"], hacker: "x" });
    expect(p.about).toBe("กระเป๋าหนัง");
    expect(p.customers).toBe("");
    expect(p.examples).toEqual(["a", "b", "c"]);
    expect("hacker" in p).toBe(false);
    expect(brandProfileFilled(p)).toEqual({ done: 2, total: 7 });
    expect(brandProfileFilled(null)).toEqual({ done: 0, total: 7 });
  });
  it("ไม่มีข้อมูลเลย = ไม่ใส่อะไรใน prompt", () => {
    expect(brandProfileLines(cleanBrandProfile({}))).toEqual([]);
    expect(brandProfileLines(null, { highlights: [] })).toEqual([]);
  });
  it("prompt: ใส่ช่องที่กรอก + สินค้าเด่น + ตัวอย่าง · งานรายละเอียดสินค้าไม่เอาตัวอย่างและเตือนเรื่องจุดขาย", () => {
    const p = cleanBrandProfile({ about: "หนังแท้", usps: "ทน\nเย็บมือ", examples: ["สวยมาก\nใช้ได้นาน"] });
    const lines = brandProfileLines(p, { highlights: ["รุ่น A", "รุ่น B"] });
    expect(lines).toContain("- แบรนด์คือใคร: หนังแท้");
    expect(lines).toContain("- จุดขายของแบรนด์: ทน / เย็บมือ");
    expect(lines).toContain("- สินค้าเด่นตอนนี้ (ของใหม่/ขายหลัก): รุ่น A, รุ่น B");
    expect(lines).toContain("1) สวยมาก / ใช้ได้นาน");
    const prod = brandProfileLines(p, { forProduct: true }).join("\n");
    expect(prod).not.toContain("สวยมาก");
    expect(prod).toContain("ห้ามอ้างเป็นคุณสมบัติของสินค้าชิ้นนี้");
  });
});
