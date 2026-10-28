import { describe, it, expect } from "vitest";
import { DESIGN_GROUPS, DESIGN_PAGES, DESIGN_PAGE_KEYS, dirtyDesignPages, normTitle, searchDesign } from "../website-design-nav";
import { DEFAULT_THEME } from "../website-theme";

/** 🧭 สารบัญหน้าดีไซน์ — ทุกค่าในธีมต้องมีหน้าอยู่ (จุดส้มจะได้ขึ้นถูกหน้า) */
describe("website-design-nav", () => {
  const covered = (path: string) => DESIGN_PAGE_KEYS.some((k) => DESIGN_PAGES[k].paths.some((p) => path === p || path.startsWith(p + ".") || p.startsWith(path + ".")));

  it("ค่าชั้นบนของธีม + ทุกช่องใน theme.page + logo มีหน้าดีไซน์ดูแล", () => {
    const missing: string[] = [];
    for (const k of Object.keys(DEFAULT_THEME)) if (!covered(k)) missing.push(k);
    for (const k of Object.keys(DEFAULT_THEME.page)) if (!covered(`page.${k}`)) missing.push(`page.${k}`);
    for (const k of Object.keys(DEFAULT_THEME.page.areaParts)) if (!covered(`page.areaParts.${k}`)) missing.push(`page.areaParts.${k}`);
    for (const k of Object.keys(DEFAULT_THEME.logo)) if (!covered(`logo.${k}`)) missing.push(`logo.${k}`);
    expect(missing).toEqual([]);
  });

  it("ทุกหน้าอยู่ในหมวดเดียวพอดี", () => {
    const inGroups = DESIGN_GROUPS.flatMap((g) => g.pages);
    expect([...inGroups].sort()).toEqual([...DESIGN_PAGE_KEYS].sort());
    expect(new Set(inGroups).size).toBe(inGroups.length);
  });

  it("จุดส้ม: แก้ค่าไหน หน้านั้นขึ้น (หน้าอื่นไม่ขึ้น)", () => {
    const base = JSON.parse(JSON.stringify(DEFAULT_THEME));
    expect(dirtyDesignPages(base, DEFAULT_THEME)).toEqual([]);
    const t1 = { ...base, page: { ...base.page, transition: "zoom" } };
    expect(dirtyDesignPages(t1, DEFAULT_THEME)).toEqual(["motion"]);
    const t2 = { ...base, logo: { ...base.logo, faviconKey: "x.png" } };
    expect(dirtyDesignPages(t2, DEFAULT_THEME)).toEqual(["logo"]);
    const t3 = { ...base, page: { ...base.page, areaParts: { ...base.page.areaParts, cart: { "cart.title": { all: { size: 110 } } } } } };
    expect(dirtyDesignPages(t3, DEFAULT_THEME)).toEqual(["cart"]);
  });

  it("ค้นหา: เจอการ์ดจากคำในช่อง · ตัดอีโมจิ · ไม่เจอ = ว่าง", () => {
    expect(searchDesign("favicon")[0]).toMatchObject({ page: "logo", card: "รูปโลโก้ & ไอคอน" });
    expect(searchDesign("ส่งฟรี").some((h) => h.page === "cart" && h.card === "แถบ “อีก ฿X ส่งฟรี”")).toBe(true);
    expect(searchDesign("เมนู")[0]).toMatchObject({ page: "menu" });
    expect(searchDesign("zzzz-ไม่มี")).toEqual([]);
    expect(normTitle("🧺  หน้าตาตะกร้า")).toBe("หน้าตาตะกร้า");
  });
});
