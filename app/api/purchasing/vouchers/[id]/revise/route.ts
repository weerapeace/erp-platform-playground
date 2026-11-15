/**
 * แก้ใบสำคัญรับที่ยืนยันแล้ว + เวอร์ชัน (★ 2026-11-15 เจ้าของ: "อยากให้ใบที่ยืนยันแล้ว แก้ไขได้ด้วย แต่ต้องเก็บประวัติ" — แบบ ก.)
 *   GET  → ประวัติทุกเวอร์ชัน (ใหม่ → เก่า) · ?rev=N → เวอร์ชันนั้นทั้งใบ (ดูใบเก่า)
 *   POST { action: "start", reason }  → เปิดแก้ (เลขเดิม · เก็บใบตอนนี้เป็นเวอร์ชันล่าสุดก่อน) — สิทธิ์ pv.edit_confirmed
 *   POST { action: "save" }           → บันทึกการแก้: ตรวจเหมือนตอนยืนยัน → เขียนราคาใหม่กลับ PO/ราคาร้าน/สินค้า → เก็บเวอร์ชันใหม่ + สิ่งที่เปลี่ยน → ปิดการแก้
 *   POST { action: "cancel" }         → ยกเลิกการแก้: คืนใบเป็นเวอร์ชันล่าสุดที่เก็บไว้
 * ระหว่างเปิดแก้ สถานะยังเป็น confirmed (editing_at มีค่า) — API แก้รายการ/บิล/หัวใบ ยอมให้แก้ (lib/voucher-revision voucherEditable)
 * เก็บเวอร์ชัน: ตารางกลาง document_revisions (lib/document-revisions) · ราคาก่อนเขียนทับเก็บใน audit "revise_save" → ยกเลิกใบ (void) รวมย้อนได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchVoucher, recomputeVoucher, snapshotVoucher, restoreVoucherSnapshot } from "@/lib/purchase-voucher-server";
import { writeBackVoucherPrices } from "@/lib/voucher-writeback";
import { saveRevision, listRevisions, getRevision, VOUCHER_ENTITY } from "@/lib/document-revisions";
import { diffVoucherSnapshots, type VoucherSnapshot } from "@/lib/voucher-revision";
import { isForeignCurrency } from "@/lib/landed-cost";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const rev = Number(request.nextUrl.searchParams.get("rev"));
  if (rev > 0) {
    const r = await getRevision(admin, VOUCHER_ENTITY, id, rev);
    if (!r) return NextResponse.json({ error: "ไม่พบเวอร์ชันนี้" }, { status: 404 });
    return NextResponse.json({ data: r, error: null });
  }
  return NextResponse.json({ data: await listRevisions(admin, VOUCHER_ENTITY, id), error: null });
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "pv.edit_confirmed"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actorName = (user?.user_metadata?.name as string) || user?.email || null;
  const { id } = await params;
  let body: { action?: string; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("purchase_vouchers_v2").select("id, status, pv_no, revision, editing_at, editing_by, edit_reason, confirmed_at, confirmed_by").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  const c = cur as Row;
  if (c.status !== "confirmed") return NextResponse.json({ error: c.status === "draft" ? "ใบนี้ยังเป็นร่าง — แก้ได้เลย ไม่ต้องเปิดแก้" : "ใบนี้ถูกยกเลิกแล้ว แก้ไม่ได้" }, { status: 400 });
  const revision = Number(c.revision) || 1;

  // ---------- เปิดแก้ ----------
  if (body.action === "start") {
    const reason = String(body.reason ?? "").trim();
    if (reason.length < 3) return NextResponse.json({ error: "ใส่เหตุผลที่แก้ (อย่างน้อย 3 ตัวอักษร)" }, { status: 400 });
    if (c.editing_at) return NextResponse.json({ error: `ใบนี้กำลังถูกแก้อยู่โดย ${c.editing_by ?? "—"}` }, { status: 409 });
    // เก็บใบตอนนี้เป็นเวอร์ชันปัจจุบันก่อน (ใบที่ยืนยันก่อนมีระบบนี้ = เวอร์ชัน 1 ย้อนหลัง)
    if (!(await getRevision(admin, VOUCHER_ENTITY, id, revision))) {
      await saveRevision(admin, { entityType: VOUCHER_ENTITY, entityId: id, revNo: revision, action: revision === 1 ? "confirm" : "edit", reason: null,
        snapshot: await snapshotVoucher(admin, id), diff: null, actorId: null, actorName: revision === 1 ? ((c.confirmed_by as string) ?? null) : null,
        createdAt: revision === 1 && c.confirmed_at ? String(c.confirmed_at) : undefined });
    }
    const { error } = await admin.from("purchase_vouchers_v2").update({ editing_at: new Date().toISOString(), editing_by: actorName, edit_reason: reason, updated_at: new Date().toISOString() }).eq("id", id).is("editing_at", null);
    if (error) return NextResponse.json({ error: "เปิดแก้ไม่สำเร็จ: " + error.message }, { status: 500 });
    await writeAudit(admin, { action: "edit_start", entityType: VOUCHER_ENTITY, entityId: id, actorId: user?.id ?? null, actorName, metadata: { pv_no: c.pv_no ?? null, revision, reason } });
    return NextResponse.json({ ok: true, data: await fetchVoucher(admin, id), error: null });
  }

  if (!c.editing_at) return NextResponse.json({ error: "ใบนี้ไม่ได้เปิดแก้อยู่" }, { status: 400 });

  // ---------- ยกเลิกการแก้ ----------
  if (body.action === "cancel") {
    const r = await getRevision(admin, VOUCHER_ENTITY, id, revision);
    if (!r?.snapshot) return NextResponse.json({ error: "ไม่พบใบเวอร์ชันล่าสุดที่เก็บไว้ — ยกเลิกการแก้ไม่ได้" }, { status: 500 });
    await restoreVoucherSnapshot(admin, id, r.snapshot as VoucherSnapshot);
    await admin.from("purchase_vouchers_v2").update({ editing_at: null, editing_by: null, edit_reason: null, updated_at: new Date().toISOString() }).eq("id", id);
    await writeAudit(admin, { action: "edit_cancel", entityType: VOUCHER_ENTITY, entityId: id, actorId: user?.id ?? null, actorName, metadata: { pv_no: c.pv_no ?? null, revision, reason: c.edit_reason ?? null } });
    return NextResponse.json({ ok: true, data: await fetchVoucher(admin, id), error: null });
  }

  if (body.action !== "save") return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });

  // ---------- บันทึกการแก้ ----------
  await recomputeVoucher(admin, id);
  const v = await fetchVoucher(admin, id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if (v.lines.length === 0) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });
  const missing = v.lines.filter((l) => !(Number(l.unit_price) > 0));
  if (missing.length) return NextResponse.json({ error: `ยังไม่ได้ใส่ราคา ${missing.length} รายการ: ${missing.slice(0, 3).map((l) => l.item_name).join(", ")}${missing.length > 3 ? " …" : ""}` }, { status: 400 });
  if (isForeignCurrency(v.header.currency) && !(Number(v.header.fx_rate) > 0)) return NextResponse.json({ error: "ต้องใส่เรทแปลงเป็นบาทก่อน" }, { status: 400 });

  const prev = await getRevision(admin, VOUCHER_ENTITY, id, revision);
  const next = await snapshotVoucher(admin, id);
  const diff = prev?.snapshot ? diffVoucherSnapshots(prev.snapshot as VoucherSnapshot, next) : [];
  const clearEditing = { editing_at: null, editing_by: null, edit_reason: null, updated_at: new Date().toISOString() };
  if (prev?.snapshot && diff.length === 0) {
    await admin.from("purchase_vouchers_v2").update(clearEditing).eq("id", id);
    return NextResponse.json({ ok: true, unchanged: true, data: await fetchVoucher(admin, id), error: null });
  }

  const newRev = revision + 1;
  const { results, before } = await writeBackVoucherPrices(admin, v, { actorId: user?.id ?? null, actorName, refLabel: `${v.header.pv_no ?? ""} แก้ครั้งที่ ${newRev}` });
  await saveRevision(admin, { entityType: VOUCHER_ENTITY, entityId: id, revNo: newRev, action: "edit", reason: (c.edit_reason as string) ?? null, snapshot: next, diff, actorId: user?.id ?? null, actorName });
  await admin.from("purchase_vouchers_v2").update({ ...clearEditing, revision: newRev }).eq("id", id);
  await writeAudit(admin, {
    action: "revise_save", entityType: VOUCHER_ENTITY, entityId: id, actorId: user?.id ?? null, actorName,
    metadata: { pv_no: v.header.pv_no, rev_no: newRev, reason: c.edit_reason ?? null, diff, grand_total_thb: v.header.grand_total_thb, write_back: results, price_before: before },
  });
  // จ่ายค่าสินค้าไปแล้ว + ยอดใหม่ไม่เท่าที่จ่าย → เตือน (ไม่แก้การจ่ายเงินเอง)
  const payWarnings = v.header.po_payments
    .filter((p) => String(p.payment_status).toLowerCase() === "paid" && p.paid_amount_thb != null && Math.abs(Number(p.paid_amount_thb) - p.goods_thb) > 1)
    .map((p) => ({ po_no: p.po_no, paid_thb: Number(p.paid_amount_thb), now_thb: p.goods_thb }));
  return NextResponse.json({ ok: true, rev_no: newRev, diff, failed: results.filter((r) => r.error).length, pay_warnings: payWarnings, data: await fetchVoucher(admin, id), error: null });
}
