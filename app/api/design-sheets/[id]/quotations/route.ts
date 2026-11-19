/**
 * ใบงานออกแบบ → ใบเสนอราคาของงานนี้ (ระบบขาย)
 *
 * GET  /api/design-sheets/[id]/quotations
 *   → { data: SheetQuotation[], restricted?: true }   ทุกเวอร์ชัน (ยังเปิดก่อน) · ไม่มีสิทธิ์ qt.view = restricted (รายการว่าง)
 *
 * POST /api/design-sheets/[id]/quotations
 *   body { action: "fail" | "revise", quotation_id, reason? }
 *   body { action: "confirm", quotation_id, close_ids?, line_map? }   ← ยืนยันใบนี้ "ผ่าน" (เจ้าของขอ 2026-11-07)
 *     line_map = ผูกบรรทัดกับ SKU (2026-11-19): เขียน sku/product_id (+รูป SKU ถ้าบรรทัดยังไม่มีรูป) กลับลงบรรทัดใบเสนอราคา
 *       · use_sku_price → ใบสั่งขายใช้ราคาขาย SKU · set_sku_price → SKU ที่ยังไม่มีราคาขาย ตั้ง = ราคาเสนอ (จดประวัติ)
 *   - confirm = ใบนี้ผ่าน (ร่าง → ส่ง → ตอบรับ · ส่งแล้ว → ตอบรับ) + ใบอื่นที่ติ๊ก (close_ids) ปิด (ร่าง = ยกเลิก · ส่งแล้ว = ปฏิเสธ "ลูกค้าเลือก …")
 *     → คืน existing_order (งานนี้มีใบสั่งขายแล้ว) หรือ order_payload ให้หน้าจอส่งต่อ POST /api/so-orders (ใช้เลขที่/ยอด/"แปลงแล้ว" ของกลางเดิม)
 *   - fail   = ใบนี้ไม่ผ่าน (ร่าง → ยกเลิก · ส่งแล้ว/ตอบรับ → ปฏิเสธ ต้องมีเหตุผล)
 *   - revise = ไม่ผ่าน + คัดลอกเป็นใบร่างใหม่ ผูกกับทุกใบงานที่ใบเก่าผูกอยู่ (จด "แทนใบเก่า")
 *   body { action: "unlink", quotation_id, chain? }  ← เอาออกจากงานนี้ (เจ้าของขอ 2026-11-19: ระบบเก่าเดาผูกผิด)
 *     ตัดแค่การผูกกับใบงานนี้ — ตัวใบเสนอราคา/ใบงานอื่นไม่ถูกแตะ · chain = เอาใบที่เปิดแทนกันทั้งสายออกด้วย · คืน removed (ไว้ย้อนกลับ)
 *   body { action: "relink", rows }  ← ย้อนกลับหลังเอาออก (ผูกคืนด้วยค่าเดิม · เฉพาะแถวของใบงานนี้)
 *   สถานะเปลี่ยนผ่าน workflow กลาง 'qt' (RPC erp_playground_quote_transition) ด้วยสิทธิ์ของผู้ใช้เอง — RPC บันทึกประวัติฝั่งใบเสนอราคาให้
 *   ลำดับ revise: สร้างใบใหม่ก่อน → เปลี่ยนสถานะใบเก่า (พลาด = ยกเลิกใบใหม่คืน ใบเก่าไม่ถูกแตะ) → ผูก → ประวัติฝั่งใบงาน
 *
 * กติกา: lib/design-sheet-quotations.ts · ตาราง design_sheet_quotations (lib/design-sheet-quotations-db.ts)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi, apiCan } from "@/lib/api-auth";
import { auditDiff, writeAudit, writeAuditMany } from "@/lib/audit";
import { quoteCopyPayload } from "@/lib/quote-copy";
import { quoteChainIds, type QuoteLineSkuMap, quoteChosenReason, quoteConfirmSteps, quoteFailAction, quoteOrderPayload, sortSheetQuotations, QUOTE_STATUS_TH, QUOTE_STEP_PERM, type SheetQuotation } from "@/lib/design-sheet-quotations";
import { loadSheetQuotations, linkSheetQuotations, withNameCheck, unlinkSheetQuotations, relinkSheetQuotations, type SheetQuoteLinkRow } from "@/lib/design-sheet-quotations-db";
import type { QuoteDetail } from "../../../quotations/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ data: [], error: "รหัสใบงานไม่ถูกต้อง" }, { status: 400 });
  if (!(await apiCan(request, "qt.view"))) return NextResponse.json({ data: [], restricted: true, error: null });
  try {
    const admin = supabaseAdmin();
    const data = await withNameCheck(admin, id, await withOrders(admin, sortSheetQuotations(await loadSheetQuotations(admin, id))));
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
}

type Body = { action?: string; quotation_id?: string; reason?: string | null; close_ids?: string[]; line_map?: QuoteLineSkuMap[]; chain?: boolean; rows?: SheetQuoteLinkRow[] };
type Admin = ReturnType<typeof supabaseAdmin>;

/** เติมใบสั่งขาย (so_orders ที่ยังไม่ยกเลิก) ที่ดึงแต่ละใบเสนอราคาไปแล้ว — ผ่าน so_order_lines.quote_id */
async function withOrders(admin: Admin, rows: SheetQuotation[]): Promise<SheetQuotation[]> {
  const ids = rows.map((r) => r.quotation_id);
  if (!ids.length) return rows;
  const { data: ls } = await admin.from("so_order_lines").select("quote_id, order_id").in("quote_id", ids);
  const lines = (ls ?? []) as { quote_id: string; order_id: string }[];
  const orderIds = [...new Set(lines.map((l) => l.order_id))];
  if (!orderIds.length) return rows;
  const { data: os } = await admin.from("so_orders").select("id, order_no, status").in("id", orderIds);
  const open = new Map(((os ?? []) as { id: string; order_no: string | null; status: string | null }[]).filter((o) => o.status !== "cancelled").map((o) => [o.id, o.order_no]));
  const byQuote = new Map<string, { id: string; no: string | null }>();
  for (const l of lines) if (open.has(l.order_id) && !byQuote.has(l.quote_id)) byQuote.set(l.quote_id, { id: l.order_id, no: open.get(l.order_id) ?? null });
  return rows.map((r) => { const o = byQuote.get(r.quotation_id); return o ? { ...r, order_id: o.id, order_no: o.no } : r; });
}

