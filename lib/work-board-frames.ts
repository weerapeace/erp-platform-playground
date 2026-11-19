/**
 * 🗂️ กรอบหมวดงานบนกระดาน "งานทั้งหมด" ของแผนงานทีม (เจ้าของเลือก 2026-11-19: แบ่งกรอบตามชนิดงาน + ข้อ 1-5)
 *   กรอบ 3 กรอบ = แผนทีม · งาน Task · ใบงานออกแบบ (frame ของ Excalidraw ที่มี customData.kind = "work_frame")
 *   - readWorkBoard()  : อ่านกระดาน → กรอบหมวดที่มี + การ์ดงานแต่ละใบ (กลุ่มเดียวกัน = การ์ดเดียว) อยู่ตรงไหน
 *   - planPlacement()  : "จัดงานลงกรอบ" — สร้างกรอบที่ยังไม่มี + วางการ์ดใหม่ต่อท้ายการ์ดที่อยู่ในกรอบแล้ว (ไม่ขยับการ์ดเดิม)
 *   - fadePatches()    : งานที่ปิดแล้ว → การ์ดจาง · กลับมาเปิด → การ์ดชัดเหมือนเดิม (ไม่รู้สถานะ = ไม่ยุ่ง)
 *   - doneCards()      : การ์ดของงานที่ปิดแล้ว (ไว้ปุ่ม "เก็บการ์ดที่เสร็จ") — ข้ามการ์ดที่ผูกกับงานแผนที่ยังไม่เสร็จ (กันการผูกหลุด)
 * ฟังก์ชันล้วน ไม่แตะกระดานเอง · ใช้ที่ components/team-plan/board-view.tsx · เทสต์ lib/__tests__/work-board-frames.test.ts
 */
import { PLAN_CARD_KIND } from "@/lib/team-plan-board";

export const WORK_FRAME_KIND = "work_frame";
export type WorkFrameKey = "plan" | "task" | "sheet";
export const WORK_FRAME_ORDER: WorkFrameKey[] = ["plan", "task", "sheet"];
export const WORK_FRAME_LABEL: Record<WorkFrameKey, string> = { plan: "แผนทีม", task: "งาน Task", sheet: "ใบงานออกแบบ" };
/** ชนิดการ์ดบนกระดาน (customData.kind) ของงานแต่ละชนิด */
export const WORK_CARD_KIND: Record<WorkFrameKey, string> = { plan: PLAN_CARD_KIND, task: "task", sheet: "design_sheet" };
const WK_OF_CARD = new Map<string, WorkFrameKey>(WORK_FRAME_ORDER.map((k) => [WORK_CARD_KIND[k], k]));

/** ความจาง (opacity) ของการ์ดงานที่ปิดแล้ว */
export const DONE_OPACITY = 35;
// ขนาดกรอบ — 4 คอลัมน์ กว้างเท่าการ์ดงานในแผน (300) · การ์ดใบงาน/งาน Task แคบกว่า วางชิดซ้ายของช่อง
export const COL_W = 300, GAP = 20, PAD = 28, COLS = 4, FRAME_GAP = 140, MIN_H = 260;
export const FRAME_W = COLS * COL_W + (COLS - 1) * GAP + 2 * PAD;

/** ชื่อกรอบ + ตัวเลขสด เช่น "งาน Task · ค้าง 31 · เกิน 8" */
export function frameName(k: WorkFrameKey, s?: { total: number; overdue: number } | null): string {
  if (!s) return WORK_FRAME_LABEL[k];
  return `${WORK_FRAME_LABEL[k]} · ค้าง ${s.total}${s.overdue ? ` · เกิน ${s.overdue}` : ""}`;
}

type El = Record<string, unknown>;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export type WorkFrame = { id: string; wk: WorkFrameKey; x: number; y: number; w: number; h: number; name: string };
export type BoardCard = { key: string; wk: WorkFrameKey; id: string; gid: string; elIds: string[]; minX: number; minY: number; maxX: number; maxY: number; frameId: string };
export type WorkBoard = { frames: Map<WorkFrameKey, WorkFrame>; cards: BoardCard[]; /** ขอบเขตของทุกอย่างบนกระดาน (ไว้หาที่ว่างวางกรอบใหม่) */ bounds: { minX: number; minY: number; maxX: number; maxY: number } | null };

export const cardKey = (wk: WorkFrameKey, id: string) => `${wk}:${id}`;

