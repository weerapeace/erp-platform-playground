/**
 * POST /api/assets/drive-folders/rename — เปลี่ยนชื่อโฟลเดอร์ Drive + อัปเดต path ของ "ทุกรูปที่ใช้โฟลเดอร์นี้"
 *   body { folder_url?: string, folder_id?: string, new_name: string }
 *   - เปลี่ยนชื่อโฟลเดอร์จริงใน Drive
 *   - หา asset ทุกตัวที่ master_url ชี้โฟลเดอร์นี้ → แทนชั้นสุดท้ายของ master_path ด้วยชื่อใหม่
 *   → { count, folderId }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured, driveRenameFolder, parseDriveFolderId } from "@/lib/google-drive";
import { actorId } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/** แทน "ชั้นสุดท้าย" ของ path ด้วยชื่อใหม่ (…\02_Artwork\เดิม → …\02_Artwork\ใหม่) */
function renameLastSegment(p: string, newName: string): string {
  const t = (p || "").replace(/[\\/]+$/, "");
  if (!t) return t;
  const i = Math.max(t.lastIndexOf("\\"), t.lastIndexOf("/"));
  return i < 0 ? newName : t.slice(0, i + 1) + newName;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.edit"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { folder_url?: string; folder_id?: string; new_name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const folderId = (body.folder_id ?? "").trim() || parseDriveFolderId(body.folder_url ?? "") || "";
  const newName = String(body.new_name ?? "").trim();
  if (!folderId) return NextResponse.json({ error: "ไม่พบโฟลเดอร์ Drive ของรูปนี้" }, { status: 400 });
  if (!newName) return NextResponse.json({ error: "ต้องใส่ชื่อใหม่" }, { status: 400 });
  if (/[\\/]/.test(newName)) return NextResponse.json({ error: "ชื่อโฟลเดอร์ห้ามมี \\ หรือ /" }, { status: 400 });

  const admin = supabaseAdmin();
  try {
    const ok = await driveRenameFolder(folderId, newName);
    if (!ok) return NextResponse.json({ error: "เปลี่ยนชื่อใน Drive ไม่สำเร็จ — เช็คสิทธิ์ service account" }, { status: 400 });

    // อัปเดต path ของทุกรูปที่ใช้โฟลเดอร์นี้
    const { data } = await admin.from("assets").select("id, master_path").like("master_url", `%${folderId}%`);
    let count = 0;
    for (const a of (data ?? []) as { id: string; master_path: string | null }[]) {
      count++;
      if (!a.master_path) continue;   // ไม่มี path ก็ยังนับ (อยู่โฟลเดอร์นี้เหมือนกัน)
      const next = renameLastSegment(a.master_path, newName);
      if (next !== a.master_path) await admin.from("assets").update({ master_path: next }).eq("id", a.id);
    }

    await writeAudit(admin, { action: "update", entityType: "asset", actorId: await actorId(request), metadata: { drive_folder_rename: { folderId, newName, count } } });
    return NextResponse.json({ count, folderId, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}
