import { describe, expect, it } from "vitest";
import {
  cashReceived,
  isFullyPaid,
  isReceiptPaid,
  outstanding,
  receiptMethodLabel,
  receiptStatusLabel,
  settledAmount,
  sumAllocations,
  validateAllocation,
} from "@/lib/receipts";

describe("receipts — ยอดเงิน", () => {
  it("ยอดตัดหนี้ = เงินเข้าบัญชี + หัก ณ ที่จ่าย (ค่าธรรมเนียมไม่เกี่ยว)", () => {
    expect(settledAmount(9700, 300)).toBe(10000);
    expect(settledAmount(10000, 0)).toBe(10000);
  });

  it("เงินเข้าบัญชีจริง = ยอดที่รับ − ค่าธรรมเนียมธนาคาร", () => {
    expect(cashReceived(10000, 30)).toBe(9970);
    expect(cashReceived(10000, 0)).toBe(10000);
  });

  it("ยอดค้างรับไม่ติดลบ แม้จ่ายเกิน", () => {
    expect(outstanding(1000, 400)).toBe(600);
    expect(outstanding(1000, 1200)).toBe(0);
    expect(outstanding(1000, 0)).toBe(1000);
  });

  it("ปิดยอดแล้วเผื่อเศษสตางค์ (กันเคสปัดเศษ .005)", () => {
    expect(isFullyPaid(1000, 1000)).toBe(true);
    expect(isFullyPaid(1000, 999.999)).toBe(true);
    expect(isFullyPaid(1000, 999.9)).toBe(false);
  });

  it("ยอดค้างปัดเศษสตางค์เรียบร้อย ไม่มีทศนิยมลอย", () => {
    expect(outstanding(100.1, 0.2)).toBe(99.9);
  });
});

describe("receipts — รวมยอดตามเอกสาร", () => {
  it("แยกยอดที่ตัดไปแล้วของใบขายกับใบวางบิลออกจากกัน", () => {
    const { bySo, byBn } = sumAllocations([
      { so_id: "so-1", amount: 100 },
      { so_id: "so-1", amount: 50 },
      { so_id: "so-2", amount: 30 },
      { billing_note_id: "bn-1", amount: 200 },
    ]);
    expect(bySo.get("so-1")).toBe(150);
    expect(bySo.get("so-2")).toBe(30);
    expect(byBn.get("bn-1")).toBe(200);
    expect(bySo.has("bn-1")).toBe(false);
  });

  it("ข้ามบรรทัดที่ยอดเป็น 0 หรือไม่ใช่ตัวเลข", () => {
    const { bySo } = sumAllocations([
      { so_id: "so-1", amount: 0 },
      { so_id: "so-1", amount: Number("ไม่ใช่ตัวเลข") },
      { so_id: "so-1", amount: 10 },
    ]);
    expect(bySo.get("so-1")).toBe(10);
  });
});

describe("receipts — ตรวจก่อนบันทึก", () => {
  it("ผ่านเมื่อกระจายยอดครบพอดี", () => {
    expect(validateAllocation(9700, 300, [{ amount: 6000 }, { amount: 4000 }])).toBeNull();
  });

  it("เตือนเป็นภาษาคนเมื่อกระจายไม่ครบ", () => {
    const msg = validateAllocation(10000, 0, [{ amount: 6000 }]);
    expect(msg).toContain("ยังกระจายยอดไม่ครบ");
    expect(msg).toContain("4,000");
  });

  it("เตือนเมื่อกระจายเกิน", () => {
    const msg = validateAllocation(10000, 0, [{ amount: 12000 }]);
    expect(msg).toContain("กระจายยอดเกิน");
    expect(msg).toContain("2,000");
  });

  it("กันบันทึกใบเปล่า / ยอดศูนย์", () => {
    expect(validateAllocation(0, 0, [{ amount: 100 }])).toBe("ยอดรับชำระต้องมากกว่า 0");
    expect(validateAllocation(1000, 0, [])).toBe("ต้องเลือกอย่างน้อย 1 ใบที่จะตัดยอด");
  });

  it("ยอมรับส่วนต่างระดับสตางค์ (ปัดเศษจากการหารบิล)", () => {
    expect(validateAllocation(1000, 0, [{ amount: 333.33 }, { amount: 333.33 }, { amount: 333.34 }])).toBeNull();
  });
});

describe("receipts — ป้ายภาษาไทย", () => {
  it("แปลสถานะ/วิธีรับเงินเป็นไทย และไม่พังเมื่อเจอค่าแปลก", () => {
    expect(receiptStatusLabel("confirmed")).toBe("รับเงินแล้ว");
    expect(receiptStatusLabel("cancelled")).toBe("ยกเลิก");
    expect(receiptStatusLabel("ค่าที่ไม่รู้จัก")).toBe("ค่าที่ไม่รู้จัก");
    expect(receiptMethodLabel("transfer")).toBe("โอนเงิน");
    expect(receiptMethodLabel(null)).toBe("—");
  });

  it("นับเฉพาะใบที่รับเงินแล้วว่าเป็นการชำระจริง", () => {
    expect(isReceiptPaid("confirmed")).toBe(true);
    expect(isReceiptPaid("draft")).toBe(false);
    expect(isReceiptPaid("cancelled")).toBe(false);
  });
});
