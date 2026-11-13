/**
 * ของกลาง — "วางแผนตัดผ้า" หลายใบสั่งผลิตพร้อมกัน (เมนู ผลิต · เฟส 1 · เจ้าของสั่ง 2026-11-13)
 *   ตัดรวม = เอาชิ้นตัดของทุกใบที่ใช้ "ผ้าตัวเดียวกัน หน้ากว้างเดียวกัน" มาวางบนผ้าผืนเดียวกัน (ชิ้นเล็กยัดช่องว่างข้ามใบได้)
 *   ตัดแยก = วางทีละใบ (แบบที่ระบบคิดให้แต่ละใบอยู่แล้ว) → ส่วนต่าง = ประหยัดจากการตัดรวม
 *   ตัววางจริง = layFabric → packFabric (lib/fabric-calc · skyline วางแบบกรอบ ลองหลายกลยุทธ์) — ตัวเดียวกับใบสั่งผลิต/เครื่องคิดเลขผ้า
 *   แบ่งผ้าที่ตัดรวมคืนให้แต่ละใบตามสัดส่วนพื้นที่ชิ้น (ต้นทุนผ้าต่อใบจะได้ถูก)
 *   ⚠️ ตัววางแบบกรอบไม่ได้ดีที่สุดเสมอ — ล็อตรวมใหญ่บางผ้าวางรวมแล้วยาวกว่าตัดทีละใบ (เจอจริง: เยื่อขาว 26 ใบ 104.93 vs 104.18)
 *      → best = ทางที่ใช้ผ้าน้อยกว่า · need = ผ้าที่ต้องใช้ตามทางนั้น (ไม่มีวันแนะนำทางที่เปลืองกว่า)
 * ชิ้นตัดมาจาก mo_material_summary.lay_layout (บล็อก กว้าง×ยาว×ชิ้นรวม ต่อใบ — explodeBom เก็บไว้ตอนเปิดใบ/อัพเดตวัตถุดิบ)
 * ใช้ที่: app/master/fabric-plan (หน้า) · app/print/fabric-plan (ใบตัดผ้า) · API /api/mo/fabric-plan · เทสต์: lib/__tests__/fabric-plan.test.ts
 */
import { layFabric, type LayResult } from "./mo-fabric-lay";

