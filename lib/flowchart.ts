// ============================================================
// flowchart — ตรรกะล้วนของ "กระดาน flowchart กลาง" (components/flowchart-board)
//
// เก็บรูปแบบข้อมูลกระดาน + ชนิดกล่อง + สี + การรวมงานเวลามีคนแก้พร้อมกัน (3-way merge)
// ไม่มี React / ไม่มี @xyflow — เทสต์ได้ (lib/__tests__/flowchart.test.ts)
// บันทึกผ่าน /api/canvas-sketch (ตารางกลาง erp_canvas_sketches) โดย scene = FlowScene (kind: "flowchart")
// ============================================================

import { cleanExtList } from "./file-types";
import { isPlaceKey, storagePlaceOf } from "./storage-places";

export const FLOW_KINDS = ["start", "step", "question", "storage", "file", "folder", "note", "zone"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

export const FLOW_COLORS = ["slate", "violet", "emerald", "blue", "amber", "rose", "cyan"] as const;
export type FlowColor = (typeof FLOW_COLORS)[number];

/** สีของกล่อง (hex — ใช้ทั้งบนจอและตอนบันทึกเป็นรูป ให้หน้าตาเหมือนกัน) */
export const FLOW_PALETTE: Record<FlowColor, { stroke: string; fill: string; text: string; sub: string; th: string; en: string }> = {
  slate:   { stroke: "#64748b", fill: "#ffffff", text: "#1e293b", sub: "#64748b", th: "เทา",   en: "Gray" },
  violet:  { stroke: "#7c3aed", fill: "#f5f3ff", text: "#4c1d95", sub: "#6d28d9", th: "ม่วง",  en: "Violet" },
  emerald: { stroke: "#059669", fill: "#ecfdf5", text: "#064e3b", sub: "#047857", th: "เขียว", en: "Green" },
  blue:    { stroke: "#2563eb", fill: "#eff6ff", text: "#1e3a8a", sub: "#1d4ed8", th: "ฟ้า",   en: "Blue" },
  amber:   { stroke: "#d97706", fill: "#fffbeb", text: "#78350f", sub: "#b45309", th: "เหลือง", en: "Amber" },
  rose:    { stroke: "#e11d48", fill: "#fff1f2", text: "#881337", sub: "#be123c", th: "แดง",   en: "Red" },
  cyan:    { stroke: "#0891b2", fill: "#ecfeff", text: "#164e63", sub: "#0e7490", th: "ฟ้าอมเขียว", en: "Cyan" },
};

/** ค่าเริ่มต้นของกล่องแต่ละชนิด (ขนาด/สี/ข้อความ/ไอคอนปุ่ม) */
export const FLOW_KIND_META: Record<FlowKind, { w: number; h: number; color: FlowColor; th: string; en: string; hintTh: string; hintEn: string; icon: string }> = {
  start:    { w: 160, h: 56,  color: "slate",   th: "เริ่ม / จบ",   en: "Start / end", hintTh: "จุดเริ่มหรือจุดจบของขั้นตอน", hintEn: "Where the flow starts or ends", icon: "i:player-play" },
  step:     { w: 170, h: 64,  color: "slate",   th: "ขั้นตอน",      en: "Step",        hintTh: "สิ่งที่ต้องทำ 1 อย่าง", hintEn: "One thing to do", icon: "i:list" },
  question: { w: 190, h: 104, color: "amber",   th: "คำถาม ใช่/ไม่ใช่", en: "Yes/no question", hintTh: "แยกทาง — ลากเส้นออก 2 เส้น ระบบใส่ ใช่ / ไม่ใช่ ให้", hintEn: "Branch — draw 2 lines out, labelled yes / no", icon: "i:help-circle" },
  storage:  { w: 180, h: 96,  color: "violet",  th: "ที่เก็บ",      en: "Storage",     hintTh: "ที่เก็บไฟล์/ข้อมูล เช่น R2 · Supabase · Drive", hintEn: "Where files/data live, e.g. R2 · Supabase · Drive", icon: "i:database" },
  file:     { w: 200, h: 120, color: "slate",   th: "ไฟล์",         en: "File",        hintTh: "ประเภทไฟล์ เช่น JPG · CR2 · PSD · AI · PDF (เลือกได้หลายชนิด)", hintEn: "File types, e.g. JPG · CR2 · PSD · AI · PDF (pick several)", icon: "i:files" },
  folder:   { w: 220, h: 64,  color: "cyan",    th: "โฟลเดอร์",     en: "Folder",      hintTh: "ทางลัด ดับเบิลคลิกเปิดโฟลเดอร์ในเครื่อง", hintEn: "Shortcut — double-click opens a local folder", icon: "i:folder" },
  note:     { w: 220, h: 110, color: "amber",   th: "โน้ต",         en: "Note",        hintTh: "จดอธิบายเพิ่ม", hintEn: "Extra notes", icon: "i:notes" },
  zone:     { w: 480, h: 320, color: "blue",    th: "กรอบโซน",      en: "Zone",        hintTh: "กรอบใหญ่ครอบหลายกล่อง เช่น ในออฟฟิศ / บนคลาวด์ — ลากหัวกรอบ = ย้ายทั้งกลุ่ม", hintEn: "Big frame around boxes, e.g. Office / Cloud — drag its title to move everything inside", icon: "i:circle-dashed" },
};

/** exts = นามสกุลไฟล์ของกล่อง "ไฟล์" (เช่น ["cr2","jpg"]) — ไอคอน/สีจาก lib/file-types */
/** place = ที่เก็บของกล่อง "ที่เก็บ" (drive · r2 · supabase · nas ...) — ไอคอน/ชื่อจาก lib/storage-places · ไม่มี = ทรงกระบอกเดิม */
export type FlowNodeData = { label: string; color?: FlowColor; path?: string; exts?: string[]; place?: string };
export type FlowSceneNode = { id: string; type: FlowKind; position: { x: number; y: number }; width: number; height: number; data: FlowNodeData };
export type FlowSceneEdge = { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null; label: string };
export type FlowScene = { kind: "flowchart"; v: 1; nodes: FlowSceneNode[]; edges: FlowSceneEdge[] };

export const EMPTY_FLOW_SCENE: FlowScene = { kind: "flowchart", v: 1, nodes: [], edges: [] };

/** จุดต่อเส้น 4 ด้านของกล่อง (id ของ handle) */
export const FLOW_HANDLES = ["t", "r", "b", "l"] as const;
export type FlowHandle = (typeof FLOW_HANDLES)[number];

export const GRID = 20;
export const snap = (v: number): number => Math.round(v / GRID) * GRID;

const isKind = (v: unknown): v is FlowKind => typeof v === "string" && (FLOW_KINDS as readonly string[]).includes(v);
const isColor = (v: unknown): v is FlowColor => typeof v === "string" && (FLOW_COLORS as readonly string[]).includes(v);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const handleOrNull = (v: unknown): string | null => (typeof v === "string" && (FLOW_HANDLES as readonly string[]).includes(v) ? v : null);

/** สีที่ใช้จริงของกล่อง (ไม่ได้เลือก = สีตั้งต้นของชนิด) */
export const nodeColor = (kind: FlowKind, data: Partial<FlowNodeData> | undefined): FlowColor =>
  isColor(data?.color) ? data!.color! : FLOW_KIND_META[kind].color;

/** รับข้อมูลดิบจากฐานข้อมูล → FlowScene ที่ปลอดภัย · ไม่ใช่กระดาน flowchart (เช่น กระดาน Excalidraw) = null */
export function parseFlowScene(raw: unknown): FlowScene | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.kind !== "flowchart") return null;
  const nodes: FlowSceneNode[] = [];
  const ids = new Set<string>();
  for (const n of Array.isArray(r.nodes) ? r.nodes : []) {
    const o = (n ?? {}) as Record<string, unknown>;
    const id = str(o.id); if (!id || ids.has(id) || !isKind(o.type)) continue;
    const meta = FLOW_KIND_META[o.type];
    const pos = (o.position ?? {}) as Record<string, unknown>;
    const d = (o.data ?? {}) as Record<string, unknown>;
    const data: FlowNodeData = { label: str(d.label) };
    if (isColor(d.color)) data.color = d.color;
    if (typeof d.path === "string" && d.path) data.path = d.path;
    const exts = cleanExtList(d.exts);
    if (exts.length) data.exts = exts;
    if (isPlaceKey(d.place)) data.place = d.place;
    nodes.push({ id, type: o.type, position: { x: num(pos.x, 0), y: num(pos.y, 0) }, width: Math.max(40, num(o.width, meta.w)), height: Math.max(30, num(o.height, meta.h)), data });
    ids.add(id);
  }
  const edges: FlowSceneEdge[] = [];
  const eids = new Set<string>();
  for (const e of Array.isArray(r.edges) ? r.edges : []) {
    const o = (e ?? {}) as Record<string, unknown>;
    const id = str(o.id); const source = str(o.source); const target = str(o.target);
    if (!id || eids.has(id) || !ids.has(source) || !ids.has(target)) continue;
    edges.push({ id, source, target, sourceHandle: handleOrNull(o.sourceHandle), targetHandle: handleOrNull(o.targetHandle), label: str(o.label) });
    eids.add(id);
  }
  return { kind: "flowchart", v: 1, nodes, edges };
}

