import { describe, expect, it } from "vitest";
import { RECIPES, applyRecipe, cleanSetup, computeStudio, defaultSetup, gearList, kelvinRgb, shadeAt, type StudioLight, type StudioSetup } from "../studio-light";

const one = (patch: Partial<StudioLight>, extra: Partial<StudioSetup> = {}): StudioSetup => ({
  ...defaultSetup(), ambient: 0, ...extra,
  items: [{ id: "k", kind: "light", type: "cob", mod: "bare", a: 45, d: 1, h: 0, power: 100, k: 5600, ...patch }],
});

describe("studio-light", () => {
  it("แสงลดตามระยะยกกำลังสอง: ถอยไฟ 2 เท่า แสงเหลือ 1/4", () => {
    const e1 = computeStudio(one({ d: 1 })).lights[0].e;
    const e2 = computeStudio(one({ d: 2 })).lights[0].e;
    expect(e2 / e1).toBeCloseTo(0.25, 5);
  });

  it("ตัวปรับแสงใหญ่/ใกล้ = นุ่มกว่า", () => {
    const bare = computeStudio(one({ mod: "bare" })).lights[0].soft;
    const octaNear = computeStudio(one({ mod: "octa", d: 1 })).lights[0].soft;
    const octaFar = computeStudio(one({ mod: "octa", d: 2.5 })).lights[0].soft;
    expect(octaNear).toBeGreaterThan(octaFar);
    expect(octaFar).toBeGreaterThan(bare);
  });

  it("ไฟจากขวา: ผิวด้านขวาสว่างกว่าด้านซ้าย", () => {
    const r = computeStudio(one({ a: 60 }));
    const R = shadeAt(r, [0.7, 0, 0.7]), L = shadeAt(r, [-0.7, 0, 0.7]);
    expect(R[1]).toBeGreaterThan(L[1]);
    expect(r.ratio!).toBeGreaterThan(2);
  });

  it("รีเฟล็กขาวเปิดเงา → อัตราส่วนไฟลดลง · V-flat ดำ → เพิ่มขึ้น", () => {
    const base = computeStudio(one({ a: 60 }, { ambient: 0.4 })).ratio!;
    const refl = computeStudio({ ...one({ a: 60 }, { ambient: 0.4 }), items: [...one({ a: 60 }).items, { id: "r", kind: "refl-white", a: -60, d: 0.8 }] }).ratio!;
    const neg = computeStudio({ ...one({ a: 60 }, { ambient: 0.4 }), items: [...one({ a: 60 }).items, { id: "v", kind: "vflat", a: -60, d: 0.8 }] }).ratio!;
    expect(refl).toBeLessThan(base);
    expect(neg).toBeGreaterThan(base);
  });

  it("Flag ที่ขวางทางไฟ บังแสงถึงตัวแบบ", () => {
    const s = one({ a: 0, d: 2 });
    const blocked = computeStudio({ ...s, items: [...s.items, { id: "f", kind: "flag", a: 0, d: 1 }] });
    expect(blocked.lights[0].blocked).toBe(true);
    const aside = computeStudio({ ...s, items: [...s.items, { id: "f", kind: "flag", a: 90, d: 1 }] });
    expect(aside.lights[0].blocked).toBe(false);
  });

  it("ตัวแบบห่างฉากมากขึ้น ฉากหลังมืดลง", () => {
    const near = computeStudio(one({ a: 20, d: 1.5, mod: "softbox" }, { bgDist: 0.5 })).bgE;
    const far = computeStudio(one({ a: 20, d: 1.5, mod: "softbox" }, { bgDist: 2.5 })).bgE;
    expect(far).toBeLessThan(near);
  });

  it("สีแสง: 3200K ส้มกว่า 5600K", () => {
    expect(kelvinRgb(3200)[2]).toBeLessThan(kelvinRgb(5600)[2]);
  });

  it("cleanSetup ซ่อมค่าผิดและจำกัดจำนวนชิ้น", () => {
    const s = cleanSetup({ subject: "x", lens: 9999, items: Array.from({ length: 30 }, () => ({ kind: "light", a: 999, d: -1 })) });
    expect(s.subject).toBe("bag");
    expect(s.lens).toBe(200);
    expect(s.items.length).toBe(10);
    expect(s.items[0].a).toBe(180);
  });

  it("ทุกสูตรไฟใช้ได้ (ผ่านการตรวจค่า + มีไฟ + มีรายการอุปกรณ์)", () => {
    for (const f of RECIPES) {
      const rc = f();
      const s = applyRecipe(rc, defaultSetup());
      expect(s.items.some((i) => i.kind === "light"), rc.key).toBe(true);
      expect(computeStudio(s).fstop, rc.key).not.toBeNull();
      expect(gearList(s).length, rc.key).toBeGreaterThan(1);
    }
  });
});
