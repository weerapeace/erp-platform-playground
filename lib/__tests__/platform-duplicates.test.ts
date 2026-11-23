/**
 * เทสต์สินค้าซ้ำบนร้าน (lib/platform-duplicates) — เจ้าของเลือก 2026-11-23 วิธี B + ข้อ 1-5
 */
import { describe, it, expect } from "vitest";
import { buildDuplicateGroups, dupTags, pickKeep, type DupListing } from "../platform-duplicates";

const L = (p: Partial<DupListing> & { id: string }): DupListing => ({ externalId: p.id, status: "unlist", price: 100, title: null, image: null, updateTime: null, sales90: 0, byErp: false, ...p });

describe("pickKeep (ข้อ 1)", () => {
  it("เปิดขายอยู่ก่อน · แล้วยอดขาย 90 วัน · แล้วอัปเดตล่าสุด · แล้วรหัสเก่ากว่า", () => {
    expect(pickKeep([L({ id: "a" }), L({ id: "b", status: "normal" })])).toEqual({ keepId: "b", keepReason: "ตัวเดียวที่เปิดขาย" });
    expect(pickKeep([L({ id: "a", status: "normal", sales90: 2 }), L({ id: "b", status: "normal", sales90: 15 })]).keepId).toBe("b");
    expect(pickKeep([L({ id: "a", updateTime: 10 }), L({ id: "b", updateTime: 99 })])).toEqual({ keepId: "b", keepReason: "อัปเดตล่าสุด" });
    expect(pickKeep([L({ id: "57021919359" }), L({ id: "44821923329" })]).keepId).toBe("44821923329");
  });
});

describe("กลุ่มซ้ำ", () => {
  it("แท็ก: เปิดขายซ้อน / ไม่มีตัวเปิดขาย / ระบบสร้างซ้ำ", () => {
    expect(dupTags([L({ id: "a", status: "normal" }), L({ id: "b", status: "normal" })])).toEqual(["two_selling"]);
    expect(dupTags([L({ id: "a" }), L({ id: "b", byErp: true })])).toEqual(["none_selling", "erp_made"]);
  });
  it("รวมเฉพาะรุ่นที่มี ≥ 2 รายการ · เปิดขายซ้อนขึ้นก่อน · กลุ่มที่ซ่อนติดป้าย ignored", () => {
    const rows = [
      { ...L({ id: "1", status: "normal" }), parentId: "P1" }, { ...L({ id: "2" }), parentId: "P1" },
      { ...L({ id: "3", status: "normal" }), parentId: "P2" }, { ...L({ id: "4", status: "normal" }), parentId: "P2" },
      { ...L({ id: "5" }), parentId: "P3" },
    ];
    const g = buildDuplicateGroups(rows, { P1: { code: "LY22", name: null, cover: null }, P2: { code: "WL11", name: null, cover: null } }, new Set(["P1"]));
    expect(g.map((x) => x.code)).toEqual(["WL11", "LY22"]);
    expect(g[1]).toMatchObject({ ignored: true, keepId: "1" });
  });
});
