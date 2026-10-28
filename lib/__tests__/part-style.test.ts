import { describe, it, expect } from "vitest";
import { DEFAULT_ACCOUNT_LOOK, DEFAULT_SITE_PAGE, normalizeAccount, normalizePartStyles, normalizeSitePage } from "../website-site-design";
import { ACCOUNT_PARTS, PART_GROUP_FIELDS } from "../website-page-parts";

/** 🎨 ชุดปรับหน้าตาชิ้นส่วน (ของกลาง) + 👤 หน้าบัญชีของฉัน — ตัวตรวจค่า (มิเรอร์กับเว็บร้าน) */
describe("normalizePartStyles", () => {
  it("รับเฉพาะค่าที่รู้จัก · บีบตัวเลขให้อยู่ในช่วง · สีต้องเป็นชื่อสีร้าน/hex/none", () => {
    const r = normalizePartStyles({
      "acc.name": { all: { size: 500, weight: 650, color: "brand", bg: "red", font: "Kanit", align: "center", upper: true, junk: 1 }, mobile: { size: 3, color: "#ABCDEF" } },
      "acc.tab": { all: { radius: 999, activeBg: "none", shadow: 9 } },
    });
    expect(r["acc.name"].all).toEqual({ size: 120, weight: 650, color: "brand", font: "Kanit", align: "center", upper: true });
    expect(r["acc.name"].mobile).toEqual({ size: 8, color: "#ABCDEF" });
    expect(r["acc.tab"].all).toEqual({ radius: 999, shadow: 3, activeBg: "none" });
  });
  it("คีย์แปลก/ค่าว่าง/ฟอนต์อันตราย ถูกตัดทิ้ง", () => {
    const r = normalizePartStyles({ "Bad Key": { all: { size: 12 } }, 'acc.x"]{}': { all: { size: 12 } }, "acc.empty": { all: {} }, "acc.ok": { all: { font: "Kanit;}body{" } } });
    expect(r).toEqual({});
    expect(normalizePartStyles(null)).toEqual({});
  });
});

describe("normalizeAccount", () => {
  it("ไม่มีค่า = หน้าตาเดิม (ค่าเริ่ม)", () => {
    expect(normalizeAccount(undefined)).toEqual(DEFAULT_ACCOUNT_LOOK);
    expect(normalizeSitePage({}).account).toEqual(DEFAULT_SITE_PAGE.account);
  });
  it("แท็บ: ครบ 6 ไม่ซ้ำ · ซ่อนโปรไฟล์ไม่ได้ · แท็บแรกที่ถูกซ่อน = กลับเป็นออเดอร์", () => {
    const a = normalizeAccount({ tabs: [{ key: "wishlist", label: "ของที่ชอบ", hidden: true }, { key: "wishlist" }, { key: "profile", hidden: true }, { key: "hack" }], firstTab: "wishlist" });
    expect(a.tabs.map((t) => t.key)).toEqual(["wishlist", "profile", "orders", "points", "coupons", "addresses"]);
    expect(a.tabs[0]).toMatchObject({ label: "ของที่ชอบ", hidden: true });
    expect(a.tabs[1].hidden).toBe(false);
    expect(a.firstTab).toBe("orders");
  });
  it("ลิงก์ปุ่มตอนว่าง รับเฉพาะ /หน้าในเว็บ หรือ https://", () => {
    const a = normalizeAccount({ empty: { orders: { text: "ยังไม่มี", button: "ช้อป", href: "javascript:alert(1)" }, wishlist: { href: "//evil.com" }, addresses: { href: "/shop" } } });
    expect(a.empty.orders).toEqual({ text: "ยังไม่มี", button: "ช้อป", href: "" });
    expect(a.empty.wishlist.href).toBe("");
    expect(a.empty.addresses.href).toBe("/shop");
  });
});

