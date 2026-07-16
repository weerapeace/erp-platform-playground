/**
 * POST /api/assets/drive-folders/link — ผูกไฟล์เข้า "โฟลเดอร์ Drive เดียวกับรูปอื่น" (ไม่สร้างโฟลเดอร์ใหม่)
 *   body { id?: string | ids?: string[], source_id: string, follow_path?: boolean }
 *   - อ่านโฟลเดอร์จาก master_url ของรูปต้นทาง (source_id) → ต้องมี /folders/<id>
 *   - ก็อปรูป preview ของแต่ละไฟล์ (จาก R2) เข้าโฟลเดอร์เดียวกัน (best-effort) + เก็บ master_url เดียวกัน
 *   - follow_path=true (ดีฟอลต์) → เซ็ต master_path = ของรูปต้นทางด้วย (path ในเครื่องตามโฟลเดอร์)
 *   → { folderLink, count }
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { driveConfigured, parseDriveFolderId } from "@/lib/google-drive";
import { copyAssetPreviewToDrive } from "@/lib/artwork-drive";
import { actorId } from "../../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Row = { id: string; title: string | null; file_name: string; r2_key: string | null; content_type: string | null; master_url: string | null; master_path: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { id?: string; ids?: string[]; source_id?: string; follow_path?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const sourceId = String(body.source_id ?? "").trim();
  const followPath = body.follow_path !== false;   // default true — path ตามโฟลเดอร์
  const rawIds = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
  const ids = [...new Set(rawIds.map((x) => String(x).trim()).filter(Boolean))].filter((x) => x !== sourceId).slice(0, 50);
  if (!sourceId || !ids.length) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data } = await admin.from("assets")
    .select("id, title, file_name, r2_key, content_type, master_url, master_path").in("id", [...ids, sourceId]);
  const rows = (data ?? []) as Row[];
  const src = rows.find((r) => r.id === sourceId);
  if (!src) return NextResponse.json({ error: "ไม่พบรูปต้นทาง" }, { status: 404 });

  const folderId = parseDriveFolderId(src.master_url ?? "");
  if (!folderId) return NextResponse.json({ error: "รูปต้นทางยังไม่มีโฟลเดอร์ Drive — เลือกรูปที่มีโฟลเดอร์แล้ว" }, { status: 400 });
  const folderLink = src.master_url as string;

  let count = 0;
  for (const me of rows.filter((r) => r.id !== sourceId)) {
    // ก็อปรูป preview ของไฟล์นี้เข้าโฟลเดอร์เดียวกัน (พังไม่ทำให้ทั้งงานพัง)
    const name = (me.title || me.file_name || "artwork").trim();
    if (me.r2_key) { try { await copyAssetPreviewToDrive(folderId, { r2_key: me.r2_key, name, content_type: me.content_type }); } catch { /* preview พังไม่เป็นไร */ } }
    const patch: Record<string, unknown> = { master_url: folderLink };
    if (followPath && src.master_path) patch.master_path = src.master_path;   // path ในเครื่องตามโฟลเดอร์ต้นทาง
    await admin.from("assets").update(patch).eq("id", me.id);
    count++;
  }

  await writeAudit(admin, { action: "update", entityType: "asset", entityId: ids[0], actorId: await actorId(request), metadata: { drive_folder_link: { source_id: sourceId, folderId, count, followPath } } });
  return NextResponse.json({ folderLink, count, error: null });
}
