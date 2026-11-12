/**
 * 🎓 บทเรียน "เรียนไปทำไป" ของสตูดิโอแพทเทิร์น (Bag CAD รอบ C · 2026-11-12)
 *   แต่ละบท = เป้าหมาย + ขั้นตอนที่ต้องลงมือทำในกระดานจริง + ตัวตรวจผลจากรูปชิ้น/ตะเข็บจริง (ไม่ใช่แค่กด Next · ไม่ใช้ AI ตัดสิน)
 *   ตัวตรวจคิดใหม่ทุกครั้งที่งานเปลี่ยน → กด Ctrl+Z จนผลไม่ตรง ขั้นนั้นกลับเป็นยังไม่ผ่านเอง
 *   ใบ้ 3 ระดับ: แนวคิด → บอกเครื่องมือ → ทำให้ดู (สั่งผ่านคำสั่งเดียวกับกระดาน ย้อนกลับได้ด้วย Ctrl+Z)
 *   seed = ชิ้น/ตะเข็บตั้งต้นของ "แบบฝึก" (สร้างเป็นแพทเทิร์นใหม่ ไม่แตะงานจริง) · ตัวตรวจทุกตัวทำงานกับงานของผู้ใช้ได้ด้วย (เรียนบนสำเนางานตัวเอง)
 *   บท 6–12 อยู่ในสารบัญแต่ยังเปิดไม่ได้ (บอกว่ามาในรอบไหน) — ห้ามมีปุ่มที่กดแล้วไม่เกิดผล
 * ใช้ที่: components/pattern-studio/learn-panel · เทสต์ lib/__tests__/pattern-lessons.test.ts
 */
import { checkSeam, pieceEdges, sidePoints, type Seam } from "./pattern-seams";
import { edgeAllowances, pieceGeometry, roundCorners, shapeBox, type Pt, type Shape } from "./pattern-shape";
import { selfCrosses } from "./pattern-check";
import type { ProjectPiece } from "./pattern-project";

export const LESSON_VERSION = 1;
export type Txt = { th: string; en: string };
const T = (th: string, en: string): Txt => ({ th, en });
/** ชิ้นที่ตัวตรวจอ่าน (ส่วนหนึ่งของชิ้นบนกระดาน) */
export type LessonPiece = { pid: string; name: string; shape: Shape; holes?: Shape[]; allow: number; allowEdges?: number[] | null };
/** สิ่งที่ตัวตรวจเห็น: ชิ้น · ตะเข็บ · ชิ้นที่เลือก · เหตุการณ์ที่ผู้ใช้ทำ (เลือกชิ้น / คลิก 3D / เปิดเครื่องมือ) · ค่าคลาดตะเข็บ */
export type LessonCtx = { pieces: LessonPiece[]; seams: Seam[]; selPid: string | null; events: Set<string>; tol: number };
export type StepState = { ok: boolean; msg?: Txt };
/** พาไปที่เครื่องมือ: tool = ปุ่มเครื่องมือบนกระดาน · el = ส่วนของแผงขวา (data-guide) · select = เลือกชิ้นเป้าหมายก่อน · seam = เปิดตะเข็บล่าสุดในเครื่องมือแก้ตะเข็บ · panel = แผงของสตูดิโอ */
export type Guide = { tool?: string; el?: string; select?: boolean; seam?: boolean; panel?: "check" | "pieces"; unit?: boolean; view3d?: boolean };
/** ทำให้ดู: เพิ่มชิ้น · แก้ชิ้น · ตั้งตะเข็บทั้งชุด — ส่งเข้ากระดานผ่านคำสั่งปกติ (ย้อนได้) */
export type LessonDemo = { add?: { shape: Shape; name: string; allow?: number }[]; patch?: { pid: string; shape?: Shape; allow?: number; allowEdges?: number[] | null }[]; seams?: Seam[] };
export type LessonStep = { text: Txt; guide?: Guide; hints: [Txt, Txt, Txt]; check: (c: LessonCtx, L: (cm: number) => string) => StepState; demo?: (c: LessonCtx) => LessonDemo | null };
export type Lesson = {
  id: number; title: Txt; goal: Txt; pass: Txt; why: Txt; minutes: number;
  /** false = ยังเปิดไม่ได้ (มาในรอบไหน) */ ready: boolean; round?: string;
  /** บทนี้แก้รูปชิ้น — เรียนบนสำเนาเท่านั้น */ edits: boolean;
  seed?: () => { pieces: ProjectPiece[]; seams: Seam[] };
  steps: LessonStep[];
};

