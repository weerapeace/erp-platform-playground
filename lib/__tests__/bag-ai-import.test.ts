import { describe, expect, it } from "vitest";
import { AI_PATTERN_FORMAT, AI_PATTERN_PROMPT, parseAiPattern } from "@/lib/bag-ai-import";
import { pieceEdges, sideLength } from "@/lib/pattern-seams";
import { shapeBox } from "@/lib/pattern-shape";

const coin = {
  format: "bagpattern/1", name: "กระเป๋าใส่เหรียญกลม", notes: "เดาว่าไม่มีซับใน",
  pieces: [
    { id: "front", name: "ตัวหน้า", count: 1, shape: { type: "circle", w: 10, h: 10 }, seam_allowance: 0.7, material: "หนัง PU" },
    { id: "back", name: "ตัวหลัง", count: 1, shape: { type: "circle", w: 10, h: 10 }, seam_allowance: 0.7 },
    { id: "side", name: "ขอบข้าง", count: 1, shape: { type: "rect", w: 31.4, h: 3, corner: 0 }, seam_allowance: 0.7 },
    { id: "tab", name: "หูดึงซิป", count: 2, shape: { type: "polygon", points: [[2, 1], [6, 1], [7, 2.2], [6, 3.4], [2, 3.4]] }, seam_allowance: 0 },
  ],
  seams: [
    { a: { piece: "front", edge: "all" }, b: { piece: "side", edge: "top" } },
    { a: { piece: "back", edge: "all" }, b: { piece: "side", edge: "bottom" } },
    { a: { piece: "tab", edge: 4 }, b: { piece: "side", edge: "left" } },
  ],
};
const ok = (t: string) => { const r = parseAiPattern(t); if (!r.ok) throw new Error(r.error); return r; };

