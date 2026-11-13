/** Bag CAD รอบ H: CSV รายการตัด/วัสดุ · ไฟล์โปรเจกต์ · เทียบรุ่น · DXF 2 โปรไฟล์อ่านกลับได้ · นำเข้า DXF ที่มีแต่เส้นตัด · ป้ายชิ้น */
import { describe, expect, it } from "vitest";
import { bomCsv, bomRows, buildProjectFile, checkDxf, compareRevisions, csvCell, cutListCsv, parseProjectFile } from "@/lib/pattern-export";
import { buildPatternDxf, dxfAscii, patternPieces, shelfLayout } from "@/lib/pattern-sheet";
import { cutTag, projectPatternLines, type ProjectPiece } from "@/lib/pattern-project";
import { applyCutOnly, parseDxfPattern } from "@/lib/pattern-dxf-import";
import { shapeBox, type Shape } from "@/lib/pattern-shape";
import type { Seam } from "@/lib/pattern-seams";

const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
const piece = (pid: string, name: string, w: number, h: number, extra: Partial<ProjectPiece> = {}): ProjectPiece => ({ pid, name, count: 1, allow: 1, shape: R(w, h), holes: [], grain: null, notches: [], at: [0, 0], ...extra });

describe("CSV", () => {
  it("ช่องที่มี , \" ขึ้นบรรทัด ถูกครอบ · ขึ้นต้น BOM · รายการตัดมีพื้นที่รวม", () => {
    expect(csvCell('ก,ข "ค"')).toBe('"ก,ข ""ค"""');
    const pcs = patternPieces(projectPatternLines([piece("a", "ตัวหน้า", 30, 20, { count: 2, mats: [{ id: "m1", name: "PU ดำ" }] })]));
    const csv = cutListCsv(pcs, { rev: 3, code: "PAT-1" });
    expect(csv.startsWith("﻿")).toBe(true);
    const row = csv.split("\r\n")[1].split(",");
    expect(row[2]).toBe("PU ดำ"); expect(row[6]).toBe("2"); expect(Number(row[7])).toBeCloseTo(32 * 22 * 2, 0); expect(row[10]).toBe("3");
  });
  it("สรุปวัสดุรวมตามวัสดุ · คูณจำนวนผลิต", () => {
    const pcs = patternPieces(projectPatternLines([piece("a", "หน้า", 30, 20, { mats: [{ id: "m1", name: "PU" }] }), piece("b", "ข้าง", 70, 10, { mats: [{ id: "m1", name: "PU" }] })]));
    const b = bomRows(pcs);
    expect(b).toHaveLength(1); expect(b[0].pieces).toBe(2); expect(b[0].area).toBeCloseTo(32 * 22 + 72 * 12, 0);
    expect(bomCsv(pcs, { qty: 100 }).split("\r\n")[1].split(",")[4]).toBe(String(Math.round((b[0].area * 100) / 100) / 100));
  });
});

describe("ไฟล์โปรเจกต์", () => {
  it("ส่งออก → นำเข้า ได้ชิ้น ตะเข็บ ค่าแม่แบบกลับครบ · รุ่นเริ่มใหม่ · ไฟล์สำรองเดิมอ่านได้ · ไฟล์อื่น = null", () => {
    const pieces = [piece("a", "หน้า", 30, 20), piece("b", "หลัง", 30, 20)];
    const seams: Seam[] = [{ id: "s1", a: { pid: "a", from: 1, count: 3, n: 4 }, b: { pid: "b", from: 1, count: 3, n: 4 } }];
    const txt = buildProjectFile({ pattern_no: "PAT-9", name: "ทดสอบ", basis: "box", pieces, seams, template: { rev: 7, matProps: { m1: { stiff: 0.5, thick: 1 } } } });
    const p = parseProjectFile(txt)!;
    expect(p.pieces).toHaveLength(2); expect(p.seams).toHaveLength(1); expect(p.from).toBe("PAT-9");
    expect(p.template?.rev).toBeUndefined(); expect(p.template?.matProps).toBeTruthy();
    expect(parseProjectFile(JSON.stringify({ kind: "pattern-project-backup", name: "x", pieces, seams }))?.pieces).toHaveLength(2);
    expect(parseProjectFile("{}")).toBeNull(); expect(parseProjectFile("ไม่ใช่ json")).toBeNull();
  });
});

