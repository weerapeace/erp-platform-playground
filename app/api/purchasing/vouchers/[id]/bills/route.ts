/**
 * ใบส่งของจากร้านขนส่ง (Delivery Bill) ของใบสำคัญรับ
 *   GET    /api/purchasing/vouchers/<id>/bills            → ใบส่งของที่แนบไว้ + ไฟล์แนบตอนรับของ (GR) ที่เอามาอ่านได้
 *   POST   { r2_key, gr_id? }                               → ให้ AI อ่านรูป → บันทึกเป็นใบส่งของ (ยังไม่ apply)
 *   PATCH  { bill_id, tracking_no?, bill_date?, lines?, apply? } → แก้ค่าที่อ่านผิด/จับคู่สินค้า · apply=true → เขียนน้ำหนัก/คิวลงใบสำคัญ
 *   DELETE ?bill_id=                                        → ถอดใบส่งของ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { parseDeliveryBillImage, applyDeliveryBill, normDate, type DeliveryBillLine } from "@/lib/delivery-bill";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;   // AI อ่านรูปใช้เวลา

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const optNum = (v: unknown): number | null => (v === null || v === "" || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: bills }, { data: vls }] = await Promise.all([
    admin.from("purchase_delivery_bills").select("*").eq("voucher_id", id).not("is_active", "is", false).order("created_at"),
    admin.from("purchase_voucher_lines_v2").select("gr_id").eq("voucher_id", id).not("is_active", "is", false),
  ]);
  // ไฟล์แนบตอนรับของ (ใบรับของ/บิล) ของ GR ที่อยู่ในใบสำคัญนี้ — เอามาให้ AI อ่านได้เลย ไม่ต้องอัปโหลดซ้ำ
  const grIds = [...new Set(((vls ?? []) as Row[]).map((r) => String(r.gr_id ?? "")).filter(Boolean))];
  const candidates: { gr_id: string; gr_no: string; kind: "receipt" | "bill"; r2_key: string }[] = [];
  if (grIds.length) {
    const { data: grs } = await admin.from("goods_receipts_v2").select("id, gr_no, receipt_doc_r2_key, bill_doc_r2_key").in("id", grIds);
    for (const g of (grs ?? []) as Row[]) {
      if (g.receipt_doc_r2_key) candidates.push({ gr_id: String(g.id), gr_no: String(g.gr_no ?? ""), kind: "receipt", r2_key: String(g.receipt_doc_r2_key) });
      if (g.bill_doc_r2_key) candidates.push({ gr_id: String(g.id), gr_no: String(g.gr_no ?? ""), kind: "bill", r2_key: String(g.bill_doc_r2_key) });
    }
  }
  return NextResponse.json({ data: bills ?? [], candidates, error: null });
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  let body: { r2_key?: string; gr_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const r2Key = str(body.r2_key);
  if (!r2Key) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: v } = await admin.from("purchase_vouchers_v2").select("id, status").eq("id", id).maybeSingle();
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });

  try {
    const { parsed, raw } = await parseDeliveryBillImage(r2Key);
    const { data: ins, error } = await admin.from("purchase_delivery_bills").insert({
      voucher_id: id, gr_id: body.gr_id || null, r2_key: r2Key,
      tracking_no: parsed.tracking_no, bill_date: parsed.bill_date, marking: parsed.marking, delivery_area: parsed.delivery_area, carrier_text: parsed.carrier_text,
      total_weight_kg: parsed.total_weight_kg, total_m3: parsed.total_m3, total_packages: parsed.total_packages,
      lines: parsed.lines, raw, status: "parsed", created_by: (user?.user_metadata?.name as string) || user?.email || null,
    }).select("*").single();
    if (error || !ins) return NextResponse.json({ error: "บันทึกใบส่งของไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
    await writeAudit(admin, { action: "create", entityType: "purchase_delivery_bills", entityId: String((ins as Row).id), actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { voucher_id: id, tracking_no: parsed.tracking_no, lines: parsed.lines.length } });
    return NextResponse.json({ ok: true, data: ins, error: null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await params;
  let body: { bill_id?: string; tracking_no?: string | null; bill_date?: string | null; lines?: unknown; apply?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const billId = str(body.bill_id);
  if (!billId) return NextResponse.json({ error: "ไม่ระบุใบส่งของ" }, { status: 400 });
  const admin = supabaseAdmin();
  const [{ data: v }, { data: bill }] = await Promise.all([
    admin.from("purchase_vouchers_v2").select("id, status").eq("id", id).maybeSingle(),
    admin.from("purchase_delivery_bills").select("*").eq("id", billId).eq("voucher_id", id).maybeSingle(),
  ]);
  if (!v || !bill) return NextResponse.json({ error: "ไม่พบใบส่งของ" }, { status: 404 });
  const patch: Row = {};
  if (body.tracking_no !== undefined) patch.tracking_no = str(body.tracking_no).toUpperCase() || null;
  if (body.bill_date !== undefined) patch.bill_date = normDate(body.bill_date);
  let lines: DeliveryBillLine[] | null = null;
  if (Array.isArray(body.lines)) {
    lines = (body.lines as Row[]).map((l) => ({
      stock: str(l.stock) || null, po_no: str(l.po_no) || null, description: str(l.description) || null,
      pack: optNum(l.pack), package: str(l.package) || null, qty: optNum(l.qty), weight_kg: optNum(l.weight_kg), m3: optNum(l.m3),
      voucher_line_ids: Array.isArray(l.voucher_line_ids) ? (l.voucher_line_ids as unknown[]).map(String).filter(Boolean) : [],
    }));
    patch.lines = lines;
    patch.total_weight_kg = lines.some((l) => l.weight_kg != null) ? Math.round(lines.reduce((a, l) => a + (l.weight_kg ?? 0), 0) * 10000) / 10000 : null;
    patch.total_m3 = lines.some((l) => l.m3 != null) ? Math.round(lines.reduce((a, l) => a + (l.m3 ?? 0), 0) * 10000) / 10000 : null;
  }
  let applied = 0;
  if (body.apply) {
    if ((v as Row).status !== "draft") return NextResponse.json({ error: "ใบสำคัญยืนยันแล้ว ใส่น้ำหนัก/คิวเพิ่มไม่ได้" }, { status: 400 });
    const useLines = lines ?? ((bill as Row).lines as DeliveryBillLine[]) ?? [];
    if (!useLines.some((l) => (l.voucher_line_ids ?? []).length > 0)) return NextResponse.json({ error: "ยังไม่ได้จับคู่สินค้ากับรายการในใบส่งของเลย" }, { status: 400 });
    applied = await applyDeliveryBill(admin, id, { tracking_no: (patch.tracking_no as string | null) ?? ((bill as Row).tracking_no as string | null) ?? null, lines: useLines });
    patch.status = "applied"; patch.applied_at = new Date().toISOString();
  }
  patch.updated_at = new Date().toISOString();
  const { data: upd, error } = await admin.from("purchase_delivery_bills").update(patch).eq("id", billId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (body.apply) await writeAudit(admin, { action: "update", entityType: "purchase_vouchers_v2", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { delivery_bill_applied: billId, lines_updated: applied } });
  return NextResponse.json({ ok: true, data: upd, applied, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const billId = str(request.nextUrl.searchParams.get("bill_id"));
  if (!billId) return NextResponse.json({ error: "ไม่ระบุใบส่งของ" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("purchase_delivery_bills").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", billId).eq("voucher_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
