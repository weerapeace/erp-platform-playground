/**
 * ตัดการเชื่อมต่อ Lazada ของแบรนด์ — /api/lazada/disconnect
 * POST { brand_id } → ล้าง token + สถานะ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getPlatformId, saveLazConn } from "../shared";

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
  const lazId = await getPlatformId(admin, "lazada");
  if (!lazId) return NextResponse.json({ error: "ไม่พบแพลตฟอร์ม lazada" }, { status: 400 });
  await saveLazConn(admin, brandId, lazId, null, null, { stage: "disconnected" }, user?.id ?? null);
  await writeAudit(admin, { action: "update", entityType: "platform_credential", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { brand_id: brandId, platform: "lazada", disconnected: true } });
  return NextResponse.json({ ok: true, error: null });
}
