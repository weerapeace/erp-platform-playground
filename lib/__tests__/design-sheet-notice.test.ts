import { describe, expect, it } from "vitest";
import {
  buildNoticeHtml, cleanNotice, computeNotice, DEFAULT_NOTICE_DISPLAY, EMPTY_CALC, newNoticeDoc, noticeDbKind, noticeKindFromDb, noticeKindMeta, noticeLotNeed, noticeMaterialsFromCost,
  noticeRowsFromMaterial, noticeTabsFor, presetShow, type NoticeCalc, type NoticeContext,
} from "@/lib/design-sheet-notice";

const calc = (over: Partial<NoticeCalc> = {}): NoticeCalc => ({
  material: "ผ้าสก็อต", unit: "หลา", unit_note: "", received: 1500, mode: "ratio", waste_pct: 0,
  rows: [
    { key: "XS", label: "XS", use: 0.62, order: 1000 },
    { key: "S", label: "S", use: 0.78, order: 1000 },
    { key: "M", label: "M", use: 1.05, order: 1000 },
  ],
  ...over,
});
const ctx: NoticeContext = { sheetCode: "DS-2026-0064", sheetName: "Tote", brandName: "Good Goods", company: { name: "บริษัท ทดสอบ", address: "กรุงเทพ", phone: "02-000-0000", logoUrl: null }, senderName: "ทีมออกแบบ", dateText: "6 พ.ย. 2569" };

describe("computeNotice", () => {
  it("ผ้าไม่พอ → ลดทุกไซส์ลงสัดส่วนเดียวกัน ปัดลง", () => {
    const r = computeNotice(calc());
    expect(r.need).toBeCloseTo(2450, 6);
    expect(r.enough).toBe(false);
    expect(r.short).toBeCloseTo(950, 6);
    // 1500/2450 = 0.6122… → 612 ใบต่อไซส์
    expect(r.rows.map((x) => x.can)).toEqual([612, 612, 612]);
    expect(r.can).toBe(1836);
  });
  it("ผ้าพอ → ทำได้ครบตามสั่ง + เหลือ", () => {
    const r = computeNotice(calc({ received: 3000 }));
    expect(r.enough).toBe(true);
    expect(r.rows.map((x) => x.can)).toEqual([1000, 1000, 1000]);
    expect(r.left).toBeCloseTo(550, 6);
  });
  it("เผื่อเสีย % คูณเพิ่มจากใช้ต่อใบ", () => {
    const r = computeNotice(calc({ waste_pct: 10, received: null }));
    expect(r.rows[0].usePlus).toBeCloseTo(0.682, 6);
    expect(r.need).toBeCloseTo(2695, 6);
    expect(r.ratio).toBeNull();
    expect(r.rows[0].can).toBeNull();
  });
  it("ถ้าทำไซส์เดียว = ผ้าทั้งหมด ÷ ใช้ต่อใบ", () => {
    const r = computeNotice(calc({ mode: "single" }));
    expect(r.rows.map((x) => x.single)).toEqual([2419, 1923, 1428]);
  });
  it("แถวที่ยังไม่ใส่ใช้ต่อใบ ไม่พัง", () => {
    const r = computeNotice(calc({ rows: [{ key: "a", label: "A", use: null, order: 100 }] }));
    expect(r.need).toBe(0);
    expect(r.rows[0].can).toBeNull();
  });
});

describe("cleanNotice", () => {
  it("ตัดลิงก์รูปแปลก ๆ + ค่าผิดรูปกลับเป็นค่าตั้งต้น", () => {
    const d = cleanNotice({ kind: "bad", images: [{ url: "javascript:alert(1)" }, { url: "/api/r2-image?key=a", caption: " ด้านหน้า " }], img_cols: 9, calc: { waste_pct: 500, mode: "x" }, display: { show: { logo: false, junk: true }, fmt: { paper: "B5" } } });
    expect(d.kind).toBe("free");
    expect(d.images).toEqual([{ url: "/api/r2-image?key=a", key: null, caption: "ด้านหน้า" }]);
    expect(d.img_cols).toBe(2);
    expect(d.calc.waste_pct).toBe(100);
    expect(d.calc.mode).toBe("ratio");
    expect(d.display.show.logo).toBe(false);
    expect(d.display.show.images).toBe(true);
    expect(d.display.fmt.paper).toBe("A4");
    expect("junk" in d.display.show).toBe(false);
  });
});

