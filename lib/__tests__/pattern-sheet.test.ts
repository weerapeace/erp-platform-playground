import { describe, expect, it } from "vitest";
import { buildPatternDxf, buildPatternSvg, patternPieces, patternSheetWidth, shelfLayout, tilePages, pagesWithPieces, dxfLabel, A4_PRINTABLE } from "@/lib/pattern-sheet";

const lines = [
  { item_name: "PU", group_name: "ผ้า", width_cm: 43, length_cm: 17, pieces: 1 },
  { item_name: "อีเลน", group_name: "ตัวเสริม", width_cm: 57, length_cm: 6, pieces: 2 },
  { item_name: "หัวซิป", group_name: "อะไหล่", width_cm: null, length_cm: null, pieces: 1 },
  { item_name: "ผ้าซับใน", group_name: "ผ้า", width_cm: 39, length_cm: 29, pieces: 0 },
];

describe("patternPieces", () => {
  it("เอาเฉพาะบรรทัดที่มีกว้าง×ยาว · ตั้งรหัส P1.. · ชิ้น 0 = 1", () => {
    const p = patternPieces(lines);
    expect(p.map((x) => x.id)).toEqual(["P1", "P2", "P3"]);
    expect(p.map((x) => x.name)).toEqual(["PU", "อีเลน", "ผ้าซับใน"]);
    expect(p[1].count).toBe(2);
    expect(p[2].count).toBe(1);
  });
  it("บรรทัดสาย/เทป (คิดตามยาว) ที่มีค่ากว้างค้าง ไม่นับเป็นชิ้น · แบบพื้นที่นับ", () => {
    const p = patternPieces([
      { item_name: "กุ้น 7 หุน", calc_method: "length", width_cm: 167, length_cm: 100, pieces: 1 },
      { item_name: "ผ้า", calc_method: "area_face", width_cm: 40, length_cm: 30, pieces: 2 },
      { item_name: "ชิ้น", calc_method: "area_100", width_cm: 10, length_cm: 10 },
      { item_name: "กรอกเอง", calc_method: null, width_cm: 20, length_cm: 20 },
    ]);
    expect(p.map((x) => x.name)).toEqual(["ผ้า", "ชิ้น"]);
  });
  it("ชื่อว่าง = ไม่ระบุวัสดุ", () => {
    expect(patternPieces([{ width_cm: 10, length_cm: 5 }])[0].name).toBe("ไม่ระบุวัสดุ");
  });
});

describe("shelfLayout", () => {
  it("ไม่มีชิ้นไหนเกินความกว้างแผ่น (ยกเว้นชิ้นที่กว้างกว่าแผ่นเอง) และไม่ซ้อนกัน", () => {
    const p = patternPieces(lines);
    const L = shelfLayout(p, 60, 2);
    for (const a of L.placed) expect(a.x + a.w).toBeLessThanOrEqual(Math.max(60, a.w));
    for (const a of L.placed) for (const b of L.placed) {
      if (a.id === b.id) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap).toBe(false);
    }
    expect(L.placed.map((x) => x.id)).toEqual(["P1", "P2", "P3"]);   // ลำดับเดิม
    expect(L.height).toBeGreaterThanOrEqual(29);
  });
  it("ไม่มีชิ้น = แผ่นว่าง", () => {
    expect(shelfLayout([], 50)).toEqual({ placed: [], width: 0, height: 0 });
  });
});

describe("tilePages / patternSheetWidth", () => {
  it("แบ่งหน้าครอบคลุมทั้งแผ่น (มีทับกัน)", () => {
    const pages = tilePages(37, 40, A4_PRINTABLE.w, A4_PRINTABLE.h, 1);
    const cols = Math.max(...pages.map((p) => p.col)), rows = Math.max(...pages.map((p) => p.row));
    expect(cols).toBe(2);
    expect(rows).toBe(2);
    const last = pages[pages.length - 1];
    expect(last.x + last.w).toBeGreaterThanOrEqual(37);
    expect(last.y + last.h).toBeGreaterThanOrEqual(40);
  });
  it("ตัดหน้าว่างทิ้ง (ไม่มีชิ้นทับ)", () => {
    const L = { placed: [{ id: "P1", name: "a", material: "a", group: "g", w: 10, h: 10, count: 1, faceWidth: null, note: null, x: 0, y: 0 }], width: 37, height: 40 };
    const all = tilePages(37, 40, A4_PRINTABLE.w, A4_PRINTABLE.h, 1);
    const used = pagesWithPieces(all, L);
    expect(all.length).toBe(4);
    expect(used.map((p) => `${p.row}-${p.col}`)).toEqual(["1-1"]);
  });
  it("แผ่นกว้างพอชิ้นที่กว้างที่สุด และลงตัวกับหน้า A4", () => {
    const w = patternSheetWidth(patternPieces(lines));
    expect(w).toBeGreaterThanOrEqual(57);
    expect(((w - 1) / 18) % 1).toBe(0);
  });
});

describe("ไฟล์ส่งออก", () => {
  const L = shelfLayout(patternPieces(lines), 60);
  it("DXF: เส้นตัด 4 เส้นต่อชิ้น · ป้ายเป็นอังกฤษ · ปิดท้าย EOF", () => {
    const d = buildPatternDxf(L);
    expect(d.split("\nLINE\n").length - 1).toBe(L.placed.length * 4);
    expect(d).toContain(dxfLabel(L.placed[0]));
    expect(d).not.toMatch(/[฀-๿]/);   // ไม่มีอักษรไทยในไฟล์ DXF
    expect(d.trim().endsWith("EOF")).toBe(true);
  });
  it("SVG: ขนาดจริงหน่วยซม. + ชื่อไทย (escape แล้ว)", () => {
    const s = buildPatternSvg({ placed: [{ ...L.placed[0], name: "ผ้า <A&B>" }], width: 50, height: 20 });
    expect(s).toContain('width="50cm"');
    expect(s).toContain("ผ้า &lt;A&amp;B&gt;");
  });
});
