import { describe, it, expect } from "vitest";
import { DECOR_MAX, bgImageLayer, cleanDecor, cleanLauncherTheme, newDecor, pageBgStyle, resolveLauncherTheme } from "@/lib/launcher-theme";

const img = { bgImage: "launcher-bg/a.jpg" };

describe("แต่งหน้าแรก — ค่าทีม + ของฉัน", () => {
  it("ไม่ตั้งอะไร = หน้าตาเดิม (ไม่มีพื้นหลัง/ของตกแต่ง)", () => {
    const r = resolveLauncherTheme(null, null);
    expect(r.bgImage).toBeNull();
    expect(r.decor).toEqual([]);
    expect(pageBgStyle(r)).toEqual({});
  });

  it("ค่าเก่าของฉัน (มีแค่รูป) ยังใช้ได้ · รูปจางแบบเดิม 8% ตรงกลาง เต็มจอ", () => {
    const r = resolveLauncherTheme(null, { bg: null, bgGradient: null, bgImage: "launcher-bg/old.jpg", accent: "#957d00", font: null });
    const layer = bgImageLayer(r, "/x.jpg");
    expect(layer).toMatchObject({ opacity: 0.08, backgroundPosition: "center", backgroundSize: "cover", backgroundRepeat: "no-repeat" });
    expect(r.accent).toBe("#957d00");
  });

  it("พื้นหลังไปเป็นชุด — ของฉันตั้งสีเดียว ทับรูปของทีมทั้งชุด", () => {
    const r = resolveLauncherTheme({ ...img, bgOpacity: 60, bgPos: "right top" }, { bg: "#f8fafc" });
    expect(r.bgImage).toBeNull();
    expect(r.bgOpacity).toBeNull();
    expect(pageBgStyle(r)).toEqual({ background: "#f8fafc" });
  });

  it("ของฉันไม่ตั้งพื้นหลัง = ตามทีม · สีหลัก/ฟอนต์ทีละช่อง", () => {
    const r = resolveLauncherTheme({ ...img, bgOpacity: 60, accent: "#111111", font: "sarabun" }, { accent: "#222222" });
    expect(r.bgImage).toBe("launcher-bg/a.jpg");
    expect(r.bgOpacity).toBe(60);
    expect(r.accent).toBe("#222222");
    expect(r.font).toBe("sarabun");
  });

  it("ของตกแต่ง: ของฉันมีรายการ (แม้ว่าง) = ใช้ของฉัน · ไม่มี = ตามทีม", () => {
    const team = { decor: [{ id: "a", key: "launcher-decor/star.gif", x: 10, y: 10 }] };
    expect(resolveLauncherTheme(team, {}).decor).toHaveLength(1);
    expect(resolveLauncherTheme(team, { decor: [] }).decor).toEqual([]);
  });

  it("ตำแหน่ง/ขนาด/ซูม/ปูซ้ำ", () => {
    const t = cleanLauncherTheme({ ...img, bgOpacity: 40, bgPos: "left bottom", bgFit: "cover", bgZoom: 150 });
    expect(bgImageLayer(t, "/x.jpg")).toMatchObject({ opacity: 0.4, backgroundPosition: "left bottom", transform: "scale(1.5)", transformOrigin: "left bottom" });
    const tile = cleanLauncherTheme({ ...img, bgFit: "tile", bgZoom: 200 });
    expect(bgImageLayer(tile, "/x.jpg")).toMatchObject({ backgroundRepeat: "repeat", backgroundSize: "640px auto" });
    expect(bgImageLayer(tile, "/x.jpg")).not.toHaveProperty("transform");
  });
});

describe("ล้างค่าที่อ่านมา", () => {
  it("ค่าแปลก/อันตรายถูกทิ้ง · ตัวเลขถูกบีบให้อยู่ในช่วง", () => {
    const t = cleanLauncherTheme({ bg: "red;background:url(x)", bgImage: "../secret", bgOpacity: 999, bgPos: "middle", bgZoom: 20, font: "comic" });
    expect(t).toMatchObject({ bg: null, bgImage: null, bgOpacity: 100, bgPos: null, bgZoom: 100, font: null });
    expect(t).not.toHaveProperty("decor");
  });

  it("ของตกแต่ง: ไม่มีรูป = ทิ้ง · จำกัดจำนวน · ค่าเริ่มต้นซ่อนบนมือถือ/อยู่หลังการ์ด", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, key: `launcher-decor/${i}.gif`, x: 120, w: 99, anim: "explode" }));
    const d = cleanDecor([{ id: "nokey" }, ...many]);
    expect(d).toHaveLength(DECOR_MAX);
    expect(d[0]).toMatchObject({ x: 100, w: 40, anim: "none", front: false, mobile: false, opacity: 100 });
  });

  it("ชิ้นใหม่วางเยื้องกัน", () => {
    const a = newDecor("k1", []);
    const b = newDecor("k2", [a]);
    expect(a.id).not.toBe(b.id);
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
  });
});
