import { describe, it, expect } from "vitest";
import { normalizeFrameShape, normalizeFrameDef, frameDefCanvasPatch, frameDefCanBorder, frameShapeSvg, builtinFrameShape, FRAME_SHAPE_LIMITS } from "../website-frames";
import { normalizeBlocks } from "../website-blocks";

/** 🖼 คลังกรอบที่สร้างเอง (ตัวสร้างกรอบ 3 แบบ) */
describe("ทรงที่อัปเอง (FrameShape)", () => {
  it("เก็บเส้นทาง + ตำแหน่ง matrix + evenodd · กรอบของทรงต้องมีขนาด", () => {
    const s = normalizeFrameShape({ vb: [10, 20, 80, 60], parts: [{ d: "M10 20H90V80H10Z", t: "matrix(1 0 0 1 5 -3)", rule: "evenodd" }] });
    expect(s).toEqual({ vb: [10, 20, 80, 60], parts: [{ d: "M10 20H90V80H10Z", t: "matrix(1 0 0 1 5 -3)", rule: "evenodd" }] });
    expect(normalizeFrameShape({ vb: [0, 0, 0, 10], parts: [{ d: "M0 0H1Z" }] })).toBeNull();
    expect(normalizeFrameShape({ vb: [0, 0, 10], parts: [{ d: "M0 0H1Z" }] })).toBeNull();
    expect(normalizeFrameShape(null)).toBeNull();
  });

  it("ทิ้งของแปลกปลอม — สคริปต์/ลิงก์/ตัวอักษรใน d · transform ที่ไม่ใช่ matrix ล้วน", () => {
    expect(normalizeFrameShape({ vb: [0, 0, 100, 100], parts: [{ d: "M0 0'/><script>alert(1)</script>" }] })).toBeNull();
    const s = normalizeFrameShape({ vb: [0, 0, 100, 100], parts: [{ d: "M0 0H100V100Z", t: "url(javascript:alert(1))" }, { d: "M0 0 L10 10 onload=x" }] });
    expect(s?.parts).toEqual([{ d: "M0 0H100V100Z" }]);
  });

  it("ใหญ่เกิน = ไม่รับ (กันไฟล์ซับซ้อนจนเว็บช้า)", () => {
    const big = "M0 0" + " L1 1".repeat(FRAME_SHAPE_LIMITS.chars / 4);
    expect(normalizeFrameShape({ vb: [0, 0, 100, 100], parts: [{ d: big }] })).toBeNull();
  });

  it("SVG สำหรับตัดรูป = มีแค่เส้นทาง + ยืดเต็มกล่อง", () => {
    const svg = frameShapeSvg(builtinFrameShape("M0 0H100V100H0Z"));
    expect(svg).toContain("viewBox='0 0 100 100'");
    expect(svg).toContain("preserveAspectRatio='none'");
    expect(svg).toContain("<path d='M0 0H100V100H0Z'/>");
  });
});

describe("ชุดค่ากรอบ (FrameDef)", () => {
  it("ค่าแปลก = ค่าปลอดภัย · ทรง custom ไม่มีทรงจริง = สี่เหลี่ยม", () => {
    const d = normalizeFrameDef({ frame: "custom", border: "boom", borderWidth: 999, overlayInset: -5 });
    expect(d).toMatchObject({ frame: "rect", shape: null, maskKey: null, border: "none", borderWidth: 16, overlayInset: 0 });
    expect(normalizeFrameDef({ frame: "heart" }).frame).toBe("heart");
    expect(normalizeFrameDef({ frame: "triangle" }).frame).toBe("rect");
  });

  it("PNG พื้นใส = ตัดรูปอย่างเดียว (ไม่มีเส้นขอบ) · SVG = มีเส้นขอบได้", () => {
    const png = normalizeFrameDef({ mode: "mask", frame: "custom", maskKey: "assets/frame.png", border: "line" });
    expect(frameDefCanBorder(png)).toBe(false);
    expect(frameDefCanvasPatch(png)).toMatchObject({ frame: "custom", maskKey: "assets/frame.png", frameShape: null, border: "none" });
    const svg = normalizeFrameDef({ mode: "mask", frame: "custom", shape: { vb: [0, 0, 100, 100], parts: [{ d: "M0 0H100V100Z" }] }, maskKey: "x.png", border: "dotted" });
    expect(frameDefCanBorder(svg)).toBe(true);
    expect(frameDefCanvasPatch(svg)).toMatchObject({ frame: "custom", maskKey: null, border: "dotted" });
  });

  it("ใช้กับรูป = เขียนทับทุกช่องของกรอบ (รวมกรอบวางทับ)", () => {
    const p = frameDefCanvasPatch(normalizeFrameDef({ mode: "overlay", frame: "rounded", overlayKey: "frames/gold.png", overlayInset: 15 }));
    expect(Object.keys(p).sort()).toEqual(["border", "borderColor", "borderGap", "borderHex", "borderWidth", "frame", "frameShape", "maskKey", "overlayInset", "overlayKey"].sort());
    expect(p).toMatchObject({ frame: "rounded", overlayKey: "frames/gold.png", overlayInset: 15 });
  });
});

describe("ผืนผ้าใบเก็บทรงที่อัปเอง", () => {
  it("ชิ้นรูปเก็บ frameShape ที่ผ่านตัวกรอง · ช่อง shape (ลายของตกแต่ง) ไม่ปน", () => {
    const [b] = normalizeBlocks([
      {
        id: "c",
        type: "canvas",
        items: [{ id: "i1", kind: "image", frame: "custom", frameShape: { vb: [0, 0, 50, 50], parts: [{ d: "M0 0H50V50Z" }, { d: "<script>" }] }, maskKey: "frames/m.png" }],
      },
    ]);
    const it0 = (b as unknown as { items: Record<string, unknown>[] }).items[0];
    expect(it0.frame).toBe("custom");
    expect(it0.frameShape).toEqual({ vb: [0, 0, 50, 50], parts: [{ d: "M0 0H50V50Z" }] });
    expect(it0.maskKey).toBe("frames/m.png");
  });
});
