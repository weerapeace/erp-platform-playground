import { describe, expect, it } from "vitest";
import { decideSlip, parseEasySlip, sniffImage, rejectReasonText } from "@/lib/website-payments";

const ok = (over: Record<string, unknown> = {}) => ({
  success: true,
  message: "Bank slip verified successfully",
  data: {
    isDuplicate: false,
    matchedAccount: { bank: "KBANK", nameTh: "ร้าน" },
    isAmountMatched: true,
    amountInSlip: 1290,
    rawSlip: {
      transRef: "015123456789ABC",
      date: "2026-10-20T14:02:00+07:00",
      amount: { amount: 1290 },
      sender: { account: { name: { th: "นาย ก" } } },
      receiver: { account: { name: { th: "บจก. ร้าน" } } },
    },
    ...over,
  },
});
const noDup = { usedElsewhere: false, seenOnThisOrder: false };

describe("parseEasySlip", () => {
  it("อ่านสลิปสำเร็จ", () => {
    const c = parseEasySlip(200, ok());
    expect(c).toMatchObject({ ok: true, transRef: "015123456789ABC", amount: 1290, sender: "นาย ก", receiver: "บจก. ร้าน", isDuplicate: false, amountMatched: true, accountMatched: true });
  });
  it("ไม่มี QR = not_slip", () => {
    expect(parseEasySlip(404, { success: false, error: { code: "SLIP_NOT_FOUND", message: "No QR code found in the image" } })).toMatchObject({ ok: false, failure: "not_slip", code: "SLIP_NOT_FOUND" });
  });
  it("รหัสผิด/ตอบแปลก = error", () => {
    expect(parseEasySlip(401, { success: false, error: { code: "INVALID_API_KEY" } })).toMatchObject({ ok: false, failure: "error" });
    expect(parseEasySlip(500, null)).toMatchObject({ ok: false, failure: "error", code: "HTTP_500" });
  });
  it("ไม่ได้ส่ง matchedAccount มา = ไม่รู้ (null)", () => {
    const body = ok();
    delete (body.data as Record<string, unknown>).matchedAccount;
    expect(parseEasySlip(200, body).accountMatched).toBeNull();
  });
});

describe("decideSlip — ผ่านได้ทางเดียว", () => {
  it("ครบทุกข้อ = passed", () => expect(decideSlip(parseEasySlip(200, ok()), 1290, noDup).result).toBe("passed"));
  it("ยอดต่าง 1 สตางค์ยังผ่าน · ต่างกว่านั้นไม่ผ่าน", () => {
    expect(decideSlip(parseEasySlip(200, ok()), 1290.01, noDup).result).toBe("passed");
    expect(decideSlip(parseEasySlip(200, ok()), 1300, noDup).result).toBe("amount_mismatch");
  });
  it("บัญชีผู้รับไม่ตรง/ไม่รู้ = ไม่ผ่าน", () => {
    expect(decideSlip(parseEasySlip(200, ok({ matchedAccount: null })), 1290, noDup).result).toBe("account_mismatch");
    const body = ok();
    delete (body.data as Record<string, unknown>).matchedAccount;
    expect(decideSlip(parseEasySlip(200, body), 1290, noDup).result).toBe("account_mismatch");
  });
  it("สลิปซ้ำ: ใช้กับออเดอร์อื่น = ไม่ผ่าน · ออเดอร์เดิมส่งซ้ำ = ไม่นับซ้ำ", () => {
    expect(decideSlip(parseEasySlip(200, ok()), 1290, { usedElsewhere: true, seenOnThisOrder: false }).result).toBe("duplicate");
    expect(decideSlip(parseEasySlip(200, ok({ isDuplicate: true })), 1290, noDup).result).toBe("duplicate");
    expect(decideSlip(parseEasySlip(200, ok({ isDuplicate: true })), 1290, { usedElsewhere: false, seenOnThisOrder: true }).result).toBe("passed");
  });
  it("ไม่ได้เปิด/บริการล่ม = ไม่ผ่าน (ไปให้พนักงานตรวจ)", () => {
    expect(decideSlip({ ok: false, failure: "off" }, 100, noDup).result).toBe("off");
    expect(decideSlip(parseEasySlip(503, {}), 100, noDup).result).toBe("error");
  });
});

describe("sniffImage", () => {
  it("ดูหัวไฟล์จริง", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("%PDF-1.4"))).toBeNull();
  });
});

describe("rejectReasonText", () => {
  it("แปลงรหัสเหตุผลเป็นภาษาลูกค้า", () => {
    expect(rejectReasonText("amount", "en")).toBe("The amount is incorrect");
    expect(rejectReasonText("amount", "th")).toBe("ยอดเงินไม่ครบ/ไม่ตรง");
    expect(rejectReasonText(null, "th")).toBe("");
  });
});
