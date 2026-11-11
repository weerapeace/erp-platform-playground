import { describe, it, expect } from "vitest";
import { buildTaskImages, countTaskImages, orderTaskParentIds, type TaskGalleryAtt, type TaskUsageRow } from "@/lib/task-images";

const att = (id: string, entity_type: string, entity_id: string, file_path: string, is_primary = false, content_type: string | null = "image/jpeg"): TaskGalleryAtt => ({
  id, entity_type, entity_id, file_name: null, file_path, public_url: null, content_type, size_bytes: null, created_at: "2026-11-01T00:00:00Z", is_primary,
});
const use = (module: string, record_id: string, r2_key: string, content_type: string | null = "image/jpeg"): TaskUsageRow => ({
  module, record_id, asset: { id: `a-${r2_key}`, r2_key, file_name: null, content_type, size_bytes: null, created_at: "2026-11-01T00:00:00Z" },
});

const P = { id: "p1", code: "PIX47", name_th: "กระเป๋า PIX47" };
const skus = [
  { id: "s1", code: "PIX47-01", parent_sku_id: "p1", color_th: "ดำ", color: null },
  { id: "s2", code: "PIX47-02", parent_sku_id: "p1", color_th: null, color: "Pink" },
];

describe("orderTaskParentIds — Parent ของงาน", () => {
  it("Parent หลักก่อน → ที่ผูกเพิ่ม → ของ SKU · ไม่ซ้ำ · ข้ามค่าว่าง", () => {
    expect(orderTaskParentIds("a", ["b", "a", null], ["c", "b", undefined])).toEqual(["a", "b", "c"]);
  });
  it("ไม่มี Parent หลัก ใช้ตัวที่ผูก", () => {
    expect(orderTaskParentIds(null, [], ["x"])).toEqual(["x"]);
  });
  it("ตัดที่ limit", () => {
    expect(orderTaskParentIds(null, ["1", "2", "3"], [], 2)).toEqual(["1", "2"]);
  });
});

describe("buildTaskImages — แบ่งกลุ่มรูปของงาน", () => {
  const base = { parentIds: ["p1"], parents: [P], skus, contents: [], contentAtts: [] };

  it("แยก Parent / SKU / Description + ติดป้ายปกจากรูปหลัก", () => {
    const r = buildTaskImages({
      ...base,
      atts: [att("1", "parent_skus_v2", "p1", "p/cover.jpg", true), att("2", "parent_skus_v2", "p1", "p/2.jpg"), att("3", "skus_v2", "s1", "s/1.jpg")],
      usages: [use("parent_sku_description", "p1", "d/1.jpg"), use("parent_sku_description", "p1", "d/2.jpg")],
    });
    const p = r.parents[0];
    expect(p.images).toEqual([{ key: "p/cover.jpg", cover: true }, { key: "p/2.jpg" }]);
    expect(p.description).toEqual([{ key: "d/1.jpg" }, { key: "d/2.jpg" }]);
    expect(p.skus.map((s) => [s.code, s.color, s.images.length])).toEqual([["PIX47-01", "ดำ", 1], ["PIX47-02", "Pink", 0]]);
    expect(countTaskImages(r)).toBe(5);
  });

  it("SKU ที่ไม่มีรูปยังอยู่ในรายการ (ไว้เตือน)", () => {
    const r = buildTaskImages({ ...base, atts: [], usages: [] });
    expect(r.parents[0].skus).toHaveLength(2);
    expect(r.parents[0].skus.every((s) => s.images.length === 0)).toBe(true);
    expect(countTaskImages(r)).toBe(0);
  });

  it("รูปเดียวกันโชว์ครั้งเดียว (อยู่ที่กลุ่มแรกที่เจอ)", () => {
    const r = buildTaskImages({
      ...base,
      atts: [att("1", "parent_skus_v2", "p1", "same.jpg"), att("2", "skus_v2", "s1", "same.jpg")],
      usages: [use("parent_sku_description", "p1", "same.jpg"), use("product_sku", "s2", "s2.jpg")],
    });
    expect(r.parents[0].images).toEqual([{ key: "same.jpg" }]);
    expect(r.parents[0].skus[0].images).toEqual([]);
    expect(r.parents[0].description).toEqual([]);
    expect(r.parents[0].skus[1].images).toEqual([{ key: "s2.jpg" }]);
  });

  it("ไม่รวมวิดีโอ", () => {
    const r = buildTaskImages({ ...base, atts: [att("1", "parent_skus_v2", "p1", "v.mp4", false, "video/mp4")], usages: [use("parent_sku_description", "p1", "d.mp4", "video/mp4")] });
    expect(countTaskImages(r)).toBe(0);
  });

  it("Parent ที่หาไม่เจอถูกข้าม · เรียงตาม parentIds", () => {
    const P2 = { id: "p2", code: "WK46", name_th: null };
    const r = buildTaskImages({ ...base, parentIds: ["p2", "gone", "p1"], parents: [P, P2], atts: [], usages: [] });
    expect(r.parents.map((p) => p.code)).toEqual(["WK46", "PIX47"]);
    expect(r.parents[0].skus).toEqual([]);
  });

  it("รูปคอนเทนต์: เฉพาะรูป · ไม่ซ้ำ · แยกตามคอนเทนต์", () => {
    const r = buildTaskImages({
      ...base, atts: [], usages: [],
      contents: [{ id: "c1", title: "New Arrival", status: "draft" }, { id: "c2", title: null, status: null }],
      contentAtts: [
        { content_id: "c1", r2_key: "c/1.jpg", content_type: "image/jpeg" },
        { content_id: "c1", r2_key: "c/1.jpg", content_type: "image/jpeg" },
        { content_id: "c1", r2_key: "c/v.mp4", content_type: "video/mp4" },
        { content_id: "c1", r2_key: null, content_type: null },
        { content_id: "c2", r2_key: "c/2.jpg", content_type: null },
      ],
    });
    expect(r.contents).toEqual([
      { id: "c1", title: "New Arrival", status: "draft", images: [{ key: "c/1.jpg" }] },
      { id: "c2", title: "", status: null, images: [{ key: "c/2.jpg" }] },
    ]);
  });
});
