import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE,
  applyRowMode,
  cleanRoleFolders,
  defaultRowModeOf,
  fileRoles,
  folderLabelKey,
  versionOfFolder,
  buildWebItems,
  candidateCodes,
  codePrefixes,
  destFromName,
  estimateBytes,
  groupRouteFiles,
  imageWarning,
  matchName,
  parseTemplate,
  planRoute,
  resizeWidth,
  routeCodeIndex,
  templateFrom,
  type PlanGroupIn,
  type RouteParent,
} from "./product-image-routing";

const BR = "aaaaaaaa-0000-0000-0000-000000000001";
const BK = "aaaaaaaa-0000-0000-0000-000000000002";
const M1 = "bbbbbbbb-0000-0000-0000-000000000001";
const parents: RouteParent[] = [
  {
    parentId: "p11",
    code: "BCG11",
    name: "กระเป๋าคาดอก",
    gallery: 1,
    desc: 0,
    png: false,
    shopIds: ["louis", "ig"],
    skus: [
      { id: BR, code: "BCG11-01", label: "น้ำตาล", gallery: 2 },
      { id: BK, code: "BCG11-02", label: "ดำ", gallery: 8 },
    ],
    webColor: { louis: { [BR]: 7 } },
    hero: { louis: { desktop: true, mobile: false } },
  },
  { parentId: "p12", code: "BCG12", name: "คาดเอว", gallery: 2, desc: 1, png: true, shopIds: ["louis"], skus: [{ id: M1, code: "BCG12-01", label: "น้ำตาล", aliases: ["BCG12-01-L"], gallery: 0 }] },
];
const idx = routeCodeIndex(parents);

describe("matchName", () => {
  it("สี · รหัสไซส์ · ทั้งรุ่น · สีที่ไม่มี · ไม่พบ", () => {
    expect(matchName("BCG11-01", parents, idx)).toMatchObject({ how: "color", target: { parentId: "p11", skuId: BR } });
    expect(matchName("bcg12-01-l", parents, idx)).toMatchObject({ how: "size", target: { parentId: "p12", skuId: M1 }, note: "รหัสไซส์ L → สีน้ำตาล" });
    expect(matchName("BCG11 รูปคนใส่", parents, idx)).toMatchObject({ how: "parent", target: { parentId: "p11", skuId: null } });
    expect(matchName("BCG11-07", parents, idx)).toMatchObject({ how: "none", target: null, guessParentId: "p11", note: "ไม่มีสี 07 ในรุ่น BCG11" });
    expect(matchName("ZZZ99-01", parents, idx)).toMatchObject({ how: "none", note: "ไม่พบรหัส ZZZ99-01" });
    expect(matchName("รูปคนใส่", parents, idx).note).toBe("ชื่อไม่มีรหัสสินค้า");
    // BCG11-010 ไม่ใช่ BCG11-01
    expect(matchName("BCG11-010", parents, idx).target).toBeNull();
  });
});

describe("groupRouteFiles", () => {
  it("แยกตามโฟลเดอร์ · ไฟล์เดี่ยวตามรหัส · เรียงตัวเลข", () => {
    const g = groupRouteFiles(
      [
        { id: "a", path: "BCG11-01/10.jpg" },
        { id: "b", path: "BCG11-01/2.jpg" },
        { id: "c", path: "BCG12-01-L/1.jpg" },
        { id: "d", path: "BCG11-01_3.jpg" },
        { id: "e", path: "สตูดิโอ/BCG11-02_1.jpg" },
        { id: "f", path: "อะไรก็ได้.jpg" },
        { id: "g", path: "ส่งงาน/BCG11-07/1.jpg" },
      ],
      parents,
      idx
    );
    const by = Object.fromEntries(g.map((x) => [x.label, x]));
    expect(by["BCG11-01"].fileIds).toEqual(["b", "a"]);
    expect(by["BCG11-01"].match.how).toBe("color");
    expect(by["BCG12-01-L"].match.how).toBe("size");
    // ไฟล์เดี่ยว BCG11-01_3 แยกกลุ่ม (ไม่ปนกับโฟลเดอร์) แต่ชี้สีเดียวกัน
    expect(g.filter((x) => x.match.target?.skuId === BR)).toHaveLength(2);
    // โฟลเดอร์ไม่มีรหัส → ใช้ชื่อไฟล์ข้างใน
    expect(by["สตูดิโอ"].match).toMatchObject({ how: "file", target: { skuId: BK } });
    expect(by["ไฟล์ที่ไม่มีโฟลเดอร์"].match.how).toBe("none");
    // โฟลเดอร์ซ้อน: ใช้ชื่อลึกสุดก่อน
    expect(by["BCG11-07"].match).toMatchObject({ how: "none", guessParentId: "p11" });
  });
});

