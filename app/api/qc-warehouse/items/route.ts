/**
 * โกดัง QC — actions ต่อของบนชั้น (เฟส 1)
 * POST /api/qc-warehouse/items  { action, ... }
 *   receive       { wo_id, shelf_id, good, bad:[{reason,qty}] }   → ดึงเข้า QC (แยกดี/เสีย) + เพิ่ม qc_pulled_qty
 *   move          { item_id, shelf_id }                           → ย้ายชั้น (ห้ามเข้า defect)
 *   ship          { item_id, mode, wh }                           → ส่งออก (ลบของออก) · audit จดชั้น/ใบจ่าย/สถานะ ไว้ให้ unship · คืน audit_id
 *   unship        { ship_audit_id, qty?, shelf_id?, into_item_id? } → ย้อนการส่งออก (ผูกใบขายผิด / ย้อนการอัปเดตงาน) — ของกลับขึ้นชั้นจากประวัติ qc.ship
 *                 into_item_id = บวกเข้าแถวนี้ (แถวที่เพิ่งย้อนกลับมาจากรอบส่งออกก่อน — ส่งแบ่ง 2 รอบจากแถวเดียว จะได้ไม่แตกเป็น 2 แถว)
 *                                                                    ไม่เกินที่ส่งออกไป (หักที่ย้อนแล้ว) · ไม่ส่ง qty = ที่เหลือทั้งหมด
 *   to_defect     { item_id, qty, reason }                        → ย้ายของดี → ชั้นของเสีย
 *   repair_send   { item_id, repair_by }                          → ส่งซ่อม
 *   repair_cancel { item_id }                                     → ยกเลิกซ่อม
 *   repair_receive{ item_id, good, scrap, shelf_id }              → รับจากซ่อม (ดี→ชั้น, เสีย→ทิ้ง)
 *   return_queue  { item_id }                                     → ย้ายกลับงานรอ QC (คืน qc_pulled_qty)
 *   update_item   { item_id, qty?, sku?, source? }                → แก้ของที่ "ใส่เข้าชั้นเอง" (ลงจำนวน/รหัสผิด)
 *                                                                    ของที่มาจากใบจ่ายงานแก้ตรงนี้ไม่ได้ (ยอดผูกกับใบจ่ายงาน → ใช้ return_queue แล้วรับเข้าใหม่)
 *   return_worker { wo_id }                                       → คืนงานรอ QC กลับให้ช่าง (ลดยอดรับคืนส่วนที่ยังไม่ดึงเข้า QC + เปิดใบกลับ + ดึงค่าแรงรอบนั้นกลับ)
 *
 * 🔗 สต็อกกลาง (best-effort ไม่บล็อกงาน QC): รับเข้าของดี → +WH-FG (ตัดวัตถุดิบออกจาก WIP ตามสัดส่วน) · ของเสีย → +WH-SCRAP
 *    ดึงกลับ/ลบ → คืนตามจริง · ของเสียภายหลัง FG→SCRAP · ซ่อมได้ SCRAP→FG · ใส่เอง → +FG
 *    ส่งออก → ไม่แตะสต็อก: ของออกจากคลังเมื่อ "ใบขายกดจัดส่งแล้ว" เท่านั้น (เจ้าของเลือก 2026-11-02 · กันตัดซ้ำ)
 *    ย้อนส่งออกรอบที่เคยตัด FG ไว้ (stocked — ช่วงสั้น ๆ ก่อนกติกานี้) → คืน FG ให้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { writeAudit, writeAuditId, writeAuditMany } from "@/lib/audit";
import { notifyEvent, pushLineTpl, dmEmployeeByName, boardLink } from "@/lib/board-notify";
import { syncWoLabor } from "@/lib/wo-labor";
import { syncAutoClose } from "../../mo/auto-close";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const PERM: Record<string, string> = {
  receive: "qc.receive", move: "qc.move", ship: "qc.ship", unship: "qc.ship", to_defect: "qc.defect",
  repair_send: "qc.repair", repair_cancel: "qc.repair", repair_receive: "qc.repair", return_queue: "qc.move", return_worker: "qc.move",
  add_manual: "qc.receive", add_bulk: "qc.receive", update_item: "qc.receive",
  // ลบทิ้งถาวร (ของทดสอบ/ลงผิด) — ล็อกไว้ที่ "แอดมิน" เท่านั้น เพราะลบแล้วหายจริง
  delete_item: "admin.users",
};

type Admin = ReturnType<typeof supabaseAdmin>;
async function getItem(admin: Admin, id: string) {
  const { data } = await admin.from("qc_warehouse_items").select("*").eq("id", id).single();
  return data;
}
async function defectShelfId(admin: Admin): Promise<string | null> {
  const { data } = await admin.from("qc_shelves").select("id").eq("kind", "defect").eq("is_active", true).limit(1).maybeSingle();
  return (data?.id as string) ?? null;
}
// บันทึกประวัติของเสียลง defect_logs (จริง) + เลขใบ QCD- (best-effort ไม่ให้ล้ม action)
async function logDefect(admin: Admin, e: { sku?: string | null; worker?: string | null; qty: number; reason?: string | null; kind: "defect" | "scrap"; mo_no?: string | null }) {
  try {
    let defect_no: string | null = null;
    try { const { data } = await admin.rpc("erp_next_number", { p_key: "qc_defect", p_branch: null }); defect_no = (data as string) ?? null; } catch { /* no rule */ }
    await admin.from("defect_logs").insert({ defect_no, source_job: e.mo_no ?? null, defect_type: e.reason ?? null, qty: e.qty, cause: e.reason ?? null, sku: e.sku ?? null, worker: e.worker ?? null, kind: e.kind, mo_no: e.mo_no ?? null });
  } catch { /* best-effort */ }
}

