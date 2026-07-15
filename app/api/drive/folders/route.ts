/**
 * แม็ป ชนิดงาน (artwork_type) → โฟลเดอร์ Google Drive
 * GET    → { data:[{artwork_type,folder_id,folder_label}], configured }
 * POST   { artwork_type, folder_id } → ตรวจว่าเข้าถึงโฟลเดอร์ได้ (แชร์ให้ SA) แล้ว upsert
 * DELETE ?artwork_type=X → ล้างแม็ป
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveGetFolder } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("erp_artwork_drive_folders").select("artwork_type, folder_id, folder_label");
  return NextResponse.json({ data: data ?? [], configured: driveConfigured(), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { artwork_type?: string; folder_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const type = body.artwork_type?.trim(); const fid = body.folder_id?.trim();
  if (!type || !fid) return NextResponse.json({ error: "ต้องมี ชนิด + folder id" }, { status: 400 });

  // ตรวจว่าเข้าถึงโฟลเดอร์ได้จริง (แชร์ให้ service account แล้ว)
  let label: string | null = null;
  if (driveConfigured()) {
    const info = await driveGetFolder(fid).catch(() => null);
    if (!info) return NextResponse.json({ error: "เข้าถึงโฟลเดอร์นี้ไม่ได้ — เช็ค id ให้ถูก + แชร์โฟลเดอร์ให้ service account แล้วหรือยัง" }, { status: 400 });
    label = info.name;
  }
  const { error } = await supabaseAdmin().from("erp_artwork_drive_folders")
    .upsert({ artwork_type: type, folder_id: fid, folder_label: label, updated_at: new Date().toISOString() });
  return NextResponse.json({ folder_label: label, error: error?.message ?? null }, { status: error ? 400 : 200 });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const type = new URL(request.url).searchParams.get("artwork_type");
  if (!type) return NextResponse.json({ error: "ต้องมี artwork_type" }, { status: 400 });
  const { error } = await supabaseAdmin().from("erp_artwork_drive_folders").delete().eq("artwork_type", type);
  return NextResponse.json({ error: error?.message ?? null }, { status: error ? 400 : 200 });
}