/** อ่านกระดาน → กรอบหมวด + การ์ดงาน 3 ชนิด (การ์ด 1 ใบ = element ที่ groupIds[0] เดียวกัน) */
export function readWorkBoard(els: El[]): WorkBoard {
  const frames = new Map<WorkFrameKey, WorkFrame>();
  const cards = new Map<string, BoardCard>();
  let bounds: WorkBoard["bounds"] = null;
  for (const el of els) {
    if (!el || el.isDeleted) continue;
    const x = num(el.x), y = num(el.y), x2 = x + num(el.width), y2 = y + num(el.height);
    bounds = bounds ? { minX: Math.min(bounds.minX, x), minY: Math.min(bounds.minY, y), maxX: Math.max(bounds.maxX, x2), maxY: Math.max(bounds.maxY, y2) } : { minX: x, minY: y, maxX: x2, maxY: y2 };
    const d = el.customData as Record<string, unknown> | undefined;
    if (el.type === "frame") {
      const wk = str(d?.wk) as WorkFrameKey;
      if (d?.kind === WORK_FRAME_KIND && WORK_FRAME_ORDER.includes(wk) && !frames.has(wk)) {
        frames.set(wk, { id: str(el.id), wk, x, y, w: num(el.width), h: num(el.height), name: str(el.name) });
      }
      continue;
    }
    const wk = WK_OF_CARD.get(str(d?.kind));
    const id = str(d?.id);
    const gid = (el.groupIds as string[] | undefined)?.[0];
    if (!wk || !id || !gid) continue;
    const hit = cards.get(gid);
    if (hit) {
      hit.minX = Math.min(hit.minX, x); hit.minY = Math.min(hit.minY, y); hit.maxX = Math.max(hit.maxX, x2); hit.maxY = Math.max(hit.maxY, y2);
      hit.elIds.push(str(el.id));
      if (!hit.frameId && el.frameId) hit.frameId = str(el.frameId);
    } else {
      cards.set(gid, { key: cardKey(wk, id), wk, id, gid, elIds: [str(el.id)], minX: x, minY: y, maxX: x2, maxY: y2, frameId: el.frameId ? str(el.frameId) : "" });
    }
  }
  return { frames, cards: [...cards.values()], bounds };
}

/** การ์ดใบนี้อยู่ในกรอบนี้ไหม (ผูกกับกรอบแล้ว หรือจุดกึ่งกลางอยู่ในกรอบ) */
export function inFrame(c: BoardCard, f: WorkFrame): boolean {
  if (c.frameId) return c.frameId === f.id;
  const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2;
  return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;
}

export type PlaceReq = { wk: WorkFrameKey; key: string; w: number; h: number };
export type Placement = {
  newFrames: WorkFrame[];
  /** กรอบเดิมที่ต้องสูงขึ้น */
  grow: { id: string; h: number }[];
  /** ตำแหน่งมุมซ้ายบนของการ์ดใหม่ (พิกัดจริงบนกระดาน) + กรอบที่ต้องผูก */
  at: Map<string, { x: number; y: number; frameId: string }>;
};

/**
 * จัดการ์ดใหม่ลงกรอบหมวด
 * - ensureAll = สร้างกรอบให้ครบ 3 หมวด (ปุ่ม "จัดงานลงกรอบ") · ไม่งั้นสร้างเฉพาะหมวดที่มีการ์ดจะวาง
 * - กรอบใหม่วางเรียงขวาของกรอบหมวดเดิม · ยังไม่มีกรอบเลย = ขวาของทุกอย่างบนกระดาน (กระดานว่าง = 0,0)
 * - การ์ดใหม่ต่อแถวใต้การ์ดล่างสุดที่อยู่ในกรอบแล้ว (4 ใบต่อแถว) · ไม่ขยับการ์ดเดิม · กรอบสูงขึ้นให้พอ
 */
