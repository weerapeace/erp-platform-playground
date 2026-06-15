/**
 * Canvas Sketch API (ของกลาง) — กระดานวาด Excalidraw ผูกกับเอกสารใดก็ได้
 *
 * GET /api/canvas-sketch?entity_type=design_sheet&entity_id=<id> → { scene, preview_url }
 * PUT /api/canvas-sketch { entity_type, entity_id, scene, preview_png_base64? }
 *     → upsert กระดาน + อัปโหลดภาพถ่าย PNG ลง R2 (key ตายตัวต่อเอกสาร — ทับของเก่า ไม่มีไฟล์ขยะ)
 *
 * สิทธิ์: อ่าน products.view / เขียน products.edit (โมดูลอื่นมาใช้แล้วต้องการสิทธิ์ละเอียดกว่านี้ ค่อยเพิ่ม param)
 * audit → audit_logs action=canvas_update
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { r2PutObject, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// สิทธิ์ของกระดานขึ้นกับชนิดเอกสาร (server เลือกเอง — client ระบุไม่ได้ กันสวมสิทธิ์ข้ามโมดูล)
const PERM: Record<string, { view: string; edit: string }> = {
  design_sheet:   { view: "products.view", edit: "products.edit" },
  creative_board: { view: "tasks.view",    edit: "tasks.edit" },
};
const permFor = (entityType: string) => PERM[entityType] ?? { view: "products.view", edit: "products.edit" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const entityType = (searchParams.get("entity_type") ?? "").trim();
  const entityId   = (searchParams.get("entity_id") ?? "").trim();
  if (!entityType || !entityId) return NextResponse.json({ data: null, error: "ต้องส่ง entity_type และ entity_id" }, { status: 400 });
  const denied = await guardApi(request, permFor(entityType).view); if (denied) return denied;

  const { data } = await supabaseAdmin().from("erp_canvas_sketches")
    .select("scene, preview_r2_key, updated_at")
    .eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  return NextResponse.json({
    data: data ? {
      scene: data.scene ?? null,
      preview_url: data.preview_r2_key ? `/api/r2-image?key=${encodeURIComponent(data.preview_r2_key)}` : null,
      updated_at: data.updated_at,
    } : null,
    error: null,
  });
}

type PutBody = {
  entity_type?: string; entity_id?: string;
  scene?: Record<string, unknown> | null;
  preview_png_base64?: string | null;
};

export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: PutBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const entityType = (body.entity_type ?? "").trim();
  const entityId   = (body.entity_id ?? "").trim();
  if (!entityType || !entityId) return NextResponse.json({ error: "ต้องส่ง entity_type และ entity_id" }, { status: 400 });
  const denied = await guardApi(request, permFor(entityType).edit); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  // กันกระดานบวมเกิน (รูปฝังใน scene เป็น base64) — 8MB พอสำหรับงานวาดปกติ
  const sceneSize = body.scene ? JSON.stringify(body.scene).length : 0;
  if (sceneSize > 8_000_000) {
    return NextResponse.json({ error: "กระดานใหญ่เกิน 8MB — ลองลดขนาด/จำนวนรูปที่วางลงกระดาน" }, { status: 400 });
  }

  // ภาพถ่ายกระดาน → R2 key ตายตัวต่อเอกสาร (ทับของเก่าอัตโนมัติ — เปลี่ยนภาพไม่ทิ้งไฟล์ขยะ)
  let previewKey: string | null = null;
  if (body.preview_png_base64 && (await isR2Configured())) {
    try {
      previewKey = `canvas-sketch/${entityType}/${entityId}.png`;
      await r2PutObject(previewKey, Buffer.from(body.preview_png_base64, "base64"), "image/png");
    } catch (e) {
      console.error("[canvas-sketch] preview upload failed:", e);
      previewKey = null;   // บันทึก scene ต่อได้ แค่ไม่มีภาพถ่าย
    }
  }

  const admin = supabaseAdmin();
  const row: Record<string, unknown> = {
    entity_type: entityType, entity_id: entityId,
    scene: body.scene ?? null, updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
  };
  if (previewKey) row.preview_r2_key = previewKey;
  const { error } = await admin.from("erp_canvas_sketches").upsert(row, { onConflict: "entity_type,entity_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "canvas_update", entityType, entityId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { size: sceneSize, has_preview: !!previewKey },
  });
  return NextResponse.json({ ok: true, preview_key: previewKey, error: null });
}
