// ============================================================
// flowchart — ตรรกะล้วนของ "กระดาน flowchart กลาง" (components/flowchart-board)
//
// เก็บรูปแบบข้อมูลกระดาน + ชนิดกล่อง + สี + การรวมงานเวลามีคนแก้พร้อมกัน (3-way merge)
// ไม่มี React / ไม่มี @xyflow — เทสต์ได้ (lib/__tests__/flowchart.test.ts)
// บันทึกผ่าน /api/canvas-sketch (ตารางกลาง erp_canvas_sketches) โดย scene = FlowScene (kind: "flowchart")
// ============================================================

import { cleanExtList } from "./file-types";
import { isPlaceKey, storagePlaceOf } from "./storage-places";
import { isAppKey, isErpPageHref } from "./menu-pages";
import { isFlowAlign, isHexColor, sanitizeRich, type FlowAlign } from "./flowchart-rich";
import { cleanAuto, type FlowAuto } from "./flow-automation";
import { DEFAULT_SHAPE, flowShapeOf, isShapeKey } from "./flowchart-shapes";
import { isFlowStyle, type FlowStyleKey } from "./flowchart-styles";

/** ลำดับ = ลำดับปุ่มบนแถบเครื่องมือ (กล่อง · ข้อความ ขึ้นก่อน — เจ้าของสั่ง 2026-11-19) */
export const FLOW_KINDS = ["step", "text", "start", "question", "storage", "file", "folder", "page", "note", "todo", "auto", "shape", "zone"] as const;
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
  step:     { w: 170, h: 64,  color: "slate",   th: "กล่อง",        en: "Box",         hintTh: "กล่องข้อความ / ขั้นตอน 1 อย่าง", hintEn: "A box — one step or idea", icon: "i:square" },
  text:     { w: 180, h: 40,  color: "slate",   th: "ข้อความ",      en: "Text",        hintTh: "ตัวหนังสืออิสระ ไม่มีกรอบ — ดับเบิลคลิกพิมพ์", hintEn: "Free text without a box — double-click to type", icon: "i:typography" },
  question: { w: 190, h: 104, color: "amber",   th: "คำถาม ใช่/ไม่ใช่", en: "Yes/no question", hintTh: "แยกทาง — ลากเส้นออก 2 เส้น ระบบใส่ ใช่ / ไม่ใช่ ให้", hintEn: "Branch — draw 2 lines out, labelled yes / no", icon: "i:help-circle" },
  storage:  { w: 180, h: 96,  color: "violet",  th: "ที่เก็บ",      en: "Storage",     hintTh: "ที่เก็บไฟล์/ข้อมูล เช่น R2 · Supabase · Drive", hintEn: "Where files/data live, e.g. R2 · Supabase · Drive", icon: "i:database" },
  file:     { w: 200, h: 120, color: "slate",   th: "ไฟล์",         en: "File",        hintTh: "ประเภทไฟล์ เช่น JPG · CR2 · PSD · AI · PDF (เลือกได้หลายชนิด)", hintEn: "File types, e.g. JPG · CR2 · PSD · AI · PDF (pick several)", icon: "i:files" },
  folder:   { w: 220, h: 64,  color: "cyan",    th: "โฟลเดอร์",     en: "Folder",      hintTh: "ทางลัด ดับเบิลคลิกเปิดโฟลเดอร์ในเครื่อง", hintEn: "Shortcut — double-click opens a local folder", icon: "i:folder" },
  page:     { w: 220, h: 80,  color: "emerald", th: "หน้าใน ERP",   en: "ERP page",    hintTh: "บอกว่าดูไฟล์ได้ที่หน้าไหนในระบบ — เลือกจากเมนูจริง · กด เปิด ↗ บนกล่อง = ไปหน้านั้น", hintEn: "Shows which ERP page has these files — picked from the real menu · click Open ↗ to go there", icon: "i:apps" },
  todo:     { w: 260, h: 150, color: "amber",   th: "รายการงาน",    en: "To-do list",  hintTh: "สิ่งที่ต้องทำหลายข้อ ติ๊กเมื่อเสร็จ — ครบทุกข้อกล่องเป็นสีเขียว", hintEn: "Several tasks with check boxes — turns green when all are done", icon: "i:list-check" },
  auto:     { w: 290, h: 160, color: "violet",  th: "อัตโนมัติ",     en: "Automation",  hintTh: "กฎ เมื่อ… ถ้า… ให้… (จดแผน + สถานะ — ระบบยังไม่ทำงานเอง)", hintEn: "When… if… then… rule (a plan with status — the system doesn't run it yet)", icon: "i:bolt" },
  shape:    { w: 180, h: 72,  color: "slate",   th: "รูปทรง",       en: "Shape",       hintTh: "รูปทรง flowchart มาตรฐาน (เอกสาร · ข้อมูลเข้า/ออก · รอ · ...)", hintEn: "Standard flowchart shapes (document · input/output · delay · ...)", icon: "i:category" },
  note:     { w: 220, h: 110, color: "amber",   th: "โน้ต",         en: "Note",        hintTh: "จดอธิบายเพิ่ม", hintEn: "Extra notes", icon: "i:notes" },
  zone:     { w: 480, h: 320, color: "blue",    th: "กรอบโซน",      en: "Zone",        hintTh: "กรอบใหญ่ครอบหลายกล่อง เช่น ในออฟฟิศ / บนคลาวด์ — ลากหัวกรอบ = ย้ายทั้งกลุ่ม", hintEn: "Big frame around boxes, e.g. Office / Cloud — drag its title to move everything inside", icon: "i:circle-dashed" },
};