describe("candidateCodes / codePrefixes", () => {
  it("ดึงรหัสจากชื่อโฟลเดอร์และไฟล์", () => {
    expect(candidateCodes(["BCG11-01/1_ปก.jpg", "bcg12-01-l/IMG_4519.jpg", "BCG12-01-L/2.jpg", "hero.jpg", "BCG11/desc_1.jpg"]).sort()).toEqual(["BCG11", "BCG11-01", "bcg12-01-l"]);
    expect(codePrefixes("BCG12-01-L")).toEqual(["BCG12-01-L", "BCG12-01", "BCG12"]);
  });
});

describe("destFromName", () => {
  it("คำในชื่อไฟล์", () => {
    expect(destFromName("1_ปก", false)).toBe("skuMain");
    expect(destFromName("1_ปก", true)).toBe("parent");
    expect(destFromName("ปกติ", false)).toBeNull();
    expect(destFromName("hero", true)).toBe("heroD");
    expect(destFromName("BCG11_hero_m", true)).toBe("heroM");
    expect(destFromName("desc_1", true)).toBe("desc");
    expect(destFromName("cutout-png", true)).toBe("png");
    expect(destFromName("IMG_4519", false)).toBeNull();
    expect(destFromName("heroes", false)).toBeNull();
  });
});

describe("แม่แบบ + ตั้งทั้งโฟลเดอร์", () => {
  const imgs = ["1_ปก", "2", "3", "4"].map((b, i) => ({ id: `i${i}`, base: b }));
  const tpl = { pos: { "1": "skuMain" as const, "3": "parent" as const }, rest: "sku" as const, parentFolder: "parent" as const };
  it("ตามแม่แบบ: ชื่อไฟล์มาก่อน แล้วค่อยตำแหน่ง", () => {
    expect(applyRowMode(imgs, "tpl", { parentLevel: false, template: tpl }).map((x) => `${x.dest}:${x.by}`)).toEqual(["skuMain:name", "sku:tpl", "parent:tpl", "sku:tpl"]);
    expect(applyRowMode([{ id: "h", base: "hero" }, { id: "x", base: "1" }], "tpl", { parentLevel: true, template: tpl }).map((x) => x.dest)).toEqual(["heroD", "parent"]);
  });
  it("ไฟล์เดี่ยว: ไม่ตั้งปกตามตำแหน่ง (ชื่อไฟล์มีคำว่า ปก ยังได้)", () => {
    expect(applyRowMode([{ id: "a", base: "BCG11-01_3" }], "tpl", { parentLevel: false, template: tpl, loose: true })[0].dest).toBe("sku");
    expect(applyRowMode([{ id: "a", base: "BCG11-01_ปก" }], "tpl", { parentLevel: false, template: tpl, loose: true })[0].dest).toBe("skuMain");
  });
  it("ทุกรูป → SKU ลูก: รูปแรกเป็นปก · ข้ามทั้งโฟลเดอร์", () => {
    expect(applyRowMode(imgs, "skuAll", { parentLevel: false, template: tpl }).map((x) => x.dest)).toEqual(["skuMain", "sku", "sku", "sku"]);
    expect(applyRowMode(imgs, "skip", { parentLevel: false, template: tpl }).every((x) => x.dest === "skip")).toBe(true);
  });
  it("อ่าน/จำแม่แบบ", () => {
    expect(parseTemplate(DEFAULT_TEMPLATE)).toEqual(DEFAULT_TEMPLATE);
    expect(parseTemplate({ pos: { "1": "bad" }, rest: "sku", parentFolder: "parent" })).toEqual({ pos: {}, rest: "sku", parentFolder: "parent" });
    expect(parseTemplate({ rest: "nope" })).toBeNull();
    expect(templateFrom(["skuMain", "sku", "parent"], ["parent", "desc", "parent"], DEFAULT_TEMPLATE)).toEqual({ pos: { "1": "skuMain", "2": "sku", "3": "parent" }, rest: "sku", parentFolder: "parent" });
  });
});