describe("ทะเบียนชิ้นส่วน หน้าบัญชี", () => {
  it("คีย์ไม่ซ้ำ ผ่านตัวตรวจคีย์ และทุกกลุ่มมีช่อง", () => {
    const keys = ACCOUNT_PARTS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    const probe = Object.fromEntries(keys.map((k) => [k, { all: { size: 12 } }]));
    expect(Object.keys(normalizePartStyles(probe))).toEqual(keys);
    for (const p of ACCOUNT_PARTS) for (const g of p.groups) expect(PART_GROUP_FIELDS[g].length).toBeGreaterThan(0);
  });
});

describe("normalizeLogin (ป๊อปสมัคร · ขั้น 2)", () => {
  it("ไม่มีค่า = หน้าตาเดิม", () => {
    expect(normalizeSitePage({}).login).toEqual(DEFAULT_SITE_PAGE.login);
    expect(DEFAULT_SITE_PAGE.login).toMatchObject({ perksOn: true, perks: [], guestLink: true, providerStyle: "brand", parts: {} });
  });
  it("ข้อดีสูงสุด 6 บรรทัด ตัดบรรทัดว่าง · สีปุ่มรับเฉพาะ 3 แบบ · เก็บช่องแปล _en · parts ผ่านตัวตรวจกลาง", () => {
    const l = normalizeSitePage({ login: { perks: ["a", "", "b", "c", "d", "e", "f", "g"], providerStyle: "neon", popupTitle: "Members", popupTitle_en: "Join us", parts: { "login.tab": { all: { activeBg: "brand", junk: 1 } }, "Bad Key": { all: { size: 10 } } } } }).login;
    expect(l.perks).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(l.providerStyle).toBe("brand");
    expect((l as unknown as Record<string, unknown>).popupTitle_en).toBe("Join us");
    expect(l.parts).toEqual({ "login.tab": { all: { activeBg: "brand" } } });
  });
  it("ทะเบียนชิ้นส่วนหน้าเข้าสู่ระบบ: คีย์ไม่ซ้ำ ผ่านตัวตรวจ", async () => {
    const { LOGIN_PARTS } = await import("../website-page-parts");
    const keys = LOGIN_PARTS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(normalizePartStyles(Object.fromEntries(keys.map((k) => [k, { all: { size: 12 } }]))))).toEqual(keys);
  });
});

describe("หน้าบัญชี: หน้าต่างแอป · จัดวาง · ลูกเล่น", () => {
  it("ไม่มีค่า = แบบเดิม (ไม่มีลูกเล่น · ลำดับเดิม · โปรไฟล์แบบฟอร์ม)", () => {
    expect(DEFAULT_ACCOUNT_LOOK).toMatchObject({ nav: "pills", navSide: "left", profileStyle: "form", decor: "none", glass: false, timeGreeting: false, countUp: false, tabAnim: "none", tilt: false });
    expect(DEFAULT_ACCOUNT_LOOK.order).toEqual(["notice", "header", "body", "help", "reco"]);
    expect(DEFAULT_ACCOUNT_LOOK.aside.on).toBe(false);
  });
  it("ลำดับ: ตัดค่าแปลก/ซ้ำ · ส่วนที่ขาดต่อท้ายให้ครบ", () => {
    const a = normalizeAccount({ order: ["reco", "body", "reco", "evil", 3] });
    expect(a.order).toEqual(["reco", "body", "notice", "header", "help"]);
  });
  it("ค่าแปลก = ค่าเริ่ม · ลิงก์กล่องข้างรับเฉพาะ /หน้า หรือ https://", () => {
    const a = normalizeAccount({ nav: "panel", navSide: "up", decor: "fire", tabAnim: "spin", profileStyle: "rows", glass: 1, aside: { on: true, title: "คู่มือ", href: "javascript:alert(1)" } });
    expect(a.nav).toBe("panel");
    expect(a.navSide).toBe("left");
    expect(a.decor).toBe("none");
    expect(a.tabAnim).toBe("none");
    expect(a.profileStyle).toBe("rows");
    expect(a.glass).toBe(false);
    expect(a.aside).toMatchObject({ on: true, title: "คู่มือ", href: "" });
  });
});

