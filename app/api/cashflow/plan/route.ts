/**
 * POST /api/cashflow/plan — ยืนยันการเลื่อนวันจากกระดานเงินสด
 *
 * body: { moves: [{ source, docId, date }] }
 *   source = purchase_order | billing_note | sales_order | china
 *   date   = "YYYY-MM-DD"
 *
 * เขียนวันใหม่ลง "ช่องวันของเอกสารต้นทาง" ตามตาราง MOVABLE_SOURCES (ของกลาง)
 * จึงไม่มีตารางแผนซ้อนอีกชั้น — หน้าอื่นที่อ่านวันครบกำหนดจะเห็นค่าใหม่ทันที
 *
 * ความปลอดภัย:
 *  - ต้องมีสิทธิ์ cashflow.manage
 *  - source ต้องอยู่ใน MOVABLE_SOURCES เท่านั้น (งวดผ่อน/เงินเดือน/ดอกเบี้ย OD เลื่อนไม่ได้)
 *  - ชื่อตาราง/ชื่อคอลัมน์มาจากทะเบียนในโค้ด ไม่ได้รับจากผู้ใช้ — กัน SQL injection ผ่านชื่อฟิลด์
 *  - เขียน audit log ทุกใบ พร้อมวันเดิม/วันใหม่ (ย้อนดูได้ว่าใครเลื่อนอะไร)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditMany } from "@/lib/audit";
import { MOVABLE_SOURCES, type CashflowSource } from "@/lib/cashflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PlanMove = { source: string; docId: string; date: string };
export type PlanResult = { moved: number; failed: { docId: string; reason: string }[] };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { moves?: PlanMove[] };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const moves = (Array.isArray(body.moves) ? body.moves : []).slice(0, 500);
  if (!moves.length) return NextResponse.json({ error: "ไม่มีรายการที่จะเลื่อน" }, { status: 400 });

  const admin = supabaseAdmin();
  const failed: { docId: string; reason: string }[] = [];
  const audits: Parameters<typeof writeAuditMany>[1] = [];
  let moved = 0;

  for (const mv of moves) {
    const docId = String(mv?.docId ?? "");
    const date = String(mv?.date ?? "");
    const cfg = MOVABLE_SOURCES[String(mv?.source) as CashflowSource];

    if (!cfg) { failed.push({ docId, reason: "รายการชนิดนี้เลื่อนวันไม่ได้" }); continue; }
    if (!UUID_RE.test(docId)) { failed.push({ docId, reason: "ไม่พบเอกสาร" }); continue; }
    if (!DATE_RE.test(date)) { failed.push({ docId, reason: "รูปแบบวันที่ไม่ถูกต้อง" }); continue; }

    // อ่านค่าเดิมไว้ก่อน เพื่อเก็บลงประวัติว่าเลื่อนจากวันไหนไปวันไหน
    // ชื่อคอลัมน์เป็นค่าที่คำนวณตอนรัน → typed select ของ supabase-js อ่านไม่ออก
    // ดึงทั้งแถวแล้วหยิบเอง (แถวเดียว ไม่กระทบความเร็ว)
    const { data: before } = await admin
      .from(cfg.table).select("*").eq("id", docId).maybeSingle();
    if (!before) { failed.push({ docId, reason: "ไม่พบเอกสารในระบบ" }); continue; }

    const prev = (before as unknown as Record<string, unknown>)[cfg.dateField];
    const prevDate = prev ? String(prev).slice(0, 10) : null;
    if (prevDate === date) continue;   // ไม่เปลี่ยน — ไม่ต้องเขียน ไม่ต้องบันทึกประวัติ

    const { error } = await admin.from(cfg.table).update({ [cfg.dateField]: date }).eq("id", docId);
    if (error) { failed.push({ docId, reason: error.message }); continue; }

    moved += 1;
    audits.push({
      action: "update", entityType: cfg.table, entityId: docId,
      actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { what: "เลื่อนวันจากกระดานเงินสด", field: cfg.dateField, label: cfg.label, from: prevDate, to: date },
    });
  }

  if (audits.length) await writeAuditMany(admin, audits);
  return NextResponse.json({ data: { moved, failed } satisfies PlanResult, error: null });
}
