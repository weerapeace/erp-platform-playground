import { describe, it, expect } from "vitest";
import { normalizeTheme, mergeTheme, themeFontNames } from "../website-theme";
import { ACCOUNT_BG_FADE_RANGE, DEFAULT_ACCOUNT_LOOK, DEFAULT_SITE_PAGE, DEFAULT_SITE_SHAPE, formatMoneyAs, normalizeAccount, normalizeChatLook, normalizeCookieLook, normalizeLogin, normalizeMobileNav, normalizeNotFound, normalizePopup, normalizeShare, normalizeThanks, normalizePageTransition, normalizeSitePage, normalizeSiteShape, sectionMotionOf } from "../website-site-design";
import { popularTermsOf } from "../website-site-info";
import { mergePopularTerms } from "../website-search-terms";
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

/** 📱 ชุด 3 — มือถือและช่วยขาย (theme.page · theme.footer · Section แถบประกาศ · คำยอดนิยม) */
describe("มือถือและช่วยขาย (ชุด 3)", () => {
  it("ธีมเก่า = หน้าตาเดิมทุกตัว", () => {
    const t = normalizeTheme({});
    expect(t.page.mobileNav).toEqual({ style: "off", items: ["home", "shop", "search", "wishlist", "cart"], hideOnScroll: false });
    expect(t.page.chat).toEqual({ color: "brand", shape: "pill", where: "all" });
    expect(t.page.searchEmpty).toBe("cats");
    expect(t.page.cookie).toEqual({ layout: "card", side: "left", icon: true, title: "", text: "" });
    expect([t.footer.paymentStyle, t.footer.shipping]).toEqual(["text", []]);
  });

  it("แถบล่าง: ปุ่ม 2–5 ไม่ซ้ำ · ค่ามั่วตัดทิ้ง · น้อยกว่า 2 = ชุดตั้งต้น", () => {
    expect(normalizeMobileNav({ style: "label", items: ["cart", "cart", "chat", "x", "home", "search", "account", "shop"] }).items).toEqual(["cart", "chat", "home", "search", "account"]);
    expect(normalizeMobileNav({ items: ["home"] }).items).toEqual(DEFAULT_SITE_PAGE.mobileNav.items);
    expect(normalizeMobileNav({ style: "big" }).style).toBe("off");
  });

  it("ค่าที่เลือกรอดการบันทึก (รวมคำแปลอังกฤษของแถบคุกกี้)", () => {
    const page = { mobileNav: { style: "icon", items: ["home", "categories", "chat", "cart"], hideOnScroll: true }, chat: { color: "line", shape: "round", where: "mobile" }, searchEmpty: "prods", cookie: { layout: "bar", side: "right", icon: false, title: "คุกกี้", title_en: "Cookies", text: "ข้อความ", text_en: "Text" } };
    const back = normalizeTheme(mergeTheme({}, normalizeTheme({ page, footer: { paymentStyle: "color", shipping: ["kerry", "flash", "kerry", "ufo"] } })));
    expect(back.page).toMatchObject(page);
    expect([back.footer.paymentStyle, back.footer.shipping]).toEqual(["color", ["kerry", "flash"]]);
    expect(normalizeCookieLook({ layout: "popup", title: "x".repeat(90) })).toMatchObject({ layout: "card", title: "x".repeat(60) });
    expect(normalizeChatLook({ color: "pink", shape: "square", where: "tv" })).toEqual({ color: "brand", shape: "pill", where: "all" });
  });

  it("คำยอดนิยม: คำที่ร้านตั้งก่อน → ต่อด้วยคำที่ลูกค้าค้นจริง ≥ 3 ครั้งและหาเจอ · ไม่มีข้อมูล = เฉพาะคำที่ตั้ง", () => {
    expect(popularTermsOf(" กระเป๋าสตางค์ \nเข็มขัด\nกระเป๋าสตางค์\n\n")).toEqual(["กระเป๋าสตางค์", "เข็มขัด"]);
    const stats = [
      { q: "wallet", hits: 9, lastResults: 4, lastDay: "2026-10-20" },
      { q: "ร่ม", hits: 7, lastResults: 0, lastDay: "2026-10-20" },
      { q: "เข็มขัด", hits: 5, lastResults: 3, lastDay: "2026-10-20" },
      { q: "card", hits: 2, lastResults: 3, lastDay: "2026-10-20" },
    ];
    expect(mergePopularTerms(["กระเป๋าสตางค์", "เข็มขัด"], stats)).toEqual(["กระเป๋าสตางค์", "เข็มขัด", "wallet"]);
    expect(mergePopularTerms([], [])).toEqual([]);
  });
});

