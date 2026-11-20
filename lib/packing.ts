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
  | { kind: "undo" }
  | { kind: "box"; box: string };

export const PACK_COMMANDS: { code: string; label: string; hint: string }[] = [
  { code: `${PACK_CMD_PREFIX}DONE`, label: "แพ็คเสร็จ", hint: "จบออเดอร์นี้ เก็บคลิป" },
  { code: `${PACK_CMD_PREFIX}PROBLEM`, label: "มีปัญหา", hint: "จบแบบมีปัญหา (ของขาด/ผิด/เสีย)" },
  { code: `${PACK_CMD_PREFIX}REDO`, label: "อัดใหม่", hint: "ทิ้งคลิปนี้ เริ่มอัดออเดอร์เดิมใหม่" },
  { code: `${PACK_CMD_PREFIX}SKIP`, label: "ข้าม", hint: "ปิดออเดอร์นี้โดยไม่บันทึกว่าแพ็คแล้ว" },
  { code: `${PACK_CMD_PREFIX}UNDO`, label: "ย้อนการยิง", hint: "ยิงสินค้าผิดชิ้น — ลบการยิงครั้งล่าสุด" },
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
  if (up === "UNDO") return { kind: "undo" };
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

// 2026-11-20: + รหัสยังไม่จ่ายของ LINE SHOPPING / เว็บไซต์ (ดึงเข้าศูนย์ออเดอร์แล้ว · lib/platform-order-status isUnpaidPlatformStatus) · Lazada "unpaid" ตัวพิมพ์เล็ก = เทียบแบบตัวใหญ่
export const UNPAID_STATUSES = ["UNPAID", "ON_HOLD", "LINE_UNPAID", "LINE_EXPIRED", "WEB_UNPAID", "WEB_VERIFYING"];

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

// ── เดาสินค้าจากรหัสร้าน (ตอนออเดอร์ยังจับคู่ไม่ได้) ─────────────────────────
/** รหัสร้านมักมีของต่อท้าย เช่น ไซซ์ "MGN369-01XXL" → ลองรหัสที่สั้นลงทีละช่วง (ตัดที่ขีด/ช่องว่าง หรือรอยต่อตัวเลข↔ตัวอักษร)
 *  เรียงยาว→สั้น · สั้นสุด 4 ตัวอักษร กันไปตรงรหัสสั้น ๆ ที่ไม่เกี่ยว · ใช้แค่ตอนแสดงในหน้าแพ็ก ไม่บันทึกการจับคู่ */
export const GUESS_MIN_LEN = 4;
export function shopCodeGuesses(code: string | null | undefined): string[] {
  const c = String(code ?? "").trim().toUpperCase();
  if (c.length < GUESS_MIN_LEN) return [];
  const out = new Set<string>();
  for (let i = c.length; i >= GUESS_MIN_LEN; i--) {
    const head = c.slice(0, i), next = c[i];
    if (next !== undefined) {
      const a = c[i - 1];
      const sep = /[-_ ./]/.test(next);
      const flip = /[0-9]/.test(a) !== /[0-9]/.test(next) && /[A-Z0-9]/.test(a) && /[A-Z0-9]/.test(next);
      if (!sep && !flip) continue;
    }
    const t = head.replace(/[-_ ./]+$/, "");
    if (t.length >= GUESS_MIN_LEN) out.add(t);
  }
  return [...out];
}
/** เลือกรหัสที่ยาวที่สุดที่มีอยู่จริง (เจาะจงที่สุด) · ไม่มี = null */
export function bestGuess(code: string | null | undefined, known: (c: string) => boolean): string | null {
  for (const g of shopCodeGuesses(code)) if (known(g)) return g;
  return null;
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

// ── ย้อน / แก้ / ยกเลิกการแพ็ค (รอบ 3 · เจ้าของสั่ง 2026-11-19) ──────────
/** สถานะที่แก้ทีหลังได้ · voided = ยกเลิกการแพ็ค (เก็บแถวไว้เป็นประวัติ ไม่ลบจริง) */
export const PACK_EDIT_STATUSES = ["done", "problem", "voided"] as const;
export type PackEditStatus = (typeof PACK_EDIT_STATUSES)[number];
export const PACK_STATUS_LABEL: Record<string, string> = { packing: "กำลังแพ็ค", done: "เสร็จ", problem: "มีปัญหา", abandoned: "ข้าม", voided: "ยกเลิกการแพ็ค" };

/** แถว "กำลังแพ็ค" ที่เก่ากว่านี้ = ทิ้งค้าง (ปิดแท็บ/เน็ตหลุด) ไม่นับว่ามีคนแพ็คอยู่ */
export const PACK_LOCK_MINUTES = 15;
export function isFreshLock(startedAt: string, now = Date.now()): boolean {
  const t = new Date(startedAt).getTime();
  return Number.isFinite(t) && now - t < PACK_LOCK_MINUTES * 60_000;
}

/** วันไทย (YYYY-MM-DD) ของเวลานี้ */
export const bangkokDate = (iso: string | number | Date): string => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** แก้บันทึกการแพ็คได้ไหม: หัวหน้า (packing.manage) แก้ได้ทุกใบ · คนแพ็คแก้ได้เฉพาะของตัวเอง ภายในวันเดียวกัน (เวลาไทย) */
export function canEditPackSession(s: { packer_id: string | null; started_at: string; status: string }, me: { id: string | null; manager: boolean }, now = Date.now()): boolean {
  if (s.status === "packing") return false;
  if (me.manager) return true;
  return !!me.id && s.packer_id === me.id && bangkokDate(s.started_at) === bangkokDate(now);
}

/** เวลา "แพ็คแล้ว" ของออเดอร์ = บันทึก "เสร็จ" ล่าสุดที่ยังไม่ถูกยกเลิก · ไม่มี = null (กลับไปอยู่คิวรอแพ็ค) */
export function packedFromSessions(rows: { status: string; finished_at: string | null; packer_id: string | null }[]): { packed_at: string | null; packed_by: string | null } {
  const done = rows.filter((r) => r.status === "done" && r.finished_at).sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)));
  return done.length ? { packed_at: done[0].finished_at, packed_by: done[0].packer_id } : { packed_at: null, packed_by: null };
}