/** โหนด/เส้นของ React Flow (มีค่าระหว่างใช้งาน เช่น selected/dragging/measured) → FlowScene สำหรับบันทึก */
type NodeLike = { id: string; type?: string; position: { x: number; y: number }; width?: number | null; height?: number | null; measured?: { width?: number; height?: number }; data?: unknown };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; label?: unknown };
export function toFlowScene(nodes: NodeLike[], edges: EdgeLike[]): FlowScene {
  return parseFlowScene({
    kind: "flowchart",
    nodes: nodes.map((n) => ({
      id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      width: Math.round(n.width ?? n.measured?.width ?? 0) || undefined,
      height: Math.round(n.height ?? n.measured?.height ?? 0) || undefined,
      data: n.data,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null, label: typeof e.label === "string" ? e.label : "" })),
  }) ?? EMPTY_FLOW_SCENE;
}

/** ลายเซ็นของกระดาน — เทียบว่า "เนื้อหาเปลี่ยนจริง" ไหม (ไม่นับการเลือก/ซูม) */
export const flowSceneSig = (s: FlowScene): string => JSON.stringify(s);

/** ป้ายเส้นอัตโนมัติ: ลากเส้นออกจากกล่องคำถาม เส้นแรก = ใช่ · เส้นที่สอง = ไม่ใช่ · กล่องอื่นไม่ใส่ */
export function autoEdgeLabel(sourceKind: FlowKind | undefined, existingLabels: string[], t: (th: string, en: string) => string): string {
  if (sourceKind !== "question") return "";
  const yes = t("ใช่", "Yes"), no = t("ไม่ใช่", "No");
  if (!existingLabels.includes(yes)) return yes;
  if (!existingLabels.includes(no)) return no;
  return "";
}

