/**
 * ค่า UI ทั่วไป (key-value jsonb) — /api/ui-config
 * GET ?key=production_game → { value }
 * PATCH { key, value } → บันทึก (merge ทับทั้งก้อน)
 * ของกลาง: guardApi + supabaseAdmin · ตาราง ui_config(key, value jsonb) · PATCH บันทึก audit (setting_change)
 * key ขึ้นต้น "admin_" = ค่ากลางที่แอดมินเท่านั้นแก้ได้ (เช่น admin_wb_table_presets ชุดหน้าตาตารางบอร์ด) — อ่านได้ตามปกติ
 * LOGIN_READ_KEYS = อ่านได้แค่ล็อกอิน (ไม่ต้อง products.view) เช่น admin_launcher_orbit หน้าตาวงแอป · admin_launcher_theme แต่งหน้าแรกของทีม · admin_print_presets แบบหน้าพิมพ์ของทีม
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { ORBIT_TEAM_KEY } from "@/lib/app-orbit-style";
import { THEME_TEAM_KEY } from "@/lib/launcher-theme";
import { PRINT_TEAM_PRESETS_KEY } from "@/lib/list-print";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ค่ากลางที่ "ทุกคนที่ล็อกอิน" ต้องอ่านได้ (ไม่ต้องมีสิทธิ์สินค้า) — เช่น หน้าตาวงแอปหน้าแรก /apps · แก้ยังต้อง admin.users (ขึ้นต้น admin_)
const LOGIN_READ_KEYS = new Set<string>([ORBIT_TEAM_KEY, THEME_TEAM_KEY, PRINT_TEAM_PRESETS_KEY]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim();
  if (LOGIN_READ_KEYS.has(key)) {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return NextResponse.json({ value: {}, error: "unauthenticated" }, { status: 401 });
  } else {
    const denied = await guardApi(request, "products.view"); if (denied) return denied;
  }
  if (!key) return NextResponse.json({ value: {}, error: "ต้องระบุ key" }, { status: 400 });
  const { data } = await supabaseAdmin().from("ui_config").select("value").eq("key", key).maybeSingle();
  return NextResponse.json({ value: (data as { value?: Record<string, unknown> } | null)?.value ?? {}, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { key?: string; value?: Record<string, unknown> };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const key = (body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "ต้องระบุ key" }, { status: 400 });
  if (key.startsWith("admin_")) { const adminDenied = await guardApi(request, "admin.users"); if (adminDenied) return adminDenied; }
  const admin = supabaseAdmin();
  const { error } = await admin.from("ui_config")
    .upsert({ key, value: body.value ?? {}, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // ประวัติว่าใครเปลี่ยนตั้งค่าอะไร (ตั้งค่ากลาง = ต้อง audit) — จดชื่อ key ไม่จดค่าทั้งก้อน
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, { action: "setting_change", entityType: "ui_config", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { key } });
  return NextResponse.json({ ok: true, error: null });
}
