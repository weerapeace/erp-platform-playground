/**
 * Bag CAD รอบ I3: เทสต์รวมทั้งเส้นทางงาน (integration) — ใช้สูตรจริงทุกตัวต่อกันเหมือนผู้ใช้ทำ
 *   แบบฝึกบทที่ 1 → ตรวจแบบ → ตั้งขนาดบังคับตัวหน้า → ตะเข็บฟ้อง → แก้ชิ้นข้าง → ผ่าน
 *   → ขยายไซซ์ (ตะเข็บทุกไซซ์) → ตัดชิ้นตามเส้น → โค้ช → ไฟล์ตัด DXF อ่านกลับ → CSV → ไฟล์โปรเจกต์ไป-กลับ → วางบนผ้าตามรูปจริง
 */
import { describe, expect, it } from "vitest";
import { lessonById } from "@/lib/pattern-lessons";
import { checkPattern } from "@/lib/pattern-check";
import { checkSeam, pieceEdges, type Seam } from "@/lib/pattern-seams";
import { cutAlongLine, solveConstraints } from "@/lib/pattern-constraints";
import { gradeSeamReport, type GradeSpec } from "@/lib/pattern-grading";
import { coachTips } from "@/lib/pattern-coach";
import { buildProjectFile, checkDxf, compareRevisions, cutListCsv, parseProjectFile } from "@/lib/pattern-export";
import { buildPatternDxf, patternPieces, shelfLayout } from "@/lib/pattern-sheet";
import { projectPatternLines, type ProjectPiece } from "@/lib/pattern-project";
import { nestShapes } from "@/lib/pattern-nest";
import { flattenShape, shapeBox } from "@/lib/pattern-shape";

