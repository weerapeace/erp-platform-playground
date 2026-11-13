/** Bag CAD รอบ I3: แก้มุมเอียงรูป · จุดตรวจระยะ · ความคลาดการลอกเส้น · โค้ช · ป้ายแหล่งที่มาของ AI */
import { describe, expect, it } from "vitest";
import { applyH, checkScale, epsForTolMm, homography, invert3, isConvexQuad, orderQuad, rectifyGray, traceTolMm, type PPt } from "@/lib/pattern-photo";
import { coachSummary, coachTips, parseCoachReply } from "@/lib/pattern-coach";
import { bagParamsFromAiDraft } from "@/lib/bag-ai-draft";
import type { Shape } from "@/lib/pattern-shape";

describe("แก้มุมเอียงของรูป", () => {
  it("การบิดภาพส่ง 4 มุมไปตรงตำแหน่ง + กลับด้านได้", () => {
    const src: PPt[] = [[10, 20], [200, 5], [230, 180], [5, 150]], dst: PPt[] = [[0, 0], [100, 0], [100, 70], [0, 70]];
    const H = homography(src, dst)!;
    src.forEach((p, i) => { const q = applyH(H, p); expect(q[0]).toBeCloseTo(dst[i][0], 6); expect(q[1]).toBeCloseTo(dst[i][1], 6); });
    const Hi = invert3(H)!, back = applyH(Hi, [50, 35]), fwd = applyH(H, back);
    expect(fwd[0]).toBeCloseTo(50, 6); expect(fwd[1]).toBeCloseTo(35, 6);
  });
  it("เรียงมุมที่คลิกมั่ว → ซ้ายบน ขวาบน ขวาล่าง ซ้ายล่าง · มุมไขว้ = ไม่ใช่สี่เหลี่ยมนูน", () => {
    expect(orderQuad([[100, 90], [0, 0], [0, 80], [110, 5]])).toEqual([[0, 0], [110, 5], [100, 90], [0, 80]]);
    expect(isConvexQuad([[0, 0], [10, 0], [0, 10], [10, 10]])).toBe(false);
  });
  it("กระดาษเอียงในรูป → ภาพตรง + มาตราส่วนถูก (สี่เหลี่ยมดำ 10×5 ซม. กลางกระดาษ 20×10)", () => {
    // วาดภาพจำลอง: กระดาษ 20×10 ซม. ถ่ายเอียง (สี่เหลี่ยมคางหมู) · กลางกระดาษมีสี่เหลี่ยมดำ 10×5
    const w = 300, h = 220, gray = new Uint8Array(w * h).fill(40);
    const quad: PPt[] = [[60, 30], [250, 50], [270, 190], [30, 170]];
    const Hp = homography([[0, 0], [20, 0], [20, 10], [0, 10]], quad)!, Hi = invert3(Hp)!;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [u, v] = applyH(Hi, [x + 0.5, y + 0.5]);
      if (u >= 0 && u <= 20 && v >= 0 && v <= 10) gray[y * w + x] = u >= 5 && u <= 15 && v >= 2.5 && v <= 7.5 ? 0 : 255;
    }
    const r = rectifyGray(gray, w, h, [quad[2], quad[0], quad[3], quad[1]], 20, 10, { maxSide: 400 })!;
    expect(r.w).toBe(400); expect(r.h).toBe(200); expect(r.cmPerPx).toBeCloseTo(0.05, 6);
    let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.gray[y * r.w + x] < 128) { n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    expect(((maxX - minX + 1) * r.cmPerPx)).toBeCloseTo(10, 0); expect(((maxY - minY + 1) * r.cmPerPx)).toBeCloseTo(5, 0);
    expect(n * r.cmPerPx * r.cmPerPx).toBeGreaterThan(45); expect(n * r.cmPerPx * r.cmPerPx).toBeLessThan(55);
  });
});

