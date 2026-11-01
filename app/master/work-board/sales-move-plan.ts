/**
 * 🔀 ผูกใบขายผิด → ย้ายไปใบสั่งผลิตที่ถูก + ย้อนสถานะใบเดิม — กติกากลาง (ไม่มี React ทดสอบได้)
 * เจ้าของอนุมัติ 2026-11-01 (widget): "ถ้าผูกผิด ต้องย้ายได้ และแก้สถานะใบงานใบนั้นด้วย"
 *
 * ใบเดิมจริง ๆ เป็นแบบไหน (MoveRevert):
 *   wait = ยังไม่ได้ทำเลย → กลับเป็น "รอจ่าย": เอาของที่ส่งออกกลับขึ้นชั้น (qc unship) แล้วใช้ตัวแก้ไขใบงานเดิม
 *          (catch-up-edit-plan ceBuild/ceRun) ย้อนของจากชั้น QC · ลบรอบส่งคืน · ยกเลิกใบจ่าย · เอาติ๊กเตรียม/ตัดออก
 *   qc   = ทำเสร็จแต่ยังไม่ได้ขาย → ของกลับขึ้นชั้น QC เท่าจำนวนที่ย้าย (ประวัติผลิตอยู่ครบ)
 *   none = ไม่แตะสถานะ ถอดผูกอย่างเดียว
 * ลำดับตอนบันทึก: ถอดผูกบรรทัดนี้จากใบเดิม → (ใบปลายทางผูกใบขายอื่นอยู่ = ถอดออก) → ผูกใบปลายทาง
 *   (พัง = ผูกกลับใบเดิม) → ย้อนสถานะใบเดิม (พัง = หยุด บอกว่าสำเร็จถึงไหน — แก้ต่อที่ปุ่ม "แก้ไข" บนบอร์ด)
 * ทุกขั้นมี audit ของ API เดิม (mo.sales_unlink / mo.sales_link / qc.unship / via=cu_edit)
 */
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import { shipLeft, type MoveInfo, type ShipRec } from "@/lib/mo-sales-move";
import { ceBuild, ceInitial, ceRun, type CeForm } from "./catch-up-edit-plan";
import type { CuApi } from "./catch-up";

export { shipLeft, shipRecs, type MoveInfo, type ShipRec } from "@/lib/mo-sales-move";

const EPS = 0.0001;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => r2(n).toLocaleString("th-TH");

export type MoveRevert = "wait" | "qc" | "none";
export const MOVE_REVERTS: MoveRevert[] = ["wait", "qc", "none"];
export const MOVE_REVERT: Record<MoveRevert, { label: string; hint: string; after: string }> = {
  wait: { label: "ยังไม่ได้ทำเลย → กลับเป็น “รอจ่าย”", hint: "ยกเลิกใบจ่ายช่าง · ลบรอบส่งคืน · เอาของออกจาก QC/ที่ส่งออก · เอาติ๊กเตรียม/ตัดออก", after: "รอจ่าย" },
  qc: { label: "ทำเสร็จแล้วแต่ยังไม่ได้ขาย → ของกลับขึ้นชั้น QC", hint: "ย้อนแค่ขั้นส่งออก “ขายออก” เท่าจำนวนที่ย้าย (ที่เข้าคลังขายไม่แตะ) ประวัติผลิตอยู่ครบ", after: "ของอยู่บนชั้น QC" },
  none: { label: "ไม่แตะสถานะ ถอดผูกอย่างเดียว", hint: "ใบงานเดิมคงสถานะเดิม", after: "สถานะเดิม" },
};


/** ย้อนการส่งออก: qty null = ทั้งหมดที่ยังย้อนได้ · ระบุจำนวน (ย้ายใบขาย) = เอาจากที่ "ขายออก" ก่อน (ส่วนที่เข้าคลังขายไม่ใช่ของใบขายนี้) แล้วครั้งล่าสุดก่อน */
export function unshipPlan(ships: ShipRec[], qty: number | null): { id: string; qty: number }[] {
  let need = qty == null ? shipLeft(ships) : r2(qty);
  const out: { id: string; qty: number }[] = [];
  const order = qty == null ? ships : [...ships.filter((s) => s.mode === "sell"), ...ships.filter((s) => s.mode !== "sell")];
  for (const s of order) {
    if (need <= EPS) break;
    const take = r2(Math.min(s.left, need));
    if (take <= EPS) continue;
    out.push({ id: s.id, qty: take });
    need = r2(need - take);
  }
  return out;
}

