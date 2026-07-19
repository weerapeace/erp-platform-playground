/**
 * แม็ป แบรนด์ → โฟลเดอร์ฐานใน Google Drive
 * GET    → { data:[{brand_id,folder_id,folder_label}], configured }
 * POST   { brand_id, folder_id } → ตรวจว่าเข้าถึงได้ (แชร์ให้ SA) แล้ว upsert
 * DELETE ?brand_id=X
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveGetFolder } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const stripTrail = (s: string) => s.replace(/[\\/]+$/, "");
const startsWithDir = (p: string, base: string) => p === base || p.startsWith(base + "\\") || p.startsWith(base + "/");

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  const { data } = await supabaseAdmin().from("erp_brand_drive_folders").select("brand_id, folder_id, folder_label, local_base_path");
  return NextResponse.json({ data: data ?? [], configured: driveConfigured(), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { brand_id?: string; folder_id?: string; local_base_path?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand = body.brand_id?.trim();
  const fid = (body.folder_id ?? "").trim();
  const lbp = (body.local_base_path ?? "").trim();   // path ในเครื่อง (Google Drive Desktop) — ไม่ตรวจ ใส่ตามที่กรอก
  if (!brand) return NextResponse.json({ error: "ต้องมี แบรนด์" }, { status: 400 });
  if (!fid && !lbp) return NextResponse.json({ error: "ต้องมี folder id หรือ path ในเครื่อง อย่างน้อย 1 อย่าง" }, { status: 400 });
  const admin = supabaseAdmin();
  // อ่านฐาน path เดิมก่อน (ไว้ไล่แก้ path รูปเมื่อฐานเปลี่ยน)
  const { data: prev } = await admin.from("erp_brand_drive_folders").select("local_base_path").eq("brand_id", brand).maybeSingle();
  const oldBase = stripTrail((prev?.local_base_path ?? "").trim());

  let label: string | null = null;
  if (fid && driveConfigured()) {
    const info = await driveGetFolder(fid).catch(() => null);
    if (!info) return NextResponse.json({ error: "เข้าถึงโฟลเดอร์นี้ไม่ได้ — เช็ค id + แชร์ให้ service account แล้วหรือยัง" }, { status: 400 });
    label = info.name;
  }
  const { error } = await admin.from("erp_brand_drive_folders")
    .upsert({ brand_id: brand, folder_id: fid || null, folder_label: label, local_base_path: lbp || null, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ฐาน path เปลี่ยน → ไล่แก้ path ของรูปแบรนด์นี้ที่ยัง "auto" (ขึ้นต้นด้วยฐานเดิม) แทนฐานเดิม → ฐานใหม่ (คงส่วน \ชนิด\ชื่องาน)
  const newBase = stripTrail(lbp);
  let pathUpdated = 0;
  if (newBase && oldBase && newBase !== oldBase) {
    const grow = startsWithDir(newBase, oldBase);   // ฐานใหม่ยาวกว่า (เดิมเป็นส่วนต้น) → กันแก้ซ้ำ
    const { data: assets } = await admin.from("assets").select("id, master_path").eq("brand_id", brand).not("master_path", "is", null);
    for (const a of (assets ?? []) as { id: string; master_path: string }[]) {
      const p = a.master_path;
      if (!startsWithDir(p, oldBase)) continue;              // ไม่ได้ใช้ฐานเดิม = แก้มือ → ข้าม
      if (grow && startsWithDir(p, newBase)) continue;       // แก้ไปแล้ว → ข้าม (idempotent)
      const next = newBase + p.slice(oldBase.length);
      if (next !== p) { await admin.from("assets").update({ master_path: next }).eq("id", a.id); pathUpdated++; }
    }
  }

  return NextResponse.json({ folder_label: label, pathUpdated, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const brand = new URL(request.url).searchParams.get("brand_id");
  if (!brand) return NextResponse.json({ error: "ต้องมี brand_id" }, { status: 400 });
  const { error } = await supabaseAdmin().from("erp_brand_drive_folders").delete().eq("brand_id", brand);
  return NextResponse.json({ error: error?.message ?? null }, { status: error ? 400 : 200 });
}