/** exts = นามสกุลไฟล์ของกล่อง "ไฟล์" (เช่น ["cr2","jpg"]) — ไอคอน/สีจาก lib/file-types */
/** place = ที่เก็บของกล่อง "ที่เก็บ" (drive · r2 · supabase · nas ...) — ไอคอน/ชื่อจาก lib/storage-places · ไม่มี = ทรงกระบอกเดิม */
/** href/app/appName/icon = กล่อง "หน้าใน ERP": ลิงก์หน้าในระบบ (ขึ้นต้น "/") · รหัสแอป · ชื่อแอปตอนเลือก · ไอคอนเมนู — เลือกจากเมนูจริง (lib/menu-pages) */
/** rule = กล่อง "ที่เก็บ" ผูกกับกฎที่เก็บจริง (erp_storage_rules.rule_key · หน้า /master/storage-rules) → กระดานเตือนเมื่อแผนไม่ตรงกฎ */
/** rich = ข้อความจัดรูปแบบ (HTML ชุดเล็ก ผ่าน sanitizeRich เสมอ · label = ข้อความล้วนคู่กัน) · align = จัดชิดทั้งกล่อง · fill/stroke = สีพื้น/เส้นขอบกำหนดเอง #rrggbb (ทับสีชุด) — lib/flowchart-rich */
/** ข้อในกล่อง "รายการงาน" · by/at = ใครติ๊กเสร็จ เมื่อไหร่ (ISO) — เอาติ๊กออก = ลบ by/at */
/** rich = ข้อความจัดรูปแบบของข้อ (ตัวหนา/สี/ลิงก์ · ผ่าน sanitizeRich) — text = ข้อความล้วนคู่กันเสมอ */
/** tag = ป้ายความด่วนของข้อ (key ในรายการป้ายของกระดาน FlowScene.todoTags · ไม่มี = ไม่ติดป้าย) */
export type FlowTodo = { id: string; text: string; rich?: string; tag?: string; done?: boolean; by?: string; at?: string };
/** ป้ายของข้อในรายการงาน (ตั้งชื่อ/สีเองได้ระดับกระดาน · ลำดับในรายการ = ลำดับความด่วน ใช้ตอนเรียง) */
export type FlowTodoTag = { key: string; label: string; color: FlowColor };
export const DEFAULT_TODO_TAGS: FlowTodoTag[] = [
  { key: "urgent", label: "ด่วน", color: "rose" },
  { key: "normal", label: "ไม่ด่วน", color: "blue" },
  { key: "later", label: "ว่างค่อยทำ", color: "slate" },
];
const TAG_KEY_RE = /^[a-z0-9_-]{1,24}$/;
/** รายการป้ายจากข้อมูลดิบ → ค่าที่ปลอดภัย (≤ 12 ป้าย · ชื่อ ≤ 20 ตัว · key ซ้ำทิ้ง) · ว่าง/ผิดรูป = null (ใช้ค่าตั้งต้น) */
export function cleanTodoTags(raw: unknown): FlowTodoTag[] | null {
  if (!Array.isArray(raw)) return null;
  const out: FlowTodoTag[] = []; const seen = new Set<string>();
  for (const v of raw) {
    const o = (v ?? {}) as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key : ""; const label = typeof o.label === "string" ? o.label.trim().slice(0, 20) : "";
    if (!TAG_KEY_RE.test(key) || !label || seen.has(key)) continue;
    out.push({ key, label, color: isColor(o.color) ? o.color : "slate" }); seen.add(key);
    if (out.length >= 12) break;
  }
  return out.length ? out : null;
}
/** เรียงข้อ: ป้ายตามลำดับความด่วน → ไม่ติดป้าย → ข้อที่เสร็จแล้วล่างสุด (ลำดับเดิมคงไว้ในกลุ่มเดียวกัน) */
export function sortTodosByTag(items: FlowTodo[], tags: FlowTodoTag[]): FlowTodo[] {
  const rank = (i: FlowTodo) => (i.done ? 1000 : 0) + (i.tag ? (tags.findIndex((t) => t.key === i.tag) + 1 || tags.length + 1) : tags.length + 1);
  return items.map((it, idx) => ({ it, idx })).sort((a, b) => rank(a.it) - rank(b.it) || a.idx - b.idx).map((x) => x.it);
}
/** items = ข้อของกล่อง "รายการงาน" */
/** shape = รูปทรงของกล่องชนิด "shape" (lib/flowchart-shapes) · font = ฟอนต์ทั้งกล่อง (ชื่อ Google Font) */
/** style = สไตล์ของกล่อง (lib/flowchart-styles · ไม่มี = ตามกระดาน) */
/** line/opacity = กรอบโซน: แบบเส้น (ประ · ทึบ · ไม่มี) + ความเข้มพื้น 10-100 */
/** peek = การ์ด "หน้าใน ERP" แบบมีภาพ: on = โชว์ภาพในการ์ด · img = r2 key ภาพหน้าจอที่ถ่ายไว้ · at = เวลาถ่าย */
export type FlowPagePeek = { on?: boolean; img?: string; at?: string };
export type FlowNodeData = { peek?: FlowPagePeek; line?: "dash" | "solid" | "none"; opacity?: number; style?: FlowStyleKey; shape?: string; font?: string; items?: FlowTodo[]; auto?: FlowAuto; label: string; color?: FlowColor; path?: string; exts?: string[]; place?: string; href?: string; app?: string; appName?: string; icon?: string; rule?: string; rich?: string; align?: FlowAlign; fill?: string; stroke?: string };
export type FlowSceneNode = { id: string; type: FlowKind; position: { x: number; y: number }; width: number; height: number; data: FlowNodeData };
/** shape = แบบลูกศร: ไม่มี = หักมุม (แบบเดิม) · "straight" = ตรง · "curve" = โค้ง — เก็บเฉพาะตอนไม่ใช่หักมุม (กระดานเดิมไม่เปลี่ยน) */
/** color = สีเส้นที่ตั้งเอง #rrggbb (ไม่มี = ตามสไตล์กระดาน · เจ้าของสั่ง 2026-11-22) */
export type FlowSceneEdge = { id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null; label: string; shape?: Exclude<FlowEdgeShape, "step">; color?: string };

