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

/** ฟอนต์เริ่มต้นของเครื่องสลัก (เพิ่มได้ในหน้าตั้งค่า · order_ops_options kind engrave_font) */
export const DEFAULT_ENGRAVE_FONT = "Times New Roman";

/** ตัวที่เครื่องสลักทำได้เสมอ: อังกฤษ A-Z a-z ตัวเลข 0-9 เว้นวรรค (ล็อกไว้) — ตัวพิเศษอื่นตั้งเพิ่มได้ */
const ENGRAVE_BASE_RE = /^[A-Za-z0-9 ]$/;

/** ตัวที่สลักไม่ได้ในชื่อนี้ (ไม่ซ้ำ ตามลำดับที่เจอ) — ว่าง = สลักได้ทุกตัว */
export function invalidEngraveChars(text: string, specials: readonly string[]): string[] {
  const allow = new Set(specials);
  const bad: string[] = [];
  for (const ch of splitEngraveChars(text)) {
    if (ENGRAVE_BASE_RE.test(ch) || allow.has(ch)) continue;
    if (!bad.includes(ch)) bad.push(ch);
  }
  return bad;
}

/** ตรวจชื่อสลักก่อนบันทึก — คืนข้อความผิดพลาดภาษาคน หรือ null */
export function engraveTextError(text: string, specials: readonly string[]): string | null {
  const s = (text || "").trim();
  if (!s) return "กรุณาใส่ชื่อที่ต้องสลัก";
  if (splitEngraveChars(s).join("").length < s.length) return `ชื่อยาวเกิน ${ENGRAVE_MAX_CHARS} ตัว`;
  const bad = invalidEngraveChars(s, specials);
  if (bad.length) return `เครื่องสลักทำไม่ได้: ${bad.map((c) => `“${c}”`).join(" ")} — ใช้ได้แค่ A-Z a-z 0-9 และตัวพิเศษที่ตั้งไว้`;
  return null;
}

/**
 * เดาชื่อสลัก/รูปแบบ/ตำแหน่ง จากหมายเหตุที่ลูกค้าเขียน (ให้คนกดรับเอง ไม่บันทึกอัตโนมัติ)
 * เช่น "สลักชื่อ Thaninnut ฟอยทอง ห่อของขวัญด้วยค่ะ" → { text: "Thaninnut", type: "ฟอยทอง" }
 */
export function guessEngraveFromNote(note: string | null | undefined): { text: string | null; type: EngraveType | null; position: EngravePosition | null } {
  const s = (note || "").trim();
  if (!s) return { text: null, type: null, position: null };
  const type: EngraveType | null = /ฟอยทอง|ฟอย\s*ทอง|สีทอง|gold/i.test(s) ? "ฟอยทอง"
    : /ฟอยเงิน|ฟอย\s*เงิน|สีเงิน|silver/i.test(s) ? "ฟอยเงิน"
    : /พิมพ์จม|ปั๊มจม|จม|deboss/i.test(s) ? "พิมพ์จม" : null;
  const position: EngravePosition | null = /ตรงกลาง|กลาง|center/i.test(s) ? "ตรงกลาง" : /มุมขวา|ขวา|right/i.test(s) ? "มุมขวา" : null;
  const skip = /^(gold|silver|deboss|center|right|left|ok|thank|thanks|please|name)$/i;
  // ชุดคำอังกฤษ/ตัวเลขติดกัน (มีเว้นวรรค/&/./- คั่นได้) — เลือกชุดที่ตามหลังคำว่า "ชื่อ/สลัก" ก่อน ไม่งั้นเอาชุดยาวสุด
  const runs = [...s.matchAll(/[A-Za-z0-9][A-Za-z0-9&.\- ]*[A-Za-z0-9]|[A-Za-z]/g)]
    .map((m) => ({ text: m[0].trim(), at: m.index ?? 0 }))
    .filter((r) => !skip.test(r.text) && /[A-Za-z]/.test(r.text) && r.text.length <= ENGRAVE_MAX_CHARS);
  if (!runs.length) return { text: null, type, position };
  const kw = s.search(/ชื่อ|สลัก|name/i);
  const after = kw >= 0 ? runs.find((r) => r.at > kw) : undefined;
  const best = after ?? runs.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  return { text: best.text, type, position };
}

/**
 * รหัสท้าย SKU บอกรูปแบบ/ตำแหน่งสลัก เช่น WK45-05G/2 = ฟอยทอง · ตรงกลาง
 * ตัวอักษรก่อน "/" = รูปแบบ · ตัวเลขหลัง "/" = ตำแหน่ง
 * ค่าเริ่มต้นตรวจกับข้อมูลแอปเก่า 70 ออเดอร์ (2026-11-24): D=พิมพ์จม G=ฟอยทอง N=ฟอยเงิน · 1=มุมขวา 2=ตรงกลาง
 * ตั้งเพิ่ม/แก้ได้ในหน้าตั้งค่าเครื่องสลัก (order_ops_options kind engrave_sku_type / engrave_sku_pos · label=รหัส value=ความหมาย)
 */
export const DEFAULT_ENGRAVE_SKU_TYPES: Record<string, EngraveType> = { D: "พิมพ์จม", G: "ฟอยทอง", N: "ฟอยเงิน" };
export const DEFAULT_ENGRAVE_SKU_POSITIONS: Record<string, EngravePosition> = { "1": "มุมขวา", "2": "ตรงกลาง" };

export type EngraveSkuDecoded = { type: EngraveType | null; position: EngravePosition | null; typeCode: string; posCode: string };

/** ถอดรหัสท้าย SKU → รูปแบบ/ตำแหน่ง (ไม่ใช่ SKU สลัก = null) */
export function decodeEngraveSku(
  sku: string | null | undefined,
  types: Record<string, string> = DEFAULT_ENGRAVE_SKU_TYPES,
  positions: Record<string, string> = DEFAULT_ENGRAVE_SKU_POSITIONS,
): EngraveSkuDecoded | null {
  const m = /([A-Z])\/(\d+)\s*$/i.exec((sku || "").trim());
  if (!m) return null;
  const typeCode = m[1].toUpperCase();
  const posCode = m[2];
  const t = types[typeCode];
  const p = positions[posCode];
  if (!t && !p) return null;
  return {
    type: (ENGRAVE_TYPES as readonly string[]).includes(t ?? "") ? (t as EngraveType) : null,
    position: (ENGRAVE_POSITIONS as readonly string[]).includes(p ?? "") ? (p as EngravePosition) : null,
    typeCode,
    posCode,
  };
}

/** สร้างตารางรหัสจากตัวเลือกที่ตั้งไว้ (ไม่มีเลย = ใช้ค่าเริ่มต้น) */
export function engraveSkuMaps(options: { kind: string; label: string; value?: string | null; is_active: boolean }[]): { types: Record<string, string>; positions: Record<string, string> } {
  const pick = (kind: string) => {
    const rows = options.filter((o) => o.kind === kind && o.is_active && o.value);
    return rows.length ? Object.fromEntries(rows.map((o) => [o.label.trim().toUpperCase(), String(o.value)])) : null;
  };
  return { types: pick("engrave_sku_type") ?? { ...DEFAULT_ENGRAVE_SKU_TYPES }, positions: pick("engrave_sku_pos") ?? { ...DEFAULT_ENGRAVE_SKU_POSITIONS } };
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
