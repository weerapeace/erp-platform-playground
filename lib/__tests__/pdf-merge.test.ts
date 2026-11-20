import { describe, expect, it } from "vitest";
import {
  A4, defaultMergeName, finalRotation, fitImageOnA4, groupRuns, mergeSummary, mergedFileName, moveRun, pagesForFile, removeRun,
  rotateBy, rotateRun, runPageLabel, sourceKindOf, usedFileIds, type MergePage,
} from "@/lib/pdf-merge";

const A = pagesForFile("A", 3);
const B = pagesForFile("B", 2);
const C = pagesForFile("C", 1);
const ids = (ps: MergePage[]) => ps.map((p) => p.id).join(" ");

describe("sourceKindOf", () => {
  it("รู้จัก PDF และรูป ทั้งจากชนิดไฟล์และนามสกุล", () => {
    expect(sourceKindOf("a.pdf", "")).toBe("pdf");
    expect(sourceKindOf("scan", "application/pdf")).toBe("pdf");
    expect(sourceKindOf("x.JPG", "")).toBe("image");
    expect(sourceKindOf("x.heic", "")).toBe("image");
    expect(sourceKindOf("x", "image/png")).toBe("image");
    expect(sourceKindOf("x.docx", "application/vnd.openxmlformats")).toBeNull();
  });
});

describe("groupRuns / moveRun", () => {
  const all = [...A, ...B, ...C];
  it("จับหน้าที่ติดกันจากไฟล์เดียวเป็นก้อน", () => {
    expect(groupRuns(all).map((r) => [r.fileId, r.start, r.end])).toEqual([["A", 0, 3], ["B", 3, 5], ["C", 5, 6]]);
  });
  it("ย้ายก้อนแบบแทรก ไม่ใช่สลับคู่", () => {
    expect(ids(moveRun(all, 0, 2))).toBe("B:0 B:1 C:0 A:0 A:1 A:2");
    expect(ids(moveRun(all, 2, 0))).toBe("C:0 A:0 A:1 A:2 B:0 B:1");
  });
  it("ตำแหน่งผิด = ไม่เปลี่ยน", () => {
    expect(moveRun(all, 1, 1)).toBe(all);
    expect(moveRun(all, 0, 9)).toBe(all);
  });
  it("ไฟล์เดียวถูกแยกคนละที่ = หลายก้อน แล้วย้ายก้อนได้", () => {
    const split = [A[0], ...B, A[1], A[2]];
    expect(groupRuns(split).length).toBe(3);
    expect(ids(moveRun(split, 2, 0))).toBe("A:1 A:2 A:0 B:0 B:1");
  });
  it("ย้ายก้อนแล้วจำนวนหน้าเท่าเดิม (ไม่หาย/ไม่ซ้ำ)", () => {
    for (let f = 0; f < 3; f++) for (let t = 0; t < 3; t++) {
      const out = moveRun(all, f, t);
      expect([...out.map((p) => p.id)].sort()).toEqual([...all.map((p) => p.id)].sort());
    }
  });
});

describe("removeRun / rotateRun", () => {
  const all = [...A, ...B];
  it("เอาก้อนออกทั้งก้อน", () => expect(ids(removeRun(all, 0))).toBe("B:0 B:1"));
  it("หมุนทุกหน้าในก้อน ก้อนอื่นไม่เปลี่ยน", () => {
    const out = rotateRun(all, 1);
    expect(out.map((p) => p.rotation)).toEqual([0, 0, 0, 90, 90]);
    expect(rotateRun(out, 1, 270).map((p) => p.rotation)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("rotation", () => {
  it("วนครบ 360 แล้วกลับ 0", () => {
    expect(rotateBy(270)).toBe(0);
    expect(rotateBy(0, -90)).toBe(270);
  });
  it("มุมเดิมในไฟล์ + ที่หมุนเพิ่ม", () => {
    expect(finalRotation(90, 90)).toBe(180);
    expect(finalRotation(270, 180)).toBe(90);
    expect(finalRotation(-90, 0)).toBe(270);
  });
});

describe("runPageLabel", () => {
  it("บอกช่วงหน้าเป็นภาษาคน", () => {
    const all = [...A, ...B];
    expect(runPageLabel(all, groupRuns(all)[0], 3)).toBe("ทั้งไฟล์ · 3 หน้า");
    const part = [A[1], A[2], ...B];
    expect(runPageLabel(part, groupRuns(part)[0], 3)).toBe("หน้า 2–3 จาก 3");
    const one = [A[2]];
    expect(runPageLabel(one, groupRuns(one)[0], 3)).toBe("หน้า 3 จาก 3");
    const gap = [A[0], A[2]];
    expect(runPageLabel(gap, groupRuns(gap)[0], 3)).toBe("2 หน้า จาก 3");
    expect(runPageLabel(C, groupRuns(C)[0], 1)).toBe("1 หน้า");
  });
});

describe("mergedFileName", () => {
  it("ตัดอักขระต้องห้าม + ต่อ .pdf", () => {
    expect(mergedFileName("ใบเสนอ/ราคา: 01")).toBe("ใบเสนอ-ราคา- 01.pdf");
    expect(mergedFileName("abc.PDF")).toBe("abc.pdf");
    expect(mergedFileName("   ")).toBe("รวมเอกสาร.pdf");
    expect(mergedFileName("...")).toBe("รวมเอกสาร.pdf");
  });
  it("ชื่อเริ่มต้นตามวันที่", () => {
    expect(defaultMergeName(new Date(2026, 10, 5))).toBe("รวมเอกสาร-2026-11-05");
  });
});

describe("fitImageOnA4", () => {
  it("รูปแนวตั้ง = A4 แนวตั้ง · รูปอยู่ในขอบ", () => {
    const f = fitImageOnA4(1000, 2000);
    expect(f.pageW).toBe(A4.w);
    expect(f.w).toBeLessThanOrEqual(A4.w - 36 + 1e-6);
    expect(f.h).toBeLessThanOrEqual(A4.h - 36 + 1e-6);
    expect(f.w / f.h).toBeCloseTo(0.5);
  });
  it("รูปแนวนอน = A4 แนวนอน · อยู่กลางหน้า", () => {
    const f = fitImageOnA4(3000, 1000);
    expect(f.pageW).toBe(A4.h);
    expect(f.x + f.w / 2).toBeCloseTo(f.pageW / 2);
    expect(f.y + f.h / 2).toBeCloseTo(f.pageH / 2);
  });
});

describe("summary", () => {
  it("นับไฟล์ที่ยังมีหน้าอยู่", () => {
    const ps = [A[0], ...C];
    expect(mergeSummary(ps)).toEqual({ files: 2, pages: 2 });
    expect([...usedFileIds(ps)]).toEqual(["A", "C"]);
  });
});
