/**
 * Design Sheets — ใบแจ้งลูกค้า (แท็บ "📣 แจ้งลูกค้า" · เจ้าของขอ 2026-11-06)
 *
 * GET  /api/design-sheets/[id]/notices → { data: NoticeRecord[] } ล่าสุดก่อน
 * POST /api/design-sheets/[id]/notices → สร้างใบแจ้งใหม่ { data: NoticeRecord }
 * แก้/ลบทีละใบ = ./[noticeId]/route.ts · ของช่วยร่วม = ./shared.ts
 *
 * ของกลาง: guardApi (products.view / products.edit) · supabaseAdmin (RLS deny-all) · writeAudit · cleanNotice (lib/design-sheet-notice)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { cleanNotice } from "@/lib/design-sheet-notice";
import { NOTICE_COLS, noticeActor, noticeFromRow } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("design_sheet_notices").select(NOTICE_COLS)
    .eq("sheet_id", id).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r) => noticeFromRow(r as Record<string, unknown>)), error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const doc = cleanNotice(body);
  const admin = supabaseAdmin();
  const { data: sheet } = await admin.from("design_sheets").select("id, code").eq("id", id).maybeSingle();
  if (!sheet) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
  const actor = await noticeActor(request, admin);
  const { data, error } = await admin.from("design_sheet_notices").insert({
    sheet_id: id, kind: doc.kind, title: doc.title, images: doc.images, img_cols: doc.img_cols, calc: doc.calc, note: doc.note || null,
    show: doc.display, created_by: actor.id, created_by_name: actor.name, updated_by: actor.id,
  }).select(NOTICE_COLS).single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, {
    action: "notice_create", entityType: "design_sheet", entityId: id, actorId: actor.id, actorName: actor.email,
    metadata: { sheet_code: sheet.code ?? null, notice_id: data.id, kind: doc.kind, title: doc.title, images: doc.images.length, rows: doc.calc.rows.length },
  });
  return NextResponse.json({ data: noticeFromRow(data as Record<string, unknown>), error: null });
}
