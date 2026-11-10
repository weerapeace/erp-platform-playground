import { describe, it, expect } from "vitest";
import { matchesFolderWord, planProductCollection, planProductMoves, planProductSort, planTidyRenames, productNasFolder, type ProductFileIn } from "./file-sort-product";
import { DEFAULT_PRODUCT_CONFIG, cleanProductConfig, collectionPatternFor, fillNasPattern } from "./file-sort";
import type { CatalogParent } from "./product-image-catalog-server";

const P = "11111111-0000-0000-0000-000000000001";
const S1 = "22222222-0000-0000-0000-000000000001";
const S2 = "22222222-0000-0000-0000-000000000002";
const parents = (over: Partial<CatalogParent> = {}): CatalogParent[] => [{
  parentId: P, code: "BSD15", name: "กระเป๋ายีนส์", gallery: 0, galleryItems: [], desc: 0, descItems: [], png: false, pngKey: null, shopIds: [],
  skus: [
    { id: S1, code: "BSD15-01", label: "ยีนส์เข้ม", gallery: 0, items: [] },
    { id: S2, code: "BSD15-02", label: "ยีนส์อ่อน", gallery: 0, items: [] },
  ],
  ...over,
}];

// หน้าตาเดียวกับโฟลเดอร์จริง Z:\Work In Process\[01] New Product\BSD15
const BSD15 = [
  "[01] Description/1.New Arrival.jpeg", "[01] Description/1.New Arrival.psd", "[01] Description/2.Color.jpeg",
  "[01] Description/Ver.2/1.New Arrival.jpeg", "[01] Description/Ver.2/2.Color.jpeg", "[01] Description/Ver.2/3.Size.jpeg", "[01] Description/Ver.2/Thumbs.db",
  "[03] Rawfiles/IMG_0001.CR2", "[03] Rawfiles/IMG_0001.jpg", "[03] Rawfiles/Select/IMG_0002.jpg", "[03] Rawfiles/IMG_0001.xmp",
  "BSD15/1.jpeg", "BSD15/2.jpeg", "BSD15/10.jpeg", "BSD15/1.psd",
  "BSD15-01/1.jpeg", "BSD15-01/2.jpeg", "BSD15-01/7-2.jpeg", "BSD15-01/7.jpeg", "BSD15-01/2.psd", "BSD15-01/BSD15-01.png",
  "BSD15-01.jpeg", "Thumbs.db",
].map((path) => ({ path, size: 1000 }));

const plan = (files: ProductFileIn[] = BSD15, ps = parents(), mode?: "replace" | "append") => planProductSort(files, ps, DEFAULT_PRODUCT_CONFIG, { jobFolder: "BSD15", mode });
const at = (p: ReturnType<typeof plan>, rel: string) => p.files.find((f) => f.rel === rel)!;