/** แบบลูกศร (หักมุม = แบบเดิม) · svg = ไอคอนเล็ก 16×16 บนปุ่ม */
export const FLOW_EDGE_SHAPES = ["step", "straight", "curve"] as const;
export type FlowEdgeShape = (typeof FLOW_EDGE_SHAPES)[number];
export const FLOW_EDGE_SHAPE_META: Record<FlowEdgeShape, { th: string; en: string; svg: string; head: string }> = {
  step:     { th: "หักมุม", en: "Elbow",    svg: "M2 13 H8 V3 H14",      head: "M11.5 0.8 L14 3 L11.5 5.2" },
  straight: { th: "ตรง",    en: "Straight", svg: "M2 13 L14 3",          head: "M10.6 3.6 L14 3 L12.8 6.3" },
  curve:    { th: "โค้ง",    en: "Curved",   svg: "M2 13 C9 13 7 3 14 3", head: "M11.5 0.8 L14 3 L11.5 5.2" },
};
export const isEdgeShape = (v: unknown): v is FlowEdgeShape => typeof v === "string" && (FLOW_EDGE_SHAPES as readonly string[]).includes(v);
/** แบบลูกศรของเส้น (ไม่ได้ตั้ง = หักมุม) */
export const edgeShapeOf = (e: { shape?: unknown } | null | undefined): FlowEdgeShape => (isEdgeShape(e?.shape) ? e!.shape as FlowEdgeShape : "step");
/**
 * pins = ตำแหน่งที่ย้ายของ "กล่องของระบบ" (ชั้นล็อก — หน้าแม่ส่ง locked มา เช่น แผนผังการทำงาน) · key = id กล่อง (ขึ้นต้น "sys:")
 * ไม่มี = ทุกกล่องของระบบอยู่ที่เดิม · เก็บเฉพาะตอนมีค่า (กระดานเดิมลายเซ็นไม่เปลี่ยน)
 */
