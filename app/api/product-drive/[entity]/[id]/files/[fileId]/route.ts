/**
 * DELETE /api/product-drive/[entity]/[id]/files/[fileId] — เอาไฟล์ออกจากกล่องไฟล์แนบสินค้า
 *   ทางลัด = ลบแค่ทางลัด (ไฟล์กลางไม่โดนแตะ) · ไฟล์ที่อัปเอง = ย้ายลงถังขยะ Drive (กู้คืนได้) · ไม่ลบถาวร
 *   ตรวจว่าไฟล์อยู่ในโฟลเดอร์ของสินค้านี้จริงก่อนทำ · สิทธิ์ products.edit · ประวัติ product.drive_remove
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { DRIVE_SHORTCUT_MIME, driveGetEntry, driveTrashFile } from "@/lib/google-drive";
import { findProductFolder, isProductDriveEntity, loadProductDriveRow } from "@/lib/product-drive-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ entity: string; id: string; fileId: string }> };

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { entity, id, fileId } = await params;
  if (!isProductDriveEntity(entity)) return NextResponse.json({ error: "ไม่รองรับชนิดรายการนี้" }, { status: 400 });
  const admin = supabaseAdmin();
  const row = await loadProductDriveRow(admin, entity, id);
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  try {
    const folder = await findProductFolder(admin, row);
    const e = await driveGetEntry(fileId);
    if (!folder || !e || e.isFolder || !e.parents.includes(folder.id)) return NextResponse.json({ error: "ไม่พบไฟล์นี้ในโฟลเดอร์ของสินค้า" }, { status: 404 });
    const isShortcut = e.mimeType === DRIVE_SHORTCUT_MIME;
    if (!(await driveTrashFile(e.id))) return NextResponse.json({ error: "Google Drive ไม่ยอมให้ลบ (สิทธิ์โฟลเดอร์?)" }, { status: 502 });
    const actor = await requestActor(supabaseFromRequest(request));
    await writeAudit(admin, {
      action: "product.drive_remove", entityType: entity, entityId: row.id, actorId: actor.id, actorName: actor.name,
      metadata: { code: row.code, file: e.name, kind: isShortcut ? "shortcut" : "file", drive_file_id: e.id },
    });
    return NextResponse.json({ data: { removed: true, kind: isShortcut ? "shortcut" : "file" }, error: null });
  } catch (err) {
    return NextResponse.json({ error: `เชื่อม Google Drive ไม่สำเร็จ: ${(err as Error).message}` }, { status: 502 });
  }
}