export const newFlowId = (prefix: "n" | "e"): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

/** ขนาดกล่อง "ที่เก็บ" แบบมีไอคอน (ไอคอน + ชื่อ ไม่มีกรอบ) */
export const STORAGE_ICON_SIZE = { w: 180, h: 120 } as const;

/** ขนาดขั้นต่ำของกล่อง "ที่เก็บ" ตามว่ามีไอคอนไหม + มีไอคอนไฟล์กี่ตัว (แถวละ 6) */
export function storageNodeSize(hasPlace: boolean, extCount: number): { w: number; h: number } {
  const base = hasPlace ? STORAGE_ICON_SIZE : { w: FLOW_KIND_META.storage.w, h: FLOW_KIND_META.storage.h };
  if (!extCount) return { ...base };
  const rows = Math.ceil(extCount / 6);
  return { w: Math.max(base.w, snap(Math.min(6, extCount) * 23 + 40)), h: snap(base.h + rows * 26 + (hasPlace ? 0 : 20)) };
}

/** กล่องที่อยู่ในกรอบโซนทั้งกล่อง (ไว้ย้ายตามตอนลากกรอบ) — ไม่นับตัวกรอบเอง */
export function nodesInsideZone(zone: Pick<FlowSceneNode, "id" | "position" | "width" | "height">, nodes: Pick<FlowSceneNode, "id" | "position" | "width" | "height">[]): string[] {
  const x0 = zone.position.x, y0 = zone.position.y, x1 = x0 + zone.width, y1 = y0 + zone.height;
  return nodes.filter((n) => n.id !== zone.id
    && n.position.x >= x0 && n.position.y >= y0 && n.position.x + n.width <= x1 && n.position.y + n.height <= y1).map((n) => n.id);
}