export type PlanBlock = { mo_no: string; label: string; width_cm: number; length_cm: number; total_pieces: number; no_rotate: boolean };
/** ผ้า 1 กลุ่ม (รหัส + หน้ากว้าง + ความยาวผืน) ที่มาจากหลายใบ */
export type PlanGroupInput = {
  key: string; sku: string; name: string | null; uom: string | null;
  face_width_cm: number;
  /** ผ้าผืน: ความยาวต่อผืน · null = ผ้าม้วน */
  sheet_length_cm: number | null;
  /** ตัวหาร ซม. → หน่วยสั่งซื้อ (90 = หลา ตามกลุ่มวัตถุดิบ) */
  divisor: number;
  blocks: PlanBlock[];
  /** สต็อกคงเหลือ (หน่วยเดียวกับ uom) · null = ไม่รู้ */
  on_hand: number | null;
};
/** separate = ตัดใบนี้ใบเดียว · combined = ส่วนแบ่งจากตัดรวม · alloc = ผ้าที่ใบนี้ใช้ตามทางที่แนะนำ */
export type PlanMoShare = { mo_no: string; separate: number; share_pct: number; combined: number; alloc: number; pieces: number };
export type PlanGroupResult = {
  key: string; sku: string; name: string | null; uom: string | null; face_width_cm: number; sheet_length_cm: number | null;
  ok: boolean; error?: string;
  mos: string[]; pieces: number;
  /** ตัดรวม */
  combined: LayResult;
  /** ตัดแยกรวมทุกใบ (หน่วยสั่งซื้อ) */
  separate: number;
  /** ประหยัดจากตัดรวม (หน่วยสั่งซื้อ · ไม่ติดลบ) */
  saved: number;
  /** ทางที่ใช้ผ้าน้อยกว่า */
  best: "combined" | "separate";
  /** ผ้าที่ต้องใช้ตามทางที่แนะนำ */
  need: number;
  per_mo: PlanMoShare[];
  on_hand: number | null;
  /** ขาดเท่าไหร่ถ้าตัดรวม (0 = พอ · null = ไม่รู้สต็อก) */
  short: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

function lay(g: PlanGroupInput, blocks: PlanBlock[]): LayResult {
  return layFabric({
    blocks: blocks.map((b, i) => ({ key: `b${i}`, label: b.label, width_cm: b.width_cm, length_cm: b.length_cm, total_pieces: b.total_pieces, no_rotate: b.no_rotate })),
    face_width_cm: g.face_width_cm, sheet_length_cm: g.sheet_length_cm, divisor: g.divisor, unit: g.uom,
  });
}

/** วางแผน 1 กลุ่มผ้า: ตัดรวม vs ตัดแยก + แบ่งคืนต่อใบ + เทียบสต็อก */
export function planGroup(g: PlanGroupInput): PlanGroupResult {
  const blocks = g.blocks.filter((b) => b.width_cm > 0 && b.length_cm > 0 && b.total_pieces > 0);
  const mos = [...new Set(blocks.map((b) => b.mo_no))];
  const pieces = blocks.reduce((a, b) => a + b.total_pieces, 0);
  const combined = lay(g, blocks);
  const base = { key: g.key, sku: g.sku, name: g.name, uom: g.uom, face_width_cm: g.face_width_cm, sheet_length_cm: g.sheet_length_cm, mos, pieces, on_hand: g.on_hand };
  if (!combined.ok) return { ...base, ok: false, error: combined.error ?? "วางไม่ได้", combined, separate: 0, saved: 0, best: "combined", need: 0, per_mo: [], short: null };

  const areaOf = (bs: PlanBlock[]) => bs.reduce((a, b) => a + b.width_cm * b.length_cm * b.total_pieces, 0);
  const total = areaOf(blocks);
  const per_mo: PlanMoShare[] = mos.map((mo) => {
    const mine = blocks.filter((b) => b.mo_no === mo);
    const sep = mos.length === 1 ? combined : lay(g, mine);
    const share = total > 0 ? areaOf(mine) / total : 0;
    return { mo_no: mo, separate: r2(sep.ok ? sep.qty : 0), share_pct: r1(share * 100), combined: r2(combined.qty * share), alloc: 0, pieces: mine.reduce((a, b) => a + b.total_pieces, 0) };
  });
  const separate = r2(per_mo.reduce((a, m) => a + m.separate, 0));
  const best: "combined" | "separate" = mos.length > 1 && separate > 0 && separate < combined.qty ? "separate" : "combined";
  const need = best === "combined" ? r2(combined.qty) : separate;
  for (const m of per_mo) m.alloc = best === "combined" ? m.combined : m.separate;
  const saved = r2(Math.max(0, separate - need));
  const short = g.on_hand == null ? null : r2(Math.max(0, need - g.on_hand));
  return { ...base, ok: true, combined, separate, saved, best, need, per_mo, short };
}

/** สรุปทั้งแผน (หลายกลุ่มผ้า) */
export function planTotals(rs: PlanGroupResult[]) {
  const ok = rs.filter((r) => r.ok);
  return {
    groups: rs.length, mos: new Set(ok.flatMap((r) => r.mos)).size,
    saved_groups: ok.filter((r) => r.saved > 0).length,
    short_groups: ok.filter((r) => (r.short ?? 0) > 0).length,
  };
}

/** แปลงผัง lay_layout ที่เก็บต่อใบ → บล็อกของแผน (ใบเดียวกัน หลายบล็อก) */
export function blocksFromLayout(moNo: string, layout: { blocks?: { label?: string; width_cm?: number; length_cm?: number; total_pieces?: number; no_rotate?: boolean }[] } | null | undefined): PlanBlock[] {
  return (layout?.blocks ?? []).map((b) => ({
    mo_no: moNo, label: String(b.label ?? `${b.width_cm}×${b.length_cm}`),
    width_cm: Number(b.width_cm) || 0, length_cm: Number(b.length_cm) || 0, total_pieces: Math.max(0, Math.floor(Number(b.total_pieces) || 0)), no_rotate: !!b.no_rotate,
  }));
}
