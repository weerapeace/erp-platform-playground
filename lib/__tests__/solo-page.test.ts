import { describe, expect, it } from "vitest";
import { cleanPagePath, isInsideSolo, labelFromPath, matchMenuForPath, pagePathFromSegments, soloUrl, stripSearch } from "@/lib/solo-page";

describe("แอปหน้าเดียว — path ของหน้า", () => {
  it("ทำความสะอาด path (ตัด query/hash/ท้าย /)", () => {
    expect(cleanPagePath("/design/pattern-tickets/?id=1#x")).toBe("/design/pattern-tickets");
    expect(cleanPagePath("design//pattern-tickets")).toBe("/design/pattern-tickets");
  });
  it("หน้าระบบ / แปลก / ว่าง = ใช้ไม่ได้", () => {
    for (const p of ["/", "", "/app/production", "/solo/x", "/api/menu", "/login", "/a/../b", "/x<script>"]) expect(cleanPagePath(p)).toBeNull();
  });
  it("segment ของ [...path]", () => {
    expect(pagePathFromSegments(["design", "pattern-tickets"])).toBe("/design/pattern-tickets");
    expect(pagePathFromSegments(["app", "tasks"])).toBeNull();
  });
});

describe("แอปหน้าเดียว — ที่อยู่ + ขอบเขต", () => {
  it("soloUrl เก็บ query ของหน้า ตัด embed/install เดิม แล้วใส่ install ตามสั่ง", () => {
    expect(soloUrl("/design/pattern-tickets", { search: "?id=5&embed=1&install=1" })).toBe("/solo/design/pattern-tickets?id=5");
    expect(soloUrl("/design/pattern-tickets", { install: true })).toBe("/solo/design/pattern-tickets?install=1");
    expect(stripSearch("?device=phone&q=a")).toBe("q=a");
  });
  it("หน้าเดียวกัน/หน้าย่อย = อยู่ในแอป · หน้าอื่น/ชื่อขึ้นต้นเหมือนกัน = นอกแอป", () => {
    expect(isInsideSolo("/design/pattern-tickets", "/design/pattern-tickets")).toBe(true);
    expect(isInsideSolo("/design/pattern-tickets/", "/design/pattern-tickets")).toBe(true);
    expect(isInsideSolo("/design/pattern-tickets/abc", "/design/pattern-tickets")).toBe(true);
    expect(isInsideSolo("/design/pattern-tickets-old", "/design/pattern-tickets")).toBe(false);
    expect(isInsideSolo("/master/skus", "/design/pattern-tickets")).toBe(false);
  });
  it("หาเมนูที่ตรงที่สุด", () => {
    const items = [{ href: "/master", label: "A" }, { href: "/master/skus", label: "B" }, { href: "/design/pattern-tickets", label: "C" }];
    expect(matchMenuForPath(items, "/design/pattern-tickets")?.label).toBe("C");
    expect(matchMenuForPath(items, "/master/skus/123")?.label).toBe("B");
    expect(matchMenuForPath(items, "/other")).toBeNull();
    expect(labelFromPath("/design/pattern-tickets")).toBe("Pattern Tickets");
  });
});
