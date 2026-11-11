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
import { cleanAllow, cleanFoldEdges, cleanInnerLines, cleanShape, edgeAllowances, normalizePiece, pieceGeometry, type InnerLine, type Pt, type Shape } from "@/lib/pattern-shape";
import type { PatternLineInput } from "@/lib/pattern-sheet";
import { cleanPieceLink, type PieceLink } from "@/lib/pattern-link";
import { SEAM_KINDS, checkSeam, cleanEdgeMeta, cleanSeams, isPartialSide, pieceEdges, seamLabel, sideRange, type EdgeMeta, type Seam, type SeamSide } from "@/lib/pattern-seams";

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
  /** ขอบที่พับเข้าใน (1 ค่าต่อขอบ · 1 = พับ) — ไม่มี = ไม่มีขอบพับ */
  foldEdges?: number[];
  /** งานขอบรายขอบ: กุ้นขอบ / เดินด้ายทับ (1 ค่าต่อขอบ) — ไม่มี = ไม่ได้ตั้ง */
  edgeMeta?: EdgeMeta[];
  shape: Shape; holes: Shape[]; grain: [Pt, Pt] | null; notches: Pt[]; at: [number, number];
  /** วัสดุของชิ้น (รหัสวัสดุตีราคา design_price_items + ชื่อ/ชนิด ณ ตอนเลือก) — 1 ชิ้นตัดจากหลายวัสดุได้ (เช่น หนัง + ซับใน) · ไม่มี = ยังไม่เลือก */
  mats?: PieceMaterial[];
  /** ค่าของชิ้นแบบ CLO (รหัส · ชนิด · แผ่นเสริม · ปาดขอบ · แข็งอยู่ทรง) — ไม่มี = ไม่ได้ตั้ง */
  info?: PieceInfo;
  /** เส้นในชิ้น (แนวเย็บ / ช่องเจาะ / แนวพับ / ตำแหน่ง · พิกัดเดียวกับ shape) — ไม่มี = ไม่มีเส้นใน */
  inner?: InnerLine[];
  /** ชิ้นตาม: รูปเส้นรอบมาจากชิ้นต้นแบบ (lib/pattern-link) — ไม่มี = ชิ้นอิสระ */
  link?: PieceLink;
};
/** ชนิดชิ้น */
export type PieceRole = "body" | "lining" | "reinforce" | "part";
export const PIECE_ROLES: { key: PieceRole; th: string; en: string }[] = [
  { key: "body", th: "ตัวกระเป๋า", en: "Body" }, { key: "lining", th: "ซับใน", en: "Lining" },
  { key: "reinforce", th: "ตัวเสริม", en: "Reinforcement" }, { key: "part", th: "อะไหล่ / ชิ้นประกอบ", en: "Trim / part" },
];
/** แผ่นเสริมที่ติดกับชิ้น — add = ความอยู่ทรงที่เพิ่ม · min = อยู่ทรงอย่างน้อยเท่านี้ (ค่าประมาณให้เห็นภาพ ไม่ใช่ค่าวัดจริง) */
export type BondKind = "fusible" | "foam" | "board";
export const BOND_KINDS: { key: BondKind; th: string; en: string; add: number; min: number }[] = [
  { key: "fusible", th: "ผ้ากาว", en: "Fusible interfacing", add: 0.2, min: 0 },
  { key: "foam", th: "โฟม / ฟองน้ำ", en: "Foam", add: 0.15, min: 0.5 },
  { key: "board", th: "กระดาษแข็ง / แผ่นรอง", en: "Board", add: 0, min: 0.9 },
];
export type PieceInfo = { code?: string; role?: PieceRole; bond?: BondKind; skive?: number; solid?: boolean };
export function cleanPieceInfo(raw: unknown): PieceInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>, out: PieceInfo = {};
  const code = typeof r.code === "string" ? r.code.trim().slice(0, 30) : "";
  if (code) out.code = code;
  if (PIECE_ROLES.some((x) => x.key === r.role)) out.role = r.role as PieceRole;
  if (BOND_KINDS.some((x) => x.key === r.bond)) out.bond = r.bond as BondKind;
  const sk = fin(r.skive);
  if (sk != null && sk >= 1 && sk <= 50) out.skive = Math.round(sk * 10) / 10;
  if (r.solid === true) out.solid = true;
  return Object.keys(out).length ? out : null;
}