/* ── ตัวช่วย ── */
const R = (w: number, h: number): Shape => ({ k: "rect", x: 0, y: 0, w, h });
const seedPiece = (pid: string, name: string, shape: Shape, at: [number, number], extra: Partial<ProjectPiece> = {}): ProjectPiece => ({ pid, name, count: 1, allow: 0, shape, holes: [], grain: null, notches: [], at, ...extra });
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
const boxOf = (p: LessonPiece) => shapeBox(p.shape);
/** ชิ้นที่ขนาดใกล้ w × h ที่สุด (กลับด้านได้) */
export function closestPiece(pieces: LessonPiece[], w: number, h: number): LessonPiece | null {
  let best: LessonPiece | null = null, d = Infinity;
  for (const p of pieces) { const b = boxOf(p), x = Math.min(Math.abs(b.w - w) + Math.abs(b.h - h), Math.abs(b.w - h) + Math.abs(b.h - w)); if (x < d) { d = x; best = p; } }
  return best;
}
const sizeOk = (p: LessonPiece | null, w: number, h: number) => { if (!p) return false; const b = boxOf(p); return (near(b.w, w) && near(b.h, h)) || (near(b.w, h) && near(b.h, w)); };
/** รัศมีมุมมนของชิ้นสี่เหลี่ยมมุมมน (ซม.) — คิดจากขอบตรงที่เหลือ: กว้าง − 2r · ไม่ใช่มุมมนครบ 4 มุม = null */
export function cornerRadius(shape: Shape): { corners: number; r: number[] } {
  const E = pieceEdges(shape), b = shapeBox(shape);
  const curved = E.filter((e) => e.pts.length > 2);
  const r = E.filter((e) => e.pts.length === 2).map((e) => { const [p, q] = [e.pts[0], e.pts[1]]; const horiz = Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]); return ((horiz ? b.w : b.h) - e.len) / 2; });
  return { corners: curved.length, r };
}
/** ตะเข็บบิดไหม: จุดปลายที่เย็บชนกัน (ตามทิศของตะเข็บ) อยู่ไกลกว่าแบบไขว้ = บิด (ดูจากตำแหน่งชิ้นบนกระดาน) */
export function seamTwisted(pieces: LessonPiece[], s: Seam): boolean | null {
  const A = pieces.find((p) => p.pid === s.a.pid), B = pieces.find((p) => p.pid === s.b.pid);
  const pa = A ? sidePoints(A.shape, s.a) : null, pb = B ? sidePoints(B.shape, s.b) : null;
  if (!pa || !pb || pa.length < 2 || pb.length < 2) return null;
  const d = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const a0 = pa[0], a1 = pa[pa.length - 1], b0 = s.rev ? pb[pb.length - 1] : pb[0], b1 = s.rev ? pb[0] : pb[pb.length - 1];
  return d(a0, b0) + d(a1, b1) > d(a0, b1) + d(a1, b0) + 1e-6;
}
const lastCrossSeam = (c: LessonCtx): Seam | null => [...c.seams].reverse().find((s) => s.a.pid !== s.b.pid && !s.a.inner && !s.b.inner) ?? null;
/** ชิ้นเป้าหมายของบทเผื่อเย็บ: ชิ้นที่เลือก → ไม่งั้นชิ้นแรก */
/** เผื่อเย็บของทุกขอบ (รายขอบ ถ้ามี · ไม่งั้นค่าเดียวทั้งชิ้น) */
const edgeAllowancesOf = (shape: Shape, per: number[] | null | undefined, allow: number): number[] => edgeAllowances(shape, per ?? null, allow) ?? pieceEdges(shape).map(() => allow);
const targetPiece = (c: LessonCtx) => c.pieces.find((p) => p.pid === c.selPid) ?? c.pieces[0] ?? null;

/* ── ชิ้นตั้งต้นของแบบฝึก ── */
const bagSeed = () => {
  const open = [{ open: true }, {}, {}, {}];
  return {
    pieces: [
      seedPiece("lsF", "ตัวหน้า", R(26, 24), [1, 1], { allow: 0.7, edgeMeta: open }),
      seedPiece("lsB", "ตัวหลัง", R(26, 24), [30, 1], { allow: 0.7, edgeMeta: open }),
      seedPiece("lsG", "ชิ้นข้าง", R(74, 8), [1, 29], { allow: 0.7, edgeMeta: [{}, { open: true }, {}, { open: true }] }),
    ],
    seams: [
      { id: "lsS1", a: { pid: "lsF", from: 1, count: 3, n: 4 }, b: { pid: "lsG", from: 0, count: 1, n: 4 } },
      { id: "lsS2", a: { pid: "lsB", from: 1, count: 3, n: 4 }, b: { pid: "lsG", from: 2, count: 1, n: 4 } },
    ] as Seam[],
  };
};

