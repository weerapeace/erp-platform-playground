import { describe, expect, it } from "vitest";
import { contourShape, otsuThreshold, simplifyClosed, traceGray } from "@/lib/pattern-trace";
import { cleanShape, shapeArea, shapeBox, type Pt } from "@/lib/pattern-shape";
import { bagParamsFromAiDraft } from "@/lib/bag-ai-draft";
import { BAG_DEFAULT, BAG_LIMITS } from "@/lib/bag-templates";

/** รูปจำลอง: พื้นสว่าง bg · ชิ้นเข้ม fg (สลับได้) */
function canvas(w: number, h: number, bg = 235) {
  const g = new Uint8Array(w * h).fill(bg);
  return {
    g, w, h,
    rect(x0: number, y0: number, rw: number, rh: number, v = 40) { for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) g[y * w + x] = v; },
    disc(cx: number, cy: number, r: number, v = 40) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y * w + x] = v; },
  };
}

describe("ลอกเส้นรอบชิ้นจากรูป (pattern-trace)", () => {
  it("otsu แบ่งสองกลุ่มความสว่างได้ระหว่างกลุ่ม", () => {
    const c = canvas(40, 40); c.rect(5, 5, 20, 20);
    const t = otsuThreshold(c.g);
    expect(t).toBeGreaterThanOrEqual(40); expect(t).toBeLessThan(235);
  });
  it("สี่เหลี่ยมเข้มบนพื้นสว่าง → 1 ชิ้น 4 จุด ขนาดตรง · ระบบรู้เองว่าชิ้นเข้มกว่าพื้น", () => {
    const c = canvas(200, 150); c.rect(20, 30, 100, 60);
    const r = traceGray(c.g, c.w, c.h);
    expect(r.darkPieces).toBe(true);
    expect(r.contours).toHaveLength(1);
    const k = r.contours[0];
    expect(k.pts).toHaveLength(4);
    expect(k.box).toEqual({ x: 20, y: 30, w: 99, h: 59 });      // เส้นวิ่งผ่านกลางจุดภาพริมสุด → สั้นกว่า 1 จุด
    const s = contourShape(k, 0.1)!;                              // 10 จุดภาพ = 1 ซม.
    expect(cleanShape(s)).not.toBeNull();
    const b = shapeBox(s);
    expect([b.x, b.y, b.w, b.h]).toEqual([0, 0, 9.9, 5.9]);
  });
  it("ชิ้นสว่างบนพื้นเข้ม (กระดาษขาวบนโต๊ะดำ) ก็ได้ · บังคับเองได้", () => {
    const c = canvas(120, 100, 30); c.rect(30, 20, 50, 40, 240);
    const r = traceGray(c.g, c.w, c.h);
    expect(r.darkPieces).toBe(false);
    expect(r.contours).toHaveLength(1);
    expect(traceGray(c.g, c.w, c.h, { pieces: "dark" }).contours).toHaveLength(0);   // เลือกผิดฝั่ง = ได้พื้นทั้งรูป → ไม่นับเป็นชิ้น
  });
  it("หลายชิ้น: เรียงจากใหญ่ไปเล็ก · จุดรบกวนเล็ก ๆ ถูกทิ้ง · วงกลมได้พื้นที่ใกล้ของจริง", () => {
    const c = canvas(300, 200);
    c.rect(10, 10, 120, 90); c.disc(220, 110, 40); c.rect(150, 15, 3, 3);
    const r = traceGray(c.g, c.w, c.h, { eps: 1 });
    expect(r.contours).toHaveLength(2);
    expect(r.contours[0].box.w).toBe(119);
    const circle = r.contours[1];
    expect(Math.abs(circle.area - Math.PI * 40 * 40) / (Math.PI * 1600)).toBeLessThan(0.04);
    const s = contourShape(circle, 0.05)!;
    expect(Math.abs(shapeArea(s) - Math.PI * 4) / (Math.PI * 4)).toBeLessThan(0.05);   // รัศมี 40 จุด = 2 ซม.
  });
  it("ลดจุด: เส้นตรงที่มีจุดถี่เหลือแค่มุม · จุดมากเกินกำหนดถูกลดเพิ่มจนพอ", () => {
    const sq: Pt[] = [];
    for (let i = 0; i < 50; i++) sq.push([i, 0]);
    for (let i = 0; i < 50; i++) sq.push([50, i]);
    for (let i = 0; i < 50; i++) sq.push([50 - i, 50]);
    for (let i = 0; i < 50; i++) sq.push([0, 50 - i]);
    expect(simplifyClosed(sq, 1)).toHaveLength(4);
    const c = canvas(400, 400); c.disc(200, 200, 150);
    const k = traceGray(c.g, c.w, c.h, { eps: 0.5 }).contours[0];
    expect(k.pts.length).toBeGreaterThan(24);
    expect(contourShape(k, 0.1, 24)!.k === "path" && (contourShape(k, 0.1, 24) as { nodes: unknown[] }).nodes.length).toBeLessThanOrEqual(24);
  });
  it("รูปว่าง/เล็กเกิน = ไม่มีชิ้น ไม่พัง", () => {
    expect(traceGray(new Uint8Array(0), 0, 0).contours).toEqual([]);
    expect(traceGray(new Uint8Array(100).fill(200), 10, 10).contours).toEqual([]);
  });
});