describe("planProductSort — โฟลเดอร์รุ่น BSD15", () => {
  const p = plan();

  it("Description ใช้ Ver.2 (ล่าสุด) ลงเป็นรูป Description ของรุ่น · เรียงตามเลข", () => {
    const desc = p.slots.find((s) => s.kind === "desc")!;
    expect(desc.parentId).toBe(P);
    expect(desc.rels).toEqual(["[01] Description/Ver.2/1.New Arrival.jpeg", "[01] Description/Ver.2/2.Color.jpeg", "[01] Description/Ver.2/3.Size.jpeg"]);
    expect(at(p, "[01] Description/1.New Arrival.jpeg")).toMatchObject({ erp: false, nas: true, why: "old_version" });
    expect(at(p, "[01] Description/Ver.2/2.Color.jpeg").width).toBe(1200);
  });

  it("โฟลเดอร์รหัสรุ่น → แกลเลอรี Parent (1, 2, 10 เรียงแบบตัวเลข)", () => {
    const g = p.slots.find((s) => s.kind === "parentGallery")!;
    expect(g.rels).toEqual(["BSD15/1.jpeg", "BSD15/2.jpeg", "BSD15/10.jpeg"]);
    expect(g.entity).toEqual({ type: "parent_skus_v2", id: P });
  });

  it("ไฟล์ชั้นบนชื่อ = รหัส SKU → ปก · รูปในโฟลเดอร์สีเป็นแกลเลอรี (รูป 1 ไม่ชิงปก)", () => {
    const g = p.slots.find((s) => s.kind === "skuGallery" && s.skuId === S1)!;
    expect(g.coverRel).toBe("BSD15-01.jpeg");
    expect(g.rels[0]).toBe("BSD15-01.jpeg");
    expect(g.rels).toEqual(["BSD15-01.jpeg", "BSD15-01/1.jpeg", "BSD15-01/2.jpeg", "BSD15-01/7.jpeg", "BSD15-01/7-2.jpeg"]);
    expect(g.entity).toEqual({ type: "skus_v2", id: S1 });
    expect(at(p, "BSD15-01/1.jpeg").dest).toBe("sku");
  });

  it(".png ชื่อ = รหัส SKU → รูปตัด PNG ของรุ่น", () => {
    expect(at(p, "BSD15-01/BSD15-01.png")).toMatchObject({ erp: true, dest: "png", width: 2000 });
    expect(p.slots.find((s) => s.kind === "png")!.rels).toEqual(["BSD15-01/BSD15-01.png"]);
  });

  it("Rawfiles / PSD / RAW / xmp ไม่ลงระบบ แต่อยู่บน Z: · ไฟล์ระบบข้าม", () => {
    for (const r of ["[03] Rawfiles/IMG_0001.jpg", "[03] Rawfiles/Select/IMG_0002.jpg"]) expect(at(p, r)).toMatchObject({ erp: false, nas: true, why: "archive" });
    for (const r of ["[03] Rawfiles/IMG_0001.CR2", "BSD15/1.psd", "[01] Description/1.New Arrival.psd"]) expect(at(p, r)).toMatchObject({ erp: false, nas: true, why: "not_image" });
    expect(at(p, "Thumbs.db")).toMatchObject({ erp: false, nas: false, why: "junk" });
    expect(at(p, "[01] Description/Ver.2/Thumbs.db").why).toBe("junk");
  });

  it("สรุปจำนวน + ไม่มีคำเตือน", () => {
    expect(p.counts).toEqual({ total: 23, erp: 12, nas: 21, skipped: 2 });
    expect(p.warnings).toEqual([]);
    expect(p.parents.map((x) => x.code)).toEqual(["BSD15"]);
  });
});

describe("planProductSort — รูปเดิม / โหมด", () => {
  const withOld = parents({
    gallery: 2, galleryItems: [{ id: "a1", key: "k1", primary: true }, { id: "a2", key: "k2", primary: false }],
    desc: 2, descItems: [{ assetId: "d1", sort: 0 }, { assetId: "d2", sort: 1 }],
  });

  it("แทนที่: บอกรูปเดิมที่จะเอาออก (แกลเลอรี Parent + Description)", () => {
    const p = plan(BSD15, withOld, "replace");
    const g = p.slots.find((s) => s.kind === "parentGallery")!;
    expect(g.replaces).toBe(true);
    expect(g.remove.attachments).toEqual([{ id: "a1", key: "k1" }, { id: "a2", key: "k2" }]);
    const d = p.slots.find((s) => s.kind === "desc")!;
    expect(d.replaces).toBe(true);
    expect(d.remove.desc).toEqual([{ assetId: "d1", sort: 0 }, { assetId: "d2", sort: 1 }]);
    expect(g.prev).toEqual({ primaryId: "a1", pngKey: null });
    expect(p.slots.find((s) => s.kind === "png")!.prev).toEqual({ primaryId: null, pngKey: null });
  });

  it("ต่อท้าย: ไม่เอาอะไรออก · เกินเพดาน 9 = ไม่ลง + เตือน", () => {
    const full = parents({ gallery: 8, galleryItems: Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, key: `k${i}`, primary: i === 0 })) });
    const p = plan(BSD15, full, "append");
    const g = p.slots.find((s) => s.kind === "parentGallery")!;
    expect(g.replaces).toBe(false);
    expect(g.remove.attachments).toEqual([]);
    expect(g.rels).toEqual(["BSD15/1.jpeg"]);
    expect(at(p, "BSD15/2.jpeg")).toMatchObject({ erp: false, nas: true, why: "over" });
    expect(p.warnings.some((w) => w.includes("เกินเพดาน"))).toBe(true);
  });

  it("โหมดตั้งต้นมาจากสูตร (replace)", () => {
    expect(plan(BSD15, withOld).mode).toBe("replace");
  });
});

