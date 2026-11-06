/**
 * GET /api/my-watches — ⭐ การเตือนของฉัน (lib/my-watches-server)
 * อ่านการเตือนที่คนนี้ตั้งไว้ (user_ui_prefs my_watches) → ใบที่ตรงเงื่อนไข · ตรวจสิทธิ์ต่อหน้า (งานออกแบบ = products.view)
 * ตั้ง/แก้การเตือน = PATCH /api/user-prefs key my_watches (ของกลาง useUserPref)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan } from "@/lib/api-auth";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { requestActor } from "@/lib/request-actor";
import { loadMyWatches } from "@/lib/my-watches-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await requestActor(supabaseFromRequest(request));
  if (!actor.id) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  try {
    const data = await loadMyWatches(supabaseAdmin(), actor.id, (perm) => apiCan(request, perm));
    return NextResponse.json({ data, error: null });
  } catch {
    return NextResponse.json({ data: { sources: {}, watches: [], unique: 0 }, error: "โหลดการเตือนของฉันไม่สำเร็จ" }, { status: 500 });
  }
}
