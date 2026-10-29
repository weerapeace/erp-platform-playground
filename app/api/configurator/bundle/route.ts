/**
 * ตัวประกอบสินค้า — ข้อมูลครบ 1 ทรง (ทรง ช่อง ตัวเลือก ชั้นรูป รูป กติกา) ให้สตูดิโอโหลดครั้งเดียว
 * GET /api/configurator/bundle?model_id=<id>   → { data: ConfigData }
 * สิทธิ์ configurator.view
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { loadBundle } from "../_data";
import { VIEW_PERM } from "../_resources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const modelId = new URL(request.url).searchParams.get("model_id")?.trim();
  if (!modelId) return NextResponse.json({ data: null, error: "ต้องระบุทรง (model_id)" }, { status: 400 });
  const { data, error } = await loadBundle(supabaseAdmin(), modelId);
  if (error || !data) {
    const missing = !error || error.startsWith("ไม่พบ");
    return NextResponse.json({ data: null, error: missing ? (error ?? "ไม่พบทรงนี้") : friendlyDbError(error) }, { status: missing ? 404 : 500 });
  }
  return NextResponse.json({ data, error: null });
}
