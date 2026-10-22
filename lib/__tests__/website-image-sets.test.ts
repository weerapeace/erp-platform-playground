import { describe, it, expect } from "vitest";
import {
  imgSetIdOf,
  imgSetRef,
  effectiveVersion,
  settleImageSet,
  undoImageSet,
  withNewCurrent,
  resolveImageSets,
  findImageSetUses,
  rowToImageSet,
  cleanScheduled,
  cleanSetLink,
  type ImageSet,
} from "../website-image-sets";
import { normalizeBlocks } from "../website-blocks";
import { normalizeThanks } from "../website-site-design";

const ID = "11111111-2222-4333-8444-555555555555";
const T = (h: number) => Date.parse("2026-11-01T00:00:00Z") + h * 3_600_000;
const iso = (h: number) => new Date(T(h)).toISOString();
const v = (desk: string | null, mob: string | null = null, fx = 50, fy = 50) => ({ desk, mob, fx, fy, mfx: 50, mfy: 50 });
const set = (p: Partial<ImageSet> = {}): ImageSet => ({ id: ID, name: "New Arrival", link: "", alt: "", cur: v("a/desk1.jpg", "a/mob1.jpg", 30, 20), queue: [], history: [], ...p });

describe("ชุดรูป: ค่าที่ผูก", () => {
  it("imgset/<id> อ่านกลับเป็น id · ค่าอื่น = null", () => {
    expect(imgSetIdOf(imgSetRef(ID))).toBe(ID);
    expect([imgSetIdOf("storefront-brand/x.jpg"), imgSetIdOf(null), imgSetIdOf("imgset/123")]).toEqual([null, null, null]);
  });
  it("บันทึก Section: ช่องรูปเก็บค่า imgset/ ไว้ได้ (ตัวกรองช่องรูปเดิมไม่ตัดทิ้ง)", () => {
    const [b] = normalizeBlocks([{ id: "h1", type: "hero", imageKey: imgSetRef(ID), mobileImageKey: null }]) as unknown as Record<string, unknown>[];
    expect(b.imageKey).toBe(imgSetRef(ID));
  });
  it("หน้าขอบคุณ: รูปมือถือ + ลิงก์ (กันลิงก์แปลก)", () => {
    const t = normalizeThanks({ top: "image", imageKey: imgSetRef(ID), mobileImageKey: "a/m.jpg", link: "/c/new" });
    expect([t.imageKey, t.mobileImageKey, t.link]).toEqual([imgSetRef(ID), "a/m.jpg", "/c/new"]);
    expect(normalizeThanks({ link: "javascript:alert(1)" }).link).toBe("");
    expect(cleanSetLink("//evil.com")).toBe("");
  });
});

