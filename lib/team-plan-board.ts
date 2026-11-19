/**
 * 🧲 กระดานแผนงานทีม — ตรรกะล้วน (ไม่มี React · มีเทสต์ lib/__tests__/team-plan-board.test.ts)
 * เจ้าของขอ 2026-11-15: มุมมอง "กระดาน" ในหน้าแผนงาน วางงานในแผนคู่กับการ์ดจากระบบอื่น + ลากเส้นแล้ว "ผูกข้อมูลจริง"
 *
 *   - กระดานทีม 1 อัน: erp_canvas_sketches entity "team_plan_board" / "main" (สิทธิ์ ดู tasks.view · แก้ tasks.edit)
 *   - การ์ดงานในแผน = customData { kind: "team_plan", id } (หน้าตา: components/team-plan/board-cards)
 *   - เส้น (arrow ของ Excalidraw) ที่หัว/ท้ายเกาะการ์ดงานในแผน กับการ์ดชนิดที่ผูกได้ (PLAN_LINK_KINDS)
 *     → งานนั้น "ผูกกับ" ของชิ้นนั้น · เก็บใน metadata.plan.linked หลังกระดานบันทึก (board-view → PATCH linked)
 *   - กระดานเป็นตัวกำหนดเฉพาะงานที่มีการ์ดอยู่บนกระดาน (ลบเส้น = เลิกผูก) · งานที่ไม่มีการ์ดบนกระดาน = ไม่แตะ
 */
import { cleanImageUrl, cleanPlanLinked, PLAN_LINK_KINDS, sameLinked, type PlanLinkedRef } from "@/lib/team-plan";

export const TEAM_PLAN_BOARD = { entityType: "team_plan_board", entityId: "main" } as const;
export const PLAN_CARD_KIND = "team_plan";

type El = Record<string, unknown>;
type Card = { kind: string; id: string; data: Record<string, unknown> };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** ชื่อของที่ผูก (จากข้อมูลบนการ์ด) เช่น "DS-2026-0069 กระเป๋า CPN" · ไม่มีชื่อ = ชื่อชนิด */
export function refLabel(kind: string, d: Record<string, unknown>): string {
  const code = str(d.code) || str(d.task_no) || str(d.content_no);
  const name = str(d.name) || str(d.title) || str(d.label);
  const s = [code, name && name !== code ? name : ""].filter(Boolean).join(" ");
  return s || (kind === "folder" ? str(d.path) : "") || PLAN_LINK_KINDS[kind]?.label || kind;
}

/** อ่านกระดาน → งานในแผนที่อยู่บนกระดาน + รายการผูกของแต่ละงาน (ตามเส้นที่เกาะการ์ดสองฝั่ง) */
export function boardPlanLinks(elements: El[]): { onBoard: Set<string>; links: Map<string, PlanLinkedRef[]> } {
  const cardOf = new Map<string, Card>();
  const onBoard = new Set<string>();
  for (const el of elements) {
    if (!el || el.isDeleted) continue;
    const d = el.customData as Record<string, unknown> | undefined;
    const kind = str(d?.kind), id = str(d?.id);
    if (!d || !kind || !id) continue;
    if (typeof el.id === "string") cardOf.set(el.id, { kind, id, data: d });
    if (kind === PLAN_CARD_KIND) onBoard.add(id);
  }
  const raw = new Map<string, PlanLinkedRef[]>();
  for (const el of elements) {
    if (!el || el.isDeleted || el.type !== "arrow") continue;
    const a = cardOf.get(str((el.startBinding as { elementId?: unknown } | null)?.elementId));
    const b = cardOf.get(str((el.endBinding as { elementId?: unknown } | null)?.elementId));
    if (!a || !b) continue;
    const plan = a.kind === PLAN_CARD_KIND ? a : b.kind === PLAN_CARD_KIND ? b : null;
    const other = plan === a ? b : a;
    // งาน↔งาน (ลำดับงาน) ยังไม่เก็บ · ชนิดที่ไม่รู้จัก (เช่น การ์ดของโมดูลอื่นในอนาคต) = ไม่ผูก
    if (!plan || other.kind === PLAN_CARD_KIND || !Object.prototype.hasOwnProperty.call(PLAN_LINK_KINDS, other.kind)) continue;
    const list = raw.get(plan.id) ?? [];
    // รูปของสิ่งที่ผูก (จากข้อมูลบนการ์ด) → รูปหน้าการ์ดงาน ถ้างานไม่ได้แนบรูปปกเอง
    const image = cleanImageUrl(other.data.image_url) ?? cleanImageUrl(other.data.cover_url) ?? (other.kind === "asset" ? cleanImageUrl(other.data.url) : null);
    list.push({ kind: other.kind, id: other.kind === "erp_page" ? str(other.data.href) || other.id : other.id, label: refLabel(other.kind, other.data), ...(image ? { image } : {}) });
    raw.set(plan.id, list);
  }
  const links = new Map<string, PlanLinkedRef[]>();
  for (const [id, list] of raw) links.set(id, cleanPlanLinked(list));
  return { onBoard, links };
}

/** ชนิดที่ผูกจากที่อื่น (ไม่ได้มาจากเส้นบนกระดานวาด) — กระดานวาดต้องเก็บไว้ ไม่ลบทิ้งตอนซิงค์เส้น
 *  flow_node = งานเกาะกล่องในโหมด "ผังระบบ" (lib/team-plan-flow) */
export const OFF_BOARD_LINK_KINDS = new Set(["flow_node"]);

/** งานที่ต้องบันทึกรายการผูกใหม่ (เฉพาะงานที่มีการ์ดบนกระดาน และรายการไม่ตรงกับที่เก็บไว้) · ของที่ผูกจากที่อื่น (OFF_BOARD_LINK_KINDS) คงไว้เสมอ */
export function planLinkPatches(items: { id: string; plan: { linked: PlanLinkedRef[] } }[], board: { onBoard: Set<string>; links: Map<string, PlanLinkedRef[]> }): { id: string; linked: PlanLinkedRef[] }[] {
  const out: { id: string; linked: PlanLinkedRef[] }[] = [];
  for (const t of items) {
    if (!board.onBoard.has(t.id)) continue;
    const want = [...(board.links.get(t.id) ?? []), ...t.plan.linked.filter((r) => OFF_BOARD_LINK_KINDS.has(r.kind))];
    if (!sameLinked(want, t.plan.linked)) out.push({ id: t.id, linked: want });
  }
  return out;
}

/** แถบความคืบหน้าแบบตัวอักษร (การ์ดบนกระดานเป็นข้อความล้วน) — 2/4 → "■■■■■□□□□□" */
export function progressBar(done: number, total: number, width = 10): string {
  if (total <= 0) return "";
  const n = Math.max(0, Math.min(width, Math.round((done / total) * width)));
  return "■".repeat(n) + "□".repeat(width - n);
}
