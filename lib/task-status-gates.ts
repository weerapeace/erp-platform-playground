// ============================================================
// เงื่อนไขก่อนเข้าสถานะงาน (ตั้งต่อสถานะ) — เจ้าของเลือก 2026-11-22 (หน้าจัดการสถานะ /tasks/settings?tab=status)
//  • readiness = ความพร้อมสินค้าครบ (lib/task-readiness · ไม่นับข้อลงร้าน เพราะต้องดึงสถานะร้าน)
//  • content   = คอนเทนต์ของงานพร้อมครบทุกชิ้น (ไม่นับยกเลิก · ไม่มีคอนเทนต์ = ผ่าน)
//  • off = ไม่เช็ก · warn = ถามก่อน (ทำต่อได้) · block = ห้ามย้าย (แอดมิน "บังคับตั้งสถานะ" ข้ามได้)
//  • เก็บใน ui_config key task_status_gates · ยังไม่ตั้ง = ค่าเดิม (เตือนความพร้อมก่อน ส่งตรวจ/อนุมัติ/ตั้งเวลา/เผยแพร่/เสร็จ)
//  • เช็กที่ของกลางเปลี่ยนสถานะ app/tasks/task-actions (ลิ้นชัก · บอร์ด · กระดาน · ปฏิทิน ใช้ตัวเดียวกัน) — ฝั่งเว็บ ไม่ใช่ฝั่ง server
// ============================================================
export type GateMode = "off" | "warn" | "block";
export type StatusGate = { readiness: GateMode; content: GateMode };
export type StatusGates = Record<string, StatusGate>;
export const STATUS_GATES_KEY = "task_status_gates";

const MODES: GateMode[] = ["off", "warn", "block"];
const WARN_BY_DEFAULT = ["need_review", "approved", "scheduled", "published", "done"];

export function defaultStatusGates(): StatusGates {
  return Object.fromEntries(WARN_BY_DEFAULT.map((k) => [k, { readiness: "warn", content: "off" } as StatusGate]));
}

/** ค่าจาก ui_config → ตัวที่ใช้ได้ (ค่าแปลก = off) · null/ไม่ใช่ object = ค่าเริ่มต้น */
export function cleanStatusGates(raw: unknown): StatusGates {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultStatusGates();
  const out: StatusGates = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const m = (x: unknown): GateMode => (MODES.includes(x as GateMode) ? (x as GateMode) : "off");
    out[k] = { readiness: m(o.readiness), content: m(o.content) };
  }
  return out;
}

export const gateOf = (gates: StatusGates, statusKey: string): StatusGate => gates[statusKey] ?? { readiness: "off", content: "off" };
export const hasGate = (g: StatusGate) => g.readiness !== "off" || g.content !== "off";

export type GateFinding = { kind: "readiness" | "content"; mode: Exclude<GateMode, "off">; lines: string[] };

/** ประเมินผล: readinessMissing/contentOpen = รายการที่ยังขาด (null = เช็กไม่ได้ → ไม่นับ) */
export function evaluateGate(g: StatusGate, input: { readinessMissing: string[] | null; contentOpen: string[] | null }): { block: GateFinding[]; warn: GateFinding[] } {
  const res: GateFinding[] = [];
  if (g.readiness !== "off" && input.readinessMissing?.length) res.push({ kind: "readiness", mode: g.readiness, lines: input.readinessMissing });
  if (g.content !== "off" && input.contentOpen?.length) res.push({ kind: "content", mode: g.content, lines: input.contentOpen });
  return { block: res.filter((r) => r.mode === "block"), warn: res.filter((r) => r.mode === "warn") };
}
