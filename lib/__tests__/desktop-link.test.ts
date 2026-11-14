import { describe, it, expect } from "vitest";
import { DESKTOP_APPS, knownApp, returnHash, safeReturnUrl, safeState } from "../desktop-link";

describe("เชื่อมโปรแกรมบนเครื่อง — ที่อยู่ส่งกลับต้องเป็นเครื่องตัวเองเท่านั้น", () => {
  it("รับ http://127.0.0.1:<port>/erp-linked", () => {
    expect(safeReturnUrl("http://127.0.0.1:52996/erp-linked")).toBe("http://127.0.0.1:52996/erp-linked");
  });
  it("ปฏิเสธเว็บอื่น / https / localhost / path อื่น / พอร์ตต่ำ / ต่อท้ายหลอก", () => {
    for (const bad of [
      "https://127.0.0.1:5000/erp-linked", "http://localhost:5000/erp-linked", "http://evil.com/erp-linked",
      "http://127.0.0.1:5000/other", "http://127.0.0.1:80/erp-linked", "http://127.0.0.1:5000/erp-linked?x=1",
      "http://127.0.0.1:5000/erp-linked.evil.com", "http://127.0.0.1.evil.com:5000/erp-linked", "http://127.0.0.1:99999/erp-linked", "", null,
    ]) expect(safeReturnUrl(bad)).toBeNull();
  });
  it("state ต้องเป็นรหัสสุ่มยาวพอ ไม่มีอักขระแปลก", () => {
    expect(safeState("abcDEF0123456789_-xy")).toBe("abcDEF0123456789_-xy");
    expect(safeState("short")).toBeNull();
    expect(safeState("abc<script>0123456789")).toBeNull();
  });
  it("รับเฉพาะโปรแกรมที่รู้จัก", () => {
    expect(DESKTOP_APPS).toContain("Louis Batch");
    expect(knownApp("Louis Batch")).toBe("Louis Batch");
    expect(knownApp("Evil")).toBeNull();
  });
  it("ส่วน # ไม่ใส่ค่าว่าง และ encode ถูก", () => {
    expect(returnHash({ state: "s", at: "a.b", exp: 5, name: "ก ข", empty: "", none: null })).toBe("#state=s&at=a.b&exp=5&name=%E0%B8%81+%E0%B8%82");
  });
});