export type FlowPins = Record<string, { x: number; y: number }>;
/** style = สไตล์ทั้งกระดาน (ไม่มี = ปกติ · เก็บเฉพาะตอนตั้ง) */
/** theme = ชุดสีของกระดาน (lib/flowchart-themes · ไม่มี = มาตรฐาน) */
export type FlowScene = { kind: "flowchart"; v: 1; nodes: FlowSceneNode[]; edges: FlowSceneEdge[]; pins?: FlowPins; style?: FlowStyleKey; theme?: string; todoTags?: FlowTodoTag[] };

/** กล่อง/เส้นของ "ชั้นล็อก" (ระบบสร้าง ไม่ได้เก็บในกระดาน) ขึ้นต้นด้วยคำนี้ — เส้นที่วาดเองต่อเข้ากล่องพวกนี้ได้ */
export const SYS_PREFIX = "sys:";
export const isSysId = (id: unknown): id is string => typeof id === "string" && id.startsWith(SYS_PREFIX) && id.length > SYS_PREFIX.length && id.length <= 80;
export const sysId = (id: string): string => `${SYS_PREFIX}${id}`;
export const unSysId = (id: string): string => (id.startsWith(SYS_PREFIX) ? id.slice(SYS_PREFIX.length) : id);

/** ตำแหน่งที่ย้ายของกล่องระบบ → ค่าที่ปลอดภัย (key ต้องขึ้นต้น sys: · ตัวเลขจริง · ปัดเป็นจำนวนเต็ม) */
export function cleanPins(raw: unknown): FlowPins {
  const out: FlowPins = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const o = (v ?? {}) as Record<string, unknown>;
    if (!isSysId(k) || typeof o.x !== "number" || typeof o.y !== "number" || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    out[k] = { x: Math.round(o.x), y: Math.round(o.y) };
  }
  return out;
}
const withPins = (s: FlowScene, pins: FlowPins): FlowScene => (Object.keys(pins).length ? { ...s, pins } : s);

/** รหัสกฎที่เก็บ (erp_storage_rules.rule_key) — ตัวเล็ก/ตัวเลข/ขีดล่าง */
export const isRuleKey = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v);

export const EMPTY_FLOW_SCENE: FlowScene = { kind: "flowchart", v: 1, nodes: [], edges: [] };

/** จุดต่อเส้น 4 ด้านของกล่อง (id ของ handle) */
export const FLOW_HANDLES = ["t", "r", "b", "l"] as const;
export type FlowHandle = (typeof FLOW_HANDLES)[number];

export const GRID = 20;
export const snap = (v: number): number => Math.round(v / GRID) * GRID;

/** ด้านของกล่อง (= id จุดต่อเส้น t/r/b/l) */
export type FlowSide = "t" | "r" | "b" | "l";
export const OPPOSITE_SIDE: Record<FlowSide, FlowSide> = { t: "b", b: "t", l: "r", r: "l" };
export const isFlowSide = (v: unknown): v is FlowSide => v === "t" || v === "r" || v === "b" || v === "l";
type Rect = { x: number; y: number; w: number; h: number };
/** "ขั้นตอนต่อไป" (กดจุดข้างกล่อง · เจ้าของสั่ง 2026-11-19): มุมซ้ายบนของกล่องใหม่ — ห่างจากกล่องต้นทางตามด้านที่กด
 *  ทับกล่องอื่น = เลื่อนตั้งฉากไปเรื่อย ๆ (ขวา/ซ้าย → เลื่อนลง · บน/ล่าง → เลื่อนขวา) */
export function nextNodePos(src: Rect, side: FlowSide, size: { w: number; h: number }, others: Rect[], gap = 80): { x: number; y: number } {
  let x: number, y: number;
  if (side === "r") { x = src.x + src.w + gap; y = src.y + src.h / 2 - size.h / 2; }
  else if (side === "l") { x = src.x - gap - size.w; y = src.y + src.h / 2 - size.h / 2; }
  else if (side === "b") { x = src.x + src.w / 2 - size.w / 2; y = src.y + src.h + gap * 0.75; }
  else { x = src.x + src.w / 2 - size.w / 2; y = src.y - gap * 0.75 - size.h; }
  const M = 12;
  const hit = (px: number, py: number) => others.some((o) => px < o.x + o.w + M && px + size.w + M > o.x && py < o.y + o.h + M && py + size.h + M > o.y);
  for (let i = 0; i < 40 && hit(x, y); i++) { if (side === "r" || side === "l") y += size.h + 30; else x += size.w + 40; }
  return { x: snap(x), y: snap(y) };
}

