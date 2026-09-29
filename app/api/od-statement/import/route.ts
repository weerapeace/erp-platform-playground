/**
 * POST /api/od-statement/import
 * นำเข้ารายการเดินบัญชี OD → กันรายการซ้ำ (fingerprint) → คิดยอดใช้รายวัน (od_recompute)
 * body: { facility_id, rows: [{ date, description, money_in, money_out, balance }] }
 *
 * GET    ?facility_id=            → ประวัติการนำเข้า (แต่ละรอบ: กี่รายการ ช่วงวันที่ นำเข้าเมื่อไหร่)
 * DELETE ?facility_id=&batch_id=  → ยกเลิกการนำเข้ารอบนั้น (นำเข้าผิดไฟล์/ผิดวงเงิน) แล้วคิดยอดใหม่
 *        ไม่ลบจริง — ปิดรายการ (is_active=false) เก็บไว้เป็นหลักฐาน · นำเข้าไฟล์เดิมซ้ำได้
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
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
    .filter((r) => { if (seen.has(r.source_fingerprint)) return false; seen.add(r.source_fingerprint); return true; });   // กันซ้ำทั้งกับของเดิมและในไฟล์เดียวกัน

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

export type OdImportBatch = { batch_id: string; count: number; date_from: string; date_to: string; money_in: number; money_out: number; imported_at: string };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "od_statements.import");
  if (denied) return denied;
  const facility_id = new URL(request.url).searchParams.get("facility_id") ?? "";
  if (!facility_id) return NextResponse.json({ data: [], error: null });

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("od_transactions")
    .select("import_batch_id, transaction_date, money_in, money_out, created_at")
    .eq("od_facility_id", facility_id).eq("is_active", true).not("import_batch_id", "is", null)
    .order("created_at", { ascending: false }).limit(5000);
  if (error) return NextResponse.json({ data: [], error: "โหลดประวัติการนำเข้าไม่สำเร็จ" }, { status: 500 });

  const map = new Map<string, OdImportBatch>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = String(r.import_batch_id);
    const d = String(r.transaction_date ?? "");
    const b = map.get(id) ?? { batch_id: id, count: 0, date_from: d, date_to: d, money_in: 0, money_out: 0, imported_at: String(r.created_at ?? "") };
    b.count += 1;
    if (d && d < b.date_from) b.date_from = d;
    if (d && d > b.date_to) b.date_to = d;
    b.money_in += Number(r.money_in) || 0;
    b.money_out += Number(r.money_out) || 0;
    if (String(r.created_at ?? "") < b.imported_at) b.imported_at = String(r.created_at ?? "");
    map.set(id, b);
  }
  const list = [...map.values()].sort((a, b) => (a.imported_at < b.imported_at ? 1 : -1));
  return NextResponse.json({ data: list, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "od_statements.import");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const facility_id = sp.get("facility_id") ?? "";
  const batch_id = sp.get("batch_id") ?? "";
  if (!facility_id || !batch_id) return NextResponse.json({ error: "ต้องระบุวงเงินและรอบที่จะยกเลิก" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: rows, error } = await admin.from("od_transactions").select("*")
    .eq("od_facility_id", facility_id).eq("import_batch_id", batch_id).eq("is_active", true);
  if (error) return NextResponse.json({ error: "โหลดรายการไม่สำเร็จ: " + error.message }, { status: 500 });
  const list = (rows ?? []) as Record<string, unknown>[];
  if (list.length === 0) return NextResponse.json({ error: "ไม่พบรายการของรอบนี้ (อาจถูกยกเลิกไปแล้ว)" }, { status: 404 });

  // ปิดรายการ + เปลี่ยนรหัสกันซ้ำ → นำเข้าไฟล์เดิมใหม่ได้ (รหัสกันซ้ำห้ามซ้ำกันในวงเงินเดียว)
  const stamp = Date.now();
  const { error: upErr } = await admin.from("od_transactions")
    .upsert(list.map((r) => ({ ...r, is_active: false, source_fingerprint: `${String(r.source_fingerprint ?? "")}|undo:${stamp}` })), { onConflict: "id" });
  if (upErr) return NextResponse.json({ error: "ยกเลิกไม่สำเร็จ: " + upErr.message }, { status: 500 });

  const { error: recErr } = await admin.rpc("od_recompute", { p_id: facility_id });
  if (recErr) return NextResponse.json({ error: "ยกเลิกแล้ว แต่คำนวณยอดใหม่ไม่สำเร็จ: " + recErr.message }, { status: 500 });

  const dates = list.map((r) => String(r.transaction_date ?? "")).filter(Boolean).sort();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "od_statement.import_undo", entityType: "od_facilities", entityId: facility_id,
    actorId: user?.id ?? null, actorName: (user?.user_metadata?.name as string) || user?.email || null,
    metadata: { batch: batch_id, removed: list.length, date_from: dates[0] ?? null, date_to: dates[dates.length - 1] ?? null },
  });
  return NextResponse.json({ removed: list.length, error: null });
}
