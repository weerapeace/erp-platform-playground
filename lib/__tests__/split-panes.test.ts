import { describe, expect, it } from "vitest";
import { parseSplitState, splitFlexOf, splitSizeOf } from "@/lib/split-panes";

describe("splitSizeOf", () => {
  it("เริ่มครึ่ง-ครึ่ง", () => {
    const st = { focus: null, mode: "push" as const };
    expect([splitSizeOf("left", st, true), splitSizeOf("right", st, true)]).toEqual(["half", "half"]);
  });
  it("แบบดัน: ฝั่งที่กดขยาย อีกฝั่งแคบ", () => {
    const st = { focus: "right" as const, mode: "push" as const };
    expect([splitSizeOf("left", st, true), splitSizeOf("right", st, true)]).toEqual(["narrow", "wide"]);
    expect([splitFlexOf("narrow"), splitFlexOf("wide")]).toEqual(["1 1 0px", "2 1 0px"]);
  });
  it("แบบพับ: อีกฝั่งเหลือแถบ", () => {
    const st = { focus: "left" as const, mode: "fold" as const };
    expect(splitSizeOf("right", st, true)).toBe("rail");
    expect(splitFlexOf("rail")).toBe("0 0 44px");
  });
  it("ที่แคบ = เรียงบน-ล่าง ไม่สนสถานะ", () => {
    expect(splitSizeOf("left", { focus: "left", mode: "fold" }, false)).toBe("stack");
    expect(splitFlexOf("stack")).toBeUndefined();
  });
});

describe("parseSplitState", () => {
  it("ค่าผิดรูป → ค่าปลอดภัย", () => {
    expect(parseSplitState({ focus: "middle", mode: "x" })).toEqual({ focus: null, mode: "push" });
    expect(parseSplitState("bad")).toBeNull();
    expect(parseSplitState({ focus: "right", mode: "fold" })).toEqual({ focus: "right", mode: "fold" });
  });
});
