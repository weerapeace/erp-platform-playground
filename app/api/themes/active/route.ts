/**
 * ธีมที่ใช้อยู่ (ธีมกลาง ERP เฟส 3) — ทุกคนที่ล็อกอินอ่านได้ (เชลล์ใช้ทาสีหน้าจริง)
 * GET /api/themes/active → { company: {theme_id, config} | null, apps: { [appKey]: {theme_id, config} } }
 *   ส่งเฉพาะฉบับเผยแพร่ของธีมที่ไม่อยู่ในถังขยะ · ไม่มีการกำหนด = ว่าง (หน้าตาเดิม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { normalizeThemeConfig } from "@/lib/erp-theme-config";
import { COMPANY_SCOPE, appKeyOfScope, type ActiveThemes } from "@/lib/erp-theme-assign";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: rows, error } = await admin.from("erp_theme_assignments").select("scope, theme_id");
  if (error) return NextResponse.json({ error: "โหลดธีมไม่สำเร็จ", details: error.message }, { status: 500 });
  const out: ActiveThemes = { company: null, apps: {} };
  const ids = [...new Set((rows ?? []).map((r) => r.theme_id as string))];
  if (ids.length) {
    const { data: themes } = await admin.from("erp_themes").select("id, published_config, deleted_at").in("id", ids);
    const live = new Map((themes ?? []).filter((t) => t.published_config && !t.deleted_at).map((t) => [t.id as string, normalizeThemeConfig(t.published_config)]));
    for (const r of rows ?? []) {
      const cfg = live.get(r.theme_id as string);
      if (!cfg) continue;
      if (r.scope === COMPANY_SCOPE) out.company = { theme_id: r.theme_id as string, config: cfg };
      else { const k = appKeyOfScope(r.scope as string); if (k) out.apps[k] = { theme_id: r.theme_id as string, config: cfg }; }
    }
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "private, max-age=30" } });
}
