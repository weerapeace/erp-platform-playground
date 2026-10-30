import { describe, it, expect } from "vitest";
import { areaPath, bestFit, compartmentsProblem, fitInto, fitLabel, fitNames, fitPose, fitReport, fitTargetOf, fitText, parseArea, parseCompartments, withFitLines, type Compartment, type FitTarget } from "../fit-check";

/** 📐 ใส่ได้ไหม / กี่ชิ้น — ตอบลูกค้าตรง ๆ จึงต้องถูกเสมอ */
const labubu: FitTarget = { id: "l", name: "Labubu", w: 9.5, h: 17, d: 7, soft: true };
const figure: FitTarget = { id: "f", name: "ฟิกเกอร์", w: 5.5, h: 9, d: 5 };
const main: Compartment = { id: "a", name: "ช่องหลัก", w: 30, h: 14, d: 10 };
const front: Compartment = { id: "b", name: "ช่องหน้าใส", w: 18, h: 12, d: 3, window: true };

describe("อ่านข้อมูลช่อง", () => {
  it("null = ยังไม่วัด · [] = ไม่มีช่อง · ขนาดไม่ครบถูกข้าม", () => {
    expect(parseCompartments(null)).toBeNull();
    expect(parseCompartments(undefined)).toBeNull();
    expect(parseCompartments([])).toEqual([]);
    expect(parseCompartments('[{"name":"หลัก","w":20,"h":10,"d":5},{"name":"x","w":0,"h":1,"d":1}]')).toEqual([{ id: "c1", name: "หลัก", w: 20, h: 10, d: 5 }]);
    expect(parseCompartments([{ w: 20, h: 10, d: 5, window: true }])?.[0]).toMatchObject({ name: "ช่องที่ 1", window: true });
  });
  it("ตรวจฟอร์ม: บอกช่องที่ขาด", () => {
    expect(compartmentsProblem([{ name: "ช่องหลัก", w: 30, h: "", d: 10 }])).toBe("ช่องหลัก: ใส่สูง (ซม.) ให้ครบ");
    expect(compartmentsProblem([{ w: 30, h: 14, d: 999 }])).toContain("มากเกินไป");
    expect(compartmentsProblem([{ name: "ok", w: 30, h: 14, d: 10 }])).toBeNull();
  });
});

describe("ใส่ได้ไหม", () => {
  it("หมุนได้: Labubu สูง 17 นอนในช่องสูง 14 ได้ — วางคู่ (หนา 7+7 = 14) ได้ 2 ตัว", () => {
    expect(fitInto(labubu, main)).toEqual({ status: "roomy", count: 2 });
  });
  it("ฟิกเกอร์เล็กใส่ได้หลายตัว (เรียงเป็นตาราง)", () => {
    // 30x14x10 กับ 5.5x9x5 (หมุนให้ได้มากสุด) → 5 x 1 x 2 = 10 หรือดีกว่า
    expect(fitInto(figure, main)!.count).toBeGreaterThanOrEqual(10);
  });
  it("ของนุ่มบีบได้ ≤10% = พอดี (แน่น) · เกินกว่านั้น = ใส่ไม่ได้", () => {
    expect(fitInto(labubu, { w: 17, h: 9, d: 6.5 })).toEqual({ status: "snug", count: 1 }); // หนา 7 บีบเหลือ 6.3
    expect(fitInto(labubu, { w: 17, h: 9, d: 6 })).toBeNull();
    expect(fitInto({ ...labubu, soft: false }, { w: 17, h: 9.5, d: 6.5 })).toBeNull(); // ของแข็งบีบไม่ได้
  });
  it("ชิดขอบ < 0.5 ซม. = พอดี (แน่น)", () => {
    expect(fitInto(figure, { w: 5.7, h: 9.2, d: 5.2 })).toEqual({ status: "snug", count: 1 });
  });
  it("ช่องหน้าใสบาง 3 ซม. ใส่ Labubu ไม่ได้ → เลือกช่องหลักให้", () => {
    expect(fitInto(labubu, front)).toBeNull();
    expect(bestFit(labubu, [front, main])?.compartment.name).toBe("ช่องหลัก");
  });
  it("รายงาน: ใส่ได้ขึ้นก่อน · ข้อความ", () => {
    const big: FitTarget = { id: "z", name: "ตุ๊กตา 30", w: 18, h: 30, d: 12, soft: true };
    const rep = fitReport([big, labubu], [main, front]);
    expect(rep.map((r) => [r.item.id, !!r.result])).toEqual([["l", true], ["z", false]]);
    expect(fitText(rep[0].result!)).toBe("ใส่สบาย · ประมาณ 2 ชิ้น · ช่องหลัก");
  });
  it("แถวทะเบียน → ของที่คำนวณได้ (ขนาดไม่ครบ/ปิด = ไม่ใช้)", () => {
    expect(fitTargetOf({ id: "1", name: "A", width_cm: "9.5", height_cm: 17, depth_cm: 7, is_soft: true, size_estimated: true })).toMatchObject({ w: 9.5, soft: true, estimated: true });
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: null, depth_cm: 7 })).toBeNull();
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: 9, depth_cm: 7, is_active: false })).toBeNull();
  });
});