export function planPlacement(board: WorkBoard, reqs: PlaceReq[], opts: { ensureAll?: boolean; newId: (wk: WorkFrameKey) => string; names?: Partial<Record<WorkFrameKey, string>> }): Placement {
  const frames = new Map(board.frames);
  const newFrames: WorkFrame[] = [];
  const need = new Set<WorkFrameKey>(opts.ensureAll ? WORK_FRAME_ORDER : reqs.map((r) => r.wk));
  const existing = [...frames.values()];
  let cursorX: number, cursorY: number;
  if (existing.length) {
    const right = existing.reduce((a, f) => (f.x + f.w > a.x + a.w ? f : a));
    cursorX = right.x + right.w + FRAME_GAP; cursorY = right.y;
  } else if (board.bounds) {
    cursorX = board.bounds.maxX + FRAME_GAP; cursorY = board.bounds.minY;
  } else { cursorX = 0; cursorY = 0; }
  for (const wk of WORK_FRAME_ORDER) {
    if (!need.has(wk) || frames.has(wk)) continue;
    const f: WorkFrame = { id: opts.newId(wk), wk, x: cursorX, y: cursorY, w: FRAME_W, h: MIN_H, name: opts.names?.[wk] ?? frameName(wk) };
    frames.set(wk, f); newFrames.push(f);
    cursorX += FRAME_W + FRAME_GAP;
  }

  const at = new Map<string, { x: number; y: number; frameId: string }>();
  const heights = new Map<string, number>();
  for (const wk of WORK_FRAME_ORDER) {
    const f = frames.get(wk); if (!f) continue;
    const list = reqs.filter((r) => r.wk === wk && !at.has(r.key));
    if (!list.length) continue;
    const inside = board.cards.filter((c) => inFrame(c, f));
    let y = inside.length ? Math.max(...inside.map((c) => c.maxY)) + GAP : f.y + PAD;
    let col = 0, rowH = 0;
    for (const r of list) {
      if (col === COLS) { y += rowH + GAP; col = 0; rowH = 0; }
      at.set(r.key, { x: f.x + PAD + col * (COL_W + GAP), y, frameId: f.id });
      rowH = Math.max(rowH, r.h); col++;
    }
    const bottom = y + rowH + PAD;
    const want = Math.max(f.h, MIN_H, bottom - f.y);
    if (want > f.h + 0.5) { heights.set(f.id, want); f.h = want; }
  }
  const newIds = new Set(newFrames.map((f) => f.id));
  const grow = [...heights].filter(([id]) => !newIds.has(id)).map(([id, h]) => ({ id, h }));
  return { newFrames, grow, at };
}

/** ขนาดของการ์ดจาก skeleton (มุมขวาล่างสุดของชิ้นที่มีขนาด) */
export function skelSize(skels: El[]): { w: number; h: number } {
  let w = 0, h = 0;
  for (const s of skels) { w = Math.max(w, num(s.x) + num(s.width)); h = Math.max(h, num(s.y) + num(s.height)); }
  return { w, h };
}

/** สถานะงานของการ์ด: open = ยังค้าง · done = ปิดแล้ว · unknown = ไม่รู้ (ไม่มีสิทธิ์/ยังไม่โหลด) → ไม่ยุ่ง */
export type WorkState = (wk: WorkFrameKey, id: string) => "open" | "done" | "unknown";

/** การ์ดงานที่ปิดแล้ว → จาง · กลับมาค้าง → ชัด (คืนเฉพาะความจางที่ระบบตั้งไว้ ไม่ทับที่ผู้ใช้ตั้งเอง) */
export function fadePatches(els: El[], board: WorkBoard, state: WorkState): Map<string, { opacity: number }> {
  const want = new Map<string, number>();
  for (const c of board.cards) {
    const s = state(c.wk, c.id);
    if (s === "unknown") continue;
    for (const id of c.elIds) want.set(id, s === "done" ? DONE_OPACITY : 100);
  }
  const out = new Map<string, { opacity: number }>();
  for (const el of els) {
    const id = str(el.id), w = want.get(id);
    if (w === undefined || el.isDeleted) continue;
    const cur = el.opacity === undefined ? 100 : num(el.opacity);
    if (w === DONE_OPACITY && cur !== DONE_OPACITY) out.set(id, { opacity: DONE_OPACITY });
    else if (w === 100 && cur === DONE_OPACITY) out.set(id, { opacity: 100 });
  }
  return out;
}

/** การ์ดของงานที่ปิดแล้ว (ไว้เก็บออกจากกระดาน) — skip = คีย์ "ชนิดการ์ด:id" ที่ห้ามเก็บ (ผูกกับงานแผนที่ยังไม่เสร็จ) */
export function doneCards(board: WorkBoard, state: WorkState, skip: Set<string> = new Set()): { take: BoardCard[]; skipped: number } {
  const take: BoardCard[] = [];
  let skipped = 0;
  for (const c of board.cards) {
    if (state(c.wk, c.id) !== "done") continue;
    if (c.wk !== "plan" && skip.has(`${WORK_CARD_KIND[c.wk]}:${c.id}`)) { skipped++; continue; }
    take.push(c);
  }
  return { take, skipped };
}
