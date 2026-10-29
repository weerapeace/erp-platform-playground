import { describe, it, expect } from "vitest";
import { applyDesignPages, designCardLevel } from "../website-design-nav";
import { DESIGN_GROUPS, DESIGN_PAGES, DESIGN_PAGE_KEYS, PREVIEW_PART_RULES, dirtyDesignPages, normTitle, previewFocusOf, previewRuleOf, searchDesign } from "../website-design-nav";
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

  it("คลิกในพรีวิว: ชิ้นเจาะจงชนะชิ้นกว้าง · การ์ดที่อ้างมีอยู่จริงในหน้านั้น", () => {
    expect(previewRuleOf("hd.logo")?.page).toBe("logo");
    expect(previewRuleOf("hd.link")?.page).toBe("menu");
    expect(previewRuleOf("hd.bar")?.page).toBe("header");
    expect(previewRuleOf("pc.name")?.page).toBe("card");
    expect(previewRuleOf("block-x")).toBeNull();
    for (const r of PREVIEW_PART_RULES) {
      if (!r.card) continue;
      const titles = DESIGN_PAGES[r.page].cards.map((c) => normTitle(c.title));
      expect(titles, `${r.prefix} → ${r.card}`).toContain(normTitle(r.card));
    }
    // กฎเจาะจงต้องมาก่อนกฎกว้างที่ครอบมัน (ไม่งั้นไม่มีวันถูกเลือก)
    PREVIEW_PART_RULES.forEach((r, i) => {
      const earlier = PREVIEW_PART_RULES.slice(0, i).find((x) => r.prefix.startsWith(x.prefix));
      expect(earlier, `${r.prefix} ถูก ${earlier?.prefix} บังอยู่`).toBeUndefined();
    });
    expect(previewFocusOf("footer")).toEqual(["ft."]);
    expect(previewFocusOf("colors")).toEqual([]);
  });
});

describe("👷 คัดค่าเฉพาะหัวข้อ (พนักงานแก้บางหัวข้อ)", () => {
  it("ทับเฉพาะ path ของหน้าที่เลือก · หน้าอื่นคงค่าเดิม · ไม่แตะต้นฉบับ", () => {
    const base = structuredClone(DEFAULT_THEME);
    const src = structuredClone(DEFAULT_THEME);
    src.colors.brand = "#123456";
    src.menu = { ...src.menu, items: [{ label: "ทดสอบ", href: "/x" }] } as unknown as typeof src.menu;
    (src.page as unknown as Record<string, unknown>).festive = { kind: "snow" };
    const out = applyDesignPages(base, src, ["menu"]);
    expect(out.menu).toEqual(src.menu);
    expect(out.colors.brand).toBe(DEFAULT_THEME.colors.brand);
    expect((out.page as unknown as Record<string, unknown>).festive).toEqual((DEFAULT_THEME.page as unknown as Record<string, unknown>).festive);
    expect(base.menu).toEqual(DEFAULT_THEME.menu);
    // path ซ้อน (page.festive) ของหัวข้อแคมเปญ
    const camp = applyDesignPages(base, src, ["campaign"]);
    expect((camp.page as unknown as Record<string, unknown>).festive).toEqual({ kind: "snow" });
    expect(camp.menu).toEqual(DEFAULT_THEME.menu);
  });
  it("ระดับการ์ด: ปรับละเอียด = advanced · ใช้สิทธิ์เต็ม = full · การ์ดทั่วไป = null (หัวการ์ดมีอีโมจิได้)", () => {
    expect(designCardLevel("🎨 ปรับสีละเอียด")).toBe("advanced");
    expect(designCardLevel("ปรับละเอียดทีละชิ้น")).toBe("advanced");
    expect(designCardLevel("⏰ ตั้งเวลาเผยแพร่")).toBe("full");
    expect(designCardLevel("🎨 ธีมทั้งชุด (กดครั้งเดียว)")).toBe("full");
    expect(designCardLevel("เมนูด้านบน")).toBeNull();
    expect(designCardLevel("สี")).toBeNull();
  });
});