/** 📄 หน้าพิเศษ (ชุด 4) — 404 · ขอบคุณ · ป๊อปอัป · รูปแชร์ · เข้าสู่ระบบ */
describe("หน้าพิเศษ", () => {
  it("ธีมเก่า = หน้าตาเดิมทั้ง 5 หน้า", () => {
    const p = normalizeTheme({}).page;
    expect(p.notFound).toEqual({ style: "plain", imageKey: null, title: "", text: "", search: false, products: false });
    expect(p.thanks).toEqual({ top: "emoji", imageKey: null, mobileImageKey: null, link: "", coupon: "", follow: false, products: false });
    expect(p.popup).toEqual({ layout: "center", imageKey: null, trigger: "delay", again: "once" });
    expect(p.share).toEqual({ style: "photo", bg: "paper" });
    expect(p.login).toEqual({ layout: "center", imageKey: null, title: "", text: "" });
    expect([p.notFound, p.thanks, p.popup, p.share, p.login]).toEqual([DEFAULT_SITE_PAGE.notFound, DEFAULT_SITE_PAGE.thanks, DEFAULT_SITE_PAGE.popup, DEFAULT_SITE_PAGE.share, DEFAULT_SITE_PAGE.login]);
  });

  it("ค่าที่เลือกรอดการบันทึก (รวมคำแปลอังกฤษ)", () => {
    const page = {
      notFound: { style: "big", imageKey: "website/404.jpg", title: "หลงทาง", title_en: "Lost", text: "ลองค้นหา", search: true, products: true },
      thanks: { top: "image", imageKey: "website/thanks.png", coupon: "BACK10", follow: true, products: true },
      popup: { layout: "split", imageKey: "website/pop.webp", trigger: "exit", again: "7d" },
      share: { style: "card", bg: "ink" },
      login: { layout: "cover", imageKey: "website/login.jpg", title: "ยินดีต้อนรับ", text: "สะสมแต้ม", text_en: "Earn points" },
    };
    const back = normalizeTheme(mergeTheme({}, normalizeTheme({ page })));
    expect(back.page).toMatchObject(page);
  });

  it("ค่าแปลก/อันตราย = กลับเป็นแบบเดิม · คีย์รูปต้องเป็นคีย์ R2 ปลอดภัย · โค้ดคูปองตัวใหญ่", () => {
    expect(normalizeNotFound({ style: "huge", imageKey: "../secret", search: "yes", title: "x".repeat(99) })).toMatchObject({ style: "plain", imageKey: null, search: false, title: "x".repeat(80) });
    expect(normalizeNotFound({ imageKey: "https://evil.com/a.jpg" }).imageKey).toBeNull();
    expect(normalizeThanks({ top: "gif", coupon: " back-10 ฿ ", follow: 1 })).toMatchObject({ top: "emoji", coupon: "BACK-10", follow: false });
    expect(normalizePopup({ layout: "full", trigger: "click", again: "daily" })).toEqual({ layout: "center", imageKey: null, trigger: "delay", again: "once" });
    expect(normalizeShare({ style: "video", bg: "red" })).toEqual({ style: "photo", bg: "paper" });
    expect(normalizeLogin({ layout: "side", title_en: "   " })).toEqual({ layout: "center", imageKey: null, title: "", text: "" });
  });
});

describe("หน้าบัญชี: พื้นหลังรูปภาพ", () => {
  it("ธีมเก่า = ไม่มีรูป · จาง 60% · ไม่เบลอ", () => {
    const a = normalizeAccount({ decor: "blobs" });
    expect(a.decor).toBe("blobs");
    expect([a.bgImageKey, a.bgFade, a.bgBlur]).toEqual([DEFAULT_ACCOUNT_LOOK.bgImageKey, 60, false]);
  });
  it("รูปภาพ: คีย์ต้องเป็นคีย์ R2 ปลอดภัย · ความจางถูกบีบในช่วง", () => {
    const a = normalizeAccount({ decor: "image", bgImageKey: "website-pages/bg.jpg", bgFade: 200, bgBlur: true });
    expect([a.decor, a.bgImageKey, a.bgFade, a.bgBlur]).toEqual(["image", "website-pages/bg.jpg", ACCOUNT_BG_FADE_RANGE.max, true]);
    const b = normalizeAccount({ decor: "video", bgImageKey: "../../etc/passwd", bgFade: -5 });
    expect([b.decor, b.bgImageKey, b.bgFade]).toEqual(["none", null, ACCOUNT_BG_FADE_RANGE.min]);
  });
});
