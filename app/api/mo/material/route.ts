/**
 * บอร์ดจ่ายงาน Phase 2 — ติ๊กเตรียม/ตัด รายวัตถุดิบ (เช็กลิสต์จาก BOM)
 * PATCH /api/mo/material  body: { id: string; is_ready?: boolean; cut_done?: boolean }
 *   → อัปเดต 1 แถวใน mo_material_summary (เตรียม=is_ready, ตัด=cut_done)
 * PATCH body: { items: [{ id, on_hand_qty, purchase_override? }], label? } → หลายแถว คนละค่า ในคำขอเดียว
 *   (หน้าขอซื้อ "รวมตามรุ่น": ✓ มีของแล้วทุกใบ = มีอยู่ = ที่ต้องใช้ของแต่ละใบ · ยกเลิก = คืนค่าเดิมทีละใบ) → audit 1 รายการ
 * ของกลาง: guardApi (products.edit) + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ItemPatch = { id?: string; on_hand_qty?: number; purchase_override?: number | null };
type Body = { id?: string; ids?: string[]; items?: ItemPatch[]; label?: string; is_ready?: boolean; cut_done?: boolean; on_hand_qty?: number; purchase_override?: number | null };
const MAX_ITEMS = 200;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (Array.isArray(body.items)) return patchItems(body, user);
  const batchIds = Array.isArray(body.ids) ? body.ids.filter(Boolean).map(String) : null;
  if (!body.id && !(batchIds && batchIds.length)) return NextResponse.json({ error: "ต้องระบุ id วัตถุดิบ" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.is_ready === "boolean") patch.is_ready = body.is_ready;
  if (typeof body.cut_done === "boolean") { patch.cut_done = body.cut_done; patch.cut_done_at = body.cut_done ? new Date().toISOString() : null; }
  if (typeof body.on_hand_qty === "number") patch.on_hand_qty = body.on_hand_qty;
  if (body.purchase_override !== undefined) patch.to_purchase_qty = body.purchase_override;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีสถานะให้อัปเดต" }, { status: 400 });

  const admin = supabaseAdmin();

  // โหมดหลายรายการ (เช่น "ทำเป็นเตรียมแล้ว" จากหน้าขอซื้อ/เตรียม — เตรียมทุกใบที่ใช้วัตถุดิบนั้น)
  if (batchIds && batchIds.length) {
    const { error } = await admin.from("mo_material_summary").update(patch).in("id", batchIds);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    await admin.from("audit_logs").insert({ actor_user_id: user?.id ?? null, action: "update", entity_type: "mo_material", entity_id: null, metadata: { count: batchIds.length, ...patch } }).then(() => {}, () => {});
    return NextResponse.json({ count: batchIds.length, ...patch, error: null });
  }
  const { data: row } = await admin.from("mo_material_summary").select("mo_no, component_name").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบวัตถุดิบนี้" }, { status: 404 });

  const { error } = await admin.from("mo_material_summary").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user?.id ?? null, action: "update", entity_type: "mo_material", entity_id: body.id,
    metadata: { mo_no: (row as { mo_no?: string }).mo_no, component: (row as { component_name?: string }).component_name, ...patch },
  }).then(() => {}, () => {});

  return NextResponse.json({ id: body.id, ...patch, error: null });
}

/** หลายแถว คนละค่า "มีอยู่ / ต้องซื้อ override" — ตรวจครบก่อนแก้ แล้วบันทึกประวัติรวม 1 รายการ */
async function patchItems(body: Body, user: { id: string; email?: string | null } | null): Promise<NextResponse> {
  const items = (body.items ?? []).filter((i) => i?.id && typeof i.on_hand_qty === "number" && isFinite(i.on_hand_qty) && i.on_hand_qty >= 0);
  if (items.length === 0) return NextResponse.json({ error: "ไม่มีรายการให้บันทึก (ต้องมี id และจำนวนมีอยู่ ≥ 0)" }, { status: 400 });
  if (items.length > MAX_ITEMS) return NextResponse.json({ error: `บันทึกได้ครั้งละไม่เกิน ${MAX_ITEMS} รายการ` }, { status: 400 });
  const admin = supabaseAdmin();
  const ids = items.map((i) => String(i.id));
  const { data: rows, error: rErr } = await admin.from("mo_material_summary").select("id, mo_no, component_sku, component_name").in("id", ids).eq("is_active", true);
  if (rErr) return NextResponse.json({ error: friendlyDbError(rErr.message) }, { status: 400 });
  const byId = new Map(((rows ?? []) as { id: string; mo_no: string; component_sku: string | null; component_name: string | null }[]).map((r) => [String(r.id), r]));
  if (byId.size !== ids.length) return NextResponse.json({ error: "บางรายการไม่พบแล้ว (อาจถูกลบหรือแก้สูตร) — โหลดหน้าใหม่แล้วลองอีกครั้ง" }, { status: 409 });

  const done: string[] = [];
  for (const it of items) {
    const patch: Record<string, unknown> = { on_hand_qty: it.on_hand_qty };
    if (it.purchase_override !== undefined) patch.to_purchase_qty = it.purchase_override;
    const { error } = await admin.from("mo_material_summary").update(patch).eq("id", String(it.id));
    if (error) {
      return NextResponse.json({ count: done.length, error: `บันทึกได้ ${done.length}/${items.length} ใบ แล้วติดปัญหา: ${friendlyDbError(error.message)}` }, { status: 400 });
    }
    done.push(String(it.id));
  }
  const first = byId.get(ids[0]);
  await writeAudit(admin, {
    action: "update", entityType: "mo_material", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      mode: "batch_items", label: body.label ?? null, count: done.length,
      component_sku: first?.component_sku ?? null, component: first?.component_name ?? null,
      items: items.slice(0, 50).map((i) => {
        const r = byId.get(String(i.id));
        return { mo_no: r?.mo_no ?? null, component_sku: r?.component_sku ?? null, on_hand_qty: i.on_hand_qty, purchase_override: i.purchase_override ?? null };
      }),
    },
  });
  return NextResponse.json({ count: done.length, error: null });
}