describe("ร่างค่าแม่แบบจากคำตอบ AI (bag-ai-draft)", () => {
  it("สัดส่วน × ความกว้างจริง → ค่าแม่แบบ · ยาวหูคิดจากความสูงพ้นปาก", () => {
    const d = bagParamsFromAiDraft({ is_bag: true, fits_template: true, style_th: "Tote ผ้าแคนวาส", height: 0.9, depth: 0.35, flare: 0.1, corner_radius: 0, separate_base: true,
      handle_drop: 0.6, handle_gap: 0.4, handle_width: 0.08, opening: "none", confidence: 0.7, notes_th: "มองไม่เห็นก้น" }, 30);
    expect(d.params).toMatchObject({ W: 30, H: 27, D: 10.5, flare: 3, r: 0, strip: false, wh: 2.5, g: 12, win: "none" });
    expect(d.params.Lh).toBe(Math.round(2 * 0.6 * 30 + (Math.PI - 2) * 6));
    expect([d.fits, d.confidence, d.style, d.notes]).toEqual([true, 0.7, "Tote ผ้าแคนวาส", "มองไม่เห็นก้น"]);
  });
  it("มีช่องซิป / หน้าต่างหัวใจ → ตั้งชนิดช่องให้ · ค่าหลุดขอบเขตถูกบีบเข้า", () => {
    const zip = bagParamsFromAiDraft({ height: 0.8, depth: 0.3, opening: "zip", opening_width: 0.6, opening_center_height: 0.6 }, 30).params;
    expect(zip).toMatchObject({ win: "rect", winType: "zip", ws: 18 });
    const heart = bagParamsFromAiDraft({ height: 0.9, opening: "window", window_shape: "heart", opening_width: 0.5 }, 26).params;
    expect(heart).toMatchObject({ win: "heart", winType: "window" });
    const wild = bagParamsFromAiDraft({ height: 99, depth: -4, handle_width: 7 }, 30).params;
    expect(wild.H).toBe(BAG_LIMITS.H.max); expect(wild.D).toBe(BAG_LIMITS.D.min); expect(wild.wh).toBe(BAG_LIMITS.wh.max);
  });
  it("AI ตอบไม่ครบ/ไม่ใช่วัตถุ → ใช้ค่าเริ่มต้นของช่องที่ขาด ไม่พัง · บอกว่าไม่ใช่กระเป๋า/ไม่เข้าแม่แบบได้", () => {
    const d = bagParamsFromAiDraft(null, Number.NaN);
    expect(d.params).toEqual({ ...BAG_DEFAULT, ...d.params });
    expect(d.params.W).toBe(BAG_DEFAULT.W);
    expect(d.confidence).toBe(0);
    const no = bagParamsFromAiDraft({ is_bag: false, fits_template: false, height: "0.5" }, 40);
    expect([no.isBag, no.fits, no.params.H]).toEqual([false, false, 20]);
  });
});
