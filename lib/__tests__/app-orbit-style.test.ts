import { describe, it, expect } from "vitest";
import { ORBIT_DEFAULT, ORBIT_PRESETS, cleanOrbitStyle, matchOrbitPreset, orbitOverrideCount, resolveOrbitStyle } from "@/lib/app-orbit-style";
import { orbitCardBox, orbitPose, orbitSnapTarget, topIndex } from "@/lib/app-orbit";

describe("ค่าวงแอป: ค่าเริ่มต้น ← ทีม ← ของฉัน", () => {
  it("ไม่มีอะไรตั้ง = ค่าเริ่มต้น (หน้าตาเดิม)", () => {
    expect(resolveOrbitStyle(null, undefined)).toEqual(ORBIT_DEFAULT);
  });
  it("ของฉันชนะทีมทีละช่อง — ช่องที่ไม่ได้ปรับยังตามทีม", () => {
    const s = resolveOrbitStyle({ mode: "ring", speed: 7, spin: true }, { speed: 2 });
    expect(s.mode).toBe("ring");
    expect(s.spin).toBe(true);
    expect(s.speed).toBe(2);
  });
  it("ค่าผิดชนิด/ไม่รู้จัก ทิ้ง · ตัวเลขเกินช่วงตัดให้อยู่ในช่วง", () => {
    expect(cleanOrbitStyle({ mode: "triangle", speed: 99, size: 1, dir: 2, spin: "yes", hack: 1 })).toEqual({ speed: 10, size: 40 });
    expect(cleanOrbitStyle([1, 2])).toEqual({});
    expect(cleanOrbitStyle("x")).toEqual({});
  });
  it("เครื่องที่ลดภาพเคลื่อนไหว = ปิดหมุน/หลบ/เอียง/ลูกเล่นตอนเปิด", () => {
    const s = resolveOrbitStyle({ spin: true, push: true, parallax: true, intro: "burst" }, null, true);
    expect([s.spin, s.push, s.parallax, s.intro]).toEqual([false, false, false, "none"]);
  });
  it("นับช่องที่ปรับเองต่างจากทีม · จับชุดสำเร็จรูปได้", () => {
    expect(orbitOverrideCount({ speed: 5 }, { speed: 5, size: 70 })).toBe(1);
    expect(matchOrbitPreset(ORBIT_DEFAULT)).toBe("calm");
    expect(matchOrbitPreset(resolveOrbitStyle(null, ORBIT_PRESETS[2].style))).toBe("fun");
    expect(matchOrbitPreset({ ...ORBIT_DEFAULT, speed: 9 })).toBeNull();
  });
});

describe("ท่าทางการ์ด", () => {
  const W = 900, H = 660, n = 6;
  it("วงรี: ใบที่เลือก (snap แล้ว) อยู่กลางบนสุด", () => {
    const rot = orbitSnapTarget("ellipse", 0, 2, n, 60)!;
    const p = orbitPose(2, n, rot, 2, W, H, ORBIT_DEFAULT);
    expect(Math.round(p.x)).toBe(W / 2);
    expect(p.y).toBeLessThan(H / 2);
    expect(topIndex(rot, n)).toBe(2);
  });
  it("วงแหวน 3 มิติ: ใบที่เลือกอยู่หน้าสุด (ล่าง ใหญ่สุด ไม่จาง)", () => {
    const st = { ...ORBIT_DEFAULT, mode: "ring" as const };
    const rot = orbitSnapTarget("ring", 0, 3, n, 60)!;
    const front = orbitPose(3, n, rot, 3, W, H, st), back = orbitPose(0, n, rot, 3, W, H, st);
    expect(front.y).toBeGreaterThan(back.y);
    expect(front.s).toBeGreaterThan(back.s);
    expect(front.z).toBeGreaterThan(back.z);
  });
  it("แถวเอียง: snap แล้วใบที่เลือกอยู่กลางจอ · แกลเลอรีไม่ต้องหมุน", () => {
    const st = { ...ORBIT_DEFAULT, mode: "row" as const };
    const rot = orbitSnapTarget("row", 0, 4, n, 60)!;
    expect(Math.round(orbitPose(4, n, rot, 4, W, H, st).x)).toBe(W / 2);
    expect(orbitSnapTarget("gallery", 0, 4, n, 60)).toBeNull();
  });
  it("ลูกเล่นกระจายจากกลาง: เริ่มที่จุดกลางและมองไม่เห็น", () => {
    const p = orbitPose(1, n, 0, 0, W, H, { ...ORBIT_DEFAULT, intro: "burst" }, 0);
    expect([Math.round(p.x), Math.round(p.y), p.o]).toEqual([W / 2, H / 2, 0]);
  });
  it("การ์ดแนวตั้งสูงกว่ากว้าง · ซ่อนชื่อแล้วกล่องเตี้ยลง", () => {
    const b = orbitCardBox({ size: 60, shape: "portrait", labels: false });
    expect(b.tileH).toBeGreaterThan(b.tileW);
    expect(b.h).toBe(b.tileH);
  });
});
