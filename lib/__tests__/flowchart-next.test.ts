import { describe, expect, it } from "vitest";
import { OPPOSITE_SIDE, isFlowSide, nextNodePos } from "@/lib/flowchart";

describe("ขั้นตอนต่อไป — ตำแหน่งกล่องใหม่", () => {
  const src = { x: 0, y: 0, w: 160, h: 60 };
  const size = { w: 160, h: 60 };
  it("วางตามด้านที่กด (ห่าง 80 · บน/ล่าง 60) และกึ่งกลางตรงกัน", () => {
    expect(nextNodePos(src, "r", size, [])).toEqual({ x: 240, y: 0 });
    expect(nextNodePos(src, "l", size, [])).toEqual({ x: -240, y: 0 });
    expect(nextNodePos(src, "b", size, [])).toEqual({ x: 0, y: 120 });
    expect(nextNodePos(src, "t", size, [])).toEqual({ x: 0, y: -120 });
  });
  it("ทับกล่องเดิม = เลื่อนตั้งฉาก (ขวา → ลง · ล่าง → ขวา)", () => {
    const busy = [{ x: 240, y: 0, w: 160, h: 60 }];
    expect(nextNodePos(src, "r", size, busy).y).toBeGreaterThanOrEqual(80);
    const below = [{ x: 0, y: 120, w: 160, h: 60 }];
    expect(nextNodePos(src, "b", size, below).x).toBeGreaterThanOrEqual(180);
  });
  it("ด้านตรงข้าม + ตรวจค่า", () => {
    expect(OPPOSITE_SIDE.r).toBe("l");
    expect(isFlowSide("b")).toBe(true);
    expect(isFlowSide("x")).toBe(false);
  });
});
