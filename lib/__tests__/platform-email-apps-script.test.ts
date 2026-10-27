import { describe, expect, it } from "vitest";
import { buildAppsScript, DONE_LABEL } from "@/lib/platform-email/apps-script";

const base = { endpoint: "https://erp.example/api/platform-email/inbound", key: "k3y\"x", searchQuery: "from:(shopee OR lazada)", intervalMin: 15, backfillDays: 60 };

describe("buildAppsScript", () => {
  it("ฝังปลายทาง/กุญแจ/คำค้นแบบปลอดภัย (escape เครื่องหมายคำพูด)", () => {
    const s = buildAppsScript(base);
    expect(s).toContain('const ERP_URL = "https://erp.example/api/platform-email/inbound";');
    expect(s).toContain('const ERP_KEY = "k3y\\"x";');
    expect(s).toContain('const SEARCH = "from:(shopee OR lazada)";');
    expect(s).toContain(`const LABEL_DONE = "${DONE_LABEL}";`);
  });
  it("มีฟังก์ชันที่คู่มือบอกให้กด", () => {
    const s = buildAppsScript(base);
    for (const fn of ["function setup()", "function stop()", "function testConnection()", "function sendNewMails()"]) expect(s).toContain(fn);
  });
  it("ความถี่นอกชุดที่ Google รองรับ → 15 นาที · ย้อนหลังถูกบีบ 1–365", () => {
    expect(buildAppsScript({ ...base, intervalMin: 7 })).toContain("const EVERY_MINUTES = 15;");
    expect(buildAppsScript({ ...base, intervalMin: 60 })).toContain("const EVERY_MINUTES = 60;");
    expect(buildAppsScript({ ...base, backfillDays: 9999 })).toContain("const BACKFILL_DAYS = 365;");
  });
  it("เป็น JavaScript ที่แปลได้", () => {
    expect(() => new Function(buildAppsScript(base))).not.toThrow();
  });
});