/** เอาใบเสนอราคาออกจากใบงานนี้ (+ ทั้งสาย) — จดประวัติฝั่งใบงาน · คืนแถวที่เอาออกให้หน้าจอกดย้อนกลับ */
async function unlinkQuote(request: NextRequest, sheetId: string, qid: unknown, chain: boolean): Promise<NextResponse> {
  if (!isUuid(qid)) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  const admin = supabaseAdmin();
  const linked = await loadSheetQuotations(admin, sheetId);
  if (!linked.some((r) => r.quotation_id === qid)) return NextResponse.json({ error: "ใบเสนอราคานี้ไม่ได้ผูกกับใบงานนี้แล้ว" }, { status: 404 });
  const ids = chain ? quoteChainIds(linked, qid) : [qid];
  let removed: SheetQuoteLinkRow[];
  try { removed = await unlinkSheetQuotations(admin, sheetId, ids); }
  catch (e) { return NextResponse.json({ error: `เอาออกไม่สำเร็จ: ${e instanceof Error ? e.message : e}` }, { status: 500 }); }
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const numbers = removed.map((r) => linked.find((x) => x.quotation_id === r.quotation_id)?.quote_number ?? null);
  await writeAudit(admin, { action: "quote_unlink", entityType: "design_sheet", entityId: sheetId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { quotation_ids: removed.map((r) => r.quotation_id), quote_numbers: numbers, chain, code: numbers.filter(Boolean).join(", ") || undefined,
      changes: auditDiff({ quotations: numbers.join(", ") }, { quotations: null }) } });
  return NextResponse.json({ ok: true, removed, quote_numbers: numbers, error: null });
}

/** ย้อนกลับการเอาออก — ผูกคืนด้วยค่าเดิม (รับเฉพาะแถวของใบงานนี้) */
async function relinkQuotes(request: NextRequest, sheetId: string, rows: SheetQuoteLinkRow[]): Promise<NextResponse> {
  const ok = rows.filter((r) => r && r.design_sheet_id === sheetId && isUuid(r.id) && isUuid(r.quotation_id) && (r.replaces_quotation_id == null || isUuid(r.replaces_quotation_id)))
    .map((r) => ({ id: r.id, design_sheet_id: sheetId, quotation_id: r.quotation_id, replaces_quotation_id: r.replaces_quotation_id ?? null,
      source: String(r.source || "send"), created_by: isUuid(r.created_by) ? r.created_by : null, created_by_name: r.created_by_name ?? null, created_at: r.created_at }));
  if (!ok.length) return NextResponse.json({ error: "ไม่มีรายการให้ย้อนกลับ" }, { status: 400 });
  const admin = supabaseAdmin();
  try { await relinkSheetQuotations(admin, ok); }
  catch (e) { return NextResponse.json({ error: `ย้อนกลับไม่สำเร็จ: ${e instanceof Error ? e.message : e}` }, { status: 500 }); }
  const { data: qs } = await admin.from("erp_playground_quotations").select("quote_number").in("id", ok.map((r) => r.quotation_id));
  const numbers = ((qs ?? []) as { quote_number: string | null }[]).map((q) => q.quote_number);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "quote_relink", entityType: "design_sheet", entityId: sheetId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { quotation_ids: ok.map((r) => r.quotation_id), quote_numbers: numbers, code: numbers.filter(Boolean).join(", ") || undefined,
      changes: auditDiff({ quotations: null }, { quotations: numbers.join(", ") }) } });
  return NextResponse.json({ ok: true, restored: ok.length, error: null });
}

