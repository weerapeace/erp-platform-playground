/**
 * 📋 "แตกเช็กลิสต์" บนกระดาน (ของกลาง · ฟังก์ชันล้วน · เทสต์ lib/__tests__/canvas-checklist-box.test.ts)
 * เจ้าของเลือกจาก widget 2026-11-16 = แบบ B "กล่องรายการข้างการ์ด" + เส้นโยงกลับการ์ด
 *
 *   - เลือกการ์ดที่มีเช็กลิสต์ → กด "แตกเช็กลิสต์" → กล่องสีเหลืองข้างการ์ด (1 กลุ่ม) + เส้นเกาะการ์ด→กล่อง
 *   - การ์ดที่รองรับ (CHECKLIST_SOURCES): งานในแผน · ใบงานออกแบบ (รออะไรอยู่) → เช็กลิสต์กลาง erp_record_tasks (ติ๊ก/เพิ่มข้อได้)
 *                                          งาน (Task) → งานย่อย (ดูอย่างเดียว — ดับเบิลคลิกข้อ = เปิดงาน เพราะงานย่อยมีขั้นอนุมัติของมันเอง)
 *   - ทุกชิ้นในกล่องหาเจอจาก customData (ไม่พึ่ง id — กระดานสร้าง id ใหม่ตอนวาง)
 *       กรอบ/หัวกล่อง = { kind: "checklist_box", id: "<ชนิดการ์ด>:<id>", owner_gid, ... , _sig }
 *       ข้อ           = { kind: "checklist_item", id: <id ข้อ>, done, owner_kind, owner_id, ... }
 *       ปุ่มเพิ่มข้อ   = { kind: "checklist_add", ... }
 *       เส้น          = customData.checklist_link = owner_gid (ไม่มี kind → ไม่กลืนดับเบิลคลิกการ์ดที่เส้นพาดผ่าน)
 *   - ชนิดการ์ดเหล่านี้ไม่อยู่ใน PLAN_LINK_KINDS → เส้นจากการ์ดงานไปกล่องไม่ถูกนับเป็น "ผูกงาน"
 * doc: docs/team-plan.md (หัวข้อ แตกเช็กลิสต์)
 */
import { wrapCardText } from "@/components/canvas-cards/skeletons";
import { TEAM_PLAN_CHECK } from "@/lib/team-plan";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";

export const CHECKLIST_BOX_KIND = "checklist_box";
export const CHECKLIST_ITEM_KIND = "checklist_item";
export const CHECKLIST_ADD_KIND = "checklist_add";
/** ชนิดชิ้นส่วนของกล่องเช็กลิสต์ — ซ่อนจากรายการ "การ์ดบนกระดาน" */
export const isChecklistPartKind = (k: unknown) => k === CHECKLIST_BOX_KIND || k === CHECKLIST_ITEM_KIND || k === CHECKLIST_ADD_KIND;

type El = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const cdOf = (el: El) => (el.customData ?? null) as Record<string, unknown> | null;
const gidOf = (el: El) => ((el.groupIds as string[] | undefined) ?? [])[0] ?? "";

/** ที่มาของเช็กลิสต์ของการ์ด 1 ใบ */
export type ChecklistSource =
  | { type: "record"; ownerKind: string; ownerId: string; label: string; moduleKey: string; recordType: string }
  | { type: "subtask"; ownerKind: string; ownerId: string; label: string };

/** การ์ดชนิดที่แตกเช็กลิสต์ได้ → ที่มา (การ์ดชนิดใหม่ที่มีเช็กลิสต์ เพิ่มที่นี่ที่เดียว) */
export const CHECKLIST_SOURCES: Record<string, (id: string, d: Record<string, unknown>) => ChecklistSource> = {
  team_plan: (id, d) => ({ type: "record", ownerKind: "team_plan", ownerId: id, label: str(d.title) || "งานในแผน", moduleKey: TEAM_PLAN_CHECK.moduleKey, recordType: TEAM_PLAN_CHECK.recordType }),
  design_sheet: (id, d) => ({ type: "record", ownerKind: "design_sheet", ownerId: id, label: [str(d.code), str(d.name)].filter(Boolean).join(" ") || "ใบงานออกแบบ", moduleKey: DESIGN_WAITING.moduleKey, recordType: DESIGN_WAITING.recordType }),
  task: (id, d) => ({ type: "subtask", ownerKind: "task", ownerId: id, label: [str(d.task_no), str(d.title)].filter(Boolean).join(" ") || "งาน" }),
};

