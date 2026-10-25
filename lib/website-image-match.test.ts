import { describe, expect, it } from "vitest";
import { buildMassItems, matchImagePath, parseSuffix, planImageUpload, targetLabel, type CatalogParent, type PlanFileIn } from "./website-image-match";

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const S3 = "33333333-3333-3333-3333-333333333333";
const parents: CatalogParent[] = [
  {
    parentId: "p-jean",
    code: "JEAN08",
    name: "ยีนส์",
    webImages: [],
    hero: { desktop: null, mobile: null },
    skus: [
      { id: S1, code: "JEAN08-01", label: "น้ำเงิน", aliases: ["JEAN08-01-L"], webImages: [], hero: { desktop: null, mobile: null } },
      { id: S2, code: "JEAN08-02", label: "ดำ", webImages: ["a", "b"], hero: { desktop: "old", mobile: null } },
    ],
  },
  { parentId: "p-bbp", code: "BBP03", name: "กระเป๋า", webImages: Array.from({ length: 11 }, (_, i) => `g${i}`), hero: { desktop: null, mobile: null }, skus: [{ id: S3, code: "BBP03-01", label: "แทน", webImages: [], hero: { desktop: null, mobile: null } }] },
];

describe("parseSuffix", () => {
  it("อ่านเลขลำดับ + hero", () => {
    expect(parseSuffix("_2")).toEqual({ hero: null, order: 2 });
    expect(parseSuffix(" (3)")).toEqual({ hero: null, order: 3 });
    expect(parseSuffix("")).toEqual({ hero: null, order: 0 });
    expect(parseSuffix("_hero")).toEqual({ hero: "desktop", order: 0 });
    expect(parseSuffix("_hero_m")).toEqual({ hero: "mobile", order: 0 });
    expect(parseSuffix("-HERO-mobile")).toEqual({ hero: "mobile", order: 0 });
    expect(parseSuffix("_heroes")).toEqual({ hero: null, order: 0 });
  });
});

describe("matchImagePath", () => {
  it("รหัสรุ่น = รูปบนเว็บ · รหัสสี = รูปสี (สียาวกว่าได้ก่อน)", () => {
    expect(matchImagePath("JEAN08_2.jpg", parents)).toMatchObject({ parentId: "p-jean", target: { kind: "gallery" }, order: 2, status: "ok" });
    expect(matchImagePath("jean08-01 (3).webp", parents)).toMatchObject({ parentId: "p-jean", target: { kind: "sku", skuId: S1 }, order: 3 });
    expect(matchImagePath("JEAN08-01-L_1.jpg", parents)).toMatchObject({ target: { kind: "sku", skuId: S1 }, order: 1 });
  });
  it("hero ของรุ่น / ของสี", () => {
    expect(matchImagePath("JEAN08_hero.jpg", parents).target).toEqual({ kind: "hero", slot: "desktop" });
    expect(matchImagePath("JEAN08_hero_m.jpg", parents).target).toEqual({ kind: "hero", slot: "mobile" });
    expect(matchImagePath("JEAN08-02_hero_m.png", parents).target).toEqual({ kind: "skuHero", skuId: S2, slot: "mobile" });
  });
  it("โฟลเดอร์ = รหัส เมื่อชื่อไฟล์ไม่มีรหัส", () => {
    expect(matchImagePath("Louis/JEAN08-01/2.jpg", parents)).toMatchObject({ target: { kind: "sku", skuId: S1 }, order: 2, via: "folder" });
    expect(matchImagePath("JEAN08/hero_m.jpg", parents)).toMatchObject({ target: { kind: "hero", slot: "mobile" }, via: "folder" });
    expect(matchImagePath("JEAN08/JEAN08-02_1.jpg", parents)).toMatchObject({ target: { kind: "sku", skuId: S2 }, via: "name" });
  });
  it("สีที่ไม่มีในรุ่น → ให้เลือกเอง (ไม่เดาเป็นรูปบนเว็บ)", () => {
    const m = matchImagePath("JEAN08-03.jpg", parents);
    expect(m.status).toBe("pick");
    expect(m.parentId).toBe("p-jean");
    expect(m.target).toBeNull();
    expect(m.reason).toContain("JEAN08-03");
  });
  it("ไม่มีรหัส / รหัสนอกร้าน", () => {
    expect(matchImagePath("IMG_4821.jpg", parents)).toMatchObject({ parentId: null, status: "pick", reason: "ชื่อไฟล์ไม่มีรหัสสินค้า" });
    expect(matchImagePath("photo.jpg", parents).reason).toBe("ชื่อไฟล์ไม่มีรหัสสินค้า");
    expect(matchImagePath("BBP99-01.jpg", parents).reason).toBe("ไม่พบรหัส BBP99-01 ในร้านนี้");
    // JEAN080 ไม่ใช่ JEAN08 (หลังรหัสต้องเป็นตัวคั่น)
    expect(matchImagePath("JEAN080.jpg", parents).parentId).toBeNull();
  });
});

