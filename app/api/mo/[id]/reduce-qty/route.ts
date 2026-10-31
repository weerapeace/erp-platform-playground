/**
 * 📉 ลดจำนวนใบสั่งผลิต — POST /api/mo/[id]/reduce-qty
 *   { qty, reason, mode: "split" | "drop", source? }  → ลดเป็น qty (ที่เหลือ: แยกเป็นใบใหม่ / ไม่ทำแล้ว)
 *   { revert: <change_id> }                             → ย้อนการลดครั้งนั้น (ใบที่แยกออกมาต้องยังไม่เริ่มงาน)
 *
 * กติกากลาง lib/mo-qty-reduce (ใช้ร่วมกับหน้าจอโหมดอัปเดตงาน) · ลดได้ต่ำสุด = ยอดที่ช่างส่งคืนแล้ว
 * จ่ายไปเกินจำนวนใหม่ → ลดยอดค้างของใบจ่าย (ใบล่าสุดก่อน) · วัตถุดิบกางใหม่แบบเก็บค่าเดิม (ติ๊กเตรียม/จำนวนที่มี) แล้วยอดขอซื้อไม่ให้เกินที่ต้องใช้
 * ประวัติ → ตาราง mo_qty_changes · audit → audit_logs (mo.reduce_qty / mo.reduce_qty_revert)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { syncWoLabor } from "@/lib/wo-labor";
import { reduceQtyIssue, shrinkWos, type ReduceMode, type WoShrink } from "@/lib/mo-qty-reduce";
import { explodeBom, fabricModeOf, nextMoNo } from "../../shared";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function who(request: NextRequest, admin: Admin) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return null;
  const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const prof = p as { display_name: string | null; email: string | null } | null;
  return { id: user.id, name: prof?.display_name?.trim() || prof?.email || user.email || "ผู้ใช้" };
}

/** ยอดขอซื้อหลังจำนวนเปลี่ยน: ลด = ไม่เกินที่ยังต้องใช้ (ต้องใช้ − มีแล้ว) · เพิ่มคืน (ย้อน) = อย่างน้อยเท่าที่ยังต้องใช้ */
async function fitPurchase(admin: Admin, moNo: string, dir: "down" | "up") {
  const { data } = await admin.from("mo_material_summary").select("id, required_qty, on_hand_qty, to_purchase_qty").eq("mo_no", moNo).eq("is_active", true);
  for (const s of (data ?? []) as Row[]) {
    if (s.to_purchase_qty == null) continue;
    const need = r2(Math.max(0, n(s.required_qty) - n(s.on_hand_qty)));
    const cur = n(s.to_purchase_qty);
    const next = dir === "down" ? Math.min(cur, need) : Math.max(cur, need);
    if (Math.abs(next - cur) > 0.0001) await admin.from("mo_material_summary").update({ to_purchase_qty: next }).eq("id", s.id);
  }
}

