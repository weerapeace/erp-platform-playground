/**
 * POST /api/loan-schedule/manual
 * บันทึกตารางผ่อนที่ "กรอกยอดเอง" — สำหรับสัญญาที่ตารางจริงของธนาคาร
 * เงินต้น/ดอกเบี้ยไม่เท่ากันทุกงวด (สูตรอัตโนมัติคิดไม่ตรง)
 *
 * body: {
 *   version_id,
 *   mode?: "patch" | "replace",     // ไม่ส่ง = patch
 *   rows: [{ id?, due_date?, principal_due?, interest_due?, fee_due?, penalty_due? }],
 *   reason?
 * }
 *
 *   patch   = แก้เฉพาะงวดที่ส่งมา (ต้องมี id ทุกแถว)         → loan_schedule_apply_manual()
 *   replace = กำหนดงวด "ทั้งชุด" ตามลำดับในอาร์เรย์           → loan_schedule_set_rows()
 *             แถวไม่มี id = งวดใหม่ · งวดเดิมที่ไม่ได้ส่ง = ลบ
 *             ใช้กับปุ่มเพิ่ม/ลบงวด และการวางตารางจาก Excel ทั้งใบ
 *
 * ทั้งสองทางจบด้วยการคิดยอดต่อเนื่องใหม่ทั้งตาราง แล้วตัดยอดการจ่ายใหม่
 * จากใบจ่ายทั้งหมด (rebuild-from-source)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUM_KEYS = ["principal_due", "interest_due", "fee_due", "penalty_due"] as const;

type RowIn = Record<string, unknown>;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_schedules.edit");
  if (denied) return denied;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: { version_id?: string; rows?: RowIn[]; reason?: string; mode?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const version_id = typeof body.version_id === "string" ? body.version_id : "";
  if (!UUID_RE.test(version_id)) return NextResponse.json({ error: "ไม่พบตารางผ่อน" }, { status: 400 });

  const replace = body.mode === "replace";

  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  if (rawRows.length === 0) return NextResponse.json({ error: replace ? "ต้องมีอย่างน้อย 1 งวด" : "ไม่มีงวดที่แก้ไข" }, { status: 400 });
  if (rawRows.length > 600) return NextResponse.json({ error: "จำนวนงวดต้องไม่เกิน 600 งวด" }, { status: 400 });

  // รับเฉพาะคีย์ที่อนุญาต + ตรวจชนิดค่า (ไม่ส่งของแปลกเข้า DB)
  const rows: RowIn[] = [];
  for (const r of rawRows) {
    const id = typeof r?.id === "string" ? r.id : "";
    // patch ต้องมี id เสมอ · replace ไม่มี id = งวดใหม่
    if (id !== "" && !UUID_RE.test(id)) return NextResponse.json({ error: "รหัสงวดไม่ถูกต้อง" }, { status: 400 });
    if (!replace && id === "") return NextResponse.json({ error: "รหัสงวดไม่ถูกต้อง" }, { status: 400 });

    const out: RowIn = {};
    if (id !== "") out.id = id;
    for (const k of NUM_KEYS) {
      if (r[k] === undefined) continue;
      const n = Number(r[k]);
      if (!isFinite(n) || n < 0) return NextResponse.json({ error: "จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ" }, { status: 400 });
      out[k] = Math.round(n * 100) / 100;
    }
    if (r.due_date !== undefined) {
      const d = r.due_date == null ? "" : String(r.due_date);
      if (d !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return NextResponse.json({ error: "รูปแบบวันครบกำหนดไม่ถูกต้อง" }, { status: 400 });
      out.due_date = d;
    }
    rows.push(out);
  }

  const admin = supabaseAdmin();
  const reason = typeof body.reason === "string" ? body.reason : "";

  const { data, error } = replace
    ? await admin.rpc("loan_schedule_set_rows", { p_version_id: version_id, p_rows: rows, p_reason: reason })
    : await admin.rpc("loan_schedule_apply_manual", { p_version_id: version_id, p_rows: rows, p_reason: reason });

  if (error) return NextResponse.json({ error: "บันทึกยอดผ่อนไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: replace ? "loan_schedule.set_rows" : "loan_schedule.manual_edit",
    entityType: "loan_schedule_versions",
    entityId: version_id,
    actorId: user?.id,
    metadata: { mode: replace ? "replace" : "patch", rows: rows.length, result: data },
  });

  return NextResponse.json({ result: data, changed: typeof data === "number" ? data : undefined, error: null });
}