const isKind = (v: unknown): v is FlowKind => typeof v === "string" && (FLOW_KINDS as readonly string[]).includes(v);
const isColor = (v: unknown): v is FlowColor => typeof v === "string" && (FLOW_COLORS as readonly string[]).includes(v);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const handleOrNull = (v: unknown): string | null => (typeof v === "string" && ((FLOW_HANDLES as readonly string[]).includes(v) || isItemHandle(v)) ? v : null);
/** จุดต่อเส้นของข้อในรายการงาน (ริมขวาของข้อ · เจ้าของสั่ง 2026-11-22 "ลากเส้นจากรายการได้") = "i:<id ข้อ>" — ผูกกับข้อ ไม่ใช่ลำดับ */
//   ด้านซ้ายของข้อ = "il:<id ข้อ>" (เจ้าของสั่ง 2026-11-23 "เชื่อมจากด้านซ้ายได้ด้วย")
export const itemHandleId = (itemId: string, side: "r" | "l" = "r"): string => (side === "l" ? `il:${itemId}` : `i:${itemId}`);
export const isItemHandle = (v: unknown): v is string => typeof v === "string" && /^il?:[A-Za-z0-9_-]{1,40}$/.test(v);
export const itemOfHandle = (v: unknown): string | null => (isItemHandle(v) ? v.slice(v.indexOf(":") + 1) : null);
const itemSideOf = (v: unknown): "l" | "r" => (typeof v === "string" && v.startsWith("il:") ? "l" : "r");
/** เส้นที่ต่อกับข้อนี้ของกล่องนี้ (ไว้ลบตามตอนลบข้อ / หาปลายเส้น) */
export const edgesOfItem = <E extends { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>(edges: E[], nodeId: string, itemId: string): E[] =>
  edges.filter((e) => (e.source === nodeId && itemOfHandle(e.sourceHandle) === itemId) || (e.target === nodeId && itemOfHandle(e.targetHandle) === itemId));

/** สีที่ใช้จริงของกล่อง (ไม่ได้เลือก = สีตั้งต้นของชนิด) */
export const nodeColor = (kind: FlowKind, data: Partial<FlowNodeData> | undefined): FlowColor =>
  kind === "todo" && todoProgress(data?.items).allDone ? "emerald"   // รายการงานเสร็จครบ = เขียว (ทั้งบนจอและตอนบันทึกเป็นรูป)
  : isColor(data?.color) ? data!.color! : FLOW_KIND_META[kind].color;

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
    if (o.type === "page") Object.assign(data, cleanPageData(d));
    if (o.type === "storage" && isRuleKey(d.rule)) data.rule = d.rule;
    if (o.type === "todo") { const items = cleanTodos(d.items); if (items.length) data.items = items; }
    if (o.type === "auto") data.auto = cleanAuto(d.auto);
    if (o.type === "shape") data.shape = isShapeKey(d.shape) ? d.shape : DEFAULT_SHAPE;
    if (isFontName(d.font)) data.font = d.font;
    if (o.type === "zone") {
      if (d.line === "dash" || d.line === "solid" || d.line === "none") data.line = d.line;
      if (typeof d.opacity === "number" && Number.isFinite(d.opacity)) data.opacity = Math.min(100, Math.max(10, Math.round(d.opacity)));
    }
    if (isFlowStyle(d.style)) data.style = d.style;   // "normal" เก็บได้ (กล่องที่ตั้งปกติเองบนกระดานสไตล์อื่น)
    const rich = sanitizeRich(d.rich);
    if (rich) data.rich = rich;
    if (isFlowAlign(d.align)) data.align = d.align;
    if (isHexColor(d.fill)) data.fill = d.fill;
    if (isHexColor(d.stroke)) data.stroke = d.stroke;
    nodes.push({ id, type: o.type, position: { x: num(pos.x, 0), y: num(pos.y, 0) }, width: Math.max(40, num(o.width, meta.w)), height: Math.max(30, num(o.height, meta.h)), data });
    ids.add(id);
  }
  const edges: FlowSceneEdge[] = [];
  const eids = new Set<string>();
  for (const e of Array.isArray(r.edges) ? r.edges : []) {
    const o = (e ?? {}) as Record<string, unknown>;
    const id = str(o.id); const source = str(o.source); const target = str(o.target);
    if (!id || eids.has(id) || !(ids.has(source) || isSysId(source)) || !(ids.has(target) || isSysId(target))) continue;   // ปลายเส้น = กล่องในกระดาน หรือกล่องของระบบ (sys:)
    const shape = edgeShapeOf(o);
    edges.push({ id, source, target, sourceHandle: handleOrNull(o.sourceHandle), targetHandle: handleOrNull(o.targetHandle), label: str(o.label), ...(shape !== "step" ? { shape } : {}), ...(isHexColor(o.color) ? { color: o.color } : {}) });
    eids.add(id);
  }
  const out = withPins({ kind: "flowchart", v: 1, nodes, edges }, cleanPins(r.pins));
  const withStyle = isFlowStyle(r.style) && r.style !== "normal" ? { ...out, style: r.style } : out;
  const withTheme = isThemeName(r.theme) && r.theme !== "std" ? { ...withStyle, theme: r.theme } : withStyle;
  const tags = cleanTodoTags(r.todoTags);
  return tags ? { ...withTheme, todoTags: tags } : withTheme;
}
/** ชื่อชุดสี (ตรวจค่าจริงที่ lib/flowchart-themes · ไม่รู้จัก = มาตรฐาน) */
const isThemeName = (v: unknown): v is string => typeof v === "string" && /^[a-z]{2,12}$/.test(v);

