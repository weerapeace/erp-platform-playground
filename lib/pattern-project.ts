/**
 * 👜 แพทเทิร์น 1 ใบของแอปสตูดิโอแพทเทิร์น (ตาราง pattern_projects) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   เจ้าของสั่ง 2026-11-10 "ย้าย APP นี้เป็น app หลัก" → แพทเทิร์นเก็บเป็นของตัวเอง ไม่ผูกกับบรรทัดตีราคาของใบงานออกแบบ
 *
 *   pieces = ชิ้นบนกระดาน (รูปทรงแบบ lib/pattern-shape · พิกัดกระดาน ซม. · at = มุมซ้ายบนของเส้นเย็บ)
 *   seams  = ตะเข็บ (lib/pattern-seams) — อ้างชิ้นด้วย pid
 *   cleanProjectPieces / cleanProjectPatch = ตรวจทุกอย่างที่มาจากหน้าจอก่อนลงฐานข้อมูล (รูปผิดรูปแบบ = ทิ้งชิ้นนั้น ไม่เดาให้)
 *   projectSummary = จำนวนชิ้น + พื้นที่ตัดรวม (โชว์ในหน้ารายการ ไม่ต้องเปิดทั้งก้อน)
 *
 * ใช้ที่: app/api/pattern-projects · app/pattern-studio · เทสต์ lib/__tests__/pattern-project.test.ts
 */
import { cleanAllow, cleanShape, edgeAllowances, normalizePiece, pieceGeometry, type Pt, type Shape } from "@/lib/pattern-shape";
import type { PatternLineInput } from "@/lib/pattern-sheet";
import { cleanSeams, type Seam } from "@/lib/pattern-seams";

export const PATTERN_PROJECT_STATUSES = ["draft", "ready", "archived"] as const;
export type PatternProjectStatus = (typeof PATTERN_PROJECT_STATUSES)[number];
export const PATTERN_STATUS_LABEL: Record<PatternProjectStatus, { th: string; en: string; tone: string }> = {
  draft: { th: "กำลังทำ", en: "Draft", tone: "bg-blue-50 text-blue-700" },
  ready: { th: "พร้อมใช้", en: "Ready", tone: "bg-emerald-50 text-emerald-700" },
  archived: { th: "เก็บเข้ากรุ", en: "Archived", tone: "bg-slate-100 text-slate-500" },
};
export const MAX_PROJECT_PIECES = 60;

export type ProjectPiece = {
  pid: string; name: string; count: number; allow: number;
  /** เผื่อเย็บรายขอบ (ครบทุกขอบ · ดู lib/pattern-shape edgeAllowances) — ไม่มี = allow ค่าเดียวทั้งชิ้น */
  allowEdges?: number[];
  shape: Shape; holes: Shape[]; grain: [Pt, Pt] | null; notches: Pt[]; at: [number, number];
};
export type PatternProject = {
  id: string; pattern_no: string | null; name: string; status: PatternProjectStatus; note: string; sku_code: string | null;
  pieces: ProjectPiece[]; seams: Seam[]; basis: "box" | "area"; template: Record<string, unknown> | null;
  piece_count: number; area_cm2: number; owner_name: string | null; updated_by_name: string | null; created_at: string; updated_at: string;
};
export type PatternProjectRow = Omit<PatternProject, "pieces" | "seams" | "template" | "basis" | "note"> & { seam_count: number; thumb: string | null };

const fin = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pt = (v: unknown): Pt | null => { if (!Array.isArray(v) || v.length !== 2) return null; const x = fin(v[0]), y = fin(v[1]); return x == null || y == null ? null : [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]; };

/** ตรวจชิ้นทั้งหมดจากหน้าจอ/ฐานข้อมูล */
export function cleanProjectPieces(raw: unknown): ProjectPiece[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjectPiece[] = [], seen = new Set<string>();
  for (const x of raw.slice(0, MAX_PROJECT_PIECES)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const pid = typeof r.pid === "string" && /^[\w-]{1,48}$/.test(r.pid) ? r.pid : "";
    const shape = cleanShape(r.shape);
    if (!pid || seen.has(pid) || !shape) continue;
    const holes = (Array.isArray(r.holes) ? r.holes : []).map(cleanShape).filter((h): h is Shape => !!h).slice(0, 40);
    const g = Array.isArray(r.grain) && r.grain.length === 2 ? [pt(r.grain[0]), pt(r.grain[1])] : null;
    const notches = (Array.isArray(r.notches) ? r.notches : []).map(pt).filter((n): n is Pt => !!n).slice(0, 200);
    const at = pt(r.at);
    seen.add(pid);
    const allow = cleanAllow(r.allow), per = edgeAllowances(shape, r.allowEdges, allow);
    out.push({
      pid, shape, holes, notches, ...(per ? { allowEdges: per } : {}),
      name: String(r.name ?? "").trim().slice(0, 60),
      count: Math.min(999, Math.max(1, Math.round(fin(r.count) ?? 1))),
      allow,
      grain: g && g[0] && g[1] ? [g[0], g[1]] : null,
      at: at ?? [0, 0],
    });
  }
  return out;
}

