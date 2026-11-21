import { describe, expect, it } from "vitest";
import {
  ADMIN_TABS, COMPANY_ACTIONS, COMPANY_MENU_KINDS, DEFAULT_COMPANY_LAYOUT, LABEL_MAX, PUBLISHED_MENU_KEYS, RICH_MENU_TAB_H, RICH_MENU_W,
  actionAllowed, actionsForKind, companyReplyText, menuGrid, menuKindFor, normalizeCompanyLayout, normalizeMenuButtons,
  parseCompanyPostback, richMenuBody, richMenuCell, richMenuSize, richMenuTabCell, visibleButtons,
} from "@/lib/line-company";
import { pickCompanyEvents } from "@/lib/line-company-server";

const U = "U" + "b".repeat(32);

describe("ไลน์บริษัท — เมนูล่างจอ", () => {
  it("ขนาดตามจำนวนปุ่ม: 1-3 = แถวเดียว · 4 = 2×2 · 5-6 = 3×2 (ขนาดที่ LINE รับ)", () => {
    expect(richMenuSize(2)).toMatchObject({ width: 2500, height: 843, cols: 2, rows: 1 });
    expect(richMenuSize(3)).toMatchObject({ height: 843, cols: 3, rows: 1 });
    expect(richMenuSize(4)).toMatchObject({ height: 1686, cols: 2, rows: 2 });
    expect(richMenuSize(6)).toMatchObject({ height: 1686, cols: 3, rows: 2 });
    expect(menuGrid(9)).toEqual({ cols: 3, rows: 2 });
  });

  it("ช่องปุ่มต่อกันพอดีเต็มรูป ไม่ซ้อน ไม่เว้น (ทั้งมีและไม่มีแถบแท็บ)", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) for (const tabs of [false, true]) {
      const { width, height, cols } = richMenuSize(n);
      const cells = Array.from({ length: n }, (_, i) => richMenuCell(i, n, tabs));
      const area = cells.reduce((s, c) => s + c.width * c.height, 0);
      const full = n % cols === 0;
      if (full) expect(area).toBe(width * (height - (tabs ? RICH_MENU_TAB_H : 0)));
      for (const c of cells) {
        expect(c.x + c.width).toBeLessThanOrEqual(width);
        expect(c.y + c.height).toBeLessThanOrEqual(height);
        expect(c.y).toBeGreaterThanOrEqual(tabs ? RICH_MENU_TAB_H : 0);
      }
    }
    expect(richMenuCell(3, 4)).toMatchObject({ x: 1250, y: 843, width: 1250, height: 843 });
    const tabs = ADMIN_TABS.map((_, i) => richMenuTabCell(i));
    expect(tabs[0].x).toBe(0);
    expect(tabs[2].x + tabs[2].width).toBe(RICH_MENU_W);
  });

  it("ค่าตั้งต้นตามผังเจ้าของ: พนักงาน เงินเดือน+ใบเตือน · ลูกค้า เช็คสถานะ+ตารางส่งงาน · 4 ปุ่ม", () => {
    expect(DEFAULT_COMPANY_LAYOUT.employee.map((b) => b.act).slice(0, 2)).toEqual(["payslip", "warning"]);
    expect(DEFAULT_COMPANY_LAYOUT.customer.map((b) => b.act).slice(0, 2)).toEqual(["orders", "schedule"]);
    expect(DEFAULT_COMPANY_LAYOUT.employee).toHaveLength(4);
    expect(DEFAULT_COMPANY_LAYOUT.customer).toHaveLength(4);
    expect(DEFAULT_COMPANY_LAYOUT.customer.some((b) => b.act === "talk")).toBe(true);
  });

  it("ตัวเมนูที่ส่ง LINE: ทุกปุ่มเป็น postback cmp=… · หน้าแอดมินมีแท็บ richmenuswitch 3 อัน · แถบแชทไม่เกิน 14 ตัว", () => {
    const L = DEFAULT_COMPANY_LAYOUT;
    for (const k of PUBLISHED_MENU_KEYS) {
      const body = richMenuBody(k, L) as { areas: { action: { type: string; data: string; richMenuAliasId?: string } }[]; chatBarText: string; size: { height: number } };
      const tabs = body.areas.filter((a) => a.action.type === "richmenuswitch");
      const posts = body.areas.filter((a) => a.action.type === "postback");
      expect(tabs).toHaveLength(k.startsWith("admin") ? 3 : 0);
      expect(posts.every((a) => a.action.data.startsWith("cmp="))).toBe(true);
      expect(body.chatBarText.length).toBeLessThanOrEqual(14);
    }
    const emp = richMenuBody("admin_employee", L) as { areas: { action: { data: string } }[] };
    expect(emp.areas.map((a) => a.action.data)).toContain("cmp=payslip");   // แท็บดูแบบพนักงาน = ปุ่มชุดพนักงาน
    expect(ADMIN_TABS.every((t) => /^[A-Za-z0-9_-]{1,32}$/.test(t.alias))).toBe(true);
  });
});

