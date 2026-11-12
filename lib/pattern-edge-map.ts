/**
 * 🧭 จับคู่ขอบเก่า → ขอบใหม่ เมื่อรูปชิ้นเปลี่ยนจำนวนขอบ (แบ่งขอบ / เพิ่มจุด / ลบจุด) — ของกลางของสตูดิโอแพทเทิร์น
 *   ปัญหาเดิม: ตะเข็บจำขอบเป็น "ลำดับขอบ + จำนวนขอบตอนสร้าง" → แบ่งขอบทีเดียว ตะเข็บทั้งชิ้นขึ้น "ต้องกำหนดใหม่"
 *   และค่ารายขอบ (เผื่อเย็บรายขอบ · ขอบพับ · ซิป/กุ๊น/เดินด้าย) หลุดทั้งชิ้น
 *   วิธี: จับจุดยอดเดิมที่ยังอยู่ในรูปใหม่ (ตำแหน่งตรงกัน ลำดับเดิม) → รู้ว่าขอบใหม่แต่ละขอบเป็น "ช่วงไหนของขอบเดิม"
 *     · แบ่งขอบ = ขอบเดิม 1 ขอบกลายเป็นหลายขอบ → ตะเข็บครอบทุกช่วงเหมือนเดิม · ค่ารายขอบตามไปทุกช่วง (ซิปบางช่วงตัดตามช่วงจริง)
 *     · ลบจุด = หลายขอบรวมเป็นขอบเดียว → ตะเข็บที่ปลายทั้งสองยังอยู่ = ตามได้ · ปลายหาย = กำกวม → คงไว้ให้ขึ้น "ต้องเลือกขอบใหม่"
 *   วงรี (1 ขอบไม่มีจุดยอด) = จับคู่ไม่ได้ → คืน null (ทำงานแบบเดิม)
 * ใช้ที่: components/pattern-sheet/shape-editor (ทุกครั้งที่บันทึกการแก้ชิ้น) · เทสต์ lib/__tests__/pattern-edge-map.test.ts
 */
import { edgeMetaSet, pieceEdges, type EdgeMeta, type Seam, type SeamSide } from "./pattern-seams";
import type { Pt, Shape } from "./pattern-shape";

const EPS = 1e-4;
/** แผนจับคู่: map[k] = ดัชนีจุดใหม่ของจุดเดิม k (null = จุดหาย) · own[j] = ขอบใหม่ j อยู่บนขอบเดิมไหน ช่วง [a,b] ซม. จากต้นขอบเดิม · merged = กินเกินขอบเดิม (เกิดจากลบจุด) */
export type EdgePlan = { oldN: number; newN: number; map: (number | null)[]; own: { k: number; a: number; b: number; merged: boolean }[] };

const near = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;

export function edgePlan(oldShape: Shape, newShape: Shape): EdgePlan | null {
  if (oldShape.k === "ellipse" || newShape.k === "ellipse") return null;
  const OE = pieceEdges(oldShape), NE = pieceEdges(newShape);
  const oldN = OE.length, newN = NE.length;
  if (!oldN || !newN) return null;
  const O = OE.map((e) => e.pts[0]), N = NE.map((e) => e.pts[0]);
  const map = O.map((p) => { const j = N.findIndex((q) => near(p, q)); return j < 0 ? null : j; });
  const seq = map.filter((j): j is number => j != null);
  if (!seq.length) return null;
  // ลำดับต้องวนทางเดิม (นับจุดที่ "ถอยหลัง" ได้ไม่เกิน 1 ครั้ง = รอบวน)
  if (seq.length > 1) { let back = 0; for (let i = 0; i < seq.length; i++) if (seq[(i + 1) % seq.length] <= seq[i]) back++; if (back > 1) return null; }
  const inv = N.map(() => -1);
  map.forEach((j, k) => { if (j != null) inv[j] = k; });
  const own: EdgePlan["own"] = [];
  for (let j = 0; j < newN; j++) {
    let i = j, a = 0, steps = 0;
    while (inv[i] < 0 && steps < newN) { i = (i - 1 + newN) % newN; a += NE[i].len; steps++; }
    if (inv[i] < 0) return null;
    const k = inv[i], b = a + NE[j].len;
    own.push({ k, a, b, merged: b > OE[k].len + 0.05 });
  }
  return { oldN, newN, map, own };
}

