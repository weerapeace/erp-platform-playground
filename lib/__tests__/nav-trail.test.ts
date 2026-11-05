import { describe, it, expect, beforeEach } from "vitest";
import { recordVisit, previousEntry, truncateTrail, readTrail } from "@/lib/nav-trail";

// sessionStorage จำลอง (เทสต์รันใน node)
const mem = new Map<string, string>();
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

describe("nav-trail (ปุ่มย้อนกลับไปหน้าที่เข้ามา)", () => {
  beforeEach(() => mem.clear());

  it("ย้อนไปหน้าก่อนหน้าที่ไม่ใช่หน้านี้ (พร้อม query เดิม)", () => {
    recordVisit("/tasks/content-calendar", "?cal=plan");
    recordVisit("/admin/platform-accounts", "");
    expect(previousEntry("/admin/platform-accounts")?.entry).toEqual({ path: "/tasks/content-calendar", search: "?cal=plan" });
  });

  it("ไปเชื่อม Facebook แล้วกลับมาหน้าเดิม (query ใหม่) — ไม่นับเป็นก้าวใหม่ ยังย้อนกลับหน้าเดิมได้", () => {
    recordVisit("/master/platform-catalog", "");
    recordVisit("/admin/platform-accounts", "");
    recordVisit("/admin/platform-accounts", "?meta_connected=1");
    expect(readTrail()).toHaveLength(2);
    expect(previousEntry("/admin/platform-accounts")?.entry.path).toBe("/master/platform-catalog");
  });

  it("กดย้อนกลับแล้วตัดทาง — ไม่วนกลับมาหน้าที่เพิ่งออก", () => {
    recordVisit("/a", ""); recordVisit("/b", ""); recordVisit("/c", "");
    const prev = previousEntry("/c")!;
    truncateTrail(prev.index);
    recordVisit("/b", "");
    expect(readTrail().map((e) => e.path)).toEqual(["/a", "/b"]);
    expect(previousEntry("/b")?.entry.path).toBe("/a");
  });

  it("แท็บใหม่ไม่มีประวัติ = null (ปุ่มจะปิดแท็บ/ใช้ทางสำรอง)", () => {
    recordVisit("/admin/platform-accounts", "");
    expect(previousEntry("/admin/platform-accounts")).toBeNull();
  });
});