describe("noticeMaterialsFromCost", () => {
  it("รวมหลายบรรทัดของผ้าเดียวกันต่อแท็บ · ผ้า (หลา) ขึ้นก่อน", () => {
    const L = (parent: string, name: string, qty: number, uom = "หลา") => ({ parent_code: parent, item_id: name, item_name: name, group_name: uom === "หลา" ? "ผ้า" : "ซิป", qty, uom, piece: false });
    const ms = noticeMaterialsFromCost([
      L("M", "ผ้าซับใน", 0.208), L("M", "ผ้าซับใน", 0.0988), L("S", "ผ้าซับใน", 0.1145),
      L("M", "ซิป", 2, "เส้น"),
    ]);
    expect(ms[0].name).toBe("ผ้าซับใน");
    expect(ms[0].perTab.M).toBeCloseTo(0.3068, 4);
    expect(ms[0].perTab.S).toBeCloseTo(0.1145, 4);
    const rows = noticeRowsFromMaterial(ms[0], [{ key: "", label: "ทั่วไป" }, { key: "S", label: "ไซส์ S" }, { key: "M", label: "ไซส์ M" }], (k) => (k === "M" ? 1000 : null));
    expect(rows).toEqual([{ key: "S", label: "ไซส์ S", use: 0.1145, order: null }, { key: "M", label: "ไซส์ M", use: 0.3068, order: 1000 }]);
  });
});

describe("ผ้าหลัก + แท็บตั้งต้น (ข้อมูลจริง DS-2026-0064)", () => {
  const L = (parent: string, name: string, qty: number, uom: string, group: string, amount: number) => ({ parent_code: parent, item_id: name, item_name: name, group_name: group, qty, uom, piece: false, amount });
  const ms = noticeMaterialsFromCost([
    L("V2 S", "ผ้าขาวม้า", 0.27, "ผืน", "ผ้า (ชิ้น)", 30), L("V2 M", "ผ้าขาวม้า", 0.43, "ผืน", "ผ้า (ชิ้น)", 45), L("ไซส์ M", "ผ้าขาวม้า", 0.31, "ผืน", "ผ้า (ชิ้น)", 33),
    L("V2 S", "กุ้น 7 หุน", 1.22, "หลา", "สาย/เทป", 1), L("V2 M", "ผ้าซับใน", 0.21, "หลา", "ผ้า", 5),
  ]);
  it("ผ้าที่แพงสุดขึ้นก่อน (ไม่ใช่กุ้นที่หน่วยเป็นหลา)", () => {
    expect(ms.map((m) => m.name)).toEqual(["ผ้าขาวม้า", "ผ้าซับใน", "กุ้น 7 หุน"]);
  });
  it("ตั้งต้นใช้แท็บ Parent จริง/ร่าง · แท็บค้างเลือกเพิ่มเองได้", () => {
    const tabs = [{ key: "", label: "ทั่วไป", kind: "general" }, { key: "V2 S", label: "V2 S", kind: "draft" }, { key: "V2 M", label: "V2 M", kind: "draft" }, { key: "ไซส์ M", label: "ไซส์ M", kind: "orphan" }];
    expect(noticeRowsFromMaterial(ms[0], tabs).map((r) => r.key)).toEqual(["V2 S", "V2 M"]);
    expect(noticeTabsFor(ms[0], tabs).all.map((t) => t.key)).toEqual(["V2 S", "V2 M", "ไซส์ M"]);
  });
});

