import { describe, it, expect } from "vitest";
import { cleanLabelStyle, labelTextStyle } from "@/lib/task-type-label-style";

describe("task-type label style", () => {
  it("keeps only known values", () => {
    expect(cleanLabelStyle({ weight: 600, size: "lg", color: "#fff" })).toEqual({ weight: 600, size: "lg" });
    expect(cleanLabelStyle({ weight: "700" })).toEqual({ weight: 700 });
    expect(cleanLabelStyle({ weight: 650, size: "xl" })).toBeNull();
    expect(cleanLabelStyle(null)).toBeNull();
    expect(cleanLabelStyle("bold")).toBeNull();
  });
  it("maps to inline text style (null = chip default)", () => {
    expect(labelTextStyle(null)).toBeUndefined();
    expect(labelTextStyle({ size: "md" })).toEqual({ fontSize: 10 });
    expect(labelTextStyle({ weight: 700, size: "sm" })).toEqual({ fontWeight: 700, fontSize: 9 });
  });
});
