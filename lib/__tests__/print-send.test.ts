import { describe, it, expect, beforeEach } from "vitest";
import {
  docIdFromPath, docTypeFromPath, lineSendText, parseEmails, readSendMemory, safePdfName, saveSendMemory, sendMonthFolder, LINE_INTAKE_SLOTS,
} from "@/lib/print-send";

describe("ส่ง PDF: แยกค่าจากหน้า", () => {
  it("ชนิด + id เอกสารจาก /print/<type>/<id>", () => {
    expect(docTypeFromPath("/print/sales-order/abc-123")).toBe("sales-order");
    expect(docIdFromPath("/print/sales-order/abc-123")).toBe("abc-123");
    expect(docTypeFromPath("/print/work-board")).toBe("work-board");
    expect(docIdFromPath("/print/work-board")).toBeNull();
    expect(docTypeFromPath("/x")).toBe("doc");
  });
  it("อีเมลหลายคน · ผิดรูปแบบแจ้งกลับ", () => {
    expect(parseEmails("a@b.co, C@D.com;x@y")).toEqual({ ok: ["a@b.co", "c@d.com"], bad: ["x@y"] });
    expect(parseEmails("")).toEqual({ ok: [], bad: [] });
  });
  it("ชื่อไฟล์ปลอดภัย + โฟลเดอร์เดือนตามเวลาไทย", () => {
    expect(safePdfName('ใบสั่งซื้อ PO/2026:01*')).toBe("ใบสั่งซื้อ PO 2026 01.pdf");
    expect(safePdfName("x.pdf")).toBe("x.pdf");
    expect(sendMonthFolder(new Date("2026-11-30T18:00:00Z"))).toBe("2026-12");
  });
  it("ข้อความ LINE มีลิงก์ + ผู้ส่ง · ไม่ส่งเข้ากลุ่มรับเข้า", () => {
    const t = lineSendText("ส่งใบ PO ครับ", "PO-1.pdf", "https://drive/x", "a@b.co");
    expect(t).toContain("https://drive/x");
    expect(t).toContain("PO-1.pdf");
    expect(t).toContain("ส่งโดย a@b.co");
    expect(LINE_INTAKE_SLOTS).toContain("purchase_capture");
  });
});

describe("จำผู้รับล่าสุดต่อชนิดเอกสาร", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0,
    } as Storage;
  });
  it("บันทึกแล้วอ่านคืน · แยกต่อชนิด", () => {
    saveSendMemory("sales-order", { line: ["purchase_order"], emails: "a@b.co", message: "ส่ง {file}", channels: { line: true, email: true } });
    expect(readSendMemory("sales-order")?.line).toEqual(["purchase_order"]);
    expect(readSendMemory("sales-order")?.message).toBe("ส่ง {file}");
    expect(readSendMemory("billing-note")).toBeNull();
  });
});
