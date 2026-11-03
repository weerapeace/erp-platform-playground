/**
 * โน้ตแปะ (post-it) บนแผนผังการทำงาน — ชนิด + สี + ตัวตรวจข้อมูล (ไม่มี React · ใช้ทั้งหน้าจอและ API)
 *   ส่วนตัว = เก็บใน user_ui_prefs key "flow_map_notes" (useUserPref · ต่อคน · ไม่ต้องมีตารางใหม่)
 *   ทั้งทีม = ตารางความคิดเห็นกลาง erp_record_comments (module_key "flow_map" · comment_type "note") ผ่าน /api/flow-map/notes
 */

export type FlowNoteColor = "yellow" | "pink" | "green" | "blue";
export const FLOW_NOTE_COLORS: Record<FlowNoteColor, { bg: string; border: string; text: string; label: string }> = {
  yellow: { bg: "#fef3c7", border: "#fcd34d", text: "#422006", label: "เหลือง" },
  pink: { bg: "#fce7f3", border: "#f9a8d4", text: "#500724", label: "ชมพู" },
  green: { bg: "#dcfce7", border: "#86efac", text: "#052e16", label: "เขียว" },
  blue: { bg: "#e0f2fe", border: "#7dd3fc", text: "#082f49", label: "ฟ้า" },
};
export const FLOW_NOTE_COLOR_ORDER: FlowNoteColor[] = ["yellow", "pink", "green", "blue"];

/** โน้ตแปะติดกล่อง (n) / เส้น (e) — ไม่ติด = ลอยบนผัง */
export type FlowNoteAttach = { kind: "n" | "e"; id: string } | null;

/** ข้อมูลที่เก็บ (ไม่รวม id / ใครเห็น) */
export type FlowNoteData = {
  text: string; color: FlowNoteColor;
  /** ผังที่แปะ (FLOW_VIEWS key) · ตำแหน่งเป็นพิกัดในผัง (viewBox 680 กว้าง) */
  view: string; x: number; y: number;
  attach: FlowNoteAttach;
  author: string | null; at: string;
};
export type FlowNote = FlowNoteData & { id: string; shared: boolean; mine: boolean };

export const FLOW_NOTE_MAX = 300;   // ตัวอักษรต่อโน้ต
export const FLOW_NOTE_W = 118;
export const FLOW_NOTE_H = 76;
export const FLOW_NOTE_LIMIT = 300; // โน้ตส่วนตัวสูงสุดต่อคน

const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo; };

/** ตรวจ/ทำความสะอาดข้อมูลโน้ต (ข้อความยาวเกินตัด · สี/ตำแหน่งผิดใช้ค่าตั้งต้น) — ผิดรูปแบบ = null */
export function cleanFlowNote(raw: unknown): FlowNoteData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const view = typeof r.view === "string" && /^[a-z]{1,20}$/.test(r.view) ? r.view : null;
  if (!view) return null;
  const a = r.attach as Record<string, unknown> | null | undefined;
  const attach: FlowNoteAttach = a && (a.kind === "n" || a.kind === "e") && typeof a.id === "string" && /^[A-Za-z0-9_]{1,20}$/.test(a.id) ? { kind: a.kind, id: a.id } : null;
  return {
    text: String(r.text ?? "").slice(0, FLOW_NOTE_MAX),
    color: FLOW_NOTE_COLOR_ORDER.includes(r.color as FlowNoteColor) ? (r.color as FlowNoteColor) : "yellow",
    view, x: num(r.x, 0, 680 - FLOW_NOTE_W), y: num(r.y, 0, 600), attach,
    author: typeof r.author === "string" ? r.author.slice(0, 80) : null,
    at: typeof r.at === "string" ? r.at : new Date().toISOString(),
  };
}
