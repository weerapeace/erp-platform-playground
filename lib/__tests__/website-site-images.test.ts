import { describe, it, expect } from "vitest";
import {
  isMediaKey,
  isProductMedia,
  isReplacementValue,
  collectSiteImages,
  replaceMedia,
  placeDetail,
  cleanImageAlts,
  withImageAlt,
  type SiteDoc,
} from "../website-site-images";

const SET = "imgset/11111111-2222-4333-8444-555555555555";
const A = "storefront-brand/b1fc/1792325096955-26627.jpeg";
const B = "library/1792505444941-8z7h4z.jpg";
const V = "storefront-videos/b1fc/1792634162747-4778.mp4";
const P = "parent_skus/LM-001/cover.jpg";

const home = (over: Partial<SiteDoc> = {}): SiteDoc => ({
  kind: "home",
  id: "home",
  label: "หน้าแรก",
  live: [
    { id: "s1", type: "gallery", items: [{ imageKey: A }, { imageKey: B, title: "กระเป๋า" }] },
    { id: "s2", type: "categories", catImg: { bags: B } },
  ],
  draft: null,
  editable: true,
  ...over,
});

describe("isMediaKey / isProductMedia", () => {
  it("รับ r2 key ของรูป/วิดีโอ · ไม่รับชุดรูป ลิงก์เว็บ ข้อความ", () => {
    expect(isMediaKey(A)).toBe(true);
    expect(isMediaKey(V)).toBe(true);
    expect(isMediaKey(SET)).toBe(false);
    expect(isMediaKey("https://x.com/a.jpg")).toBe(false);
    expect(isMediaKey("กระเป๋า.jpg")).toBe(false);
    expect(isMediaKey("a/../b.jpg")).toBe(false);
    expect(isMediaKey("storefront-brand/readme.txt")).toBe(false);
  });
  it("รูปสินค้า = โฟลเดอร์สินค้า", () => {
    expect(isProductMedia(P)).toBe(true);
    expect(isProductMedia("storefront-products/x/1.jpg")).toBe(true);
    expect(isProductMedia(A)).toBe(false);
  });
  it("ค่าที่ใช้แทนได้ = รูป หรือ ชุดรูป", () => {
    expect(isReplacementValue(B)).toBe(true);
    expect(isReplacementValue(SET)).toBe(true);
    expect(isReplacementValue("")).toBe(false);
  });
});

describe("placeDetail", () => {
  it("บอกชิ้น/หมวด/ชนิดรูป เป็นภาษาคน", () => {
    const root = home().live as unknown[];
    expect(placeDetail([0, "items", 0, "imageKey"], root)).toBe("ชิ้นที่ 1");
    expect(placeDetail([0, "items", 1, "imageKey"], root)).toBe("“กระเป๋า”");
    expect(placeDetail([1, "catImg", "bags"], root)).toBe("หมวด bags");
    expect(placeDetail([0, "style", "decor", 1, "key"], [{ style: { decor: [{}, {}] } }])).toBe("ของตกแต่ง 2");
  });
  it("เมนู: ชื่อเมนู › ชื่อลิงก์ › รูปตอนชี้", () => {
    const theme = { menu: { items: [{ label: "SHOP ALL", panel: { blocks: [{ links: [{ label: "Wallets", hoverImageKey: A }] }] } }] } };
    expect(placeDetail(["menu", "items", 0, "panel", "blocks", 0, "links", 0, "hoverImageKey"], theme)).toBe("“SHOP ALL” › กล่อง 1 › “Wallets” › รูปตอนชี้");
  });
});

describe("collectSiteImages", () => {
  it("1 การ์ดต่อ 1 รูป + ใช้ที่ไหนบ้าง (เรียงตามจำนวนที่ใช้)", () => {
    const imgs = collectSiteImages([home()]);
    expect(imgs.map((i) => i.key)).toEqual([B, A]);
    const b = imgs[0];
    expect(b.uses.map((u) => u.where)).toEqual([expect.stringMatching(/^หน้าแรก › .*แกลเลอรี.* › “กระเป๋า”$/), expect.stringContaining("หมวด bags")]);
    expect(b.uses[0]).toMatchObject({ live: true, draft: true, blockId: "s1", path: "/#s-s1", editable: true });
  });
  it("มีร่าง: รูปใหม่ในร่าง = ร่างอย่างเดียว · รูปที่เอาออกในร่าง = เผยแพร่อย่างเดียว", () => {
    const imgs = collectSiteImages([home({ draft: [{ id: "s1", type: "gallery", items: [{ imageKey: V }] }] })]);
    const v = imgs.find((i) => i.key === V)!;
    expect(v.kind).toBe("video");
    expect(v.uses[0]).toMatchObject({ live: false, draft: true });
    const a = imgs.find((i) => i.key === A)!;
    expect(a.uses[0]).toMatchObject({ live: true, draft: false });
  });
  it("ไม่นับชุดรูป (imgset/) · รูปสินค้าติดป้าย product", () => {
    const imgs = collectSiteImages([home({ live: [{ id: "x", type: "hero", imageKey: SET, mobileImageKey: P }] })]);
    expect(imgs.map((i) => i.key)).toEqual([P]);
    expect(imgs[0].product).toBe(true);
    expect(imgs[0].uses[0].where).toContain("มือถือ");
  });
  it("ธีม: ป้ายส่วนของเว็บ + หน้าที่เห็น", () => {
    const imgs = collectSiteImages([{ kind: "theme", id: "theme", label: "ดีไซน์", live: { logo: { imageKey: A }, listing: { inserts: [{ imageKey: B }] } }, draft: null, editable: true }]);
    expect(imgs.find((i) => i.key === A)!.uses[0]).toMatchObject({ where: "ดีไซน์ › โลโก้", path: "/" });
    expect(imgs.find((i) => i.key === B)!.uses[0]).toMatchObject({ where: "ดีไซน์ › รูปคั่นสินค้า (หน้ารายการสินค้า) › รูปแทรก 1", path: "/shop" });
  });
});

describe("replaceMedia", () => {
  it("แทนทุกช่องที่ตรงกันทั้งช่อง · ของเดิมไม่ถูกแก้", () => {
    const src = home().live;
    const r = replaceMedia(src, B, SET);
    expect(r.count).toBe(2);
    expect(JSON.stringify(r.data)).not.toContain(B);
    expect(JSON.stringify(src)).toContain(B);
  });
  it("ไม่เจอ = คืนก้อนเดิม", () => {
    const src = home().live;
    const r = replaceMedia(src, "library/none.jpg", A);
    expect(r).toEqual({ data: src, count: 0 });
  });
});

describe("คำอธิบายรูป", () => {
  it("ล้างค่าแปลก + ตัดยาว + อ่านจากข้อความ JSON", () => {
    expect(cleanImageAlts(JSON.stringify({ [A]: "  กระเป๋า   หนัง ", bad: "x", [B]: "" }))).toEqual({ [A]: "กระเป๋า หนัง" });
    expect(cleanImageAlts("{พัง")).toEqual({});
    expect(cleanImageAlts({ [A]: "ก".repeat(300) })[A]).toHaveLength(160);
  });
  it("ตั้ง/ลบ", () => {
    const m = withImageAlt({}, A, "โลโก้ร้าน");
    expect(m).toEqual({ [A]: "โลโก้ร้าน" });
    expect(withImageAlt(m, A, " ")).toEqual({});
  });
});
