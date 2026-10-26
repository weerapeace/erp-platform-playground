/**
 * ของกลาง: "ข้ามขั้นตอน" ของใบสั่งผลิต (เฉพาะแอดมิน) — ไว้จัดการใบงานค้าง
 * --------------------------------------------------------------------------
 * เก็บเป็น "ป้าย" ที่ manufacturing_orders.skipped_stages (jsonb) = { [ขั้น]: { by, by_name, at, reason } }
 *   → ไม่ลบ/ไม่แก้ข้อมูลเดิม (ติ๊กเตรียม/ตัด, ใบขอซื้อ, ใบจ่ายงาน) · กด "เอาคืน" = ลบป้าย กลับเป็นเหมือนเดิมทุกอย่าง
 *
 * ใครเคารพป้ายนี้ (ต้องตรงกันทุกที่ — แก้กติกาที่ไฟล์นี้):
 *   buy      → /api/mo/material-progress นับเป็นของครบ · /api/mo/purchase-needs, material-demand, material-readiness ไม่นับใบนี้
 *   prep/cut → /api/mo/work-board นับเตรียม/ตัดครบ (ไฟพร้อมจ่าย)
 *   dispatch → บอร์ดนับว่าจ่ายแล้ว (ใบยังอยู่แท็บรอจ่าย ขั้นถัดไป = รับคืน/ปิดใบ) — ไม่สร้างใบจ่ายงาน = ไม่มีค่าแรงช่าง
 *   receive  → lib/mo-workflow ปิดใบได้โดยไม่ต้องรับคืนครบ — ไม่มีของเข้าคิว QC/โกดัง = สต๊อกสินค้าสำเร็จรูปไม่เพิ่ม
 * API: PATCH /api/mo/[id]/skip-stage (admin.users) + audit ลง audit_logs ทุกครั้ง
 */

export type MoSkipStage = "buy" | "prep" | "cut" | "dispatch" | "receive";
export const MO_SKIP_STAGES: MoSkipStage[] = ["buy", "prep", "cut", "dispatch", "receive"];

export type MoSkipInfo = { by: string | null; by_name: string | null; at: string; reason: string | null };
export type MoSkipped = Partial<Record<MoSkipStage, MoSkipInfo>>;

export const MO_SKIP_META: Record<MoSkipStage, { label: string; needReason: boolean; careful: boolean; impacts: string[] }> = {
  buy: { label: "ซื้อของ", needReason: false, careful: false, impacts: [
    "ใบนี้ออกจากรายการ \"ต้องซื้อ\" ในหน้าขอซื้อ / แดชบอร์ดจัดซื้อ / ความพร้อมวัตถุดิบ",
    "ใบขอซื้อ / PO ที่ออกไปแล้วยังอยู่ ไม่ถูกยกเลิก (ไม่เอาแล้วต้องไปยกเลิกที่หน้าจัดซื้อ)",
    "สต๊อกไม่เปลี่ยน · ต้นทุนวัตถุดิบยังคิดตามสูตร",
  ] },
  prep: { label: "เตรียม", needReason: false, careful: false, impacts: [
    "เปลี่ยนแค่ไฟสถานะบนบอร์ด (นับว่าเตรียมครบ)",
    "ติ๊กเตรียมรายวัตถุดิบเดิมไม่ถูกแตะ · ไม่กระทบสต๊อก/เงิน",
  ] },
  cut: { label: "ตัด", needReason: false, careful: false, impacts: [
    "เปลี่ยนแค่ไฟสถานะบนบอร์ด (นับว่าตัดครบ)",
    "ติ๊กตัดรายชิ้นเดิมไม่ถูกแตะ · ไม่กระทบสต๊อก/เงิน",
  ] },
  dispatch: { label: "จ่ายงาน", needReason: true, careful: true, impacts: [
    "นับว่าจ่ายแล้ว แต่ไม่สร้างใบจ่ายงาน = ไม่มีค่าแรงช่าง/งานเหมาของใบนี้ในระบบ",
    "รายงานผลงานโต๊ะ/ช่างจะไม่นับใบนี้",
    "ใบยังอยู่แท็บรอจ่าย (ขั้นถัดไป = รับคืน / ปิดใบ)",
  ] },
  receive: { label: "รับคืน", needReason: true, careful: true, impacts: [
    "ไม่มีของเข้าคิว QC / ชั้นโกดัง → สต๊อกสินค้าสำเร็จรูปไม่เพิ่ม",
    "ไม่มีบันทึกส่งงาน = ไม่มีค่าแรงช่าง",
    "ปิดใบได้ทันที (ถ้าไม่มีใบจ่ายงานค้าง)",
  ] },
};

export const isMoSkipStage = (v: unknown): v is MoSkipStage => typeof v === "string" && (MO_SKIP_STAGES as string[]).includes(v);

/** อ่านค่า jsonb จาก DB แบบปลอดภัย (ค่าเพี้ยน/ว่าง = ไม่มีขั้นที่ข้าม) */
export function parseSkipped(v: unknown): MoSkipped {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: MoSkipped = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!isMoSkipStage(k) || !x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    out[k] = { by: typeof o.by === "string" ? o.by : null, by_name: typeof o.by_name === "string" ? o.by_name : null,
      at: typeof o.at === "string" ? o.at : "", reason: typeof o.reason === "string" && o.reason ? o.reason : null };
  }
  return out;
}

export const isSkipped = (s: MoSkipped | null | undefined, stage: MoSkipStage) => !!s?.[stage];

/** ขั้นก่อนหน้าที่ยังไม่ข้าม (ไว้ถาม "ข้ามขั้นก่อนหน้าด้วยไหม") — done = ขั้นที่ทำครบจริงแล้ว ไม่ต้องข้าม */
export function earlierStagesToSkip(stage: MoSkipStage, skipped: MoSkipped, done: Partial<Record<MoSkipStage, boolean>>): MoSkipStage[] {
  const idx = MO_SKIP_STAGES.indexOf(stage);
  return MO_SKIP_STAGES.slice(0, idx).filter((s) => !skipped[s] && !done[s]);
}
