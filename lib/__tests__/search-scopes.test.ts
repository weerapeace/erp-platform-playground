import { describe, expect, it } from "vitest";
import { SEARCH_SCOPES, getSearchScope } from "@/lib/search-scopes";
import { COMMANDS, matchCommands } from "@/lib/search-commands";

describe("search-scopes: ค้นเฉพาะแอป", () => {
  it("รู้จัก scope payroll และไม่รู้จักค่ามั่ว", () => {
    expect(getSearchScope("payroll")?.appKey).toBe("payroll");
    expect(getSearchScope("nope")).toBeNull();
    expect(getSearchScope(null)).toBeNull();
  });

  it("ทุก scope ต้องมี วิธีค้นหา + ตัวอย่าง ครบ (ป๊อปอัปพึ่งข้อมูลนี้)", () => {
    for (const sc of Object.values(SEARCH_SCOPES)) {
      expect(sc.tips.length).toBeGreaterThan(0);
      expect(sc.examples.length).toBeGreaterThan(0);
      expect(sc.entities.length).toBeGreaterThan(0);
      expect(sc.placeholder).toBeTruthy();
    }
  });

  it("คำสั่งลัดใน scope payroll เห็นเฉพาะคำสั่งของ payroll · ค้นรวมเห็นทุกคำสั่ง", () => {
    const all = () => true;
    const inPayroll = matchCommands("เพิ่มพนักงาน", all, "payroll");
    expect(inPayroll.length).toBeGreaterThan(0);
    expect(inPayroll.every((x) => x.cmd.scope === "payroll")).toBe(true);
    // "สร้าง PO" เป็นของจัดซื้อ → ในแอป Payroll ต้องไม่โผล่
    expect(matchCommands("สร้าง PO", all, "payroll")).toHaveLength(0);
    // ค้นรวม → คำสั่ง payroll ก็โผล่ได้ (มีสิทธิ์)
    expect(matchCommands("เพิ่มพนักงาน", all).some((x) => x.cmd.id === "new-employee")).toBe(true);
  });

  it("คำสั่งของ payroll ทุกตัวชี้ไปใต้ /payroll และมีสิทธิ์กำกับ", () => {
    for (const cmd of COMMANDS.filter((c) => c.scope === "payroll")) {
      expect(cmd.href.startsWith("/payroll")).toBe(true);
      expect(cmd.perm).toBeTruthy();
    }
  });
});