/** ขนาดกล่อง "ไฟล์" ที่พอดีกับจำนวนไอคอน (แถวละ 4 ไอคอน) */
export function fileNodeSize(count: number): { w: number; h: number } {
  const n = Math.max(1, count);
  const perRow = Math.min(4, n);
  const rows = Math.ceil(n / 4);
  return { w: Math.max(FLOW_KIND_META.file.w, snap(perRow * 44 + 40)), h: Math.max(FLOW_KIND_META.file.h, snap(64 + rows * 46)) };
}

// ── ขนาดไอคอนในกล่อง: โตตามกล่อง (ลากมุมกล่อง หรือปุ่ม − / + บนแถบเครื่องมือ) ──
//   กล่องที่มีไอคอน = "ไฟล์" + "ที่เก็บ" ที่มีไอคอนที่เก็บหรือไอคอนไฟล์ · ขนาดตั้งต้นของกล่อง = 100% (หน้าตาเหมือนเดิม)
//   ไม่เก็บค่าเพิ่ม — คิดจากความกว้าง/สูงของกล่องเอง (บนกระดานกับตอนบันทึกเป็นรูปใช้สูตรเดียวกัน)
export const ICON_SCALE_MIN = 0.5;
export const ICON_SCALE_MAX = 4;
export const ICON_SCALE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4] as const;
type IconBoxLike = Pick<FlowSceneNode, "type" | "data">;
type IconBoxSized = IconBoxLike & Pick<FlowSceneNode, "width" | "height">;
const clampIconScale = (s: number) => Math.min(ICON_SCALE_MAX, Math.max(ICON_SCALE_MIN, s));

/** ขนาดกล่องตอนไอคอน 100% · null = กล่องนี้ไม่มีไอคอนให้ปรับ */
export function iconBoxBaseSize(n: IconBoxLike): { w: number; h: number } | null {
  const exts = n.data.exts?.length ?? 0;
  if (n.type === "file") return fileNodeSize(exts);
  if (n.type === "storage") {
    const place = isPlaceKey(n.data.place);
    return place || exts ? storageNodeSize(place, exts) : null;
  }
  return null;
}

/** ไอคอนตอนนี้กี่เท่าของขนาดตั้งต้น (ดูด้านที่แคบกว่า ไอคอนจะไม่ล้นกล่อง) · 0.5–4 */
export function flowIconScale(n: IconBoxSized): number {
  const base = iconBoxBaseSize(n);
  if (!base || !(n.width > 0) || !(n.height > 0)) return 1;
  return Math.round(clampIconScale(Math.min(n.width / base.w, n.height / base.h)) * 100) / 100;
}

/** ขนาดไอคอนจริง (px): file = ไอคอนกล่องไฟล์ · place = ไอคอนที่เก็บ · ext = แถวไอคอนไฟล์ใต้ชื่อที่เก็บ */
export function flowIconSizes(n: IconBoxSized): { file: number; place: number; ext: number } {
  const s = flowIconScale(n);
  const exts = n.data.exts?.length ?? 0;
  return { file: Math.round((exts > 4 ? 30 : 36) * s), place: Math.round(46 * s), ext: Math.round((isPlaceKey(n.data.place) ? 20 : 18) * s) };
}

/** ขั้นถัดไปของปุ่ม − / + (50% · 75% · 100% · 125% · 150% · 200% ... 400%) */
export function nextIconScale(cur: number, dir: 1 | -1): number {
  if (dir > 0) return ICON_SCALE_STEPS.find((v) => v > cur + 0.01) ?? ICON_SCALE_MAX;
  return [...ICON_SCALE_STEPS].reverse().find((v) => v < cur - 0.01) ?? ICON_SCALE_MIN;
}

