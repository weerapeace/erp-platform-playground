import { describe, it, expect } from "vitest";
import { analyzeScan, type ScanKey } from "@/lib/packing-scan-test";

const keys = (s: string, gap = 10, rawFn?: (c: string) => string): ScanKey[] => [...s].map((c, i) => ({ key: rawFn ? rawFn(c) : c, ch: c, t: i * gap }));

describe("analyzeScan", () => {
  it("เครื่องปกติ: เร็ว + Enter = ใช้ได้", () => {
    const r = analyzeScan(keys("TH266727857374G"), true);
    expect(r.works).toBe(true);
    expect(r.text).toBe("TH266727857374G");
    expect(r.issues.every((i) => i.level === "ok")).toBe(true);
  });

  it("ไม่มี Enter = ใช้ไม่ได้ พร้อมวิธีแก้", () => {
    const r = analyzeScan(keys("TH266727857374G"), false);
    expect(r.works).toBe(false);
    expect(r.issues.find((i) => i.level === "error")?.fix).toMatch(/Enter/);
  });

  it("ส่งช้าเกิน 60ms = ใช้ไม่ได้", () => {
    const r = analyzeScan(keys("ABCDEF", 90), true);
    expect(r.works).toBe(false);
    expect(r.maxGap).toBe(90);
  });

  it("แป้นไทยเพี้ยน = แจ้งว่าแปลงให้แล้ว แต่ยังใช้ได้", () => {
    const r = analyzeScan(keys("PK2", 10, (c) => (c === "2" ? "/" : c)).concat({ key: "1", ch: "1", t: 30 }), true);
    expect(r.raw).toBe("PK/1");
    expect(r.works).toBe(true);
    expect(r.issues.some((i) => i.text.includes("ภาษาไทย"))).toBe(true);
  });

  it("ไม่ได้ตัวอักษรเลย = ยังไม่ได้ต่อแบบคีย์บอร์ด", () => {
    const r = analyzeScan([{ key: "Shift", ch: null, t: 0 }], true);
    expect(r.works).toBe(false);
    expect(r.issues[0].fix).toMatch(/HID/);
  });

  it("สั้นเกิน = เตือน", () => {
    expect(analyzeScan(keys("AB"), true).works).toBe(false);
  });
});