describe("เทียบรุ่น", () => {
  it("เปลี่ยนขนาด / เพิ่ม / หาย / เหมือนเดิม", () => {
    const d = compareRevisions([piece("a", "หน้า", 30, 20), piece("b", "หลัง", 30, 20), piece("c", "ข้าง", 70, 10)], [piece("a", "หน้า", 34, 20), piece("b", "หลัง", 30, 20), piece("d", "หู", 50, 5)]);
    const by = Object.fromEntries(d.map((x) => [x.pid, x]));
    expect(by.a.status).toBe("changed"); expect(by.a.dw).toBe(4); expect(by.a.darea).toBe(80);
    expect(by.b.status).toBe("same"); expect(by.d.status).toBe("added"); expect(by.c.status).toBe("removed");
  });
});

describe("DXF", () => {
  const pcs = patternPieces(projectPatternLines([piece("a", "หน้า", 30, 20, { notches: [[15, 20]], info: { pair: true } }), piece("b", "หลัง", 30, 20)]));
  const L = shelfLayout(pcs, 100);
  it("แบบทั่วไป: อ่านกลับได้ครบ ชั้นตามชื่อ + ข้อความรุ่น (อักษรอังกฤษ)", () => {
    const txt = buildPatternDxf(L, { stamp: "rev 3 · 13 พ.ย." });
    const c = checkDxf(txt, 2);
    expect(c.ok).toBe(true); expect(c.layers).toEqual(expect.arrayContaining(["CUT", "SEW", "LABEL"]));
    expect(txt).toContain("rev 3"); expect(txt).not.toMatch(/[฀-๿]/);
  });
  it("AAMA/ASTM: ชั้นเลข 1/14 · 1 ชิ้น = 1 บล็อก · มี Piece Name/Quantity · อ่านกลับได้ครบ", () => {
    const txt = buildPatternDxf(L, { profile: "aama" });
    expect(txt).toContain("BLOCKS"); expect(txt.match(/\nINSERT\n/g)).toHaveLength(2);
    expect(txt).toContain("Piece Name: P1"); expect(txt).toContain("Quantity: 1");
    const c = checkDxf(txt, 2);
    expect(c.ok).toBe(true); expect(c.layers).toEqual(expect.arrayContaining(["1", "14", "15"]));
  });
  it("อักษรไทยถูกตัดออกจากข้อความ DXF · ป้ายวิธีวางตัดไปถึงชิ้นพิมพ์", () => {
    expect(dxfAscii("ตัวหน้า P1")).toBe("P1"); expect(dxfAscii("ไทยล้วน")).toBe("-");
    expect(cutTag({ pair: true, face: "down" })).toBe("คู่ ซ้าย-ขวา · คว่ำหน้า");
    expect(pcs[0].tag).toBe("คู่ ซ้าย-ขวา"); expect(pcs[0].fin).toEqual({ w: 30, h: 20 }); expect(pcs[0].area).toBeCloseTo(32 * 22, 0);
  });
});

describe("นำเข้า DXF ที่มีแต่เส้นตัด", () => {
  // ไฟล์มีแต่เส้นตัด 34 × 24 ซม. (หน่วย มม.) ชั้น CUT
  const txt = ["0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE", "8", "CUT", "90", "4", "70", "1", "10", "0", "20", "0", "10", "340", "20", "0", "10", "340", "20", "240", "10", "0", "20", "240", "0", "ENDSEC", "0", "EOF"].join("\n");
  it("ติดธงมีแต่เส้นตัด · เส้นตัด → หดเข้าเป็นเส้นเย็บ ขนาดตัดเท่าเดิม · เส้นเย็บ → เผื่อออก · ไม่ใส่ = เหมือนเดิม", () => {
    const imp = parseDxfPattern(txt, "mm")!;
    expect(imp.pieces[0].cutOnly).toBe(true);
    const cut = applyCutOnly(imp.pieces, "cut", 0.7).pieces[0];
    expect(shapeBox(cut.shape).w).toBeCloseTo(32.6, 2); expect(cut.allow).toBe(0.7); expect(cut.cutOnly).toBe(false);
    const sew = applyCutOnly(imp.pieces, "sew", 0.7).pieces[0];
    expect(shapeBox(sew.shape).w).toBeCloseTo(34, 2); expect(sew.allow).toBe(0.7);
    expect(applyCutOnly(imp.pieces, "none", 0.7).pieces[0]).toBe(imp.pieces[0]);
  });
});
