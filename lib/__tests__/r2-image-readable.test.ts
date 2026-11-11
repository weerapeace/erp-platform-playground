import { describe, expect, it } from "vitest";
import { r2ImagePath, r2ReadableUrl } from "../r2-image";

const ERP = "https://erp.example.com";
const IMG = "https://img.example.com";

describe("r2ImagePath — รู้ว่า URL ไหนเป็นรูป proxy", () => {
  it("แบบย่อ", () => expect(r2ImagePath("/api/r2-image?key=a%2Fb.jpg&w=900", ERP)).toBe("/api/r2-image?key=a%2Fb.jpg&w=900"));
  it("แบบเต็มโดเมน ERP → ตัดโดเมนออก", () => expect(r2ImagePath(`${ERP}/api/r2-image?key=a.jpg`, ERP)).toBe("/api/r2-image?key=a.jpg"));
  it("ไม่ใช่รูป proxy = null", () => {
    expect(r2ImagePath("data:image/png;base64,AAAA", ERP)).toBeNull();
    expect(r2ImagePath("blob:https://erp.example.com/123", ERP)).toBeNull();
    expect(r2ImagePath("https://other.example.com/api/r2-image?key=a.jpg", ERP)).toBeNull();
    expect(r2ImagePath("/api/drive/thumb?id=1", ERP)).toBeNull();
    expect(r2ImagePath("", ERP)).toBeNull();
    expect(r2ImagePath(null, ERP)).toBeNull();
  });
});

describe("r2ReadableUrl — ชี้ตรงไปตัวเสิร์ฟรูป (อ่านรูปกลับได้)", () => {
  it("รูป proxy → โดเมนตัวเสิร์ฟรูป (query เดิมครบ)", () => {
    expect(r2ReadableUrl("/api/r2-image?key=a%2Fb.jpg&w=900", ERP, IMG)).toBe(`${IMG}/api/r2-image?key=a%2Fb.jpg&w=900`);
    expect(r2ReadableUrl(`${ERP}/api/r2-image?key=a.jpg`, ERP, IMG)).toBe(`${IMG}/api/r2-image?key=a.jpg`);
  });
  it("ตัวเสิร์ฟรูปปิดอยู่ (ย้อนกลับ) = คืนค่าเดิม", () => expect(r2ReadableUrl("/api/r2-image?key=a.jpg", ERP, "")).toBe("/api/r2-image?key=a.jpg"));
  it("ไม่ใช่รูป proxy = คืนค่าเดิม", () => expect(r2ReadableUrl("https://cdn.example.com/x.png", ERP, IMG)).toBe("https://cdn.example.com/x.png"));
});