describe("ชุดรูป: ตั้งเวลา / ประวัติ", () => {
  const queue = [cleanScheduled({ id: "q1", at: iso(10), desk: "a/drop2.jpg" })!, cleanScheduled({ id: "q2", at: iso(20), until: iso(30), desk: "a/sale.jpg", mob: "a/sale-m.jpg" })!];
  it("ยังไม่ถึงเวลา = รูปหลัก · ถึงแล้ว = รูปที่ตั้ง · ช่วงชั่วคราวจบ = กลับรูปก่อนหน้า", () => {
    const s = set({ queue });
    expect(effectiveVersion(s, T(5)).desk).toBe("a/desk1.jpg");
    expect(effectiveVersion(s, T(12)).desk).toBe("a/drop2.jpg");
    expect(effectiveVersion(s, T(25))).toMatchObject({ desk: "a/sale.jpg", mob: "a/sale-m.jpg" });
    expect(effectiveVersion(s, T(31)).desk).toBe("a/drop2.jpg");
  });
  it("จัดคิว: รูปถาวรที่ถึงเวลา → รูปหลัก (เดิมเข้าประวัติ) · ช่วงที่จบแล้ว → ทิ้ง", () => {
    const { set: s, changed } = settleImageSet(set({ queue }), T(31));
    expect(changed).toBe(true);
    expect(s.cur.desk).toBe("a/drop2.jpg");
    expect(s.queue).toEqual([]);
    expect(s.history[0].desk).toBe("a/desk1.jpg");
    expect(settleImageSet(set(), T(31)).changed).toBe(false);
  });
  it("เปลี่ยนรูป = รูปเดิมเข้าประวัติ · ย้อนได้ · ไม่มีประวัติ = ย้อนไม่ได้", () => {
    const s2 = withNewCurrent(set(), v("a/desk2.jpg"));
    expect(s2.history.map((h) => h.desk)).toEqual(["a/desk1.jpg"]);
    expect(undoImageSet(s2)!.cur.desk).toBe("a/desk1.jpg");
    expect(undoImageSet(set())).toBeNull();
  });
  it("แถวจาก DB: ตั้งเวลาไม่มีรูป/เวลาเสีย = ทิ้ง · until ก่อน at = ไม่นับ", () => {
    const s = rowToImageSet({ id: ID, name: " A ", cur: {}, queue: [{ at: "bad", desk: "a/x.jpg" }, { at: iso(1) }, { at: iso(5), until: iso(2), desk: "a/y.jpg" }] });
    expect(s.name).toBe("A");
    expect(s.queue).toHaveLength(1);
    expect(s.queue[0].until).toBeNull();
  });
});

describe("ชุดรูป: แทนค่าให้เว็บร้าน", () => {
  const sets = (p: Partial<ImageSet> = {}) => new Map([[ID, set(p)]]);
  it("ช่องคอม → รูปคอม · ช่องมือถือคู่ (มีอยู่ในที่นั้น) → รูปมือถือของชุด · จุดสำคัญเข้าแผนที่", () => {
    const { data, focus, used } = resolveImageSets({ layout: [{ type: "hero", imageKey: imgSetRef(ID), mobileImageKey: null, alt: "" }] }, sets({ alt: "คอลเลกชันใหม่" }));
    expect(data.layout[0]).toMatchObject({ imageKey: "a/desk1.jpg", mobileImageKey: "a/mob1.jpg", alt: "คอลเลกชันใหม่" });
    expect(focus["a/desk1.jpg"]).toEqual({ x: 30, y: 20 });
    expect([...used]).toEqual([ID]);
  });
  it("ลิงก์ของชุด: ทับลิงก์ข้อความ (link/href) และลิงก์แบบ {text, href} · ชุดไม่ตั้งลิงก์ = ไม่แตะ", () => {
    const ins = { imageKey: imgSetRef(ID), mobileImageKey: "own/m.jpg", link: "/old" };
    const slide = { imageKey: imgSetRef(ID), link: { text: "ดูเลย", href: "/old" } };
    const r = resolveImageSets({ ins, slide }, sets({ link: "/c/new-arrival" }));
    expect(r.data.ins.link).toBe("/c/new-arrival");
    expect(r.data.slide.link).toEqual({ text: "ดูเลย", href: "/c/new-arrival" });
    expect(resolveImageSets({ ins }, sets()).data.ins.link).toBe("/old");
  });
  it("ชุดไม่มีรูปมือถือ = ที่นั้นใช้รูปมือถือของตัวเอง · ผูกช่องมือถือตรง ๆ = รูปมือถือของชุด", () => {
    const r = resolveImageSets({ a: { imageKey: imgSetRef(ID), mobileImageKey: "own/m.jpg" } }, sets({ cur: v("a/d.jpg") }));
    expect(r.data.a.mobileImageKey).toBe("own/m.jpg");
    expect(resolveImageSets({ b: { mobileImageKey: imgSetRef(ID) } }, sets()).data.b.mobileImageKey).toBe("a/mob1.jpg");
  });
  it("ชุดที่ถูกลบ = ไม่มีรูป · รายการรูปล้วน = รูปคอม · ของเดิมไม่ถูกแก้", () => {
    const src = { gone: { imageKey: imgSetRef("99999999-2222-4333-8444-555555555555") }, gallery: ["x/1.jpg", imgSetRef(ID)] };
    const r = resolveImageSets(src, sets());
    expect(r.data.gone.imageKey).toBeNull();
    expect(r.data.gallery).toEqual(["x/1.jpg", "a/desk1.jpg"]);
    expect(src.gallery[1]).toBe(imgSetRef(ID));
  });
  it("ตั้งเวลา: แทนค่าด้วยรูปตามเวลาที่ขอ", () => {
    const s = sets({ queue: [cleanScheduled({ at: iso(1), until: iso(2), desk: "a/sale.jpg" })!] });
    expect(resolveImageSets({ imageKey: imgSetRef(ID) }, s, T(1.5)).data.imageKey).toBe("a/sale.jpg");
    expect(resolveImageSets({ imageKey: imgSetRef(ID) }, s, T(3)).data.imageKey).toBe("a/desk1.jpg");
  });
});

