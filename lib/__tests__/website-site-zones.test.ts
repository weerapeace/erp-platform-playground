import { describe, it, expect } from "vitest";
import { normalizeSiteZones, siteZoneOf, siteZoneBarShown, siteZoneHref, cleanSiteZonePath, stripLangPath, defaultSiteZones, SITE_ZONE_MAX } from "../website-site-zones";
import { normalizeTheme, DEFAULT_THEME } from "../website-theme";

/** ตัวทำความสะอาดเมนูปลอม (ของจริงส่ง normalizeMenuItems ของธีม) */
const norm = (raw: unknown) => (Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []);
const cfg = (items: unknown[], extra: Record<string, unknown> = {}) => normalizeSiteZones({ enabled: true, items, ...extra }, norm);

describe("🚪 โซนของเว็บ — ทำความสะอาด", () => {
  it("ค่าเริ่ม = ปิด ไม่มีโซน · ธีมเก่าที่ไม่มี siteZones = ปิด (หน้าเว็บเหมือนเดิม)", () => {
    expect(defaultSiteZones()).toEqual({ enabled: false, items: [], bar: { onHome: false, bg: "ink", bgColor: "", align: "left", homeText: "" } });
    expect(normalizeTheme({}).siteZones).toEqual(defaultSiteZones());
    expect(DEFAULT_THEME.siteZones.enabled).toBe(false);
  });
  it("ที่อยู่หน้า: ต้องขึ้นต้นด้วย / · ตัด ?query #hash / ท้าย · ตัวเล็ก · ลิงก์นอกเว็บทิ้ง", () => {
    expect(cleanSiteZonePath(" /OEM/ ")).toBe("/oem");
    expect(cleanSiteZonePath("/oem?x=1#a")).toBe("/oem");
    expect(cleanSiteZonePath("//evil.com")).toBe("");
    expect(cleanSiteZonePath("https://x.com/oem")).toBe("");
    expect(cleanSiteZonePath("oem")).toBe("");
    expect(cleanSiteZonePath("/")).toBe("/");
  });
  it("หน้าเดียวกันอยู่ได้โซนเดียว (โซนแรกได้) · เกิน 4 โซนถูกตัด · ชื่อว่าง = โซน N · ชิ้นซ่อนนอกรายการทิ้ง", () => {
    const c = cfg([
      { id: "a", label: "รับผลิต", paths: ["/oem", "/oem", "/gallery"], hide: ["cart", "cart", "bogus"] },
      { id: "b", label: "", paths: ["/gallery", "/parts"] },
      { id: "c" }, { id: "d" }, { id: "e" },
    ]);
    expect(c.items).toHaveLength(SITE_ZONE_MAX);
    expect(c.items[0].paths).toEqual(["/oem", "/gallery"]);
    expect(c.items[0].hide).toEqual(["cart"]);
    expect(c.items[1].paths).toEqual(["/parts"]);
    expect(c.items[1].label).toBe("โซน 2");
  });
  it("เมนูของโซน: ไม่มี = null (ใช้เมนูหลัก) · มี = ผ่านตัวทำความสะอาดเมนู · ลิงก์แปลกทิ้ง", () => {
    const c = cfg([{ id: "a", items: ["x", 1, "y"], home: "javascript:alert(1)", button: { text: "ขอราคา", href: "/contact" } }, { id: "b" }]);
    expect(c.items[0].items).toEqual(["x", "y"]);
    expect(c.items[1].items).toBeNull();
    expect(c.items[0].home).toBe("");
    expect(c.items[0].button).toEqual({ text: "ขอราคา", href: "/contact" });
  });
});