/** ฟอร์ม "ยังไม่ได้ทำเลย" ของตัวแก้ไขใบงาน: ย้อนของบนชั้น QC ทุกชิ้น · ลบรอบส่งคืนทุกรอบ · ยกเลิกใบจ่ายทุกใบ · เอาติ๊กเตรียม/ตัดออก
 *  (ป้าย "ของครบ" ที่ขั้นซื้อของไม่แตะ — ของอาจซื้อมาแล้วจริง และเอาป้ายออกต้องเป็นแอดมิน) */
export function revertAllForm(s: CatchUpSnapshot): CeForm {
  const f = ceInitial(s);
  return {
    ...f,
    prep: { done: false, date: null }, cut: { done: false, date: null },
    wos: f.wos.map((w) => ({ ...w, cancel: true })),
    subs: f.subs.map((x) => ({ ...x, del: true })),
    qcBack: (s.qcItems ?? []).map((i) => i.id),
  };
}

/** รอบส่งคืนที่นับเข้าค่าแรงช่างแล้ว (ไม่ใช่ "รอลงค่าแรง") — ลบจากที่นี่ไม่ได้ กันยอดค่าแรงเพี้ยน */
export const paidSubs = (s: CatchUpSnapshot | null) => (s?.subs ?? []).filter((x) => !x.info_pending && x.wage != null && x.wage > EPS);

/** เหตุที่เลือกทางนั้นไม่ได้ (null = เลือกได้) · lineId = บรรทัดใบขายที่ย้าย */
export function revertBlock(revert: MoveRevert, a: { info: MoveInfo; snap: CatchUpSnapshot | null; lineId: string; qty: number }): string | null {
  if (revert === "none") return null;
  const { info } = a;
  if (["done", "closed"].includes(info.mo.status)) return "ใบนี้ปิดงานแล้ว — ย้อนสถานะจากที่นี่ไม่ได้";
  if (revert === "qc") return shipLeft(info.ships) > EPS ? null : "ใบนี้ยังไม่ได้ส่งออก — ไม่มีของให้ย้อนกลับขึ้นชั้น";
  const others = info.links.filter((l) => l.sale_line_id !== a.lineId);
  if (others.length) return `ใบนี้ยังผูกใบขาย ${[...new Set(others.map((l) => l.so_number ?? "—"))].join(", ")} อยู่ — ย้อนทั้งใบไม่ได้ (เลือก “ของกลับขึ้นชั้น QC”)`;
  if (!a.snap) return "กำลังโหลดข้อมูลใบงาน…";
  const paid = paidSubs(a.snap);
  if (paid.length) return `รอบส่งคืนลงค่าแรงช่างแล้ว ${paid.map((x) => `฿${fmt(x.wage ?? 0)}${x.craftsman_name ? ` (${x.craftsman_name})` : ""}`).join(", ")} — ย้อนจากที่นี่ไม่ได้ ใช้ปุ่ม “แก้ไข” บนบอร์ด`;
  return null;
}
/** ทางตั้งต้น = ทางแรกที่เลือกได้ (ยังไม่ได้ทำ → ของกลับขึ้นชั้น → ไม่แตะ) */
export const defaultRevert = (a: Parameters<typeof revertBlock>[1]): MoveRevert => MOVE_REVERTS.find((r) => !revertBlock(r, a)) ?? "none";

/** ชั้นตั้งต้นตอนเอาของกลับขึ้น: ชั้นที่ส่งออกไปล่าสุด (ถ้าจดไว้) ไม่งั้นชั้นเก็บของ (ไม่ใช่ชั้นของเสีย) ชั้นสุดท้าย = "QC แล้ว" */
export function defaultShelf(info: MoveInfo): string | null {
  const store = info.shelves.filter((s) => s.kind !== "defect");
  const last = info.ships.find((s) => s.shelf_id && store.some((x) => x.id === s.shelf_id))?.shelf_id;
  return last ?? store[store.length - 1]?.id ?? null;
}

