/**
 * โกดัง QC — actions ต่อของบนชั้น (เฟส 1)
 * POST /api/qc-warehouse/items  { action, ... }
 *   receive       { wo_id, shelf_id, good, bad:[{reason,qty}] }   → ดึงเข้า QC (แยกดี/เสีย) + เพิ่ม qc_pulled_qty
 *   move          { item_id, shelf_id }                           → ย้ายชั้น (ห้ามเข้า defect)
 *   ship          { item_id, mode, wh }                           → ส่งออก (ลบของออก)
 *   to_defect     { item_id, qty, reason }                        → ย้ายของดี → ชั้นของเสีย
 *   repair_send   { item_id, repair_by }                          → ส่งซ่อม
 *   repair_cancel { item_id }                                     → ยกเลิกซ่อม
 *   repair_receive{ item_id, good, scrap, shelf_id }              → รับจากซ่อม (ดี→ชั้น, เสีย→ทิ้ง)
 *   return_queue  { item_id }                                     → ย้ายกลับงานรอ QC (คืน qc_pulled_qty)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const PERM: Record<string, string> = {
  receive: "qc.receive", move: "qc.move", ship: "qc.ship", to_defect: "qc.defect",
  repair_send: "qc.repair", repair_cancel: "qc.repair", repair_receive: "qc.repair", return_queue: "qc.move",
  add_manual: "qc.receive", add_bulk: "qc.receive",
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

      const base = { wo_id, mo_no: wo.mo_no, sku: wo.product_sku, sku_name: wo.product_name ?? wo.product_sku, worker: wo.assignee_name, source: "production" };
      const rows: Record<string, unknown>[] = [];
      if (good > 0) rows.push({ ...base, shelf_id, qty: good, status: "good" });
      if (bad.length > 0) {
        const dsid = await defectShelfId(admin);
        if (!dsid) return NextResponse.json({ error: "ยังไม่มีชั้นของเสีย" }, { status: 400 });
        for (const b of bad) rows.push({ ...base, shelf_id: dsid, qty: b.qty, status: "defect", reason: b.reason });
      }
      const ins = await admin.from("qc_warehouse_items").insert(rows);
      if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
      await admin.from("mo_work_orders").update({ qc_pulled_qty: Number(wo.qc_pulled_qty ?? 0) + good + badTotal }).eq("id", wo_id);
      for (const b of bad) await logDefect(admin, { sku: wo.product_sku, worker: wo.assignee_name, qty: b.qty, reason: b.reason, kind: "defect", mo_no: wo.mo_no });
      await writeAudit(admin, { action: "qc.receive", entityType: "qc_warehouse_items", entityId: wo_id, ...actor, metadata: { sku: wo.product_sku, good, bad: badTotal } });
      return NextResponse.json({ error: null });
    }

    // ── ย้ายชั้น ──
    if (action === "move") {
      const item_id = String(body.item_id ?? "");
      const shelf_id = String(body.shelf_id ?? "");
      const { data: shelf } = await admin.from("qc_shelves").select("kind").eq("id", shelf_id).single();
      if (shelf?.kind === "defect") return NextResponse.json({ error: "ย้ายเข้าชั้นของเสียโดยตรงไม่ได้" }, { status: 400 });
      const up = await admin.from("qc_warehouse_items").update({ shelf_id, updated_at: new Date().toISOString() }).eq("id", item_id);
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 400 });
      await writeAudit(admin, { action: "qc.move", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { shelf_id } });
      return NextResponse.json({ error: null });
    }

    // ── ส่งออก ──
    if (action === "ship") {
      const item_id = String(body.item_id ?? "");
      const item = await getItem(admin, item_id);
      if (!item) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
      const del = await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });
      await writeAudit(admin, { action: "qc.ship", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sku: item.sku, qty: item.qty, mode: body.mode, wh: body.wh } });
      return NextResponse.json({ error: null });
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
      if (remain > 0) await admin.from("qc_warehouse_items").update({ qty: remain }).eq("id", item_id);
      else await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      await admin.from("qc_warehouse_items").insert({ shelf_id: dsid, wo_id: item.wo_id, mo_no: item.mo_no, sku: item.sku, sku_name: item.sku_name, worker: item.worker, qty, status: "defect", reason });
      await logDefect(admin, { sku: item.sku, worker: item.worker, qty, reason, kind: "defect", mo_no: item.mo_no });
      await writeAudit(admin, { action: "qc.defect", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sku: item.sku, qty, reason } });
      return NextResponse.json({ error: null });
    }

    // ── ส่งซ่อม / ยกเลิกซ่อม ──
    if (action === "repair_send") {
      const item_id = String(body.item_id ?? "");
      const repair_by = String(body.repair_by ?? "");
      const up = await admin.from("qc_warehouse_items").update({ status: "repairing", repair_by, updated_at: new Date().toISOString() }).eq("id", item_id);
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 400 });
      await writeAudit(admin, { action: "qc.repair", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sub: "send", repair_by } });
      return NextResponse.json({ error: null });
    }
    if (action === "repair_cancel") {
      const item_id = String(body.item_id ?? "");
      const up = await admin.from("qc_warehouse_items").update({ status: "defect", repair_by: null, updated_at: new Date().toISOString() }).eq("id", item_id);
      if (up.error) return NextResponse.json({ error: up.error.message }, { status: 400 });
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
      if (remain > 0) await admin.from("qc_warehouse_items").update({ qty: remain }).eq("id", item_id);
      else await admin.from("qc_warehouse_items").delete().eq("id", item_id);
      if (good > 0) await admin.from("qc_warehouse_items").insert({ shelf_id, wo_id: item.wo_id, mo_no: item.mo_no, sku: item.sku, sku_name: item.sku_name, worker: item.worker, qty: good, status: "good" });
      if (scrap > 0) await logDefect(admin, { sku: item.sku, worker: item.worker, qty: scrap, reason: item.reason, kind: "scrap", mo_no: item.mo_no });
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
      await writeAudit(admin, { action: "qc.move", entityType: "qc_warehouse_items", entityId: item_id, ...actor, metadata: { sub: "return_queue", qty: item.qty } });
      return NextResponse.json({ error: null });
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
      const { error } = await admin.from("qc_warehouse_items").insert({ shelf_id, sku, sku_name, qty, status: "good", source, worker });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
      const { error } = await admin.from("qc_warehouse_items").insert(ins);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await writeAudit(admin, { action: "qc.add_bulk", entityType: "qc_warehouse_items", entityId: shelf_id, ...actor, metadata: { count: ins.length, source } });
      return NextResponse.json({ error: null, count: ins.length });
    }

    return NextResponse.json({ error: "ไม่รู้จัก action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ผิดพลาด" }, { status: 500 });
  }
}