describe("เส้นทางงานเต็ม: แบบฝึก → ผลิต", () => {
  it("ทุกขั้นต่อกันได้ และผลแต่ละขั้นถูก", () => {
    const seed = lessonById(1)!.seed!();
    let pieces: ProjectPiece[] = seed.pieces.map((p) => ({ ...p, mats: [{ id: "m1", name: "PU ดำ" }] }));
    let seams: Seam[] = seed.seams;
    const ck = (ps: ProjectPiece[], ss: Seam[]) => checkPattern(ps.map((p) => ({ ...p, name: p.name })), ss);
    expect(ck(pieces, seams).filter((x) => x.level === "error")).toEqual([]);

    // 1) ขนาดบังคับ: ตัวหน้ากว้าง 30 (เดิม 26) — ตัวหลังเท่ากัน → ตะเข็บกับชิ้นข้างต้องฟ้อง
    const front = pieces.findIndex((p) => p.pid === "lsF"), back = pieces.findIndex((p) => p.pid === "lsB");
    const fix = (s: ProjectPiece["shape"]) => solveConstraints(s, [{ id: "w", kind: "length", e: 0, v: 30 }, { id: "h0", kind: "horizontal", e: 0 }, { id: "h2", kind: "horizontal", e: 2 }, { id: "v1", kind: "vertical", e: 1 }, { id: "v3", kind: "vertical", e: 3 }, { id: "eq", kind: "equal", e: 0, f: 2 }]);
    const rf = fix(pieces[front].shape), rb = fix(pieces[back].shape);
    expect(rf.ok && rb.ok).toBe(true);
    expect(shapeBox(rf.shape).w).toBeCloseTo(30, 1);
    pieces = pieces.map((p, i) => (i === front ? { ...p, shape: rf.shape } : i === back ? { ...p, shape: rb.shape } : p));
    const bad = ck(pieces, seams).filter((x) => x.code === "seam-mismatch");
    expect(bad.length).toBeGreaterThan(0);
    expect(coachTips({ pieces, seams, issues: ck(pieces, seams) }).some((x) => x.id === "mismatch")).toBe(true);

    // 2) แก้ชิ้นข้างให้ยาวเท่ารอบตัวหน้า (ข้าง + ก้น + ข้าง) → ผ่าน
    const gus = pieces.findIndex((p) => p.pid === "lsG"), need = 24 + 30 + 24, gb = shapeBox(pieces[gus].shape);
    pieces = pieces.map((p, i) => (i === gus ? { ...p, shape: { k: "rect", x: gb.x, y: gb.y, w: need, h: gb.h } } : p));
    expect(ck(pieces, seams).filter((x) => x.code === "seam-mismatch")).toEqual([]);

    // 3) ขยายไซซ์: กฎกลาง +2/+2 → ชิ้นข้างต้อง +6 ถึงจะผ่านทุกไซซ์
    const spec: GradeSpec = { sizes: ["S", "M", "L", "XL"], base: 1, def: { dw: 2, dh: 2, anchor: "c" }, rules: {} };
    expect(gradeSeamReport(pieces, seams, spec).filter((r) => r.bad.length).map((r) => r.size)).toEqual(["S", "L", "XL"]);
    expect(gradeSeamReport(pieces, seams, { ...spec, rules: { lsG: { dw: 6, dh: 0 } } }).every((r) => r.bad.length === 0)).toBe(true);

    // 4) ตัดตัวหลังเป็น 2 ชิ้นตามเส้นกลาง → พื้นที่รวมเท่าเดิม ขอบตัดยาวเท่ากัน
    const bb = shapeBox(pieces[back].shape), cut = cutAlongLine(pieces[back].shape, [bb.x + bb.w / 2, bb.y - 1], [bb.x + bb.w / 2, bb.y + bb.h + 1])!;
    expect(cut).toBeTruthy();
    expect(pieceEdges(cut.left)[cut.cutEdge[0]].len).toBeCloseTo(bb.h, 3);
    const halves: ProjectPiece[] = [{ ...pieces[back], pid: "lsB1", shape: cut.left }, { ...pieces[back], pid: "lsB2", shape: cut.right }];
    const cutSeam: Seam = { id: "cut", a: { pid: "lsB1", from: cut.cutEdge[0], count: 1, n: pieceEdges(cut.left).length }, b: { pid: "lsB2", from: cut.cutEdge[1], count: 1, n: pieceEdges(cut.right).length }, rev: true };
    expect(checkSeam(new Map([["lsB1", cut.left], ["lsB2", cut.right]]), cutSeam).status).toBe("ok");
    const pieces2 = [...pieces.filter((p) => p.pid !== "lsB"), ...halves];
    const seams2 = [...seams.filter((s) => s.a.pid !== "lsB" && s.b.pid !== "lsB"), cutSeam];

    // 5) ไฟล์ตัด DXF (ทั้ง 2 โปรไฟล์) อ่านกลับได้ครบชิ้น · CSV รายการตัด
    const pcs = patternPieces(projectPatternLines(pieces2, undefined, undefined, { seams: seams2 }));
    const L = shelfLayout(pcs, 120);
    for (const profile of ["named", "aama"] as const) { const c = checkDxf(buildPatternDxf(L, { profile }), pcs.length); expect(c.ok).toBe(true); }
    expect(cutListCsv(pcs).split("\r\n").filter(Boolean)).toHaveLength(pcs.length + 1);

    // 6) ไฟล์โปรเจกต์ไป-กลับ: ชิ้น/ตะเข็บ/กฎไซซ์ครบ · เทียบรุ่น = เหมือนเดิมทุกชิ้น
    const file = buildProjectFile({ name: "เวิร์กโฟลว์", pieces: pieces2, seams: seams2, template: { grading: spec } });
    const back2 = parseProjectFile(file)!;
    expect(back2.pieces).toHaveLength(pieces2.length); expect(back2.seams).toHaveLength(seams2.length); expect(back2.template?.grading).toEqual(spec);
    expect(compareRevisions(pieces2, back2.pieces).every((d) => d.status === "same")).toBe(true);

    // 7) วางบนผ้าตามรูปจริง: ผลิต 5 ใบ บนผ้ากว้าง 110 ซม.
    const items = pcs.map((p) => ({ key: p.id, label: p.id, outline: p.outline ?? flattenShape({ k: "rect", x: 0, y: 0, w: p.w, h: p.h }, 8), qty: p.count * 5, rot: "grain" as const }));
    const n = nestShapes(items, { width: 110, gap: 0.5 });
    expect(n.ok).toBe(true); expect(n.places).toHaveLength(items.reduce((s, i) => s + i.qty, 0)); expect(n.length).toBeGreaterThan(0);
  });
});
