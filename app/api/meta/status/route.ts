/**
 * สถานะการเชื่อมต่อ Meta ของแบรนด์ — /api/meta/status?brand_id=...
 * GET → { configured, facebook: { connected, stage, page_name, pages?, problem }, instagram: { connected } }
 *   ?check=1 → ลองเรียก Meta จริงว่า token ยังใช้ได้ไหม → facebook.problem = ข้อความภาษาคน (null = ใช้ได้)
 *             เช่น บัญชี Facebook ที่กดเชื่อม ติดด่านตรวจสอบ / token หมดอายุ — เจอก่อนกดโพสต์ ไม่ต้องรอพัง
 * ไม่คืน token · ใช้ทั้งหน้า platform-accounts และหน้าคอนเทนต์ (รู้ว่ากดโพสต์จริงได้ไหม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { metaConfigured, metaCheckToken } from "@/lib/meta-graph";
import { friendlyMetaError } from "@/lib/social-publish/rules";
import { getPlatformId, loadConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const out = {
    configured: metaConfigured(),
    facebook: { connected: false, stage: "none" as string, page_name: null as string | null, pages: [] as { id: string; name: string; ig: boolean }[], problem: null as string | null },
    instagram: { connected: false, ig_publish_enabled: false },
    error: null as string | null,
  };
  if (!brandId) return NextResponse.json(out);

  const admin = supabaseAdmin();
  const fbId = await getPlatformId(admin, "facebook");
  if (fbId) {
    const conn = await loadConn(admin, brandId, fbId);
    const m = conn?.meta ?? {};
    out.facebook.stage = m.stage ?? "none";
    out.facebook.connected = m.stage === "connected" && !!conn?.token;
    out.facebook.page_name = m.page_name ?? null;
    out.facebook.pages = m.stage === "pending" ? (m.pages ?? []) : [];
    // IG ใช้ connection เดียวกับเพจ (token + ig_user_id)
    out.instagram.connected = out.facebook.connected && !!m.has_ig;
    if (out.facebook.connected && conn?.token && new URL(request.url).searchParams.get("check") === "1") {
      const bad = await metaCheckToken(conn.token);
      if (bad) out.facebook.problem = friendlyMetaError("facebook", bad.message, bad.code, bad.subcode);
    }
  }
  return NextResponse.json(out);
}
