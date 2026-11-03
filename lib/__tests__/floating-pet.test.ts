import { describe, it, expect } from "vitest";
import { parsePetSource, parsePetSize, petFileUrl, petMood, petBadge } from "@/lib/floating-pet";

describe("floating-pet", () => {
  it("parsePetSource: ตัวในระบบ / GIF / Lottie · ค่าเพี้ยน = null", () => {
    expect(parsePetSource({ kind: "builtin", id: "slime" })).toEqual({ kind: "builtin", id: "slime" });
    expect(parsePetSource({ kind: "builtin", id: "dragon" })).toBeNull();
    expect(parsePetSource({ kind: "gif", src: "https://media.giphy.com/a.gif", name: " แมวเต้น " })).toEqual({ kind: "gif", src: "https://media.giphy.com/a.gif", name: "แมวเต้น" });
    expect(parsePetSource({ kind: "lottie", src: "pets/abc.json" })).toEqual({ kind: "lottie", src: "pets/abc.json" });
    expect(parsePetSource({ kind: "gif", src: "http://x.com/a.gif" })).toBeNull();      // ต้อง https
    expect(parsePetSource({ kind: "gif", src: "javascript:alert(1)" })).toBeNull();
    expect(parsePetSource({ kind: "gif", src: "../secret" })).toBeNull();
    expect(parsePetSource({ kind: "gif", src: "  " })).toBeNull();
    expect(parsePetSource(null)).toBeNull();
  });

  it("parsePetSize + petFileUrl", () => {
    expect(parsePetSize("l")).toBe("l");
    expect(parsePetSize("xl")).toBe("m");
    expect(petFileUrl("https://a.com/x.gif")).toBe("https://a.com/x.gif");
    expect(petFileUrl("pets/a b.gif")).toBe("/api/r2-image?key=pets%2Fa%20b.gif");
  });

  it("petMood + petBadge", () => {
    expect(petMood({ total: 0, alert: true })).toBe("sleep");
    expect(petMood({ total: 3, alert: false })).toBe("idle");
    expect(petMood({ total: 3, alert: true })).toBe("alert");
    expect(petBadge(0)).toBeNull();
    expect(petBadge(14)).toBe("14");
    expect(petBadge(120)).toBe("99+");
  });
});
