import { describe, expect, it } from "vitest";
import {
  COMPANY_MENUS, COMPANY_MENU_KINDS, RICH_MENU_W, actionAllowed, companyReplyText, menuKindFor,
  parseCompanyPostback, richMenuBody, richMenuCell, richMenuSize,
} from "@/lib/line-company";
import { pickCompanyEvents } from "@/lib/line-company-server";

const U = "U" + "b".repeat(32);

describe("ไลน์บริษัท — เมนูล่างจอ", () => {
  it("3 ปุ่ม = 1 แถว · 6 ปุ่ม = 2 แถว (ขนาดที่ LINE รับ)", () => {
    expect(richMenuSize("guest")).toEqual({ width: 2500, height: 843, rows: 1 });
    expect(richMenuSize("employee")).toEqual({ width: 2500, height: 1686, rows: 2 });
    expect(richMenuSize("customer").height).toBe(1686);
  });

  it("ช่องปุ่มต่อกันพอดีเต็มความกว้าง ไม่ซ้อน ไม่เว้น", () => {
    const row = [0, 1, 2].map(richMenuCell);
    expect(row[0].x).toBe(0);
    expect(row[0].x + row[0].width).toBe(row[1].x);
    expect(row[1].x + row[1].width).toBe(row[2].x);
    expect(row[2].x + row[2].width).toBe(RICH_MENU_W);
    expect(richMenuCell(3)).toMatchObject({ x: 0, y: 843 });
  });

  it("ตัวเมนูที่ส่ง LINE: ทุกปุ่มเป็น postback cmp=… · ข้อความแถบแชทไม่เกิน 14 ตัว", () => {
    for (const k of COMPANY_MENU_KINDS) {
      const body = richMenuBody(k) as { areas: { action: { type: string; data: string } }[]; chatBarText: string };
      expect(body.areas).toHaveLength(COMPANY_MENUS[k].buttons.length);
      expect(body.areas.every((a) => a.action.type === "postback" && a.action.data.startsWith("cmp="))).toBe(true);
      expect(body.chatBarText.length).toBeLessThanOrEqual(14);
    }
  });
});

describe("ไลน์บริษัท — แยกคน/สิทธิ์ปุ่ม", () => {
  it("อ่านคำสั่งได้เฉพาะของไลน์บริษัท", () => {
    expect(parseCompanyPostback("cmp=payslip")).toBe("payslip");
    expect(parseCompanyPostback("cmp=drop_table")).toBeNull();
    expect(parseCompanyPostback("act=payslip")).toBeNull();
    expect(parseCompanyPostback(undefined)).toBeNull();
  });

  it("ถูกระงับ/ไม่รู้จัก เห็นเมนูกลาง", () => {
    expect(menuKindFor("employee")).toBe("employee");
    expect(menuKindFor("customer")).toBe("customer");
    expect(menuKindFor("blocked")).toBe("guest");
    expect(menuKindFor("unknown")).toBe("guest");
  });

  it("กดปุ่มพนักงานจากเมนูเก่าที่ค้าง (ไม่ใช่พนักงานแล้ว) = ไม่ได้ข้อมูล", () => {
    expect(actionAllowed("unknown", "payslip")).toBe(false);
    expect(actionAllowed("customer", "payslip")).toBe(false);
    expect(actionAllowed("employee", "orders")).toBe(false);
    expect(companyReplyText("unknown", "payslip")).toMatch(/ใช้ไม่ได้แล้ว/);
    expect(companyReplyText("blocked", "orders")).toMatch(/ระงับ/);
  });

  it("ข้อความตอบกลับไม่มีตัวเงิน", () => {
    for (const k of COMPANY_MENU_KINDS) for (const b of COMPANY_MENUS[k].buttons) {
      const who = k === "guest" ? "unknown" : k;
      const text = companyReplyText(who, b.act, "สมชาย") ?? "";
      expect(text).not.toMatch(/฿|\d{1,3},\d{3}|บาท/);
    }
  });
});

describe("ไลน์บริษัท — เลือก event", () => {
  it("เอาแชท 1:1 (รวมกดปุ่ม postback) · ไม่เอากลุ่ม", () => {
    const events = [
      { type: "postback", source: { type: "user", userId: U }, postback: { data: "cmp=talk" } },
      { type: "message", source: { type: "user", userId: U }, message: { id: "1", type: "text", text: "hi" } },
      { type: "message", source: { type: "group", groupId: "Cxxxxxxxxxx", userId: U }, message: { id: "2", type: "text" } },
      { type: "join", source: { type: "user", userId: U } },
      { type: "message", source: { type: "user", userId: "bad" }, message: { id: "3", type: "text" } },
    ];
    expect(pickCompanyEvents(events).map((e) => e.type)).toEqual(["postback", "message"]);
  });
});
