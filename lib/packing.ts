/**
 * 📦 กติกากลางระบบแพ็คสินค้า (Packing Station) — docs/packing-station.md
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูล/เบราว์เซอร์ (ทดสอบได้ใน lib/__tests__/packing.test.ts) — ใช้ร่วมกันทั้ง API /api/packing และหน้า /packing
 *  - cleanScanCode   : รหัสที่ยิงมา → ปลอดภัยสำหรับค้นออเดอร์ (เลขออเดอร์ / เลขพัสดุ / เลขแพ็กเกจ)
 *  - parsePackCommand: การ์ดบาร์โค้ดคำสั่ง `*PK-...` (เสร็จ / มีปัญหา / อัดใหม่ / ข้าม / กล่อง)
 *  - packGate        : ออเดอร์นี้แพ็คได้ไหม (ยกเลิก/ยังไม่จ่าย = ห้าม · ส่งแล้ว/เคยแพ็ค = เตือน)
 *  - suggestBox      : กล่องที่แนะนำ = กล่องใหญ่สุดของสินค้าในออเดอร์
 *  - applyItemScan   : ยิงบาร์โค้ดสินค้า → ติ๊กรายการไหน (ถูก / ไม่อยู่ในออเดอร์ / เกินจำนวน)
 *
 * ⚠️ ไม่ตัดสต๊อก ไม่ส่งสถานะไปร้านค้า — ระบบแพ็คบันทึกแค่ packing_sessions + platform_orders.packed_at ของเราเอง
 *    (ช่อง status ถูก Shopee เขียนทับทุก 15 นาที ห้ามเขียน 'packed' ลงไป)
 */

// ── คำสั่งจากการ์ดบาร์โค้ด ─────────────────────────────────────────────
// ขึ้นต้น "*PK-" เพราะ "PK-" เฉย ๆ ชนรหัสสินค้าจริง 4 ตัว (เช็ก DB 2026-11-17) · พิมพ์เป็น Code128 (Code39 ใช้ * เป็นตัวคั่น ห้ามใช้)
export const PACK_CMD_PREFIX = "*PK-";
export type PackCommand =
  | { kind: "done" }
  | { kind: "problem" }
  | { kind: "redo" }
  | { kind: "skip" }
  | { kind: "box"; box: string };

export const PACK_COMMANDS: { code: string; label: string; hint: string }[] = [
  { code: `${PACK_CMD_PREFIX}DONE`, label: "แพ็คเสร็จ", hint: "จบออเดอร์นี้ เก็บคลิป" },
  { code: `${PACK_CMD_PREFIX}PROBLEM`, label: "มีปัญหา", hint: "จบแบบมีปัญหา (ของขาด/ผิด/เสีย)" },
  { code: `${PACK_CMD_PREFIX}REDO`, label: "อัดใหม่", hint: "ทิ้งคลิปนี้ เริ่มอัดออเดอร์เดิมใหม่" },
  { code: `${PACK_CMD_PREFIX}SKIP`, label: "ข้าม", hint: "ปิดออเดอร์นี้โดยไม่บันทึกว่าแพ็คแล้ว" },
];
export const boxCommandCode = (box: string): string => `${PACK_CMD_PREFIX}BOX-${box}`;

export function parsePackCommand(raw: string): PackCommand | null {
  const s = String(raw ?? "").trim();
  if (!s.toUpperCase().startsWith(PACK_CMD_PREFIX)) return null;
  const rest = s.slice(PACK_CMD_PREFIX.length);
  const up = rest.toUpperCase();
  if (up === "DONE") return { kind: "done" };
  if (up === "PROBLEM") return { kind: "problem" };
  if (up === "REDO") return { kind: "redo" };
  if (up === "SKIP") return { kind: "skip" };
  if (up.startsWith("BOX-") && rest.length > 4) return { kind: "box", box: rest.slice(4).trim() };
  return null;
}