// ── 🔗 สต็อกกลาง: ชั้น QC ↔ คลังสินค้าสำเร็จ WH-FG / ของเสีย WH-SCRAP ──
// ต่อกลับ 2026-11-02 — เคยหลุดไปตอน commit 30f89f72 (11 ก.ค.) ที่บันทึกทับไฟล์ด้วยสำเนาเก่า
// แถวที่ "ลงสต็อกแล้ว" จดไว้ในประวัติ (audit qc.stock_in ต่อ id แถว) → แถวก่อนต่อกลับไม่มีบันทึกนี้
//   = ส่งออก/ดึงกลับ/ลบ ไม่แตะสต็อก (กันคลังติดลบ · เจ้าของเลือกไม่ย้อนข้อมูล ก.ค.–พ.ย.)
type Actor = { actorId: string | null; actorName: string | null };
const STOCK_MARK = "qc.stock_in";
async function stockRpc(admin: Admin, fn: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await admin.rpc(fn, args);
    if (error) console.error(`[qc-warehouse] ${fn}:`, error.message);
    return !error;
  } catch (e) { console.error(`[qc-warehouse] ${fn}:`, e instanceof Error ? e.message : e); return false; }
}
async function markStocked(admin: Admin, actor: Actor, ids: string[], wh: "FG" | "SCRAP") {
  if (ids.length) await writeAuditMany(admin, ids.map((id) => ({ action: STOCK_MARK, entityType: "qc_warehouse_items", entityId: id, ...actor, metadata: { wh } })));
}
async function isStocked(admin: Admin, id: unknown): Promise<boolean> {
  if (!id) return false;
  const { data } = await admin.from("audit_logs").select("id").eq("entity_id", String(id)).eq("action", STOCK_MARK).limit(1);
  return (data ?? []).length > 0;
}
/** ลง/ตัด WH-FG ตรง ๆ (ย้อนส่งออก · แก้ของที่ใส่เอง) · transfer = ย้ายจากคลังขาย (ตามชื่อ) กลับเข้า FG ไม่เจอคลังขาย = รับเข้า FG */
async function postFg(admin: Admin, a: { sku: unknown; qty: number; type: "in" | "out" | "transfer"; fromName?: unknown; ref: string; note: string; actor: string | null }): Promise<boolean> {
  const sku = String(a.sku ?? "").trim();
  if (!sku || !(a.qty > 0)) return false;
  const [{ data: s }, { data: fg }] = await Promise.all([
    admin.from("skus_v2").select("id").eq("code", sku).limit(1).maybeSingle(),
    admin.from("erp_playground_warehouses").select("id").eq("code", "WH-FG").limit(1).maybeSingle(),
  ]);
  if (!s?.id || !fg?.id) return false;
  let type: "in" | "out" | "transfer" = a.type, from: string | null = null, to: string | null = null;
  if (type === "out") from = String(fg.id); else to = String(fg.id);
  if (type === "transfer") {
    const { data: d } = await admin.from("erp_playground_warehouses").select("id").eq("name", String(a.fromName ?? "")).eq("kind", "sales").limit(1).maybeSingle();
    if (d?.id) from = String(d.id); else type = "in";
  }
  if (from) {   // ตัดจากคลังที่ยังไม่มีแถวยอด → สร้างแถว 0 ก่อน (แบบเดียวกับ erp_qc_ship)
    const now = new Date().toISOString();
    await admin.from("erp_playground_stock_balances").upsert({ product_id: s.id, warehouse_id: from, qty_on_hand: 0, qty_reserved: 0, avg_cost: 0, last_movement_at: now, updated_at: now }, { onConflict: "product_id,warehouse_id", ignoreDuplicates: true });
  }
  return stockRpc(admin, "erp_stock_post_internal", {
    p_movement_type: type, p_product_id: s.id, p_to_warehouse_id: to, p_from_warehouse_id: from, p_qty: a.qty, p_unit_cost: 0,
    p_reference_type: a.ref, p_reference_id: null, p_reference_label: null, p_note: a.note, p_actor: a.actor, p_movement_date: null,
  });
}

