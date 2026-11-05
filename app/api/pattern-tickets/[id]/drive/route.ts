/**
 * ไฟล์แนบของตั๋วงาน Pattern = โฟลเดอร์ Google Drive ต่อตั๋ว (ไฟล์ใหญ่ AI/PSD/PNG/PDF/DXF ได้ถึง 5GB)
 *
 * GET  /api/pattern-tickets/[id]/drive   → { folder_url | null }   (ดูอย่างเดียว ไม่สร้างโฟลเดอร์)
 * POST /api/pattern-tickets/[id]/drive   body { name, mime, size } → { upload_url, folder_url }
 *      สร้างโฟลเดอร์ให้ถ้ายังไม่มี · ตัวไฟล์ส่งต่อทีละชิ้นผ่าน /api/drive/upload-chunk (lib/drive-chunk-upload)
 *      body { ensure: true } (ไม่มีไฟล์) = แค่สร้าง/เปิดโฟลเดอร์
 * สิทธิ์: ผู้สั่ง / ช่างที่รับงาน / ผู้จัดการ (lib/pattern-tickets canWorkOn) หรือคนที่เปิดตั๋วได้ (แนบบรีฟ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { driveCreateResumableSession } from "@/lib/google-drive";
import { safeDriveName } from "@/lib/content-drive";
import { canWorkOn } from "@/lib/pattern-tickets";
import { ensureTicketFolder, loadActor, PATTERN_TABLE } from "@/lib/pattern-tickets-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB ต่อไฟล์

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const { id } = await params;
  const { data } = await supabaseAdmin().from(PATTERN_TABLE).select("drive_folder_url").eq("id", id).maybeSingle();
  return NextResponse.json({ data: { folder_url: data?.drive_folder_url ?? null }, error: null });
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "pattern.view"); if (denied) return denied;
  const { id } = await params;
  let body: { name?: unknown; mime?: unknown; size?: unknown; ensure?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const [{ data: t }, actor] = await Promise.all([
    admin.from(PATTERN_TABLE).select("id, ticket_no, title, status, requester_id, assignee_id, drive_folder_id, drive_folder_url").eq("id", id).maybeSingle(),
    loadActor(request, admin),
  ]);
  if (!t) return NextResponse.json({ error: "ไม่พบตั๋วนี้" }, { status: 404 });
  if (!canWorkOn(t, actor) && !actor.canCreate) return NextResponse.json({ error: "คุณแนบไฟล์ในตั๋วนี้ไม่ได้" }, { status: 403 });

  try {
    const folder = await ensureTicketFolder(admin, t);
    if (body.ensure) return NextResponse.json({ data: { folder_url: folder.folderUrl }, error: null });

    const name = safeDriveName(String(body.name ?? "")) || "file";
    const mime = typeof body.mime === "string" && body.mime ? body.mime : "application/octet-stream";
    const size = Number(body.size);
    if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "ไฟล์ว่าง" }, { status: 400 });
    if (size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5GB" }, { status: 400 });
    const upload_url = await driveCreateResumableSession(name, mime, folder.folderId);
    await writeAudit(admin, {
      action: "pattern.attach", entityType: PATTERN_TABLE, entityId: id, actorId: actor.userId, actorName: actor.name,
      metadata: { ticket_no: t.ticket_no, file: name, size },
    });
    return NextResponse.json({ data: { upload_url, folder_url: folder.folderUrl }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เชื่อม Google Drive ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
