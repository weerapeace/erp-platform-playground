import { describe, expect, it } from "vitest";
import { addPageView, bangkokDay, cleanPageViewItems, matchMenuLabel, normalizePagePath, type PageViewItem } from "@/lib/page-views";

describe("lib/page-views — บันทึกการเข้าใช้หน้า", () => {
  it("ทำ path มาตรฐาน: ตัด query/hash · รหัสรายการ → :id · ไม่นับหน้าล็อกอิน/หน้าทดลอง/API", () => {
    expect(normalizePagePath("/master/skus?open=abc&q=กระเป๋า")).toBe("/master/skus");
    expect(normalizePagePath("/tasks/0d4f3a8e-1111-4c4c-9a9a-aaaaaaaaaaaa/edit#x")).toBe("/tasks/:id/edit");
    expect(normalizePagePath("/purchasing/po/12345")).toBe("/purchasing/po/:id");
    expect(normalizePagePath("/master/work-board/")).toBe("/master/work-board");
    expect(normalizePagePath("/")).toBe("/");
    for (const p of ["/login", "/zz-audit-preview", "/api/x", "/auth/callback", "", null, "nope"]) expect(normalizePagePath(p)).toBeNull();
  });
  it("วันที่ตามเวลาไทย (ตี 1 ไทย = วันใหม่แล้ว แม้ UTC ยังเป็นเมื่อวาน)", () => {
    expect(bangkokDay("2026-11-06T18:30:00Z")).toBe("2026-11-07");
    expect(bangkokDay("2026-11-06T16:59:00Z")).toBe("2026-11-06");
  });
  it("รวมหน้าเดียวกันวันเดียวกันเป็นก้อนเดียว", () => {
    const buf = new Map<string, PageViewItem>();
    addPageView(buf, "/a", new Date("2026-11-07T01:00:00Z"));
    addPageView(buf, "/a", new Date("2026-11-07T02:00:00Z"));
    addPageView(buf, "/b", new Date("2026-11-07T02:00:00Z"));
    expect([...buf.values()].map((x) => [x.path, x.views, x.first_at, x.last_at])).toEqual([
      ["/a", 2, "2026-11-07T01:00:00.000Z", "2026-11-07T02:00:00.000Z"], ["/b", 1, "2026-11-07T02:00:00.000Z", "2026-11-07T02:00:00.000Z"],
    ]);
  });
  it("ฝั่งเซิร์ฟเวอร์ไม่เชื่อค่าจากเครื่องผู้ใช้: path ซ้ำมาตรฐาน · จำนวน 1–500 · เวลาอนาคต/เก่าเกิน · ของเสียทิ้ง", () => {
    const now = new Date("2026-11-07T05:00:00Z");
    const out = cleanPageViewItems([
      { path: "/x?q=1", views: 9999, first_at: "2026-11-07T04:00:00Z", last_at: "2030-01-01T00:00:00Z" },
      { path: "/old", views: 1, first_at: "2026-10-01T00:00:00Z", last_at: "2026-10-01T00:00:00Z" },
      { path: "/login", views: 1 }, "junk", null, { path: "/y", views: -5 },
    ], now);
    expect(out).toEqual([
      { day: "2026-11-07", path: "/x", views: 500, first_at: "2026-11-07T04:00:00.000Z", last_at: "2026-11-07T05:00:00.000Z" },
      { day: "2026-11-07", path: "/y", views: 1, first_at: "2026-11-07T05:00:00.000Z", last_at: "2026-11-07T05:00:00.000Z" },
    ]);
    expect(cleanPageViewItems("nope")).toEqual([]);
  });
  it("ชื่อหน้าจากเมนู: ตรงตัวก่อน แล้วเมนูที่ยาวที่สุดที่เป็นต้นทาง", () => {
    const menu = [
      { href: "/master/skus", label: "SKU", section: "สินค้า" },
      { href: "/master", label: "ข้อมูลหลัก", section: null },
      { href: "/master/skus/import?x=1", label: "นำเข้า SKU", section: "สินค้า" },
      { href: "/", label: "หน้าแรก" }, { href: null, label: "ไม่มีลิงก์" },
    ];
    expect(matchMenuLabel("/master/skus", menu)).toEqual({ label: "SKU", section: "สินค้า" });
    expect(matchMenuLabel("/master/skus/:id", menu)).toEqual({ label: "SKU", section: "สินค้า" });
    expect(matchMenuLabel("/master/skus/import", menu)).toEqual({ label: "นำเข้า SKU", section: "สินค้า" });
    expect(matchMenuLabel("/master/skusx", menu)).toEqual({ label: "ข้อมูลหลัก", section: null });
    expect(matchMenuLabel("/tasks", menu)).toBeNull();
  });
});
