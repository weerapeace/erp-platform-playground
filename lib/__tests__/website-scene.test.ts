import { describe, it, expect } from "vitest";
import { sceneTabCandidates, sceneTabProducts, sceneTabCount, sceneTabSource, scenePngOf } from "../website-scene";
import { normalizeBlocks } from "../website-blocks";

const P = (code: string, listedAt: string, salesRank: number | null, png = false) => ({
  code,
  listedAt,
  salesRank,
  imageFields: png ? { png_image_r2_key: `https://erp/api/r2-image?key=${code}.png` } : undefined,
});
const ALL = [
  P("A", "2026-10-01", 3, true),
  P("B", "2026-10-05", null, false),
  P("C", "2026-10-03", 1, true),
  P("D", "2026-09-01", 2, false),
  P("E", "2026-10-04", null, true),
];

describe("🎞️ การ์ดบนฉาก — สินค้าของแต่ละแท็บ (lib/website-scene · มิเรอร์เว็บร้าน)", () => {
  it("มาใหม่ = ขึ้นร้านล่าสุดก่อน · ขายดี = อันดับขายก่อน (ไม่มีอันดับต่อท้ายตามลำดับเดิม) · ตัดตามจำนวน", () => {
    const codes = (l: { code: string }[]) => l.map((p) => p.code);
    expect(codes(sceneTabCandidates(ALL, { tab1Source: "new", tab1Count: 3 }, 1))).toEqual(["B", "E", "C"]);
    expect(codes(sceneTabCandidates(ALL, { tab2Source: "best", tab2Count: 4 }, 2))).toEqual(["C", "D", "A", "B"]);
  });

  it("เลือกเอง = ตามที่เลือก (ตัวพิมพ์เล็กได้ · รหัสที่ไม่มีบนเว็บถูกข้าม)", () => {
    expect(sceneTabCandidates(ALL, { tab3Source: "pick", tab3Products: ["e", "zzz", "A"] }, 3).map((p) => p.code)).toEqual(["E", "A"]);
  });

  it("ไม่มีรูป PNG = ไม่โชว์ (ตัดจำนวนก่อนกรอง → ERP แผง PNG กับเว็บตรงกัน) · โหมดรูปเดิม = ทุกตัว", () => {
    const b = { tab1Source: "new", tab1Count: 3 };
    expect(sceneTabProducts(ALL, b, 1).map((p) => p.code)).toEqual(["E", "C"]);
    expect(sceneTabProducts(ALL, b, 1, false).map((p) => p.code)).toEqual(["B", "E", "C"]);
    expect(scenePngOf(ALL[1])).toBeNull();
  });

  it("ค่าเริ่ม: 2 แท็บ · แท็บ 1 มาใหม่ / 2 ขายดี / 3 เลือกเอง · จำนวนมั่ว = 12", () => {
    expect(sceneTabCount({})).toBe(2);
    expect(sceneTabCount({ tabs: "9" })).toBe(3);
    expect([sceneTabSource({}, 1), sceneTabSource({}, 2), sceneTabSource({ tab3Source: "x" }, 3)]).toEqual(["new", "best", "pick"]);
    const many = Array.from({ length: 30 }, (_, i) => P(`X${i}`, "2026-01-01", null, true));
    expect(sceneTabCandidates(many, { tab1Count: "abc" }, 1)).toHaveLength(12);
  });

  it("Section เดิมที่บันทึก imgMode=auto (รุ่นแรก) → เป็นโหมด PNG", () => {
    const [b] = normalizeBlocks([{ id: "s", type: "scene", imgMode: "auto" }]) as unknown as Record<string, unknown>[];
    expect(b.imgMode).toBe("png");
  });
});
