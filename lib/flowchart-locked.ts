// ============================================================
// flowchart-locked — ตรรกะล้วนของ "ชั้นล็อก" บนกระดาน flowchart กลาง (components/flowchart-board prop `locked`)
//
// ชั้นล็อก = กล่อง/เส้นที่ระบบสร้างให้ (เช่น แผนผังการทำงานจาก lib/flow-map) — ไม่ได้เก็บในกระดาน วาดใหม่จากโค้ดทุกครั้ง
// ผู้ใช้วาดเสริมทับได้ (กล่อง/เส้นของกระดานเอง) · ปลดล็อกกล่องระบบทีละกล่องแล้วลากย้าย → จำตำแหน่งใน scene.pins
// ไม่มี React — เทสต์ได้ (lib/__tests__/flowchart-locked.test.ts)
// ============================================================

import { isSysId, sysId, type FlowPins, type FlowScene, type FlowSceneEdge } from "./flowchart";

/** กล่องของระบบ 1 กล่อง (พิกัดบนกระดาน = พิกัดผังเดิม) · label ใช้ตอนค้นหา */
export type LockedBox = { id: string; x: number; y: number; w: number; h: number; label: string };
/**
 * เส้นของระบบ 1 เส้น · d/feeds = เส้นทางที่ผังเดิมคำนวณไว้ (ใช้ตอนกล่องสองปลายยังไม่ถูกย้าย)
 * badge = วงกลมเลขกำกับ (พิกัดตามเส้นทางเดิม) · dot = จุดสีมุมวงกลม (เช่น เพิ่งแก้)
 */
export type LockedLine = {
  id: string; source: string; target: string;
  d?: string; feeds?: string[]; badge?: { x: number; y: number };
  color: string; dash?: string; width?: number; text?: string; dot?: string; title?: string; opacity?: number;
};
export type LockedPt = { x: number; y: number };

type Side = "t" | "r" | "b" | "l";
const anchor = (b: { x: number; y: number; w: number; h: number }, s: Side): LockedPt =>
  s === "t" ? { x: b.x + b.w / 2, y: b.y } : s === "b" ? { x: b.x + b.w / 2, y: b.y + b.h }
  : s === "l" ? { x: b.x, y: b.y + b.h / 2 } : { x: b.x + b.w, y: b.y + b.h / 2 };

/** ตำแหน่งจริงของกล่องระบบ (ย้ายแล้ว = ตำแหน่งที่จำไว้) */
export function boxAt(b: LockedBox, pins: FlowPins | undefined): LockedBox {
  const p = pins?.[sysId(b.id)];
  return p ? { ...b, x: p.x, y: p.y } : b;
}

/** เส้นหักมุมระหว่างกล่อง 2 กล่องที่ถูกย้าย — เลือกด้านตามทิศ (ห่างแนวนอนมากกว่า = ออกซ้าย/ขวา) */
export function elbowBetween(a: LockedBox, b: LockedBox): { d: string; mid: LockedPt } {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = cb.x - ca.x, dy = cb.y - ca.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const p = anchor(a, dx >= 0 ? "r" : "l"), q = anchor(b, dx >= 0 ? "l" : "r");
    const mx = Math.round((p.x + q.x) / 2);
    return { d: `M${p.x} ${p.y}H${mx}V${q.y}H${q.x}`, mid: { x: mx, y: Math.round((p.y + q.y) / 2) } };
  }
  const p = anchor(a, dy >= 0 ? "b" : "t"), q = anchor(b, dy >= 0 ? "t" : "b");
  const my = Math.round((p.y + q.y) / 2);
  return { d: `M${p.x} ${p.y}V${my}H${q.x}V${q.y}`, mid: { x: Math.round((p.x + q.x) / 2), y: my } };
}

/**
 * เส้นทางที่จะวาดของเส้นระบบ: สองปลายอยู่ที่เดิม = เส้นทางของผังเดิม (สวยตามที่ออกแบบ)
 * ปลายใดปลายหนึ่งถูกย้าย = เส้นหักมุมใหม่ระหว่างกล่อง (ตัดเส้นรวมสายทิ้ง — ตำแหน่งเดิมใช้ไม่ได้แล้ว)
 * ปลายหาไม่เจอ = null (ไม่วาด)
 */
export function lockedLinePath(line: LockedLine, boxes: Map<string, LockedBox>, pins: FlowPins | undefined): { d: string; feeds: string[]; badge: LockedPt | null } | null {
  const a = boxes.get(line.source), b = boxes.get(line.target);
  if (!a || !b) return null;
  const moved = !!pins?.[sysId(a.id)] || !!pins?.[sysId(b.id)];
  if (!moved && line.d) return { d: line.d, feeds: line.feeds ?? [], badge: line.badge ?? null };
  const e = elbowBetween(boxAt(a, pins), boxAt(b, pins));
  return { d: e.d, feeds: [], badge: line.badge ? e.mid : null };
}

/** เส้นที่วาดเอง ที่ต่อกับกล่องระบบซึ่งไม่มีแล้ว (ระบบเอากล่องออก) = "เส้นค้าง" — ให้เตือน ไม่หายเงียบ */
export function staleEdges(edges: Pick<FlowSceneEdge, "id" | "source" | "target">[], lockedIds: Iterable<string>): string[] {
  const have = new Set([...lockedIds].map(sysId));
  return edges.filter((e) => (isSysId(e.source) && !have.has(e.source)) || (isSysId(e.target) && !have.has(e.target))).map((e) => e.id);
}

/** ตำแหน่งที่จำไว้ของกล่องที่ไม่มีแล้ว — ตัดทิ้งตอนกด "คืนตำแหน่งเดิม" / ไม่นับเป็นกล่องที่ย้าย */
export function livePins(pins: FlowPins | undefined, lockedIds: Iterable<string>): FlowPins {
  const have = new Set([...lockedIds].map(sysId));
  return Object.fromEntries(Object.entries(pins ?? {}).filter(([k]) => have.has(k)));
}

/** ค้นกล่องบนกระดาน (ทั้งที่วาดเองและของระบบ) — ตรงคำค้นทุกคำ ไม่สนตัวพิมพ์ · ชื่อขึ้นต้นด้วยคำค้นได้ก่อน */
export function searchBoxes(items: { id: string; label: string }[], q: string, limit = 8): { id: string; label: string }[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = items.filter((it) => { const s = it.label.toLowerCase(); return words.every((w) => s.includes(w)); });
  const first = words[0];
  hits.sort((x, y) => Number(!x.label.toLowerCase().startsWith(first)) - Number(!y.label.toLowerCase().startsWith(first)) || x.label.length - y.label.length);
  return hits.slice(0, limit);
}

/** scene ที่มีแต่ของที่วาดเอง (ใช้ตอนเช็กว่ากระดานว่างไหม) */
export const hasOwnDrawing = (s: FlowScene): boolean => s.nodes.length > 0 || s.edges.length > 0;
