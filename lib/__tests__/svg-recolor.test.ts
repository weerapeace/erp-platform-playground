import { describe, it, expect } from "vitest";
import { normColor, listSvgColors, recolorSvg, colorMapParam, parseColorMapParam, sanitizeSvg, cleanColorMap, VECTOR_KEY_RE } from "../svg-recolor";

const SVG = `<svg><path fill="#E24B4A" stroke="#791f1f" d="M0 0"/><path fill="#e24b4a"/><rect style="fill:rgb(239,159,39);stroke: red" /><path fill="none"/><path fill="url(#g)"/><stop stop-color="#fff"/></svg>`;

describe("svg-recolor", () => {
  it("normColor", () => {
    expect(normColor("#ABC")).toBe("#aabbcc");
    expect(normColor("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(normColor("#11223344")).toBe("#112233");
    expect(normColor("none")).toBeNull();
    expect(normColor("url(#g)")).toBeNull();
    expect(normColor("White")).toBe("#ffffff");
  });
  it("listSvgColors เรียงตามที่ใช้บ่อย ไม่นับ none/url", () => {
    const l = listSvgColors(SVG);
    expect(l[0]).toEqual({ color: "#e24b4a", count: 2 });
    expect(l.map((x) => x.color).sort()).toEqual(["#791f1f", "#e24b4a", "#ef9f27", "#ff0000", "#ffffff"].sort());
  });
  it("recolorSvg แทนทั้ง attribute และ style · สีอื่นคงเดิม", () => {
    const out = recolorSvg(SVG, { "#e24b4a": "#1d9e75", red: "#000000", "#ef9f27": "#ef9f27" });
    expect(out).toContain('fill="#1d9e75" stroke="#791f1f"');
    expect(out).not.toMatch(/e24b4a/i);
    expect(out).toContain("stroke:#000000");
    expect(out).toContain("fill:rgb(239,159,39)");
    expect(out).toContain('fill="none"');
  });
  it("แผนที่สี ↔ ลิงก์", () => {
    const p = colorMapParam({ "#E24B4A": "#1d9e75", bad: "#000", "#fff": "#fff" });
    expect(p).toBe("e24b4a-1d9e75");
    expect(parseColorMapParam(p + ".zz-1")).toEqual({ "#e24b4a": "#1d9e75" });
    expect(cleanColorMap({ a: 1 })).toBeUndefined();
  });
  it("sanitizeSvg ตัดสคริปต์", () => {
    const s = sanitizeSvg(`<svg onload="x()"><script>alert(1)</script><a href="javascript:alert(1)"><path fill="red"/></a></svg>`);
    expect(s).not.toMatch(/script|onload|javascript/i);
    expect(s).toContain('<path fill="red"/>');
  });
  it("key ไฟล์เวกเตอร์", () => {
    expect(VECTOR_KEY_RE.test("library/1764-abc12-vec.svg")).toBe(true);
    expect(VECTOR_KEY_RE.test("library/../secret-vec.svg")).toBe(false);
    expect(VECTOR_KEY_RE.test("library/1764-abc.png")).toBe(false);
  });
});

import { cleanEl, elSrc } from "../gift-card-design";
describe("การ์ด: ชิ้นเวกเตอร์เปลี่ยนสี", () => {
  const raw = { id: "a", kind: "image", x: 0, y: 0, w: 10, h: 10, rot: 0, opacity: 1, src: "r2:library/1-ab.png", vec: "library/1-ab-vec.svg", recolor: { "#E34A4A": "#0b68ea", x: "y" } };
  it("cleanEl เก็บ vec + แผนที่สีที่ถูกต้อง · vec ผิดรูปแบบถูกตัด", () => {
    const e = cleanEl(raw, { w: 100, h: 100 })!;
    expect(e.vec).toBe("library/1-ab-vec.svg");
    expect(e.recolor).toEqual({ "#e34a4a": "#0b68ea" });
    expect(cleanEl({ ...raw, vec: "../secret" }, { w: 100, h: 100 })!.vec).toBeUndefined();
  });
  it("elSrc: เปลี่ยนสีแล้ว = ลิงก์ SVG สีใหม่ · ยังไม่เปลี่ยน = รูปเดิม", () => {
    const r2 = (k: string) => `/api/r2-image?key=${k}`;
    expect(elSrc({ src: raw.src, vec: raw.vec, recolor: { "#e34a4a": "#0b68ea" } }, r2)).toBe("/api/assets/vector?key=library%2F1-ab-vec.svg&c=e34a4a-0b68ea");
    expect(elSrc({ src: raw.src, vec: raw.vec }, r2)).toBe("/api/r2-image?key=library/1-ab.png");
  });
});
