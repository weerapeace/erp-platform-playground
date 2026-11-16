/**
 * 📁 ไฟล์แนบสินค้าใน Google Drive (Parent SKU / SKU ลูก) — lib/product-drive-server
 *
 * GET  /api/product-drive/[entity]/[id]  → { configured, folder_url | null, brand_id, files: DriveEntry[] }   (ดูอย่างเดียว ไม่สร้างโฟลเดอร์)
 * POST /api/product-drive/[entity]/[id]  body { name, mime, size } → { upload_url, folder_url }
 *      หา/สร้างโฟลเดอร์สินค้า + เปิด resumable session · ตัวไฟล์ส่งทีละชิ้นผ่าน /api/drive/upload-chunk (lib/drive-chunk-upload)
 * entity = parent_skus_v2 | skus_v2 · สิทธิ์: ดู products.view · อัป products.edit · ประวัติ product.drive_upload ทุกไฟล์
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { driveConfigured, driveCreateResumableSession, driveListEntries } from "@/lib/google-drive";
import { safeDriveName } from "@/lib/content-drive";
import { ensureProductFolder, findProductFolder, isProductDriveEntity, loadProductDriveRow } from "@/lib/product-drive-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB ต่อไฟล์

type Params = { params: Promise<{ entity: string; id: string }> };

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { entity, id } = await params;
  if (!isProductDriveEntity(entity)) return NextResponse.json({ error: "ไม่รองรับชนิดรายการนี้" }, { status: 400 });
  const admin = supabaseAdmin();
  const row = await loadProductDriveRow(admin, entity, id);
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  if (!driveConfigured()) return NextResponse.json({ data: { configured: false, folder_url: null, brand_id: row.brand_id, files: [] }, error: null });
  try {
    const f = await findProductFolder(admin, row);
    const files = f ? (await driveListEntries(f.id)).filter((e) => !e.isFolder) : [];
    return NextResponse.json({ data: { configured: true, folder_url: f?.url ?? null, brand_id: row.brand_id, files }, error: null });
  } catch (e) {
    return NextResponse.json({ data: { configured: true, folder_url: null, brand_id: row.brand_id, files: [] }, error: `อ่าน Google Drive ไม่ได้: ${(e as Error).message}` });
  }
}

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { entity, id } = await params;
  if (!isProductDriveEntity(entity)) return NextResponse.json({ error: "ไม่รองรับชนิดรายการนี้" }, { status: 400 });
  let body: { name?: unknown; mime?: unknown; size?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = safeDriveName(String(body.name ?? "")) || "file";
  const mime = typeof body.mime === "string" && body.mime ? body.mime : "application/octet-stream";
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "ไฟล์ว่าง" }, { status: 400 });
  if (size > MAX_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 5GB" }, { status: 400 });

  const admin = supabaseAdmin();
  const row = await loadProductDriveRow(admin, entity, id);
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const folder = await ensureProductFolder(admin, row);
    const upload_url = await driveCreateResumableSession(name, mime, folder.id);
    await writeAudit(admin, {
      action: "product.drive_upload", entityType: entity, entityId: row.id, actorId: actor.id, actorName: actor.name,
      metadata: { code: row.code, file: name, size, folder_url: folder.url },
    });
    return NextResponse.json({ data: { upload_url, folder_url: folder.url }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เชื่อม Google Drive ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