export function checklistSourceOf(data: Record<string, unknown> | null | undefined): ChecklistSource | null {
  const kind = str(data?.kind), id = str(data?.id);
  if (!data || !kind || !id || !Object.prototype.hasOwnProperty.call(CHECKLIST_SOURCES, kind)) return null;
  return CHECKLIST_SOURCES[kind](id, data);
}

/** ที่มาที่เก็บไว้บนกล่อง (customData.src) → ตรวจค่าก่อนใช้ (ชนิดการ์ดต้องอยู่ใน CHECKLIST_SOURCES · ค่าแปลก = null) */
export function parseSource(v: unknown): ChecklistSource | null {
  const r = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  const ownerKind = str(r?.ownerKind), ownerId = str(r?.ownerId);
  if (!r || !ownerId || !Object.prototype.hasOwnProperty.call(CHECKLIST_SOURCES, ownerKind)) return null;
  const base = CHECKLIST_SOURCES[ownerKind](ownerId, {});
  return { ...base, label: str(r.label) || base.label };   // moduleKey/ชนิด มาจากทะเบียนเสมอ (ไม่เชื่อค่าบนกระดาน)
}

export const ownerKeyOf = (s: { ownerKind: string; ownerId: string }) => `${s.ownerKind}:${s.ownerId}`;

/** 1 ข้อในกล่อง */
export type ChecklistRow = { id: string; title: string; done: boolean; who?: string | null };

/** เช็กลิสต์กลาง (erp_record_tasks) → ข้อในกล่อง · "เสร็จ" = resolved */
export const rowsFromRecordTasks = (list: { id: string; title: string; status: string; assigned_name?: string | null }[]): ChecklistRow[] =>
  list.map((t) => ({ id: t.id, title: t.title, done: t.status === "resolved", who: t.assigned_name ?? null }));

const SUB_DONE = new Set(["approved", "posted", "done"]);
/** งานย่อยของ Task → ข้อในกล่อง (ยกเลิกแล้ว = ไม่โชว์) · เสร็จ = อนุมัติ/โพสต์/เสร็จ (กฎเดียวกับการ์ดงาน) */
export const rowsFromSubtasks = (list: { id: string; title: string; status: string }[]): ChecklistRow[] =>
  list.filter((s) => s.status !== "canceled").map((s) => ({ id: s.id, title: s.title, done: SUB_DONE.has(s.status) }));

export const BOX_W = 250;
const PAD = 10, FONT = 6, ROW_GAP = 4;
const lineH = (fs: number) => Math.round(fs * 1.35);
const COLORS = { bg: "#fef3c7", stroke: "#d97706", head: "#78350f", text: "#713f12", done: "#a8a29e", add: "#b45309" };

/** ลายเซ็นของสิ่งที่โชว์ในกล่อง — ตรงกัน = ไม่ต้องสร้างกล่องใหม่ตอนซิงค์ */
export const boxSig = (src: ChecklistSource, rows: ChecklistRow[], canAdd: boolean) =>
  JSON.stringify([src.label, canAdd, rows.map((r) => [r.id, r.title, r.done ? 1 : 0, r.who ?? ""])]);

/** โครงกล่องเช็กลิสต์ (พิกัดจริงบนกระดาน — ใส่ด้วย insert {scene:true}) · at = มุมซ้ายบนของกล่อง
 *  canAdd = โชว์ปุ่ม "+ เพิ่มข้อ" (เฉพาะเช็กลิสต์กลาง และคนที่แก้กระดานได้) */