describe("ชุดรูป: ใช้อยู่ที่ไหน", () => {
  it("ไล่หาจากหลายก้อน + ป้ายภาษาคน · ซ้ำที่เดิมนับครั้งเดียว", () => {
    const layout = [{ type: "hero", title: "New", imageKey: imgSetRef(ID), slides: [{ imageKey: imgSetRef(ID) }] }];
    const uses = findImageSetUses([
      { label: "หน้าแรก", state: "live", data: layout, labelOf: (p, root) => String(((root as Record<string, unknown>[])[p[0] as number] as { type: string }).type) },
      { label: "ดีไซน์", state: "draft", data: { page: { thanks: { imageKey: imgSetRef(ID) } } }, labelOf: (p) => (p[1] === "thanks" ? "หน้าขอบคุณ" : "") },
    ]);
    expect(uses).toEqual([
      { setId: ID, where: "หน้าแรก › hero", state: "live" },
      { setId: ID, where: "ดีไซน์ › หน้าขอบคุณ", state: "draft" },
    ]);
  });
});

describe("ชุดรูป: อ่าน DB (ฐานข้อมูลจำลอง)", () => {
  it("ไม่มีการผูก = ไม่อ่าน DB · มี = แทนค่า + จุดสำคัญ · r2-image ได้ค่า imgset/ = รูปปัจจุบัน", async () => {
    const { fakeDb } = await import("./fake-db");
    const { resolveForStorefront, imageSetKeyNow, hasImageSetRef } = await import("../website-image-sets-db");
    const row = { id: ID, shop_id: "s1", name: "New Arrival", link: "/c/new", alt: "", cur: { desk: "a/d.jpg", mob: "a/m.jpg", fx: 40, fy: 10, mfx: 50, mfy: 50 }, queue: [], history: [] };
    const sb = fakeDb({ store_image_sets: [row] }) as never;
    expect(hasImageSetRef({ layout: [{ imageKey: "a/x.jpg" }] })).toBe(false);
    const plain = { layout: [{ imageKey: "a/x.jpg" }] };
    expect((await resolveForStorefront(sb, "s1", plain)).parts).toBe(plain);
    const r = await resolveForStorefront(sb, "s1", { theme: { listing: { inserts: [{ imageKey: imgSetRef(ID), mobileImageKey: null, link: "" }] } } });
    expect(r.parts.theme.listing.inserts[0]).toEqual({ imageKey: "a/d.jpg", mobileImageKey: "a/m.jpg", link: "/c/new" });
    expect(r.focus).toEqual({ "a/d.jpg": { x: 40, y: 10 }, "a/m.jpg": { x: 50, y: 50 } });
    expect([await imageSetKeyNow(sb, imgSetRef(ID)), await imageSetKeyNow(sb, imgSetRef(ID), true), await imageSetKeyNow(sb, "a/x.jpg")]).toEqual(["a/d.jpg", "a/m.jpg", null]);
  });
});