/** ตั้งไอคอนเป็น scale เท่า: กล่อง = ขนาดตั้งต้น × scale · จุดกลางกล่องอยู่ที่เดิม · null = กล่องไม่มีไอคอน */
export function resizeIconBox(n: IconBoxSized & Pick<FlowSceneNode, "position">, scale: number): { position: { x: number; y: number }; width: number; height: number } | null {
  const base = iconBoxBaseSize(n);
  if (!base) return null;
  const s = clampIconScale(scale);
  const width = Math.round(base.w * s), height = Math.round(base.h * s);
  const cx = n.position.x + n.width / 2, cy = n.position.y + n.height / 2;
  return { position: { x: Math.round(cx - width / 2), y: Math.round(cy - height / 2) }, width, height };
}

/** เปลี่ยนไอคอน/ประเภทไฟล์ของกล่องเดิม → ขยายกล่องให้พอดี โดยไอคอนคงขนาดเดิม (ไม่ย่อกล่อง) */
export function refitIconBox(prev: IconBoxSized, nextData: FlowNodeData): { width: number; height: number } {
  const s = iconBoxBaseSize(prev) ? flowIconScale(prev) : 1;
  const base = iconBoxBaseSize({ type: prev.type, data: nextData });
  if (!base) return { width: prev.width, height: prev.height };
  return { width: Math.max(prev.width, Math.round(base.w * s)), height: Math.max(prev.height, Math.round(base.h * s)) };
}

/** สร้างกล่องใหม่ตามชนิด (ตำแหน่งชิดตาราง) */
export function makeFlowNode(kind: FlowKind, at: { x: number; y: number }, t: (th: string, en: string) => string, data?: Partial<FlowNodeData>): FlowSceneNode {
  const meta = FLOW_KIND_META[kind];
  const exts = kind === "file" || kind === "storage" ? cleanExtList(data?.exts) : [];
  const place = kind === "storage" && isPlaceKey(data?.place) ? data!.place! : "";
  const { w, h } = kind === "file" ? fileNodeSize(exts.length) : place ? STORAGE_ICON_SIZE : { w: meta.w, h: meta.h };
  const defLabel = place ? t(storagePlaceOf(place)!.th, storagePlaceOf(place)!.en) : t(meta.th, meta.en);
  return {
    id: newFlowId("n"), type: kind,
    position: { x: snap(at.x - w / 2), y: snap(at.y - h / 2) },
    width: w, height: h,
    data: { label: data?.label ?? defLabel, ...(data?.color ? { color: data.color } : {}), ...(data?.path ? { path: data.path } : {}), ...(exts.length ? { exts } : {}), ...(place ? { place } : {}) },
  };
}

/** ย้ายแม่แบบไปวางเพิ่มบนกระดาน: ตั้ง id ใหม่ทั้งหมด (กันชนของเดิม) + เลื่อนไปทางขวาของของเดิม */
export function cloneFlowSceneAt(tpl: FlowScene, existing: FlowScene): FlowScene {
  const idMap = new Map<string, string>();
  for (const n of tpl.nodes) idMap.set(n.id, newFlowId("n"));
  const maxX = existing.nodes.reduce((m, n) => Math.max(m, n.position.x + n.width), Number.NEGATIVE_INFINITY);
  const minX = tpl.nodes.reduce((m, n) => Math.min(m, n.position.x), Number.POSITIVE_INFINITY);
  const dx = Number.isFinite(maxX) && Number.isFinite(minX) ? snap(maxX + 120 - minX) : 0;
  return {
    kind: "flowchart", v: 1,
    nodes: tpl.nodes.map((n) => ({ ...n, id: idMap.get(n.id)!, position: { x: n.position.x + dx, y: n.position.y } })),
    edges: tpl.edges.filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({ ...e, id: newFlowId("e"), source: idMap.get(e.source)!, target: idMap.get(e.target)! })),
  };
}