// ── รหัสที่ยิงมาเปิดออเดอร์ ─────────────────────────────────────────────
/** ตัดช่องว่าง/ตัวที่ทำให้ตัวกรองค้นพัง · เหลือ "" = ใช้ไม่ได้ · ยาวเกิน 64 ตัด */
export function cleanScanCode(raw: string): string {
  return String(raw ?? "").trim().replace(/\s+/g, "").replace(/[^A-Za-z0-9\-_#./]/g, "").slice(0, 64);
}

// ── ออเดอร์นี้แพ็คได้ไหม ────────────────────────────────────────────────
export type GateLevel = "ok" | "warn" | "block";
export type PackGate = { level: GateLevel; reasons: string[] };
export type GateOrder = {
  status: string;
  platform_status?: string | null;
  packed_at?: string | null;
  packed_by_name?: string | null;
};

const UNPAID_STATUSES = ["UNPAID", "ON_HOLD"];

export function packGate(o: GateOrder): PackGate {
  const reasons: string[] = [];
  if (o.status === "cancelled") return { level: "block", reasons: ["ออเดอร์ถูกยกเลิกแล้ว — ห้ามแพ็ค"] };
  if (o.platform_status && UNPAID_STATUSES.includes(o.platform_status.toUpperCase())) {
    return { level: "block", reasons: ["ลูกค้ายังไม่จ่ายเงิน / ยังยกเลิกได้ — ยังไม่ต้องแพ็ค"] };
  }
  if (o.status === "shipped") reasons.push("ร้านค้าบอกว่าส่งไปแล้ว — แน่ใจว่าจะแพ็คซ้ำ?");
  if (o.packed_at) reasons.push(`แพ็คไปแล้วเมื่อ ${fmtThaiTime(o.packed_at)}${o.packed_by_name ? ` โดย ${o.packed_by_name}` : ""}`);
  return { level: reasons.length ? "warn" : "ok", reasons };
}

/** "17 พ.ย. 10:42" เวลาไทย */
export function fmtThaiTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── กล่องที่แนะนำ ───────────────────────────────────────────────────────
export type BoxSize = { name: string; width_cm: number | null; length_cm: number | null; height_cm: number | null };
const volume = (b: BoxSize): number => (Number(b.width_cm) || 0) * (Number(b.length_cm) || 0) * (Number(b.height_cm) || 0);

/** กล่องใหญ่สุดในออเดอร์ (ปริมาตร) · ไม่มีขนาด = เอาตัวแรกที่มีชื่อ · ไม่มีเลย = null ("ยังไม่ได้ตั้งกล่อง") */
export function suggestBox(boxes: (BoxSize | null | undefined)[]): BoxSize | null {
  const list = boxes.filter((b): b is BoxSize => !!b && !!b.name);
  if (!list.length) return null;
  return list.reduce((best, b) => (volume(b) > volume(best) ? b : best), list[0]);
}

export function boxSizeText(b: BoxSize | null | undefined): string {
  if (!b) return "";
  const dims = [b.width_cm, b.length_cm, b.height_cm].map((n) => Number(n) || 0);
  return dims.some((n) => n > 0) ? `${dims.map((n) => +n.toFixed(1)).join("×")} ซม.` : "";
}

// ── เช็กของ ─────────────────────────────────────────────────────────────
export type CheckItem = {
  key: string;                // id บรรทัดในออเดอร์
  qty: number;                // จำนวนที่ต้องใส่
  codes: string[];            // รหัสที่ยิงแล้วนับเป็นบรรทัดนี้ (บาร์โค้ด / รหัส SKU / รหัสจากร้าน)
  scanned: number;            // ยิงแล้วกี่ชิ้น
  manual: number;             // ติ๊กมือกี่ชิ้น
};
export type ScanResult =
  | { kind: "ok"; key: string; done: boolean }
  | { kind: "over"; key: string }
  | { kind: "not_in_order" };

const norm = (s: string): string => String(s ?? "").trim().toUpperCase();
export const itemCount = (it: CheckItem): number => it.scanned + it.manual;

/** ยิงบาร์โค้ดสินค้า 1 ครั้ง → คืนผล + รายการใหม่ (ไม่แก้ของเดิม) · รหัสซ้ำหลายบรรทัด = ลงบรรทัดแรกที่ยังไม่ครบ */
export function applyItemScan(items: CheckItem[], raw: string): { result: ScanResult; items: CheckItem[] } {
  const code = norm(raw);
  const matches = items.filter((it) => it.codes.some((c) => norm(c) === code));
  if (!matches.length) return { result: { kind: "not_in_order" }, items };
  const target = matches.find((it) => itemCount(it) < it.qty);
  if (!target) return { result: { kind: "over", key: matches[0].key }, items };
  const next = items.map((it) => (it.key === target.key ? { ...it, scanned: it.scanned + 1 } : it));
  const after = next.find((it) => it.key === target.key)!;
  return { result: { kind: "ok", key: target.key, done: itemCount(after) >= after.qty }, items: next };
}

export function allChecked(items: CheckItem[]): boolean {
  return items.length > 0 && items.every((it) => itemCount(it) >= it.qty);
}

export function checkProgress(items: CheckItem[]): { done: number; total: number } {
  return items.reduce((a, it) => ({ done: a.done + Math.min(itemCount(it), it.qty), total: a.total + it.qty }), { done: 0, total: 0 });
}

// ── บันทึก ─────────────────────────────────────────────────────────────
export const PACK_FINISH_STATUSES = ["done", "problem", "abandoned"] as const;
export type PackFinishStatus = (typeof PACK_FINISH_STATUSES)[number];
export const PACK_PROBLEMS: { key: string; label: string }[] = [
  { key: "missing", label: "ของขาด" },
  { key: "wrong", label: "ของผิด" },
  { key: "damaged", label: "ของเสีย/ชำรุด" },
  { key: "other", label: "อื่น ๆ" },
];
export const MANUAL_REASONS = ["ไม่มีสติกเกอร์บาร์โค้ด", "สติกเกอร์อ่านไม่ออก", "สินค้าจับคู่ไม่ได้", "อื่น ๆ"];
export const FINISH_METHODS = ["next_label", "card", "pedal", "button"] as const;
export type FinishMethod = (typeof FINISH_METHODS)[number];

/** คลิปยาวสุด (วินาที) — เจ้าของกำหนด 60 */
export const CLIP_MAX_SEC = 60;