describe("planRoute", () => {
  const G = (key: string, target: PlanGroupIn["target"], dests: string[]): PlanGroupIn => ({
    key,
    label: key,
    target,
    images: dests.map((d, i) => ({ id: `${key}-${i}`, base: String(i + 1), dest: d as PlanGroupIn["images"][number]["dest"], by: "user" })),
  });
  it("ปกขึ้นหน้า · เพดาน 9 · ปกซ้ำ · ยังไม่เลือกสี", () => {
    const { images, slots } = planRoute(
      [
        G("brown", { parentId: "p11", skuId: BR }, ["sku", "skuMain", "parent", "skip"]),
        G("black", { parentId: "p11", skuId: BK }, ["skuMain", "sku", "skuMain"]),
        G("whole", { parentId: "p11", skuId: null }, ["sku", "parent"]),
        G("none", null, ["sku", "parent"]),
      ],
      parents,
      { shopIds: ["louis"], mode: "append" }
    );
    const brown = slots.find((s) => s.kind === "skuGallery" && s.skuId === BR)!;
    expect(brown.ids).toEqual(["brown-1", "brown-0"]);
    expect(brown.coverId).toBe("brown-1");
    expect(brown.total).toBe(4);
    // ดำมีอยู่ 8 รูป → ลงได้อีก 1 (ปก) · ปกที่ 2 = error
    expect(images.get("black-0")?.state).toBe("upload");
    expect(images.get("black-1")).toMatchObject({ state: "over", note: "เกิน 9 รูป — ไม่ลง" });
    expect(images.get("black-2")).toMatchObject({ state: "error", note: "ปกได้รูปเดียว — เลือกช่องอื่น" });
    expect(images.get("whole-0")?.note).toBe("โฟลเดอร์ทั้งรุ่น — เลือกสีก่อน");
    expect(images.get("none-0")?.note).toBe("เลือกสีก่อน");
    expect(images.get("none-1")?.note).toBe("เลือกรุ่นก่อน");
    expect(images.get("brown-3")?.state).toBe("skip");
    const pg = slots.find((s) => s.kind === "parentGallery")!;
    expect(pg.ids).toEqual(["brown-2", "whole-1"]);
    expect(pg.total).toBe(3);
  });
  it("โหมดแทนที่ · Hero/PNG ช่องละ 1 · ร้าน", () => {
    const { images, slots } = planRoute(
      [
        G("brown", { parentId: "p11", skuId: BR }, ["sku", "webColor", "webColor"]),
        G("whole", { parentId: "p11", skuId: null }, ["heroD", "heroD", "heroM", "png"]),
        G("m", { parentId: "p12", skuId: M1 }, ["webColor"]),
      ],
      parents,
      { shopIds: ["louis"], mode: "replace" }
    );
    const brown = slots.find((s) => s.kind === "skuGallery")!;
    expect(brown).toMatchObject({ existing: 0, total: 1, replaces: true });
    const web = slots.find((s) => s.kind === "webColor" && s.parentId === "p11")!;
    expect(web).toMatchObject({ shopIds: ["louis"], replaces: true, total: 2 });
    const hd = slots.find((s) => s.kind === "heroD")!;
    expect(hd).toMatchObject({ ids: ["whole-0"], replaces: true });
    expect(images.get("whole-1")?.state).toBe("over");
    expect(slots.find((s) => s.kind === "heroM")?.replaces).toBe(false);
    expect(slots.find((s) => s.kind === "png")?.parentId).toBe("p11");
    // ไม่เลือกร้านเลย = ช่องหน้าเว็บลงไม่ได้
    const none = planRoute([G("m", { parentId: "p12", skuId: M1 }, ["webColor"])], parents, { shopIds: [], mode: "append" });
    expect(none.images.get("m-0")).toMatchObject({ state: "error", note: "ยังไม่ได้เลือกร้านที่ขายรุ่นนี้" });
  });
  it("ต่อท้ายรูปบนเว็บรายสี: เดิม 7 → ลงได้ 1 (เพดาน 8)", () => {
    const { images } = planRoute([G("b", { parentId: "p11", skuId: BR }, ["webColor", "webColor"])], parents, { shopIds: ["louis", "ig"], mode: "append" });
    expect(images.get("b-0")?.state).toBe("upload");
    expect(images.get("b-1")?.state).toBe("over");
  });
});