describe("บรรทัดหน้าสินค้า", () => {
  it("ตุ๊กตานับเป็นตัว · ของใช้นับเป็นชิ้น · แน่นบอก", () => {
    const doll = fitTargetOf({ id: "1", name: "Labubu", kind: "doll", width_cm: 9.5, height_cm: 17, depth_cm: 7, is_soft: true })!;
    expect(fitLabel(doll, bestFit(doll, [main])!)).toBe("Labubu ประมาณ 2 ตัว");
    expect(fitLabel(doll, bestFit(doll, [{ id: "x", name: "x", w: 17, h: 9, d: 6.5 }])!)).toBe("Labubu ประมาณ 1 ตัว (แน่น)");
    const item = fitTargetOf({ id: "2", name: "ขวดน้ำ", width_cm: 6.5, height_cm: 22, depth_cm: 6.5 })!;
    expect(fitLabel(item, bestFit(item, [{ id: "y", name: "y", w: 25, h: 15, d: 10 }])!)).toBe("ขวดน้ำ ประมาณ 2 ชิ้น");
  });
});

describe("บรรทัดใส่ได้ในหัวข้อขนาด (products API)", () => {
  const big: FitTarget = { id: "z", name: "ตุ๊กตา 30", w: 18, h: 30, d: 12, soft: true, kind: "doll" };
  const lab: FitTarget = { ...labubu, kind: "doll" };
  it("ต่อท้ายของเดิม เฉพาะที่ใส่ได้", () => {
    expect(withFitLines({ fits: ["สมาร์ทโฟน"], rows: [1] }, [main], [lab, big])).toEqual({ fits: ["สมาร์ทโฟน", "Labubu ประมาณ 2 ตัว"], rows: [1] });
  });
  it("เดิมว่างแต่ใส่ได้ = สร้างใหม่ · ไม่วัด/ใส่ไม่ได้ = ค่าเดิม", () => {
    expect(withFitLines(undefined, [main], [lab])).toEqual({ fits: ["Labubu ประมาณ 2 ตัว"], rows: [] });
    expect(withFitLines(undefined, null, [lab])).toBeUndefined();
    expect(withFitLines(undefined, [front], [big])).toBeUndefined();
  });
});

describe("ตัวกรองหน้ารวมสินค้า + รูป", () => {
  it("ชื่อที่ใส่ได้ (ไม่มีจำนวน) · ไม่วัด = []", () => {
    const big: FitTarget = { id: "z", name: "ตุ๊กตา 30", w: 18, h: 30, d: 12, soft: true };
    expect(fitNames([main, front], [labubu, figure, big])).toEqual(["Labubu", "ฟิกเกอร์"]);
    expect(fitNames(null, [labubu])).toEqual([]);
  });
  it("รูปจากทะเบียน (ว่าง = ไม่ใส่)", () => {
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: 9, depth_cm: 7, image_key: " dolls/a.png " })?.imageKey).toBe("dolls/a.png");
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: 9, depth_cm: 7, image_key: "" })).not.toHaveProperty("imageKey");
  });
});

