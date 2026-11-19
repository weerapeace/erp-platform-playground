/**
 * 🧭 งานในแผน "เกาะกล่อง" บนแผนผังการทำงาน (โหมด "ผังระบบ" ของกระดานแผนงาน) — ตรรกะล้วน · เทสต์ lib/__tests__/team-plan-flow.test.ts
 * เจ้าของเลือกแบบ C + ไอเดียใช้ง่าย 1-15 (widget 2026-11-19)
 *
 *   - การเกาะ = รายการผูกของงาน (metadata.plan.linked) ชนิด "flow_node" · id = key กล่องใน lib/flow-map (FLOW_NODES) — ไม่มีตารางใหม่
 *   - งาน 1 ชิ้นเกาะได้หลายกล่อง · กล่องที่หายจากทะเบียน = ไม่นับ (ไม่พัง)
 *   - suggestFlowNode = เดากล่องจากชื่องาน (ชื่อกล่อง + คำที่ตั้งไว้ใน FLOW_NODE_WORDS) — ไม่ใช้ AI ไม่เสียเงิน · เดาไม่ได้ = null
 * doc: docs/team-plan.md (หัวข้อ ผังระบบ)
 */
import { FLOW_NODES } from "@/lib/flow-map";
import { isOverdue, isPlanDone, PRIORITIES, type PlanItem, type PlanLinkedRef } from "@/lib/team-plan";

export const FLOW_PIN_KIND = "flow_node";

/** คำที่บอกว่างานน่าจะเกี่ยวกับกล่องไหน (ตัวพิมพ์เล็ก · เพิ่มได้เรื่อย ๆ) — ชื่อกล่องเองนับให้อยู่แล้ว */
export const FLOW_NODE_WORDS: Record<string, string[]> = {
  qt: ["เสนอราคา", "quotation"],
  so: ["สั่งขาย", "ออเดอร์", "order", "zort", "bigseller", "shopee", "lazada", "tiktok", "amazon"],
  bill: ["ใบกำกับ", "ใบขาย", "invoice"],
  dn: ["ส่งของ", "delivery"],
  bn: ["วางบิล", "billing"],
  rc: ["รับชำระ", "receipt"],
  cn: ["ลดหนี้", "credit note"],
  ds: ["ออกแบบ", "design", "แพทเทิร์น", "pattern", "swatch", "clo3d", "louis batch", "illustrator", "photoshop", "plugin", "รูปถ่าย", "batch files", "sort files"],
  sku: ["sku", "bom", "สูตร"],
  prep: ["ตัดผ้า", "cutting", "nesting", "เตรียมตัด"],
  mo: ["ใบสั่งผลิต", "ผลิต", "mo ", "ตัดผ้า", "cutting", "nesting"],
  mat: ["วัตถุดิบ"],
  wo: ["จ่ายงาน"],
  sub: ["ช่างส่งงาน", "รับคืน"],
  qc: ["qc", "ชั้นวาง"],
  pw: ["งานเหมา"],
  pay: ["เงินเดือน", "payroll"],
  pr: ["ขอซื้อ"],
  po: ["สั่งซื้อ", "po ", "ซัพ", "supplier", "โอนเงินจีน", "wechat"],
  line: ["line"],
  gr: ["รับของ", "receive"],
  paypo: ["จ่ายเงินซัพ", "wechat", "alipay", "โอนเงินจีน", "โอนเงิน"],
  china: ["บิลจีน", "china pay", "taobao", "1688"],
  cf: ["กระแสเงินสด", "cashflow"],
  gl: ["บัญชี", "accounting"],
  tax: ["ภาษี"],
};

/** ชื่อกล่อง (ไม่มีในทะเบียน = id เดิม) */
export const flowNodeLabel = (id: string) => FLOW_NODES[id]?.label ?? id;

const norm = (s: string) => ` ${s.toLowerCase().replace(/\s+/g, " ").trim()} `;

/** เดากล่องจากชื่องาน — คะแนน = ความยาวคำที่ตรง (ชื่อกล่องได้คะแนนเพิ่ม) · allowed = กล่องที่มีในผังที่เปิดอยู่ (ไม่ส่ง = ทุกกล่อง) */
export function suggestFlowNode(title: string, allowed?: Iterable<string>): string | null {
  const t = norm(title);
  if (t.trim().length < 2) return null;
  const ids = allowed ? [...allowed] : Object.keys(FLOW_NODES);
  let best: string | null = null, score = 0;
  for (const id of ids) {
    const n = FLOW_NODES[id]; if (!n) continue;
    let s = 0;
    const label = n.label.replace(/\s*\(.*?\)\s*/g, "").toLowerCase();
    for (const part of label.split("/")) if (part.length >= 3 && t.includes(part)) s = Math.max(s, part.length + 5);
    for (const w of FLOW_NODE_WORDS[id] ?? []) if (t.includes(w.toLowerCase())) s = Math.max(s, w.trim().length);
    if (s > score) { score = s; best = id; }
  }
  return score >= 2 ? best : null;
}