export type MoveStep = { label: string; ok: boolean; msg: string };
/**
 * บันทึกการย้าย — ทีละขั้น พัง = หยุด แล้วรายงานว่าสำเร็จถึงไหน
 * loadSnap = โหลดใบเดิมใหม่ (GET /api/mo/catch-up?mo_no=&edit=1) หลังเอาของกลับขึ้นชั้น เพื่อให้ตัวแก้ไขใบงานเห็นของที่เพิ่งกลับมา
 */
export async function runMove(p: {
  info: MoveInfo; lineId: string; soNumber: string; qty: number;
  to: { mo_no: string; relink: boolean };
  revert: MoveRevert; shelfId: string | null;
  api: CuApi; loadSnap: () => Promise<CatchUpSnapshot>;
}): Promise<MoveStep[]> {
  const out: MoveStep[] = [];
  const from = p.info.mo.mo_no;
  const q = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); out.push({ label, ok: true, msg: label }); return true; }
    catch (e) { out.push({ label, ok: false, msg: `${label} — ${e instanceof Error ? e.message : "ไม่สำเร็จ"}` }); return false; }
  };
  const link = (mo: string) => p.api("/api/mo/sales-match", { mo_no: mo, parts: [{ sale_line_id: p.lineId, qty: p.qty }] });

  if (!(await step(`ถอด ${p.soNumber} ออกจาก ${from}`, () => p.api(`/api/mo/sales-match?${q({ mo_no: from, sale_line_id: p.lineId })}`, null, "DELETE")))) return out;
  if (p.to.relink && !(await step(`ถอดใบขายเดิมออกจาก ${p.to.mo_no}`, () => p.api(`/api/mo/sales-match?${q({ mo_no: p.to.mo_no })}`, null, "DELETE")))) return out;
  if (!(await step(`ผูก ${p.soNumber} (${fmt(p.qty)} ชิ้น) กับ ${p.to.mo_no}`, () => link(p.to.mo_no)))) {
    // ผูกใบใหม่ไม่ได้ → ผูกกลับใบเดิม (ใบเดิมที่ยังผูกใบขายอื่นอยู่ API ไม่รับ — บอกให้ไปผูกเองที่แท็บ "ยังไม่ผูก")
    await step(`ผูก ${p.soNumber} กลับ ${from} เหมือนเดิม`, () => link(from));
    return out;
  }
  if (p.revert === "none") return out;

  const tag = { via: "sales_move", label: `ย้ายใบขาย ${p.soNumber} จาก ${from} ไป ${p.to.mo_no}` };
  const backs = unshipPlan(p.info.ships, p.revert === "wait" ? null : p.qty);
  for (const b of backs) {
    if (!(await step(`เอาของที่ส่งออก ${fmt(b.qty)} ชิ้นกลับขึ้นชั้น QC (${from})`,
      () => p.api("/api/qc-warehouse/items", { action: "unship", ship_audit_id: b.id, qty: b.qty, ...(p.shelfId ? { shelf_id: p.shelfId } : {}), ...tag })))) return out;
  }
  if (p.revert === "qc") return out;

  let snap: CatchUpSnapshot;
  try { snap = await p.loadSnap(); } catch (e) { out.push({ label: "โหลดใบงาน", ok: false, msg: `โหลดใบ ${from} ไม่สำเร็จ — ${e instanceof Error ? e.message : ""}` }); return out; }
  const built = ceBuild(snap, revertAllForm(snap), { departments: [], people: [] });
  if (built.errors.length) {
    // "ยังไม่ได้แก้อะไร" = ใบนี้ไม่มีอะไรให้ย้อนแล้ว (เป็นรอจ่ายอยู่แล้ว)
    if (!built.ops.length && built.issues.every((x) => x.field === "none")) return out;
    out.push({ label: "ย้อนสถานะใบเดิม", ok: false, msg: `ย้อน ${from} เป็นรอจ่ายไม่ได้: ${built.errors.join(" · ")} — แก้ต่อที่ปุ่ม “แก้ไข” บนบอร์ด` });
    return out;
  }
  const res = await ceRun(built.ops, snap.mo.id, p.api);
  for (const r of res) out.push({ label: r.op.label, ok: r.ok, msg: r.msg });
  return out;
}
