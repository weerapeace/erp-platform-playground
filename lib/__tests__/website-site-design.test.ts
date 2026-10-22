import { describe, it, expect } from "vitest";
import { normalizeTheme, mergeTheme, themeFontNames } from "../website-theme";
import { DEFAULT_SITE_PAGE, DEFAULT_SITE_SHAPE, formatMoneyAs, normalizePageTransition, normalizeSitePage, normalizeSiteShape, sectionMotionOf } from "../website-site-design";
import { sanitizeStyle, MOTION_ENTRANCES } from "../website-blocks";
import { applyFullPreset, FULL_THEME_PRESETS } from "../website-theme-presets";

/** 🧱 ฐานหน้าตาทั้งเว็บ (แท็บดีไซน์ ชุด 1) — มิเรอร์เว็บร้าน src/lib/site-design.ts · CSS ที่ src/lib/site-design-css.ts */
describe("ฐานหน้าตาทั้งเว็บ", () => {
  it("ธีมเก่าที่ไม่มีค่าใหม่ = หน้าตาเดิมทุกตัว", () => {
    const t = normalizeTheme({});
    expect(t.page).toEqual({ transition: "fade", smoothScroll: false, ...DEFAULT_SITE_PAGE });
    expect([t.page.density, t.page.width, t.page.texture, t.page.mobileScale, t.page.bigTap, t.page.priceFormat]).toEqual(["normal", "normal", "none", 100, false, "baht"]);
    expect(t.shape).toMatchObject(DEFAULT_SITE_SHAPE);
    expect([t.shape.buttonKind, t.shape.buttonHover, t.shape.linkHover, t.shape.inputStyle]).toEqual(["fill", "auto", "auto", "box"]);
    expect(t.header.iconStyle).toBe("regular");
    expect(t.fonts).toEqual({ display: "Kanit", body: "Noto Sans Thai", displayLatin: "", bodyLatin: "" });
    expect(t.card.autoBadges.shape).toBe("pill");
  });

  it("ค่ามั่ว = ค่าเริ่ม · ตัวเลขตัดเข้าช่วง", () => {
    const p = normalizeSitePage({ density: "huge", width: 9, texture: "wood", textureStrength: 500, mobileScale: 10, bigTap: "yes", priceFormat: "usd" });
    expect(p).toEqual({ ...DEFAULT_SITE_PAGE, textureStrength: 100, mobileScale: 85 });
    expect(normalizeSitePage({ mobileScale: 112, textureStrength: 3 })).toMatchObject({ mobileScale: 112, textureStrength: 10 });
    expect(normalizeSiteShape({ buttonKind: "ghost", buttonHover: "spin", linkHover: "blink", inputStyle: "round" })).toEqual(DEFAULT_SITE_SHAPE);
    expect(normalizeTheme({ header: { iconStyle: "emoji" } }).header.iconStyle).toBe("regular");
    expect(normalizeTheme({ card: { autoBadges: { shape: "star" } } }).card.autoBadges.shape).toBe("pill");
  });

  it("ค่าที่เลือกรอดการบันทึก (normalize + merge) ทุกช่อง", () => {
    const t = normalizeTheme({
      fonts: { display: "Noto Serif Thai", body: "Sarabun", displayLatin: "Playfair Display", bodyLatin: "Inter" },
      page: { transition: "rise", density: "airy", width: "wide", texture: "grain", textureStrength: 55, mobileScale: 110, bigTap: true, priceFormat: "thb" },
      shape: { button: "square", buttonKind: "under", buttonHover: "arrow", linkHover: "run", inputStyle: "filled" },
      header: { iconStyle: "text" },
      card: { autoBadges: { shape: "ribbon" } },
    });
    const back = normalizeTheme(mergeTheme({}, t));
    expect(back.fonts).toEqual({ display: "Noto Serif Thai", body: "Sarabun", displayLatin: "Playfair Display", bodyLatin: "Inter" });
    expect(back.page).toEqual({ ...DEFAULT_SITE_PAGE, transition: "rise", smoothScroll: false, density: "airy", width: "wide", texture: "grain", textureStrength: 55, mobileScale: 110, bigTap: true, priceFormat: "thb" });
    expect(back.shape).toMatchObject({ button: "square", buttonKind: "under", buttonHover: "arrow", linkHover: "run", inputStyle: "filled" });
    expect(back.header.iconStyle).toBe("text");
    expect(back.card.autoBadges.shape).toBe("ribbon");
    expect(themeFontNames(back)).toEqual(expect.arrayContaining(["Playfair Display", "Inter"]));
  });

  it("ชุดลุคสำเร็จรูปล้างฟอนต์อังกฤษแยก (ชุดตั้งฟอนต์ไทยเอง)", () => {
    const t = normalizeTheme({ fonts: { display: "Kanit", body: "Sarabun", displayLatin: "Lora", bodyLatin: "Inter" } });
    const out = applyFullPreset(t, FULL_THEME_PRESETS[0]);
    expect(out.fonts.displayLatin).toBe("");
    expect(out.fonts.bodyLatin).toBe("");
    expect(out.fonts.display).toBe(FULL_THEME_PRESETS[0].fonts.display);
  });

  it("รูปแบบราคา 4 แบบ · ทศนิยมเฉพาะมีเศษ · หน้าอังกฤษใช้ THB", () => {
    expect(formatMoneyAs(1090, "baht")).toBe("฿1,090");
    expect(formatMoneyAs(1090, "word")).toBe("1,090 บาท");
    expect(formatMoneyAs(1090, "word", "en")).toBe("1,090 THB");
    expect(formatMoneyAs(1090, "dash")).toBe("1,090.-");
    expect(formatMoneyAs(1090, "thb")).toBe("THB 1,090");
    expect(formatMoneyAs(1290.5, "baht")).toBe("฿1,290.50");
    expect(formatMoneyAs(-50, "baht")).toBe("-฿50");
    expect(formatMoneyAs(0, "baht")).toBe("฿0");
  });
});