describe("ผ้าแบบผืน → แปลงเป็นหลา (เจ้าของขอ 2026-11-06)", () => {
  // ข้อมูลจริง DS-2026-0064: ผ้าขาวม้า (นาหมื่นศรี) ผืนละ 80×200 ซม. · XS 2,350.6 cm² · M 4,988.7 cm² ต่อใบ
  const P = (parent: string, qty: number) => ({ parent_code: parent, item_id: "kw", item_name: "ผ้าขาวม้า", group_name: "ผ้า (ชิ้น)", qty, uom: "cm²", piece: true, amount: 40 });
  const sheetOf = (id: string) => (id === "kw" ? { width_cm: 80, length_cm: 200 } : null);
  const [m] = noticeMaterialsFromCost([P("XS", 2000), P("XS", 350.6), P("M", 4988.7)], sheetOf);
  it("ตั้งต้นเป็นหลา = พื้นที่ ÷ หน้ากว้าง ÷ 90 (ตัวหารเดียวกับแท็บตีราคา)", () => {
    expect(m.unit).toBe("หลา");
    expect(m.note).toBe("คิดจากหน้ากว้าง 80 ซม.");
    expect(m.perTab.XS).toBeCloseTo(2350.6 / 7200, 4);
    expect(m.perTab.M).toBeCloseTo(4988.7 / 7200, 4);
  });
  it("ยังสลับเป็นผืนได้", () => {
    const sh = m.units.find((u) => u.unit === "ผืน")!;
    expect(sh.note).toBe("ผืนละ 80×200 ซม.");
    expect(sh.perTab.XS).toBeCloseTo(2350.6 / 16000, 4);
    expect(m.units.map((u) => u.unit)).toEqual(["หลา", "ผืน"]);
  });
  it("ทะเบียนวัสดุไม่มีหน้ากว้าง = แปลงไม่ได้ (ไม่เดาตัวเลข)", () => {
    expect(noticeMaterialsFromCost([P("XS", 2000)], () => null)).toEqual([]);
  });
  it("หมายเหตุหน่วยขึ้นในใบ", () => {
    const doc = { ...newNoticeDoc("usage"), calc: { ...calc(), unit_note: "คิดจากหน้ากว้าง 80 ซม." } };
    expect(buildNoticeHtml(doc, ctx)).toContain("คิดจากหน้ากว้าง 80 ซม.");
  });
});

describe("buildNoticeHtml", () => {
  it("ซ่อนสิ่งที่ติ๊กออก · escape ข้อความผู้ใช้", () => {
    const doc = { ...newNoticeDoc("yield"), calc: calc(), images: [{ url: "/x.jpg", key: null, caption: "<b>หน้า</b>" }], note: "ทดสอบ" };
    const html = buildNoticeHtml(doc, ctx);
    expect(html).toContain("ขาดอีก");
    expect(html).toContain("&lt;b&gt;หน้า&lt;/b&gt;");
    expect(html).toContain("บริษัท ทดสอบ");
    const short = buildNoticeHtml({ ...doc, display: { ...DEFAULT_NOTICE_DISPLAY, show: presetShow("photo") } }, ctx);
    expect(short).not.toContain("ขาดอีก");
    expect(short).not.toContain("บริษัท ทดสอบ");
    expect(short).toContain("&lt;b&gt;หน้า&lt;/b&gt;");
  });
  it("JPEG พอดีเนื้อหา = ไม่บังคับสูงเท่ากระดาษ", () => {
    const doc = newNoticeDoc("free");
    expect(buildNoticeHtml(doc, ctx, { forImage: true })).toContain("nt-fit");
    expect(buildNoticeHtml(doc, ctx)).not.toContain("nt-fit");
  });
});

