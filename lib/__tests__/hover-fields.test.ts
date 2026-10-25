import { describe, it, expect } from "vitest";
import { withNewDefaults } from "@/lib/hover-fields";

describe("withNewDefaults (หัวข้อ Hover ที่เพิ่มทีหลัง)", () => {
  it("adds default fields the user never saw", () => {
    expect(withNewDefaults(["image", "name"], ["image", "name", "note"], ["image", "name", "waiting"])).toEqual(["image", "name", "waiting"]);
  });
  it("keeps a field the user removed after seeing it", () => {
    expect(withNewDefaults(["image"], ["image", "waiting"], ["image", "waiting"])).toEqual(["image"]);
  });
  it("never adds non-default fields or duplicates", () => {
    expect(withNewDefaults(["waiting"], [], ["waiting"])).toEqual(["waiting"]);
    expect(withNewDefaults(["image"], [], ["image"])).toEqual(["image"]);
  });
});
