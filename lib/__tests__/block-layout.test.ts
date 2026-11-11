import { describe, expect, it } from "vitest";
import { blockMineKey, blockTeamKey, packRows, parseBlockLayout, resolveBlocks, withBlockChange, type BlockDef } from "@/lib/block-layout";

const DEFS: BlockDef[] = [
  { key: "gallery", label: "รูป", icon: "image" },
  { key: "status", label: "สถานะ", icon: "flag" },
  { key: "cost", label: "ต้นทุน", icon: "calc", sizes: ["half", "full"] },
  { key: "quote", label: "เสนอราคา", icon: "receipt", sizes: ["half", "full"] },
  { key: "note", label: "โน้ต", icon: "note", hidden: true },
];
const keys = (bs: { key: string }[]) => bs.map((b) => b.key);

describe("parseBlockLayout", () => {
  it("ค่าเพี้ยน/ว่าง = null", () => {
    expect(parseBlockLayout(null)).toBeNull();
    expect(parseBlockLayout([])).toBeNull();
    expect(parseBlockLayout({})).toBeNull();
    expect(parseBlockLayout({ order: [], vis: {}, size: {} })).toBeNull();
  });
  it("ทิ้ง key แปลก/ค่าเพี้ยน · ลำดับไม่ซ้ำ", () => {
    expect(parseBlockLayout({ order: ["cost", "cost", "BAD KEY", 3, "gallery"], vis: { note: true, x: "yes" }, size: { cost: "full", quote: "big" } }))
      .toEqual({ order: ["cost", "gallery"], vis: { note: true }, size: { cost: "full" } });
  });
});

describe("resolveBlocks — ของฉัน > ทีม > ค่าเริ่มต้น", () => {
  it("ค่าเริ่มต้นของหน้า (ซ่อน/ขนาดแรก)", () => {
    const r = resolveBlocks(DEFS);
    expect(keys(r)).toEqual(["gallery", "status", "cost", "quote", "note"]);
    expect(r.find((b) => b.key === "note")!.on).toBe(false);
    expect(r.find((b) => b.key === "cost")!.sizeNow).toBe("half");
    expect(r.find((b) => b.key === "gallery")!.sizeNow).toBe("full");
  });
  it("ทีมจัด · ของฉันทับเฉพาะเรื่องที่ตั้ง · กล่องใหม่ต่อท้าย · key ที่ไม่มีแล้วทิ้ง", () => {
    const team = { order: ["status", "gone", "gallery"], vis: { note: true }, size: { cost: "full" as const } };
    const mine = { vis: { gallery: false } };
    const r = resolveBlocks(DEFS, team, mine);
    expect(keys(r)).toEqual(["status", "gallery", "cost", "quote", "note"]);
    expect(r.find((b) => b.key === "gallery")!.on).toBe(false);
    expect(r.find((b) => b.key === "note")!.on).toBe(true);
    expect(r.find((b) => b.key === "cost")!.sizeNow).toBe("full");
    expect(keys(resolveBlocks(DEFS, team, { order: ["quote"] }))[0]).toBe("quote");
  });
  it("ขนาดที่กล่องนั้นเลือกไม่ได้ = ใช้ขนาดแรกของกล่อง", () => {
    expect(resolveBlocks(DEFS, null, { size: { gallery: "half" } }).find((b) => b.key === "gallery")!.sizeNow).toBe("full");
  });
});

describe("packRows — ครึ่ง 2 ใบติดกัน = แถวเดียว", () => {
  it("คู่ครึ่ง · ครึ่งไม่มีคู่ = เต็มแถว", () => {
    const b = (key: string, sizeNow: "full" | "half") => ({ key, sizeNow });
    const rows = packRows([b("a", "full"), b("c", "half"), b("q", "half"), b("x", "half"), b("n", "full")]);
    expect(rows.map((r) => r.map((x) => x.key).join("+"))).toEqual(["a", "c+q", "x", "n"]);
  });
});

describe("withBlockChange — เก็บเฉพาะที่ต่างจากพื้นฐาน", () => {
  const base = resolveBlocks(DEFS);
  it("ปิดกล่องที่เปิดอยู่ = เก็บ · เปิดกลับ = ลบออก (กลับเป็นค่าพื้นฐาน)", () => {
    const p1 = withBlockChange(base, null, { vis: ["gallery", false] });
    expect(p1).toEqual({ vis: { gallery: false } });
    expect(withBlockChange(base, p1, { vis: ["gallery", true] })).toBeNull();
  });
  it("ลำดับเท่าเดิม = ไม่เก็บ · ต่าง = เก็บ", () => {
    expect(withBlockChange(base, null, { order: keys(base) })).toBeNull();
    expect(withBlockChange(base, null, { order: ["status", "gallery", "cost", "quote", "note"] })?.order?.[0]).toBe("status");
  });
  it("ของฉันตั้งเท่าทีม = ไม่เก็บ (ทีมเปลี่ยนทีหลังได้ตามทีม)", () => {
    const teamBase = resolveBlocks(DEFS, { size: { cost: "full" } });
    expect(withBlockChange(teamBase, null, { size: ["cost", "full"] })).toBeNull();
    expect(withBlockChange(teamBase, null, { size: ["cost", "half"] })).toEqual({ size: { cost: "half" } });
  });
  it("ชื่อ key ที่เก็บ", () => {
    expect(blockTeamKey("design_sheet_mobile")).toBe("admin_block_layout:design_sheet_mobile");
    expect(blockMineKey("design_sheet_mobile")).toBe("block_layout:design_sheet_mobile");
  });
});
