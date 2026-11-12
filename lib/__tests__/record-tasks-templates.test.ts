import { describe, expect, it } from "vitest";
import { checklistProgress, templateItems, templateTitlesToAdd, TEMPLATE_MAX_ITEMS } from "@/lib/record-tasks";

// เช็กลิสต์ในงาน (แผนงานทีม) + แม่แบบหลายข้อ — 2026-11-12
describe("checklistProgress", () => {
  it("เสร็จ/ทั้งหมด · ครบ = allDone · ไม่มีข้อ = ไม่ครบ", () => {
    expect(checklistProgress({ open: ["ให้แบรนด์ตรวจ", "กดเผยแพร่"], done: 2 })).toEqual({ done: 2, total: 4, allDone: false });
    expect(checklistProgress({ open: [], done: 3 })).toEqual({ done: 3, total: 3, allDone: true });
    expect(checklistProgress({ open: [], done: 0 })).toEqual({ done: 0, total: 0, allDone: false });
    expect(checklistProgress(null)).toEqual({ done: 0, total: 0, allDone: false });
  });
});

describe("แม่แบบ", () => {
  it("อ่านข้อในแม่แบบ — ตัดว่าง/ซ้ำ/ไม่ใช่ข้อความ · ไม่ใช่ array = ว่าง", () => {
    expect(templateItems({ items: [" เลือกรูป ", "", "เลือกรูป", 5, "อัปโหลด"] })).toEqual(["เลือกรูป", "อัปโหลด"]);
    expect(templateItems({ items: "เลือกรูป" })).toEqual([]);
    expect(templateItems(null)).toEqual([]);
    expect(templateItems({ items: Array.from({ length: 50 }, (_, i) => `ข้อ ${i}`) })).toHaveLength(TEMPLATE_MAX_ITEMS);
  });
  it("ใช้แม่แบบซ้ำไม่เพิ่มข้อที่มีแล้ว (ไม่สนช่องว่าง/ตัวพิมพ์) · คงลำดับแม่แบบ", () => {
    expect(templateTitlesToAdd(["เลือกรูปจากอัลบั้ม", "Upload  Web"], ["เลือกรูปจากอัลบั้ม", "ย่อรูป", "upload web", "ตรวจบนมือถือ", "ย่อรูป"]))
      .toEqual(["ย่อรูป", "ตรวจบนมือถือ"]);
    expect(templateTitlesToAdd([], [" ", "ขอราคา"])).toEqual(["ขอราคา"]);
  });
});
