/**
 * POST /api/attachments/from-library — แนบ "ไฟล์ที่มีอยู่แล้วในคลังกลาง" เข้ากับ record
 *   body: { entity_type, entity_id, asset_ids: string[], actor? }
 *   → ไม่อัปโหลดซ้ำ: ดึง r2_key/ชื่อ/ชนิด/ขนาด จากตาราง assets แล้วสร้าง attachment ชี้ไฟล์เดิม
 *   + บันทึก asset_usages (กันลบไฟล์ในคลังที่ยังถูกใช้)
 *
 * ใช้โดย ImageManager (ของกลาง) เมื่อผู้ใช้กด "เลือกจากคลัง"
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "assets.view");
  if (denied) return denied;

  let b: { entity_type?: string; entity_id?: string; asset_ids?: string[]; actor?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const entityType = String(b.entity_type ?? "").trim();
  const entityId = String(b.entity_id ?? "").trim();
  const ids = Array.isArray(b.asset_ids) ? [...new Set(b.asset_ids.filter(Boolean))] : [];
  const actor = b.actor ? String(b.actor) : null;
  if (!entityType || !entityId || ids.length === 0)
    return NextResponse.json({ error: "ต้องมี entity_type, entity_id, asset_ids" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: assets, error } = await admin.from("assets")
    .select("id, r2_key, file_name, content_type, size_bytes").in("id", ids).eq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const db = supabaseFromRequest(request);
  let attached = 0;
  for (const a of (assets ?? []) as { id: string; r2_key: string; file_name: string; content_type: string | null; size_bytes: number | null }[]) {
    const publicUrl = `/api/r2-image?key=${encodeURIComponent(a.r2_key)}`;
    const { error: addErr } = await db.rpc("erp_playground_attachments_add", {
      p_entity_type: entityType, p_entity_id: entityId,
      p_file_name: a.file_name, p_file_path: a.r2_key, p_public_url: publicUrl,
      p_content_type: a.content_type, p_size_bytes: a.size_bytes, p_uploaded_by: actor,
    });
    if (addErr) return NextResponse.json({ error: addErr.message, attached }, { status: 500 });
    attached++;
  }

  // บันทึก usage (field='attachment') — กันลบไฟล์ในคลังที่ยังถูกใช้
  if (assets && assets.length) {
    await admin.from("asset_usages").upsert(
      assets.map((a) => ({ asset_id: (a as { id: string }).id, module: entityType, record_id: entityId, record_label: null, field: "attachment" })),
      { onConflict: "asset_id,module,record_id,field", ignoreDuplicates: true },
    );
  }

  return NextResponse.json({ ok: true, attached, error: null });
}
