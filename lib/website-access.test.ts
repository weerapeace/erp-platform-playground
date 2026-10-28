import { describe, expect, it } from "vitest";
import { nextWebsiteLevel, websiteApiGroups, websiteGroupOfTab, websiteLevel, websiteLevelKeys, websitePerm, WEBSITE_GROUP_PERMS, WEBSITE_GROUPS } from "./website-access";

describe("website-access", () => {
  it("แท็บทุกตัวอยู่กลุ่มเดียว", () => {
    const tabs = WEBSITE_GROUPS.flatMap((g) => g.tabs);
    expect(new Set(tabs).size).toBe(tabs.length);
    expect(tabs).toHaveLength(20);
    expect(websiteGroupOfTab("design")).toBe("design");
    expect(websiteGroupOfTab("orders")).toBe("orders");
    expect(websiteGroupOfTab("nope")).toBeNull();
  });

  it("คีย์สิทธิ์ (สถิติมีแค่ดู)", () => {
    expect(WEBSITE_GROUP_PERMS).toHaveLength(11);
    expect(websitePerm("stats", "edit")).toBe("website.stats.view");
    expect(websitePerm("design", "edit")).toBe("website.design.edit");
  });

  it("ระดับ ↔ คีย์", () => {
    const has = (s: Set<string>) => (k: string) => s.has(k);
    expect(websiteLevel(has(new Set()), "design")).toBe("none");
    expect(websiteLevel(has(new Set(["website.design.view"])), "design")).toBe("view");
    expect(websiteLevel(has(new Set(["website.design.edit"])), "design")).toBe("edit");
    expect(websiteLevelKeys("design", "edit")).toEqual({ "website.design.view": true, "website.design.edit": true });
    expect(websiteLevelKeys("design", "none")).toEqual({ "website.design.view": false, "website.design.edit": false });
    expect(websiteLevelKeys("stats", "view")).toEqual({ "website.stats.view": true });
    expect(nextWebsiteLevel("design", "view")).toBe("edit");
    expect(nextWebsiteLevel("stats", "view")).toBe("none");
  });

  it("route API → กลุ่ม (prefix ยาวสุดก่อน)", () => {
    expect(websiteApiGroups("/api/website/theme/versions")).toEqual(["design"]);
    expect(websiteApiGroups("/api/website/members/tiers")).toEqual(["promos", "orders"]);
    expect(websiteApiGroups("/api/website/members/login-settings")).toEqual(["settings"]);
    expect(websiteApiGroups("/api/website/members")).toEqual(["orders"]);
    expect(websiteApiGroups("/api/website/listings/grid")).toEqual(["products"]);
    expect(websiteApiGroups("/api/website/tag-categories")).toBeNull();
    expect(websiteApiGroups("/api/website/product-png")).toBeNull();
    expect(websiteApiGroups("/api/website/listings/images")).toBeNull();
    expect(websiteApiGroups("/api/website/listings/catalog")).toEqual(["products"]);
    expect(websiteApiGroups("/api/other")).toBeNull();
  });
});