describe("ขนาดรูป + เตือน", () => {
  it("ลดตามช่อง / เท่ากัน / ไม่ลด (เกิน 20 MB ลดให้)", () => {
    expect(resizeWidth("heroD", "auto", 2000, 1e6)).toEqual({ width: 2560, forced: false });
    expect(resizeWidth("sku", "fixed", 1200, 1e6)).toEqual({ width: 1200, forced: false });
    expect(resizeWidth("sku", "none", 1200, 5e6)).toEqual({ width: null, forced: false });
    expect(resizeWidth("sku", "none", 1200, 25 * 1024 * 1024)).toEqual({ width: 1500, forced: true });
    expect(estimateBytes(6_000_000, 4000, 1500)).toBe(843750);
    expect(estimateBytes(300_000, 800, 1500)).toBe(300_000);
    // ไฟล์เล็กมาก: ประมาณแล้วไม่เกินต้นฉบับ
    expect(estimateBytes(20_000, 1600, 1500)).toBe(20_000);
  });
  it("เตือนรูปซ้ำ · Hero เล็ก · PNG · เล็ก", () => {
    const f = { width: 4000, height: 4000, bytes: 6e6, isPng: false };
    expect(imageWarning("sku", { ...f, dupOf: "BCG11-01/3.jpg" }, { forced: false })).toBe("ซ้ำกับ BCG11-01/3.jpg");
    expect(imageWarning("heroD", { ...f, width: 3000, height: 3750 }, { forced: false })).toMatch(/16:9/);
    expect(imageWarning("png", f, { forced: false })).toBe("ไม่ใช่ไฟล์ PNG พื้นใส");
    expect(imageWarning("sku", { ...f, width: 800, height: 800 }, { forced: false })).toBe("รูปเล็ก 800px ซูมแล้วแตก");
    expect(imageWarning("skip", { ...f, dupOf: "x" }, { forced: false })).toBeNull();
  });
});

describe("buildWebItems", () => {
  it("รวมรูปสี + Hero ต่อรุ่น", () => {
    expect(
      buildWebItems([
        { parentId: "p11", skuId: BR, dest: "webColor", key: "k1" },
        { parentId: "p11", skuId: BR, dest: "webColor", key: "k2" },
        { parentId: "p11", skuId: null, dest: "heroD", key: "h1" },
        { parentId: "p11", skuId: null, dest: "sku", key: "x" },
      ])
    ).toEqual([{ parentId: "p11", skus: { [BR]: ["k1", "k2"] }, hero: { desktop: "h1" } }]);
  });
});

describe("เคยอัปแล้ว (ประวัติชุดอัป)", () => {
  it("รูปที่เคยอัปข้ามให้ · ตำแหน่งที่เหลือยังตามแม่แบบ", () => {
    const imgs = ["1", "2", "3"].map((b, i) => ({ id: `s${i}`, base: b }));
    const r = applyRowMode(imgs, "tpl", { parentLevel: false, template: DEFAULT_TEMPLATE, seen: new Set(["s0"]) });
    expect(r.map((x) => `${x.dest}:${x.by}`)).toEqual(["skip:seen", "sku:tpl", "sku:tpl"]);
    expect(applyRowMode(imgs, "skuAll", { parentLevel: false, template: DEFAULT_TEMPLATE, seen: new Set(["s1"]) })[1].dest).toBe("skip");
  });
});

