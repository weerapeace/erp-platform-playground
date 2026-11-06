import { describe, expect, it } from "vitest";
import { fitImageScale, imageFileName } from "@/lib/html-to-png";

describe("fitImageScale — ความคมของรูปไม่เกินที่เบราว์เซอร์รับไหว", () => {
  it("ใบสั้น = คมเต็ม 2 เท่า", () => {
    expect(fitImageScale(794, 1123)).toBe(2);
  });
  it("ใบยาว (75 บิล ~6,200 px) ยังได้ 2 เท่า", () => {
    expect(fitImageScale(794, 6215)).toBe(2);
  });
  it("ใบยาวมาก → ลดความคมลง ไม่ให้เกินด้านละ 32,000 px", () => {
    const s = fitImageScale(794, 30000);
    expect(s).toBeGreaterThan(0.75);
    expect(s).toBeLessThan(2);
    expect(30000 * s).toBeLessThanOrEqual(32000);
    expect(794 * 30000 * s * s).toBeLessThanOrEqual(250_000_000);
  });
  it("ยาวเกินทำเป็นรูปเดียว = 0 (ให้ไปใช้ PDF)", () => {
    expect(fitImageScale(794, 60000)).toBe(0);
  });
});

describe("imageFileName", () => {
  it("เว้นวรรค → _ · ตัดอักขระที่ Windows ห้าม · ใส่ .jpg", () => {
    expect(imageFileName("สรุปบิลจีน ค้างโอน 2026-11-06")).toBe("สรุปบิลจีน_ค้างโอน_2026-11-06.jpg");
    expect(imageFileName('บิล/ร้าน:A*B?"<>|')).toBe("บิล_ร้าน_A_B.jpg");
  });
  it("ไม่มีชื่อ = print.jpg · นามสกุลเดิมไม่ซ้อน", () => {
    expect(imageFileName("  ")).toBe("print.jpg");
    expect(imageFileName("a.jpg")).toBe("a.jpg");
    expect(imageFileName("a", "png")).toBe("a.png");
  });
});
