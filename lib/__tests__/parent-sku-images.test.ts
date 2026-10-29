import { describe, it, expect } from "vitest";
import type { AssetRow } from "@/app/api/assets/shared";
import {
  assembleParentImages, isPendingParentImage, pendingAssetRow, rankParentHits, type GalleryAtt,
} from "@/lib/parent-sku-images";

const asset = (id: string, key: string, type: AssetRow["asset_type"] = "image"): AssetRow => ({
  ...pendingAssetRow({ id: "x", entity_type: "", entity_id: "", file_name: id, file_path: key, public_url: null, content_type: "image/jpeg", size_bytes: null, created_at: "" }, ""),
  id, asset_type: type,
});
const att = (id: string, entityType: string, entityId: string, key: string): GalleryAtt => ({
  id, entity_type: entityType, entity_id: entityId, file_name: "รูปปกเดิม", file_path: key, public_url: null, content_type: "image/webp", size_bytes: 10, created_at: "2026-01-01",
});

describe("rankParentHits", () => {
  const rows = [
    { id: "a", code: "PIX221", name: "Pixie A", is_active: true },
    { id: "b", code: "PIX22", name: "Pixie Fluffy Heart Bag PIX22", is_active: true },
    { id: "c", code: "PIX34", name: "Pixie Dustie", is_active: true },
    { id: "d", code: "OLD22", name: "เก่า", is_active: false, sku_codes: ["PIX22-99"] },
  ];
  it("รหัสตรงเป๊ะขึ้นก่อน · ตัวที่ไม่ตรงทุกคำถูกตัด", () => {
    expect(rankParentHits("pix22", rows, 5).map((r) => r.id)).toEqual(["b", "a", "d"]);
  });
  it("ค้นรหัส SKU ลูก → เจอ Parent ของมัน", () => {
    expect(rankParentHits("PIX22-99", rows, 5).map((r) => r.id)).toEqual(["d"]);
  });
  it("ตัดตามจำนวนที่ขอ", () => {
    expect(rankParentHits("pix", rows, 2)).toHaveLength(2);
  });
});

describe("assembleParentImages", () => {
  const parent = { id: "p1", code: "PIX22" };
  const skus = [{ id: "s1", code: "PIX22-01" }, { id: "s2", code: "PIX22-02" }];
  const inLib = asset("asset-cover", "parent_skus/1/cover");
  it("เรียง Parent → SKU ลูก → Description · รูปซ้ำโชว์ครั้งเดียว · รูปแกลเลอรีที่อยู่ในคลังแล้วใช้ id จริง", () => {
    const items = assembleParentImages({
      parent, skus,
      atts: [att("t1", "parent_skus_v2", "p1", "parent_skus/1/cover"), att("t2", "skus_v2", "s2", "skus/2"), att("t3", "skus_v2", "s1", "skus/1")],
      usages: [
        { module: "parent_sku", record_id: "p1", asset: inLib },                       // ซ้ำกับแกลเลอรี
        { module: "parent_sku_description", record_id: "p1", asset: asset("desc", "desc/1") },
        { module: "product_sku", record_id: "s1", asset: asset("u-s1", "skus/1b") },
      ],
      assetByKey: new Map([[inLib.r2_key, inLib]]),
    });
    expect(items.map((i) => [i.group, i.owner, i.asset.id])).toEqual([
      ["parent", "PIX22", "asset-cover"],
      ["sku", "PIX22-01", "att:t3"],
      ["sku", "PIX22-01", "u-s1"],
      ["sku", "PIX22-02", "att:t2"],
      ["description", "PIX22", "desc"],
    ]);
    expect(isPendingParentImage(items[1].asset.id)).toBe(true);
    expect(isPendingParentImage(items[0].asset.id)).toBe(false);
  });
  it("กรองชนิดไฟล์ (เช่น ป๊อปเลือกเอกสาร ไม่เอารูป)", () => {
    const items = assembleParentImages({
      parent, skus: [], atts: [att("t1", "parent_skus_v2", "p1", "k1")],
      usages: [{ module: "parent_sku", record_id: "p1", asset: asset("doc", "k2", "document") }],
      assetByKey: new Map(), type: "document",
    });
    expect(items.map((i) => i.asset.id)).toEqual(["doc"]);
  });
});

describe("pendingAssetRow", () => {
  it("ชื่อ = รหัสเจ้าของ + ชื่อไฟล์ · url ผ่านตัวย่อรูปกลาง", () => {
    const r = pendingAssetRow(att("t9", "skus_v2", "s1", "product_skus/1/original"), "PIX22-01");
    expect(r.id).toBe("att:t9");
    expect(r.title).toBe("PIX22-01 รูปปกเดิม");
    expect(r.url).toBe("/api/r2-image?key=product_skus%2F1%2Foriginal");
    expect(r.asset_type).toBe("image");
  });
});
