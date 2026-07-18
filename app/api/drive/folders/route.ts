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
import { driveConfigured, driveFindFolder, driveRenameFolder, DRIVE_ROOT_FOLDER_ID } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// หา "ชั้นชนิด" (second-to-last) ใน path → คืน {seg, before, after} เพื่อสลับชื่อชั้นนั้น (คงฐาน+ชื่องาน)
function pathTypeSegment(p: string): { seg: string; before: string; after: string } | null {
  const t = (p || "").replace(/[\\/]+$/, "");
  const lastSep = Math.max(t.lastIndexOf("\\"), t.lastIndexOf("/"));
  if (lastSep < 0) return null;
  const head = t.slice(0, lastSep);       // …\<typeSeg>
  const after = t.slice(lastSep);         // \<name>
  const sep2 = Math.max(head.lastIndexOf("\\"), head.lastIndexOf("/"));
  if (sep2 < 0) return null;              // มีแค่ base\name (ไม่มีชั้นชนิด)
  return { seg: head.slice(sep2 + 1), before: head.slice(0, sep2 + 1), after };
}

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

  const admin = supabaseAdmin();
  // อ่านค่าซับเดิมก่อน (เพื่อรู้ว่าชื่อโฟลเดอร์เดิมคืออะไร)
  const { data: prev } = await admin.from("erp_artwork_drive_folders").select("subfolder_name").eq("artwork_type", type).maybeSingle();
  const oldSub = (prev?.subfolder_name ?? "").trim();

  const { error } = await admin.from("erp_artwork_drive_folders")
    .upsert({ artwork_type: type, subfolder_name: sub || null, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const newName = sub || type;                                   // ชื่อชั้นชนิดใหม่ (ไม่ตั้ง = ชื่อชนิด)
  const oldNames = [...new Set([oldSub || type, type])].filter((n) => n && n !== newName);   // ชื่อเดิมที่อาจใช้อยู่
  let renamed = 0, pathUpdated = 0;

  if (oldNames.length) {
    // 1) rename โฟลเดอร์ชั้นชนิดใน Drive จริง (ทุกแบรนด์ + โฟลเดอร์แม่) — best-effort
    if (driveConfigured()) {
      const bases = new Set<string>([DRIVE_ROOT_FOLDER_ID]);
      const { data: bf } = await admin.from("erp_brand_drive_folders").select("folder_id");
      for (const r of (bf ?? []) as { folder_id: string | null }[]) if (r.folder_id) bases.add(String(r.folder_id));
      for (const base of bases) {
        for (const oldName of oldNames) {
          try { const id = await driveFindFolder(oldName, base); if (id && await driveRenameFolder(id, newName)) renamed++; } catch { /* ข้าม */ }
        }
      }
    }
    // 2) อัปเดต path ในเครื่อง — เฉพาะรูปที่ชั้นชนิดยังเป็นชื่อเดิม (= auto ไม่ได้แก้มือ)
    const { data: assets } = await admin.from("assets").select("id, master_path").eq("artwork_type", type).not("master_path", "is", null);
    for (const a of (assets ?? []) as { id: string; master_path: string | null }[]) {
      const seg = a.master_path ? pathTypeSegment(a.master_path) : null;
      if (seg && oldNames.includes(seg.seg)) {
        await admin.from("assets").update({ master_path: seg.before + newName + seg.after }).eq("id", a.id);
        pathUpdated++;
      }
    }
  }

  return NextResponse.json({ error: null, renamed, pathUpdated });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const type = new URL(request.url).searchParams.get("artwork_type");
  if (!type) return NextResponse.json({ error: "ต้องมี artwork_type" }, { status: 400 });
  const { error } = await supabaseAdmin().from("erp_artwork_drive_folders").delete().eq("artwork_type", type);
  return NextResponse.json({ error: error?.message ?? null }, { status: error ? 400 : 200 });
}
