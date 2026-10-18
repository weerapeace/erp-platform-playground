import { describe, expect, it, vi } from "vitest";

// ตัดของฝั่ง server ที่ไม่ใช้ในเทสต์ (R2/อ้างอิงไฟล์) — เทสต์เฉพาะตรรกะเทียบค่า
vi.mock("@/lib/r2", () => ({ r2MoveToTrash: vi.fn() }));
vi.mock("@/lib/r2-refs", () => ({ r2KeyStillReferenced: vi.fn() }));

import { diffVersionedFields, versionedColumnsIn } from "./record-versions";

describe("versionedColumnsIn", () => {
  it("เลือกเฉพาะคอลัมน์ที่จดเวอร์ชันและ patch แตะ", () => {
    expect(versionedColumnsIn("parent_skus_v2", { description: "x", list_price: 10 })).toEqual(["description"]);
  });
  it("รูปปกนับด้วย", () => {
    expect(versionedColumnsIn("skus_v2", { cover_image_r2_key: "a.jpg", name_th: "x" })).toEqual(["name_th", "cover_image_r2_key"]);
  });
  it("ตารางที่ไม่จดเวอร์ชัน = ว่าง", () => {
    expect(versionedColumnsIn("brands", { description: "x", cover_image_r2_key: "a" })).toEqual([]);
  });
});

describe("diffVersionedFields", () => {
  it("ค่าเปลี่ยน → จดค่าเก่า/ใหม่", () => {
    expect(diffVersionedFields("parent_skus_v2", { description: "เก่า" }, { description: "ใหม่" }))
      .toEqual([{ kind: "field", field_key: "description", old_value: "เก่า", new_value: "ใหม่" }]);
  });
  it("ค่าเท่าเดิม/ว่างกับ null ถือว่าไม่เปลี่ยน", () => {
    expect(diffVersionedFields("parent_skus_v2", { description: "เดิม", introduction: null }, { description: "เดิม", introduction: "  " })).toEqual([]);
  });
  it("จากว่าง → มีค่า ก็จด (ย้อนกลับเป็นว่างได้)", () => {
    expect(diffVersionedFields("skus_v2", { description: null }, { description: "ใหม่" }))
      .toEqual([{ kind: "field", field_key: "description", old_value: null, new_value: "ใหม่" }]);
  });
  it("เปลี่ยนรูปปก → จดรูปเก่าเป็น image", () => {
    expect(diffVersionedFields("skus_v2", { cover_image_r2_key: "old.jpg" }, { cover_image_r2_key: "new.jpg" }))
      .toEqual([{ kind: "image", field_key: "cover", old_key: "old.jpg", new_key: "new.jpg" }]);
  });
  it("ลบรูปปกก็จดรูปเก่า · ปกเดิมว่างไม่มีอะไรให้เก็บ", () => {
    expect(diffVersionedFields("skus_v2", { cover_image_r2_key: "old.jpg" }, { cover_image_r2_key: null }))
      .toEqual([{ kind: "image", field_key: "cover", old_key: "old.jpg", new_key: null }]);
    expect(diffVersionedFields("skus_v2", { cover_image_r2_key: null }, { cover_image_r2_key: "new.jpg" })).toEqual([]);
  });
});
