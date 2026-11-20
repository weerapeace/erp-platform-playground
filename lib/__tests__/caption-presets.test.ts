import { describe, expect, it } from "vitest";
import { normalizePresets, presetsFor, removePreset, setDefaultPreset, upsertPreset, ALL_SCOPE } from "@/lib/caption-presets";

const B = "11111111-1111-1111-1111-111111111111";

describe("caption presets (คำสั่งประจำ AI แคปชั่น)", () => {
  it("normalize ทิ้งของเสีย + ค่าเริ่มต้นได้ตัวเดียว", () => {
    const s = normalizePresets({ [B]: [{ id: "a", name: "A", text: "x", is_default: true }, { id: "b", name: "B", text: "y", is_default: true }, { id: "", name: "x", text: "y" }], bad: [{ id: "z", name: "z", text: "z" }] });
    expect(s[B].length).toBe(2);
    expect(s[B].filter((p) => p.is_default).map((p) => p.id)).toEqual(["a"]);
    expect(s.bad).toBeUndefined();
  });
  it("upsert = เพิ่ม/แก้ · ตั้งค่าเริ่มต้นแล้วตัวอื่นเลิก", () => {
    let s = upsertPreset({}, B, { id: "a", name: "โปร", text: "เน้นโปร" });
    s = upsertPreset(s, B, { id: "b", name: "สุภาพ", text: "ไม่มีอีโมจิ", isDefault: true });
    s = upsertPreset(s, B, { id: "a", name: "โปรลด", text: "เน้นโปร 50%", isDefault: true });
    expect(s[B].find((p) => p.id === "a")).toMatchObject({ name: "โปรลด", text: "เน้นโปร 50%", is_default: true });
    expect(s[B].find((p) => p.id === "b")?.is_default).toBe(false);
  });
  it("presetsFor = แบรนด์ก่อน แล้วทุกแบรนด์ · default ของแบรนด์ชนะ", () => {
    let s = upsertPreset({}, ALL_SCOPE, { id: "g", name: "กลาง", text: "t", isDefault: true });
    expect(presetsFor(s, B).defaultId).toBe("g");
    s = upsertPreset(s, B, { id: "m", name: "แบรนด์", text: "t", isDefault: true });
    const r = presetsFor(s, B);
    expect(r.items.map((p) => p.id)).toEqual(["m", "g"]);
    expect(r.defaultId).toBe("m");
  });
  it("remove + setDefault", () => {
    let s = upsertPreset({}, B, { id: "a", name: "A", text: "x", isDefault: true });
    s = setDefaultPreset(s, B, "a", false);
    expect(s[B][0].is_default).toBe(false);
    const r = removePreset(s, B, "a");
    expect(r.removed?.id).toBe("a");
    expect(r.store[B]).toBeUndefined();
  });
});
