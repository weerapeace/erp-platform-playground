/**
 * 👝 ตัวช่วยงานข้างในกระเป๋า: สร้างซับในจากตัวนอก + เพิ่มช่องใส่ของ / ช่องซิป — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   สตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11 "ทำซับในข้างในด้วย มีช่องใส่ของ ช่องซิป" · ดูภาพตัวอย่างแล้วสั่ง "ทำตามแบบนี้")
 *
 *   liningPlan  = คัดลอกชิ้นตัวกระเป๋า (แผ่นหน้า/หลัง + ชิ้นคั่นกลาง) เป็นชิ้นชั้นซับใน ขนาดเท่าตัวนอก พร้อมตะเข็บชุดเดียวกัน
 *                 (ไม่ย่อขนาดให้ — ย่อแล้วขอบที่เย็บคู่กันจะยาวไม่เท่ากัน · ช่างปรับเผื่อ/ขนาดเองทีหลังได้)
 *                 ไม่สร้างตะเข็บ "ปากซับในกับปากตัวนอก" ให้ เพราะจะกินขอบปากทั้งขอบ ทำให้เย็บโคนหูบางช่วงบนขอบปากไม่ได้ — ระบบถือว่าซับในเย็บกับตัวนอกรอบปาก
 *   pocketPlan  = ช่อง 1 ช่องบนชิ้นที่เลือก (กึ่งกลางซ้ายขวา · ต่ำจากขอบบนของชิ้นตามที่ตั้ง):
 *                 ช่องใส่ของ = เส้นใน "แนวเย็บ" รูปตัว U 3 ด้าน + ชิ้นปะ (ขอบบนพับ 2 ซม.) + ตะเข็บ 1 แนว (3 ขอบของชิ้นปะ กับเส้นใน)
 *                 ช่องซิป    = เส้นใน "ช่องเจาะ" ยาวเท่าซิป + ถุงช่องซิป (กว้างกว่าซิปข้างละ 1 ซม. · ยาว 2 เท่าของความลึก มีแนวพับครึ่ง) + ตะเข็บ 1 แนว (ช่วงกลางขอบบนของถุง กับช่องเจาะ)
 *
 * ใช้ที่: components/pattern-studio · เทสต์ lib/__tests__/pattern-lining.test.ts · คู่มือ: docs/pattern-studio.md
 */
import { pieceEdges, sideHasEdge, type Seam, type SeamSide } from "@/lib/pattern-seams";
import { shapeBox, type Box, type InnerLine, type Shape } from "@/lib/pattern-shape";

export const POCKET_HEM = 2;        // พับปากช่องใส่ของ (ซม.)
export const ZIP_BAG_MARGIN = 1;    // ถุงช่องซิปกว้างกว่าซิปข้างละเท่านี้ (ซม.)
export const LINING_GAP = 6;        // ชุดซับในวางใต้ชิ้นทั้งหมดบนกระดาน ห่างเท่านี้ (ซม.)

export type LiningPlan = {
  /** รหัสชิ้นตัวนอก → รหัสชิ้นซับในที่สร้างใหม่ */
  map: Record<string, string>;
  /** ชิ้นซับในวางต่ำกว่าชิ้นต้นทางเท่านี้ (ซม.) — ชุดซับในอยู่ใต้ชิ้นทั้งหมด เรียงเหมือนชุดตัวนอก */
  dy: number;
  seams: Seam[];
};
/** วางแผนสร้างซับใน: body = รหัสชิ้นตัวกระเป๋าที่จะคัดลอก (แผ่นหน้า/หลัง + ชิ้นคั่นกลาง) · all = ชิ้นทั้งหมดบนกระดาน (ไว้หาที่ว่างด้านล่าง) */
export function liningPlan(all: { pid: string; shape: Shape }[], seams: Seam[], body: string[], stamp: string): LiningPlan {
  const ids = [...new Set(body)].filter((pid) => all.some((p) => p.pid === pid));
  const map: Record<string, string> = {};
  ids.forEach((pid, i) => { map[pid] = `ln${stamp}x${i}`; });
  let bottom = -Infinity, top = Infinity;
  for (const p of all) { const b = shapeBox(p.shape); bottom = Math.max(bottom, b.y + b.h); if (map[p.pid]) top = Math.min(top, b.y); }
  const side = (s: SeamSide): SeamSide => ({ ...s, pid: map[s.pid] });
  const copies: Seam[] = seams.filter((s) => map[s.a.pid] && map[s.b.pid]).map((s, i) => ({
    id: `s${stamp}l${i}`, a: side(s.a), b: side(s.b), ...(s.rev ? { rev: true } : {}), ...(s.kind ? { kind: s.kind } : {}), ...(s.ease ? { ease: true } : {}),
  }));
  return { map, dy: Number.isFinite(bottom) && Number.isFinite(top) ? Math.round((bottom - top + LINING_GAP) * 10) / 10 : 0, seams: copies };
}

