/**
 * ตัดการเชื่อมต่อ Facebook/Instagram ของแบรนด์ — /api/meta/disconnect
 * POST { brand_id } → ล้าง token + สถานะ (ลบ connection ของแบรนด์ × facebook)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getPlatformId, saveConn } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.manage_accounts"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brandId = (body.brand_id ?? "").trim();
  if (!brandId) return NextResponse.json({ error: "ต้องมี brand_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const fbId = await getPlatformId(admin, "facebook");
  if (!fbId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม facebook" }, { status: 400 });
  await saveConn(admin, brandId, fbId, null, { stage: "disconnected" }, user?.id ?? null);
  await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, platform: "facebook", disconnected: true } });
  return NextResponse.json({ ok: true, error: null });
}
