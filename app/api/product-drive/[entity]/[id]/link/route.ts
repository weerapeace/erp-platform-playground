/**
 * POST /api/product-drive/[entity]/[id]/link  body { file_ids: string[], brand_id: string | null }
 *   แนบไฟล์จาก "โฟลเดอร์กลาง" ของแบรนด์ = สร้างทางลัด (shortcut) ในโฟลเดอร์สินค้า — ไฟล์จริงอยู่ที่เดิมที่เดียว
 *   ตรวจว่าไฟล์อยู่ใต้โฟลเดอร์กลางของ brand_id จริง · ไฟล์ที่มีทางลัดอยู่แล้วข้าม
 *   → { linked, skipped, failed: string[], folder_url } · สิทธิ์ products.edit · ประวัติ product.drive_link
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { driveCreateShortcut, driveGetEntry, driveListEntries } from "@/lib/google-drive";
import { ensureCentralFolder, ensureProductFolder, isProductDriveEntity, loadProductDriveRow, pathUnderRoot } from "@/lib/product-drive-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Params = { params: Promise<{ entity: string; id: string }> };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { entity, id } = await params;
  if (!isProductDriveEntity(entity)) return NextResponse.json({ error: "ไม่รองรับชนิดรายการนี้" }, { status: 400 });
  let body: { file_ids?: unknown; brand_id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = Array.isArray(body.file_ids) ? [...new Set(body.file_ids.map(String).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)))].slice(0, 30) : [];
  if (!ids.length) return NextResponse.json({ error: "ยังไม่ได้เลือกไฟล์" }, { status: 400 });
  const brandId = typeof body.brand_id === "string" && /^[0-9a-f-]{36}$/i.test(body.brand_id) ? body.brand_id : null;

  const admin = supabaseAdmin();
  const row = await loadProductDriveRow(admin, entity, id);
  if (!row) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const actor = await requestActor(supabaseFromRequest(request));
  try {
    const root = await ensureCentralFolder(admin, brandId);
    const folder = await ensureProductFolder(admin, row);
    const existing = new Set((await driveListEntries(folder.id)).map((e) => e.shortcutTargetId).filter(Boolean) as string[]);
    let linked = 0, skipped = 0;
    const failed: string[] = [];
    const names: string[] = [];
    for (const fid of ids) {
      const e = await driveGetEntry(fid);
      if (!e || e.isFolder) { failed.push(fid); continue; }
      const inside = e.parents[0] ? await pathUnderRoot(e.parents[0], root.id, root.name) : null;
      if (!inside) { failed.push(e.name); continue; }   // ไม่ได้อยู่ในโฟลเดอร์กลาง
      const target = e.shortcutTargetId || e.id;          // เลือกทางลัด = ชี้ไปไฟล์จริงตัวเดียวกัน
      if (existing.has(target)) { skipped++; continue; }
      try { await driveCreateShortcut(target, e.name, folder.id); existing.add(target); linked++; names.push(e.name); }
      catch { failed.push(e.name); }
    }
    if (linked) {
      await writeAudit(admin, {
        action: "product.drive_link", entityType: entity, entityId: row.id, actorId: actor.id, actorName: actor.name,
        metadata: { code: row.code, files: names, folder_url: folder.url, central_folder: root.id },
      });
    }
    return NextResponse.json({ data: { linked, skipped, failed, folder_url: folder.url }, error: null });
  } catch (e) {
    return NextResponse.json({ error: `เชื่อม Google Drive ไม่สำเร็จ: ${(e as Error).message}` }, { status: 502 });
  }
}
