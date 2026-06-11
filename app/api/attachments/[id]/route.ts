import { NextRequest, NextResponse } from "next/server";
import { r2MoveToTrash, isR2Configured } from "@/lib/r2";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

// ---- DELETE /api/attachments/[id]?actor=.. ----
// ลบ metadata + ย้ายไฟล์ใน R2 เข้า trash/ (นโยบายกลาง: สำรอง 30 วันก่อนลบจริงด้วย lifecycle rule)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");

  // ลบ metadata ก่อน — function คืน file_path
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_attachments_delete", { p_id: id, p_actor: actor });
  if (error) {
    console.error("[api/attachments/[id]] DB delete", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ย้ายไฟล์ใน R2 เข้า trash/ — กู้คืนได้ภายใน 30 วัน (ลบจริงอัตโนมัติด้วย R2 lifecycle rule)
  const filePath = (data as { file_path?: string })?.file_path;
  let deletedFromR2 = false;
  let warning: string | null = null;

  if (!filePath) {
    warning = "ไม่พบ file_path ใน DB (อาจเป็น record เก่าก่อนใช้ R2)";
  } else if (!(await isR2Configured())) {
    warning = "ลบ DB แล้วแต่ R2 ยังไม่ได้ตั้งค่า — ไฟล์อาจคงค้างบน R2";
  } else {
    try {
      const trashKey = await r2MoveToTrash(filePath);
      deletedFromR2 = true;
      console.log("[api/attachments/[id]] R2 moved to trash:", filePath, "→", trashKey);
    } catch (err) {
      console.error("[api/attachments/[id]] R2 trash move failed", filePath, err);
      warning = `ลบ DB สำเร็จแต่ย้ายไฟล์เข้าถังเก็บ R2 ไม่สำเร็จ: ${err instanceof Error ? err.message : "unknown"} (path: ${filePath})`;
    }
  }

  return NextResponse.json({ success: true, deleted_from_r2: deletedFromR2, file_path: filePath ?? null, warning, error: null });
}

// ---- PATCH /api/attachments/[id] (set primary) ----

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabaseFromRequest(request).rpc("erp_playground_attachments_set_primary", { p_id: id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, error: null });
}
