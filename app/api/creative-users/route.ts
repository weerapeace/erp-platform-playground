/**
 * Creative Users API — รายชื่อ "user จริง" (user_profiles ที่ active) สำหรับ UserPicker
 * GET /api/creative-users?search=&limit=10  → { data: [{id, code, name, email, role}] }
 * GET /api/creative-users?ids=a,b,c         → เฉพาะคนในรายการที่ยัง active (ตรวจ "เคยใช้ล่าสุด/ปักหมุด" ของ UserPicker)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  // ?ids= → คนลาออก/ปิดบัญชี (active=false) จะไม่ถูกคืน → UserPicker ตัดออกจากรายการที่จำไว้ในเครื่อง
  const idsParam = searchParams.get("ids");
  const ids = idsParam == null ? null : [...new Set(idsParam.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s)))].slice(0, 50);
  if (ids && ids.length === 0) return NextResponse.json({ data: [], error: null });

  const admin = supabaseAdmin();
  let q = admin.from("user_profiles").select("id, display_name, username, email, role").eq("active", true).order("display_name", { ascending: true }).limit(ids ? ids.length : limit);
  if (ids) q = q.in("id", ids);
  else if (search) { const t = `%${search}%`; q = q.or(`display_name.ilike.${t},email.ilike.${t},username.ilike.${t}`); }
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const items = ((data ?? []) as Array<Record<string, unknown>>).map((u) => ({
    id: String(u.id),
    code: (u.username as string) ?? null,
    name: ((u.display_name as string) || (u.username as string) || (u.email as string) || "").trim(),
    email: (u.email as string) ?? null,
    role: (u.role as string) ?? null,
  }));
  return NextResponse.json({ data: items, error: null });
}
