import { describe, expect, it } from "vitest";
import { isLineSelfPage, mySubmissionTotals, selfSlipDetail, wageThisMonth } from "@/lib/line-self-view";
import { liffPageLink, richMenuBody, DEFAULT_COMPANY_LAYOUT, companyReplyText } from "@/lib/line-company";

const base = { id: "s1", payslip_no: "PS-1", period_name: "ต.ค.", start_date: "2026-10-01", end_date: "2026-10-31" };

describe("ไลน์บริษัท รอบ 3 — หน้าเล็กพนักงาน", () => {
  it("รู้จักแค่ 3 หน้า", () => {
    expect(isLineSelfPage("payslip")).toBe(true);
    expect(isLineSelfPage("piecework")).toBe(true);
    expect(isLineSelfPage("orders")).toBe(false);
    expect(isLineSelfPage(undefined)).toBe(false);
  });

  it("สลิปในไลน์ = กติกาสลิปกระดาษ: ไม่โชว์เงินเดือน · รวมรายได้จากบรรทัดที่เห็น · ยอดสุทธิไทยเข้ารหัส", () => {
    const d = selfSlipDetail(base, { line: { base_salary: 15000, overtime_amount: 225.96, social_security_employee: 750 }, total_deduction: 750, net_pay: 14475.96, lang: "th" });
    expect(d.earnings.map((r) => r.label)).toEqual(["OT"]);
    expect(d.earnings_total).toBe(225.96);
    expect(d.deduction_total).toBe(750);
    expect(d.net_is_code).toBe(true);
    expect(d.net_display).not.toMatch(/\d/);
    expect(JSON.stringify(d)).not.toContain("15000");
    const en = selfSlipDetail(base, { line: { base_salary: 15000 }, total_deduction: 0, net_pay: 15000, lang: "en" });
    expect(en.net_display).toBe("15,000");
    expect(en.earnings).toEqual([]);
  });

  it("ค่าแรงของฉัน: นับรอบที่ลงชื่อฉัน · รอบไม่มีชื่อนับเฉพาะใบที่ทำคนเดียว", () => {
    const people = new Map([["w1", 1], ["w2", 2]]);
    const subs = [
      { wo_id: "w1", craftsman_id: null, qty: 10, wage: 100, submitted_at: "2026-11-05" },
      { wo_id: "w2", craftsman_id: null, qty: 5, wage: 50, submitted_at: "2026-11-05" },
      { wo_id: "w2", craftsman_id: "me", qty: 3, wage: 30, submitted_at: "2026-11-06" },
      { wo_id: "w2", craftsman_id: "other", qty: 4, wage: 40, submitted_at: "2026-11-06" },
      { wo_id: "w1", craftsman_id: "me", qty: 2, wage: 20, submitted_at: "2026-10-30" },
    ];
    const m = mySubmissionTotals("me", people, subs);
    expect(m.get("w1")).toEqual({ qty: 12, wage: 120 });
    expect(m.get("w2")).toEqual({ qty: 3, wage: 30 });
    expect(wageThisMonth("me", people, subs, new Date("2026-11-20T03:00:00Z"))).toBe(130);
  });

  it("ปุ่มเงินเดือน/ใบเตือน/งานเหมา = เปิดหน้าเล็กทันทีเมื่อมีรหัส LIFF · ไม่มี = postback เดิม", () => {
    const withLiff = richMenuBody("employee", DEFAULT_COMPANY_LAYOUT, { liffId: "L-1" }) as { areas: { action: { type: string; uri?: string; data?: string } }[] };
    expect(withLiff.areas.filter((a) => a.action.type === "uri").map((a) => a.action.uri)).toEqual([liffPageLink("L-1", "payslip"), liffPageLink("L-1", "warning"), liffPageLink("L-1", "piecework")]);
    expect(withLiff.areas.some((a) => a.action.data === "cmp=help")).toBe(true);
    const noLiff = richMenuBody("employee", DEFAULT_COMPANY_LAYOUT) as { areas: { action: { type: string } }[] };
    expect(noLiff.areas.every((a) => a.action.type === "postback")).toBe(true);
  });

  it("กดจากเมนูเก่า (postback) = ตอบลิงก์ ไม่พิมพ์ตัวเงินในแชต", () => {
    const txt = companyReplyText("employee", "payslip", "เอ", "L-1") ?? "";
    expect(txt).toContain("https://liff.line.me/L-1?me=payslip");
    expect(txt).not.toMatch(/฿|บาท/);
    expect(companyReplyText("customer", "payslip", null, "L-1")).not.toContain("liff");
  });
});
