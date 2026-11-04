/**
 * POST /api/cashflow/manual-done — ติ๊ก "จ่ายแล้ว / รับแล้ว / ข้ามเดือนนี้" ให้รายการประจำ 1 งวด (หรือยกเลิกติ๊ก)
 * body { itemId, period: "YYYY-MM" | "once", action: "paid" | "skipped" | "undo" }
 *
 * เก็บใน china_app_settings skey "cashflow_manual_done" (ไม่มีตารางใหม่ · กติกา lib/cashflow-manual-done)
 * งวดที่ติ๊กแล้วหายจากแท็บต้องจ่าย/ต้องรับ + กราฟ (loadCashflow ข้ามให้) · ยังไม่หักยอดเงินในบัญชี
 * สิทธิ์ cashflow.manage · audit ทุกครั้ง (cashflow.manual_done)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { todayISO } from "@/lib/cashflow";
import { MANUAL_DONE_KEY, applyManualDone, cleanManualDone, isValidManualPeriod, type ManualDoneAction } from "@/lib/cashflow-manual-done";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: ManualDoneAction[] = ["paid", "skipped", "undo"];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage");
  if (denied) return denied;

  let body: { itemId?: unknown; period?: unknown; action?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const itemId = String(body.itemId ?? "");
  const period = body.period;
  const action = body.action as ManualDoneAction;
  if (!UUID_RE.test(itemId)) return NextResponse.json({ data: null, error: "ไม่พบรายการ" }, { status: 400 });
  if (!isValidManualPeriod(period)) return NextResponse.json({ data: null, error: "งวดไม่ถูกต้อง" }, { status: 400 });
  if (!ACTIONS.includes(action)) return NextResponse.json({ data: null, error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: item } = await admin.from("cashflow_manual_items").select("id, label, amount, direction").eq("id", itemId).maybeSingle();
  if (!item) return NextResponse.json({ data: null, error: "ไม่พบรายการประจำนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });

  const { data: cur, error: readErr } = await admin.from("china_app_settings").select("sval").eq("skey", MANUAL_DONE_KEY).maybeSingle();
  if (readErr) return NextResponse.json({ data: null, error: "โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  const before = cleanManualDone((cur as { sval?: unknown } | null)?.sval);
  const after = applyManualDone(before, itemId, period, action, todayISO());

  const { error } = await admin.from("china_app_settings")
    .upsert({ skey: MANUAL_DONE_KEY, sval: after, updated_at: new Date().toISOString() }, { onConflict: "skey" });
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });

  await writeAuditFor(request, admin, {
    action: "cashflow.manual_done", entityType: "cashflow_manual_items", entityId: itemId,
    metadata: { label: item.label, amount: item.amount, direction: item.direction, period, action, was: before[itemId]?.[period] ?? null },
  });
  return NextResponse.json({ data: { itemId, period, mark: after[itemId]?.[period] ?? null }, error: null });
}
