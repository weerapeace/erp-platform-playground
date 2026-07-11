/**
 * POST /api/od-statement/import
 * นำเข้ารายการเดินบัญชี OD → กันรายการซ้ำ (fingerprint) → คิดยอดใช้รายวัน (od_recompute)
 * body: { facility_id, rows: [{ date, description, money_in, money_out, balance }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { date?: string; description?: string; money_in?: number; money_out?: number; balance?: number };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "od_statements.import");
  if (denied) return denied;

  let body: { facility_id?: string; rows?: Row[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const facility_id = typeof body.facility_id === "string" ? body.facility_id : "";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!facility_id) return NextResponse.json({ error: "กรุณาเลือกวงเงิน OD" }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลนำเข้า" }, { status: 400 });

  const admin = supabaseAdmin();
  const batchId = randomUUID();

  // fingerprint กันซ้ำ
  const norm = (r: Row) => `${facility_id}|${r.date ?? ""}|${Number(r.money_in) || 0}|${Number(r.money_out) || 0}|${Number(r.balance) || 0}|${(r.description ?? "").trim()}`;

  const { data: existing } = await admin.from("od_transactions").select("source_fingerprint").eq("od_facility_id", facility_id);
  const seen = new Set((existing ?? []).map((e) => e.source_fingerprint as string));

  const toInsert = rows
    .filter((r) => r.date)
    .map((r) => ({
      od_facility_id: facility_id,
      transaction_date: r.date,
      description: (r.description ?? "").trim(),
      money_in: Number(r.money_in) || 0,
      money_out: Number(r.money_out) || 0,
      balance_after: Number(r.balance) || 0,
      source_fingerprint: norm(r),
      import_batch_id: batchId,
    }))
    .filter((r) => !seen.has(r.source_fingerprint));

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error } = await admin.from("od_transactions").insert(toInsert);
    if (error) return NextResponse.json({ error: "นำเข้าไม่สำเร็จ: " + error.message }, { status: 500 });
    inserted = toInsert.length;
  }

  const { error: recErr } = await admin.rpc("od_recompute", { p_id: facility_id });
  if (recErr) return NextResponse.json({ error: "คำนวณยอดไม่สำเร็จ: " + recErr.message }, { status: 500 });

  await writeAudit(admin, {
    action: "od_statement.import",
    entityType: "od_facilities",
    entityId: facility_id,
    metadata: { inserted, skipped: rows.length - inserted, batch: batchId },
  });

  return NextResponse.json({ inserted, skipped: rows.length - inserted, total: rows.length, error: null });
}
