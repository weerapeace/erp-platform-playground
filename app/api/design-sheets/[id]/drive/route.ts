/**
 * 📁 ไฟล์งานของใบงานออกแบบ = โฟลเดอร์ Google Drive ต่อใบ (AI / PSD / PDF / ไฟล์ใหญ่ ได้ถึง 5GB)
 *
 * GET  /api/design-sheets/[id]/drive  → { folder_url | null }   (ดูอย่างเดียว ไม่สร้างโฟลเดอร์)
 * POST /api/design-sheets/[id]/drive  body { name, mime, size } → { upload_url, folder_url, link_saved }
 *      หา/สร้างโฟลเดอร์ (lib/design-sheet-drive-server) · ตัวไฟล์ส่งทีละชิ้นผ่าน /api/drive/upload-chunk (lib/drive-chunk-upload)
 *      link_saved = เพิ่งเติมลิงก์โฟลเดอร์ลงช่อง "ลิงก์ไฟล์งาน" ให้
 * สิทธิ์: ดู = products.view · อัป = products.edit (เหมือนแก้ใบงาน) · ประวัติ design_sheet.drive_upload ทุกไฟล์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { driveCreateResumableSession } from "@/lib/google-drive";
import { safeDriveName } from "@/lib/content-drive";
import { ensureDesignSheetFolder, findDesignSheetFolder, type DesignSheetDriveRow } from "@/lib/design-sheet-drive-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB ต่อไฟล์
const SHEET_COLS = "id, code, name, brand_id, drive_link";

type Params = { params: Promise<{ id: string }> };

async function loadSheet(id: string): Promise<DesignSheetDriveRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin().from("design_sheets").select(SHEET_COLS).eq("id", id).maybeSingle();
  return (data as DesignSheetDriveRow | null) ?? null;
}

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const s = await loadSheet(id);
  if (!s) return NextResponse.json({ error: "ไม่พบใบงาน" }, { status: 404 });
  try {
    const f = await findDesignSheetFolder(supabaseAdmin(), s);
    return NextResponse.json({ data: { folder_url: f?.url ?? null }, error: null });
  } catch {
    return NextResponse.json({ data: { folder_url: null }, error: null });   // อ่าน Drive ไม่ได้ = ทำเหมือนยังไม่มีโฟลเดอร์
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { name?: unknown; mime?: unknown; size?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const name = safeDriveName(String(body.name ?? "")) || "file";
  const mime = typeof body.mime === "string" && body.mime ? body.mime : "application/octet-stream";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "ไฟล์ว่าง" }, { status: 400 });
  if (size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5GB" }, { status: 400 });

  const s = await loadSheet(id);
  if (!s) return NextResponse.json({ error: "ไม่พบใบงาน" }, { status: 404 });
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const folder = await ensureDesignSheetFolder(admin, s);
    const upload_url = await driveCreateResumableSession(name, mime, folder.id);
    await writeAudit(admin, {
      action: "design_sheet.drive_upload", entityType: "design_sheet", entityId: s.id, actorId: actor.id, actorName: actor.name,
      metadata: { code: s.code, file: name, size, folder_url: folder.url, ...(folder.linkSaved ? { drive_link_set: true } : {}) },
    });
    return NextResponse.json({ data: { upload_url, folder_url: folder.url, link_saved: folder.linkSaved }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เชื่อม Google Drive ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