/**
 * รวมงานเมื่อมีคนบันทึกแทรก (3 ทาง): base = ที่เราโหลดมา · mine = ของเราตอนนี้ · theirs = ล่าสุดในฐานข้อมูล
 *   - ทั้งสองฝั่งมี: เรายังไม่แตะ (mine == base) → เอาของเขา · เราแก้ → เอาของเรา
 *   - มีแต่ฝั่งเรา: เคยมีใน base แต่เขาลบ และเราไม่ได้แก้ → ลบตาม · นอกนั้น (เราเพิ่มใหม่ / เราแก้หลังเขาลบ) → เก็บของเรา
 *   - มีแต่ฝั่งเขา: เคยมีใน base = เราลบ → ลบ · ไม่เคยมี = เขาเพิ่มใหม่ → เก็บ
 *   - เส้นที่ปลายหายไป → ตัดทิ้ง
 */
export function mergeFlowScenes(base: FlowScene, mine: FlowScene, theirs: FlowScene): FlowScene {
  const mergeList = <T extends { id: string }>(b: T[], m: T[], th: T[]): T[] => {
    const bm = new Map(b.map((x) => [x.id, JSON.stringify(x)]));
    const tm = new Map(th.map((x) => [x.id, x]));
    const out: T[] = [];
    const seen = new Set<string>();
    for (const x of m) {
      seen.add(x.id);
      const baseSig = bm.get(x.id);
      const untouched = baseSig !== undefined && baseSig === JSON.stringify(x);
      const other = tm.get(x.id);
      if (other) out.push(untouched ? other : x);
      else if (!(baseSig !== undefined && untouched)) out.push(x);
    }
    for (const x of th) if (!seen.has(x.id) && !bm.has(x.id)) out.push(x);
    return out;
  };
  const nodes = mergeList(base.nodes, mine.nodes, theirs.nodes);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = mergeList(base.edges, mine.edges, theirs.edges).filter((e) => ids.has(e.source) && ids.has(e.target));
  return { kind: "flowchart", v: 1, nodes, edges };
}

/** จุดต่อเส้นของกล่อง (พิกัดบนกระดาน) — ใช้ตอนวาดเส้นในรูปที่บันทึก */
export function handlePoint(n: Pick<FlowSceneNode, "position" | "width" | "height">, h: string | null | undefined): { x: number; y: number; side: FlowHandle } {
  const { x, y } = n.position; const w = n.width; const hh = n.height;
  switch (h) {
    case "t": return { x: x + w / 2, y, side: "t" };
    case "b": return { x: x + w / 2, y: y + hh, side: "b" };
    case "l": return { x, y: y + hh / 2, side: "l" };
    default:  return { x: x + w, y: y + hh / 2, side: "r" };
  }
}

/** กรอบที่ครอบทุกกล่อง (ใช้ตอนบันทึกเป็นรูป) */
export function flowSceneBounds(s: FlowScene, pad = 40): { x: number; y: number; w: number; h: number } {
  if (!s.nodes.length) return { x: 0, y: 0, w: 2 * pad, h: 2 * pad };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of s.nodes) {
    x0 = Math.min(x0, n.position.x); y0 = Math.min(y0, n.position.y);
    x1 = Math.max(x1, n.position.x + n.width); y1 = Math.max(y1, n.position.y + n.height);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}

/** แยกข้อความในกล่อง: บรรทัดแรก = หัว (ตัวหนา) · ที่เหลือ = คำอธิบาย (ตัวเล็ก) */
export function splitFlowLabel(label: string): { title: string; sub: string } {
  const [title = "", ...rest] = (label ?? "").split("\n");
  return { title, sub: rest.join("\n") };
}

// ── คัดลอก / วาง ──────────────────────────────────────────────
// ก้อนคัดลอก = กล่องที่เลือก + เส้นที่ต่อ "ระหว่างกล่องที่เลือก" เท่านั้น (เส้นที่ปลายอีกข้างไม่ได้เลือก ไม่เอาไปด้วย)
// เก็บลงคลิปบอร์ด 2 แบบ: แบบกระดาน (JSON ชนิดพิเศษ — วางในกระดาน flowchart ได้ทุกหน้า/ทุกแท็บ) + ข้อความอ่านง่าย (วางใน LINE/Word ได้)

export const FLOW_CLIP_MIME = "application/x-erp-flowchart+json";
export type FlowClip = { kind: "flowchart-clip"; v: 1; nodes: FlowSceneNode[]; edges: FlowSceneEdge[] };