/** ✨ ชุด 2 — ลูกเล่นทั้งเว็บ (theme.page) · เว็บร้าน BlockRenderer/LiveBlocks · IntroScreen · CustomCursor · ScrollAids · PageMotion */
describe("ลูกเล่นทั้งเว็บ (ชุด 2)", () => {
  it("ธีมเก่า = ปิดทุกตัว · เปลี่ยนหน้าแบบจางเหมือนเดิม", () => {
    const p = normalizeTheme({}).page;
    expect([p.sectionMotion, p.intro, p.cursor, p.readProgress, p.backToTop, p.transition]).toEqual(["none", "off", "off", false, "off", "fade"]);
    expect(sectionMotionOf(p)).toBeNull();
  });

  it("เปลี่ยนหน้า 6 แบบ · ค่าเก่า none/fade/rise ยังได้ค่าเดิม · ค่าแปลก = จาง", () => {
    for (const v of ["fade", "rise", "curtain", "logo", "zoom", "none"]) expect(normalizeTheme({ page: { transition: v } }).page.transition).toBe(v);
    expect(normalizePageTransition("spin")).toBe("fade");
  });

  it("ค่าที่เลือกรอดการบันทึก · ค่ามั่ว = ค่าเริ่ม", () => {
    const page = { sectionMotion: "fade-up", sectionSpeed: "slow", sectionStagger: true, intro: "line", cursor: "view", readProgress: true, backToTop: "ring", backToTopSide: "left", transition: "curtain" };
    expect(normalizeTheme(mergeTheme({}, normalizeTheme({ page }))).page).toMatchObject(page);
    expect(normalizeSitePage({ sectionMotion: "spin-in", intro: "video", cursor: "star", backToTop: "big", backToTopSide: "top", sectionSpeed: "x" })).toMatchObject({
      sectionMotion: "none", intro: "off", cursor: "off", backToTop: "off", backToTopSide: "right", sectionSpeed: "normal",
    });
    expect(sectionMotionOf(normalizeSitePage(page))).toEqual({ entrance: "fade-up", speed: "slow", stagger: true });
  });

  it("Section: 'ตามค่าทั้งเว็บ' (none เดิม) กับ 'ไม่ขยับ' (still) แยกกัน และรอดการบันทึก", () => {
    expect(MOTION_ENTRANCES).toContain("still");
    expect(sanitizeStyle({ motion: { entrance: "still" } }).motion.entrance).toBe("still");
    expect(sanitizeStyle({}).motion.entrance).toBe("none");
  });
});
