/**
 * บิลจากร้าน (ภาษาจีน) ของใบสำคัญรับ — AI อ่าน + จับคู่กับบรรทัดใบสั่งซื้อของร้านเดียวกันเท่านั้น
 *   GET    /api/purchasing/vouchers/<id>/seller-bills       → บิลที่อ่านไว้ + บรรทัด PO ที่เลือกจับคู่ได้ (groups) + ไฟล์บิลที่แนบตอนรับของ · ?other=1 + PO ร้านอื่น (other_groups)
 *   POST   { r2_key, gr_id? }                                → AI อ่านบิล + จับคู่อัตโนมัติ → บันทึก (ยังไม่ใส่ลงใบ)
 *   PATCH  { bill_id, lines, bill_no?, bill_date?, rematch?, apply?, remember?, fill_cn? }
 *            rematch = จับคู่ใหม่ (เฉพาะแถวที่ยังไม่ได้ตัดสิน) · apply = ใส่แถวที่ยืนยันลงใบสำคัญ (+ จำคู่ถ้า remember · เติมชื่อจีนให้สินค้าที่ยังไม่มีถ้า fill_cn)
 *   DELETE ?bill_id=                                         → ถอดบิล (รายการที่ใส่ลงใบแล้วยังอยู่)
 * logic อยู่ lib/seller-bill.ts + lib/seller-bill-match.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { isRefForCategory } from "@/lib/file-ref";
import { normDate } from "@/lib/delivery-bill";
import { loadVoucherLite, loadShopGroups, loadAliases, parseSellerBill, rematchLines, applySellerBill } from "@/lib/seller-bill";
import { loadOtherShopGroups } from "@/lib/seller-bill-intake";
import { matchBillLines, normalizeBillLine, undecidedCount, applyGroupToLine, type SellerBillLine } from "@/lib/seller-bill-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;   // AI อ่านบิล + รายการ PO

type Params = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const actorOf = async (request: NextRequest) => {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { id: user?.id ?? null, name: (user?.user_metadata?.name as string) || user?.email || null, email: user?.email ?? null };
};
const toBill = (b: Row) => ({ ...b, lines: (Array.isArray(b.lines) ? (b.lines as Row[]) : []).map(normalizeBillLine) });

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.cost.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const v = await loadVoucherLite(admin, id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  const [{ data: bills }, groups, { data: vls }] = await Promise.all([
    admin.from("purchase_delivery_bills").select("*").eq("voucher_id", id).eq("kind", "seller").not("is_active", "is", false).order("created_at"),
    loadShopGroups(admin, v),
    admin.from("purchase_voucher_lines_v2").select("gr_id").eq("voucher_id", id).not("is_active", "is", false),
  ]);
  // ไฟล์บิล/ใบรับของที่แนบไว้ตอนรับของ — ให้ AI อ่านได้เลยไม่ต้องอัปซ้ำ
  const grIds = [...new Set(((vls ?? []) as Row[]).map((r) => str(r.gr_id)).filter(Boolean))];
  const candidates: { gr_id: string; gr_no: string; kind: "receipt" | "bill"; r2_key: string }[] = [];
  if (grIds.length) {
    const { data: grs } = await admin.from("goods_receipts_v2").select("id, gr_no, receipt_doc_r2_key, bill_doc_r2_key").in("id", grIds);
    for (const g of (grs ?? []) as Row[]) {
      if (g.bill_doc_r2_key) candidates.push({ gr_id: String(g.id), gr_no: str(g.gr_no), kind: "bill", r2_key: str(g.bill_doc_r2_key) });
      if (g.receipt_doc_r2_key) candidates.push({ gr_id: String(g.id), gr_no: str(g.gr_no), kind: "receipt", r2_key: str(g.receipt_doc_r2_key) });
    }
  }
  // ?other=1 = ใบสั่งซื้อที่ค้างของร้านอื่น (แท็บ ② ป๊อปเลือกจับคู่เอง + คำใบ้ "เจอใน PO ร้านอื่น")
  const other = request.nextUrl.searchParams.get("other") === "1" ? await loadOtherShopGroups(admin, v) : undefined;
  return NextResponse.json({ data: ((bills ?? []) as Row[]).map(toBill), groups, candidates, has_partner: !!v.seller_partner_id,
    voucher: { seller_name: v.seller_name, seller_partner_id: v.seller_partner_id, currency: v.currency }, ...(other ? { other_groups: other } : {}), error: null });
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  const { id } = await params;
  let body: { r2_key?: string; gr_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ref = str(body.r2_key);
  if (!ref) return NextResponse.json({ error: "ยังไม่ได้แนบไฟล์บิล" }, { status: 400 });
  if (!isRefForCategory(ref, "supplier_bills")) return NextResponse.json({ error: "ไฟล์แนบไม่ถูกต้อง — แนบไฟล์ใหม่อีกครั้ง" }, { status: 400 });
  const admin = supabaseAdmin();
  const v = await loadVoucherLite(admin, id);
  if (!v) return NextResponse.json({ error: "ไม่พบใบสำคัญรับ" }, { status: 404 });
  if (v.status !== "draft") return NextResponse.json({ error: "ใบนี้ยืนยันแล้ว อ่านบิลเพิ่มไม่ได้" }, { status: 400 });

  try {
    const groups = await loadShopGroups(admin, v);
    const aliases = await loadAliases(admin, v.seller_partner_id);
    const { header, lines, raw, model } = await parseSellerBill(admin, ref, groups, { request });
    if (!header.is_bill && lines.length === 0) return NextResponse.json({ error: "ไฟล์นี้ดูไม่ใช่บิลซื้อของ — ตรวจว่าแนบรูปถูกใบ" }, { status: 400 });
    if (lines.length === 0) return NextResponse.json({ error: "AI อ่านรายการในบิลไม่ได้ — ลองถ่ายให้ชัดขึ้น / ตรงขึ้น แล้วอ่านใหม่" }, { status: 400 });
    const matched = matchBillLines(lines, groups, aliases);
    const { data: ins, error } = await admin.from("purchase_delivery_bills").insert({
      voucher_id: id, gr_id: body.gr_id || null, r2_key: ref, kind: "seller",
      bill_no: header.bill_no, seller_text: header.seller_text, bill_date: header.bill_date, total_amount: header.total_amount, currency: header.currency,
      lines: matched, raw, status: "parsed", created_by: actor.name,
    }).select("*").single();
    if (error || !ins) return NextResponse.json({ error: "บันทึกบิลไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
    const cnt = (lv: string) => matched.filter((l) => l.level === lv).length;
    // อ่านด้วย AI มีค่าใช้จ่าย — จดว่าใครกด
    await writeAudit(admin, { action: "ai_seller_bill_read", entityType: "purchase_delivery_bills", entityId: String((ins as Row).id), actorId: actor.id, actorName: actor.email,
      metadata: { voucher_id: id, model, lines: matched.length, ok: cnt("ok"), mid: cnt("mid"), no: cnt("no"), fee: cnt("fee"), po_groups: groups.length } });
    return NextResponse.json({ ok: true, data: toBill(ins as Row), groups, error: null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  const { id } = await params;
  let body: { bill_id?: string; lines?: unknown; bill_no?: string | null; bill_date?: string | null; rematch?: boolean; apply?: boolean; remember?: boolean; fill_cn?: boolean; backfill_po?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const billId = str(body.bill_id);
  if (!billId) return NextResponse.json({ error: "ไม่ระบุบิล" }, { status: 400 });
  const admin = supabaseAdmin();
  const v = await loadVoucherLite(admin, id);
  const { data: bill } = await admin.from("purchase_delivery_bills").select("*").eq("id", billId).eq("voucher_id", id).eq("kind", "seller").maybeSingle();
  if (!v || !bill) return NextResponse.json({ error: "ไม่พบบิล" }, { status: 404 });
  if (v.status !== "draft") return NextResponse.json({ error: "ใบนี้ยืนยันแล้ว แก้บิลไม่ได้" }, { status: 400 });

  const prev = (Array.isArray((bill as Row).lines) ? ((bill as Row).lines as Row[]) : []).map(normalizeBillLine);
  let lines: SellerBillLine[] = Array.isArray(body.lines) ? (body.lines as Row[]).map(normalizeBillLine) : prev;
  // เก็บ id รายการที่บิลนี้เคยใส่ลงใบไว้เสมอ (ฝั่งเว็บส่งมาหรือไม่ก็ตาม)
  lines = lines.map((l, i) => ({ ...l, voucher_line_ids: prev[i]?.voucher_line_ids ?? l.voucher_line_ids }));
  const patch: Row = { updated_at: new Date().toISOString() };
  if (body.bill_no !== undefined) patch.bill_no = str(body.bill_no) || null;
  if (body.bill_date !== undefined) patch.bill_date = normDate(body.bill_date);

  try {
    if (body.rematch) {
      lines = (await rematchLines(admin, v, lines.map((l) => (l.decision ? l : { ...l, manual: false })))).lines;
    } else {
      // คิดเหตุผล/ป้ายใหม่ของแถวที่คนเลือกเองฝั่งเว็บ (ตัวเลขอาจถูกแก้)
      const groups = await loadShopGroups(admin, v);
      const aliases = await loadAliases(admin, v.seller_partner_id);
      // แถวที่เลือก PO ร้านอื่น (move_po) ยังไม่ได้ย้าย = ยังไม่อยู่ในกลุ่มร้านนี้ → คงไว้ตามที่เลือก (ย้ายตอนกดใส่ลงใบ)
      lines = lines.map((l) => { if (!l.match_key) return l; const g = groups.find((x) => x.key === l.match_key) ?? null; return !g && l.move_po ? l : applyGroupToLine(l, g, groups, aliases, l.manual); })
        .map((l, i) => ({ ...l, decision: lines[i].decision, voucher_line_ids: lines[i].voucher_line_ids, move_po: lines[i].move_po, sku_pick: lines[i].sku_pick }));
    }
    let result: Awaited<ReturnType<typeof applySellerBill>> | null = null;
    if (body.apply) {
      const left = undecidedCount(lines);
      if (left > 0) return NextResponse.json({ error: `ยังเหลือ ${left} แถวที่ยังไม่ได้เช็ก — กดใช่ / เลือกจับคู่เอง / ข้าม ให้ครบก่อน` }, { status: 400 });
      const previousIds = prev.flatMap((l) => l.voucher_line_ids);
      result = await applySellerBill(admin, v, lines, { remember: body.remember !== false, actorName: actor.name, previousIds, fillCnName: body.fill_cn !== false, actorId: actor.id, billId,
        backfillPo: body.backfill_po !== false, billNo: str((bill as Row).bill_no) || null, billDate: str((bill as Row).bill_date) || null });
      lines = result.lines;
      patch.status = "applied"; patch.applied_at = new Date().toISOString();
    }
    patch.lines = lines;
    const { data: upd, error } = await admin.from("purchase_delivery_bills").update(patch).eq("id", billId).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (result) await writeAudit(admin, { action: "update", entityType: "purchase_vouchers_v2", entityId: id, actorId: actor.id, actorName: actor.email,
      metadata: { seller_bill_applied: billId, inserted: result.inserted, updated: result.updated, expenses: result.expenses, remembered: result.remembered, filled_cn: result.filledCn, backfilled_po: result.backfilled?.po_no ?? null } });
    return NextResponse.json({ ok: true, data: toBill(upd as Row), applied: result ? { inserted: result.inserted, updated: result.updated, expenses: result.expenses, remembered: result.remembered, filled_cn: result.filledCn, backfilled: result.backfilled } : null, error: null });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const actor = await actorOf(request);
  const { id } = await params;
  const billId = str(request.nextUrl.searchParams.get("bill_id"));
  if (!billId) return NextResponse.json({ error: "ไม่ระบุบิล" }, { status: 400 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("purchase_delivery_bills").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", billId).eq("voucher_id", id).eq("kind", "seller");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, { action: "delete", entityType: "purchase_delivery_bills", entityId: billId, actorId: actor.id, actorName: actor.email, metadata: { voucher_id: id, kind: "seller" } });
  return NextResponse.json({ ok: true, error: null });
}