/** ขอบของชิ้นที่ยังไม่ได้เย็บกับอะไร (ลำดับขอบ) — ไว้บอกว่าขอบไหนคือ "ปาก" */
export function freeEdges(pid: string, shape: Shape, seams: Seam[]): number[] {
  const E = pieceEdges(shape);
  return E.map((e) => e.i).filter((i) => !seams.some((s) => [s.a, s.b].some((x) => x.pid === pid && x.n === E.length && sideHasEdge(x, i))));
}

export type PocketKind = "patch" | "zip";
/** w = กว้างของช่องใส่ของ / ความยาวซิป · depth = ลึกของช่อง / ลึกของถุงช่องซิป · top = ปากช่อง (หรือซิป) ต่ำจากขอบบนของชิ้นที่ติด */
export type PocketOpts = { kind: PocketKind; w: number; depth: number; top: number };
export type PocketWarn = "too-wide" | "past-bottom";
export type PocketPlan = {
  /** เส้นในที่เพิ่มบนชิ้นที่ติด (พิกัดกระดาน) */
  line: InnerLine;
  /** ชิ้นใหม่ (รูปเริ่มที่ 0,0) */
  piece: { name: string; shape: Shape; allowEdges?: number[]; foldEdges?: number[]; inner?: InnerLine[] };
  /** ด้านของชิ้นใหม่ที่เย็บกับเส้นใน */
  side: { from: number; count: number; n: number; t0?: number; t1?: number };
  warnings: PocketWarn[];
};
const r1 = (v: number) => Math.round(v * 10) / 10;
/** วางแผนเพิ่มช่อง 1 ช่องบนชิ้นที่ติด — host = กรอบเส้นเย็บของชิ้นนั้นบนกระดาน */
export function pocketPlan(host: Box, o: PocketOpts, stamp: string): PocketPlan {
  const w = r1(Math.max(2, o.w)), depth = r1(Math.max(2, o.depth)), top = r1(Math.max(0, o.top));
  const cx = host.x + host.w / 2, y = host.y + top, x0 = r1(cx - w / 2), x1 = r1(cx + w / 2);
  const warnings: PocketWarn[] = [];
  if (w > host.w - 1) warnings.push("too-wide");
  if (top + depth > host.h - 0.5) warnings.push("past-bottom");
  if (o.kind === "patch") {
    return {
      line: { id: `il${stamp}p`, kind: "sew", name: "ช่องใส่ของ", pts: [[x1, y], [x1, r1(y + depth)], [x0, r1(y + depth)], [x0, y]] },
      piece: { name: "ช่องใส่ของ", shape: { k: "rect", x: 0, y: 0, w, h: depth }, allowEdges: [POCKET_HEM, 0, 0, 0], foldEdges: [1, 0, 0, 0] },
      side: { from: 1, count: 3, n: 4 },                         // ขอบขวา → ล่าง → ซ้าย ของชิ้นปะ (ขอบบน = ปากช่อง ไม่เย็บ)
      warnings,
    };
  }
  const bw = r1(w + 2 * ZIP_BAG_MARGIN);
  return {
    line: { id: `il${stamp}z`, kind: "slit", name: "ช่องซิป", pts: [[x0, y], [x1, y]] },
    piece: { name: "ถุงช่องซิป", shape: { k: "rect", x: 0, y: 0, w: bw, h: r1(depth * 2) }, inner: [{ id: `il${stamp}f`, kind: "fold", name: "พับครึ่ง", pts: [[0, depth], [bw, depth]] }] },
    side: { from: 0, count: 1, n: 4, t0: ZIP_BAG_MARGIN, t1: r1(ZIP_BAG_MARGIN + w) },   // ช่วงกลางของขอบบนของถุง ยาวเท่าซิป
    warnings,
  };
}