/** กล่องที่งานนี้เกาะอยู่ (เรียงตามที่เกาะ) */
export const flowPinsOf = (t: { plan: { linked: PlanLinkedRef[] } }): string[] =>
  t.plan.linked.filter((r) => r.kind === FLOW_PIN_KIND && FLOW_NODES[r.id]).map((r) => r.id);

/** รายการผูกใหม่ เมื่อเกาะงานกับกล่อง (multi=false = ย้ายจากกล่องเดิมทั้งหมด) · เกาะอยู่แล้ว = คืนชุดเดิม */
export function withFlowPin(linked: PlanLinkedRef[], nodeId: string, multi = true): PlanLinkedRef[] {
  if (linked.some((r) => r.kind === FLOW_PIN_KIND && r.id === nodeId)) return linked;
  const base = multi ? linked : linked.filter((r) => r.kind !== FLOW_PIN_KIND);
  return [...base, { kind: FLOW_PIN_KIND, id: nodeId, label: flowNodeLabel(nodeId) }];
}
/** รายการผูกใหม่ เมื่อเอางานออกจากกล่อง */
export const withoutFlowPin = (linked: PlanLinkedRef[], nodeId: string): PlanLinkedRef[] =>
  linked.filter((r) => !(r.kind === FLOW_PIN_KIND && r.id === nodeId));

export type FlowFilter = "all" | "me" | "over";
export function matchFlowFilter(t: PlanItem, f: FlowFilter, me: string | null, now: Date = new Date()): boolean {
  if (f === "me") return !!me && t.assigned_to === me;
  if (f === "over") return isOverdue(t.due_at, now);
  return true;
}

/** กล่อง → งานที่ยังไม่เสร็จที่เกาะอยู่ (ตามตัวกรอง) */
export function pinsByNode(items: PlanItem[], f: FlowFilter = "all", me: string | null = null, now: Date = new Date()): Map<string, PlanItem[]> {
  const out = new Map<string, PlanItem[]>();
  for (const t of items) {
    if (isPlanDone(t) || !matchFlowFilter(t, f, me, now)) continue;
    for (const id of flowPinsOf(t)) (out.get(id) ?? out.set(id, []).get(id)!).push(t);
  }
  return out;
}

/** แถบสรุปบนสุด: เกาะแล้วกี่งาน / ทั้งหมด · เกินกำหนด · กล่องที่งานเกินกำหนดเยอะสุด */
export function flowSummary(items: PlanItem[], now: Date = new Date()): { pinned: number; total: number; overdue: number; topNode: string | null; topCount: number } {
  const open = items.filter((t) => !isPlanDone(t));
  const over = new Map<string, number>();
  for (const t of open) if (isOverdue(t.due_at, now)) for (const id of flowPinsOf(t)) over.set(id, (over.get(id) ?? 0) + 1);
  let topNode: string | null = null, topCount = 0;
  for (const [id, n] of over) if (n > topCount) { topNode = id; topCount = n; }
  return { pinned: open.filter((t) => flowPinsOf(t).length > 0).length, total: open.length, overdue: open.filter((t) => isOverdue(t.due_at, now)).length, topNode, topCount };
}

/** ตัวอักษรย่อของชื่อคน (รูปย่อบนป้าย) */
export const initialOf = (name: string | null | undefined) => ([...(name ?? "").trim()][0] ?? "?").toUpperCase();

/** เรียงงานในถาด: กำหนดใกล้สุดก่อน (ไม่มีกำหนดไว้ท้าย) / ความด่วน */
export type TraySort = "due" | "priority";
const dueMs = (t: PlanItem) => (t.due_at ? Date.parse(t.due_at) : Number.POSITIVE_INFINITY);
export function sortTray(list: PlanItem[], by: TraySort): PlanItem[] {
  return [...list].sort((a, b) => by === "due"
    ? dueMs(a) - dueMs(b) || PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)
    : PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || dueMs(a) - dueMs(b));
}