describe("planProductSort — จับคู่ไม่ได้", () => {
  it("โฟลเดอร์สีที่ไม่มีในระบบ → ไม่ลง + เตือน · รุ่นที่มีลงตามปกติ", () => {
    const p = plan([{ path: "BSD15-09/1.jpg" }, { path: "BSD15/1.jpg" }]);
    expect(at(p, "BSD15-09/1.jpg")).toMatchObject({ erp: false, nas: true, why: "unmatched" });
    expect(p.warnings[0]).toMatch(/BSD15-09/);
    expect(at(p, "BSD15/1.jpg").erp).toBe(true);
  });
  it("ไม่พบสินค้าเลย → เตือนชัด", () => {
    const p = planProductSort([{ path: "X/1.jpg" }], [], DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZZ99" });
    expect(p.warnings[0]).toMatch(/ไม่พบสินค้า/);
    expect(p.counts.erp).toBe(0);
  });
});

describe("productNasFolder", () => {
  it("ราก + ชื่อโฟลเดอร์รุ่น · ไม่ตั้งราก = null", () => {
    expect(productNasFolder(DEFAULT_PRODUCT_CONFIG, "C:\\Users\\x\\Desktop\\BSD15")).toBe("Z:\\Work In Process\\[01] New Product\\BSD15");
    expect(productNasFolder({ ...DEFAULT_PRODUCT_CONFIG, nasPatterns: { ...DEFAULT_PRODUCT_CONFIG.nasPatterns, new: "" } }, "BSD15")).toBeNull();
  });
});

describe("เพิ่มสี / แก้สี", () => {
  // BSD15-01 มีรูปในระบบแล้ว · BSD15-02 ยังไม่มีรูป (สีใหม่) · BSD15-09 ไม่มีในระบบ
  const ps = (): CatalogParent[] => parents({ skus: [
    { id: S1, code: "BSD15-01", label: "เข้ม", gallery: 2, items: [{ id: "o1", key: "k1", primary: true }, { id: "o2", key: "k2", primary: false }] },
    { id: S2, code: "BSD15-02", label: "อ่อน", gallery: 0, items: [] },
  ] });
  const files = ["[01] Description/1.jpg", "BSD15/1.jpg", "BSD15-01/1.jpg", "BSD15-01/BSD15-01.png", "BSD15-02/1.jpg", "BSD15-02/2.jpg", "BSD15-09/1.jpg", "BSD15-02.jpg"].map((path) => ({ path, size: 10 }));
  it("เพิ่มสี: ลงเฉพาะสีที่ยังไม่มีรูป · ไม่แตะ Parent / Description / สีเดิม / PNG · เตือนสีที่ยังไม่มีในระบบ", () => {
    const p = planProductSort(files, ps(), DEFAULT_PRODUCT_CONFIG, { jobFolder: "BSD15", variant: "color" });
    expect(p.variant).toBe("color");
    expect(p.slots.map((s) => `${s.kind}:${s.code}`)).toEqual(["skuGallery:BSD15-02"]);
    expect(p.slots[0].rels).toEqual(["BSD15-02.jpg", "BSD15-02/1.jpg", "BSD15-02/2.jpg"]);
    expect(p.slots[0].coverRel).toBe("BSD15-02.jpg");
    for (const r of ["[01] Description/1.jpg", "BSD15/1.jpg", "BSD15-01/1.jpg", "BSD15-01/BSD15-01.png"]) expect(p.files.find((f) => f.rel === r)).toMatchObject({ erp: false, nas: true, why: "scope" });
    expect(p.warnings.some((w) => w.includes("BSD15-09") && w.includes("สร้าง SKU"))).toBe(true);
  });
  it("แก้สี: แทนที่เฉพาะแกลเลอรีสีที่อยู่ในโฟลเดอร์ · Parent / Description / PNG ไม่แตะ", () => {
    const p = planProductSort(files, ps(), DEFAULT_PRODUCT_CONFIG, { jobFolder: "BSD15", variant: "edit", mode: "replace" });
    expect(p.slots.map((s) => `${s.kind}:${s.code}`).sort()).toEqual(["skuGallery:BSD15-01", "skuGallery:BSD15-02"]);
    const s1 = p.slots.find((s) => s.code === "BSD15-01")!;
    expect(s1.replaces).toBe(true);
    expect(s1.remove.attachments.map((a) => a.id)).toEqual(["o1", "o2"]);
    expect(p.files.find((f) => f.rel === "BSD15-01/BSD15-01.png")).toMatchObject({ erp: false, why: "scope" });
    expect(p.files.find((f) => f.rel === "BSD15/1.jpg")?.why).toBe("scope");
  });
  it("เพิ่มสีแต่ทุกสีมีรูปแล้ว → เตือน", () => {
    const p = planProductSort([{ path: "BSD15-01/1.jpg" }], ps(), DEFAULT_PRODUCT_CONFIG, { jobFolder: "BSD15", variant: "color" });
    expect(p.slots).toEqual([]);
    expect(p.warnings.some((w) => w.includes("ไม่พบสีใหม่"))).toBe(true);
  });
  it("ที่เก็บบน Z: แยกตามชนิดงานย่อย", () => {
    const cfg = { ...DEFAULT_PRODUCT_CONFIG, nasPatterns: { new: "Z:\\NP\\{รุ่น}", color: "Z:\\NC\\{ปี}-{เดือน}\\{รุ่น}", edit: "" } };
    expect(productNasFolder(cfg, "BSD15", "color", new Date("2026-11-08T00:00:00Z"))).toBe("Z:\\NC\\2026-11\\BSD15");
    expect(productNasFolder(cfg, "BSD15", "edit")).toBeNull();
  });
});

describe("ย้ายโฟลเดอร์ Rawfiles / Images หลังลงรูปเสร็จ", () => {
  const files: ProductFileIn[] = ["[01] Description/1.jpg", "[02] Images/a.jpg", "[02] Images/b.jpg", "[03] Rawfiles/IMG_1.CR2", "[03] Rawfiles/IMG_1.jpg", "[03] Rawfiles/Thumbs.db", "00_rawfiles_1/x.jpg", "BSD15-01/1.jpg", "BSD15-01.jpg"]
    .map((path) => ({ path, size: 100 }));
  it("ค่าตั้งต้น: Rawfiles ย้ายไป Raw Files ตามแบรนด์ · Images อยู่ที่เดิม · ไม่นับไฟล์ระบบ", () => {
    const { moves, warnings } = planProductMoves(files, DEFAULT_PRODUCT_CONFIG, { jobFolder: "BSD15", brandFolder: "[01] Louis Montini" });
    expect(moves.map((m) => `${m.role}:${m.folder}:${m.mode}:${m.files}`)).toEqual(["raw:00_rawfiles_1:move:1", "raw:[03] Rawfiles:move:2", "images:[02] Images:stay:2"]);
    expect(moves[1].target).toBe("Z:\\Raw Files\\[01] Louis Montini\\BSD15_rawfiles");
    expect(moves[1].bytes).toBe(200);
    expect(moves[2].target).toBeNull();
    expect(warnings).toEqual([]);
  });
  it("สินค้ายังไม่ได้ตั้งแบรนด์ → ไม่เดา · เตือนให้ตั้งแบรนด์หรือเลือกที่เอง", () => {
    const { moves, warnings } = planProductMoves(files, DEFAULT_PRODUCT_CONFIG, { jobFolder: "JEAN10", brandFolder: null });
    const raw = moves.find((m) => m.folder === "[03] Rawfiles")!;
    expect(raw.target).toBeNull();
    expect(raw.reason).toBe("สินค้านี้ยังไม่ได้ตั้งแบรนด์ในระบบ");
    expect(warnings.some((w) => w.includes("[03] Rawfiles") && w.includes("ตั้งแบรนด์"))).toBe(true);
  });
  it("ตั้งให้ Images ย้ายด้วย + แม่แบบไม่ใช้แบรนด์ + ชื่อโฟลเดอร์ตั้งเอง", () => {
    const cfg = cleanProductConfig({ moves: { raw: { mode: "stay", pattern: "" }, images: { mode: "move", pattern: "Z:\\Lifestyle\\{ปี}\\{รุ่น}" } }, moveFolders: { raw: "rawfiles", images: " Images , Lifestyle " } });
    expect(cfg.moveFolders.images).toEqual(["images", "lifestyle"]);
    const { moves, warnings } = planProductMoves([...files, { path: "[04] Lifestyle/c.jpg", size: 5 }], cfg, { jobFolder: "BSD15", brandFolder: null, now: new Date("2026-11-08T00:00:00Z") });
    expect(moves.filter((m) => m.role === "images").map((m) => `${m.folder}→${m.target}`)).toEqual(["[02] Images→Z:\\Lifestyle\\2026\\BSD15", "[04] Lifestyle→Z:\\Lifestyle\\2026\\BSD15"]);
    expect(moves.find((m) => m.folder === "[03] Rawfiles")).toMatchObject({ mode: "stay", target: null, reason: "ยังไม่ได้ตั้งที่ย้าย" });
    expect(warnings).toEqual([]);
  });
  it("ชื่อโฟลเดอร์: ไม่สนเลขนำหน้า · มีเลขต่อท้ายก็นับ · คำที่ขึ้นต้นเหมือนแต่ไม่ใช่ไม่นับ", () => {
    const w = DEFAULT_PRODUCT_CONFIG.moveFolders.raw;
    expect(matchesFolderWord("[03] Rawfile", w)).toBe(true);
    expect(matchesFolderWord("Raw Files 2", w)).toBe(true);
    expect(matchesFolderWord("00_rawfiles_1", w)).toBe(true);
    expect(matchesFolderWord("Rawhide", w)).toBe(false);
    expect(cleanProductConfig({}).moves).toEqual(DEFAULT_PRODUCT_CONFIG.moves);
  });
});

describe("planProductCollection — เก็บทั้งโฟลเดอร์เข้า Collection (แบบปุ่ม Arrange)", () => {
  const files: ProductFileIn[] = [
    { path: "Description/1.jpeg", size: 10 }, { path: "Lifestyle/a.jpg", size: 10 }, { path: "BSD15 Model/b.jpg", size: 10 },
    { path: "[03] Rawfiles/IMG_1.CR2", size: 10 }, { path: "BSD15-01/1.jpeg", size: 10 }, { path: "Thumbs.db", size: 1 },
  ];
  const LOUIS = { id: "b-louis", name: "Louis Montini", folder: "[01] Louis Montini" };
  it("ค่าตั้งต้น: เก็บเข้า Z:\\Collection\\{กลุ่ม}\\<รุ่น> · คง {กลุ่ม} ไว้ให้โปรแกรมหาบน Z: · จัดชื่อแบบ Arrange", () => {
    const { collection, warnings } = planProductCollection(files, DEFAULT_PRODUCT_CONFIG, { jobFolder: "BSD15", brand: LOUIS });
    expect(collection).toMatchObject({ mode: "move", target: "Z:\\Collection\\{กลุ่ม}\\BSD15", reason: null, tidy: true });
    expect(collection.renames).toEqual([
      { from: "BSD15 Model", to: "[02] Images/BSD15 Model" },
      { from: "Description", to: "[01] Description" },
      { from: "Lifestyle", to: "[02] Images/Lifestyle" },
    ]);
    expect(warnings).toEqual([]);
  });
  it("ค่าตั้งต้นตามชื่อแบรนด์: IG / Nekomeow / Risara (ตรงกับโครงจริงใน Z:\\Collection) · ตั้งทับรายแบรนด์ได้", () => {
    const c = DEFAULT_PRODUCT_CONFIG.collection;
    expect(planProductCollection(files, DEFAULT_PRODUCT_CONFIG, { jobFolder: "TTN01", brand: { id: "b-ig", name: "IG International", folder: "[02] IG International" } }).collection.target)
      .toBe("Z:\\Collection\\[01] สินค้าร้าน IG (IG Products)\\{กลุ่ม}\\TTN01");
    expect(planProductCollection(files, DEFAULT_PRODUCT_CONFIG, { jobFolder: "NEKO-BOX002", brand: { id: "b-neko", name: " nekomeow ", folder: null } }).collection.target)
      .toBe("Z:\\Collection\\[05] Nekomeow\\NEKO-BOX002");
    expect(collectionPatternFor(c, { id: "x", name: "Risara Ja Kissa" })).toContain("[06] Risara Ja Kissa");
    // แบรนด์ที่ยังไม่มีที่ใน Collection → ไม่มีค่าตั้งต้น = ไม่เก็บ (ไม่เดา) จนกว่าจะตั้ง
    const gg = planProductCollection(files, DEFAULT_PRODUCT_CONFIG, { jobFolder: "CTL002L", brand: { id: "b-gg", name: "Good Goods", folder: "[06] Goodgoods" } });
    expect(gg.collection).toMatchObject({ target: null, reason: "ยังไม่ได้ตั้งที่เก็บ Collection ของแบรนด์นี้" });
    expect(gg.warnings[0]).toContain("เปลี่ยนที่");
    const cfg = cleanProductConfig({ collection: { mode: "move", pattern: "Z:\\Collection\\{กลุ่ม}\\{รุ่น}", byBrand: { "b-louis": "Z:\\Archive\\{แบรนด์}\\{รุ่น}", "": "Z:\\x", bad: 5 }, tidy: false } });
    expect(cfg.collection.byBrand).toEqual({ "b-louis": "Z:\\Archive\\{แบรนด์}\\{รุ่น}" });
    const r = planProductCollection(files, cfg, { jobFolder: "BSD15", brand: LOUIS }).collection;
    expect(r.target).toBe("Z:\\Archive\\[01] Louis Montini\\BSD15");
    expect(r.tidy).toBe(false);
    expect(r.renames.length).toBe(3);   // คิดไว้เสมอ · โปรแกรมติ๊กเปิดเองได้
  });
  it("สินค้ายังไม่ได้ตั้งแบรนด์ → ไม่เดา · เตือน · ตั้งเป็น 'อยู่ที่ Work In Process' = ไม่เตือน", () => {
    const a = planProductCollection(files, DEFAULT_PRODUCT_CONFIG, { jobFolder: "JEAN10", brand: null });
    expect(a.collection.target).toBeNull();
    expect(a.collection.reason).toBe("สินค้านี้ยังไม่ได้ตั้งแบรนด์ในระบบ");
    expect(a.warnings[0]).toContain("ตั้งแบรนด์");
    const stay = cleanProductConfig({ collection: { mode: "stay" } });
    expect(planProductCollection(files, stay, { jobFolder: "JEAN10", brand: null }).warnings).toEqual([]);
    expect(cleanProductConfig({}).collection).toEqual(DEFAULT_PRODUCT_CONFIG.collection);
  });
  it("จัดชื่อ: มี [01] Description อยู่แล้ว = ไม่แตะ · ข้าม Rawfiles/Images · Description หลายอันเปลี่ยนแค่อันแรก", () => {
    expect(planTidyRenames(["[01] Description", "Description2", "[02] Images", "Raw files model", "Models"], DEFAULT_PRODUCT_CONFIG))
      .toEqual([{ from: "Models", to: "[02] Images/Models" }]);
    expect(planTidyRenames(["Description A", "Description B"], DEFAULT_PRODUCT_CONFIG)).toEqual([{ from: "Description A", to: "[01] Description" }]);
  });
  it("{กลุ่ม} ในแม่แบบอื่นที่ไม่ได้ส่งค่า = ตัดชั้นนั้นทิ้ง (ไม่ค้างเป็นข้อความ)", () => {
    expect(fillNasPattern("Z:\\Work\\{กลุ่ม}\\{รุ่น}", { รุ่น: "BSD15" })).toBe("Z:\\Work\\BSD15");
  });
});

describe("planProductSort — PNG ไปโฟลเดอร์ PNG · JPEG ใน Images ให้เลือกส่ง Contents", () => {
  const pp: CatalogParent[] = [{ parentId: "PX", code: "PIX39", name: "x", gallery: 0, galleryItems: [], desc: 0, descItems: [], png: false, pngKey: null, shopIds: [],
    skus: [{ id: "SX1", code: "PIX39-01", label: "", gallery: 0, items: [] }, { id: "SX2", code: "PIX39-02", label: "", gallery: 0, items: [] }] }];
  const ff: ProductFileIn[] = ["PIX39-01/1.jpeg", "PIX39-01/1.png", "PIX39-01/2.png", "PIX39-02/1.jpeg", "PIX39-02/1.png", "PIX39/1.jpeg", "PIX39/cut.png",
    "[02] Images/IMG_1.jpeg", "[02] Images/IMG_2.JPG", "[02] Images/IMG_1.psd", "[02] Images/sub/IMG_3.jpg", "[03] Rawfiles/IMG_9.jpg"].map((path) => ({ path, size: 100 }));
  it("ค่าเริ่ม: PNG ไม่ลงแกลเลอรี · ก๊อปไป [04] PNG ชื่อตามรหัสสี/รุ่น", () => {
    const p = planProductSort(ff, pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "PIX39" });
    expect(p.pngs).toEqual([
      { rel: "PIX39-01/1.png", name: "PIX39-01.png" }, { rel: "PIX39-01/2.png", name: "PIX39-01.png" },
      { rel: "PIX39-02/1.png", name: "PIX39-02.png" }, { rel: "PIX39/cut.png", name: "PIX39.png" },
    ].sort((a, b) => p.pngs.findIndex((x) => x.rel === a.rel) - p.pngs.findIndex((x) => x.rel === b.rel)));
    expect(p.pngs.length).toBe(4);
    const png1 = p.files.find((f) => f.rel === "PIX39-01/1.png")!;
    expect(png1).toMatchObject({ erp: false, why: "png" });
    expect(p.slots.flatMap((s) => s.rels).some((r) => r.endsWith(".png"))).toBe(false);
    expect(p.contentCandidates.sort()).toEqual(["[02] Images/IMG_1.jpeg", "[02] Images/IMG_2.JPG", "[02] Images/sub/IMG_3.jpg"].sort());
  });
  it("ติ๊กให้ลงแกลเลอรีด้วย → PNG กลับเข้าแกลเลอรี (ยังก๊อปด้วย) · ปิดก๊อป → ไม่มีรายการก๊อป", () => {
    const p = planProductSort(ff, pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "PIX39", pngGallery: true });
    expect(p.slots.find((s) => s.code === "PIX39-01")!.rels).toContain("PIX39-01/1.png");
    expect(p.pngs.length).toBe(4);
    const off = cleanProductConfig({ png: { mode: "off", folder: "x/y", gallery: false } });
    expect(off.png).toEqual({ mode: "off", folder: "xy", gallery: false });
    expect(planProductSort(ff, pp, off, { jobFolder: "PIX39" }).pngs).toEqual([]);
    expect(cleanProductConfig({}).png).toEqual({ mode: "copy", folder: "[04] PNG", gallery: false });
  });
});

