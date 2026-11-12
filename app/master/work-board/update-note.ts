/**
 * ร่าง "งานถึงไหนแล้ว" ต่อใบสั่งผลิต — กติกากลาง (บอร์ดจ่ายงาน · เจ้าของขอ 2026-11-12)
 *   เดินดูหน้างานแล้วติ๊กไว้ก่อน (ยังไม่บันทึกจริง) → ปุ่ม "อัปเดต" (CatchUpModal) ดึงไปกรอกให้ → บันทึกจริงผ่าน API เดิม
 *   5 ขั้น เรียงตามป๊อปอัปเดต: เตรียม/ตัดครบ → จ่ายงาน → รับคืน → QC รับเข้า → ส่งของ
 *   ติ๊กขั้นหลัง = ติ๊กขั้นก่อนหน้าให้ด้วย (ตั้งค่าเริ่ม) · เอาติ๊กออกได้ทีละขั้น
 * ที่เก็บ: ตาราง mo_update_notes ผ่าน /api/mo/update-notes (ทั้งทีมเห็น · 1 ใบ = 1 ร่าง) · ทดสอบ: update-note.test.ts
 */
import type { CuTargetKey } from "./catch-up";

export type UnKey = "prep" | "disp" | "ret" | "qc" | "ship";
export const UN_ORDER: UnKey[] = ["prep", "disp", "ret", "qc", "ship"];
export const UN_LABEL: Record<UnKey, string> = { prep: "เตรียม/ตัดของครบ", disp: "จ่ายงานแล้ว", ret: "รับคืนแล้ว", qc: "QC รับเข้าแล้ว", ship: "ส่งของแล้ว" };
export const UN_SHORT: Record<UnKey, string> = { prep: "เตรียม/ตัดครบ", disp: "จ่ายงาน", ret: "รับคืน", qc: "QC รับเข้า", ship: "ส่งของ" };

export type UnSteps = {
  prep?: { date: string | null };
  /** โต๊ะ + คนรับ (ว่าง = ทั้งโต๊ะ) + จำนวน */
  disp?: { deptId: string; crewIds: string[]; qty: number };
  /** รับคืนกี่ชิ้น · เสียกี่ชิ้น */
  ret?: { qty: number; bad: number };
  qc?: { good: number };
  ship?: { qty: number };
};
export type UpdateNote = {
  mo_no: string; mo_id: string | null; steps: UnSteps; note: string | null;
  updated_by: string | null; updated_name: string | null; updated_at: string;
  applied_at: string | null; applied_name: string | null;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };

/** ทำความสะอาดข้อมูลที่รับมา (จากหน้าเว็บ/ฐานข้อมูล) — เก็บเฉพาะช่องที่รู้จัก ตัวเลขติดลบ = 0 */
export function unClean(raw: unknown): UnSteps {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const out: UnSteps = {};
  if (r.prep) { const d = String(r.prep.date ?? ""); out.prep = { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null }; }
  if (r.disp) out.disp = { deptId: String(r.disp.deptId ?? ""), crewIds: Array.isArray(r.disp.crewIds) ? (r.disp.crewIds as unknown[]).map(String).filter(Boolean).slice(0, 20) : [], qty: num(r.disp.qty) };
  if (r.ret) out.ret = { qty: num(r.ret.qty), bad: num(r.ret.bad) };
  if (r.qc) out.qc = { good: num(r.qc.good) };
  if (r.ship) out.ship = { qty: num(r.ship.qty) };
  return out;
}

export const unOn = (s: UnSteps): UnKey[] => UN_ORDER.filter((k) => !!s[k]);
export const unLast = (s: UnSteps): UnKey | null => { const o = unOn(s); return o.length ? o[o.length - 1] : null; };

/** ค่าเริ่มของแต่ละขั้น (ตามจำนวนสั่ง/ขั้นก่อนหน้า) */
function unDefault(k: UnKey, s: UnSteps, qty: number): NonNullable<UnSteps[UnKey]> {
  const dispQ = s.disp?.qty || qty, retQ = s.ret ? Math.max(0, s.ret.qty - s.ret.bad) : dispQ;
  if (k === "prep") return { date: null };
  if (k === "disp") return { deptId: "", crewIds: [], qty };
  if (k === "ret") return { qty: dispQ, bad: 0 };
  if (k === "qc") return { good: retQ };
  return { qty: s.qc?.good ?? retQ };
}

/** ติ๊ก/เอาติ๊กออก — ติ๊กขั้นหลัง = เติมขั้นก่อนหน้าที่ยังไม่ติ๊กให้ด้วย · เอาออก = เอาเฉพาะขั้นนั้น */
export function unTick(s: UnSteps, k: UnKey, on: boolean, qty: number): UnSteps {
  const next: UnSteps = { ...s };
  if (!on) { delete next[k]; return next; }
  for (const key of UN_ORDER.slice(0, UN_ORDER.indexOf(k) + 1)) {
    if (!next[key]) (next as Record<UnKey, unknown>)[key] = unDefault(key, next, qty);
  }
  return next;
}

/**
 * ขั้นในป๊อปอัปเดตที่ควรเปิด จากขั้นไกลสุดที่ติ๊ก
 *   เตรียม/ตัด → "ตัดแล้ว" · จ่าย → "จ่ายงานแล้ว" · รับคืนไม่ครบยอดจ่าย → "ส่งคืนบางส่วน" / ครบ → "ส่งคืนครบ" · QC → "QC รับเข้า" · ส่งของ → "ส่งออกจาก QC"
 *   dispatchedQty = ยอดที่จ่ายจริงแล้วในระบบ (ไว้ตัดสินว่ารับคืนครบไหม เมื่อร่างไม่ได้ติ๊กจ่าย)
 */
export function unTarget(s: UnSteps, dispatchedQty = 0): CuTargetKey | null {
  const last = unLast(s);
  if (!last) return null;
  if (last === "prep") return "cut";
  if (last === "disp") return "dispatch";
  if (last === "ret") {
    const sent = Math.max(s.disp?.qty ?? 0, dispatchedQty);
    return s.ret && sent > 0 && s.ret.qty + 0.0001 < sent ? "return_part" : "return";
  }
  if (last === "qc") return "qc_in";
  return "ship";
}

/** สรุปสั้นในช่องตาราง */
export function unSummary(s: UnSteps, deskName?: (id: string) => string | null): { last: string | null; detail: string } {
  const last = unLast(s);
  const parts: string[] = [];
  if (s.disp) parts.push(`จ่าย ${s.disp.qty}${s.disp.deptId && deskName?.(s.disp.deptId) ? ` → ${deskName(s.disp.deptId)}` : ""}`);
  if (s.ret) parts.push(`คืน ${s.ret.qty}${s.ret.bad ? ` (เสีย ${s.ret.bad})` : ""}`);
  if (s.qc) parts.push(`QC ${s.qc.good}`);
  if (s.ship) parts.push(`ส่ง ${s.ship.qty}`);
  return { last: last ? UN_SHORT[last] : null, detail: parts.join(" · ") || (s.prep ? "เตรียม/ตัดครบ" : "") };
}
