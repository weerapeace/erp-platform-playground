import { NextRequest, NextResponse } from "next/server";
import { r2MoveToTrash, isR2Configured } from "@/lib/r2";
import { r2KeyStillReferenced } from "@/lib/r2-refs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { captureImageVersion, editContextFromRequest, VERSIONED_TABLES } from "@/lib/record-versions";

// ---- DELETE /api/attachments/[id]?actor=.. ----
// ลบ metadata + ย้ายไฟล์ใน R2 เข้า trash/ (นโยบายกลาง: สำรอง 30 วันก่อนลบจริงด้วย lifecycle rule)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");
  const admin = supabaseAdmin();

  // อ่านแถวไว้ก่อนลบ — ถ้าเป็นรูปในแกลเลอรีสินค้า (Parent/SKU) จะเก็บเป็นเวอร์ชันเก่า (🕘 lib/record-versions)
  const { data: row } = await admin.from("erp_playground_attachments")
    .select("entity_type, entity_id, file_name, content_type, sort_order, is_primary").eq("id", id).maybeSingle();

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

  // 🕘 รูปแกลเลอรีสินค้า → จดเป็นเวอร์ชันก่อนเช็กถัง → ไฟล์ถูกเก็บไว้ (ย้อนกลับได้) ไม่ย้ายเข้าถัง
  let keptAsVersion = false;
  if (filePath && row?.entity_type && row.entity_id && VERSIONED_TABLES.includes(row.entity_type as string)
      && String(row.content_type ?? "image/").startsWith("image/")) {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    keptAsVersion = await captureImageVersion(admin, {
      table: row.entity_type as string, id: row.entity_id as string, fieldKey: "gallery", r2Key: filePath,
      source: "gallery_delete", actorId: user?.id ?? null, actorName: actor || user?.email || null, ...editContextFromRequest(request),
      meta: { attachment_id: id, file_name: row.file_name ?? null, sort_order: row.sort_order ?? null, is_primary: !!row.is_primary },
    });
  }

  if (keptAsVersion) {
    // เก็บไฟล์ไว้เป็นเวอร์ชันเก่า — ไม่ต้องเตือน (ไม่ใช่ "ไฟล์ถูกใช้ที่อื่น")
  } else if (!filePath) {
    warning = "ไม่พบ file_path ใน DB (อาจเป็น record เก่าก่อนใช้ R2)";
  } else if (!(await isR2Configured())) {
    warning = "ลบ DB แล้วแต่ R2 ยังไม่ได้ตั้งค่า — ไฟล์อาจคงค้างบน R2";
  } else {
    try {
      // ไฟล์เดียวกันอาจถูกใช้เป็นรูปปกสินค้า/อยู่ในคลังไฟล์ด้วย — ถ้ายังมีคนใช้ ห้ามย้ายเข้าถัง (ไม่งั้นที่นั่นรูปแตก)
      if (await r2KeyStillReferenced(admin, filePath)) {
        warning = "ลบรายการแนบแล้ว — ไฟล์ยังถูกใช้ที่อื่น (เช่นรูปปกสินค้า/คลังไฟล์) จึงไม่ย้ายเข้าถังขยะ";
      } else {
        const trashKey = await r2MoveToTrash(filePath);
        deletedFromR2 = true;
        console.log("[api/attachments/[id]] R2 moved to trash:", filePath, "→", trashKey);
      }
    } catch (err) {
      console.error("[api/attachments/[id]] R2 trash move failed", filePath, err);
      warning = `ลบ DB สำเร็จแต่ย้ายไฟล์เข้าถังเก็บ R2 ไม่สำเร็จ: ${err instanceof Error ? err.message : "unknown"} (path: ${filePath})`;
    }
  }

  return NextResponse.json({ success: true, deleted_from_r2: deletedFromR2, kept_as_version: keptAsVersion, file_path: filePath ?? null, warning, error: null });
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
