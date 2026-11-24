/**
 * กติกากลาง "งานหลังขาย" — คำสั่งพิเศษออเดอร์ + ซ่อม/คืนสินค้า
 * (ย้ายมาจากแอปเก่า order-instruction-manager / repair-and-return · เจ้าของเลือก 2026-11-24)
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูล — มีแค่รายการสถานะ เส้นทางสถานะ ป้าย และตัวช่วยตรวจค่า
 * ใช้ทั้งฝั่งหน้าเว็บและ API (ทะเบียน workflow: lib/workflow-registry.ts key "order-instruction" / "after-sales")
 */

/* ───────────── คำสั่งพิเศษออเดอร์ ───────────── */

export type InstructionStatus = "todo" | "done";

export const INSTRUCTION_STATUS: Record<InstructionStatus, { label: string; tone: "warning" | "success" }> = {
  todo: { label: "ยังไม่ทำ", tone: "warning" },
  done: { label: "เสร็จ", tone: "success" },
};

export const ENGRAVE_TYPES = ["พิมพ์จม", "ฟอยเงิน", "ฟอยทอง"] as const;
export const ENGRAVE_POSITIONS = ["มุมขวา", "ตรงกลาง"] as const;
export type EngraveType = (typeof ENGRAVE_TYPES)[number];
export type EngravePosition = (typeof ENGRAVE_POSITIONS)[number];

export const ENGRAVE_TYPE_EN: Record<EngraveType, string> = { "พิมพ์จม": "Deboss", "ฟอยเงิน": "Silver Foil", "ฟอยทอง": "Gold Foil" };
export const ENGRAVE_POSITION_EN: Record<EngravePosition, string> = { "มุมขวา": "Right", "ตรงกลาง": "Center" };

/** ใบสลักชื่อรับได้สูงสุด 20 ตัว (2 แถว แถวละ 10) — เท่าแอปเก่า */
export const ENGRAVE_MAX_CHARS = 20;

/** แยกตัวอักษรแบบนับอีโมจิ/สระเป็นตัวเดียว (ใช้วาดช่องในใบสลักชื่อ) */
export function splitEngraveChars(name: string): string[] {
  const s = (name || "").trim();
  if (!s) return [];
  type Seg = { segment: string };
  const IntlAny = Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment: (t: string) => Iterable<Seg> } };
  if (IntlAny.Segmenter) {
    const seg = new IntlAny.Segmenter("en", { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment).slice(0, ENGRAVE_MAX_CHARS);
  }
  return Array.from(s).slice(0, ENGRAVE_MAX_CHARS);
}

/** คำสั่งเริ่มต้น (ตั้งค่าเพิ่ม/แก้/ปิดได้ในหน้า) — ชุดเดียวกับแอปเก่า */
export const DEFAULT_INSTRUCTION_COMMANDS = [
  "ห่อ",
  "การ์ดธรรมดา",
  "การ์ดพิเศษ",
  "แก้ไซส์เข็มขัด",
  "ตัดชื่อออก",
  "เปลี่ยนสินค้า",
  "อื่นๆ",
];

/** แอปเก่าเก็บคำสั่งรวมเป็นข้อความเดียว เช่น "ห่อ + การ์ดธรรมดา" → แยกเป็นรายการ */
export function splitLegacyCommand(cmd: string | null | undefined): string[] {
  const s = (cmd || "").trim();
  if (!s || s === "-") return [];
  return s.split("+").map((x) => x.trim()).filter(Boolean);
}

/* ───────────── งานซ่อม / ของคืน ───────────── */

export type CaseKind = "repair" | "return";

export type RepairStatus = "waiting_customer" | "repairing" | "remake" | "ready_to_ship" | "shipped_back" | "cancelled";
export type ReturnStatus = "received" | "checked" | "closed" | "cancelled";
export type CaseStatus = RepairStatus | ReturnStatus;

type Tone = "neutral" | "accent" | "warning" | "success" | "danger";

