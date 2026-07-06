/**
 * เลือกเพจ Facebook (กรณีเชื่อมต่อแล้วมีหลายเพจ) — /api/meta/select-page
 * POST { brand_id, page_id } → ดึง page token ของเพจที่เลือกมาเก็บถาวร (stage=connected)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { metaGetPages } from "@/lib/meta-graph";
import { getPlatformId, loadConn, saveConn, type FbConnMeta } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; page_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  const pageId = (body.page_id ?? "").trim();
  if (!brandId || !pageId) return NextResponse.json({ error: "ต้องมี brand_id + page_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const fbId = await getPlatformId(admin, "facebook");
  if (!fbId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม facebook" }, { status: 400 });
  const conn = await loadConn(admin, brandId, fbId);
  if (!conn?.token || conn.meta.stage !== "pending") return NextResponse.json({ error: "ยังไม่ได้เริ่มเชื่อมต่อ หรือหมดอายุ — กดเชื่อมต่อใหม่" }, { status: 400 });

  try {
    const pages = await metaGetPages(conn.token);   // conn.token = user token ระยะยาว
    const p = pages.find((x) => x.id === pageId);
    if (!p) return NextResponse.json({ error: "ไม่พบเพจที่เลือก (สิทธิ์อาจเปลี่ยน) — กดเชื่อมต่อใหม่" }, { status: 400 });
    const meta: FbConnMeta = { stage: "connected", page_id: p.id, page_name: p.name, ig_user_id: p.ig_user_id, has_ig: !!p.ig_user_id, connected_at: new Date().toISOString() };
    await saveConn(admin, brandId, fbId, p.access_token, meta, user?.id ?? null);
    await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, platform: "facebook", connected_page: p.name } });
    return NextResponse.json({ ok: true, page_name: p.name, error: null });
  } catch (e) {
    return NextResponse.json({ error: `ดึงข้อมูลเพจไม่สำเร็จ: ${(e as Error).message}` }, { status: 400 });
  }
}