describe("โฟลเดอร์หน้าที่ (Description / Images / Rawfiles) + ชื่อไฟล์ = รหัส", () => {
  const files = [
    { id: "d1", path: "BCG11/[01] Description/1.New Arrival.jpg" },
    { id: "d2", path: "BCG11/[01] Description/Ver.2/1.New Arrival.jpg" },
    { id: "d3", path: "BCG11/[01] Description/Ver.2/2.Color.jpg" },
    { id: "r1", path: "BCG11/[03] Rawfiles/IMG_1.jpg" },
    { id: "p1", path: "BCG11/BCG11/1.jpg" },
    { id: "c1", path: "BCG11/BCG11-01/1.jpg" },
    { id: "c2", path: "BCG11/BCG11-01/2.jpg" },
    { id: "cv", path: "BCG11/BCG11-01.jpg" },
    { id: "png", path: "BCG11/BCG11-01/BCG11-01.png" },
    { id: "x7", path: "BCG11/BCG11-07/1.jpg" },
  ];
  const g = groupRouteFiles(files, parents, idx);
  const find = (id: string) => g.find((x) => x.fileIds.includes(id))!;

  it("Description: เวอร์ชันล่าสุดเป็นรูป Description ของรุ่น · เวอร์ชันเก่าข้าม", () => {
    expect(find("d2")).toMatchObject({ role: "desc", match: { target: { parentId: "p11", skuId: null } } });
    expect(find("d2").fileIds).toEqual(["d2", "d3"]);
    expect(find("d1").role).toBe("old");
    expect(defaultRowModeOf(find("d2"))).toBe("desc");
    expect(defaultRowModeOf(find("d1"))).toBe("skip");
  });
  it("Rawfiles = เก็บไฟล์ ไม่ลงระบบ (ข้ามตั้งต้น)", () => {
    expect(find("r1")).toMatchObject({ role: "archive", match: { target: null } });
    expect(defaultRowModeOf(find("r1"))).toBe("skip");
  });
  it("ไฟล์ชั้นบนชื่อ = รหัส SKU → ย้ายไปกลุ่ม SKU เป็นปก · .png ชื่อรหัส → PNG", () => {
    expect(find("cv")).toMatchObject({ key: `f:p11|${BR}`, hints: { cv: "skuMain" } });
    expect(find("png").hints).toEqual({ png: "png" });
    expect(find("c1").match.target).toEqual({ parentId: "p11", skuId: BR });
  });
  it("โฟลเดอร์รหัสสีที่ไม่มีในรุ่น (อยู่ในโฟลเดอร์รุ่น) → ให้เลือกเอง ไม่ตกไปเป็นของทั้งรุ่น", () => {
    expect(find("x7").match).toMatchObject({ target: null, guessParentId: "p11" });
  });
  it("hints มาก่อนแม่แบบ · ปกจากแม่แบบยอมให้ปกจากชื่อไฟล์", () => {
    const cover = applyRowMode([{ id: "cv", base: "BCG11-01" }], "tpl", { parentLevel: false, template: DEFAULT_TEMPLATE, loose: true, hints: { cv: "skuMain" } });
    expect(cover[0]).toMatchObject({ dest: "skuMain", by: "name" });
    const folder = applyRowMode([{ id: "c1", base: "1" }, { id: "c2", base: "2" }], "tpl", { parentLevel: false, template: DEFAULT_TEMPLATE });
    const t = { parentId: "p11", skuId: BR };
    const plan = planRoute([{ key: "a", label: "a", target: t, images: folder }, { key: "b", label: "b", target: t, images: cover }], parents, { shopIds: [], mode: "append" });
    const slot = plan.slots.find((s) => s.kind === "skuGallery")!;
    expect(slot.coverId).toBe("cv");
    expect(slot.ids).toEqual(["cv", "c1", "c2"]);
    expect([...plan.images.values()].every((x) => x.state === "upload")).toBe(true);
  });
  it("ปกที่ตั้งชัดทั้ง 2 รูป → ยังให้เลือกใหม่เหมือนเดิม", () => {
    const t = { parentId: "p11", skuId: BR };
    const plan = planRoute([{ key: "a", label: "a", target: t, images: [{ id: "u1", base: "x", dest: "skuMain", by: "user" }, { id: "u2", base: "y", dest: "skuMain", by: "name" }] }], parents, { shopIds: [], mode: "append" });
    expect(plan.images.get("u2")).toMatchObject({ state: "error", note: "ปกได้รูปเดียว — เลือกช่องอื่น" });
  });
  it("โหมดแทนที่ครอบรูป Description ด้วย (รุ่นที่มี Description เดิม)", () => {
    const im = [{ id: "n1", base: "1", dest: "desc" as const, by: "row" as const }];
    const rep = planRoute([{ key: "d", label: "d", target: { parentId: "p12", skuId: null }, images: im }], parents, { shopIds: [], mode: "replace" });
    expect(rep.slots[0]).toMatchObject({ kind: "desc", existing: 0, replaces: true });
    const app = planRoute([{ key: "d", label: "d", target: { parentId: "p12", skuId: null }, images: im }], parents, { shopIds: [], mode: "append" });
    expect(app.slots[0]).toMatchObject({ kind: "desc", existing: 1, replaces: false });
  });
});

describe("ชื่อโฟลเดอร์หน้าที่", () => {
  it("ตัดเลขนำหน้า · อ่านเวอร์ชัน · ค่าตั้งสะอาด", () => {
    expect(folderLabelKey("[01] Description")).toBe("description");
    expect(folderLabelKey("03_Rawfiles")).toBe("rawfiles");
    expect(folderLabelKey("2. Images")).toBe("images");
    expect(versionOfFolder("Ver.2")).toBe(2);
    expect(versionOfFolder("v10")).toBe(10);
    expect(versionOfFolder("Version 3")).toBe(3);
    expect(versionOfFolder("Select")).toBeNull();
    expect(cleanRoleFolders({ desc: ["[01] Description", "description", " "], archive: "x" })).toEqual({ desc: ["description"], archive: ["images", "rawfiles", "raw files", "raw"] });
    expect(fileRoles(["A/[02] Images/x.jpg", "A/x.jpg"])).toMatchObject([{ role: "archive" }, { role: null }]);
  });
});