describe("planProductSort — เลือกรายช่อง: แทนที่ทั้งหมด / เลือกแทนบางรูป / ต่อท้าย", () => {
  const items = (n: number, pre: string) => Array.from({ length: n }, (_, i) => ({ id: `${pre}${i + 1}`, key: `k/${pre}${i + 1}.jpg`, primary: i === 0 }));
  const pp: CatalogParent[] = [{ parentId: "PZ", code: "ZZ1", name: "z", gallery: 0, galleryItems: [], desc: 2, descItems: [{ assetId: "d1", sort: 0 }, { assetId: "d2", sort: 1 }], png: false, pngKey: null, shopIds: [],
    skus: [{ id: "SZ1", code: "ZZ1-01", label: "", gallery: 7, items: items(7, "o") }] }];
  const ff: ProductFileIn[] = ["ZZ1-01/1.jpg", "ZZ1-01/2.jpg", "ZZ1-01/3.jpg", "ZZ1-01/4.jpg", "ZZ1-01/5.jpg", "[01] Description/1.jpg"].map((path) => ({ path, size: 10 }));
  const KEY = "PZ|skuGallery|SZ1";
  it("ค่าเริ่ม (แทนที่ทั้งหมด): เอารูปเดิม 7 ออก · ลงใหม่ 5 · ช่องบอกรูปเดิมไว้โชว์รูปย่อ", () => {
    const s = planProductSort(ff, pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZ1", mode: "replace" }).slots.find((x) => x.key === KEY)!;
    expect(s).toMatchObject({ mode: "replace", replaces: true });
    expect(s.remove.attachments.length).toBe(7);
    expect(s.rels.length).toBe(5);
    expect(s.existingItems.map((x) => x.key)).toEqual(items(7, "o").map((x) => x.key));
  });
  it("ต่อท้าย (รายช่อง): ไม่เอาออก · ที่ว่าง 9-7 = 2 รูป ที่เหลือเกินเพดาน", () => {
    const p = planProductSort(ff, pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZ1", mode: "replace", slotModes: { [KEY]: { mode: "append" } } });
    const s = p.slots.find((x) => x.key === KEY)!;
    expect(s).toMatchObject({ mode: "append", replaces: false, existing: 7 });
    expect(s.remove.attachments).toEqual([]);
    expect(s.rels.length).toBe(2);
    expect(p.files.filter((f) => f.why === "over").length).toBe(3);
    // ช่องอื่นยังแทนที่ตามค่าเริ่ม
    expect(p.slots.find((x) => x.kind === "desc")).toMatchObject({ mode: "replace", replaces: true });
  });
  it("เลือกแทนบางรูป: เอาออกเฉพาะที่เลือก (รวมปกเดิม → รูปแรกที่ลงเป็นปก) · ที่ว่างเพิ่มตาม · id มั่ว ๆ ไม่นับ", () => {
    const p = planProductSort(ff, pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZ1", slotModes: { [KEY]: { mode: "pick", remove: ["o1", "o2", "o3", "ไม่มี"] } } });
    const s = p.slots.find((x) => x.key === KEY)!;
    expect(s).toMatchObject({ mode: "pick", replaces: true, existing: 4 });
    expect(s.remove.attachments.map((x) => x.id)).toEqual(["o1", "o2", "o3"]);
    expect(s.rels.length).toBe(5);
    expect(s.coverRel).toBe(s.rels[0]);
    const keepCover = planProductSort(ff, pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZ1", slotModes: { [KEY]: { mode: "pick", remove: ["o5"] } } }).slots.find((x) => x.key === KEY)!;
    expect(keepCover.coverRel).toBe("ZZ1-01/1.jpg");   // ปกตามกติกาเดิม (รูปเบอร์ 1 = ปก) — ไม่ได้มาจากการเอาปกเดิมออก
    expect(keepCover.rels.length).toBe(3);         // 9 - (7-1) = 3
  });
  it("Description เลือกแทนบางรูปได้ (id = asset)", () => {
    const s = planProductSort(ff, pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZ1", slotModes: { "PZ|desc|-": { mode: "pick", remove: ["d2"] } } }).slots.find((x) => x.kind === "desc")!;
    expect(s.remove.desc).toEqual([{ assetId: "d2", sort: 1 }]);
    expect(s.existingItems.map((x) => x.id)).toEqual(["d1", "d2"]);
  });
  it("Collection มีรุ่นนี้แล้ว: ค่าเริ่ม = แทนที่ เก็บของเก่า · ค่าผิด = ค่าเริ่ม · [99] ของเก่า ไม่ลงระบบ", () => {
    expect(DEFAULT_PRODUCT_CONFIG.collection.whenExists).toBe("replace");
    expect(cleanProductConfig({ collection: { whenExists: "separate" } }).collection.whenExists).toBe("separate");
    expect(cleanProductConfig({ collection: { whenExists: "x" } }).collection.whenExists).toBe("replace");
    const c = planProductCollection(ff, DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZ1", brand: { id: "b", name: "Louis Montini", folder: "[01] Louis Montini" } }).collection;
    expect(c).toMatchObject({ whenExists: "replace", oldFolder: "[99] ของเก่า" });
    const p = planProductSort([...ff, { path: "[99] ของเก่า/2026-11-10/ZZ1-01/1.jpg", size: 1 }], pp, DEFAULT_PRODUCT_CONFIG, { jobFolder: "ZZ1" });
    expect(p.files.find((f) => f.rel.startsWith("[99]"))).toMatchObject({ erp: false, why: "archive" });
  });
});
