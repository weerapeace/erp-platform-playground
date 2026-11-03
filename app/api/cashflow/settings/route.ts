/**
 * ค่าตั้งกระแสเงินสดที่ใช้ร่วมทั้งระบบ — เงินกันขั้นต่ำ + แจ้งเตือนเงินจะขาด (lib/cashflow-settings)
 *   GET              → ค่าปัจจุบัน (cashflow.view)
 *   PATCH {…บางช่อง} → บันทึก (cashflow.manage · audit cashflow.settings_update)
 * เก็บที่ china_app_settings skey "cashflow_settings" (ที่เก็บค่าตั้งกลาง key/value) — ไม่มีตารางใหม่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { CASHFLOW_SETTINGS_KEY, cleanCashflowSettings } from "@/lib/cashflow-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function read(admin: ReturnType<typeof supabaseAdmin>) {
  const { data } = await admin.from("china_app_settings").select("sval").eq("skey", CASHFLOW_SETTINGS_KEY).maybeSingle();
  return cleanCashflowSettings((data as { sval?: unknown } | null)?.sval);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.view"); if (denied) return denied;
  return NextResponse.json({ data: await read(supabaseAdmin()), error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "cashflow.manage"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const before = await read(admin);
  const after = cleanCashflowSettings({ ...before, ...body });
  const { error } = await admin.from("china_app_settings")
    .upsert({ skey: CASHFLOW_SETTINGS_KEY, sval: after, updated_at: new Date().toISOString() }, { onConflict: "skey" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  await writeAuditFor(request, admin, { action: "cashflow.settings_update", entityType: "cashflow_settings", entityId: null, metadata: { before, after } });
  return NextResponse.json({ data: after, error: null });
}
