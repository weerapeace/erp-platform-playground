/**
 * 🧭 ผังระบบ "ทั้งระบบ" (แผนงาน · เจ้าของสั่ง 2026-11-20 "ซื้อ ผลิต จ่ายงาน ขาย ทำเป็นหน้าเดียวกัน" แบบ A)
 *   4 ผังวางเรียงซ้าย→ขวาบนผืนเดียว — แต่ละส่วนใช้ตำแหน่งกล่อง/เส้นเดิมของผังนั้น (lib/flow-map FLOW_VIEWS) เลื่อนไปทางขวาตามลำดับ
 *   กล่องระบบในผืนรวม id = "<ส่วน>:<กล่อง>" (กล่องเดียวกันอยู่หลายส่วนได้ เช่น ใบสั่งผลิต)
 *   ของที่วาดเสริมไว้ในแท็บเดิม (entity team_plan_flow/<ส่วน>) ย้ายมาครั้งแรกที่เปิด (mergeOldScenes) — ของเดิมไม่ลบ เก็บเป็นสำรอง
 * ไม่มี React · เทสต์: lib/__tests__/plan-flow-merge.test.ts
 */
import { isSysId, sysId, unSysId, type FlowPins, type FlowScene } from "@/lib/flowchart";

export const PLAN_ALL_KEY = "all";
export const PLAN_ALL_SECTIONS = ["buy", "make", "dispatch", "sell"] as const;
export type PlanAllSection = (typeof PLAN_ALL_SECTIONS)[number];
/** กว้างของแต่ละส่วน (= กว้างผังเดิม) · ช่องว่างระหว่างส่วน */
export const PLAN_SECTION_W = 680;
export const PLAN_SECTION_GAP = 140;

export const sectionX = (i: number): number => i * (PLAN_SECTION_W + PLAN_SECTION_GAP);
export const allBoxId = (key: string, id: string): string => `${key}:${id}`;
/** "make:mo" → { key: "make", id: "mo" } · ไม่มี ":" = ไม่ใช่กล่องผืนรวม */
export function splitAllId(v: string): { key: string; id: string } | null {
  const i = v.indexOf(":");
  return i > 0 ? { key: v.slice(0, i), id: v.slice(i + 1) } : null;
}

/**
 * รวมของที่วาดเสริมในแท็บเดิม 4 แท็บ → ฉากเริ่มต้นของผืนรวม
 *  - เลื่อนตามส่วน (กล่องระบบของส่วนนั้นอยู่ที่เดิมเทียบกัน) · เส้นที่ต่อเข้ากล่องระบบ sys:mo → sys:make:mo · ตำแหน่งกล่องระบบที่ย้ายไว้ย้ายตาม
 *  - กล่องที่วาดล้นออกนอกส่วนของมัน (ซ้าย/ขวา) จะไปทับส่วนข้าง ๆ → ยกทั้งกลุ่มไปไว้เหนือส่วนนั้น (ไม่ทับกล่องที่อยู่ในส่วน)
 */
export function mergeOldScenes(old: Partial<Record<PlanAllSection, FlowScene | null>>): FlowScene {
  const out: FlowScene = { kind: "flowchart", v: 1, nodes: [], edges: [], pins: {} };
  const pins: FlowPins = {};
  const used = new Set<string>();
  PLAN_ALL_SECTIONS.forEach((key, i) => {
    const s = old[key];
    if (!s) return;
    const ox = sectionX(i);
    const inside = (n: FlowScene["nodes"][number]) => n.position.x >= 0 && n.position.x + n.width <= PLAN_SECTION_W;
    const outs = s.nodes.filter((n) => !inside(n)), ins = s.nodes.filter(inside);
    // กลุ่มที่ล้น: มุมซ้ายไปชิดซ้ายของส่วน · ขอบล่างอยู่เหนือกล่องในส่วน (และเหนือกรอบ) 40px
    let gx = 0, gy = 0;
    if (outs.length) {
      const minX = Math.min(...outs.map((n) => n.position.x)), maxY = Math.max(...outs.map((n) => n.position.y + n.height));
      const topIn = Math.min(0, ...ins.map((n) => n.position.y));
      gx = -minX; gy = topIn - 40 - maxY;
    }
    const idMap = new Map<string, string>();
    for (const n of s.nodes) {
      let id = n.id; while (used.has(id)) id = `${id}_${key}`;
      used.add(id); idMap.set(n.id, id);
      const out1 = !inside(n);
      out.nodes.push({ ...n, id, position: { x: ox + n.position.x + (out1 ? gx : 0), y: n.position.y + (out1 ? gy : 0) } });
    }
    const map = (v: string) => (isSysId(v) ? sysId(allBoxId(key, unSysId(v))) : idMap.get(v) ?? v);
    for (const e of s.edges) {
      let id = e.id; while (used.has(id)) id = `${id}_${key}`;
      used.add(id);
      out.edges.push({ ...e, id, source: map(e.source), target: map(e.target) });
    }
    for (const [k, p] of Object.entries(s.pins ?? {})) pins[sysId(allBoxId(key, unSysId(k)))] = { x: p.x + ox, y: p.y };
  });
  if (Object.keys(pins).length) out.pins = pins; else delete out.pins;
  return out;
}