describe("ขั้น 3: 404 · ขอบคุณ · ป๊อปอัป · คุกกี้", () => {
  it("ไม่มีค่า = parts ว่าง (หน้าตาเดิม)", () => {
    const p = normalizeSitePage({});
    for (const k of ["notFound", "thanks", "popup", "cookie"] as const) expect(p[k].parts).toEqual({});
  });
  it("parts ผ่านตัวตรวจกลาง (ทิ้งคีย์/ช่องแปลก)", () => {
    const p = normalizeSitePage({
      notFound: { parts: { "nf.title": { all: { size: 40, evil: "x" } }, "BAD": { all: { size: 1 } } } },
      thanks: { parts: { "th.code": { mobile: { color: "brand" } } } },
      popup: { parts: { "pp.btn": { all: { radius: 99 } } } },
      cookie: { parts: { "ck.box": { all: { hidden: true } } } },
    });
    expect(p.notFound.parts).toEqual({ "nf.title": { all: { size: 40 } } });
    expect(p.thanks.parts).toEqual({ "th.code": { mobile: { color: "brand" } } });
    expect(Object.keys(p.popup.parts)).toEqual(["pp.btn"]);
    expect(p.cookie.parts["ck.box"]?.all?.hidden).toBe(true);
  });
  it("ทะเบียนชิ้นส่วนทุกหน้า: คีย์ไม่ซ้ำข้ามหน้า ผ่านตัวตรวจคีย์ ทุกกลุ่มมีช่อง", async () => {
    const R = await import("../website-page-parts");
    const all = [...R.ACCOUNT_PARTS, ...R.LOGIN_PARTS, ...R.NF_PARTS, ...R.THANKS_PARTS, ...R.POPUP_PARTS, ...R.COOKIE_PARTS, ...R.SEARCH_PARTS, ...R.CART_PARTS, ...R.CHECKOUT_PARTS, ...R.HEADER_PARTS, ...R.FOOTER_PARTS];
    const keys = all.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    // ตรวจคีย์ทีละหน้า (ค่าหนึ่งหน้าเก็บได้สูงสุด 80 ชิ้น)
    for (const list of [R.ACCOUNT_PARTS, R.LOGIN_PARTS, R.NF_PARTS, R.THANKS_PARTS, R.POPUP_PARTS, R.COOKIE_PARTS, R.SEARCH_PARTS, R.CART_PARTS, R.CHECKOUT_PARTS, R.HEADER_PARTS, R.FOOTER_PARTS]) {
      const k = list.map((p) => p.key);
      expect(Object.keys(normalizePartStyles(Object.fromEntries(k.map((x) => [x, { all: { size: 12 } }]))))).toEqual(k);
    }
    for (const p of all) for (const g of p.groups) expect(PART_GROUP_FIELDS[g].length).toBeGreaterThan(0);
  });
});

describe("ขั้น 4: ค้นหา · ตะกร้า · ชำระเงิน · หัวเว็บ · ท้ายเว็บ (theme.page.areaParts)", () => {
  it("ไม่มีค่า = ทุกส่วนว่าง (หน้าตาเดิม)", () => {
    expect(normalizeSitePage({}).areaParts).toEqual({ search: {}, cart: {}, checkout: {}, header: {}, footer: {} });
    expect(DEFAULT_SITE_PAGE.areaParts).toEqual({ search: {}, cart: {}, checkout: {}, header: {}, footer: {} });
  });
  it("ค่าแปลก/ส่วนที่ไม่รู้จัก ถูกทิ้ง · แต่ละส่วนผ่านตัวตรวจกลาง", () => {
    const a = normalizeSitePage({ areaParts: { cart: { "cart.btn": { all: { bg: "ink", evil: 1 } }, "x y": { all: { size: 9 } } }, header: "bad", unknown: { "hd.bar": { all: { size: 12 } } } } }).areaParts;
    expect(a.cart).toEqual({ "cart.btn": { all: { bg: "ink" } } });
    expect(a.header).toEqual({});
    expect(Object.keys(a)).toEqual(["search", "cart", "checkout", "header", "footer"]);
  });
});