describe("วางจริงแทนค่าประมาณ (เจ้าของขอ 2026-11-17)", () => {
  const L = (parent: string, qty: number) => ({ parent_code: parent, item_id: "cv", item_name: "ผ้าแคนวาส", group_name: "ผ้า", qty, uom: "หลา", piece: false, amount: 10 });
  it("ไซส์ที่มีวางจริงใช้ตัวนั้น · ไซส์อื่นยังเป็นค่าประมาณ · หมายเหตุบอก", () => {
    const ms = noticeMaterialsFromCost([L("S", 1.125), L("M", 1.3)], () => null, { S: { cv: { qty: 1.05, unit: "หลา" } } });
    expect(ms[0].perTab.S).toBe(1.05);
    expect(ms[0].perTab.M).toBeCloseTo(1.3, 4);
    expect(ms[0].note).toContain("วางผ้าจริง");
  });
  it("ไม่มีวางจริง = เหมือนเดิม", () => {
    const ms = noticeMaterialsFromCost([L("S", 1.125)], () => null, {});
    expect(ms[0].perTab.S).toBeCloseTo(1.125, 4);
    expect(ms[0].note).not.toContain("วางผ้าจริง");
  });
});

describe("แบบ need: ต้องใช้ผ้ากี่หลาตามจำนวนสั่ง (เจ้าของขอ 2026-11-17)", () => {
  it("lot มี = ใช้ lot × เผื่อเสีย · ไม่มี = ใช้ต่อใบ × จำนวน", () => {
    const r = computeNotice({ ...EMPTY_CALC, waste_pct: 10, rows: [
      { key: "S", label: "S", use: 1, order: 100, lot: 90 },
      { key: "M", label: "M", use: 2, order: 10 },
    ] });
    expect(r.rows[0].need).toBeCloseTo(99, 6);
    expect(r.rows[0].usePlus).toBeCloseTo(0.99, 6);
    expect(r.rows[1].need).toBeCloseTo(22, 6);
    expect(r.need).toBeCloseTo(121, 6);
  });
  it("noticeLotNeed: ผ้าม้วนวางทั้งล็อต · ไม่มีขนาด = null · cleanNotice เก็บ lot + kind", () => {
    const L = (w: number | null) => ({ parent_code: "S", item_id: "cv", item_name: "ผ้า", group_name: "ผ้า", qty: 0.2, uom: "หลา", piece: false, width_cm: w, length_cm: 50, pieces: 2, face_width_cm: 150, waste_percent: 10, divisor: 90 });
    const lot = noticeLotNeed([L(40)], "cv", "S", "หลา", 100);
    expect(lot).toBeGreaterThan(0);
    expect(noticeLotNeed([L(null)], "cv", "S", "หลา", 100)).toBeNull();
    expect(noticeLotNeed([L(40)], "cv", "S", "หลา", null)).toBeNull();
    const d = cleanNotice({ kind: "need", calc: { rows: [{ key: "S", label: "S", use: 1, order: 5, lot: 4.5 }] } });
    expect(d.kind).toBe("need");
    expect(d.calc.rows[0].lot).toBe(4.5);
    expect(noticeKindMeta("free").key).toBe("free");
  });
  it("ใบพิมพ์: กล่องสรุปปัดขึ้นหลาเต็ม", () => {
    const doc = { ...newNoticeDoc("need"), calc: { ...EMPTY_CALC, rows: [{ key: "S", label: "S", use: 1.01, order: 100 }] } };
    const html = buildNoticeHtml(doc, { sheetCode: "DS", sheetName: "x", brandName: "", company: null, senderName: "", dateText: "" });
    expect(html).toContain("รวมต้องเตรียมผ้า");
    expect(html).toContain("101 หลา");
  });
});

describe("need เก็บเป็น usage + view (ไม่แก้ฐานข้อมูล)", () => {
  it("เขียน/อ่าน ไป-กลับ", () => {
    const d = cleanNotice({ kind: "need", calc: { rows: [] } });
    expect(noticeDbKind(d.kind)).toBe("usage");
    expect(d.calc.view).toBe("need");
    expect(noticeKindFromDb("usage", d.calc)).toBe("need");
    expect(noticeKindFromDb("usage", {})).toBe("usage");
    const u = cleanNotice({ kind: "usage", calc: { view: "need", rows: [] } });   // เปลี่ยนกลับเป็น usage
    expect(u.kind).toBe("usage");
    expect(u.calc.view).toBeUndefined();
  });
});