/** ยืนยันใบนี้ "ผ่าน" + ปิดใบอื่นที่ติ๊ก — คืนข้อมูลให้หน้าจอเปิดใบสั่งขายต่อ (ถ้างานนี้ยังไม่มี) */
async function confirmQuote(request: NextRequest, sheetId: string, qid: string, closeIds: string[], lineMap: QuoteLineSkuMap[] = []): Promise<NextResponse> {
  const admin = supabaseAdmin();
  const linked = await withOrders(admin, await loadSheetQuotations(admin, sheetId));
  if (!linked.some((r) => r.quotation_id === qid)) return NextResponse.json({ error: "ใบเสนอราคานี้ไม่ได้ผูกกับใบงานนี้" }, { status: 404 });

  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  const actor = user?.email ?? null;
  const { data: src, error: gErr } = await client.rpc("erp_playground_quote_get", { p_id: qid });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  const q = src as QuoteDetail | null;
  if (!q) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });

  const steps = quoteConfirmSteps(q.status);
  if (!steps) return NextResponse.json({ error: `ใบ ${q.quote_number ?? ""} สถานะ "${QUOTE_STATUS_TH[q.status] ?? q.status}" แล้ว — ยืนยันไม่ได้` }, { status: 400 });
  for (const s of steps) {
    if (!(await apiCan(request, QUOTE_STEP_PERM[s]))) return NextResponse.json({ error: s === "send" ? "ไม่มีสิทธิ์ส่งใบเสนอราคา" : "ไม่มีสิทธิ์ตอบรับใบเสนอราคา" }, { status: 403 });
  }

  // 1) ใบนี้ → ผ่าน (ส่ง → ตอบรับ) ผ่าน workflow กลาง
  for (const s of steps) {
    const { error } = await client.rpc("erp_playground_quote_transition", { p_id: qid, p_action: s, p_actor: actor, p_reason: null });
    if (error) return NextResponse.json({ error: `เปลี่ยนสถานะใบ ${q.quote_number ?? ""} ไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }

  // 2) ใบอื่นที่ติ๊ก → ร่าง = ยกเลิก · ส่งแล้ว/ตอบรับ = ปฏิเสธ (เหตุผล "ลูกค้าเลือก …")
  const reason = quoteChosenReason(q.quote_number);
  const closed: { quote_number: string | null; action: string }[] = [];
  const skipped: { quote_number: string | null; why: string }[] = [];
  for (const cid of [...new Set(closeIds)].filter((x) => x !== qid)) {
    const row = linked.find((r) => r.quotation_id === cid);
    if (!row) continue;   // ไม่ได้ผูกกับใบงานนี้ — ไม่แตะ
    const fa = quoteFailAction(row.status);
    if (!fa) continue;
    if (!(await apiCan(request, fa.perm))) { skipped.push({ quote_number: row.quote_number, why: fa.action === "cancel" ? "ไม่มีสิทธิ์ยกเลิก" : "ไม่มีสิทธิ์ปฏิเสธ" }); continue; }
    const { error } = await client.rpc("erp_playground_quote_transition", { p_id: cid, p_action: fa.action, p_actor: actor, p_reason: fa.action === "reject" ? reason : null });
    if (error) skipped.push({ quote_number: row.quote_number, why: error.message });
    else closed.push({ quote_number: row.quote_number, action: fa.action });
  }

  // 2.5) ผูกบรรทัดกับ SKU (เจ้าของขอ 2026-11-19) — เฉพาะบรรทัดของใบนี้ · SKU ต้องมีจริง
  const priceOverride = new Map<string, number>();
  let mapped = 0;
  const lineIds = new Set((q.lines ?? []).map((l) => l.id).filter(Boolean) as string[]);
  const maps = lineMap.filter((m) => isUuid(m.line_id) && isUuid(m.sku_id) && lineIds.has(m.line_id));
  if (maps.length) {
    const { data: skus } = await admin.from("skus_v2").select("id, code, list_price, cover_image_r2_key").in("id", [...new Set(maps.map((m) => m.sku_id))]);
    const skuById = new Map(((skus ?? []) as { id: string; code: string; list_price: number | null; cover_image_r2_key: string | null }[]).map((s) => [s.id, s]));
    for (const m of maps) {
      const s = skuById.get(m.sku_id); if (!s) continue;
      const line = q.lines.find((l) => l.id === m.line_id); if (!line) continue;
      const { data: cur } = await admin.from("erp_playground_quote_lines").select("image_key").eq("id", m.line_id).maybeSingle();
      const patch: Record<string, unknown> = { sku: s.code, product_id: s.id };
      if (!(cur as { image_key: string | null } | null)?.image_key && s.cover_image_r2_key) patch.image_key = s.cover_image_r2_key;
      const { error: uErr } = await admin.from("erp_playground_quote_lines").update(patch).eq("id", m.line_id);
      if (uErr) continue;
      line.sku = s.code; line.product_id = s.id; mapped++;
      if (m.use_sku_price && s.list_price != null && Number(s.list_price) > 0) priceOverride.set(m.line_id, Number(s.list_price));
      if (m.set_sku_price && (s.list_price == null || Number(s.list_price) <= 0) && Number(line.unit_price) > 0) {
        const { error: pErr } = await admin.from("skus_v2").update({ list_price: Number(line.unit_price) }).eq("id", s.id);
        if (!pErr) await writeAudit(admin, { action: "update", entityType: "skus_v2", entityId: s.id, actorId: user?.id ?? null, actorName: actor,
          metadata: { code: s.code, reason: `ราคาจากใบเสนอราคา ${q.quote_number ?? ""}`, changes: auditDiff({ list_price: s.list_price }, { list_price: Number(line.unit_price) }) } });
      }
    }
  }
  if (priceOverride.size) q.lines = q.lines.map((l) => (l.id && priceOverride.has(l.id) ? { ...l, unit_price: priceOverride.get(l.id)! } : l));

  // 3) ใบสั่งขายของงานนี้ที่มีอยู่แล้ว (จากใบนี้ หรือใบอื่นของงานเดียวกัน) — มีแล้วไม่เปิดใหม่
  const pickRow = linked.find((r) => r.quotation_id === qid);
  const withOrder = [pickRow, ...linked.filter((r) => r.quotation_id !== qid)].find((r) => r?.order_id);
  const existing = withOrder?.order_id ? { id: withOrder.order_id, order_no: withOrder.order_no ?? null, from_quote: withOrder.quote_number } : null;

  // 4) ประวัติฝั่งใบงาน (ทุกใบงานที่ใบนี้ผูกอยู่)
  const { data: sheetRows } = await admin.from("design_sheet_quotations").select("design_sheet_id").eq("quotation_id", qid);
  const sheetIds = [...new Set(((sheetRows ?? []) as { design_sheet_id: string }[]).map((r) => r.design_sheet_id))];
  await writeAuditMany(admin, sheetIds.map((sid) => ({
    action: "quote_confirm", entityType: "design_sheet", entityId: sid, actorId: user?.id ?? null, actorName: actor,
    metadata: { quotation_id: qid, quote_number: q.quote_number, from_status: q.status, steps, closed, skipped, existing_order: existing?.order_no ?? null, sku_mapped: mapped, code: q.quote_number ?? undefined },
  })));

  return NextResponse.json({
    ok: true, quote_number: q.quote_number, steps, closed, skipped,
    existing_order: existing,
    order_payload: existing ? null : quoteOrderPayload(q),
    error: null,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const action = body.action;
  const qid = body.quotation_id;
  if (action === "unlink" || action === "relink") {
    if (!isUuid(id)) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
    if (!(await apiCan(request, "qt.view"))) return NextResponse.json({ error: "ไม่มีสิทธิ์ดูใบเสนอราคา" }, { status: 403 });
    return action === "unlink" ? unlinkQuote(request, id, qid, !!body.chain) : relinkQuotes(request, id, Array.isArray(body.rows) ? body.rows : []);
  }
  if (action !== "fail" && action !== "revise" && action !== "confirm") return NextResponse.json({ error: "action ต้องเป็น fail / revise / confirm / unlink / relink" }, { status: 400 });
  if (!isUuid(id) || !isUuid(qid)) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });
  if (action === "confirm") return confirmQuote(request, id, qid, Array.isArray(body.close_ids) ? body.close_ids.filter(isUuid) : [], Array.isArray(body.line_map) ? body.line_map : []);

  const admin = supabaseAdmin();
  const { data: link } = await admin.from("design_sheet_quotations").select("id").eq("design_sheet_id", id).eq("quotation_id", qid).maybeSingle();
  if (!link) return NextResponse.json({ error: "ใบเสนอราคานี้ไม่ได้ผูกกับใบงานนี้" }, { status: 404 });

  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();
  const actor = user?.email ?? null;

  const { data: src, error: gErr } = await client.rpc("erp_playground_quote_get", { p_id: qid });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  const q = src as QuoteDetail | null;
  if (!q) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });

  const fa = quoteFailAction(q.status);
  if (!fa) return NextResponse.json({ error: `ใบ ${q.quote_number ?? ""} สถานะ "${QUOTE_STATUS_TH[q.status] ?? q.status}" แล้ว — กดไม่ผ่านไม่ได้` }, { status: 400 });
  const reason = (body.reason ?? "").trim();
  if (fa.needReason && !reason) return NextResponse.json({ error: "ใบที่ส่งลูกค้าแล้วต้องระบุเหตุผลที่ไม่ผ่าน" }, { status: 400 });
  if (!(await apiCan(request, fa.perm))) return NextResponse.json({ error: fa.action === "cancel" ? "ไม่มีสิทธิ์ยกเลิกใบเสนอราคา" : "ไม่มีสิทธิ์ปฏิเสธใบเสนอราคา" }, { status: 403 });
  if (action === "revise" && !(await apiCan(request, "qt.create"))) return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างใบเสนอราคา" }, { status: 403 });

  // 1) revise: สร้างใบร่างใหม่จากใบเก่าก่อน (ทุกบรรทัด รูป หมายเหตุ ส่วนลด)
  let newId: string | null = null;
  if (action === "revise") {
    const { header, lines } = quoteCopyPayload(q);
    const { data, error } = await client.rpc("erp_playground_quote_create", { p_header: header, p_lines: lines, p_actor: actor });
    if (error) return NextResponse.json({ error: `สร้างใบใหม่ไม่สำเร็จ: ${error.message}` }, { status: 500 });
    newId = (data as string | null) ?? null;
  }

  // 2) ใบเก่า → ยกเลิก / ปฏิเสธ ผ่าน workflow กลาง
  const { error: tErr } = await client.rpc("erp_playground_quote_transition", {
    p_id: qid, p_action: fa.action, p_actor: actor, p_reason: reason || null,
  });
  if (tErr) {
    if (newId) await client.rpc("erp_playground_quote_transition", { p_id: newId, p_action: "cancel", p_actor: actor, p_reason: "ย้อนกลับ: เปลี่ยนสถานะใบเก่าไม่สำเร็จ" });
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  // 3) ผูกใบใหม่กับทุกใบงานที่ใบเก่าผูกอยู่
  const { data: sheetRows } = await admin.from("design_sheet_quotations").select("design_sheet_id").eq("quotation_id", qid);
  const sheetIds = [...new Set(((sheetRows ?? []) as { design_sheet_id: string }[]).map((r) => r.design_sheet_id))];
  let newNumber: string | null = null;
  if (newId) {
    await linkSheetQuotations(admin, sheetIds.map((sid) => ({
      design_sheet_id: sid, quotation_id: newId!, replaces_quotation_id: qid, source: "revise" as const,
      created_by: user?.id ?? null, created_by_name: actor,
    })));
    const { data: nq } = await admin.from("erp_playground_quotations").select("quote_number").eq("id", newId).maybeSingle();
    newNumber = (nq?.quote_number as string | undefined) ?? null;
  }

  // 4) ประวัติฝั่งใบงาน (ทุกใบงานที่โดน)
  await writeAuditMany(admin, sheetIds.map((sid) => ({
    action: action === "revise" ? "quote_revise" : "quote_fail",
    entityType: "design_sheet", entityId: sid,
    actorId: user?.id ?? null, actorName: actor,
    metadata: {
      quotation_id: qid, quote_number: q.quote_number, from_status: q.status, workflow_action: fa.action,
      reason: reason || null, new_quotation_id: newId, new_quote_number: newNumber,
      code: q.quote_number ?? undefined,
    },
  })));

  return NextResponse.json({
    ok: true, workflow_action: fa.action, old_quote_number: q.quote_number,
    new_quotation_id: newId, new_quote_number: newNumber, sheets: sheetIds.length, error: null,
  });
}
