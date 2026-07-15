/**
 * แม็ป ชนิดงาน (artwork_type) → ชื่อ "ซับโฟลเดอร์" ใต้โฟลเดอร์แบรนด์ (เช่น โลโก้ → "01_Logo")
 * ไม่ตั้ง = ใช้ชื่อชนิดเป็นชื่อซับ
 * GET    → { data:[{artwork_type,subfolder_name}] }
 * POST   { artwork_type, subfolder_name }
 * DELETE ?artwork_type=X
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("erp_artwork_drive_folders").select("artwork_type, subfolder_name");
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { artwork_type?: string; subfolder_name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const type = body.artwork_type?.trim(); const sub = (body.subfolder_name ?? "").trim();
  if (!type) return NextResponse.json({ error: "ต้องมี ชนิด" }, { status: 400 });
  const { error } = await supabaseAdmin().from("erp_artwork_drive_folders")
    .upsert({ artwork_type: type, subfolder_name: sub || null, updated_at: new Date().toISOString() });
  return NextResponse.json({ error: error?.message ?? null }, { status: error ? 400 : 200 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const type = new URL(request.url).searchParams.get("artwork_type");
  if (!type) return NextResponse.json({ error: "ต้องมี artwork_type" }, { status: 400 });
  const { error } = await supabaseAdmin().from("erp_artwork_drive_folders").delete().eq("artwork_type", type);
  return NextResponse.json({ error: error?.message ?? null }, { status: error ? 400 : 200 });
}