describe("กรอบช่องบนรูป + ชื่ออังกฤษ (ป๊อปเทียบขนาด)", () => {
  it("เก็บ name_en + area · ตัดกรอบที่ล้นรูป · ทรงไม่รู้จัก = มุมมน (ไม่เก็บ)", () => {
    const [c] = parseCompartments([{ id: "a", name: "ช่องหน้า", name_en: " Front pocket ", w: 22, h: 11, d: 5, area: { img: "p/1.jpg", x: 10, y: 20, w: 95, h: 30, shape: "heart" } }])!;
    expect(c).toEqual({ id: "a", name: "ช่องหน้า", name_en: "Front pocket", w: 22, h: 11, d: 5, area: { img: "p/1.jpg", x: 10, y: 20, w: 90, h: 30, shape: "heart" } });
    expect(parseArea({ x: 1, y: 1, w: 5, h: 5, shape: "star" })).toEqual({ x: 1, y: 1, w: 5, h: 5 });
    expect(parseArea({ x: 99.5, y: 1, w: 5, h: 5 })).toBeNull(); // เหลือในรูปไม่ถึง 1%
    expect(parseArea({ x: "a", y: 1, w: 5, h: 5 })).toBeNull();
    expect(parseCompartments([{ name: "x", w: 1, h: 1, d: 1, area: "bad" }])![0]).not.toHaveProperty("area");
  });
  it("เส้นกรอบทุกทรงเริ่มจากในกล่อง", () => {
    for (const s of ["rect", "round", "ellipse", "heart", undefined] as const) expect(areaPath(s, 10, 20, 30, 40)).toMatch(/^M[\d.]+ [\d.]+/);
    expect(areaPath("rect", 0, 0, 10, 5)).toBe("M0 0H10V5H0Z");
  });
});

describe("บีบได้กี่ % ตั้งต่อตุ๊กตา", () => {
  const pocket = { w: 22, h: 11, d: 5 }; // PIX43 ช่องหน้า
  it("ไม่ตั้ง = 10% (Labubu หนา 7 ใส่ช่องลึก 5 ไม่ได้) · ตั้ง 30% = ใส่ได้แต่แน่น", () => {
    expect(fitInto(labubu, pocket)).toBeNull();
    expect(fitInto({ ...labubu, squeeze: 0.3 }, pocket)).toEqual({ status: "snug", count: 1 });
  });
  it("ของแข็งไม่สนค่าบีบ · ค่าเกิน 50% ใช้ค่ากลาง", () => {
    expect(fitInto({ ...labubu, soft: false, squeeze: 0.3 }, pocket)).toBeNull();
    expect(fitInto({ ...labubu, squeeze: 0.9 }, pocket)).toBeNull();
  });
  it("อ่านจากทะเบียน squeeze_pct (ว่าง = ไม่ใส่ · เฉพาะของนุ่ม · เพดาน 50)", () => {
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: 9, depth_cm: 7, is_soft: true, squeeze_pct: 25 })?.squeeze).toBe(0.25);
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: 9, depth_cm: 7, is_soft: true, squeeze_pct: 80 })?.squeeze).toBe(0.5);
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: 9, depth_cm: 7, is_soft: true, squeeze_pct: null })).not.toHaveProperty("squeeze");
    expect(fitTargetOf({ id: "1", name: "A", width_cm: 9, height_cm: 9, depth_cm: 7, squeeze_pct: 25 })).not.toHaveProperty("squeeze");
  });
  it("ท่าที่ใช้บอกขนาดตามแนวช่อง (ภาพหน้า/ข้าง)", () => {
    const p = fitPose(figure, pocket)!;
    expect(p.status).toBe("snug");
    expect(p.along[2]).toBeLessThanOrEqual(5);
    expect(fitPose({ ...labubu, squeeze: 0.3 }, pocket)).toMatchObject({ squeezed: true, count: 1 });
  });
  it("ชื่ออังกฤษติดไปด้วย (เว็บ /en สลับเอง)", () => {
    expect(fitTargetOf({ id: "1", name: "ตุ๊กตา", name_en: " Doll ", width_cm: 9, height_cm: 9, depth_cm: 7 })).toMatchObject({ name: "ตุ๊กตา", name_en: "Doll" });
  });
});
