/**
 * /api/nesting-jobs/drive-root — โฟลเดอร์ "ไฟล์ส่งร้านพิมพ์" ของหน้าต่างส่งเข้าคลังงานพิมพ์
 *   GET ?folder=<id หรือลิงก์ Drive>  → { configured, default: { id, name, url, found, can_write }, folder: { id, name, url, can_write } | null, can_set_default, service_email }
 *       can_write = บัญชีระบบสร้างโฟลเดอร์ข้างในได้ (แชร์ให้แค่ดู = false → ต้องแชร์ให้ service_email เป็นผู้จัดการเนื้อหา)
 *       ตรวจว่าโฟลเดอร์ตั้งต้นยังอยู่ (หาไม่เจอ = found false → หน้าต่างให้เลือกใหม่) + ตรวจลิงก์ที่ผู้ใช้วาง — nesting.view
 *   PUT { folder_id } → ตั้งเป็นค่าเริ่มของทุกคน (ui_config nesting_drive_root) — assets.manage · audit
 * ตั้งต้นจริง = nesting_drive_root → ไม่มี = print_drive_root (โฟลเดอร์แม่งานพิมพ์ของคลังไฟล์)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { driveConfigured, driveFolderAccess, driveGetFolder, driveServiceEmail, parseDriveFolderId } from "@/lib/google-drive";
import { printDriveRoot, sendRootDefault } from "../publish-shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

/** id ตรง ๆ หรือลิงก์ …/folders/<id> → id (ไม่ใช่ = null) */
function folderIdOf(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const fromLink = parseDriveFolderId(s);
  if (fromLink) return fromLink;
  return /^[a-zA-Z0-9_-]{10,100}$/.test(s) ? s : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "nesting.view"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ data: { configured: false, default: null, folder: null, can_set_default: false }, error: null });
  const admin = supabaseAdmin();
  try {
    const def = await sendRootDefault(admin);
    const d = def.folder_id ? await driveFolderAccess(def.folder_id) : null;
    const raw = request.nextUrl.searchParams.get("folder");
    let folder: { id: string; name: string; url: string; can_write: boolean } | null = null;
    if (raw) {
      const id = folderIdOf(raw);
      const f = id ? await driveFolderAccess(id) : null;
      if (f) folder = { id: f.id, name: f.name, url: f.webViewLink, can_write: f.canAddChildren };
    }
    return NextResponse.json({ data: {
      configured: true,
      default: { id: def.folder_id, name: d?.name ?? "", url: d?.webViewLink ?? "", found: !!d, can_write: !!d?.canAddChildren, local_path: def.local_base_path },
      folder, can_set_default: await apiCan(request, "assets.manage"), service_email: driveServiceEmail(),
    }, error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e instanceof Error ? e.message : "Google Drive error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.manage"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = folderIdOf(b.folder_id);
  const f = id ? await driveGetFolder(id) : null;
  if (!f) return NextResponse.json({ error: "หาโฟลเดอร์นี้ไม่เจอ หรือยังไม่ได้แชร์ให้ระบบ" }, { status: 400 });
  const admin = supabaseAdmin();
  const print = await printDriveRoot(admin);
  // โฟลเดอร์เดียวกับแม่งานพิมพ์ = รู้ path ในเครื่อง · โฟลเดอร์อื่น = ไม่รู้ (การ์ดไม่มี path ในเครื่อง)
  const value = { folder_id: f.id, local_base_path: f.id === print.folder_id ? print.local_base_path : "" };
  const before = await sendRootDefault(admin);
  const { error } = await admin.from("ui_config").upsert({ key: "nesting_drive_root", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAuditFor(request, admin, { action: "update", entityType: "ui_config", entityId: "nesting_drive_root",
    metadata: { field: "nesting_drive_root", old_value: before.folder_id, new_value: f.id, name: f.name } });
  return NextResponse.json({ data: { id: f.id, name: f.name, url: f.webViewLink }, error: null });
}
