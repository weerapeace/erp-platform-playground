/**
 * ใบงานออกแบบ → ใบเสนอราคาของงานนี้ (ระบบขาย)
 *
 * GET  /api/design-sheets/[id]/quotations
 *   → { data: SheetQuotation[], restricted?: true }   ทุกเวอร์ชัน (ยังเปิดก่อน) · ไม่มีสิทธิ์ qt.view = restricted (รายการว่าง)
 *
 * POST /api/design-sheets/[id]/quotations
 *   body { action: "fail" | "revise", quotation_id, reason? }
 *   - fail   = ใบนี้ไม่ผ่าน (ร่าง → ยกเลิก · ส่งแล้ว/ตอบรับ → ปฏิเสธ ต้องมีเหตุผล)
 *   - revise = ไม่ผ่าน + คัดลอกเป็นใบร่างใหม่ ผูกกับทุกใบงานที่ใบเก่าผูกอยู่ (จด "แทนใบเก่า")
 *   สถานะเปลี่ยนผ่าน workflow กลาง 'qt' (RPC erp_playground_quote_transition) ด้วยสิทธิ์ของผู้ใช้เอง — RPC บันทึกประวัติฝั่งใบเสนอราคาให้
 *   ลำดับ revise: สร้างใบใหม่ก่อน → เปลี่ยนสถานะใบเก่า (พลาด = ยกเลิกใบใหม่คืน ใบเก่าไม่ถูกแตะ) → ผูก → ประวัติฝั่งใบงาน
 *
 * กติกา: lib/design-sheet-quotations.ts · ตาราง design_sheet_quotations (lib/design-sheet-quotations-db.ts)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi, apiCan } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";
import { quoteCopyPayload } from "@/lib/quote-copy";
import { quoteFailAction, sortSheetQuotations, QUOTE_STATUS_TH } from "@/lib/design-sheet-quotations";
import { loadSheetQuotations, linkSheetQuotations } from "@/lib/design-sheet-quotations-db";
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
    const data = sortSheetQuotations(await loadSheetQuotations(supabaseAdmin(), id));
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
}

type Body = { action?: string; quotation_id?: string; reason?: string | null };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const action = body.action;
  const qid = body.quotation_id;
  if (action !== "fail" && action !== "revise") return NextResponse.json({ error: "action ต้องเป็น fail หรือ revise" }, { status: 400 });
  if (!isUuid(id) || !isUuid(qid)) return NextResponse.json({ error: "รหัสไม่ถูกต้อง" }, { status: 400 });

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