// ── กล่อง "รายการงาน" (เจ้าของสั่ง 2026-11-20 แบบ A + แถบคืบหน้า · ใครติ๊ก · งานค้างทั้งผัง) ──
export const TODO_MAX = 100;
/** ข้อในกล่องรายการงาน → ค่าที่ปลอดภัย (ข้อความ ≤ 300 ตัว · สูงสุด 100 ข้อ · id ซ้ำตัดทิ้ง) */
export function cleanTodos(raw: unknown): FlowTodo[] {
  const out: FlowTodo[] = [];
  const ids = new Set<string>();
  for (const v of Array.isArray(raw) ? raw : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = str(o.id).slice(0, 40);
    if (!id || ids.has(id)) continue;
    const it: FlowTodo = { id, text: str(o.text).slice(0, 300) };
    const rich = sanitizeRich(o.rich); if (rich && rich.length <= 2000) it.rich = rich;
    if (typeof o.tag === "string" && TAG_KEY_RE.test(o.tag)) it.tag = o.tag;
    if (o.done === true) {
      it.done = true;
      if (typeof o.by === "string" && o.by.trim()) it.by = o.by.trim().slice(0, 80);
      if (typeof o.at === "string" && !Number.isNaN(Date.parse(o.at))) it.at = o.at;
    }
    out.push(it); ids.add(id);
    if (out.length >= TODO_MAX) break;
  }
  return out;
}
/** เสร็จกี่ข้อจากทั้งหมด (ข้อว่างไม่นับ) · allDone = มีอย่างน้อย 1 ข้อและเสร็จครบ */
export function todoProgress(items: FlowTodo[] | undefined): { done: number; total: number; allDone: boolean } {
  const list = (items ?? []).filter((i) => i.text.trim());
  const done = list.filter((i) => i.done).length;
  return { done, total: list.length, allDone: list.length > 0 && done === list.length };
}
/** ติ๊ก / เอาติ๊กออก 1 ข้อ — ติ๊ก = จำชื่อคน + เวลา · เอาออก = ลบทิ้ง */
export function toggleTodo(items: FlowTodo[], id: string, done: boolean, by: string, at = new Date().toISOString()): FlowTodo[] {
  const keep = (i: FlowTodo) => ({ id: i.id, text: i.text, ...(i.rich ? { rich: i.rich } : {}), ...(i.tag ? { tag: i.tag } : {}) });
  const cur = items.find((i) => i.id === id); if (!cur) return items;
  const next: FlowTodo = done ? { ...keep(cur), done: true, ...(by ? { by } : {}), at } : keep(cur);
  const rest = items.filter((i) => i.id !== id);
  // เจ้าของสั่ง 2026-11-22: ติ๊กเสร็จ = ย้ายลงล่างสุด · เอาติ๊กออก = กลับไปอยู่ก่อนข้อที่เสร็จแล้ว
  if (done) return [...rest, next];
  const firstDone = rest.findIndex((i) => i.done);
  return firstDone < 0 ? [...rest, next] : [...rest.slice(0, firstDone), next, ...rest.slice(firstDone)];
}
export type OpenTodo = { nodeId: string; box: string; item: FlowTodo; tag?: FlowTodoTag };
/** "งานค้างทั้งผัง": ทุกข้อที่ยังไม่ติ๊ก · เรียงป้ายด่วนก่อน (ตามลำดับป้าย) แล้วตามกล่องบน→ล่าง ซ้าย→ขวา */
export function openTodos(nodes: Pick<FlowSceneNode, "id" | "type" | "position" | "data">[], tags: FlowTodoTag[] = DEFAULT_TODO_TAGS): OpenTodo[] {
  const list = nodes.filter((n) => n.type === "todo")
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .flatMap((n) => (n.data.items ?? []).filter((i) => !i.done && i.text.trim())
      .map((item) => ({ nodeId: n.id, box: splitFlowLabel(n.data.label).title, item, tag: tags.find((t) => t.key === item.tag) })));
  const rank = (x: OpenTodo) => (x.tag ? tags.indexOf(x.tag) : tags.length);
  return list.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).map((v) => v.x);
}

