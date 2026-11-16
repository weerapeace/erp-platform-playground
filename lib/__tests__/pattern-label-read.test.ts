import { describe, expect, it } from "vitest";
import { parseLabelRead } from "@/lib/pattern-label-read";

describe("อ่านตัวเขียนบนชิ้นแพทเทิร์น (ตัวตรวจคำตอบ AI)", () => {
  it("คำตอบปกติ → ชื่อ / กว้าง / ยาว / จำนวน", () => {
    const r = parseLabelRead('```json\n{"text":"ข้าง 102x30 ×2","name":"ข้าง","w_cm":30,"l_cm":102,"count":2,"unsure":false}\n```');
    expect(r).toEqual({ text: "ข้าง 102x30 ×2", name: "ข้าง", w: 30, l: 102, count: 2, unsure: false });
  });
  it("กว้างมากกว่ายาว → สลับให้ · ตัวเลขเป็นข้อความก็อ่านได้", () => {
    const r = parseLabelRead('{"text":"","name":"ก้น","w_cm":"40 cm","l_cm":"12","count":"3","unsure":false}');
    expect([r.w, r.l, r.count]).toEqual([12, 40, 3]);
  });
  it("ค่าเพี้ยน (ติดลบ ใหญ่เกิน) = ทิ้ง · ไม่มีอะไรเลย = ไม่แน่ใจ", () => {
    const r = parseLabelRead('{"text":"?","name":"","w_cm":-3,"l_cm":9999,"count":0}');
    expect([r.w, r.l, r.count, r.unsure]).toEqual([null, null, null, true]);
  });
  it("รับ object ที่แปลง JSON แล้วได้ (aiChat คืนแบบนี้)", () => {
    expect(parseLabelRead({ text: "หู ×4", name: "หู", w_cm: null, l_cm: 45, count: 4 })).toEqual({ text: "หู ×4", name: "หู", w: null, l: 45, count: 4, unsure: false });
  });
  it("ไม่ใช่ JSON = ค่าว่าง ไม่พัง", () => {
    expect(parseLabelRead("อ่านไม่ออก").unsure).toBe(true);
    expect(parseLabelRead("{oops").name).toBe("");
  });
});