export const REPAIR_STATUS: Record<RepairStatus, { label: string; tone: Tone }> = {
  waiting_customer: { label: "รอของลูกค้าส่งกลับ", tone: "warning" },
  repairing: { label: "กำลังซ่อม", tone: "accent" },
  remake: { label: "รอผลิตใหม่", tone: "accent" },
  ready_to_ship: { label: "รอแพ็กส่งกลับ", tone: "accent" },
  shipped_back: { label: "ส่งคืนลูกค้าแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "danger" },
};

export const RETURN_STATUS: Record<ReturnStatus, { label: string; tone: Tone }> = {
  received: { label: "รอตรวจของ", tone: "warning" },
  checked: { label: "ตรวจแล้ว", tone: "accent" },
  closed: { label: "ปิดงาน", tone: "success" },
  cancelled: { label: "ยกเลิก", tone: "danger" },
};

/** เส้นทางสถานะที่อนุญาต (ย้อนกลับได้ทุกขั้นที่ยังไม่ปิด — กันกดพลาดแล้วติด) */
const REPAIR_FLOW: Record<RepairStatus, RepairStatus[]> = {
  waiting_customer: ["repairing", "remake", "ready_to_ship", "cancelled"],
  repairing: ["waiting_customer", "remake", "ready_to_ship", "cancelled"],
  remake: ["repairing", "ready_to_ship", "cancelled"],
  ready_to_ship: ["repairing", "remake", "shipped_back", "cancelled"],
  shipped_back: ["ready_to_ship"],
  cancelled: ["waiting_customer"],
};

const RETURN_FLOW: Record<ReturnStatus, ReturnStatus[]> = {
  received: ["checked", "closed", "cancelled"],
  checked: ["received", "closed", "cancelled"],
  closed: ["checked"],
  cancelled: ["received"],
};

export function caseStatusList(kind: CaseKind): CaseStatus[] {
  return kind === "repair" ? (Object.keys(REPAIR_STATUS) as RepairStatus[]) : (Object.keys(RETURN_STATUS) as ReturnStatus[]);
}

export function caseStatusInfo(kind: CaseKind, status: string): { label: string; tone: Tone } {
  const map = (kind === "repair" ? REPAIR_STATUS : RETURN_STATUS) as Record<string, { label: string; tone: Tone }>;
  return map[status] ?? { label: status || "-", tone: "neutral" };
}

export function defaultCaseStatus(kind: CaseKind): CaseStatus {
  return kind === "repair" ? "waiting_customer" : "received";
}

export function isValidCaseStatus(kind: CaseKind, status: string): boolean {
  return (caseStatusList(kind) as string[]).includes(status);
}

/** เปลี่ยนสถานะได้ไหม (สถานะเดิม = ไม่เปลี่ยน ถือว่าได้) */
export function canMoveCase(kind: CaseKind, from: string, to: string): boolean {
  if (from === to) return true;
  const flow = (kind === "repair" ? REPAIR_FLOW : RETURN_FLOW) as Record<string, string[]>;
  return (flow[from] ?? []).includes(to);
}

export function nextCaseStatuses(kind: CaseKind, from: string): CaseStatus[] {
  const flow = (kind === "repair" ? REPAIR_FLOW : RETURN_FLOW) as Record<string, CaseStatus[]>;
  return flow[from] ?? [];
}

/** งานที่ยังค้าง (ใช้นับการ์ดตัวเลข) */
export function isCaseOpen(kind: CaseKind, status: string): boolean {
  return kind === "repair" ? !["shipped_back", "cancelled"].includes(status) : !["closed", "cancelled"].includes(status);
}

/** หัวข้อซ่อมเริ่มต้น (ตั้งค่าเพิ่ม/แก้ได้) — ชุดเดียวกับแอปเก่า */
export const DEFAULT_REPAIR_TOPICS = [
  "มีตำหนิ",
  "ขาด/ชำรุด",
  "เปลี่ยนรุ่นสินค้า",
  "ปัญหาสาย",
  "ขนาด: สั้นไป",
  "ขนาด: ยาวไป",
  "เปลี่ยนไซส์",
  "หัวเข็มขัดพัง",
  "ส่งผิดสี",
  "ส่งผิดรุ่น",
  "หนัง / PU ลอก / เสื่อม",
  "ซิป / อะไหล่",
  "ของหาย",
  "ของไม่ครบ",
  "อื่น ๆ",
];

/** วิธีแก้ปัญหา (แอปเก่าเอาไปปนกับสถานะ — แยกออกมาเป็นช่องของตัวเอง) */
export const REPAIR_RESOLUTIONS = ["ซ่อม", "เปลี่ยนสินค้าชิ้นใหม่", "เปลี่ยนรุ่นสินค้า", "เปลี่ยนไซส์", "ส่งสินค้าเพิ่ม", "ผลิตใหม่"] as const;

/** แปลงสถานะซ่อมของแอปเก่า → สถานะ + วิธีแก้ ใน ERP (ใช้ตอนนำเข้าข้อมูลเก่า) */
export function mapLegacyRepairStatus(old: string | null | undefined, packed?: boolean): { status: RepairStatus; resolution: string | null } {
  const s = (old || "").trim();
  switch (s) {
    case "รอของลูกค้าส่งกลับ": return { status: "waiting_customer", resolution: null };
    case "กำลังซ่อม": return { status: "repairing", resolution: "ซ่อม" };
    case "ซ่อมเสร็จแล้ว": return { status: "ready_to_ship", resolution: "ซ่อม" };
    case "เปลี่ยนสินค้าชิ้นใหม่": return { status: packed ? "ready_to_ship" : "repairing", resolution: "เปลี่ยนสินค้าชิ้นใหม่" };
    case "เปลี่ยนรุ่นสินค้า": return { status: packed ? "ready_to_ship" : "repairing", resolution: "เปลี่ยนรุ่นสินค้า" };
    case "เปลี่ยนไซส์": return { status: packed ? "ready_to_ship" : "repairing", resolution: "เปลี่ยนไซส์" };
    case "ส่งสินค้าเพิ่ม": return { status: packed ? "ready_to_ship" : "repairing", resolution: "ส่งสินค้าเพิ่ม" };
    case "รอผลิตใหม่": return { status: "remake", resolution: "ผลิตใหม่" };
    case "ส่งคืนแล้ว": return { status: "shipped_back", resolution: null };
    default: return { status: "waiting_customer", resolution: null };
  }
}

/** แปลงสถานะของคืนของแอปเก่า */
export function mapLegacyReturnStatus(old: string | null | undefined, checked?: boolean): ReturnStatus {
  const s = (old || "").trim();
  if (s === "ปิดงาน" || s === "ส่งคืนแล้ว") return "closed";
  return checked ? "checked" : "received";
}

/* ───────────── ตัวช่วยทั่วไป ───────────── */

/** ทำความสะอาดเลขออเดอร์ที่พิมพ์/สแกนมา (ตัดช่องว่าง + ข้อความต่อท้าย) */
export function cleanOrderNo(raw: string | null | undefined): string {
  return (raw || "").trim().split(/\s+/)[0] ?? "";
}

/** ช่องเงินที่พิมพ์มา → ตัวเลข (ว่าง = null · ติดลบไม่ได้) */
export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[, ฿]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
