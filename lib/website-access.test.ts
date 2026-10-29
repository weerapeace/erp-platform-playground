import { describe, expect, it } from "vitest";
import { DESIGN_ADVANCED_PERM, DESIGN_PUBLISH_PERM, DESIGN_TOPICS, designAccess, designTopicKeys, designTopicPerm } from "./website-access";
import { DESIGN_PAGE_KEYS } from "./website-design-nav";
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

describe("👷 หน้าดีไซน์บางหัวข้อ", () => {
  const of = (keys: string[]) => designAccess((k) => keys.includes(k));
  it("หัวข้อ = หน้าดีไซน์ทุกหน้า ยกเว้นประวัติ (เพิ่มหน้าใหม่แล้วต้องเพิ่มที่นี่ด้วย)", () => {
    expect([...DESIGN_TOPICS].sort()).toEqual(DESIGN_PAGE_KEYS.filter((k) => k !== "history").sort());
  });
  it("แก้ได้ (design.edit) = ทุกหัวข้อ + เผยแพร่ + ละเอียด (แบบเดิม)", () => {
    expect(of([websitePerm("design", "edit")])).toMatchObject({ full: true, publish: true, advanced: true, topics: [...DESIGN_TOPICS] });
  });
  it("ดูได้ + หัวข้อ = แก้บางหัวข้อ · ไม่มีดูได้ = ไม่นับหัวข้อ", () => {
    const a = of([websitePerm("design", "view"), designTopicPerm("menu"), designTopicPerm("listing")]);
    expect(a).toEqual({ full: false, topics: ["menu", "listing"], publish: false, advanced: false });
    expect(of([designTopicPerm("menu"), DESIGN_PUBLISH_PERM]).topics).toEqual([]);
    expect(of([websitePerm("design", "view"), designTopicPerm("menu"), DESIGN_PUBLISH_PERM, DESIGN_ADVANCED_PERM])).toMatchObject({ publish: true, advanced: true });
  });
  it("ไม่มีหัวข้อ = เผยแพร่/ละเอียดไม่มีผล", () => {
    expect(of([websitePerm("design", "view"), DESIGN_PUBLISH_PERM, DESIGN_ADVANCED_PERM])).toEqual({ full: false, topics: [], publish: false, advanced: false });
  });
  it("designTopicKeys ตั้งครบทุกคีย์ · ว่าง = ปิดหมด", () => {
    const k = designTopicKeys(["menu"], true, false);
    expect(k[designTopicPerm("menu")]).toBe(true);
    expect(k[designTopicPerm("colors")]).toBe(false);
    expect([k[DESIGN_PUBLISH_PERM], k[DESIGN_ADVANCED_PERM]]).toEqual([true, false]);
    expect(Object.values(designTopicKeys([], true, true)).every((v) => v === false)).toBe(true);
  });
});
