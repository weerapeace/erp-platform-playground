/**
 * POST /api/assets/drive-folders/link — ผูกไฟล์นี้เข้า "โฟลเดอร์ Drive เดียวกับรูปอื่น" (ไม่สร้างโฟลเดอร์ใหม่)
 *   body { id: string, source_id: string }
 *   - อ่านโฟลเดอร์จาก master_url ของรูปต้นทาง (source_id) → ต้องมี /folders/<id>
 *   - ก็อปรูป preview ของไฟล์นี้ (จาก R2) เข้าโฟลเดอร์เดียวกัน (best-effort) + เก็บ master_url เดียวกัน
 *   → { folderLink }
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

type Row = { id: string; title: string | null; file_name: string; r2_key: string | null; content_type: string | null; master_url: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  if (!driveConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Google Drive" }, { status: 503 });

  let body: { id?: string; source_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.id ?? "").trim();
  const sourceId = String(body.source_id ?? "").trim();
  if (!id || !sourceId) return NextResponse.json({ error: "ไม่มีรายการ" }, { status: 400 });
  if (id === sourceId) return NextResponse.json({ error: "เลือกรูปอื่นที่ไม่ใช่รูปนี้" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data } = await admin.from("assets")
    .select("id, title, file_name, r2_key, content_type, master_url").in("id", [id, sourceId]);
  const rows = (data ?? []) as Row[];
  const me = rows.find((r) => r.id === id);
  const src = rows.find((r) => r.id === sourceId);
  if (!me) return NextResponse.json({ error: "ไม่พบไฟล์นี้" }, { status: 404 });
  if (!src) return NextResponse.json({ error: "ไม่พบรูปต้นทาง" }, { status: 404 });

  const folderId = parseDriveFolderId(src.master_url ?? "");
  if (!folderId) return NextResponse.json({ error: "รูปต้นทางยังไม่มีโฟลเดอร์ Drive — เลือกรูปที่มีโฟลเดอร์แล้ว" }, { status: 400 });

  // ก็อปรูป preview ของไฟล์นี้เข้าโฟลเดอร์เดียวกัน (พังไม่ทำให้ทั้งงานพัง)
  const name = (me.title || me.file_name || "artwork").trim();
  if (me.r2_key) { try { await copyAssetPreviewToDrive(folderId, { r2_key: me.r2_key, name, content_type: me.content_type }); } catch { /* preview พังไม่เป็นไร */ } }

  const folderLink = src.master_url as string;
  await admin.from("assets").update({ master_url: folderLink }).eq("id", id);
  await writeAudit(admin, { action: "update", entityType: "asset", entityId: id, actorId: await actorId(request), metadata: { drive_folder_link: { source_id: sourceId, folderId } } });
  return NextResponse.json({ folderLink, error: null });
}