describe("ไลน์บริษัท — ปุ่มที่ตั้งเอง", () => {
  it("ค่าเพี้ยน/ว่าง = ค่าตั้งต้น", () => {
    expect(normalizeCompanyLayout(null)).toEqual(DEFAULT_COMPANY_LAYOUT);
    expect(normalizeMenuButtons("employee", "x")).toEqual(DEFAULT_COMPANY_LAYOUT.employee);
    expect(normalizeMenuButtons("employee", [{ act: "payslip", hidden: true }])).toEqual(DEFAULT_COMPANY_LAYOUT.employee);   // ไม่เหลือปุ่มที่โชว์
  });

  it("ตัดปุ่มซ้ำ/ปุ่มผิดชุด/คำสั่งแปลก · ชื่อยาวตัดที่ 20 ตัว · ชื่อว่าง = ชื่อตั้งต้น", () => {
    const out = normalizeMenuButtons("employee", [
      { act: "warning", label: "  ใบเตือน   ของฉัน ", hint: "x" },
      { act: "warning", label: "ซ้ำ" },
      { act: "orders", label: "ของลูกค้า" },
      { act: "drop_table", label: "แปลก" },
      { act: "payslip", label: "ก".repeat(40) },
      { act: "piecework", label: "" },
    ]);
    expect(out.map((b) => b.act)).toEqual(["warning", "payslip", "piecework"]);
    expect(out[0].label).toBe("ใบเตือน ของฉัน");
    expect(out[1].label).toHaveLength(LABEL_MAX);
    expect(out[2].label).toBe(COMPANY_ACTIONS.piecework.label);
  });

  it("โชว์ได้ไม่เกิน 6 ปุ่ม — ที่เกินซ่อนไว้ ไม่ลบ", () => {
    const acts = actionsForKind("customer");
    expect(acts.length).toBeGreaterThan(6);
    const out = normalizeMenuButtons("customer", acts.map((act) => ({ act })));
    expect(out).toHaveLength(acts.length);
    expect(visibleButtons(out)).toHaveLength(6);
    expect(out.slice(6).every((b) => b.hidden)).toBe(true);
  });
});

describe("ไลน์บริษัท — แยกคน/สิทธิ์ปุ่ม", () => {
  it("อ่านคำสั่งได้เฉพาะของไลน์บริษัท", () => {
    expect(parseCompanyPostback("cmp=payslip")).toBe("payslip");
    expect(parseCompanyPostback("cmp=drop_table")).toBeNull();
    expect(parseCompanyPostback("act=payslip")).toBeNull();
    expect(parseCompanyPostback("cmptab=admin")).toBeNull();   // กดแท็บเมนูแอดมิน = ไม่ใช่คำสั่ง
    expect(parseCompanyPostback("cmp=warning")).toBe("warning");
    expect(parseCompanyPostback(undefined)).toBeNull();
  });

  it("ถูกระงับ/ไม่รู้จัก เห็นเมนูกลาง", () => {
    expect(menuKindFor("admin")).toBe("admin");
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

  it("แอดมินกดได้ทุกปุ่มของพนักงาน/ลูกค้า/แอดมิน · คนอื่นกดปุ่มแอดมินไม่ได้", () => {
    expect(actionAllowed("admin", "payslip")).toBe(true);
    expect(actionAllowed("admin", "schedule")).toBe(true);
    expect(actionAllowed("admin", "overview")).toBe(true);
    expect(actionAllowed("admin", "i_am_staff")).toBe(false);
    expect(actionAllowed("employee", "overview")).toBe(false);
    expect(actionAllowed("customer", "all_orders")).toBe(false);
  });

  it("ข้อความตอบกลับไม่มีตัวเงิน", () => {
    for (const k of COMPANY_MENU_KINDS) for (const b of DEFAULT_COMPANY_LAYOUT[k]) {
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