export const LESSONS: Lesson[] = [
  {
    id: 1, minutes: 5, ready: true, edits: false,
    title: T("รู้จักพื้นที่ทำงาน", "Get to know the workspace"),
    goal: T("เลือกชิ้นบนกระดาน แล้วให้ภาพ 3 มิติเลือกตาม · เปิดไม้บรรทัด · เปิดแผงตรวจแบบ", "Select a piece on the board and see it in 3D · open the ruler · open the check panel"),
    pass: T("เลือกชิ้นเดียวกันข้ามกระดานกับภาพ 3 มิติได้", "The same piece is selected on the board and in 3D"),
    why: T("ช่างทำแพทเทิร์นสลับดูชิ้นแบน (2D) กับกระเป๋าที่เย็บแล้ว (3D) ตลอด — ชิ้นเดียวกันคือข้อมูลเดียวกัน แก้ฝั่งไหนอีกฝั่งเปลี่ยนตาม", "Pattern makers keep switching between flat pieces (2D) and the sewn bag (3D) — it's one set of data, edit either side and the other follows"),
    seed: bagSeed,
    steps: [
      { text: T("คลิกชิ้นใดก็ได้บนกระดาน (ฝั่งที่มีตาราง)", "Click any piece on the board (the side with the grid)"), guide: { tool: "move" },
        hints: [T("ชิ้นที่เลือกจะเปลี่ยนเป็นสีส้ม และแผงขวาจะโชว์ข้อมูลของชิ้น", "The selected piece turns orange and the right panel shows its details"), T("ถือเครื่องมือ ย้าย (V) แล้วคลิกบนชิ้น", "Hold the Move tool (V) and click on a piece"), T("กด 'พาไปที่เครื่องมือ' แล้วคลิกชิ้นตัวหน้า", "Press 'Show me the tool', then click the front piece")],
        check: (c) => ({ ok: c.events.has("sel") }) },
      { text: T("คลิกชิ้นในภาพ 3 มิติ แล้วดูว่ากระดานเลือกชิ้นเดียวกันตาม", "Click a piece in the 3D view and watch the board select the same piece"), guide: { view3d: true },
        hints: [T("ภาพ 3 มิติกับกระดานใช้ชิ้นชุดเดียวกัน", "The 3D view and the board share the same pieces"), T("ลากในภาพ 3 มิติเพื่อหมุน · คลิกบนผิวกระเป๋าเพื่อเลือกชิ้น", "Drag in the 3D view to rotate · click the bag surface to pick a piece"), T("คลิกด้านหน้าของกระเป๋าในภาพ 3 มิติ — ตัวหน้าบนกระดานจะเป็นสีส้ม", "Click the front of the bag in 3D — the front piece on the board turns orange")],
        check: (c) => ({ ok: c.events.has("pick-3d") }) },
      { text: T("เปิดไม้บรรทัด (M) แล้วลากวัดความกว้างของตัวหน้า", "Open the ruler (M) and drag across the front piece to measure it"), guide: { tool: "measure" },
        hints: [T("วัดก่อนแก้ทุกครั้ง — ตัวเลขบนไม้บรรทัดเป็นหน่วยที่เลือกไว้", "Measure before you change things — the ruler uses your chosen unit"), T("ปุ่มรูปไม้บรรทัดบนแถบเครื่องมือซ้าย หรือกด M", "The ruler button on the left toolbar, or press M"), T("กด M แล้วลากจากขอบซ้ายไปขอบขวาของตัวหน้า", "Press M, then drag from the left to the right edge of the front piece")],
        check: (c) => ({ ok: c.events.has("tool:measure") }) },
      { text: T("เปิดแผง 'ตรวจแบบ' แล้วอ่านว่ายังขาดอะไร", "Open the 'Check' panel and read what's still missing"), guide: { panel: "check" },
        hints: [T("ระบบตรวจแบบจากชิ้นจริงตลอด — สีแดงต้องแก้ก่อนผลิต สีเหลืองควรดู", "The pattern is checked from the real pieces all the time — red must be fixed before production, yellow is worth a look"), T("ปุ่ม 'ตรวจแบบ' บนแถบสตูดิโอ", "The 'Check' button on the studio bar"), T("กด 'ตรวจแบบ' แล้วกดแถว 'ยังไม่เลือกวัสดุ' เพื่อไปที่ชิ้นนั้น", "Press 'Check', then click a 'no material' row to jump there")],
        check: (c) => ({ ok: c.events.has("panel:check") }) },
    ],
  },
  {
    id: 2, minutes: 5, ready: true, edits: true,
    title: T("ชิ้นแรก", "Your first piece"),
    goal: T("สร้างสี่เหลี่ยมขนาด 200 × 150 มม.", "Make a 200 × 150 mm rectangle"),
    pass: T("มีชิ้นขนาด 200 × 150 มม. จริง (วัดจากเส้นเย็บ)", "A piece really measures 200 × 150 mm (on the sew line)"),
    why: T("ขนาดในแพทเทิร์นคือ 'ขนาดสำเร็จ' ที่เส้นเย็บ — เผื่อเย็บจะเพิ่มออกไปข้างนอกทีหลัง ไม่รวมในตัวเลขนี้", "Pattern sizes are the finished size at the sew line — the seam allowance is added outside later and isn't part of this number"),
    seed: () => ({ pieces: [], seams: [] }),
    steps: [
      { text: T("วาดสี่เหลี่ยม 1 ชิ้น", "Draw one rectangle"), guide: { tool: "rect" },
        hints: [T("ชิ้นแพทเทิร์นส่วนใหญ่เริ่มจากสี่เหลี่ยม แล้วค่อยแก้รูป", "Most pattern pieces start as a rectangle and get reshaped"), T("เครื่องมือสี่เหลี่ยม (R) แล้วลากบนกระดาน", "The Rectangle tool (R), then drag on the board"), T("กด 'ทำให้ดู' — ระบบวาดให้ 1 ชิ้น (กด Ctrl+Z เพื่อลองเอง)", "Press 'Show me' — a piece is drawn for you (Ctrl+Z to try yourself)")],
        check: (c) => ({ ok: c.pieces.length > 0 }),
        demo: () => ({ add: [{ shape: { k: "rect", x: 2, y: 2, w: 20, h: 15 }, name: "ชิ้นแรก" }] }) },
      { text: T("ทำให้ขนาดเป็น 200 × 150 มม. พอดี", "Make it exactly 200 × 150 mm"), guide: { el: "size", select: true },
        hints: [T("ลากด้วยมือได้ใกล้ ๆ แต่ขนาดผลิตต้องพิมพ์ตัวเลข", "Dragging gets close, but production sizes are typed"), T("คลิกชิ้น → แผงขวา 'ขนาดสำเร็จ' พิมพ์ กว้าง 200 · สูง 150 แล้วกด Enter", "Click the piece → right panel 'Finished size': type W 200, H 150 and press Enter"), T("กด 'ทำให้ดู' — ระบบตั้งขนาดให้ชิ้นที่ใกล้ที่สุด", "Press 'Show me' — the closest piece is resized for you")],
        check: (c, L) => {
          const p = closestPiece(c.pieces, 20, 15);
          if (sizeOk(p, 20, 15)) return { ok: true };
          if (!p) return { ok: false };
          const b = boxOf(p);
          return { ok: false, msg: T(`ชิ้นที่ใกล้ที่สุดตอนนี้ ${L(b.w)} × ${L(b.h)} — ต้องการ ${L(20)} × ${L(15)}`, `The closest piece is ${L(b.w)} × ${L(b.h)} — needs ${L(20)} × ${L(15)}`) };
        },
        demo: (c) => { const p = closestPiece(c.pieces, 20, 15); if (!p) return { add: [{ shape: { k: "rect", x: 2, y: 2, w: 20, h: 15 }, name: "ชิ้นแรก" }] }; const b = boxOf(p); return { patch: [{ pid: p.pid, shape: { k: "rect", x: b.x, y: b.y, w: 20, h: 15 } }] }; } },
    ],
  },
  {
    id: 3, minutes: 8, ready: true, edits: true,
    title: T("ขอบและมุม", "Edges and corners"),
    goal: T("ขยายกว้างเป็น 250 มม. (สูง 150) แล้วทำมุมมนรัศมี 10 มม. ทุกมุม", "Widen to 250 mm (height 150), then round every corner to a 10 mm radius"),
    pass: T("ขนาด 250 × 150 มม. และมุมมนรัศมี 10 มม. ครบ 4 มุม", "250 × 150 mm with all 4 corners at a 10 mm radius"),
    why: T("มุมมนเย็บง่ายกว่าและไม่ย่นที่มุม แต่ต้องปรับขนาดก่อน — ถ้าทำมุมก่อนแล้วยืดชิ้น มุมจะยืดเป็นวงรี", "Rounded corners sew more easily and don't pucker, but resize first — stretch a piece after rounding and the corners turn oval"),
    seed: () => ({ pieces: [seedPiece("ls3", "ชิ้นแรก", R(20, 15), [2, 2])], seams: [] }),
    steps: [
      { text: T("ปรับกว้างเป็น 250 มม. (สูงคง 150 มม.)", "Change the width to 250 mm (keep the height at 150 mm)"), guide: { el: "size", select: true },
        hints: [T("แก้ด้วยตัวเลข ไม่ใช่ลากด้วยสายตา", "Change it with numbers, not by eye"), T("แผงขวา 'ขนาดสำเร็จ' ช่องกว้าง พิมพ์ 250 (หรือ 200+50) แล้ว Enter", "Right panel 'Finished size', W field: type 250 (or 200+50) and press Enter"), T("กด 'ทำให้ดู' — ระบบตั้งเป็น 250 × 150 มม.", "Press 'Show me' — it's set to 250 × 150 mm")],
        check: (c, L) => { const p = closestPiece(c.pieces, 25, 15); if (sizeOk(p, 25, 15)) return { ok: true }; if (!p) return { ok: false }; const b = boxOf(p); return { ok: false, msg: T(`ตอนนี้ ${L(b.w)} × ${L(b.h)} — ต้องการ ${L(25)} × ${L(15)}`, `Now ${L(b.w)} × ${L(b.h)} — needs ${L(25)} × ${L(15)}`) }; },
        demo: (c) => { const p = closestPiece(c.pieces, 25, 15); if (!p) return null; const b = boxOf(p); return { patch: [{ pid: p.pid, shape: { k: "rect", x: b.x, y: b.y, w: 25, h: 15 } }] }; } },
      { text: T("ทำมุมมนรัศมี 10 มม. ทุกมุม", "Round every corner to a 10 mm radius"), guide: { el: "round", select: true },
        hints: [T("รัศมีคือระยะจากมุมเดิมถึงจุดที่เส้นเริ่มโค้ง", "The radius is how far from the old corner the curve starts"), T("แผงขวา หัวข้อ 'มุมโค้ง' ใส่ 10 แล้วกด 'ลบมุม'", "Right panel 'Round': enter 10 and press the round button"), T("กด 'ทำให้ดู' — ระบบทำมุมมน 10 มม. ให้ (กด Ctrl+Z เพื่อลองเอง)", "Press 'Show me' — corners are rounded to 10 mm (Ctrl+Z to try yourself)")],
        check: (c, L) => {
          const p = closestPiece(c.pieces, 25, 15);
          if (!p) return { ok: false };
          const k = cornerRadius(p.shape);
          if (k.corners === 0) return { ok: false, msg: T("ยังไม่มีมุมมน", "No rounded corners yet") };
          if (k.corners !== 4) return { ok: false, msg: T(`มุมมน ${k.corners} มุม — ต้องครบ 4 มุมพอดี`, `${k.corners} rounded corners — needs exactly 4`) };
          const bad = k.r.filter((r) => !near(r, 1));
          return bad.length ? { ok: false, msg: T(`รัศมีตอนนี้ ${L(k.r[0] ?? 0)} — ต้องการ ${L(1)} (ถ้ายืดชิ้นหลังทำมุม มุมจะเพี้ยน: ย้อนแล้วปรับขนาดก่อน)`, `Radius is ${L(k.r[0] ?? 0)} — needs ${L(1)} (resizing after rounding distorts it: undo and resize first)`) } : { ok: true };
        },
        demo: (c) => { const p = closestPiece(c.pieces, 25, 15); if (!p) return null; const b = boxOf(p); return { patch: [{ pid: p.pid, shape: roundCorners({ k: "rect", x: b.x, y: b.y, w: b.w, h: b.h }, 1) }] }; } },
    ],
  },
  {
    id: 4, minutes: 8, ready: true, edits: true,
    title: T("เผื่อเย็บ", "Seam allowance"),
    goal: T("ทำขอบเผื่อเย็บ 7 มม. ให้ครบทุกขอบของชิ้น", "Give every edge of the piece a 7 mm seam allowance"),
    pass: T("เส้นตัดห่างเส้นเย็บ 7 มม. ทุกขอบ ปิดและไม่ตัดกันเอง", "The cut line is 7 mm outside the sew line on every edge, closed and not crossing itself"),
    why: T("จักรเดินห่างขอบผ้าเท่ากันทุกด้าน — ถ้าขอบหนึ่งเผื่อแคบกว่า ตะเข็บจะกินเนื้อกระเป๋า ขนาดสำเร็จเล็กกว่าที่ออกแบบ", "The machine stitches the same distance from every edge — if one edge has less allowance, the seam eats into the bag and the finished size shrinks"),
    seed: () => ({ pieces: [seedPiece("ls4", "ตัวหน้า", roundCorners({ k: "rect", x: 0, y: 0, w: 25, h: 15 }, 1), [2, 2], { allow: 0.5, allowEdges: [0.5, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7] })], seams: [] }),
    steps: [
      { text: T("เลือกชิ้นที่จะทำเผื่อเย็บ", "Select the piece to give an allowance"), guide: { tool: "move", select: true },
        hints: [T("เผื่อเย็บตั้งทีละชิ้น หรือทีละขอบ", "Allowance is set per piece, or per edge"), T("คลิกชิ้นบนกระดาน", "Click the piece on the board"), T("กด 'พาไปที่เครื่องมือ' — ระบบเลือกชิ้นให้", "Press 'Show me the tool' — the piece gets selected")],
        check: (c) => ({ ok: !!c.selPid && c.pieces.some((p) => p.pid === c.selPid) }) },
      { text: T("ตั้งเผื่อเย็บ 7 มม. ทุกขอบ", "Set a 7 mm allowance on every edge"), guide: { el: "allow", select: true },
        hints: [T("เผื่อเย็บอยู่นอกเส้นเย็บ (เส้นประ) — เส้นทึบด้านนอกคือเส้นที่ตัดจริง", "The allowance sits outside the sew line (dashed) — the solid outer line is where you cut"), T("แผงขวา 'เผื่อพับ / เผื่อเย็บ' พิมพ์ 7 แล้ว Enter · ถ้าบางขอบต่างกัน เปิด 'เผื่อรายขอบ' แก้ทีละขอบ", "Right panel 'Fold / seam allowance': type 7 and press Enter · if some edges differ, open per-edge allowance"), T("กด 'ทำให้ดู' — ตั้ง 7 มม. ทุกขอบให้", "Press 'Show me' — 7 mm is set on every edge")],
        check: (c, L) => {
          const p = targetPiece(c);
          if (!p) return { ok: false };
          const vals = edgeAllowancesOf(p.shape, p.allowEdges, p.allow);
          const bad = vals.map((v, i) => ({ v, i })).filter((x) => !near(x.v, 0.7, 0.005));
          if (!bad.length) return { ok: true };
          if (bad.length === vals.length && bad.every((x) => near(x.v, bad[0].v, 0.005))) return { ok: false, msg: T(`ทุกขอบยังเป็น ${L(bad[0].v)} — ต้องการ ${L(0.7)}`, `Every edge is still ${L(bad[0].v)} — needs ${L(0.7)}`) };
          const list = bad.slice(0, 4).map((x) => `${x.i + 1} (${L(x.v)})`).join(", ");
          return { ok: false, msg: T(`ขอบ ${list} ยังไม่ใช่ ${L(0.7)} · อีก ${vals.length - bad.length} ขอบเป็น ${L(0.7)} แล้ว — เปิด 'เผื่อรายขอบ' แล้วแก้ขอบนั้น`, `Edge ${list} isn't ${L(0.7)} yet · ${vals.length - bad.length} edges are ${L(0.7)} already — open per-edge allowance and fix that edge`) };
        },
        demo: (c) => { const p = targetPiece(c); return p ? { patch: [{ pid: p.pid, allow: 0.7, allowEdges: null }] } : null; } },
      { text: T("ตรวจว่าเส้นตัดปิดและไม่ตัดกันเอง", "Check the cut line is closed and doesn't cross itself"),
        hints: [T("มุมแคบ ๆ + เผื่อเย็บกว้าง = เส้นตัดอาจพันกันเอง", "Tight corners + wide allowance can make the cut line loop over itself"), T("ดูเส้นทึบรอบชิ้น ต้องเป็นวงเดียวเรียบ ๆ", "Look at the solid line around the piece — it should be one smooth loop"), T("ถ้าพันกัน ลดเผื่อเย็บตรงมุมนั้น", "If it loops, reduce the allowance at that corner")],
        check: (c) => {
          const p = targetPiece(c);
          if (!p) return { ok: false };
          const vals = edgeAllowancesOf(p.shape, p.allowEdges, p.allow);
          if (!vals.some((v) => v > 0)) return { ok: false, msg: T("ยังไม่มีเผื่อเย็บ — เส้นตัดยังทับเส้นเย็บ", "No allowance yet — the cut line still sits on the sew line") };
          const g = pieceGeometry({ shape: p.shape, holes: p.holes ?? [], allow: p.allow, allowEdges: p.allowEdges ?? null });
          return selfCrosses(g.cut) ? { ok: false, msg: T("เส้นตัดตัดกันเอง — ลดเผื่อเย็บตรงมุมแคบ", "The cut line crosses itself — reduce the allowance at the tight corner") } : { ok: true };
        } },
    ],
  },
  {
    id: 5, minutes: 10, ready: true, edits: true,
    title: T("เย็บสองชิ้น", "Sew two pieces"),
    goal: T("เย็บขอบล่างของตัวหน้ากับขอบบนของแถบก้น ให้ยาวเท่ากันและไม่บิด", "Sew the front's bottom edge to the base strip's top edge — equal length, not twisted"),
    pass: T("มีตะเข็บถูกขอบ ยาวเท่ากัน และทิศไม่บิด", "A seam on the right edges, equal in length and not twisted"),
    why: T("ตะเข็บ = บอกว่าขอบไหนเย็บติดขอบไหน และปลายไหนชนปลายไหน — ถ้าทิศกลับ ตอนเย็บจริงผ้าจะบิดเป็นเกลียว", "A seam says which edge joins which, and which end meets which — reverse it and the real fabric twists when sewn"),
    seed: () => ({ pieces: [seedPiece("ls5a", "ตัวหน้า", R(20, 12), [2, 2], { allow: 0.7 }), seedPiece("ls5b", "แถบก้น", R(20, 5), [2, 17], { allow: 0.7 })], seams: [] }),
    steps: [
      { text: T("ใช้เครื่องมือเย็บ (N): คลิกขอบล่างของตัวหน้า แล้วคลิกขอบบนของแถบก้น", "Use Sew (N): click the front's bottom edge, then the strip's top edge"), guide: { tool: "sew" },
        hints: [T("คลิกขอบแรก ระบบโชว์ความยาว · ชี้ขอบที่สองจะเห็นความต่างก่อนกด", "Click the first edge to see its length · hover the second to see the difference before clicking"), T("ปุ่มรูปเข็มด้ายท้ายแถบเครื่องมือซ้าย หรือกด N", "The needle-and-thread button at the end of the left toolbar, or press N"), T("กด 'ทำให้ดู' — ระบบเย็บสองขอบนี้ให้ (ทิศถูกแล้ว)", "Press 'Show me' — the two edges get sewn (the right way round)")],
        check: (c) => ({ ok: !!lastCrossSeam(c) }),
        demo: (c) => { const a = c.pieces.find((p) => p.pid === "ls5a"), b = c.pieces.find((p) => p.pid === "ls5b"); if (!a || !b) return null; const na = pieceEdges(a.shape).length, nb = pieceEdges(b.shape).length; if (na !== 4 || nb !== 4) return null; return { seams: [...c.seams.filter((s) => !(new Set([s.a.pid, s.b.pid]).has("ls5a") && new Set([s.a.pid, s.b.pid]).has("ls5b"))), { id: `ls5s${Date.now().toString(36)}`, a: { pid: "ls5a", from: 2, count: 1, n: 4 }, b: { pid: "ls5b", from: 0, count: 1, n: 4 }, rev: true }] }; } },
      { text: T("ตรวจว่าสองด้านยาวเท่ากัน", "Check both sides are the same length"),
        hints: [T("ด้านที่ยาวไม่เท่ากัน = ตอนเย็บจะเหลือผ้า หรือต้องรูด", "Unequal sides leave extra fabric, or need gathering"), T("ดูตัวเลขในรายการตะเข็บของแผงขวา (เครื่องมือแก้ตะเข็บ B)", "Read the numbers in the seam list in the right panel (Edit sewing, B)"), T("ถ้าต่าง ให้แก้ความยาวขอบในค่าของขอบ หรือเลือกขอบใหม่", "If they differ, change the edge length in the edge settings, or reselect the edges")],
        check: (c, L) => {
          const s = lastCrossSeam(c);
          if (!s) return { ok: false };
          const k = checkSeam(new Map(c.pieces.map((p) => [p.pid, p.shape])), s, c.tol);
          if (k.status === "ok" || (k.status === "mismatch" && s.ease)) return { ok: true };
          return { ok: false, msg: k.status === "broken" ? T("ตะเข็บอ้างขอบที่เปลี่ยนไป — เย็บใหม่", "The seam points at changed edges — sew it again") : T(`ต่างกัน ${L(k.diff)} — เลือกขอบที่ยาวเท่ากัน`, `${L(k.diff)} apart — pick edges of equal length`) };
        } },
      { text: T("ตรวจทิศ: ปลายซ้ายต้องชนปลายซ้าย — ถ้าบิด กด 'กลับทิศ'", "Check the direction: left end to left end — if twisted, press 'Reverse'"), guide: { seam: true, el: "seam-rev" },
        hints: [T("ขอบล่างของตัวหน้าเดินจากขวาไปซ้าย ขอบบนของแถบก้นเดินจากซ้ายไปขวา — เย็บตรง ๆ จะไขว้กัน", "The front's bottom edge runs right-to-left and the strip's top runs left-to-right — joined as-is they cross"), T("เครื่องมือแก้ตะเข็บ (B) → การ์ดตะเข็บ → ปุ่ม 'กลับทิศ'", "Edit sewing (B) → the seam card → 'Reverse'"), T("กด 'ทำให้ดู' — ระบบกลับทิศให้ แล้วดูเส้นประโยงที่ไม่ไขว้กันแล้ว", "Press 'Show me' — the direction is flipped; the dashed links no longer cross")],
        check: (c) => { const s = lastCrossSeam(c); if (!s) return { ok: false }; const tw = seamTwisted(c.pieces, s); return tw === null ? { ok: false } : tw ? { ok: false, msg: T("ตะเข็บบิด: ปลายด้านแรกไปชนปลายตรงข้ามของอีกด้าน — กด 'กลับทิศ'", "Twisted: one end meets the opposite end of the other side — press 'Reverse'") } : { ok: true }; },
        demo: (c) => { const s = lastCrossSeam(c); return s ? { seams: c.seams.map((x) => (x.id === s.id ? (x.rev ? { ...x, rev: undefined } : { ...x, rev: true }) : x)) } : null; } },
    ],
  },
  ...([
    [6, "กระเป๋าทรงกล่อง", "Box bag", "F"], [7, "วัสดุ", "Materials", "G"], [8, "ซิปและซับใน", "Zip and lining", "F"], [9, "ช่องโชว์", "Display window", "F"],
    [10, "เตรียมผลิต", "Prepare for production", "H"], [11, "ลอกแบบ", "Trace a pattern", "I"], [12, "โครงงาน", "Your own bag", "I"],
  ] as const).map(([id, th, en, round]): Lesson => ({
    id, minutes: 10, ready: false, round, edits: true, title: T(th, en), goal: T("", ""), pass: T("", ""), why: T("", ""), steps: [],
  })),
];