/** ด้านของตะเข็บตามขอบใหม่ — กำกวม (ปลายด้านหาย) = null */
export function remapSide(side: SeamSide, plan: EdgePlan): SeamSide | null {
  if (side.inner || side.n !== plan.oldN) return null;
  const s = plan.map[side.from % plan.oldN];
  if (s == null) return null;
  if (side.count >= plan.oldN) return { ...side, from: s, count: plan.newN, n: plan.newN };
  const e = plan.map[(side.from + side.count) % plan.oldN];
  if (e == null) return null;
  const count = (e - s + plan.newN) % plan.newN;
  if (count <= 0) return null;
  return { ...side, from: s, count, n: plan.newN };
}

/** ย้ายตะเข็บตามแผนของชิ้นที่เปลี่ยนจำนวนขอบ · lost = ด้านที่ย้ายไม่ได้ (จะขึ้น "ต้องเลือกขอบใหม่") */
export function migrateSeams(seams: Seam[], plans: Map<string, EdgePlan>): { seams: Seam[]; changed: boolean; lost: number } {
  let changed = false, lost = 0;
  const fix = (side: SeamSide): SeamSide => {
    const plan = plans.get(side.pid);
    if (!plan || side.inner || side.n !== plan.oldN) return side;
    const r = remapSide(side, plan);
    if (!r) { lost++; return side; }
    changed = true;
    return r;
  };
  const out = seams.map((s) => { const a = fix(s.a), b = fix(s.b); return a === s.a && b === s.b ? s : { ...s, a, b }; });
  return { seams: changed ? out : seams, changed, lost };
}

/** ค่ารายขอบแบบตัวเลข (เผื่อเย็บรายขอบ · ขอบพับ) — ขอบใหม่ได้ค่าของขอบเดิมที่มันอยู่ · ไม่มี/ไม่ครบ = null */
export function remapEdgeValues(arr: number[] | null | undefined, plan: EdgePlan): number[] | null {
  if (!arr || arr.length !== plan.oldN) return null;
  return plan.own.map((o) => arr[o.k]);
}

const clipRange = (r: [number, number] | undefined, a: number, b: number): [number, number] | null | "all" => {
  if (!r) return "all";
  const s = Math.max(r[0], a), e = Math.min(r[1], b);
  if (e - s < 0.1) return null;
  if (s - a < 0.05 && b - e < 0.05) return "all";
  return [Math.round((s - a) * 10) / 10, Math.round((e - a) * 10) / 10];
};

/** งานขอบรายขอบ (ซิป · กุ๊น · เดินด้าย · ขอบเปิด) — ซิป/กุ๊นบางช่วงตัดตามช่วงจริงของขอบใหม่ · ขอบที่เกิดจากรวมขอบแล้วมีงานบางช่วง = เอาออก นับเป็น lost */
export function remapEdgeMeta(meta: EdgeMeta[] | null | undefined, plan: EdgePlan): { meta: EdgeMeta[] | null; lost: number } {
  if (!meta || meta.length !== plan.oldN) return { meta: null, lost: 0 };
  let lost = 0;
  const parts = new Map<number, number>();
  for (const o of plan.own) parts.set(o.k, (parts.get(o.k) ?? 0) + 1);
  const out = plan.own.map((o) => {
    const m = meta[o.k] ?? {}, x: EdgeMeta = {};
    if (m.top != null) x.top = m.top;
    if (m.take && !o.merged && parts.get(o.k) === 1) x.take = m.take;   // take ตามไปเฉพาะขอบที่ไม่ถูกแบ่ง/รวม
    if (m.open) x.open = true;
    for (const [flag, key] of [["zip", "zipR"], ["bind", "bindR"]] as const) {
      if (!m[flag]) continue;
      if (o.merged && m[key]) { lost++; continue; }
      const r = o.merged ? "all" : clipRange(m[key], o.a, o.b);
      if (r === null) continue;
      x[flag] = true;
      if (r !== "all") x[key] = r;
    }
    return x;
  });
  return { meta: out.some(edgeMetaSet) ? out : null, lost };
}
