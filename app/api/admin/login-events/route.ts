/**
 * GET /api/admin/login-events — แอดมินดูว่า "ใครเข้าแอปไหน จากที่ไหน เมื่อไหร่"
 *   ?limit=200 &user_id= &app_key= &new_device=1
 * ต้องมีสิทธิ์ admin.users (หน้าเดียวกับผู้ใช้ระบบ)
 *
 * ต่างจาก GET /api/auth/login-event ตรงที่อันนั้นเห็นเฉพาะของตัวเอง (RLS)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { data: can, error: permErr } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (permErr) return NextResponse.json({ data: [], error: permErr.message }, { status: 500 });
  if (can !== true) return NextResponse.json({ data: [], error: "ไม่มีสิทธิ์ (admin.users)" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 200), 1), 500);
  const admin = supabaseAdmin();

  let q = admin.from("user_login_events")
    .select("id, user_id, created_at, app_key, path, device_id, browser, os, device_type, ip, city, region, country, is_new_device")
    .order("created_at", { ascending: false }).limit(limit);
  const userId = (sp.get("user_id") ?? "").trim();
  const appKey = (sp.get("app_key") ?? "").trim();
  if (userId) q = q.eq("user_id", userId);
  if (appKey) q = q.eq("app_key", appKey);
  if (sp.get("new_device") === "1") q = q.eq("is_new_device", true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const rows = data ?? [];
  // เติมชื่อผู้ใช้ให้อ่านออก (ตารางเก็บแค่ user_id)
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const nameById = new Map<string, { name: string; email: string }>();
  if (ids.length) {
    const { data: profs } = await admin.from("user_profiles").select("id, display_name, email").in("id", ids);
    for (const p of (profs ?? []) as { id: string; display_name: string | null; email: string | null }[]) {
      nameById.set(p.id, { name: p.display_name ?? p.email ?? "", email: p.email ?? "" });
    }
  }
  return NextResponse.json({
    data: rows.map((r) => ({ ...r, user_name: nameById.get(r.user_id as string)?.name ?? "", user_email: nameById.get(r.user_id as string)?.email ?? "" })),
    error: null,
  });
}
