import { describe, expect, it } from "vitest";
import { heroOfSku, normalizeHero } from "../website-hero";

const img = (key: string) => ({ kind: "image", key, posterKey: null });

describe("🎬 Hero + Hero รายสี (normalizeHero)", () => {
  it("ไม่มีอะไรเลย = null · รุ่นอย่างเดียว = เหมือนเดิม (ไม่มี sku)", () => {
    expect(normalizeHero(null)).toBeNull();
    expect(normalizeHero({ desktop: null, mobile: null, sku: {} })).toBeNull();
    expect(normalizeHero({ desktop: img("a/b.jpg") })).toEqual({ desktop: img("a/b.jpg"), mobile: null });
  });

  it("มีแค่ Hero รายสี = ยังเก็บ (desktop/mobile ของรุ่นเป็น null) · สีว่าง/รหัสแปลก ถูกทิ้ง", () => {
    const h = normalizeHero({
      sku: {
        "6d2283cb-1111-2222-3333-444455556666": { desktop: img("hero/x.jpg") },
        "851dca7d-1111-2222-3333-444455556666": { desktop: null, mobile: null },
        "../evil": { desktop: img("hero/y.jpg") },
      },
    });
    expect(h).toEqual({ desktop: null, mobile: null, sku: { "6d2283cb-1111-2222-3333-444455556666": { desktop: img("hero/x.jpg"), mobile: null } } });
    expect(heroOfSku(h, "6d2283cb-1111-2222-3333-444455556666")?.desktop?.key).toBe("hero/x.jpg");
    expect(heroOfSku(h, "851dca7d-1111-2222-3333-444455556666")).toBeNull();
  });
});