/** จำนวนชิ้น (รวมจำนวนตัด) + พื้นที่ตัดรวม ตร.ซม. (basis box = กรอบสี่เหลี่ยม · area = พื้นที่จริงหักรู) */
export function projectSummary(pieces: ProjectPiece[], basis: "box" | "area" = "box"): { pieceCount: number; areaCm2: number } {
  let pieceCount = 0, areaCm2 = 0;
  for (const p of pieces) {
    const g = pieceGeometry({ shape: p.shape, holes: p.holes, allow: p.allow, allowEdges: p.allowEdges });
    pieceCount += p.count;
    areaCm2 += (basis === "box" ? g.cutBox.w * g.cutBox.h : g.cutArea) * p.count;
  }
  return { pieceCount, areaCm2: Math.round(areaCm2 * 100) / 100 };
}

/** ภาพย่อของแพทเทิร์น = เส้นตัดของทุกชิ้นเป็น SVG path เดียว (viewBox ในตัว) — เก็บลงคอลัมน์ thumb ให้หน้ารายการวาดได้เลย */
export function projectThumb(pieces: ProjectPiece[]): string | null {
  if (!pieces.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const polys = pieces.slice(0, 30).map((p) => {
    const g = pieceGeometry({ shape: p.shape, holes: p.holes, allow: p.allow, allowEdges: p.allowEdges });
    for (const [x, y] of g.cut) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [g.cut, ...g.holesCut];
  });
  if (!(x1 > x0) || !(y1 > y0)) return null;
  const f = (v: number) => (Math.round(v * 10) / 10).toString();
  const d = polys.flat().map((P) => "M" + P.map(([x, y]) => `${f(x - x0)} ${f(y - y0)}`).join("L") + "Z").join("");
  const out = `${f(x1 - x0)} ${f(y1 - y0)}|${d}`;
  return out.length > 20000 ? null : out;
}

/** ชิ้นของแพทเทิร์น → "บรรทัด" ของตัวพิมพ์/ส่งออกกลาง (lib/pattern-sheet · PatternPrintView) — ชื่อชิ้นไปอยู่ช่องชื่อ · ตัดกี่ชิ้น = จำนวนของชิ้น */
export function projectPatternLines(pieces: ProjectPiece[], basis: "box" | "area" = "box", group = "ชิ้นแพทเทิร์น"): PatternLineInput[] {
  return pieces.map((p, i) => {
    const n = normalizePiece(p.shape, p.holes, { grain: p.grain, notches: p.notches });
    return {
      key: p.pid, item_name: p.name || `ชิ้น ${i + 1}`, group_name: group, pieces: p.count,
      shape: {
        v: 1, shape: n.shape, basis,
        ...(n.holes.length ? { holes: n.holes } : {}), ...(p.allow ? { allow: p.allow } : {}), ...(p.allowEdges ? { allowEdges: p.allowEdges } : {}),
        ...(n.grain && n.grain.length === 2 ? { grain: n.grain } : {}), ...(n.notches?.length ? { notches: n.notches } : {}),
      },
    };
  });
}

export type ProjectPatch = Partial<{ name: string; status: PatternProjectStatus; note: string; sku_code: string | null; pieces: ProjectPiece[]; seams: Seam[]; basis: "box" | "area"; template: Record<string, unknown> | null }>;
/** ตรวจค่าที่หน้าจอส่งมาแก้ — คืนเฉพาะช่องที่ส่งมาและถูกรูปแบบ · ตะเข็บตรวจเทียบกับชิ้นชุดที่ให้มา (หรือชุดเดิม) */
export function cleanProjectPatch(body: Record<string, unknown>, currentPieces: ProjectPiece[]): { patch: ProjectPatch; error: string | null } {
  const patch: ProjectPatch = {};
  if ("name" in body) { const n = String(body.name ?? "").trim().slice(0, 120); if (!n) return { patch, error: "ใส่ชื่อแพทเทิร์นก่อน" }; patch.name = n; }
  if ("status" in body) { if (!PATTERN_PROJECT_STATUSES.includes(body.status as PatternProjectStatus)) return { patch, error: "สถานะไม่ถูกต้อง" }; patch.status = body.status as PatternProjectStatus; }
  if ("note" in body) patch.note = String(body.note ?? "").slice(0, 4000);
  if ("sku_code" in body) patch.sku_code = String(body.sku_code ?? "").trim().slice(0, 80) || null;
  if ("basis" in body) patch.basis = body.basis === "area" ? "area" : "box";
  if ("template" in body) patch.template = body.template && typeof body.template === "object" && !Array.isArray(body.template) && JSON.stringify(body.template).length < 4000 ? (body.template as Record<string, unknown>) : null;
  if ("pieces" in body) {
    if (!Array.isArray(body.pieces)) return { patch, error: "ข้อมูลชิ้นไม่ถูกรูปแบบ" };
    patch.pieces = cleanProjectPieces(body.pieces);
    if (patch.pieces.length !== Math.min(body.pieces.length, MAX_PROJECT_PIECES)) return { patch, error: "มีชิ้นที่รูปทรงไม่ถูกต้อง บันทึกไม่ได้ ลองย้อนกลับแล้วบันทึกใหม่" };
  }
  if ("seams" in body || patch.pieces) {
    const pids = new Set((patch.pieces ?? currentPieces).map((p) => p.pid));
    patch.seams = cleanSeams("seams" in body ? body.seams : [], pids);
    if (!("seams" in body)) delete patch.seams;   // ส่งมาแต่ชิ้น = ไม่แตะตะเข็บ (หน้าจอส่งคู่กันเสมอ)
  }
  return { patch, error: null };
}