/** ย้อนการยิงล่าสุด: ลดชิ้นที่ยิง (หรือติ๊กมือ) ของบรรทัดนั้น 1 ชิ้น · คืนรายการใหม่ */
export function undoItemScan<T extends CheckItem>(items: T[], key: string, kind: "scan" | "manual"): T[] {
  return items.map((it) => {
    if (it.key !== key) return it;
    if (kind === "manual" && it.manual > 0) return { ...it, manual: it.manual - 1 };
    if (it.scanned > 0) return { ...it, scanned: it.scanned - 1 };
    if (it.manual > 0) return { ...it, manual: it.manual - 1 };
    return it;
  });
}
export const PACK_PROBLEMS: { key: string; label: string }[] = [
  { key: "missing", label: "ของขาด" },
  { key: "wrong", label: "ของผิด" },
  { key: "damaged", label: "ของเสีย/ชำรุด" },
  { key: "other", label: "อื่น ๆ" },
];
export const MANUAL_REASONS = ["ไม่มีสติกเกอร์บาร์โค้ด", "สติกเกอร์อ่านไม่ออก", "เครื่องยิงเสีย", "สินค้าจับคู่ไม่ได้", "อื่น ๆ"];
export const FINISH_METHODS = ["next_label", "card", "pedal", "button"] as const;
export type FinishMethod = (typeof FINISH_METHODS)[number];

/** คลิปยาวสุด (วินาที) — เจ้าของกำหนด 60 */
export const CLIP_MAX_SEC = 60;