/** ค่าของวัสดุในแพทเทิร์นใบนี้ (แบบ Fabric ของ CLO แต่ย่อ): ความอยู่ทรง 0–1 · ความหนา มม. · สีในภาพ 3D — เก็บใน template.matProps (ไม่แตะข้อมูลวัสดุกลาง) */
export type MatProps = { preset?: string; stiff: number; thick: number; color?: string };
/** ชุดค่าสำเร็จ — ค่าประมาณจากลักษณะวัสดุทั่วไป ให้ช่างปรับตามของจริง */
export const MAT_PRESETS: { key: string; th: string; en: string; stiff: number; thick: number }[] = [
  { key: "pu", th: "หนัง PU / หนังเทียม", en: "PU leather", stiff: 0.7, thick: 1.2 },
  { key: "leather", th: "หนังแท้หนา", en: "Thick leather", stiff: 0.8, thick: 1.8 },
  { key: "canvas", th: "แคนวาสหนา", en: "Heavy canvas", stiff: 0.55, thick: 0.8 },
  { key: "nylon", th: "ไนลอน / โพลีเอสเตอร์", en: "Nylon / polyester", stiff: 0.25, thick: 0.4 },
  { key: "lining", th: "ผ้าซับใน", en: "Lining fabric", stiff: 0.12, thick: 0.3 },
  { key: "pvc", th: "แผ่นใส PVC", en: "Clear PVC", stiff: 0.6, thick: 0.5 },
];
export function cleanMatProps(raw: unknown): Record<string, MatProps> {
  const out: Record<string, MatProps> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) {
    if (!v || typeof v !== "object" || id.length > 80) continue;
    const r = v as Record<string, unknown>, stiff = fin(r.stiff), thick = fin(r.thick);
    if (stiff == null || thick == null) continue;
    const m: MatProps = { stiff: Math.min(1, Math.max(0, Math.round(stiff * 100) / 100)), thick: Math.min(20, Math.max(0.1, Math.round(thick * 10) / 10)) };
    if (typeof r.preset === "string" && MAT_PRESETS.some((x) => x.key === r.preset)) m.preset = r.preset;
    if (typeof r.color === "string" && /^#[0-9a-fA-F]{6}$/.test(r.color)) m.color = r.color.toLowerCase();
    out[id] = m;
  }
  return out;
}
/**
 * ความอยู่ทรงของชิ้น (0 นิ่ม – 1 แข็ง) ที่ตัวจำลองใช้ + เหตุผลภาษาคน
 *   แข็งอยู่ทรง = 1 · ไม่งั้นเริ่มจากวัสดุแรกที่ตั้งค่าไว้ (ไม่มี = ค่ากลางที่ส่งมา) แล้วบวกแผ่นเสริม
 */