export const lessonById = (id: number) => LESSONS.find((l) => l.id === id) ?? null;
/** ผลตรวจทั้งบท: แต่ละขั้นผ่านไหม · ขั้นปัจจุบัน = ขั้นแรกที่ยังไม่ผ่าน · ครบทุกขั้น = done */
export function evalLesson(lesson: Lesson, c: LessonCtx, L: (cm: number) => string): { steps: StepState[]; current: number; done: boolean } {
  const steps = lesson.steps.map((s) => { try { return s.check(c, L); } catch { return { ok: false }; } });
  const i = steps.findIndex((s) => !s.ok);
  return { steps, current: i < 0 ? steps.length - 1 : i, done: steps.length > 0 && i < 0 };
}

/* ── ความคืบหน้า (เก็บต่อคน แยกจากข้อมูลแพทเทิร์น · useUserPref "pattern_lessons") ── */
export type LessonRec = { st: "doing" | "done" | "skip"; at: string; pid?: string; ver: number };
export type LessonProgress = { v: 1; lessons: Record<string, LessonRec> };
export const EMPTY_PROGRESS: LessonProgress = { v: 1, lessons: {} };
export function cleanProgress(raw: unknown): LessonProgress | null {
  const r = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (!r || r.v !== 1 || !r.lessons || typeof r.lessons !== "object") return null;
  const out: Record<string, LessonRec> = {};
  for (const [k, v] of Object.entries(r.lessons as Record<string, unknown>)) {
    const x = v && typeof v === "object" ? v as Record<string, unknown> : null;
    if (!x || !lessonById(Number(k))) continue;
    if (x.st !== "doing" && x.st !== "done" && x.st !== "skip") continue;
    out[k] = { st: x.st, at: typeof x.at === "string" ? x.at : new Date(0).toISOString(), ver: Number(x.ver) || 1, ...(typeof x.pid === "string" && /^[0-9a-f-]{36}$/i.test(x.pid) ? { pid: x.pid } : {}) };
  }
  return { v: 1, lessons: out };
}
/** บทที่ควรทำก่อน (บทก่อนหน้าที่เปิดได้และยังไม่ผ่าน) — ไม่บังคับ แค่เตือน */
export function missingBefore(id: number, p: LessonProgress): number[] {
  return LESSONS.filter((l) => l.ready && l.id < id && p.lessons[String(l.id)]?.st !== "done").map((l) => l.id);
}
