import { describe, expect, it } from "vitest";
import { fillQrState, parseQrCode, posterQrCode, qrStateComplete, qrStateOf, rotateQr, shopQrCode, companyQrLink } from "@/lib/line-company-qr";

const PID = "11111111-2222-3333-4444-555555555555";
const st = fillQrState({});

describe("ไลน์บริษัท — QR", () => {
  it("เติมเลขรุ่นครบทุกแบบ · อ่านค่าที่เก็บไว้ ค่าแปลกทิ้ง", () => {
    expect(qrStateComplete(st)).toBe(true);
    expect(qrStateOf({ staff: "x", customer: "<script>", admin: st.admin })).toEqual({ admin: st.admin });
    expect(qrStateComplete(qrStateOf(null))).toBe(false);
  });

  it("QR โปสเตอร์ อ่านกลับได้ตรงชนิด", () => {
    for (const k of ["staff", "customer", "admin"] as const) {
      expect(parseQrCode(posterQrCode(k, st), st)).toEqual({ ok: true, kind: k });
    }
  });

  it("เปลี่ยน QR แล้วใบเก่าใช้ไม่ได้ (rotated) · ชนิดอื่นไม่กระทบ", () => {
    const old = posterQrCode("staff", st);
    const next = rotateQr(st, "staff");
    expect(parseQrCode(old, next)).toEqual({ ok: false, reason: "rotated" });
    expect(parseQrCode(posterQrCode("customer", st), next)).toEqual({ ok: true, kind: "customer" });
    expect(next.rotated_at?.staff).toBeTruthy();
  });

  it("QR รายร้าน: อ่านได้รหัสร้าน · แก้รหัสร้านเอง = ใช้ไม่ได้ · เปลี่ยน QR รายร้าน = ใบเก่าใช้ไม่ได้", () => {
    const code = shopQrCode(PID, st) as string;
    expect(parseQrCode(code, st)).toEqual({ ok: true, kind: "shop", partnerId: PID });
    const [, , sig] = code.split(".");
    const forged = `shop.${Buffer.from(`99999999-2222-3333-4444-555555555555|${st.shop}`).toString("base64url")}.${sig}`;
    expect(parseQrCode(forged, st)).toEqual({ ok: false, reason: "invalid" });
    expect(parseQrCode(code, rotateQr(st, "shop"))).toEqual({ ok: false, reason: "rotated" });
    expect(shopQrCode("not-a-uuid", st)).toBeNull();
  });

  it("รหัสแปลก/ว่าง = invalid", () => {
    for (const c of ["", "staff", "staff.", "boss.abcdefgh", "staff.a.b", "shop.x.y", null, 42]) {
      expect(parseQrCode(c, st)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("ลิงก์ QR เปิดผ่าน LIFF ?cq=", () => {
    expect(companyQrLink("staff.abcdefgh")).toMatch(/\?cq=staff\.abcdefgh$/);
  });
});

describe("ลิงก์จากปุ่มเมนูคนที่ยังไม่ผูก (menu.staff / menu.customer)", () => {
  it("ใช้ได้เฉพาะพนักงาน/ลูกค้า · ไม่ผูกเลขรุ่น", async () => {
    const { parseQrCode } = await import("@/lib/line-company-qr");
    expect(parseQrCode("menu.staff", {})).toEqual({ ok: true, kind: "staff" });
    expect(parseQrCode("menu.customer", {})).toEqual({ ok: true, kind: "customer" });
    expect(parseQrCode("menu.admin", {}).ok).toBe(false);
    expect(parseQrCode("menu.shop", {}).ok).toBe(false);
    expect(parseQrCode("menu.staff.x", {}).ok).toBe(false);
  });
  it("ปุ่มเมนูคนทั่วไป = เปิดหน้ายืนยัน · คุยกับพนักงาน = postback เดิม", async () => {
    const { richMenuBody, DEFAULT_COMPANY_LAYOUT, verifyPageLink, companyReplyText } = await import("@/lib/line-company");
    const b = richMenuBody("guest", DEFAULT_COMPANY_LAYOUT, { liffId: "L" }) as { areas: { action: { type: string; uri?: string; data?: string } }[] };
    expect(b.areas.filter((a) => a.action.type === "uri").map((a) => a.action.uri)).toEqual([verifyPageLink("L", "staff"), verifyPageLink("L", "customer")]);
    expect(b.areas.some((a) => a.action.data === "cmp=talk")).toBe(true);
    expect(companyReplyText("unknown", "i_am_staff", null, "L")).toContain("cq=menu.staff");
  });
});