// เชื่อมอัตโนมัติ: QC บันทึกของเสีย → เพิ่มเข้า "รายการปัญหา" ของ Parent SKU (แชร์ทุกสี) — best-effort + กันซ้ำ
async function logParentIssue(admin: Admin, actor: { actorId: string | null; actorName: string | null }, e: { sku?: string | null; reason?: string | null }) {
  try {
    const sku = String(e.sku ?? "").trim();
    const reason = String(e.reason ?? "").trim();
    if (!sku || !reason || reason === "ไม่ระบุ") return;
    const { data: s } = await admin.from("skus_v2").select("parent_sku_id").eq("code", sku).maybeSingle();
    const parentId = (s as { parent_sku_id: string | null } | null)?.parent_sku_id ?? null;
    if (!parentId) return;
    // ปัญหาข้อความเดียวกัน (active) ระดับทั้งรุ่น มีแล้ว → ไม่เพิ่มซ้ำ (แถว "เฉพาะสี" ไม่นับ — กัน maybeSingle เจอ 2 แถวแล้วพัง)
    const { data: dup } = await admin.from("parent_sku_issues").select("id").eq("parent_sku_id", parentId).eq("is_active", true).is("sku", null).ilike("problem_text", reason).limit(1).maybeSingle();
    if (dup) return;
    // จับ reason_id ถ้าชื่อสาเหตุตรงกับพิกลิสต์กลาง
    const { data: r } = await admin.from("qc_defect_reasons").select("id").eq("is_active", true).ilike("name", reason).maybeSingle();
    await admin.from("parent_sku_issues").insert({
      parent_sku_id: parentId, reason_id: (r as { id: string } | null)?.id ?? null,
      problem_text: reason, source: "qc", created_by: actor.actorId, created_by_name: actor.actorName,
    });
  } catch { /* best-effort */ }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const action = String(body.action ?? "");
  const perm = PERM[action];
  if (!perm) return NextResponse.json({ error: "ไม่รู้จัก action" }, { status: 400 });
  const denied = await guardApi(request, perm); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };

  try {
    // ── รับเข้า QC ──
    if (action === "receive") {
      const wo_id = String(body.wo_id ?? "");
      const shelf_id = String(body.shelf_id ?? "");
      const good = num(body.good);
      const bad = (Array.isArray(body.bad) ? body.bad : []).map((b) => ({ reason: String((b as Record<string, unknown>).reason ?? "ไม่ระบุ"), qty: num((b as Record<string, unknown>).qty) })).filter((b) => b.qty > 0);
      const badTotal = bad.reduce((s, b) => s + b.qty, 0);
      if (good + badTotal < 1) return NextResponse.json({ error: "กรอกจำนวนอย่างน้อย 1 ชิ้น" }, { status: 400 });

      const { data: wo } = await admin.from("mo_work_orders").select("id,mo_no,product_sku,product_name,assignee_name,received_qty,qc_pulled_qty").eq("id", wo_id).single();
      if (!wo) return NextResponse.json({ error: "ไม่พบใบจ่ายงาน" }, { status: 404 });
      const remaining = Number(wo.received_qty ?? 0) - Number(wo.qc_pulled_qty ?? 0);
      if (good + badTotal > remaining) return NextResponse.json({ error: `รวมเกินจำนวนที่เหลือ (${remaining})` }, { status: 400 });

      // date = วันที่รับเข้าจริง (โหมดอัปเดตงานย้อนหลัง) → ใช้เป็นเวลาเข้าชั้น (เที่ยงวันเวลาไทย)
      const recvAt = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? { created_at: `${body.date}T12:00:00+07:00` } : {};
      const base = { wo_id, mo_no: wo.mo_no, sku: wo.product_sku, sku_name: wo.product_name ?? wo.product_sku, worker: wo.assignee_name, source: "production", ...recvAt };
      const rows: Record<string, unknown>[] = [];
      if (good > 0) rows.push({ ...base, shelf_id, qty: good, status: "good" });
      if (bad.length > 0) {
        const dsid = await defectShelfId(admin);
        if (!dsid) return NextResponse.json({ error: "ยังไม่มีชั้นของเสีย" }, { status: 400 });
        for (const b of bad) rows.push({ ...base, shelf_id: dsid, qty: b.qty, status: "defect", reason: b.reason });
      }
      const ins = await admin.from("qc_warehouse_items").insert(rows).select("id, status, qty");
      if (ins.error) return NextResponse.json({ error: friendlyDbError(ins.error.message) }, { status: 400 });
      await admin.from("mo_work_orders").update({ qc_pulled_qty: Number(wo.qc_pulled_qty ?? 0) + good + badTotal }).eq("id", wo_id);
      // 🔗 สต็อก: ของดี → +FG (+ตัดวัตถุดิบออกจาก WIP ตามสัดส่วน) · ของเสีย → +SCRAP — ลงได้ค่อยจดว่าแถวนั้นลงสต็อกแล้ว
      const insRows = (ins.data ?? []) as { id: string; status: string }[];
      if (good > 0 && await stockRpc(admin, "erp_qc_receive_to_fg", { p_wo_id: wo_id, p_good_qty: good, p_actor: actor.actorName }))
        await markStocked(admin, actor, insRows.filter((r) => r.status === "good").map((r) => String(r.id)), "FG");
      if (badTotal > 0 && await stockRpc(admin, "erp_qc_receive_scrap", { p_wo_id: wo_id, p_bad_qty: badTotal, p_reason: bad.map((b) => `${b.reason} ${b.qty}`).join(", "), p_actor: actor.actorName }))
        await markStocked(admin, actor, insRows.filter((r) => r.status === "defect").map((r) => String(r.id)), "SCRAP");
      for (const b of bad) { await logDefect(admin, { sku: wo.product_sku, worker: wo.assignee_name, qty: b.qty, reason: b.reason, kind: "defect", mo_no: wo.mo_no }); await logParentIssue(admin, actor, { sku: wo.product_sku, reason: b.reason }); }
      const quiet = body.quiet === true;   // อัปเดตงานย้อนหลัง (โหมด 🔄 อัปเดตงาน) → ไม่แจ้งเรื่องของเสียเก่า (ประวัติของเสียยังลงครบ)
      await writeAudit(admin, { action: "qc.receive", entityType: "qc_warehouse_items", entityId: wo_id, ...actor, metadata: { sku: wo.product_sku, good, bad: badTotal, ...(quiet ? { catch_up: true } : {}) } });
      // แจ้งเตือน "พบของเสีย" ตอนรับเข้า (best-effort): กระดิ่ง + LINE กลุ่ม QC + DM ช่าง
      if (badTotal > 0 && !quiet) {
        const reasons = bad.map((b) => `${b.reason} ${b.qty}`).join(", ");
        const link = boardLink("/master/qc-warehouse");
        await notifyEvent(admin, "qc.defect", "qc_warehouse_items", wo_id, actor.actorId, { sku: wo.product_sku, product_name: wo.product_name ?? wo.product_sku, reason: reasons, qty: badTotal, worker: wo.assignee_name ?? "—", mo_no: wo.mo_no });
        await pushLineTpl(admin, "qc", "qc_defect", { sku: wo.product_sku ?? "", product_name: wo.product_name ?? "", reason: reasons, qty: badTotal, worker: wo.assignee_name ?? "—", link });
        await dmEmployeeByName(admin, wo.assignee_name, `⚠️ งานมีของเสีย\n${wo.product_sku ?? ""} · ${wo.product_name ?? ""}\n${reasons} (${badTotal} ชิ้น)\n🔗 ${link}`);
      }
      // items = แถวที่เพิ่งเข้าชั้น (โหมดอัปเดตงานใช้ส่งออกต่อทันที)
      return NextResponse.json({ items: (ins.data ?? []).map((r) => ({ id: String(r.id), status: String(r.status), qty: Number(r.qty) || 0 })), error: null });
    }

    // ── ย้ายชั้น ──
    if (action === "move") {
      const item_id = String(body.item_id ?? "");
      const shelf_id = String(body.shelf_id ?? "");
      const { data: shelf } = await admin.from("qc_shelves").select("kind").eq("id", shelf_id).single();
      if (shelf?.kind === "defect") return NextResponse.json({ error: "ย้ายเข้าชั้นของเสียโดยตรงไม่ได้" }, { status: 400 });
      const up = await admin.from("qc_warehouse_items").update({ shelf_id, updated_at: new Date().toISOString() }).eq("id", item_id);
      if (up.error) return NextResponse.json({ error: friendlyDbError(up.error.message) }, { status: 400 });
      await writeAudit(admin, { action: "qc.move", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { shelf_id } });
      return NextResponse.json({ error: null });
    }

    // ── ส่งออก ──
    if (action === "ship") {
      const item_id = String(body.item_id ?? "");
      const item = await getItem(admin, item_id);
      if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
      // qty (ไม่บังคับ) = ส่งออกบางส่วน (เช่น ขายออกตามใบขาย 50 จาก 100 · ที่เหลือเข้าคลัง/ค้างชั้น) · ไม่ส่ง = ทั้งก้อน
      const part = body.qty == null ? null : num(body.qty);
      if (part != null && (part < 1 || part > Number(item.qty))) return NextResponse.json({ error: "จำนวนที่ส่งออกไม่ถูกต้อง" }, { status: 400 });
      const shipQty = part ?? Number(item.qty);
      const res = shipQty < Number(item.qty)
        ? await admin.from("qc_warehouse_items").update({ qty: Number(item.qty) - shipQty }).eq("id", item_id)
        : await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      if (res.error) return NextResponse.json({ error: friendlyDbError(res.error.message) }, { status: 400 });
      // 🔗 สต็อก: ส่งออกไม่ตัดสต็อก — ของยังนับอยู่ใน FG จนใบขายกดจัดส่งแล้ว (กันตัดซ้ำ)
      //    จด in_fg = แถวนี้นับอยู่ใน FG → ย้อนส่งออกแล้วแถวที่กลับขึ้นชั้นยังนับใน FG ต่อ (ดึงกลับ/ลบทีหลังคืนสต็อกถูก)
      const inFg = item.status !== "defect" && await isStocked(admin, item_id);
      const audit_id = await writeAuditId(admin, { action: "qc.ship", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sku: item.sku, sku_name: item.sku_name, mo_no: item.mo_no, worker: item.worker, image_key: item.image_key, brand_color: item.brand_color, qty: shipQty, ...(shipQty < Number(item.qty) ? { partial_of: item.qty } : {}), mode: body.mode, wh: body.wh, ...(inFg ? { in_fg: true } : {}),
        shelf_id: item.shelf_id, wo_id: item.wo_id, status: item.status, color: item.color, source: item.source,
        ...(typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? { date: body.date } : {}) } });
      return NextResponse.json({ error: null, audit_id });   // ป๊อปอัปเดตงานเก็บไว้ย้อน (unship)
    }

    // ── ย้อนการส่งออก (ผูกใบขายผิด → ของกลับขึ้นชั้น) — คืนของบนชั้นจากประวัติ qc.ship ──
    //    ส่งออกบางส่วน (แถวเดิมยังอยู่ แค่ลดจำนวน) = บวกกลับแถวเดิม · ส่งออกทั้งก้อน (แถวถูกลบ) = สร้างแถวใหม่
    //    ยอด "ดึงเข้า QC" ของใบจ่ายงานไม่ต้องแก้ (ตอนส่งออกไม่ได้ลด) · ใบเก่าที่ audit ไม่ได้จดใบจ่าย = ใบจ่ายของใบสั่งผลิตที่ช่างตรงกัน ไม่งั้นที่ดึงเข้า QC มากสุด
    if (action === "unship") {
      const sid = String(body.ship_audit_id ?? "");
      const { data: a } = await admin.from("audit_logs").select("id, action, entity_id, metadata").eq("id", sid).maybeSingle();
      if (!a || a.action !== "qc.ship") return NextResponse.json({ error: "ไม่พบประวัติการส่งออกนี้" }, { status: 404 });
      const md = (a.metadata ?? {}) as Record<string, unknown>;
      const { data: prev } = await admin.from("audit_logs").select("metadata").eq("entity_type", "qc_warehouse_items").eq("action", "qc.unship").eq("metadata->>ship_audit_id", sid);
      const done = ((prev ?? []) as { metadata: Record<string, unknown> | null }[]).reduce((s, p) => s + (Number(p.metadata?.qty) || 0), 0);
      const left = Number(md.qty ?? 0) - done;
      if (left <= 0) return NextResponse.json({ error: "ของรอบนี้ย้อนกลับขึ้นชั้นไปหมดแล้ว" }, { status: 400 });
      const qty = body.qty == null ? left : num(body.qty);
      if (qty < 1 || qty > left) return NextResponse.json({ error: `ย้อนได้ไม่เกิน ${left} ชิ้น` }, { status: 400 });
      const via = body.via ? { via: String(body.via).slice(0, 30), label: String(body.label ?? "").slice(0, 300) } : {};
      // แถวปลายทาง: into_item_id (ต้องเป็นของใบเดียวกัน สถานะเดียวกัน) → แถวเดิมที่ส่งออกบางส่วน → ไม่มี = สร้างแถวใหม่
      const into = body.into_item_id ? await getItem(admin, String(body.into_item_id)) : null;
      const orig = into && into.mo_no === (md.mo_no ?? null) && into.status === ((md.status as string) || "good") ? into
        : a.entity_id ? await getItem(admin, String(a.entity_id)) : null;
      // 🔗 สต็อก: ส่งออกปกติไม่ได้ตัดสต็อก (in_fg = ของยังอยู่ใน FG) → ย้อนแล้วไม่ต้องคืน
      //    รอบที่เคยตัด FG ไว้ (stocked — ช่วงสั้น ๆ ก่อนกติกา "ใบขายจัดส่ง = ตัด") → คืนเข้า FG / ย้ายกลับจากคลังขาย
      const restock = () => md.stocked === true && postFg(admin, { sku: md.sku, qty, type: md.mode === "sales_wh" && md.wh ? "transfer" : "in", fromName: md.wh, ref: "qc_unship", note: "ย้อนส่งออกจากโกดัง QC", actor: actor.actorName });
      const inFg = md.stocked === true || md.in_fg === true;
      if (orig) {
        const up = await admin.from("qc_warehouse_items").update({ qty: Number(orig.qty) + qty, updated_at: new Date().toISOString() }).eq("id", orig.id);
        if (up.error) return NextResponse.json({ error: friendlyDbError(up.error.message) }, { status: 400 });
        // แถวปลายทางนับใน FG แล้ว → ของที่กลับมาต้องนับใน FG ด้วย: เคยตัดไว้ = คืน · ไม่เคยลง FG (ของเก่า) = ลงเพิ่ม
        // แถวปลายทางไม่ได้นับใน FG (ของก่อนต่อสต็อก) = ไม่แตะ
        if (await isStocked(admin, orig.id)) {
          if (md.stocked === true) await restock();
          else if (!inFg) await postFg(admin, { sku: md.sku, qty, type: "in", ref: "qc_unship", note: "ย้อนส่งออกจากโกดัง QC (ของก่อนต่อสต็อก)", actor: actor.actorName });
        }
        await writeAudit(admin, { action: "qc.unship", entityType: "qc_warehouse_items", entityId: String(orig.id), ...actor,
          metadata: { ship_audit_id: sid, qty, of: md.qty, mo_no: orig.mo_no ?? md.mo_no ?? null, sku: orig.sku ?? null, shelf_id: orig.shelf_id, wo_id: orig.wo_id, into: "same_row", ...via } });
        return NextResponse.json({ error: null, item_id: orig.id });
      }
      let shelf_id = String(body.shelf_id ?? md.shelf_id ?? "");
      if (!shelf_id) {
        const { data: sh } = await admin.from("qc_shelves").select("id").eq("is_active", true).neq("kind", "defect").order("sort_order", { ascending: false }).limit(1).maybeSingle();
        shelf_id = (sh?.id as string) ?? "";
      }
      if (!shelf_id) return NextResponse.json({ error: "ยังไม่มีชั้น QC ให้วางของ" }, { status: 400 });
      const mo_no = (md.mo_no as string | null) ?? null;
      let wo_id = (md.wo_id as string | null) ?? null;
      if (!wo_id && mo_no) {
        const { data: ws } = await admin.from("mo_work_orders").select("id, assignee_name").eq("mo_no", mo_no).eq("is_active", true).order("qc_pulled_qty", { ascending: false }).limit(20);
        const list = (ws ?? []) as { id: string; assignee_name: string | null }[];
        wo_id = (list.find((w) => md.worker && w.assignee_name === md.worker) ?? list[0])?.id ?? null;
      }
      const { data: ins, error } = await admin.from("qc_warehouse_items").insert({
        shelf_id, wo_id, mo_no, sku: md.sku ?? null, sku_name: md.sku_name ?? null, worker: md.worker ?? null, qty,
        status: (md.status as string) || "good", color: md.color ?? null, source: (md.source as string) || "production",
      }).select("id").single();
      if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
      // แถวใหม่นับใน FG ถ้าของยังอยู่ใน FG (ส่งออกปกติ) หรือคืนเข้า FG ได้ (รอบที่เคยตัดไว้)
      if (md.stocked === true ? await restock() : inFg) await markStocked(admin, actor, [String(ins.id)], "FG");
      await writeAudit(admin, { action: "qc.unship", entityType: "qc_warehouse_items", entityId: String(ins.id), ...actor,
        metadata: { ship_audit_id: sid, qty, of: md.qty, mo_no, sku: md.sku ?? null, shelf_id, wo_id, into: "new_row", ...via } });
      return NextResponse.json({ error: null, item_id: ins.id });
    }

    // ── ย้ายของดี → ชั้นของเสีย ──
    if (action === "to_defect") {
      const item_id = String(body.item_id ?? "");
      const qty = num(body.qty);
      const reason = String(body.reason ?? "ไม่ระบุ");
      const item = await getItem(admin, item_id);
      if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
      if (qty < 1 || qty > Number(item.qty)) return NextResponse.json({ error: "จำนวนไม่ถูกต้อง" }, { status: 400 });
      const dsid = await defectShelfId(admin);
      if (!dsid) return NextResponse.json({ error: "ยังไม่มีชั้นของเสีย" }, { status: 400 });
      const remain = Number(item.qty) - qty;
      const wasStocked = await isStocked(admin, item_id);
      if (remain > 0) await admin.from("qc_warehouse_items").update({ qty: remain }).eq("id", item_id);
      else await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      const { data: dRow } = await admin.from("qc_warehouse_items").insert({ shelf_id: dsid, wo_id: item.wo_id, mo_no: item.mo_no, sku: item.sku, sku_name: item.sku_name, worker: item.worker, qty, status: "defect", reason }).select("id").single();
      // 🔗 สต็อก: ของดีที่ลงคลังไว้ถูกคัดเป็นเสีย → ย้าย FG → SCRAP
      if (wasStocked && dRow?.id && await stockRpc(admin, "erp_fg_to_scrap", { p_sku_code: item.sku, p_qty: qty, p_reason: reason, p_actor: actor.actorName }))
        await markStocked(admin, actor, [String(dRow.id)], "SCRAP");
      await logDefect(admin, { sku: item.sku, worker: item.worker, qty, reason, kind: "defect", mo_no: item.mo_no });
      await logParentIssue(admin, actor, { sku: item.sku, reason });
      await writeAudit(admin, { action: "qc.defect", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sku: item.sku, qty, reason } });
      // แจ้งเตือน "พบของเสีย" (best-effort): กระดิ่ง + LINE กลุ่ม QC + DM ช่าง
      {
        const link = boardLink("/master/qc-warehouse");
        await notifyEvent(admin, "qc.defect", "qc_warehouse_items", item_id, actor.actorId, { sku: item.sku, product_name: item.sku_name ?? item.sku, reason, qty, worker: item.worker ?? "—", mo_no: item.mo_no });
        await pushLineTpl(admin, "qc", "qc_defect", { sku: item.sku ?? "", product_name: item.sku_name ?? "", reason, qty, worker: item.worker ?? "—", link });
        await dmEmployeeByName(admin, item.worker, `⚠️ งานมีของเสีย\n${item.sku ?? ""} · ${item.sku_name ?? ""}\n${reason} (${qty} ชิ้น)\n🔗 ${link}`);
      }
      return NextResponse.json({ error: null });
    }

    // ── ส่งซ่อม / ยกเลิกซ่อม ──
    if (action === "repair_send") {
      const item_id = String(body.item_id ?? "");
      const repair_by = String(body.repair_by ?? "");
      const up = await admin.from("qc_warehouse_items").update({ status: "repairing", repair_by, updated_at: new Date().toISOString() }).eq("id", item_id);
      if (up.error) return NextResponse.json({ error: friendlyDbError(up.error.message) }, { status: 400 });
      await writeAudit(admin, { action: "qc.repair", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sub: "send", repair_by } });
      return NextResponse.json({ error: null });
    }
    if (action === "repair_cancel") {
      const item_id = String(body.item_id ?? "");
      const up = await admin.from("qc_warehouse_items").update({ status: "defect", repair_by: null, updated_at: new Date().toISOString() }).eq("id", item_id);
      if (up.error) return NextResponse.json({ error: friendlyDbError(up.error.message) }, { status: 400 });
      return NextResponse.json({ error: null });
    }

    // ── รับจากซ่อม (ดี→ชั้น, เสีย→ทิ้ง) ──
    if (action === "repair_receive") {
      const item_id = String(body.item_id ?? "");
      const good = num(body.good), scrap = num(body.scrap);
      const shelf_id = String(body.shelf_id ?? "");
      const item = await getItem(admin, item_id);
      if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
      if (good + scrap < 1 || good + scrap > Number(item.qty)) return NextResponse.json({ error: "จำนวนไม่ถูกต้อง" }, { status: 400 });
      const remain = Number(item.qty) - good - scrap;
      const wasStocked = await isStocked(admin, item_id);
      if (remain > 0) await admin.from("qc_warehouse_items").update({ qty: remain }).eq("id", item_id);
      else await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      const { data: gRow } = good > 0
        ? await admin.from("qc_warehouse_items").insert({ shelf_id, wo_id: item.wo_id, mo_no: item.mo_no, sku: item.sku, sku_name: item.sku_name, worker: item.worker, qty: good, status: "good" }).select("id").single()
        : { data: null };
      if (scrap > 0) await logDefect(admin, { sku: item.sku, worker: item.worker, qty: scrap, reason: item.reason, kind: "scrap", mo_no: item.mo_no });
      // 🔗 สต็อก: ซ่อมได้ SCRAP → FG · ซ่อมไม่ได้ ตัดทิ้งจาก SCRAP (เฉพาะของเสียที่ลงคลังไว้)
      if (wasStocked && await stockRpc(admin, "erp_qc_repair_receive", { p_sku_code: item.sku, p_good_qty: good, p_scrap_qty: scrap, p_actor: actor.actorName }) && gRow?.id)
        await markStocked(admin, actor, [String(gRow.id)], "FG");
      await writeAudit(admin, { action: "qc.repair", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sub: "receive", good, scrap } });
      return NextResponse.json({ error: null });
    }

    // ── ย้ายกลับงานรอ QC (คืน qc_pulled_qty) ──
    if (action === "return_queue") {
      const item_id = String(body.item_id ?? "");
      const item = await getItem(admin, item_id);
      if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
      await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      if (item.wo_id) {
        const { data: wo } = await admin.from("mo_work_orders").select("qc_pulled_qty").eq("id", item.wo_id).single();
        if (wo) await admin.from("mo_work_orders").update({ qc_pulled_qty: Math.max(0, Number(wo.qc_pulled_qty ?? 0) - Number(item.qty)) }).eq("id", item.wo_id);
      }
      // 🔗 สต็อก: ดึงกลับ → −FG/−SCRAP + คืนวัตถุดิบเข้า WIP (เฉพาะแถวที่ลงคลังไว้)
      if (await isStocked(admin, item_id))
        await stockRpc(admin, "erp_qc_reverse_item", { p_wo_id: item.wo_id ?? null, p_sku_code: item.sku, p_qty: Number(item.qty), p_is_defect: item.status !== "good", p_actor: actor.actorName });
      await writeAudit(admin, { action: "qc.move", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sub: "return_queue", qty: item.qty, mo_no: item.mo_no ?? null, ...(body.via ? { via: String(body.via).slice(0, 30), label: String(body.label ?? "").slice(0, 300) } : {}) } });
      return NextResponse.json({ error: null });
    }

    // ── คืนงานรอ QC กลับให้ช่าง (รับผิด / ต้องแก้ใหม่) ──
    // ลดยอดรับคืนเฉพาะส่วนที่ยังไม่ดึงเข้า QC (received_qty − qc_pulled_qty) + เปิดใบกลับ → การ์ดกลับไปที่บอร์ด/โต๊ะช่าง
    // ดึงรอบส่งงานล่าสุดกลับให้ครอบยอดที่คืน (ค่าแรงรอบนั้นหายตาม ไม่จ่ายซ้ำ) แล้วคิดค่าแรงรวมของใบใหม่
    // (กู้คืน 2026-11-02 — หายไปพร้อมปุ่มในหน้า QC ตอนบันทึกทับไฟล์ 11 ก.ค.)
    if (action === "return_worker") {
      const wo_id = String(body.wo_id ?? "");
      const { data: wo } = await admin.from("mo_work_orders").select("id, mo_no, product_sku, product_name, assignee_name, qty, received_qty, qc_pulled_qty, status, is_active").eq("id", wo_id).maybeSingle();
      if (!wo) return NextResponse.json({ error: "ไม่พบใบจ่ายงาน" }, { status: 404 });
      if (wo.status === "cancelled" || wo.is_active === false) return NextResponse.json({ error: "ใบจ่ายงานนี้ถูกยกเลิกแล้ว" }, { status: 400 });
      const remaining = Number(wo.received_qty ?? 0) - Number(wo.qc_pulled_qty ?? 0);
      if (remaining <= 0) return NextResponse.json({ error: "ไม่มีงานรอรับเข้าที่จะคืน" }, { status: 400 });

      const { data: subs } = await admin.from("wo_submissions").select("id, qty, wage").eq("wo_id", wo_id).order("created_at", { ascending: false });
      let toRemove = remaining; const delIds: string[] = [];
      for (const s of (subs ?? []) as { id: string; qty: number; wage: number | null }[]) {
        if (toRemove <= 0) break;
        const sq = Number(s.qty) || 0;
        if (sq <= toRemove) { delIds.push(s.id); toRemove -= sq; continue; }
        const keep = sq - toRemove;   // ตัดบางส่วนของรอบนี้ → ค่าแรงลดตามสัดส่วน
        await admin.from("wo_submissions").update({ qty: keep, ...(s.wage != null ? { wage: Math.round((Number(s.wage) * keep / sq) * 100) / 100 } : {}) }).eq("id", s.id);
        toRemove = 0;
      }
      if (delIds.length) await admin.from("wo_submissions").delete().in("id", delIds);

      const newReceived = Math.max(0, Number(wo.received_qty ?? 0) - remaining);
      const patch: Record<string, unknown> = { received_qty: newReceived, updated_at: new Date().toISOString() };
      if (wo.status === "done" && newReceived < Number(wo.qty ?? 0)) patch.status = "dispatched";   // เปิดใบกลับ → การ์ดกลับมาบนบอร์ด/โต๊ะ
      const up = await admin.from("mo_work_orders").update(patch).eq("id", wo_id);
      if (up.error) return NextResponse.json({ error: friendlyDbError(up.error.message) }, { status: 400 });
      await syncWoLabor(admin, wo_id);
      await writeAudit(admin, { action: "qc.return_worker", entityType: "mo_work_orders", entityId: wo_id, ...actor, metadata: { sku: wo.product_sku, mo_no: wo.mo_no, qty: remaining, removed_submissions: delIds.length } });
      // ตีกลับให้ช่าง = ยอดคืนลด → ใบที่ระบบเคยปิดเองเปิดคืนให้
      await syncAutoClose(admin, [wo.mo_no as string | null], { id: actor.actorId, name: actor.actorName }, "qc_return_worker");
      // แจ้งช่างว่างานถูกตีกลับ (best-effort)
      {
        const link = boardLink("/master/qc-warehouse");
        await dmEmployeeByName(admin, wo.assignee_name, `↩️ งานถูกตีกลับให้แก้/ทำใหม่\n${wo.product_sku ?? ""} · ${wo.product_name ?? ""}\nจำนวน ${remaining} ชิ้น\n🔗 ${link}`);
      }
      return NextResponse.json({ error: null });
    }

    // ── 🗑 ลบรายการทิ้งถาวร (แอดมินเท่านั้น — ใช้กับของทดสอบ/ลงผิด) ──
    //    คืนยอด "ดึงเข้า QC" ให้ใบจ่ายงานด้วย (เหมือน return_queue) ไม่งั้นยอดค้างเพี้ยน
    if (action === "delete_item") {
      const item_id = String(body.item_id ?? "");
      const item = await getItem(admin, item_id);
      if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
      const del = await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      if (del.error) return NextResponse.json({ error: friendlyDbError(del.error.message) }, { status: 400 });
      if (item.wo_id) {
        const { data: wo } = await admin.from("mo_work_orders").select("qc_pulled_qty").eq("id", item.wo_id).single();
        if (wo) await admin.from("mo_work_orders").update({ qc_pulled_qty: Math.max(0, Number(wo.qc_pulled_qty ?? 0) - Number(item.qty)) }).eq("id", item.wo_id);
      }
      // 🔗 สต็อก: ลบทิ้ง = ย้อนสิ่งที่ลงคลังไว้ (เหมือนดึงกลับ)
      if (await isStocked(admin, item_id))
        await stockRpc(admin, "erp_qc_reverse_item", { p_wo_id: item.wo_id ?? null, p_sku_code: item.sku, p_qty: Number(item.qty), p_is_defect: item.status !== "good", p_actor: actor.actorName });
      await writeAudit(admin, { action: "qc.delete", entityType: "qc_warehouse_items", entityId: item_id, ...actor,
        metadata: { sku: item.sku, sku_name: item.sku_name, mo_no: item.mo_no, qty: item.qty, status: item.status, reason: body.reason ?? null } });
      return NextResponse.json({ error: null });
    }

    // ── ✏️ แก้ของที่ใส่เข้าชั้นเอง (ลงจำนวน/รหัสสินค้า/แหล่งที่มา ผิด) ──
    if (action === "update_item") {
      const item_id = String(body.item_id ?? "");
      const item = await getItem(admin, item_id);
      if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
      if (item.wo_id) return NextResponse.json({ error: "ของที่รับมาจากใบจ่ายงานแก้จำนวนตรงนี้ไม่ได้ (ยอดผูกกับใบจ่ายงาน) — กด “ย้ายกลับไปงานรอ QC” แล้วรับเข้าใหม่" }, { status: 400 });
      if (item.status !== "good") return NextResponse.json({ error: "แก้ได้เฉพาะของดีบนชั้นเก็บ" }, { status: 400 });

      const patch: Record<string, unknown> = {};
      if (body.qty !== undefined) {
        const qty = num(body.qty);
        if (qty < 1) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0 (ถ้าไม่มีของแล้วให้ส่งออก หรือให้แอดมินลบรายการ)" }, { status: 400 });
        if (qty !== Number(item.qty)) patch.qty = qty;
      }
      if (body.sku !== undefined) {
        const code = String(body.sku ?? "").trim();
        if (!code) return NextResponse.json({ error: "ต้องระบุรหัสสินค้า" }, { status: 400 });
        if (code !== String(item.sku ?? "")) {
          const { data: sk } = await admin.from("skus_v2").select("code, name_th").eq("code", code).maybeSingle();
          if (!sk) return NextResponse.json({ error: `ไม่พบรหัสสินค้า “${code}” ในระบบ` }, { status: 400 });
          patch.sku = sk.code; patch.sku_name = (sk.name_th as string) || sk.code;
        }
      }
      if (body.source !== undefined) {
        const source = String(body.source ?? "").trim() || "stock";
        if (source !== String(item.source ?? "")) patch.source = source;
      }
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: null, changed: 0 });

      const { error } = await admin.from("qc_warehouse_items").update(patch).eq("id", item_id);
      if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
      // 🔗 สต็อก: แถวที่ลงคลังไว้ → ปรับ FG ตามที่แก้ (จำนวนต่าง = ลง/ตัดส่วนต่าง · เปลี่ยนรหัส = ตัดตัวเดิม ลงตัวใหม่)
      if ((patch.qty !== undefined || patch.sku !== undefined) && await isStocked(admin, item_id)) {
        const oldSku = item.sku, oldQty = Number(item.qty);
        const newSku = patch.sku ?? oldSku, newQty = patch.qty !== undefined ? Number(patch.qty) : oldQty;
        const fix = { ref: "qc_update_item", note: "แก้ของที่ใส่เข้าชั้น QC เอง", actor: actor.actorName };
        if (newSku === oldSku) await postFg(admin, { ...fix, sku: oldSku, qty: Math.abs(newQty - oldQty), type: newQty > oldQty ? "in" : "out" });
        else { await postFg(admin, { ...fix, sku: oldSku, qty: oldQty, type: "out" }); await postFg(admin, { ...fix, sku: newSku, qty: newQty, type: "in" }); }
      }
      await writeAudit(admin, { action: "qc.update_item", entityType: "qc_warehouse_items", entityId: item_id, ...actor,
        metadata: { before: { sku: item.sku, qty: item.qty, source: item.source }, after: patch } });
      return NextResponse.json({ error: null, changed: Object.keys(patch).length });
    }

    // ── ใส่ของเข้าชั้นเอง (ยอดยกมา / ไม่ได้มาจากผลิต) ──
    if (action === "add_manual") {
      const shelf_id = String(body.shelf_id ?? "");
      const sku = body.sku ? String(body.sku) : null;
      const sku_name = body.sku_name ? String(body.sku_name) : sku;
      const qty = num(body.qty);
      const source = String(body.source ?? "stock");
      const worker = body.worker ? String(body.worker) : null;
      if (!shelf_id) return NextResponse.json({ error: "เลือกชั้นก่อน" }, { status: 400 });
      if (!sku) return NextResponse.json({ error: "เลือกสินค้าก่อน" }, { status: 400 });
      if (qty < 1) return NextResponse.json({ error: "จำนวนต้องมากกว่า 0" }, { status: 400 });
      const { data: mRow, error } = await admin.from("qc_warehouse_items").insert({ shelf_id, sku, sku_name, qty, status: "good", source, worker }).select("id").single();
      if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
      // 🔗 สต็อก: ใส่ของเข้าชั้นเอง (นับเอง/ยอดยกมา) → +FG
      if (mRow?.id && await stockRpc(admin, "erp_fg_manual_in", { p_sku_code: sku, p_qty: qty, p_actor: actor.actorName }))
        await markStocked(admin, actor, [String(mRow.id)], "FG");
      await writeAudit(admin, { action: "qc.add_manual", entityType: "qc_warehouse_items", entityId: shelf_id, ...actor, metadata: { sku, qty, source } });
      return NextResponse.json({ error: null });
    }

    // ── นำเข้าหลายรายการ (paste SKU,จำนวน) ──
    if (action === "add_bulk") {
      const shelf_id = String(body.shelf_id ?? "");
      const source = String(body.source ?? "stock");
      const rowsIn = Array.isArray(body.rows) ? body.rows : [];
      if (!shelf_id) return NextResponse.json({ error: "เลือกชั้นก่อน" }, { status: 400 });
      const parsed = rowsIn.map((r) => ({ sku: String((r as Record<string, unknown>).sku ?? "").trim(), qty: num((r as Record<string, unknown>).qty) })).filter((r) => r.sku && r.qty > 0);
      if (parsed.length === 0) return NextResponse.json({ error: "ไม่มีรายการที่ถูกต้อง (รูปแบบ: SKU, จำนวน)" }, { status: 400 });
      const codes = [...new Set(parsed.map((r) => r.sku))];
      const { data: sk } = await admin.from("skus_v2").select("code, name_th").in("code", codes);
      const nameMap = new Map((sk ?? []).map((s) => [s.code as string, s.name_th as string]));
      const ins = parsed.map((r) => ({ shelf_id, sku: r.sku, sku_name: nameMap.get(r.sku) ?? r.sku, qty: r.qty, status: "good", source }));
      const { data: bRows, error } = await admin.from("qc_warehouse_items").insert(ins).select("id, sku, qty");
      if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
      // 🔗 สต็อก: นำเข้าหลายรายการ → +FG ทีละแถว
      const okIds: string[] = [];
      for (const r of (bRows ?? []) as { id: string; sku: string; qty: number }[])
        if (await stockRpc(admin, "erp_fg_manual_in", { p_sku_code: r.sku, p_qty: Number(r.qty), p_actor: actor.actorName })) okIds.push(String(r.id));
      await markStocked(admin, actor, okIds, "FG");
      await writeAudit(admin, { action: "qc.add_bulk", entityType: "qc_warehouse_items", entityId: shelf_id, ...actor, metadata: { count: ins.length, source } });
      return NextResponse.json({ error: null, count: ins.length });
    }

    return NextResponse.json({ error: "ไม่รู้จัก action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ผิดพลาด" }, { status: 500 });
  }
}