export function checklistBoxSkeleton(src: ChecklistSource, rows: ChecklistRow[], at: { x: number; y: number }, ownerGid: string, canAdd: boolean): El[] {
  const gid = `${CHECKLIST_BOX_KIND}-${Math.random().toString(36).slice(2, 9)}`;
  const owner = { owner_kind: src.ownerKind, owner_id: src.ownerId, owner_gid: ownerGid, src };
  const boxData = { kind: CHECKLIST_BOX_KIND, id: ownerKeyOf(src), ...owner, label: src.label, _sig: boxSig(src, rows, canAdd), tooltip: "กล่องเช็กลิสต์ — กดปุ่ม \"พับเช็กลิสต์\" เพื่อเก็บ" };
  const done = rows.filter((r) => r.done).length;
  const els: El[] = [];
  const txt = (x: number, y: number, text: string, fontSize: number, strokeColor: string, customData: Record<string, unknown>): El =>
    ({ type: "text", x, y, text, fontSize, fontFamily: FONT, strokeColor, groupIds: [gid], customData });
  let y = at.y + PAD;
  const head = `เช็กลิสต์ ${done}/${rows.length}\n${wrapCardText(src.label, 26, 2)}`;
  const headEl = txt(at.x + PAD, y, head, 13, COLORS.head, boxData);
  y += head.split("\n").length * lineH(13) + 6;
  const rowEls: El[] = [];
  const tip = src.type === "record" ? "ดับเบิลคลิก = ติ๊กเสร็จ/เอาติ๊กออก" : "ดับเบิลคลิก = เปิดงาน (งานย่อยติ๊กในงาน)";
  for (const r of rows) {
    const body = wrapCardText(r.who ? `${r.title} · ${r.who}` : r.title, 28, 3);
    const lines = body.split("\n");
    const text = lines.map((l, i) => (i === 0 ? `${r.done ? "☑" : "☐"} ${l}` : `   ${l}`)).join("\n");
    const h = lines.length * lineH(12);
    const itemData = { kind: CHECKLIST_ITEM_KIND, id: r.id, done: r.done, title: r.title, ...owner, tooltip: tip };
    rowEls.push(txt(at.x + PAD, y, text, 12, r.done ? COLORS.done : COLORS.text, itemData));
    // พื้นที่กดเต็มแถว (โปร่งใส · อยู่บนข้อความ) — ดับเบิลคลิกตรงไหนของแถวก็โดน
    rowEls.push({ type: "rectangle", x: at.x + 4, y: y - 2, width: BOX_W - 8, height: h + 4, strokeColor: "transparent", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, roughness: 0, groupIds: [gid], customData: itemData });
    y += h + ROW_GAP;
  }
  if (!rows.length) { rowEls.push(txt(at.x + PAD, y, "— ยังไม่มีข้อ —", 12, COLORS.done, boxData)); y += lineH(12) + ROW_GAP; }
  if (canAdd) {
    const addData = { kind: CHECKLIST_ADD_KIND, id: ownerKeyOf(src), ...owner, label: src.label, tooltip: "ดับเบิลคลิก = เพิ่มข้อใหม่" };
    y += 2;
    rowEls.push(txt(at.x + PAD, y, "+ เพิ่มข้อ", 12, COLORS.add, addData));
    rowEls.push({ type: "rectangle", x: at.x + 4, y: y - 2, width: BOX_W - 8, height: lineH(12) + 4, strokeColor: "transparent", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, roughness: 0, groupIds: [gid], customData: addData });
    y += lineH(12) + ROW_GAP;
  }
  const H = y - at.y + PAD - ROW_GAP;
  els.push({ type: "rectangle", x: at.x, y: at.y, width: BOX_W, height: H, backgroundColor: COLORS.bg, strokeColor: COLORS.stroke, fillStyle: "solid", strokeWidth: 1, roughness: 0, roundness: { type: 3 }, groupIds: [gid], customData: { ...boxData, _frame: true } });
  els.push(headEl, ...rowEls);
  return els;
}

/** กรอบของการ์ด (กลุ่ม gid) = สี่เหลี่ยมใหญ่สุดที่มี customData.kind */
export function ownerFrame(elements: El[], gid: string): El | null {
  let best: El | null = null, area = -1;
  for (const el of elements) {
    if (el.isDeleted || el.type !== "rectangle" || gidOf(el) !== gid || !str(cdOf(el)?.kind)) continue;
    const a = (Number(el.width) || 0) * (Number(el.height) || 0);
    if (a > area) { area = a; best = el; }
  }
  return best;
}

export type BoardBox = { gid: string; ownerGid: string; source: ChecklistSource | null; frame: El | null; sig: string; elementIds: string[]; linkIds: string[] };