describe("จุดตรวจระยะ + ความคลาด", () => {
  it("มาตราส่วนเข้ากับหลายคู่ + บอกคู่ที่คลาดเกิน", () => {
    const r = checkScale([{ a: [0, 0], b: [100, 0], real: 10 }, { a: [0, 0], b: [0, 200], real: 20 }, { a: [0, 0], b: [300, 0], real: 31 }], 0.3)!;
    expect(r.cmPerPx).toBeGreaterThan(0.1); expect(r.rows).toHaveLength(3);
    expect(r.ok).toBe(false); expect(r.rows.filter((x) => !x.ok).length).toBeGreaterThan(0);
    const ok = checkScale([{ a: [0, 0], b: [100, 0], real: 10 }, { a: [0, 0], b: [0, 200], real: 20.1 }], 0.3)!;
    expect(ok.ok).toBe(true);
    const fixed = checkScale([{ a: [0, 0], b: [100, 0], real: 10 }], 0.3, 0.12)!;
    expect(fixed.cmPerPx).toBe(0.12); expect(fixed.rows[0].err).toBeCloseTo(2, 6); expect(fixed.ok).toBe(false);
    expect(checkScale([], 0.3)).toBeNull();
  });
  it("ความคลาดของเส้นที่ลอก: 2 จุดภาพ × 0.05 ซม. = 1 มม. · กลับกัน", () => {
    expect(traceTolMm(2, 0.05)).toBe(1); expect(epsForTolMm(1, 0.05)).toBeCloseTo(2, 6);
  });
});

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
describe("โค้ช", () => {
  it("ยังไม่มีชิ้น = เริ่มจากแม่แบบ · มีชิ้นไม่มีตะเข็บ/เผื่อเย็บ/วัสดุ = ขั้นถัดไปตามลำดับ", () => {
    expect(coachTips({ pieces: [], seams: [], issues: [] })[0].tool).toBe("template");
    const tips = coachTips({ pieces: [{ pid: "a", shape: R(20, 20), allow: 0 }, { pid: "b", shape: R(20, 5), allow: 0 }], seams: [], issues: [] });
    expect(tips.map((x) => x.id)).toEqual(["seams", "allow", "mats"]);
  });
  it("ปัญหาต้องแก้มาก่อน · ทุกอย่างพร้อม = พร้อมผลิต", () => {
    const tips = coachTips({ pieces: [{ pid: "a", shape: R(20, 20), allow: 1, mats: [{}] }], seams: [], issues: [{ id: "x", level: "error", code: "self-cross", pids: ["a"], data: {} }] });
    expect(tips[0].id).toBe("fix-errors");
    expect(coachTips({ pieces: [{ pid: "a", shape: R(20, 20), allow: 1, mats: [{}] }], seams: [], issues: [] }).map((x) => x.id)).toEqual(["ready"]);
  });
  it("ข้อความที่ส่งให้ AI: มีชิ้น/ขนาด/คำถาม ไม่เกิน 6,000 ตัวอักษร · คำตอบแปลก = ทิ้ง", () => {
    const s = coachSummary({ pieces: [{ pid: "a", name: "ตัวหน้า", shape: R(30, 25), allow: 1 }], seams: [], issues: [] }, "หูยาวเท่าไรดี");
    expect(s).toContain("ตัวหน้า: 30×25 ซม."); expect(s).toContain("หูยาวเท่าไรดี"); expect(s.length).toBeLessThanOrEqual(6000);
    expect(parseCoachReply({ tips: [{ do: "ใส่เผื่อเย็บ", why: "x" }, { do: "" }, 3], note: 5 })).toEqual({ tips: [{ do: "ใส่เผื่อเย็บ", why: "x" }], note: "5" });
  });
});

describe("ป้าย เห็นจากภาพ / ประมาณ", () => {
  it("ค่าที่ AI บอกว่าเห็น = seen · ที่เหลือ = estimated · ไม่มีช่องเปิด = ไม่มีป้ายช่อง", () => {
    const d = bagParamsFromAiDraft({ height: 1, depth: 0.3, handle_drop: 0.6, seen: ["height", "handle_drop", "flare"], opening: "none" }, 30);
    expect(d.sources.H).toBe("seen"); expect(d.sources.Lh).toBe("seen"); expect(d.sources.D).toBe("estimated");
    expect(d.sources.flare).toBe("estimated");   // บอกว่าเห็น แต่ไม่ได้ให้ค่า = ยังเป็นค่าตั้งต้น
    expect("ws" in d.sources).toBe(false);
    const old = bagParamsFromAiDraft({ height: 1 }, 30);
    expect(old.sources.H).toBe("estimated");
  });
});
