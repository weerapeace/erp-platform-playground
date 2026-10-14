/**
 * Design Sheets — รอบเสนอราคา (เฟส 3)
 *
 * GET  /api/design-sheets/[id]/quotes → list เรียงตามครั้งที่
 * POST /api/design-sheets/[id]/quotes → เพิ่มรอบ (ครั้งที่ = ล่าสุด+1 อัตโนมัติ) { quote_date, price, status, note }
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";
import { QUOTE_STATUSES } from "./shared";

import { summarizeCostChanges, type SnapExtraMap, type SnapLine } from "@/lib/design-sheet-cost-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DesignSheetQuote = {
  id: string; sheet_id: string; round: number;
  quote_date: string | null; price: number | null; offered_price: number | null; status: string; note: string | null;
  parent_code: string | null;   // ไซส์/แท็บที่เสนอราคา ("" = ทั่วไป · null = รอบเก่าไม่ระบุ)
  qty: number | null;           // จำนวนที่ราคานี้ใช้ (ราคาขั้นบันได) · null = ไม่ระบุ
  batch?: number | null;              // "ครั้งที่" จริง (1 ครั้ง = หลายไซส์ × หลายขั้นจำนวน; แถวนี้ = 1 ช่อง) · null = แถวเก่าก่อนมี batch
  cost_snapshot_id?: string | null;   // เวอร์ชันตีราคาที่ใช้ตอนเสนอรอบนี้ (null = รอบเก่าก่อนมีเวอร์ชัน)
  /** ต้นทุนเปลี่ยนอะไรจากรอบก่อน (ไซส์เดียวกัน) — คำนวณฝั่งเซิร์ฟเวอร์จากเวอร์ชันตีราคา · null = ไม่มีรอบก่อนที่เทียบได้ */
  changes?: { text: string; total_diff: number; prev_round: number; prev_snapshot_id: string; snapshot_id: string } | null;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("design_sheet_quotes").select("*")
    .eq("sheet_id", id).order("round", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  const quotes = (data ?? []) as DesignSheetQuote[];

  // "อะไรเปลี่ยนจากรอบก่อน": เทียบเวอร์ชันตีราคาของรอบนี้กับรอบก่อนหน้า (ไซส์เดียวกัน) — รอบเก่าที่ไม่มีเวอร์ชัน = null
  const snapIds = [...new Set(quotes.map((q) => q.cost_snapshot_id).filter((x): x is string => !!x))];
  if (snapIds.length) {
    const { data: snaps } = await admin.from("design_sheet_cost_snapshots").select("id, lines, cost_extra").in("id", snapIds);
    const byId = new Map((snaps ?? []).map((s) => [s.id as string, { lines: (s.lines ?? []) as SnapLine[], extra: (s.cost_extra ?? {}) as SnapExtraMap }]));
    // "ครั้งก่อน" = batch ก่อนหน้า (ช่องแรกของไซส์เดียวกันที่มีเวอร์ชัน) — ช่องอื่นในครั้งเดียวกันไม่นับเป็นครั้งก่อน
    const bOf = (q: DesignSheetQuote) => q.batch ?? q.round;
    for (const q of quotes) {
      q.changes = null;
      if (!q.cost_snapshot_id || !byId.has(q.cost_snapshot_id)) continue;
      const key = q.parent_code ?? "";
      const prev = quotes.filter((p) => (p.parent_code ?? "") === key && bOf(p) < bOf(q) && p.cost_snapshot_id && byId.has(p.cost_snapshot_id)).sort((a, b) => bOf(b) - bOf(a))[0];
      if (!prev?.cost_snapshot_id) continue;
      const s = summarizeCostChanges(byId.get(prev.cost_snapshot_id)!, byId.get(q.cost_snapshot_id)!, key);
      q.changes = { text: s.text, total_diff: s.total_diff, prev_round: prev.batch ?? prev.round, prev_snapshot_id: prev.cost_snapshot_id, snapshot_id: q.cost_snapshot_id };
    }
  }
  return NextResponse.json({ data: quotes, error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { quote_date?: string; price?: number; offered_price?: number; status?: string; note?: string; parent_code?: string | null; qty?: number | null; cost_snapshot_id?: string | null; batch?: number | null };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const price = body.price != null ? Number(body.price) : null;
  const offered = body.offered_price != null ? Number(body.offered_price) : null;
  for (const v of [price, offered]) if (v != null && (!Number.isFinite(v) || v < 0)) {
    return NextResponse.json({ error: "ราคาต้องเป็นตัวเลขและไม่ติดลบ" }, { status: 400 });
  }
  const qty = body.qty != null && String(body.qty) !== "" ? Number(body.qty) : null;
  if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
    return NextResponse.json({ error: "จำนวนต้องเป็นตัวเลขมากกว่า 0" }, { status: 400 });
  }
  const status = body.status && (QUOTE_STATUSES as readonly string[]).includes(body.status) ? body.status : "pending";

  const admin = supabaseAdmin();
  // ครั้งที่ = ล่าสุด + 1
  const { data: last } = await admin.from("design_sheet_quotes").select("round")
    .eq("sheet_id", id).order("round", { ascending: false }).limit(1);
  const round = ((last?.[0]?.round as number | undefined) ?? 0) + 1;
  // ครั้งที่ (batch): ส่งมา = เพิ่มช่องเข้าครั้งนั้น · ไม่ส่ง = เปิดครั้งใหม่ (ล่าสุด + 1)
  let batch = body.batch != null && Number.isFinite(Number(body.batch)) ? Number(body.batch) : null;
  if (batch == null) {
    const { data: lb } = await admin.from("design_sheet_quotes").select("batch").eq("sheet_id", id).order("batch", { ascending: false, nullsFirst: false }).limit(1);
    batch = ((lb?.[0]?.batch as number | null) ?? 0) + 1;
  }

  // ผูกรอบนี้กับเวอร์ชันตีราคาล่าสุดของใบ (หน้าจอบันทึกตีราคาก่อนเพิ่มรอบแล้ว) — ไม่มีเวอร์ชัน = null
  let costSnapshotId: string | null = body.cost_snapshot_id ?? null;
  if (!costSnapshotId) {
    const { data: latest } = await admin.from("design_sheet_cost_snapshots").select("id").eq("sheet_id", id).order("taken_at", { ascending: false }).limit(1).maybeSingle();
    costSnapshotId = (latest?.id as string | undefined) ?? null;
  }
  const { data: row, error } = await admin.from("design_sheet_quotes").insert({
    sheet_id: id, round, quote_date: body.quote_date || new Date().toISOString().slice(0, 10),
    price, offered_price: offered, qty, status, note: body.note?.trim() || null, created_by: user?.id ?? null,
    parent_code: body.parent_code == null ? null : String(body.parent_code),   // ไซส์ที่เสนอ ("" = ทั่วไป)
    cost_snapshot_id: costSnapshotId, batch,
  }).select("id, round").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "quote_add", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { quote_id: row.id, round, price, offered_price: offered, qty, status },
  });
  return NextResponse.json({ id: row.id, round, batch, error: null });
}