export function pieceStiffness(p: ProjectPiece, matProps: Record<string, MatProps>, fallback: number): { s: number; why: string } {
  if (p.info?.solid) return { s: 1, why: "ตั้งให้แข็งอยู่ทรง" };
  const m = (p.mats ?? []).find((x) => matProps[x.id]);
  let s = m ? matProps[m.id].stiff : fallback, why = m ? `วัสดุ ${m.name}` : "ยังไม่ได้ตั้งค่าวัสดุ (ใช้ค่ากลาง)";
  const b = BOND_KINDS.find((x) => x.key === p.info?.bond);
  if (b) { s = Math.max(b.min, Math.min(1, s + b.add)); why += ` + ${b.th}`; }
  return { s: Math.round(Math.min(1, Math.max(0, s)) * 100) / 100, why };
}
/** แถวของ "รายละเอียดชิ้น" ในใบพิมพ์ (เฉพาะชิ้นที่ตั้งค่าอะไรไว้) */
export type PieceRow = { piece: string; code: string; role: string; bond: string; skive: number | null; solid: boolean };
export function projectPieceRows(pieces: ProjectPiece[]): PieceRow[] {
  return pieces.flatMap((p, k) => (p.info ? [{
    piece: p.name || `ชิ้น ${k + 1}`, code: p.info.code ?? "", role: PIECE_ROLES.find((x) => x.key === p.info?.role)?.th ?? "",
    bond: BOND_KINDS.find((x) => x.key === p.info?.bond)?.th ?? "", skive: p.info.skive ?? null, solid: !!p.info.solid,
  }] : []));
}
export type PieceMaterial = { id: string; name: string; group?: string };
export const NO_MATERIAL = "ยังไม่เลือกวัสดุ";
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
    const fold = cleanFoldEdges(shape, r.foldEdges), meta = cleanEdgeMeta(shape, r.edgeMeta), info = cleanPieceInfo(r.info), inner = cleanInnerLines(r.inner), link = cleanPieceLink(r.link);
    const mats: PieceMaterial[] = [];
    for (const m of (Array.isArray(r.mats) ? r.mats : []).slice(0, 8)) {
      const o = m as Record<string, unknown> | null;
      const mid = typeof o?.id === "string" ? o.id.slice(0, 80) : "", nm = String(o?.name ?? "").trim().slice(0, 120), grp = String(o?.group ?? "").trim().slice(0, 80);
      if (mid && nm && !mats.some((y) => y.id === mid)) mats.push({ id: mid, name: nm, ...(grp ? { group: grp } : {}) });
    }
    out.push({
      pid, shape, holes, notches, ...(per ? { allowEdges: per } : {}), ...(fold ? { foldEdges: fold } : {}), ...(meta ? { edgeMeta: meta } : {}), ...(mats.length ? { mats } : {}), ...(info ? { info } : {}), ...(inner.length ? { inner } : {}), ...(link && link.to !== pid ? { link } : {}),
      name: String(r.name ?? "").trim().slice(0, 60),
      count: Math.min(999, Math.max(1, Math.round(fin(r.count) ?? 1))),
      allow,
      grain: g && g[0] && g[1] ? [g[0], g[1]] : null,
      at: at ?? [0, 0],
    });
  }
  // การผูก: ต้นแบบต้องมีอยู่จริงและไม่ใช่ชิ้นตามของใคร (ห้ามผูกเป็นทอด) — ไม่งั้นทิ้งการผูก (รูปคงเดิม)
  const byPid = new Map(out.map((p) => [p.pid, p]));
  return out.map((p) => { if (!p.link) return p; const m = byPid.get(p.link.to); if (m && !m.link) return p; const { link: _l, ...rest } = p; void _l; return rest; });
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
  return pieces.flatMap((p, i) => {
    const n = normalizePiece(p.shape, p.holes, { grain: p.grain, notches: p.notches, inner: p.inner });
    const pieceName = p.name || `ชิ้น ${i + 1}`;
    const shape = (withName: boolean) => ({
      v: 1, shape: n.shape, basis, ...(withName ? { name: pieceName } : {}),
      ...(n.holes.length ? { holes: n.holes } : {}), ...(p.allow ? { allow: p.allow } : {}), ...(p.allowEdges ? { allowEdges: p.allowEdges } : {}), ...(p.foldEdges ? { foldEdges: p.foldEdges } : {}),
      ...(n.grain && n.grain.length === 2 ? { grain: n.grain } : {}), ...(n.notches?.length ? { notches: n.notches } : {}), ...(n.inner?.length ? { inner: n.inner } : {}),
    });
    // 1 ชิ้น × 1 วัสดุ = 1 บรรทัด (ตัดจากวัสดุนั้น) · ยังไม่เลือกวัสดุ = บรรทัดเดียว ชื่อชิ้นเป็นชื่อบรรทัด
    const note = p.info?.code || null;   // รหัสชิ้นออกในช่องหมายเหตุของตารางชิ้น
    if (!p.mats?.length) return [{ key: p.pid, item_name: pieceName, group_name: group, material: NO_MATERIAL, pieces: p.count, note, shape: shape(false) }];
    return p.mats.map((m) => ({ key: `${p.pid}:${m.id}`, item_name: m.name, group_name: m.group || group, material: m.name, pieces: p.count, note, shape: shape(true) }));
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
  if ("template" in body) patch.template = body.template && typeof body.template === "object" && !Array.isArray(body.template) && JSON.stringify(body.template).length < 12000 ? (body.template as Record<string, unknown>) : null;
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

/** แถวของ "ตารางตะเข็บ" ในใบพิมพ์: ตะเข็บไหน เย็บขอบไหนกับขอบไหน ยาวเท่าไร วิธีเย็บ เดินด้ายทับ */
export type SeamRow = { label: string; name: string; a: string; b: string; la: number | null; lb: number | null; status: "ok" | "mismatch" | "broken"; diff: number; kind: string; top: string; rev: boolean; ease: boolean };
const pieceTitle = (pieces: ProjectPiece[], pid: string) => { const k = pieces.findIndex((p) => p.pid === pid); return k < 0 ? "?" : pieces[k].name || `ชิ้น ${k + 1}`; };
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
/** ชื่อด้านของตะเข็บในใบพิมพ์ — เย็บบางช่วง = บอกช่วง (ซม. จากจุดเริ่มของขอบ) */
const sideTitle = (pieces: ProjectPiece[], x: SeamSide) => {
  if (x.inner) { const l = pieces.find((p) => p.pid === x.pid)?.inner?.find((q) => q.id === x.inner); return `${pieceTitle(pieces, x.pid)} · เส้นใน${l?.name ? ` ${l.name}` : ""}`; }
  const base = `${pieceTitle(pieces, x.pid)} · ${x.count > 1 ? `ขอบ ${x.from + 1}–${((x.from + x.count - 1) % x.n) + 1}` : `ขอบ ${x.from + 1}`}`;
  const shape = pieces.find((p) => p.pid === x.pid)?.shape, r = shape && isPartialSide(x) ? sideRange(shape, x) : null;
  return r ? `${base} ช่วง ${f1(r.t0)}–${f1(r.t1)} ซม.` : base;
};
export function projectSeamRows(pieces: ProjectPiece[], seams: Seam[]): SeamRow[] {
  const shapes = new Map(pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner }]));
  return seams.map((x, i) => {
    const c = checkSeam(shapes, x);
    return {
      label: seamLabel(i), name: x.name ?? "", a: sideTitle(pieces, x.a), b: sideTitle(pieces, x.b), la: c.la, lb: c.lb, status: c.status, diff: c.diff, rev: !!x.rev, ease: !!x.ease,
      kind: SEAM_KINDS.find((k) => k.key === x.kind)?.th ?? "",
      top: x.top ? `ห่าง ${x.top.off} มม. · ${x.top.rows} แถว · ${x.top.spi} ฝีเข็ม/นิ้ว` : "",
    };
  });
}
/** แถวของ "งานขอบ" ในใบพิมพ์: ขอบที่พับ / กุ้น / เดินด้ายทับ (ขอบธรรมดาไม่ออก) */
export type EdgeRow = { piece: string; edge: number; len: number; allow: number; fold: boolean; bind: boolean; top: number | null };
export function projectEdgeRows(pieces: ProjectPiece[]): EdgeRow[] {
  const out: EdgeRow[] = [];
  for (const [k, p] of pieces.entries()) {
    const E = pieceEdges(p.shape);
    for (const e of E) {
      const fold = !!p.foldEdges?.[e.i], m = p.edgeMeta?.[e.i];
      if (!fold && !m?.bind && m?.top == null) continue;
      out.push({ piece: p.name || `ชิ้น ${k + 1}`, edge: e.i + 1, len: Math.round(e.len * 10) / 10, allow: p.allowEdges?.[e.i] ?? p.allow, fold, bind: !!m?.bind, top: m?.top ?? null });
    }
  }
  return out;
}