describe("🚪 โซนของเว็บ — หน้าไหนอยู่โซนไหน", () => {
  const c = cfg([
    { id: "oem", label: "รับผลิต", home: "/oem", paths: ["/oem", "/oem/steps"] },
    { id: "shop", label: "ร้านอะไหล่", home: "/shop", paths: [] },
  ]);
  it("ตรงที่อยู่ / หน้าลูก = โซนนั้น · ไม่ตรง = โซนหลัก (ไม่ได้เลือกหน้า) · /en เหมือนหน้าไทย", () => {
    expect(siteZoneOf("/oem", c)?.id).toBe("oem");
    expect(siteZoneOf("/oem/steps/1", c)?.id).toBe("oem");
    expect(siteZoneOf("/oemx", c)?.id).toBe("shop");
    expect(siteZoneOf("/product/abc", c)?.id).toBe("shop");
    expect(siteZoneOf("/en/oem", c)?.id).toBe("oem");
    expect(stripLangPath("/en")).toBe("/");
  });
  it("ปิดโซน / ไม่มีโซนหลัก + ไม่ตรง = null (เมนูหลักเดิม)", () => {
    expect(siteZoneOf("/oem", { ...c, enabled: false })).toBeNull();
    const noMain = cfg([{ id: "oem", paths: ["/oem"] }, { id: "b", paths: ["/b"] }]);
    expect(siteZoneOf("/shop", noMain)).toBeNull();
  });
  it("ที่อยู่ \"/\" = หน้าแรกเท่านั้น (ไม่กินทุกหน้า)", () => {
    const home = cfg([{ id: "h", paths: ["/"] }, { id: "main", paths: [] }]);
    expect(siteZoneOf("/", home)?.id).toBe("h");
    expect(siteZoneOf("/shop", home)?.id).toBe("main");
  });
  it("แถบสลับ: ต้องเปิด + มี ≥ 2 โซน · หน้าแรกซ่อน (เว้นติ๊ก onHome)", () => {
    expect(siteZoneBarShown("/shop", c)).toBe(true);
    expect(siteZoneBarShown("/", c)).toBe(false);
    expect(siteZoneBarShown("/en", c)).toBe(false);
    expect(siteZoneBarShown("/", { ...c, bar: { ...c.bar, onHome: true } })).toBe(true);
    expect(siteZoneBarShown("/shop", { ...c, items: c.items.slice(0, 1) })).toBe(false);
    expect(siteZoneBarShown("/shop", { ...c, enabled: false })).toBe(false);
  });
  it("ลิงก์แท็บ: หน้าแรกของโซน → ที่อยู่แรก → /", () => {
    expect(siteZoneHref({ home: "/oem", paths: [] })).toBe("/oem");
    expect(siteZoneHref({ home: "", paths: ["/gallery"] })).toBe("/gallery");
    expect(siteZoneHref({ home: "", paths: [] })).toBe("/");
  });
});

describe("🚪 โซนของเว็บ — ในธีม", () => {
  it("ค่าที่ตั้ง + คำแปลอังกฤษ (ชื่อโซน/ปุ่ม/ลิงก์หน้าแรก) รอดการบันทึกธีม · เมนูของโซนผ่านตัวทำความสะอาดเมนูจริง", () => {
    const t = normalizeTheme({
      siteZones: {
        enabled: true,
        bar: { bg: "custom", bgColor: "#E2540F", homeText: "หน้าแรก", homeText_en: "Home" },
        items: [
          { id: "oem", label: "รับผลิต", label_en: "OEM", home: "/oem", paths: ["/oem"], button: { text: "ขอราคา", text_en: "Get a quote", href: "/contact" }, hide: ["cart"], items: [{ id: "m1", label: "บริการ", label_en: "Services", kind: "page", value: "oem" }, { label: "" }] },
          { id: "shop", label: "ร้านอะไหล่", home: "/shop" },
        ],
      },
    });
    const z = t.siteZones as unknown as { enabled: boolean; bar: Record<string, unknown>; items: Record<string, unknown>[] };
    expect(z.enabled).toBe(true);
    expect(z.bar).toMatchObject({ bg: "custom", bgColor: "#e2540f", homeText: "หน้าแรก", homeText_en: "Home" });
    expect(z.items[0]).toMatchObject({ label: "รับผลิต", label_en: "OEM", button: { text: "ขอราคา", text_en: "Get a quote", href: "/contact" }, hide: ["cart"] });
    const menu = z.items[0].items as Record<string, unknown>[];
    expect(menu).toHaveLength(1);
    expect(menu[0]).toMatchObject({ label: "บริการ", label_en: "Services", kind: "page", value: "oem", children: [] });
    expect(z.items[1].items).toBeNull();
    // บันทึกซ้ำได้ค่าเดิม (ตัวจัดหน้าไม่คิดว่ามีการแก้ตลอด)
    expect(normalizeTheme(t).siteZones).toEqual(t.siteZones);
  });
});