/** กล่องที่เลือก → ก้อนคัดลอก · ไม่ได้เลือกกล่องเลย = null */
export function copyFlowSelection(scene: FlowScene, nodeIds: Iterable<string>): FlowClip | null {
  const want = new Set(nodeIds);
  const nodes = scene.nodes.filter((n) => want.has(n.id));
  if (!nodes.length) return null;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = scene.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { kind: "flowchart-clip", v: 1, nodes, edges };
}

/** ก้อนคัดลอก → ข้อความอ่านง่าย (เรียงบนลงล่าง ซ้ายไปขวา · 1 กล่อง 1 บรรทัด) */
export function flowClipText(clip: FlowClip): string {
  return [...clip.nodes]
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((n) => [
      n.data.label.split("\n").map((s) => s.trim()).filter(Boolean).join(" · ") + (n.data.exts?.length ? ` (${n.data.exts.map((e) => e.toUpperCase()).join(", ")})` : ""),
      n.data.path,
    ].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n");
}

export const serializeFlowClip = (clip: FlowClip): string => JSON.stringify(clip);

/** อ่านก้อนคัดลอกจากคลิปบอร์ด (ตรวจ/ทำความสะอาดเหมือนตอนโหลดกระดาน) · ไม่ใช่ของกระดาน = null */
export function parseFlowClip(raw: unknown): FlowClip | null {
  let o: unknown = raw;
  if (typeof raw === "string") { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== "object" || (o as Record<string, unknown>).kind !== "flowchart-clip") return null;
  const r = o as Record<string, unknown>;
  const s = parseFlowScene({ kind: "flowchart", nodes: r.nodes, edges: r.edges });
  if (!s || !s.nodes.length) return null;
  return { kind: "flowchart-clip", v: 1, nodes: s.nodes, edges: s.edges };
}

/**
 * วางก้อนคัดลอกลงกระดาน: ตั้ง id ใหม่ทั้งหมด (วางซ้ำกี่ครั้งก็ไม่ชนกัน)
 *   center = จุดที่จะวาง (กลางก้อนไปอยู่ตรงนั้น เช่น ตำแหน่งเมาส์) · ไม่ส่ง = ที่เดิม
 *   nudge  = เลื่อนเพิ่มเฉียงลงขวา (ทำซ้ำ/วางซ้ำที่เดิม จะได้ไม่ทับกันสนิท)
 */
export function placeFlowClip(clip: FlowClip, center?: { x: number; y: number } | null, nudge = 0): FlowScene {
  const b = flowSceneBounds({ ...EMPTY_FLOW_SCENE, nodes: clip.nodes }, 0);
  const dx = (center ? snap(center.x - (b.x + b.w / 2)) : 0) + nudge;
  const dy = (center ? snap(center.y - (b.y + b.h / 2)) : 0) + nudge;
  const idMap = new Map<string, string>();
  for (const n of clip.nodes) idMap.set(n.id, newFlowId("n"));
  return {
    kind: "flowchart", v: 1,
    nodes: clip.nodes.map((n) => ({ ...n, id: idMap.get(n.id)!, position: { x: n.position.x + dx, y: n.position.y + dy }, data: { ...n.data } })),
    edges: clip.edges.filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({ ...e, id: newFlowId("e"), source: idMap.get(e.source)!, target: idMap.get(e.target)! })),
  };
}

/** ข้อความธรรมดาที่วางมาจากที่อื่น (LINE/Word/เว็บ) → กล่องใหม่ 1 กล่อง: สั้น = กล่องขั้นตอน · ยาว/หลายบรรทัด = โน้ต */
export function textToFlowNode(text: string, at: { x: number; y: number }, t: (th: string, en: string) => string): FlowSceneNode | null {
  const s = (text ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
  if (!s) return null;
  const lines = s.split("\n");
  const short = lines.length <= 2 && s.length <= 60;
  const node = makeFlowNode(short ? "step" : "note", at, t, { label: s });
  if (!short) {
    const rows = lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / 30)), 0);   // ~30 ตัวอักษรต่อบรรทัดที่กว้าง 220
    node.height = Math.min(480, Math.max(FLOW_KIND_META.note.h, snap(30 + rows * 17)));
  }
  return node;
}