describe("อ่านคำตอบของ AI ภายนอก (parseAiPattern)", () => {
  it("คำสั่งที่ให้คัดลอกบอกรูปแบบและกติกาหลักครบ", () => {
    for (const w of [AI_PATTERN_FORMAT, "seam_allowance", "polygon", "ถามผมก่อน", "JSON อย่างเดียว"]) expect(AI_PATTERN_PROMPT).toContain(w);
  });
  it("คำตอบครบ: ได้ชิ้น 4 แบบ รูปทรงถูกชนิด · รูปหลายเหลี่ยมเลื่อนมาเริ่มที่ 0,0 · ตะเข็บอ้างขอบถูก", () => {
    const r = ok(JSON.stringify(coin));
    expect(r.pieces.map((p) => [p.key, p.shape.k, p.count, p.allow])).toEqual([["front", "ellipse", 1, 0.7], ["back", "ellipse", 1, 0.7], ["side", "rect", 1, 0.7], ["tab", "path", 2, 0]]);
    expect(r.pieces[0].material).toBe("หนัง PU");
    const tab = shapeBox(r.pieces[3].shape);
    expect([tab.x, tab.y, tab.w, tab.h]).toEqual([0, 0, 5, 2.4]);
    expect(r.seams).toEqual([
      { a: { piece: 0, from: 0, count: 1, n: 1 }, b: { piece: 2, from: 0, count: 1, n: 4 } },
      { a: { piece: 1, from: 0, count: 1, n: 1 }, b: { piece: 2, from: 2, count: 1, n: 4 } },
      { a: { piece: 3, from: 4, count: 1, n: 5 }, b: { piece: 2, from: 3, count: 1, n: 4 } },
    ]);
    expect([r.name, r.notes, r.skipped, r.seamsSkipped]).toEqual(["กระเป๋าใส่เหรียญกลม", "เดาว่าไม่มีซับใน", [], 0]);
    // ขอบที่ตะเข็บอ้างมีจริงในรูปของชิ้น และวงกลมรอบ 31.4 ≈ ขอบบนของชิ้นข้าง
    const circleLen = sideLength(r.pieces[0].shape, { pid: "x", from: 0, count: 1, n: 1 });
    expect(Math.abs((circleLen ?? 0) - 31.4)).toBeLessThan(0.2);
    expect(pieceEdges(r.pieces[3].shape)).toHaveLength(5);
  });
  it("ชิ้นวางเรียงไม่ทับกัน (รวมเผื่อเย็บ) และขึ้นแถวใหม่เมื่อเกินความกว้าง", () => {
    const many = { ...coin, pieces: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `ชิ้น ${i}`, shape: { type: "rect", w: 40, h: 10 }, seam_allowance: 1 })), seams: [] };
    const r = ok(JSON.stringify(many));
    const boxes = r.pieces.map((p) => ({ x: p.at[0] - p.allow, y: p.at[1] - p.allow, w: p.w + 2 * p.allow, h: p.h + 2 * p.allow }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6).toBe(true);
    }
    expect(new Set(boxes.map((b) => b.y)).size).toBeGreaterThan(1);
  });
  it("มีข้อความอื่นปน / ครอบด้วย ``` ก็อ่านได้", () => {
    expect(ok("ได้เลยครับ นี่คือแพทเทิร์น:\n```json\n" + JSON.stringify(coin, null, 2) + "\n```\nหวังว่าจะช่วยได้").pieces).toHaveLength(4);
  });
  it("ชิ้นที่ขนาด/รูปทรงใช้ไม่ได้ถูกข้าม (บอกชื่อ) · ตะเข็บที่อ้างชิ้นนั้นหรือขอบที่ไม่มีถูกข้าม · มุมมนอ้างขอบไม่ได้", () => {
    const bad = {
      format: "bagpattern/1",
      pieces: [
        { id: "a", name: "ดี", shape: { type: "rect", w: 20, h: 10 } },
        { id: "b", name: "ใหญ่เกิน", shape: { type: "rect", w: 9999, h: 10 } },
        { id: "c", name: "จุดไม่พอ", shape: { type: "polygon", points: [[0, 0], [1, 1]] } },
        { id: "d", name: "มุมมน", shape: { type: "rect", w: 20, h: 10, corner: 2 }, count: 500, seam_allowance: 99 },
        { name: "ไม่มีรูป" },
      ],
      seams: [
        { a: { piece: "a", edge: "top" }, b: { piece: "b", edge: "top" } },
        { a: { piece: "a", edge: "diagonal" }, b: { piece: "a", edge: "left" } },
        { a: { piece: "a", edge: "top" }, b: { piece: "d", edge: "top" } },
        { a: { piece: "a", edge: "top" }, b: { piece: "a", edge: "top" } },
        { a: { piece: "a", edge: "top" }, b: { piece: "a", edge: "bottom" } },
      ],
    };
    const r = ok(JSON.stringify(bad));
    expect(r.pieces.map((p) => p.key)).toEqual(["a", "d"]);
    expect(r.skipped).toEqual(["ใหญ่เกิน", "จุดไม่พอ", "ไม่มีรูป"]);
    expect(r.pieces[1].shape.k).toBe("path");
    expect(r.pieces[1].count).toBe(99);
    expect(r.pieces[1].allow).toBeLessThanOrEqual(20);
    expect(r.seams).toEqual([{ a: { piece: 0, from: 0, count: 1, n: 4 }, b: { piece: 0, from: 2, count: 1, n: 4 } }]);
    expect(r.seamsSkipped).toBe(4);
  });
  it("ผิดรูปแบบ = บอกเป็นภาษาคน ไม่พัง", () => {
    for (const t of ["", "สวัสดี", "{ not json }", JSON.stringify({ format: "other", pieces: [] }), JSON.stringify({ format: "bagpattern/1", pieces: [] }), JSON.stringify({ format: "bagpattern/1", pieces: [{ name: "x" }] })]) {
      const r = parseAiPattern(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(8);
    }
  });
});
