/**
 * นับสต๊อกด่วน 1 รายการ ("ใส่จำนวนปัจจุบัน") — POST /api/inventory/quick-count
 *   body: { code, counted, warehouse_code?="WH-RAW", ref_label?, note? }
 *   → ตั้งยอดคงเหลือของ SKU × คลัง = จำนวนที่นับได้ ผ่านเครื่องยนต์สต๊อกกลาง erp_stock_post_internal (ลง ledger + audit)
 *      นับได้ > 0  = adjust (ตั้งยอด) · นับได้ 0 = ปรับให้เป็น 0 ด้วย out/in ส่วนต่าง (ฟังก์ชันกลางรับ adjust 0 ไม่ได้)
 *   + บันทึก audit action=stock_count ทุกครั้ง (รวมกรณีนับได้ 0 ที่ไม่มี movement) → ใช้แสดงป้าย "นับแล้ว"
 * ใช้ที่: การ์ดวัตถุดิบ แท็บใบสั่งผลิต (/purchasing) · เสียบหน้าอื่นที่อยากให้นับทีละตัวได้
 * สิทธิ์: stock.adjust (เดียวกับหน้านับสต๊อก /inventory/count)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "stock.adjust"); if (denied) return denied;
  let body: { code?: string; counted?: number; warehouse_code?: string; ref_label?: string; note?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const code = String(body.code ?? "").trim();
  const counted = Number(body.counted);
  if (!code) return NextResponse.json({ error: "ต้องระบุรหัสสินค้า" }, { status: 400 });
  if (!isFinite(counted) || counted < 0) return NextResponse.json({ error: "จำนวนที่นับต้องเป็นตัวเลข 0 ขึ้นไป" }, { status: 400 });

  const admin = supabaseAdmin();
  const whCode = String(body.warehouse_code ?? "WH-RAW").trim() || "WH-RAW";
  const [{ data: sku }, { data: wh }] = await Promise.all([
    admin.from("skus_v2").select("id, code").eq("code", code).eq("is_active", true).limit(1).maybeSingle(),
    admin.from("erp_playground_warehouses").select("id, code").eq("code", whCode).maybeSingle(),
  ]);
  if (!sku) return NextResponse.json({ error: `ไม่พบสินค้า ${code} ในทะเบียน SKU` }, { status: 404 });
  if (!wh) return NextResponse.json({ error: `ไม่พบคลัง ${whCode}` }, { status: 404 });
  const skuId = String((sku as { id: string }).id), whId = String((wh as { id: string }).id);

  const { data: bal } = await admin.from("erp_playground_stock_balances").select("qty_on_hand")
    .eq("product_id", skuId).eq("warehouse_id", whId).maybeSingle();
  const before = bal ? r4(Number((bal as { qty_on_hand: number }).qty_on_hand) || 0) : null;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = user?.email ?? "system";
  const label = (body.ref_label ?? "นับสต๊อกด่วน").slice(0, 120);
  const post = (type: "adjust" | "in" | "out", qty: number) => admin.rpc("erp_stock_post_internal", {
    p_movement_type: type, p_product_id: skuId,
    p_to_warehouse_id: type === "out" ? null : whId, p_from_warehouse_id: type === "out" ? whId : null,
    p_qty: qty, p_unit_cost: 0, p_reference_type: "quick_count", p_reference_id: null,
    p_reference_label: label, p_note: body.note ?? `นับได้ ${counted}`, p_actor: actor, p_movement_date: null,
  });

  let res: { error: { message: string } | null } = { error: null };
  if (counted > 0) res = await post("adjust", counted);
  else if (before != null && before > 0) res = await post("out", before);     // นับได้ 0 → ตัดส่วนที่ระบบคิดว่ามีออก
  else if (before != null && before < 0) res = await post("in", -before);     // ยอดติดลบ (จ่ายงานไปก่อนนับ) → เติมให้กลับเป็น 0
  if (res.error) return NextResponse.json({ error: `บันทึกยอดสต๊อกไม่สำเร็จ: ${res.error.message}` }, { status: 500 });

  await writeAudit(admin, {
    action: "stock_count", entityType: "skus_v2", entityId: skuId, actorId: user?.id ?? null, actorName: actor,
    metadata: { code, warehouse: whCode, counted, before, ref_label: label },
  }).catch(() => { /* audit ห้ามบล็อกงานหลัก */ });

  return NextResponse.json({ ok: true, code, warehouse: whCode, before, after: counted, error: null });
}
