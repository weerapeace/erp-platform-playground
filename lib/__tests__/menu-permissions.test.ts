import { describe, it, expect } from "vitest";
import { findMenuPermRule, leftoverPermissions, menuPermissions } from "@/lib/menu-permissions";
import { canDeleteAttachment, isProductImageEntity } from "@/lib/attachment-delete-perm";

const catalog = [
  { key: "products.view", category: "products", sort_order: 10 },
  { key: "products.edit", category: "products", sort_order: 30 },
  { key: "products.images.delete", category: "products", sort_order: 35 },
  { key: "attachments.upload", category: "attachments", sort_order: 20 },
  { key: "attachments.delete", category: "attachments", sort_order: 30 },
  { key: "tasks.view", category: "tasks", sort_order: 10 },
  { key: "tasks.edit", category: "tasks", sort_order: 30 },
  { key: "nesting.view", category: "tasks", sort_order: 50 },
  { key: "ai.caption", category: "tasks", sort_order: 60 },
  { key: "po.view", category: "po", sort_order: 10 },
  { key: "po.create", category: "po", sort_order: 20 },
  { key: "app.tasks", category: "เข้าถึง App (Apps)" },
];

describe("สิทธิ์ตามเมนู", () => {
  it("กฎตาม href — ขึ้นต้นยาวสุดชนะ · ไม่จับคู่ครึ่งคำ", () => {
    expect(findMenuPermRule("/tasks/nesting")?.href).toBe("/tasks/nesting");
    expect(findMenuPermRule("/tasks/some-page?x=1")?.href).toBe("/tasks");
    expect(findMenuPermRule("/tasksx")).toBeNull();
  });

  it("SKUs = สิทธิ์สินค้า + อัป/ลบไฟล์แนบ เรียงตามลำดับ", () => {
    expect(menuPermissions({ href: "/master/skus" }, catalog).keys)
      .toEqual(["products.view", "products.edit", "products.images.delete", "attachments.upload", "attachments.delete"]);
  });

  it("หน้าที่ใช้สิทธิ์ชุดเดียวกัน → บอก sameAs", () => {
    expect(menuPermissions({ href: "/tasks/campaigns" }, catalog)).toEqual({ keys: ["tasks.view", "tasks.edit", "ai.caption"], sameAs: "/tasks" });
  });

  it("ไม่มีกฎ → เดาจาก permission_key ของเมนู · ไม่มีอะไรเลย = ว่าง · ไม่เอา app.*", () => {
    expect(menuPermissions({ href: "/purchasing/po", permission_key: "po.view" }, catalog).keys).toEqual(["po.view", "po.create"]);
    expect(menuPermissions({ href: "/master/help-guides", permission_key: null }, catalog).keys).toEqual([]);
    expect(menuPermissions({ href: "/somewhere", permission_key: "app.tasks" }, catalog).keys).toEqual([]);
  });

  it("สิทธิ์ที่เมนูใช้กันเข้า อยู่ในลิสต์เสมอ", () => {
    expect(menuPermissions({ href: "/tasks/nesting", permission_key: "tasks.view" }, catalog).keys).toEqual(["tasks.view", "nesting.view"]);
  });

  it("สิทธิ์ของแอปที่ไม่อยู่ในเมนูไหน = กลุ่มอื่น ๆ", () => {
    expect(leftoverPermissions(["tasks.view", "tasks.edit"], catalog, ["tasks"])).toEqual(["nesting.view", "ai.caption"]);
  });
});

describe("ใครลบไฟล์แนบได้", () => {
  const can = (has: string[]) => (p: string) => has.includes(p);
  it("รูปสินค้า = ลบไฟล์ หรือ ลบรูปสินค้า", () => {
    expect(isProductImageEntity("skus_v2")).toBe(true);
    expect(canDeleteAttachment(can(["products.images.delete"]), "parent_skus_v2")).toBe(true);
    expect(canDeleteAttachment(can(["attachments.delete"]), "skus_v2")).toBe(true);
    expect(canDeleteAttachment(can([]), "skus_v2")).toBe(false);
  });
  it("ไฟล์แนบอื่น = ต้องลบไฟล์เท่านั้น", () => {
    expect(canDeleteAttachment(can(["products.images.delete"]), "design_sheet")).toBe(false);
    expect(canDeleteAttachment(can(["attachments.delete"]), "design_sheet")).toBe(true);
    expect(canDeleteAttachment(can(["products.images.delete"]), null)).toBe(false);
  });
});