/** ชื่อฟอนต์ที่เก็บได้ (Google Font: ตัวอักษร/ตัวเลข/เว้นวรรค) — กันค่าแปลกเข้า CSS */
export const isFontName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9 ]{2,40}$/.test(v);

/** กล่องที่เปลี่ยนรูปทรงได้ (ข้อ 1): กล่อง · เริ่ม/จบ · คำถาม · รูปทรง */
export const RESHAPE_KINDS: FlowKind[] = ["step", "start", "question", "shape"];
/** เปลี่ยนรูปทรง: target = "step" | "start" | "question" | key รูปทรง → ชนิด + ข้อมูลใหม่ (ข้อความ สี เส้นที่ต่อ ขนาด เหมือนเดิม) · เปลี่ยนไม่ได้ = null */
export function reshapeNode(kind: FlowKind, data: FlowNodeData, target: string): { type: FlowKind; data: FlowNodeData } | null {
  if (!RESHAPE_KINDS.includes(kind)) return null;
  const d: FlowNodeData = { ...data };
  if (target === "step" || target === "start" || target === "question") { delete d.shape; return { type: target, data: d }; }
  if (!isShapeKey(target)) return null;
  return { type: "shape", data: { ...d, shape: target } };
}

/** ช่องของกล่อง "หน้าใน ERP" ที่ผ่านการตรวจ (ลิงก์ต้องเป็นหน้าในระบบเท่านั้น — กันลิงก์แปลก/javascript:) */
function cleanPageData(d: Record<string, unknown>): Pick<FlowNodeData, "href" | "app" | "appName" | "icon" | "peek"> {
  const out: Pick<FlowNodeData, "href" | "app" | "appName" | "icon" | "peek"> = {};
  const pk = (d.peek ?? null) as Record<string, unknown> | null;
  if (pk && typeof pk === "object") {
    const peek: FlowPagePeek = {};
    if (pk.on === true) peek.on = true;
    if (typeof pk.img === "string" && /^[\w\-./]{3,200}$/.test(pk.img)) peek.img = pk.img;
    if (typeof pk.at === "string" && !Number.isNaN(Date.parse(pk.at))) peek.at = pk.at;
    if (Object.keys(peek).length) out.peek = peek;
  }
  if (isErpPageHref(d.href)) out.href = d.href;
  if (isAppKey(d.app)) out.app = d.app;
  if (typeof d.appName === "string" && d.appName.trim()) out.appName = d.appName.trim().slice(0, 80);
  if (typeof d.icon === "string" && d.icon.trim() && d.icon.length <= 120) out.icon = d.icon.trim();
  return out;
}