/** กล่องเช็กลิสต์ทั้งหมดบนกระดาน (พร้อมชิ้นส่วน + เส้นของแต่ละกล่อง) */
export function findChecklistBoxes(elements: El[]): BoardBox[] {
  const byGid = new Map<string, BoardBox>();
  for (const el of elements) {
    if (el.isDeleted) continue;
    const d = cdOf(el);
    if (!d || !isChecklistPartKind(d.kind)) continue;
    const gid = gidOf(el); if (!gid) continue;
    let b = byGid.get(gid);
    if (!b) {
      b = { gid, ownerGid: str(d.owner_gid), source: parseSource(d.src), frame: null, sig: "", elementIds: [], linkIds: [] };
      byGid.set(gid, b);
    }
    b.elementIds.push(String(el.id));
    if (d.kind === CHECKLIST_BOX_KIND && d._frame) { b.frame = el; b.sig = str(d._sig); }
  }
  const boxes = [...byGid.values()];
  for (const el of elements) {
    if (el.isDeleted) continue;
    const og = str(cdOf(el)?.checklist_link); if (!og) continue;
    for (const b of boxes) if (b.ownerGid === og) b.linkIds.push(String(el.id));
  }
  return boxes;
}

/** การ์ด/กล่องที่เลือกอยู่ → การ์ดเจ้าของเช็กลิสต์ (gid + ที่มา) · เลือกกล่องเอง = นับเป็นการ์ดเจ้าของกล่อง */
export function selectedChecklistOwner(elements: El[], selectedIds: Set<string>): { gid: string; source: ChecklistSource; open: boolean } | null {
  const boxes = findChecklistBoxes(elements);
  for (const el of elements) {
    if (el.isDeleted || !selectedIds.has(String(el.id))) continue;
    const d = cdOf(el);
    if (d && isChecklistPartKind(d.kind)) {
      const b = boxes.find((x) => x.gid === gidOf(el));
      if (b?.source) return { gid: b.ownerGid, source: b.source, open: true };
      continue;
    }
    const src = checklistSourceOf(d);
    const gid = gidOf(el);
    if (src && gid) return { gid, source: src, open: boxes.some((b) => b.ownerGid === gid) };
  }
  return null;
}

/** จุดวางกล่องใหม่ = ขวามือการ์ด เว้น 60 */
export function boxPlacement(frame: El): { x: number; y: number } {
  return { x: (Number(frame.x) || 0) + (Number(frame.width) || 0) + 60, y: Number(frame.y) || 0 };
}

/** เส้นจากขอบขวาการ์ด → ขอบซ้ายกล่อง (โครงก่อนผูก) · ผูกจริงด้วย linkBindingPatches หลังวาง */
export function linkSkeleton(ownerGid: string, from: El, to: { x: number; y: number }): El {
  const sx = (Number(from.x) || 0) + (Number(from.width) || 0) + 6, sy = (Number(from.y) || 0) + Math.min(30, (Number(from.height) || 0) / 2);
  const ex = to.x - 6, ey = to.y + 20;
  return { type: "arrow", x: sx, y: sy, points: [[0, 0], [ex - sx, ey - sy]], strokeColor: "#d97706", strokeWidth: 1, roughness: 0, strokeStyle: "dashed", endArrowhead: "arrow", customData: { checklist_link: ownerGid } };
}

/** ผูกปลายเส้นกับกรอบการ์ดและกรอบกล่อง (ลากการ์ด/กล่อง = เส้นตาม) → patch ต่อ element id */
export function linkBindingPatches(arrow: El, cardFrame: El, boxFrame: El): Map<string, El> {
  const out = new Map<string, El>();
  const bind = (el: El) => ({ elementId: String(el.id), focus: 0, gap: 6 });
  out.set(String(arrow.id), { startBinding: bind(cardFrame), endBinding: bind(boxFrame) });
  const add = (el: El) => {
    const cur = ((el.boundElements as { id: string; type: string }[] | null | undefined) ?? []).filter((b) => b.id !== String(arrow.id));
    return { boundElements: [...cur, { id: String(arrow.id), type: "arrow" }] };
  };
  out.set(String(cardFrame.id), add(cardFrame));
  out.set(String(boxFrame.id), add(boxFrame));
  return out;
}