describe("planImageUpload", () => {
  const f = (id: string, path: string, extra: Partial<PlanFileIn> = {}): PlanFileIn => {
    const m = matchImagePath(path, parents);
    return { id, name: path, parentId: m.parentId, target: m.target, order: m.order, ...extra };
  };
  it("เรียงตามเลข · ต่อท้ายนับรวมของเดิม · เกินเพดานข้าม", () => {
    const files = [f("1", "BBP03_3.jpg"), f("2", "BBP03_1.jpg"), f("3", "JEAN08-01_2.jpg"), f("4", "JEAN08-01.jpg")];
    const { files: out, dests } = planImageUpload(files, parents, "append");
    const g = dests.find((d) => d.parentId === "p-bbp")!;
    expect(g.fileIds).toEqual(["2"]); // เดิม 11 รูป เหลือที่ 1
    expect(g.total).toBe(12);
    expect(out.find((x) => x.id === "1")!.plan).toBe("over");
    expect(dests.find((d) => d.target.kind === "sku")!.fileIds).toEqual(["4", "3"]);
  });
  it("โหมดแทนที่ = นับจากศูนย์ + บอกว่าแทนของเดิม", () => {
    const { dests } = planImageUpload([f("1", "BBP03_3.jpg"), f("2", "BBP03_1.jpg")], parents, "replace");
    expect(dests[0]).toMatchObject({ fileIds: ["2", "1"], total: 2, replaces: true });
  });
  it("Hero ช่องละรูปเดียว · มีของเดิม = แทน", () => {
    const { files: out, dests } = planImageUpload([f("1", "JEAN08-02_hero_2.jpg"), f("2", "JEAN08-02_hero.jpg")], parents, "append");
    expect(dests[0]).toMatchObject({ fileIds: ["2"], replaces: true });
    expect(out.find((x) => x.id === "1")!.plan).toBe("dupHero");
  });
  it("ไม่จับคู่ / ข้ามเอง", () => {
    const { files: out } = planImageUpload([f("1", "IMG_1.jpg"), f("2", "JEAN08.jpg", { skip: true })], parents, "append");
    expect(out.map((x) => x.plan)).toEqual(["unmatched", "skip"]);
  });
  it("buildMassItems รวมต่อรุ่น", () => {
    const { dests } = planImageUpload([f("1", "JEAN08_1.jpg"), f("2", "JEAN08-01.jpg"), f("3", "JEAN08_hero_m.jpg"), f("4", "JEAN08-01_hero.jpg")], parents, "append");
    const items = buildMassItems(dests, (id) => `k${id}`);
    expect(items).toEqual([{ parentId: "p-jean", gallery: ["k1"], skus: { [S1]: ["k2"] }, hero: { mobile: "k3" }, skuHero: { [S1]: { desktop: "k4" } } }]);
  });
});

describe("targetLabel", () => {
  it("ชื่อช่องภาษาคน", () => {
    expect(targetLabel({ kind: "sku", skuId: S1 }, parents[0])).toBe("สี 01 น้ำเงิน");
    expect(targetLabel({ kind: "hero", slot: "mobile" }, parents[0])).toBe("Hero มือถือ");
  });
});