/** โหนด/เส้นของ React Flow (มีค่าระหว่างใช้งาน เช่น selected/dragging/measured) → FlowScene สำหรับบันทึก */
type NodeLike = { id: string; type?: string; position: { x: number; y: number }; width?: number | null; height?: number | null; measured?: { width?: number; height?: number }; data?: unknown };
/** แบบลูกศรของเส้นบนกระดานเก็บใน data.shape (React Flow) */
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; label?: unknown; data?: unknown };
export function toFlowScene(nodes: NodeLike[], edges: EdgeLike[], pins?: FlowPins, style?: FlowStyleKey, theme?: string, todoTags?: FlowTodoTag[] | null): FlowScene {
  return parseFlowScene({
    kind: "flowchart", pins, style, theme, todoTags: todoTags ?? undefined,
    nodes: nodes.map((n) => ({
      id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      width: Math.round(n.width ?? n.measured?.width ?? 0) || undefined,
      height: Math.round(n.height ?? n.measured?.height ?? 0) || undefined,
      data: n.data,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null, label: typeof e.label === "string" ? e.label : "", shape: (e.data as { shape?: unknown } | undefined)?.shape, color: (e.data as { color?: unknown } | undefined)?.color })),
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
  const shp = kind === "shape" ? flowShapeOf(data?.shape) : null;
  const { w, h } = kind === "file" ? fileNodeSize(exts.length) : place ? STORAGE_ICON_SIZE : shp ? { w: shp.w, h: shp.h } : { w: meta.w, h: meta.h };
  const defLabel = shp ? t(shp.th, shp.en) : place ? t(storagePlaceOf(place)!.th, storagePlaceOf(place)!.en) : t(meta.th, meta.en);
  return {
    id: newFlowId("n"), type: kind,
    position: { x: snap(at.x - w / 2), y: snap(at.y - h / 2) },
    width: w, height: h,
    data: {
      label: data?.label ?? defLabel, ...(data?.color ? { color: data.color } : {}), ...(data?.path ? { path: data.path } : {}), ...(exts.length ? { exts } : {}), ...(place ? { place } : {}),
      ...(kind === "page" && data ? cleanPageData(data as Record<string, unknown>) : {}),
      ...(kind === "todo" ? { label: data?.label ?? t("สิ่งที่ต้องทำ", "To do"), items: cleanTodos(data?.items) } : {}),
      ...(shp ? { shape: shp.key } : {}),
      ...(data?.font && isFontName(data.font) ? { font: data.font } : {}),
      ...(kind === "auto" ? { label: data?.label ?? t("กฎอัตโนมัติ", "Automation rule"), auto: cleanAuto(data?.auto) } : {}),
    },
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
  const ok = (id: string) => ids.has(id) || isSysId(id);
  const edges = mergeList(base.edges, mine.edges, theirs.edges).filter((e) => ok(e.source) && ok(e.target));
  // ตำแหน่งกล่องระบบ: รวมทีละกล่อง (เราไม่ได้แตะกล่องไหน = เอาของอีกฝั่ง)
  const bp = base.pins ?? {}, mp = mine.pins ?? {}, tp = theirs.pins ?? {};
  const pins: FlowPins = {};
  for (const k of new Set([...Object.keys(bp), ...Object.keys(mp), ...Object.keys(tp)])) {
    const v = JSON.stringify(mp[k]) !== JSON.stringify(bp[k]) ? mp[k] : tp[k];
    if (v) pins[k] = v;
  }
  const style = mine.style !== base.style ? mine.style : theirs.style;   // สไตล์กระดาน: เราเปลี่ยน = ของเรา · ไม่ได้แตะ = ของอีกฝั่ง
  const theme = mine.theme !== base.theme ? mine.theme : theirs.theme;
  const todoTags = JSON.stringify(mine.todoTags) !== JSON.stringify(base.todoTags) ? mine.todoTags : theirs.todoTags;
  const merged = withPins({ kind: "flowchart", v: 1, nodes, edges }, pins);
  return { ...merged, ...(style ? { style } : {}), ...(theme ? { theme } : {}), ...(todoTags ? { todoTags } : {}) };
}

/** จุดต่อเส้นของกล่อง (พิกัดบนกระดาน) — ใช้ตอนวาดเส้นในรูปที่บันทึก */
export function handlePoint(n: Pick<FlowSceneNode, "position" | "width" | "height"> & { data?: Partial<FlowNodeData> }, h: string | null | undefined): { x: number; y: number; side: FlowHandle } {
  const { x, y } = n.position; const w = n.width; const hh = n.height;
  const item = itemOfHandle(h);
  if (item) {   // ข้อในรายการงาน: ริมขวา ตามแถวของข้อ (ประมาณ — หัวการ์ด ~38px · แถวละ ~22px)
    const idx = Math.max(0, (n.data?.items ?? []).findIndex((i) => i.id === item));
    const left = itemSideOf(h) === "l";
    return { x: left ? x : x + w, y: Math.min(y + hh - 8, y + 38 + idx * 22 + 11), side: left ? "l" : "r" };
  }
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
      n.data.label.split("\n").map((s) => s.trim()).filter(Boolean).join(" · ") + (n.data.exts?.length ? ` (${n.data.exts.map((e) => e.toUpperCase()).join(", ")})` : "") + (n.data.appName ? ` (${n.data.appName})` : ""),
      n.data.path, n.data.href,
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
