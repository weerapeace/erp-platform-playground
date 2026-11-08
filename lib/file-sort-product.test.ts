import { describe, it, expect } from "vitest";
import { planProductSort, productNasFolder, type ProductFileIn } from "./file-sort-product";
import { DEFAULT_PRODUCT_CONFIG } from "./file-sort";
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