/** เขียนยอดใบจ่ายตามแผน (ลด/คืน) แล้วคิดค่าแรงรวมใหม่จากรอบส่งคืนจริง */
async function applyWo(admin: Admin, id: string, p: { qty: number; status: string; active: boolean; labor: number | null }) {
  const patch: Row = { qty: p.qty, status: p.status, is_active: p.active, updated_at: new Date().toISOString() };
  if (p.labor != null) patch.labor_cost = p.labor;
  const { error } = await admin.from("mo_work_orders").update(patch).eq("id", id);
  if (error) throw new Error(friendlyDbError(error.message));
  if (p.active) await syncWoLabor(admin, id);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;   // สิทธิ์เดียวกับแก้ใบสั่งผลิต (PATCH /api/mo/[id])
  const { id } = await params;
  const admin = supabaseAdmin();
  const me = await who(request, admin);
  if (!me) return bad("ต้อง login", 401);
  let body: Row;
  try { body = await request.json(); } catch { return bad("invalid JSON"); }

  const { data: moRow } = await admin.from("manufacturing_orders")
    .select("id, mo_no, product_sku, product_name, qty, status, due_date, internal_due_date, order_date, bom_code, bom_version, size_breakdown, fabric_calc_mode, priority, priority_note, so_order_id, so_order_no, is_active")
    .eq("id", id).maybeSingle();
  if (!moRow || moRow.is_active === false) return bad("ไม่พบใบสั่งผลิตนี้", 404);
  const mo = moRow as Row;
  const moNo = String(mo.mo_no);

  // ── ย้อนการลด
  if (body.revert) {
    const { data: ch } = await admin.from("mo_qty_changes").select("*").eq("id", String(body.revert)).eq("mo_id", id).maybeSingle();
    const c = ch as Row | null;
    if (!c) return bad("ไม่พบประวัติการลดจำนวนนี้", 404);
    if (c.reverted_at) return bad("ย้อนการลดครั้งนี้ไปแล้ว");
    if (Math.abs(n(mo.qty) - n(c.to_qty)) > 0.0001) return bad(`จำนวนใบนี้เปลี่ยนไปแล้ว (ตอนนี้ ${n(mo.qty)}) — ย้อนอัตโนมัติไม่ได้ แก้จำนวนเองที่หน้าใบสั่งผลิต`);
    if (c.new_mo_id) {
      const [{ data: nm }, { count }] = await Promise.all([
        admin.from("manufacturing_orders").select("status, is_active").eq("id", String(c.new_mo_id)).maybeSingle(),
        admin.from("mo_work_orders").select("id", { count: "exact", head: true }).eq("mo_no", String(c.new_mo_no)).eq("is_active", true).neq("status", "cancelled"),
      ]);
      if (nm && (nm as Row).is_active !== false && ((count ?? 0) > 0 || !["draft", "", null].includes((nm as Row).status as string)))
        return bad(`ใบที่แยกออกมา (${c.new_mo_no}) เริ่มทำงานแล้ว — ย้อนอัตโนมัติไม่ได้`);
    }
    try {
      for (const w of ((c.wo_changes as WoShrink[] | null) ?? []))
        await applyWo(admin, w.id, { qty: w.from, status: w.status_from, active: true, labor: w.labor_from > 0 ? w.labor_from : null });
    } catch (e) { return bad(e instanceof Error ? e.message : "คืนยอดใบจ่ายงานไม่สำเร็จ"); }
    const { error } = await admin.from("manufacturing_orders").update({ qty: n(c.from_qty) }).eq("id", id);
    if (error) return bad(friendlyDbError(error.message));
    await explodeBom(admin, (mo.bom_code as string) ?? null, moNo, n(c.from_qty), null, true, fabricModeOf(mo.fabric_calc_mode));
    await fitPurchase(admin, moNo, "up");
    if (c.new_mo_id) await admin.from("manufacturing_orders").update({ is_active: false }).eq("id", String(c.new_mo_id));
    await admin.from("mo_qty_changes").update({ reverted_at: new Date().toISOString(), reverted_by: me.id }).eq("id", String(c.id));
    await writeAudit(admin, { action: "mo.reduce_qty_revert", entityType: "mo", entityId: id, actorId: me.id, actorName: me.name,
      metadata: { mo_no: moNo, from: n(c.to_qty), to: n(c.from_qty), archived_mo: c.new_mo_no ?? null, change_id: c.id } });
    return NextResponse.json({ data: { id, qty: n(c.from_qty), archived_mo_no: c.new_mo_no ?? null }, error: null });
  }

  // ── ลดจำนวน
  const newQty = r2(n(body.qty));
  const reason = String(body.reason ?? "").trim();
  const mode = body.mode === "split" ? "split" : body.mode === "drop" ? "drop" : null as ReduceMode | null;
  const source = typeof body.source === "string" ? body.source.slice(0, 30) : "edit";
  if (!mode) return bad("เลือกก่อนว่าที่เหลือจะแยกเป็นใบใหม่ หรือไม่ทำแล้ว");
  if (!reason) return bad("ใส่เหตุผลที่ลดจำนวนก่อน");

  const { data: wosData, error: wErr } = await admin.from("mo_work_orders")
    .select("id, wo_no, qty, received_qty, status, labor_cost, created_at").eq("mo_no", moNo).eq("is_active", true).neq("status", "cancelled");
  if (wErr) return bad("โหลดใบจ่ายงานไม่สำเร็จ", 500);
  const wos = ((wosData ?? []) as Row[]).map((w) => ({ id: String(w.id), wo_no: String(w.wo_no ?? ""), qty: n(w.qty), received_qty: n(w.received_qty), status: String(w.status ?? ""), labor_cost: n(w.labor_cost), created_at: String(w.created_at ?? "") }));
  const fromQty = n(mo.qty);
  const received = r2(wos.reduce((a, w) => a + w.received_qty, 0));
  const sized = Array.isArray(mo.size_breakdown) && (mo.size_breakdown as unknown[]).length > 0;
  const issue = reduceQtyIssue({ qty: fromQty, newQty, received, sized, status: (mo.status as string) ?? null });
  if (issue) return bad(issue);

  const plan = shrinkWos(wos, newQty);
  try {
    for (const s of plan) await applyWo(admin, s.id, { qty: s.cancel ? s.from : s.to, status: s.status_to, active: !s.cancel, labor: s.cancel ? null : s.labor_to });
  } catch (e) { return bad(e instanceof Error ? e.message : "ลดยอดใบจ่ายงานไม่สำเร็จ"); }

  const { error: uErr } = await admin.from("manufacturing_orders").update({ qty: newQty, updated_at: new Date().toISOString() }).eq("id", id);
  if (uErr) return bad(friendlyDbError(uErr.message));
  await explodeBom(admin, (mo.bom_code as string) ?? null, moNo, newQty, null, true, fabricModeOf(mo.fabric_calc_mode));
  await fitPurchase(admin, moNo, "down");

  // ที่เหลือแยกเป็นใบใหม่: สินค้า/สูตร/กำหนดส่ง/ใบขายเดิม · กางสูตรใหม่ (ยังไม่มีของ → ขึ้นสถานะซื้อของตามระบบ)
  let newMo: { id: string; mo_no: string } | null = null;
  if (mode === "split") {
    const rest = r2(fromQty - newQty);
    const no = await nextMoNo(admin);
    const { data: ins, error: iErr } = await admin.from("manufacturing_orders").insert({
      mo_no: no, product_sku: mo.product_sku, product_name: mo.product_name ?? null, qty: rest, status: "draft",
      due_date: mo.due_date ?? null, internal_due_date: mo.internal_due_date ?? null, order_date: mo.order_date ?? null,
      bom_code: mo.bom_code ?? null, bom_version: mo.bom_version ?? null, fabric_calc_mode: fabricModeOf(mo.fabric_calc_mode),
      priority: mo.priority ?? null, priority_note: mo.priority_note ?? null, so_order_id: mo.so_order_id ?? null, so_order_no: mo.so_order_no ?? null,
      note: `แยกจาก ${moNo} — ลด ${fromQty} → ${newQty} เพราะ ${reason} (รอของ)`, is_active: true,
    }).select("id, mo_no").single();
    if (iErr || !ins) return bad(`ลดจำนวนแล้ว แต่สร้างใบใหม่ไม่สำเร็จ: ${friendlyDbError(iErr?.message ?? "")}`);
    newMo = { id: String(ins.id), mo_no: String(ins.mo_no) };
    await explodeBom(admin, (mo.bom_code as string) ?? null, newMo.mo_no, rest, null, false, fabricModeOf(mo.fabric_calc_mode));
    await writeAudit(admin, { action: "create", entityType: "mo", entityId: newMo.id, actorId: me.id, actorName: me.name, metadata: { mo_no: newMo.mo_no, qty: rest, split_from: moNo } });
  }

  const { data: log } = await admin.from("mo_qty_changes").insert({
    mo_id: id, mo_no: moNo, from_qty: fromQty, to_qty: newQty, reason, mode, new_mo_id: newMo?.id ?? null, new_mo_no: newMo?.mo_no ?? null,
    wo_changes: plan, source, created_by: me.id, created_by_name: me.name,
  }).select("id").single();
  await writeAudit(admin, { action: "mo.reduce_qty", entityType: "mo", entityId: id, actorId: me.id, actorName: me.name,
    metadata: { mo_no: moNo, from: fromQty, to: newQty, reason, mode, new_mo_no: newMo?.mo_no ?? null, wo_changes: plan, source } });
  return NextResponse.json({ data: { change_id: log?.id ?? null, from: fromQty, to: newQty, new_mo_no: newMo?.mo_no ?? null, new_mo_id: newMo?.id ?? null, wo_changes: plan }, error: null });
}
